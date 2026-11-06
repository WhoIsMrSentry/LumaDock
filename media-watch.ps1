# Media session watcher for LumaDock
# Monitors Windows GlobalSystemMediaTransportControls (Spotify, browsers, media players)
param([int]$Parent = 0)

$ErrorActionPreference = 'SilentlyContinue'

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function AwaitOp($winRtOp, $resultType) {
    if (-not $winRtOp) { return $null }
    try {
        $asTask = $asTaskGeneric.MakeGenericMethod($resultType)
        $netTask = $asTask.Invoke($null, @($winRtOp))
        if ($netTask.Wait(1200)) {
            return $netTask.Result
        }
    } catch {}
    return $null
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime] | Out-Null
$mgr = AwaitOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

if (-not $mgr) {
    Write-Output '{"active":false,"error":"No media session manager"}'
    exit 0
}

$lastJson = ''
$tick = 0

function GetActiveSession() {
    $current = $mgr.GetCurrentSession()
    if ($current) {
        $info = $current.GetPlaybackInfo()
        if ($info -and $info.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing) {
            return $current
        }
    }

    $sessions = $mgr.GetSessions()
    if (-not $sessions -or $sessions.Count -eq 0) {
        return $current
    }

    # Find playing session
    foreach ($s in $sessions) {
        $info = $s.GetPlaybackInfo()
        if ($info -and $info.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing) {
            return $s
        }
    }

    if ($current) { return $current }
    return $sessions[0]
}

function ReadSessionInfo() {
    $session = GetActiveSession
    if (-not $session) {
        return '{"active":false}'
    }

    $props = AwaitOp ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $info = $session.GetPlaybackInfo()
    $tl = $session.GetTimelineProperties()

    $title = if ($props -and $props.Title) { $props.Title } else { '' }
    $artist = if ($props -and $props.Artist) { $props.Artist } else { '' }
    $album = if ($props -and $props.AlbumTitle) { $props.AlbumTitle } else { '' }
    $status = if ($info) { $info.PlaybackStatus.ToString() } else { 'Closed' }
    $isPlaying = ($status -eq 'Playing')
    $pos = if ($tl -and $tl.Position) { [long]$tl.Position.TotalMilliseconds } else { 0 }
    $dur = if ($tl -and $tl.EndTime) { [long]$tl.EndTime.TotalMilliseconds } else { 0 }
    $source = if ($session.SourceAppId) { $session.SourceAppId } else { 'Spotify' }

    if (-not $title -and -not $artist) {
        return '{"active":false}'
    }

    $obj = @{
        active = $true
        is_playing = $isPlaying
        title = $title
        artist = $artist
        album = $album
        position = $pos
        duration = $dur
        source = $source
    }
    return ($obj | ConvertTo-Json -Compress)
}

# Run loop
while ($true) {
    if ($Parent -and (++$tick % 15 -eq 0) -and -not (Get-Process -Id $Parent -ErrorAction SilentlyContinue)) {
        exit 0
    }

    try {
        $now = ReadSessionInfo
    } catch {
        $now = $lastJson
    }
    if ($now -ne $lastJson) {
        [Console]::Out.WriteLine($now)
        [Console]::Out.Flush()
        $lastJson = $now
    }
    Start-Sleep -Milliseconds 450
}
