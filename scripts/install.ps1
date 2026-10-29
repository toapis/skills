# Install the ToAPIs skills and add the ToAPIs MCP server to Codex or Claude Code on Windows (on macOS and Linux use
# install.sh). Never reads or writes API keys: sign-in happens afterwards in the browser. Works with Windows
# PowerShell 5.1 and PowerShell 7.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1 -Client codex|claude-code -Site com|cn [-Locale <code>] [-DryRun] [-Force]
#
# Everything that can be checked is checked first: if a step would fail, or would replace an existing skill or ToAPIs
# server without -Force, nothing is changed. If a write still fails midway, fix the cause and run it again; finished
# steps then report unchanged. Replaced skills are moved to ~\.toapis-backup\<UTC time>\; the Codex config is backed
# up next to itself by toapis-setup.mjs.
param(
  [string]$Client,
  [string]$Site,
  [string]$Locale,
  [switch]$DryRun,
  [switch]$Force
)

Set-StrictMode -Version 3
$ErrorActionPreference = 'Stop'

$usage = 'usage: install.ps1 -Client codex|claude-code -Site com|cn [-Locale <code>] [-DryRun] [-Force]'
function Fail([string]$Message) {
  [Console]::Error.WriteLine("error: $Message")
  exit 1
}

$repo = Split-Path -Parent $PSScriptRoot
# Codex, Claude Code and Node use USERPROFILE. Windows PowerShell 5.1 sets $HOME from HOMEDRIVE and HOMEPATH instead,
# which domain setups often redirect to a network drive.
$userHome = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }

# Windows PowerShell 5.1 turns redirected stderr of a native command into an error, which stops the script under
# $ErrorActionPreference = 'Stop'. Run native commands with 'Continue' and judge them by $LASTEXITCODE only.
function Invoke-Native([scriptblock]$Command) {
  $saved = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Command } finally { $ErrorActionPreference = $saved }
}
switch -CaseSensitive ($Client) {
  'codex' { $skillsDir = Join-Path $userHome '.agents/skills' }
  'claude-code' { $skillsDir = Join-Path $userHome '.claude/skills' }
  default { Fail $usage }
}
switch -CaseSensitive ($Site) {
  'com' { $url = 'https://api.toapis.com/mcp' }
  'cn' { $url = 'https://api.toapis.cn/mcp' }
  default { Fail $usage }
}
if ($Locale -and $Locale -cnotmatch '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$') { Fail "invalid locale: $Locale" }

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd'T'HHmmss'Z'")
$backupRoot = Join-Path $userHome ".toapis-backup/$stamp"

