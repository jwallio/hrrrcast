param(
  [string]$PythonExe = "python",
  [string]$Profile = "core_operational",
  [string]$Member,
  [switch]$WarmCache,
  [switch]$SkipHealthCheck = $true
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$arguments = @(
  "scripts/refresh_latest_ready_workflow.py",
  "--profile", $Profile
)

if ($WarmCache) {
  $arguments += "--warm-cache"
}
if ($Member) {
  $arguments += @("--member", $Member)
}
if ($SkipHealthCheck) {
  $arguments += "--skip-health-check"
}

& $PythonExe @arguments
