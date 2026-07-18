#!/usr/bin/env pwsh
# Installs a pre-built gitz binary from GitHub Releases (native Windows).
#
# Usage:
#   irm https://raw.githubusercontent.com/ropean/git-z/main/install.ps1 | iex
#
# Pin a version (tag or "latest"):
#   $env:GITZ_VERSION = "v1.0.0"; irm https://raw.githubusercontent.com/ropean/git-z/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$Repo   = "ropean/git-z"
$Binary = "gitz"

$Version    = if ($env:GITZ_VERSION) { $env:GITZ_VERSION } else { "latest" }
$InstallDir = if ($env:INSTALL_DIR) { $env:INSTALL_DIR } else { Join-Path $HOME ".local\bin" }

function Get-Arch {
    switch ($env:PROCESSOR_ARCHITECTURE) {
        "AMD64" { return "amd64" }
        "ARM64" { return "arm64" }
        default { throw "Unsupported architecture: $env:PROCESSOR_ARCHITECTURE" }
    }
}

$Arch = Get-Arch
Write-Host "[detect_platform] OS=windows, ARCH=$Arch"

if ($Version -eq "latest") {
    Write-Host "[resolve_version] Requested VERSION=latest"
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
    $Version = $release.tag_name
}
Write-Host "[resolve_version] Resolved VERSION=$Version"

$AssetName = "$Binary-windows-$Arch.exe"
$Url       = "https://github.com/$Repo/releases/download/$Version/$AssetName"
$Dest      = Join-Path $InstallDir "$Binary.exe"
$Tmp       = New-TemporaryFile

Write-Host "[download] Asset name: $AssetName"
Write-Host "[download] Download URL: $Url"
Write-Host "[download] Install dir: $InstallDir"
Write-Host "[download] Final path: $Dest"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Write-Host "Downloading $Binary $Version (windows/$Arch)..."
try {
    Invoke-WebRequest -Uri $Url -OutFile $Tmp -UseBasicParsing
} catch {
    Remove-Item -Force $Tmp -ErrorAction SilentlyContinue
    Write-Error "Failed to download from $Url"
    exit 1
}

Write-Host "Installing to $Dest..."
Move-Item -Force $Tmp $Dest

Write-Host "Installed $Binary $Version to $Dest"

$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if (";$UserPath;" -notlike "*;$InstallDir;*") {
    Write-Host ""
    Write-Host "WARNING: $InstallDir is not in your PATH."
    Write-Host "Add it by running the following, then restart your shell:"
    Write-Host ""
    Write-Host "  [Environment]::SetEnvironmentVariable('PATH', `"`$env:PATH;$InstallDir`", 'User')"
    Write-Host ""
}
