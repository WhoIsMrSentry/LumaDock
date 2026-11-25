# Media session watcher for LumaDock
# Monitors Windows GlobalSystemMediaTransportControls (Spotify, browsers, media players)
# Communicates with LumaDock via stdout (JSON) and %TEMP%\lumadock-media-cmd.txt
param([int]$Parent = 0)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function AwaitOp($winRtOp, $resultType, $timeoutMs = 2000) {
    if (-not $winRtOp) { return $null }
    try {
        $asTask = $asTaskGeneric.MakeGenericMethod($resultType)
        $netTask = $asTask.Invoke($null, @($winRtOp))
        if ($netTask.Wait($timeoutMs)) {
            return $netTask.Result
        }
    } catch {}
    return $null
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

$mgr = $null
function EnsureManager() {
    if ($script:mgr) { return $script:mgr }
    try {
        $script:mgr = AwaitOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]) 2500
    } catch {}
    return $script:mgr
}

$lastJson = ''
$lastEmittedTime = 0
$lastEmittedPos = 0
$tick = 0
$cmdFile = "$env:TEMP\lumadock-media-cmd.txt"
$cachedProps = $null
$cachedPropsTime = 0
$lastSessionSource = ''
$cachedThumbKey = ''
$cachedThumbData = ''

function FormatSourceLabel([string]$srcId) {
    $s = if ($srcId) { $srcId.ToLowerInvariant() } else { '' }
    if (-not $s -or $s.Contains('spotify')) { return 'Spotify' }
    if ($s.Contains('chrome')) { return 'Chrome' }
    if ($s.Contains('msedge') -or $s.Contains('edge')) { return 'Edge' }
    if ($s.Contains('firefox')) { return 'Firefox' }
    if ($s.Contains('brave')) { return 'Brave' }
    if ($s.Contains('opera')) { return 'Opera' }
    if ($s.Contains('vlc')) { return 'VLC' }
    return ($srcId -replace '\.exe$','').Split('!')[-1]
}

function TryReadThumb($props, [string]$cacheKey) {
    if ($cacheKey -eq $script:cachedThumbKey) { return $script:cachedThumbData }
    $script:cachedThumbKey = $cacheKey
    $script:cachedThumbData = ''
    try {
        if (-not $props -or -not $props.Thumbnail) { return '' }
        $stream = AwaitOp ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType]) 900
        if (-not $stream -or $stream.Size -le 0 -or $stream.Size -gt 262144) { return '' }
        $size = [uint32]$stream.Size
        $reader = [Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
        $null = AwaitOp ($reader.LoadAsync($size)) ([uint32]) 900
        $bytes = [byte[]]::new($size)
        $reader.ReadBytes($bytes)
        $reader.Dispose()
        $stream.Dispose()
        if ($bytes.Length -gt 0 -and $bytes.Length -le 180000) {
            $mime = if ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50) { 'image/png' } else { 'image/jpeg' }
            $script:cachedThumbData = "data:$mime;base64," + [Convert]::ToBase64String($bytes)
        }
    } catch { $script:cachedThumbData = '' }
    return $script:cachedThumbData
}

function InvalidatePropsCache() {
    $script:cachedPropsTime = 0
}

function GetActiveSession() {
    $m = EnsureManager
    if (-not $m) { return $null }

    try {
        $current = $m.GetCurrentSession()
        if ($current) {
            $info = $current.GetPlaybackInfo()
            if ($info -and $info.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing) {
                return $current
            }
        }
    } catch {}

    try {
        $sessions = $m.GetSessions()
        if ($sessions -and $sessions.Count -gt 0) {
            # 1. Prefer actively playing session
            for ($i = 0; $i -lt $sessions.Count; $i++) {
                $s = $sessions[$i]
                $info = $s.GetPlaybackInfo()
                if ($info -and $info.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing) {
                    return $s
                }
            }
            # 2. If current session exists (even paused), use it
            if ($current) { return $current }
            # 3. Otherwise return the first available session (e.g. paused Spotify)
            return $sessions[0]
        }
    } catch {}

    return $current
}

