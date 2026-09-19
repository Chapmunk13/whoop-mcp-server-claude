<#
  Launcher for the always-on WHOOP MCP HTTP server.

  Invoked by the "whoop-mcp-server" scheduled task (At Startup). Runs node in the FOREGROUND
  on purpose: the task's lifetime must equal the server's lifetime, so that Task Scheduler's
  restart-on-failure actually sees a crash. Start-Process would return immediately and the
  task would look "completed" while the server ran unsupervised.

  Task Scheduler cannot redirect stdout/stderr, so logging is handled here, with simple
  size-based rotation.
#>
[CmdletBinding()]
param(
  [string]$RepoRoot,
  [string]$LogDir,
  [int]$MaxLogBytes = 5MB,
  [int]$KeepLogs = 5
)

$ErrorActionPreference = 'Stop'

# See install-service-task.ps1: $PSScriptRoot is not reliable across every invocation path,
# and a null in a param default throws before the body can report anything useful.
if (-not $RepoRoot) {
  $ScriptDir = $PSScriptRoot
  if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
  if (-not $ScriptDir) { throw 'Cannot determine script directory; pass -RepoRoot explicitly.' }
  $RepoRoot = Split-Path -Parent $ScriptDir
}

if (-not $LogDir) { $LogDir = Join-Path $RepoRoot 'logs' }
if (-not (Test-Path -LiteralPath $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$log   = Join-Path $LogDir 'whoop-mcp-http.log'
$entry = Join-Path $RepoRoot 'whoop-mcp-server.js'

if (-not (Test-Path -LiteralPath $entry)) {
  throw "Entry point not found: $entry"
}

# --- rotate before appending ---------------------------------------------------------------
if ((Test-Path -LiteralPath $log) -and ((Get-Item -LiteralPath $log).Length -gt $MaxLogBytes)) {
  for ($i = $KeepLogs; $i -ge 1; $i--) {
    $older = "$log.$i"
    $newer = if ($i -eq 1) { $log } else { "$log.$($i-1)" }
    if (Test-Path -LiteralPath $newer) {
      Move-Item -LiteralPath $newer -Destination $older -Force
    }
  }
}

# --- resolve node explicitly; SYSTEM's PATH is not the interactive user's ------------------
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) {
  foreach ($candidate in @(
      'C:\Program Files\nodejs\node.exe',
      'C:\Program Files (x86)\nodejs\node.exe')) {
    if (Test-Path -LiteralPath $candidate) { $node = $candidate; break }
  }
}
if (-not $node) { throw 'node.exe not found on PATH or in the usual install locations.' }

Add-Content -LiteralPath $log -Value (
  "`n==== {0} starting: {1} --http (node: {2}) ====" -f
  (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $entry, $node
)

Set-Location -LiteralPath $RepoRoot

# Foreground, all streams appended to the log. The server reads its own .env from $RepoRoot,
# so the working directory is not load-bearing, but set it anyway for clarity.
& $node $entry --http *>> $log

$code = $LASTEXITCODE
Add-Content -LiteralPath $log -Value (
  "==== {0} exited with code {1} ====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $code
)
exit $code
