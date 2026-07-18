@echo off
rem Installs a pre-built gitz binary from GitHub Releases (native Windows CMD).
rem
rem Usage:
rem   curl -fsSL https://raw.githubusercontent.com/ropean/git-z/main/install.cmd -o install.cmd && install.cmd && del install.cmd
rem
rem Pin a version (tag or "latest"):
rem   set GITZ_VERSION=v1.0.0 && curl -fsSL ... -o install.cmd && install.cmd && del install.cmd

setlocal

powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/ropean/git-z/main/install.ps1 | iex"
if errorlevel 1 (
    echo install.cmd: install.ps1 failed >&2
    exit /b 1
)

endlocal