function ReadSessionInfo() {
    $session = GetActiveSession
    if (-not $session) {
        return '{"active":false}'
    }

    $nowMs = [System.Environment]::TickCount
    if (-not $script:cachedProps -or ($nowMs - $script:cachedPropsTime) -gt 1500 -or $session.SourceAppId -ne $script:lastSessionSource) {
        $newProps = AwaitOp ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]) 1000
        if ($newProps -and ($newProps.Title -or $newProps.Artist)) {
            $script:cachedProps = $newProps
            $script:cachedPropsTime = $nowMs
            $script:lastSessionSource = $session.SourceAppId
        }
    }
    $props = $script:cachedProps

    $info = $session.GetPlaybackInfo()
    $tl = $session.GetTimelineProperties()

    $title = if ($props -and $props.Title) { $props.Title } else { '' }
    $artist = if ($props -and $props.Artist) { $props.Artist } else { '' }
    $album = if ($props -and $props.AlbumTitle) { $props.AlbumTitle } else { '' }
    $status = if ($info) { $info.PlaybackStatus.ToString() } else { 'Closed' }
    $isPlaying = ($status -eq 'Playing')
    $pos = 0
    if ($tl -and $tl.Position) {
        $rawPos = [long]$tl.Position.TotalMilliseconds
        if ($isPlaying -and $tl.LastUpdatedTime) {
            $elapsedMs = ([DateTimeOffset]::UtcNow - $tl.LastUpdatedTime).TotalMilliseconds
            if ($elapsedMs -gt 0 -and $elapsedMs -lt 600000) {
                $rawPos = [long]($rawPos + $elapsedMs)
            }
        }
        $pos = $rawPos
    }
    $dur = if ($tl -and $tl.EndTime) { [long]$tl.EndTime.TotalMilliseconds } else { 0 }
    $source = if ($session.SourceAppId) { $session.SourceAppId } else { 'Spotify' }
    $appLabel = FormatSourceLabel $source

    if (-not $title -and -not $artist) {
        return '{"active":false}'
    }

    $thumb = if ($appLabel -ne 'Spotify') { TryReadThumb $props "$title|$artist|$source" } else { '' }

    $obj = @{
        active = $true
        is_playing = $isPlaying
        title = $title
        artist = $artist
        album = $album
        position = $pos
        duration = $dur
        source = $source
        appLabel = $appLabel
        thumb = $thumb
    }
    return ($obj | ConvertTo-Json -Compress)
}

function HandleControlCommand([string]$cmd) {
    if (-not $cmd) { return }
    $session = GetActiveSession
    if (-not $session) { return }
    $cmd = $cmd.Trim().ToLower()
    try {
        if ($cmd -eq 'play') { [void]$session.TryPlayAsync() }
        elseif ($cmd -eq 'pause') { [void]$session.TryPauseAsync() }
        elseif ($cmd -eq 'toggle') { [void]$session.TryTogglePlayPauseAsync(); InvalidatePropsCache }
        elseif ($cmd -eq 'next') { [void]$session.TrySkipNextAsync(); InvalidatePropsCache }
        elseif ($cmd -eq 'previous') { [void]$session.TrySkipPreviousAsync(); InvalidatePropsCache }
        elseif ($cmd.StartsWith('seek ')) {
            $msStr = $cmd.Substring(5).Trim()
            $ms = 0
            if ([long]::TryParse($msStr, [ref]$ms)) {
                $ticks = [long]($ms * 10000)
                [void]$session.TryChangePlaybackPositionAsync($ticks)
            }
        }
    } catch {}
}

# Run loop - non-blocking, clean event throttling
while ($true) {
    if ($Parent -and (++$tick % 30 -eq 0) -and -not (Get-Process -Id $Parent -ErrorAction SilentlyContinue)) {
        exit 0
    }

    # Check for incoming commands from LumaDock
    $hadCmd = $false
    if (Test-Path $cmdFile) {
        try {
            $raw = Get-Content $cmdFile -Raw -Encoding UTF8
            Remove-Item $cmdFile -Force -ErrorAction SilentlyContinue
            if ($raw) {
                foreach ($cmd in ($raw -split "[\r\n]+")) {
                    if ($cmd.Trim()) { HandleControlCommand $cmd.Trim(); $hadCmd = $true }
                }
            }
        } catch {}
    }

    if ($hadCmd) {
        Start-Sleep -Milliseconds 30
    }

    try {
        $now = ReadSessionInfo
    } catch {
        $now = $lastJson
    }

    $currentTime = [System.Environment]::TickCount
    $shouldEmit = $false

    if ($now -ne $lastJson) {
        # Check if the change is significant (metadata, play state, or duration changed)
        # We don't want to flood IPC 5x a second for routine 200ms position ticks
        try {
            $prevObj = if ($lastJson) { $lastJson | ConvertFrom-Json } else { $null }
            $currObj = if ($now) { $now | ConvertFrom-Json } else { $null }

            if (-not $prevObj -or -not $currObj) {
                $shouldEmit = $true
            } elseif ($currObj.active -ne $prevObj.active -or $currObj.is_playing -ne $prevObj.is_playing -or $currObj.title -ne $prevObj.title -or $currObj.artist -ne $prevObj.artist) {
                $shouldEmit = $true
            } elseif ([Math]::Abs([long]($currObj.position - $script:lastEmittedPos)) -gt 2500) {
                # Seek or skip occurred
                $shouldEmit = $true
            } elseif (($currentTime - $script:lastEmittedTime) -ge 900) {
                # Periodic sync tick every ~1 second for timeline accuracy
                $shouldEmit = $true
            }
        } catch {
            $shouldEmit = $true
        }
    }

    if ($shouldEmit) {
        [Console]::Out.WriteLine($now)
        [Console]::Out.Flush()
        $lastJson = $now
        $script:lastEmittedTime = $currentTime
        try {
            $objParsed = $now | ConvertFrom-Json
            $script:lastEmittedPos = if ($objParsed.position) { [long]$objParsed.position } else { 0 }
        } catch {}
    }

    Start-Sleep -Milliseconds 150
}
