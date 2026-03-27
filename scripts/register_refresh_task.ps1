param(
  [string]$TaskName = "HRRRCast Refresh",
  [string]$PythonExe = "python",
  [int]$HourInterval = 1,
  [string]$Profile = "core_operational",
  [string]$Member,
  [switch]$WarmCache,
  [switch]$SkipHealthCheck = $true
)

$ErrorActionPreference = "Stop"

if ($HourInterval -lt 1) {
  throw "HourInterval must be at least 1."
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$RunnerPath = Join-Path $PSScriptRoot "run_refresh_latest_ready.ps1"
$runnerArguments = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$RunnerPath`"",
  "-PythonExe", "`"$PythonExe`"",
  "-Profile", "`"$Profile`""
)
if ($Member) {
  $runnerArguments += @("-Member", "`"$Member`"")
}
if ($WarmCache) {
  $runnerArguments += "-WarmCache"
}
if ($SkipHealthCheck) {
  $runnerArguments += "-SkipHealthCheck"
}

$taskCommand = "powershell.exe " + ($runnerArguments -join " ")

schtasks.exe /Create /F /SC HOURLY /MO $HourInterval /TN $TaskName /TR $taskCommand | Out-Null
Write-Host "Registered task '$TaskName' to run every $HourInterval hour(s)."
Write-Host "Command: $taskCommand"
