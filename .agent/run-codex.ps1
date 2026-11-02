# Runs one Codex prompt file headless in this worktree and saves Codex's final report.
# Usage: & .\.agent\run-codex.ps1 <prompt-file> <report-file>
param(
  [Parameter(Mandatory)] [string] $PromptFile,
  [Parameter(Mandatory)] [string] $ReportFile
)
$ErrorActionPreference = 'Stop'
$worktree = Split-Path -Parent $PSScriptRoot
$gitDir = (git -C $worktree rev-parse --git-common-dir)
# pnpm, Vite and wrangler also write to these per-user folders.
$extraDirs = @(
  $gitDir,
  (Join-Path $env:LOCALAPPDATA 'pnpm-store-operation-locks'),
  (Join-Path $env:LOCALAPPDATA 'pnpm'),
  $env:TEMP,
  (Join-Path $env:APPDATA 'xdg.config')
) | Where-Object { Test-Path $_ }
$addDirArgs = $extraDirs | ForEach-Object { '--add-dir', $_ }
Get-Content -Raw $PromptFile | codex exec -C $worktree -s workspace-write @addDirArgs `
  -c 'sandbox_workspace_write.network_access=true' -o $ReportFile -
Write-Host "Codex finished. Report: $ReportFile"
