<#
  Registers the always-on WHOOP MCP HTTP server as a Windows scheduled task.

  Why a scheduled task rather than a service: NSSM is not present on the target host and no
  package manager is available to install it, so a service wrapper would mean pulling a
  third-party binary onto a production box. An At Startup trigger running as SYSTEM already
  gives what is actually needed here: it starts on every boot with no login required, and
  Task Scheduler's restart-on-failure provides crash recovery.

  Idempotent: re-running replaces the existing task definition.

  Must be run elevated.

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-service-task.ps1
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'whoop-mcp-server',
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [int]$RestartCount = 999,
  [int]$RestartIntervalMinutes = 1
)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Must run elevated to register a SYSTEM scheduled task.' }

$launcher = Join-Path $PSScriptRoot 'run-http-service.ps1'
if (-not (Test-Path -LiteralPath $launcher)) { throw "Launcher not found: $launcher" }
if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot '.env'))) {
  throw "No .env at $RepoRoot. The server cannot start without credentials."
}

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -RepoRoot "{1}"' -f $launcher, $RepoRoot) `
  -WorkingDirectory $RepoRoot

# At Startup covers reboot with no login. AtLogOn is deliberately NOT added: the task already
# runs as SYSTEM from boot, so a logon trigger would only risk a second instance.
$trigger = New-ScheduledTaskTrigger -AtStartup

$principal = New-ScheduledTaskPrincipal `
  -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -RestartCount $RestartCount `
  -RestartInterval (New-TimeSpan -Minutes $RestartIntervalMinutes) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)   # never time out a long-lived listener

# DeleteExpiredTaskAfter/idle settings left at defaults; there is no expiry and no idle
# condition, so the task is purely boot-triggered and restart-supervised.
$settings.DisallowStartIfOnBatteries = $false
$settings.StopIfGoingOnBatteries     = $false

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Write-Output "Existing task '$TaskName' found, replacing its definition."
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description 'Always-on WHOOP MCP server (Streamable HTTP), bound to loopback + Tailscale only. See src/http-server.ts for the security posture.' | Out-Null

$t = Get-ScheduledTask -TaskName $TaskName
Write-Output ("Registered '{0}': state={1} principal={2} trigger={3}" -f `
  $t.TaskName, $t.State, $t.Principal.UserId, $t.Triggers[0].CimClass.CimClassName)
Write-Output ("  restart-on-failure: {0} attempts every {1} min" -f $RestartCount, $RestartIntervalMinutes)
Write-Output "  start now with: Start-ScheduledTask -TaskName $TaskName"
