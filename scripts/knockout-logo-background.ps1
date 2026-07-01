param(
  [string]$InputPath = "public/images/logo.png",
  [string]$OutputPath = "public/images/logo.png",
  [int]$HardCutoff = 22,
  [int]$SoftCutoff = 48
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent

$inFile = Join-Path $root $InputPath
$outFile = Join-Path $root $OutputPath

if (-not (Test-Path $inFile)) {
  throw "Input not found: $inFile"
}

$src = [System.Drawing.Bitmap]::FromFile($inFile)
$dst = New-Object System.Drawing.Bitmap $src.Width, $src.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

for ($y = 0; $y -lt $src.Height; $y++) {
  for ($x = 0; $x -lt $src.Width; $x++) {
    $c = $src.GetPixel($x, $y)
    $max = [Math]::Max($c.R, [Math]::Max($c.G, $c.B))
    $lum = ($c.R + $c.G + $c.B) / 3.0

    if ($max -le $HardCutoff) {
      $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
      continue
    }

    if ($max -le $SoftCutoff -and $lum -le ($SoftCutoff * 0.9)) {
      $t = [Math]::Max(0.0, [Math]::Min(1.0, ($max - $HardCutoff) / [double]($SoftCutoff - $HardCutoff)))
      $alpha = [int]([Math]::Round(255 * $t))
      $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $c.R, $c.G, $c.B))
      continue
    }

    $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $c.R, $c.G, $c.B))
  }
}

$tempFile = "$outFile.tmp.png"
$dst.Save($tempFile, [System.Drawing.Imaging.ImageFormat]::Png)
$src.Dispose()
$dst.Dispose()
Move-Item -LiteralPath $tempFile -Destination $outFile -Force

$check = [System.Drawing.Bitmap]::FromFile($outFile)
Write-Output "Wrote $outFile ($($check.Width)x$($check.Height) $($check.PixelFormat))"
$check.Dispose()