# Relative path and SHA-256 of every file below Dir, sorted, so two copies of a skill can be compared.
function Get-TreeDigest([string]$Dir) {
  $root = (Resolve-Path -LiteralPath $Dir).ProviderPath.TrimEnd('\', '/')
  $lines = foreach ($file in Get-ChildItem -LiteralPath $root -Recurse -File -Force) {
    $rel = $file.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
    "$rel $((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash)"
  }
  (@($lines) | Sort-Object) -join "`n"
}

# Run toapis-setup.mjs and parse its one-line JSON result; anything else is reported as is.
function Invoke-CodexSetup([string[]]$Extra) {
  $output = (Invoke-Native { & node @setupArgs @Extra }) -join "`n"
  try { $parsed = $output | ConvertFrom-Json } catch { $parsed = $null }
  if (-not $parsed -or -not $parsed.ok) { Fail "cannot update the Codex config: $output" }
  Write-Output $parsed
}

# 1. Check the skills.
$skillActions = @()
foreach ($name in @('toapis-setup', 'toapis-media')) {
  $src = Join-Path $repo "skills/$name"
  $dest = Join-Path $skillsDir $name
  if (-not (Test-Path -LiteralPath (Join-Path $src 'SKILL.md'))) {
    Fail "missing $src; run this script from a full copy of https://github.com/toapis/skills"
  }
  # Get-Item -Force also finds a broken link, which Test-Path reports inconsistently.
  $existing = Get-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue
  if ($existing) {
    $sameTree = (Test-Path -LiteralPath $dest -PathType Container) -and ((Get-TreeDigest $src) -eq (Get-TreeDigest $dest))
    if ($sameTree) {
      $action = 'unchanged'
    } elseif ($Force) {
      $action = 'replace'
    } else {
      Fail "$dest already exists and differs from this copy. Rerun with -Force to replace it (the old copy is moved to $backupRoot)."
    }
  } else {
    $action = 'add'
  }
  $skillActions += [pscustomobject]@{ Name = $name; Action = $action; Src = $src; Dest = $dest }
  Write-Output "skill ${name}: $action ($dest)"
}

# 2. Check the MCP server.
$setupArgs = @((Join-Path $repo 'skills/toapis-setup/scripts/toapis-setup.mjs'), 'codex', '--site', $Site)
if ($Locale) { $setupArgs += @('--locale', $Locale) }
if ($Client -eq 'codex') {
  $nodeMajor = 0
  if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeMajor = [int](Invoke-Native { & node -p "process.versions.node.split('.')[0]" })
  }
  if ($nodeMajor -lt 20) {
    $codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $userHome '.codex' }
    $block = "[mcp_servers.toapis]`nurl = `"$url`""
    if ($Locale) { $block += "`nhttp_headers = { `"X-Locale`" = `"$Locale`" }" }
    Fail "Node.js 20 or newer is needed to edit the Codex config. Install it, or add this section to $(Join-Path $codexHome 'config.toml') yourself:`n$block"
  }
  $preview = Invoke-CodexSetup @('--dry-run')
  switch ($preview.action) {
    'replaced' {
      if (-not $Force) { Fail "the Codex config already has a different toapis server ($($preview.config)). Rerun with -Force to replace it (a backup is kept)." }
      $mcpAction = 'replace'
    }
    'added' { $mcpAction = 'add' }
    default { $mcpAction = 'unchanged' }
  }
} else {
  if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { Fail 'the Claude Code CLI (claude) was not found. Install or update Claude Code first.' }
  Invoke-Native { & claude mcp get toapis *> $null }
  if ($LASTEXITCODE -eq 0) {
    if (-not $Force) { Fail 'Claude Code already has an MCP server named toapis. Check it with "claude mcp get toapis", then rerun with -Force to replace it.' }
    $mcpAction = 'replace'
  } else {
    $mcpAction = 'add'
  }
}
Write-Output "mcp server toapis: $mcpAction ($url)"

if ($DryRun) {
  Write-Output 'dry run: nothing was changed'
  exit 0
}

# 3. Apply.
try {
  foreach ($skill in $skillActions) {
    if ($skill.Action -eq 'replace') {
      New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
      Move-Item -LiteralPath $skill.Dest -Destination (Join-Path $backupRoot $skill.Name)
      Copy-Item -LiteralPath $skill.Src -Destination $skill.Dest -Recurse
      Write-Output "moved the old $($skill.Name) to $(Join-Path $backupRoot $skill.Name)"
    } elseif ($skill.Action -eq 'add') {
      New-Item -ItemType Directory -Force -Path $skillsDir | Out-Null
      Copy-Item -LiteralPath $skill.Src -Destination $skill.Dest -Recurse
    }
  }
} catch {
  Fail "cannot write the skills to ${skillsDir}: $($_.Exception.Message)"
}

if ($Client -eq 'codex') {
  if ($mcpAction -ne 'unchanged') {
    $applied = Invoke-CodexSetup @()
    Write-Output "codex config: $($applied.action) ($($applied.config))"
    # backup is absent when the config file was created; StrictMode forbids reading a missing property.
    if ($applied.PSObject.Properties['backup']) { Write-Output "backup: $($applied.backup)" }
  }
  Write-Output 'Done. Sign in to ToAPIs:'
  Write-Output '- Codex CLI: run "codex mcp login toapis".'
  Write-Output '- Codex desktop app: open Settings > MCP servers, restart the servers if asked, and click Authenticate next to toapis.'
} else {
  if ($mcpAction -eq 'replace') {
    Invoke-Native { & claude mcp remove toapis --scope user *> $null }
    if ($LASTEXITCODE -ne 0) { Fail 'cannot remove the existing toapis server; it may not be in the user scope. Remove it yourself, then rerun.' }
  }
  $addArgs = @('mcp', 'add', '--transport', 'http', '--scope', 'user', 'toapis', $url)
  if ($Locale) { $addArgs += @('--header', "X-Locale: $Locale") }
  Invoke-Native { & claude @addArgs }
  if ($LASTEXITCODE -ne 0) { Fail 'claude mcp add failed' }
  Write-Output 'Done. Sign in to ToAPIs: start Claude Code, run /mcp, select toapis and authenticate.'
}
Write-Output 'Then start a new session and ask the agent to check your ToAPIs balance.'
