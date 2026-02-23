#Requires -Version 7
# stress-50-jitter.ps1 — 50-pass sequential agent stress test with randomized jitter
# Usage: pwsh -ExecutionPolicy Bypass -File .\scripts\stress-50-jitter.ps1
# Dry run: pwsh -NoProfile -File .\scripts\stress-50-jitter.ps1 -WhatIf

param(
    [switch]$WhatIf
)

# ── Config ──────────────────────────────────────────────────────
$TargetBase    = "http://192.168.1.150:8081"
$TotalRuns     = 50
$JitterMinMs   = 250
$JitterMaxMs   = 1500
$FixedDelayMs  = 250
$PollMinMs     = 300
$PollMaxMs     = 600
$PollTimeoutMs = 30000

# ── WhatIf: print config and exit ──────────────────────────────
if ($WhatIf) {
    Write-Host ""
    Write-Host "  [WhatIf] stress-50-jitter.ps1 — syntax OK" -ForegroundColor Green
    Write-Host "  Target:       $TargetBase"
    Write-Host "  Runs:         $TotalRuns"
    Write-Host "  Jitter:       ${JitterMinMs}–${JitterMaxMs}ms + ${FixedDelayMs}ms fixed"
    Write-Host "  Poll:         ${PollMinMs}–${PollMaxMs}ms interval, ${PollTimeoutMs}ms timeout"
    Write-Host "  PS version:   $($PSVersionTable.PSVersion)"
    Write-Host "  Cert bypass:  -SkipCertificateCheck (PS7 native)"
    Write-Host ""
    exit 0
}

# ── Helpers ─────────────────────────────────────────────────────
$rng = [System.Random]::new()

function Post-Json($path, $body) {
    Invoke-RestMethod -Uri "${TargetBase}${path}" `
        -Method Post -ContentType "application/json" `
        -Body $body -SkipCertificateCheck
}

