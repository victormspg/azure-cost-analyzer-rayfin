<#
.SYNOPSIS
  One-time local setup for the ACA app. Copies *.example templates to their real,
  git-ignored counterparts and prompts for values. Never writes secrets to tracked files.

.NOTES
  Run from the repo root:  ./scripts/bootstrap.ps1
  Values are shared out of band (Teams / Key Vault) — do NOT paste them into any tracked file.
#>

[CmdletBinding()]
param(
    [string]$AppDir = "app"
)

$ErrorActionPreference = "Stop"

# Run from the repo root (default) OR from inside app/. If the default 'app' subfolder isn't here
# but the current folder looks like the app (has package.json), target the current directory.
if ($AppDir -eq "app" -and -not (Test-Path "app") -and (Test-Path "package.json")) {
    $AppDir = "."
    Write-Host "[info] Detected you're inside app/ - targeting the current directory." -ForegroundColor DarkGray
}

function Copy-IfMissing($from, $to) {
    if (-not (Test-Path $from)) { Write-Warning "Template not found: $from"; return $false }
    if (Test-Path $to) { Write-Host "[OK] $to already exists - leaving as-is." -ForegroundColor DarkGray; return $false }
    Copy-Item $from $to
    Write-Host "-> created $to (git-ignored)" -ForegroundColor Green
    return $true
}

Write-Host "ACA local bootstrap" -ForegroundColor Cyan
Write-Host "This writes .env.local and fabric.yaml (both git-ignored). No secrets are tracked.`n"

# 1. app/.env.local
$envExample = Join-Path $AppDir ".env.example"
$envLocal   = Join-Path $AppDir ".env.local"
if (-not (Test-Path $envExample)) { $envExample = ".env.example" }  # fallback to root template
Copy-IfMissing $envExample $envLocal | Out-Null

# 2. app/fabric.yaml (app root — fabric-app-data auto-discovers it here)
$fabricExample = Join-Path $AppDir "fabric.yaml.example"
$fabricYaml    = Join-Path $AppDir "fabric.yaml"
if (-not (Test-Path $fabricExample)) { $fabricExample = "fabric.yaml.example" }  # fallback to repo-root master
Copy-IfMissing $fabricExample $fabricYaml | Out-Null

# 3. app/rayfin/rayfin.yml
$rayfinExample = Join-Path $AppDir "rayfin/rayfin.yml.example"
$rayfinYml     = Join-Path $AppDir "rayfin/rayfin.yml"
$rayfinDir = Split-Path $rayfinYml -Parent
if ($rayfinDir -and -not (Test-Path $rayfinDir)) { New-Item -ItemType Directory -Path $rayfinDir | Out-Null }
Copy-IfMissing $rayfinExample $rayfinYml | Out-Null

Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  1. Edit $fabricYaml  -> set workspaceId + itemId (shared out of band)."
Write-Host "  2. Edit $envLocal    -> set any Function URLs/keys (optional; blank = demo mode)."
Write-Host "  3. cd $AppDir; npm install; npm run dev"
Write-Host "`nReminder: never commit .env.local, fabric.yaml, or rayfin/rayfin.yml." -ForegroundColor Yellow
