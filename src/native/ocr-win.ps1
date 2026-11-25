# Fast offline Windows WinRT OCR helper (Windows 10/11 built-in Windows.Media.Ocr).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File ocr-win.ps1 -ImagePath "path.png"
param(
  [Parameter(Mandatory = $true)][string]$ImagePath,
  [string]$Lang = ''
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

try {
  if (-not (Test-Path -LiteralPath $ImagePath)) {
    Write-Output (@{ ok = $false; error = 'Image not found' } | ConvertTo-Json -Compress)
    exit 0
  }

  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType=WindowsRuntime]
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
  $null = [Windows.Globalization.Language, Windows.Foundation, ContentType=WindowsRuntime]

  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

  function Await($WinRtTask, [Type]$ResultType) {
    $netTask = $asTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($WinRtTask))
    $netTask.GetAwaiter().GetResult()
  }

  $engine = $null
  if ($Lang) {
    try {
      $lObj = [Windows.Globalization.Language]::new($Lang)
      if ([Windows.Media.Ocr.OcrEngine]::IsLanguageSupported($lObj)) {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lObj)
      }
    } catch {}
  }
  if ($null -eq $engine) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  }
  if ($null -eq $engine) {
    $firstLang = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | Select-Object -First 1
    if ($null -ne $firstLang) {
      $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($firstLang)
    }
  }
  if ($null -eq $engine) {
    Write-Output (@{ ok = $false; error = 'No Windows OCR language available' } | ConvertTo-Json -Compress)
    exit 0
  }

  $fullPath = (Resolve-Path -LiteralPath $ImagePath).Path
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($fullPath)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $lines = @()
    foreach ($ln in $result.Lines) {
      $t = [string]$ln.Text
      if ($t) { $lines += $t }
    }
    $text = ($lines -join "`n").Trim()
    Write-Output (@{ ok = $true; text = $text; lines = $lines; lang = $engine.RecognizerLanguage.LanguageTag } | ConvertTo-Json -Compress)
  } finally {
    if ($null -ne $stream) { $stream.Dispose() }
  }
} catch {
  Write-Output (@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress)
}
