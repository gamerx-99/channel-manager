# Deploys committed `main` to production from the deploy-only clone, never from the work folder.
# Owner decision 2026-11-04: Claude may run this after tests pass; migrations stay with the owner.
# Usage: & .\.agent\deploy-production.ps1 [-DryRun]
param([switch] $DryRun)
$ErrorActionPreference = 'Stop'
$work = Split-Path -Parent $PSScriptRoot
$deploy = 'C:\WORK\hayhost-deploy'
if (-not (Test-Path (Join-Path $deploy '.git'))) { throw "Deploy clone missing: git clone --branch main $work $deploy" }

# 1. Bring the clone to the work folder's committed main (uncommitted work is never included).
git -C $deploy fetch $work main
if ($LASTEXITCODE) { throw 'git fetch failed' }
git -C $deploy checkout -q main
git -C $deploy merge --ff-only FETCH_HEAD
if ($LASTEXITCODE) { throw 'The deploy clone cannot fast-forward to main. Stop and ask.' }
$dirty = git -C $deploy status --porcelain
if ($dirty) { throw "The deploy clone has local changes; it must stay clean:`n$dirty" }
Write-Host "Deploying commit: $(git -C $deploy log --oneline -1)"

Push-Location $deploy
try {
  # 2. Refuse to deploy while a production migration is still unapplied (the owner applies those).
  $pending = pnpm exec wrangler d1 migrations list DB --env production --remote 2>&1 | Out-String
  if ($pending -notmatch 'No migrations to apply') {
    Write-Host $pending
    throw 'Production has unapplied migrations. The owner must apply them first.'
  }
  # 3. Build and deploy.
  pnpm install --frozen-lockfile
  if ($LASTEXITCODE) { throw 'pnpm install failed' }
  pnpm exec vite build
  if ($LASTEXITCODE) { throw 'vite build failed' }
  if ($DryRun) {
    pnpm exec wrangler deploy --env production --dry-run --outdir dist-worker
  } else {
    pnpm exec wrangler deploy --env production
  }
  if ($LASTEXITCODE) { throw 'wrangler deploy failed' }
} finally { Pop-Location }