function Get-Json($path) {
    Invoke-RestMethod -Uri "${TargetBase}${path}" `
        -Method Get -SkipCertificateCheck
}

# ── State ───────────────────────────────────────────────────────
$passes    = 0
$fails     = 0
$timeouts  = 0
$firstFail = -1
$errors    = @{}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  STRESS-50-JITTER  $TotalRuns sequential runs" -ForegroundColor Cyan
Write-Host "  Target: $TargetBase" -ForegroundColor Cyan
Write-Host "  PS $($PSVersionTable.PSVersion)  -SkipCertificateCheck" -ForegroundColor DarkGray
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Main loop ───────────────────────────────────────────────────
for ($i = 1; $i -le $TotalRuns; $i++) {

    $id = "agent-jitter-{0:D3}" -f $i

    # Build task
    $taskBody = @{
        type  = "run-recipe"
        _id   = $id
        steps = @(
            @{ type = "game-cmd"; cmd = @{ type = "skip-to-play" }; postDelay = 2000 }
            @{ type = "wait-state"; target = "PLAYING"; timeout = 10000 }
            @{ type = "read-state" }
            @{ type = "screenshot"; delay = 1000 }
        )
    } | ConvertTo-Json -Depth 10

    # POST task
    try {
        Post-Json "/agent/task" $taskBody | Out-Null
    } catch {
        $reason = "post-failed: $($_.Exception.Message)"
        $fails++
        if ($firstFail -lt 0) { $firstFail = $i }
        if ($errors.ContainsKey($reason)) { $errors[$reason]++ } else { $errors[$reason] = 1 }
        Write-Host ("  [{0,2}/{1}] {2}  FAIL  {3}" -f $i, $TotalRuns, $id, $reason) -ForegroundColor Red
        continue
    }

    # Poll for matching result
    $pollStart = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $matched   = $false
    $res       = $null

    while ((-not $matched) -and
          (([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $pollStart) -lt $PollTimeoutMs)) {
        Start-Sleep -Milliseconds ($rng.Next($PollMinMs, $PollMaxMs + 1))
        try {
            $res = Get-Json "/agent/result"
            if ($res.taskId -eq $id) { $matched = $true }
        } catch {}
    }

    # Evaluate
    $status     = ""
    $reason     = ""
    $stateName  = ""
    $screenshot = ""

    if (-not $matched) {
        $status = "TIMEOUT"
        $reason = "poll-timeout-${PollTimeoutMs}ms"
        $timeouts++
        if ($firstFail -lt 0) { $firstFail = $i }
    }
    elseif ($res.ok -eq $true) {
        $status = "PASS"
        # Extract details from step results
        if ($res.stepResults) {
            foreach ($sr in $res.stepResults) {
                if ($sr.state -and $sr.state.stateName) {
                    $stateName = $sr.state.stateName
                }
                if ($null -ne $sr.method) {
                    $screenshot = "$($sr.method):captured=$($sr.captured)"
                }
            }
        }
        $passes++
    }
    else {
        $status = "FAIL"
        if ($res.stepResults) {
            foreach ($sr in $res.stepResults) {
                if ($sr.ok -eq $false) {
                    $reason = "$($sr.type):$($sr.error)"
                    break
                }
                if ($sr.state -and $sr.state.stateName) {
                    $stateName = $sr.state.stateName
                }
                if ($null -ne $sr.method) {
                    $screenshot = "$($sr.method):captured=$($sr.captured)"
                }
            }
        }
        if (-not $reason) { $reason = "unknown" }
        $fails++
        if ($firstFail -lt 0) { $firstFail = $i }
    }

    if ($reason -and ($status -ne "PASS")) {
        if ($errors.ContainsKey($reason)) { $errors[$reason]++ } else { $errors[$reason] = 1 }
    }

    # Per-run log line
    $color = switch ($status) { "PASS" { "Green" } "FAIL" { "Red" } "TIMEOUT" { "Yellow" } default { "White" } }
    $extra = ""
    if ($stateName)  { $extra += "  state=$stateName" }
    if ($screenshot) { $extra += "  ss=$screenshot" }
    if ($reason)     { $extra += "  reason=$reason" }
    Write-Host ("  [{0,2}/{1}] {2}  {3}{4}" -f $i, $TotalRuns, $id, $status, $extra) -ForegroundColor $color

    # Jitter before next run
    if ($i -lt $TotalRuns) {
        Start-Sleep -Milliseconds ($rng.Next($JitterMinMs, $JitterMaxMs + 1) + $FixedDelayMs)
    }
}

# ── Summary ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  RESULTS" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Total:    $TotalRuns" -ForegroundColor White
Write-Host "  Passes:   $passes"   -ForegroundColor $(if ($passes -eq $TotalRuns) { "Green" } else { "White" })
Write-Host "  Fails:    $fails"    -ForegroundColor $(if ($fails -gt 0) { "Red" } else { "Green" })
Write-Host "  Timeouts: $timeouts" -ForegroundColor $(if ($timeouts -gt 0) { "Yellow" } else { "Green" })

if ($firstFail -gt 0) {
    Write-Host "  First failure: run #$firstFail" -ForegroundColor Yellow
}

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "  Error breakdown:" -ForegroundColor Yellow
    foreach ($kv in $errors.GetEnumerator() | Sort-Object Value -Descending) {
        Write-Host ("    [{0,2}x] {1}" -f $kv.Value, $kv.Key) -ForegroundColor Yellow
    }
}

$passRate = if ($TotalRuns -gt 0) { [math]::Round(($passes / $TotalRuns) * 100, 1) } else { 0 }
$verdict  = if ($passRate -eq 100) { "ROCK SOLID" }
            elseif ($passRate -ge 90) { "MOSTLY STABLE" }
            elseif ($passRate -ge 50) { "FLAKY" }
            else { "BROKEN" }
$vColor   = switch ($verdict) {
    "ROCK SOLID"    { "Green" }
    "MOSTLY STABLE" { "Yellow" }
    "FLAKY"         { "Red" }
    "BROKEN"        { "Red" }
}

Write-Host ""
Write-Host "  Pass rate: ${passRate}%  --  $verdict" -ForegroundColor $vColor
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
