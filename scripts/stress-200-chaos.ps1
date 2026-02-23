#Requires -Version 7
# stress-200-chaos.ps1 — Level 2 "Chaos + Recovery" stress test (200 runs)
# Usage: pwsh -ExecutionPolicy Bypass -File .\scripts\stress-200-chaos.ps1
# Dry run: pwsh -NoProfile -File .\scripts\stress-200-chaos.ps1 -WhatIf

param(
    [switch]$WhatIf
)

# ── Config ──────────────────────────────────────────────────────
$TargetBase       = "https://192.168.1.150:8081"
$TotalRuns        = 200
$JitterMinMs      = 250
$JitterMaxMs      = 1500
$FixedDelayMs     = 250
$PollStartMinMs   = 400
$PollStartMaxMs   = 600
$PollBackoffMul   = 1.5
$PollCapMs        = 3000
$PollTimeoutMs    = 30000
$MaxRetries       = 2
$PingMaxRetries   = 3
$ResetEveryN      = 10
$AbortAfterConsec = 5     # Abort entire run after N consecutive guard-exhausted failures

$RecoverablePatterns = @(
    "invalid session id",
    "no such window",
    "ECONN",
    "timeout",
    "ECONNREFUSED",
    "ECONNRESET",
    "step-0-failed",
    "step-1-failed",
    "step-2-failed",
    "no-state",
    "Script exec failed",
    "no such element"
)

# ── WhatIf ──────────────────────────────────────────────────────
if ($WhatIf) {
    Write-Host ""
    Write-Host "  [WhatIf] stress-200-chaos.ps1 — syntax OK" -ForegroundColor Green
    Write-Host "  Target:         $TargetBase"
    Write-Host "  Runs:           $TotalRuns"
    Write-Host "  Jitter:         ${JitterMinMs}-${JitterMaxMs}ms + ${FixedDelayMs}ms"
    Write-Host "  Poll backoff:   ${PollStartMinMs}-${PollStartMaxMs}ms x${PollBackoffMul} cap ${PollCapMs}ms"
    Write-Host "  Poll timeout:   ${PollTimeoutMs}ms"
    Write-Host "  Max retries:    $MaxRetries per run"
    Write-Host "  Ping retries:   $PingMaxRetries"
    Write-Host "  Reset every:    $ResetEveryN runs (soft-reset, no page reload)"
    Write-Host "  Abort after:    $AbortAfterConsec consecutive guard failures"
    Write-Host "  PS version:     $($PSVersionTable.PSVersion)"
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

function Poll-ForResult($taskId) {
    $start = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $interval = $rng.Next($PollStartMinMs, $PollStartMaxMs + 1)

    while (([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $start) -lt $PollTimeoutMs) {
        Start-Sleep -Milliseconds $interval
        try {
            $r = Get-Json "/agent/result"
            if ($r.taskId -eq $taskId) { return $r }
        } catch {}
        $interval = [math]::Min([int]($interval * $PollBackoffMul), $PollCapMs)
    }
    return $null
}

function Post-TaskAndPoll($taskBody, $taskId) {
    try {
        Post-Json "/agent/task" $taskBody | Out-Null
    } catch {
        return @{ _postError = $_.Exception.Message }
    }
    $r = Poll-ForResult $taskId
    if ($null -eq $r) { return @{ _timeout = $true } }
    return $r
}

function Is-Recoverable($result) {
    if ($null -eq $result) { return $true }
    if ($result._timeout) { return $true }
    if ($result._postError) { return $true }
    if ($result.ok -eq $true) { return $false }

    # Check step errors for recoverable patterns
    $resultJson = ($result | ConvertTo-Json -Depth 10 -Compress)
    foreach ($pat in $RecoverablePatterns) {
        if ($resultJson -like "*$pat*") { return $true }
    }
    return $false
}

function Extract-Details($result) {
    $stateName  = ""
    $screenshot = ""
    $reason     = ""

    if ($null -eq $result -or $result._timeout) {
        $reason = "poll-timeout"
    }
    elseif ($result._postError) {
        $reason = "post-error: $($result._postError)"
    }
    elseif ($result.ok -eq $false) {
        if ($result.steps) {
            foreach ($sr in $result.steps) {
                if ($sr.state -and $sr.state.stateName) { $stateName = $sr.state.stateName }
                if ($null -ne $sr.method) { $screenshot = "$($sr.method):$($sr.captured)" }
                if ($sr.ok -eq $false -and -not $reason) {
                    $reason = if ($sr.error) { $sr.error } elseif ($sr.reason) { $sr.reason } else { "step-$($sr.step)-failed" }
                }
            }
        }
        if (-not $reason) { $reason = "unknown" }
    }
    else {
        if ($result.steps) {
            foreach ($sr in $result.steps) {
                if ($sr.state -and $sr.state.stateName) { $stateName = $sr.state.stateName }
                if ($null -ne $sr.method) { $screenshot = "$($sr.method):$($sr.captured)" }
            }
        }
    }

    return @{ State = $stateName; Screenshot = $screenshot; Reason = $reason }
}

# ── State ───────────────────────────────────────────────────────
$passes       = 0
$fails        = 0
$timeouts     = 0
$firstFail    = -1
$errors       = @{}
$recoveryAttempts  = 0
$recoverySuccess   = 0
$maxConsecFails    = 0
$curConsecFails    = 0
$softResets        = 0
$aborted           = $false

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  STRESS-200-CHAOS  Level 2 Hardened" -ForegroundColor Cyan
Write-Host "  $TotalRuns runs  target: $TargetBase" -ForegroundColor Cyan
Write-Host "  PS $($PSVersionTable.PSVersion)  retries=$MaxRetries  reset-every=$ResetEveryN" -ForegroundColor DarkGray
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Main loop ───────────────────────────────────────────────────
for ($i = 1; $i -le $TotalRuns; $i++) {

    # ── A) Pre-run guard: read-state (checks browser is alive, not just agent) ──
    $guardOk = $false
    for ($pg = 1; $pg -le $PingMaxRetries; $pg++) {
        $guardId = "guard-$i-$pg"
        $guardBody = @{ type = "read-state"; _id = $guardId } | ConvertTo-Json -Depth 5
        $guardRes = Post-TaskAndPoll $guardBody $guardId

        if ($guardRes -and -not $guardRes._timeout -and -not $guardRes._postError -and $guardRes.ok -eq $true) {
            $guardOk = $true
            break
        }

        # Browser dead — run health-check (re-navigates + re-creates session)
        Write-Host ("  [{0,3}/{1}] guard: browser dead (attempt {2}/{3}) — running health-check..." -f $i, $TotalRuns, $pg, $PingMaxRetries) -ForegroundColor Yellow
        $hcId = "healthcheck-$i-$pg"
        $hcBody = @{ type = "health-check"; _id = $hcId } | ConvertTo-Json -Depth 5
        $hcRes = Post-TaskAndPoll $hcBody $hcId
        $recoveryAttempts++

        if ($hcRes -and $hcRes.ok -eq $true) {
            $recoverySuccess++
            Write-Host ("  [{0,3}/{1}] health-check recovered — retrying guard" -f $i, $TotalRuns) -ForegroundColor Green
            # Extra settle time after health-check recovery
            Start-Sleep -Milliseconds 3000
        } else {
            Write-Host ("  [{0,3}/{1}] health-check also failed — attempt {2}/{3}" -f $i, $TotalRuns, $pg, $PingMaxRetries) -ForegroundColor Red
        }
    }

    if (-not $guardOk) {
        $timeouts++
        $curConsecFails++
        if ($curConsecFails -gt $maxConsecFails) { $maxConsecFails = $curConsecFails }
        if ($firstFail -lt 0) { $firstFail = $i }
        $errKey = "guard-exhausted"
        if ($errors.ContainsKey($errKey)) { $errors[$errKey]++ } else { $errors[$errKey] = 1 }
        Write-Host ("  [{0,3}/{1}] agent-chaos-{0:D3}  TIMEOUT  reason=guard-exhausted" -f $i, $TotalRuns) -ForegroundColor Yellow

        # ── D) Consecutive-failure abort ────────────────────────
        if ($curConsecFails -ge $AbortAfterConsec) {
            Write-Host ""
            Write-Host "  ABORT: $AbortAfterConsec consecutive failures — Safari content process likely crashed." -ForegroundColor Red
            Write-Host "  Manual intervention required: restart mac-agent on Mac." -ForegroundColor Red
            Write-Host ""
            $aborted = $true
            break
        }

        Start-Sleep -Milliseconds ($rng.Next($JitterMinMs, $JitterMaxMs + 1) + $FixedDelayMs)
        continue
    }

    # ── C) Periodic soft-reset every N runs (NO page reload) ───
    if ($i -gt 1 -and (($i - 1) % $ResetEveryN -eq 0)) {
        # Step 1: Soft reset — return game to title via JS command
        $srId = "softreset-$i"
        $srBody = @{ type = "soft-reset"; _id = $srId } | ConvertTo-Json -Depth 5
        $srRes = Post-TaskAndPoll $srBody $srId

        $softResets++
        if ($srRes -and $srRes.ok) {
            Write-Host ("  [{0,3}/{1}] soft-reset  ok  (method=$($srRes.method))" -f $i, $TotalRuns) -ForegroundColor DarkGray
        } else {
            # Step 2: Soft reset failed — try ONE session re-create via health-check
            Write-Host ("  [{0,3}/{1}] soft-reset  failed — escalating to session-recreate..." -f $i, $TotalRuns) -ForegroundColor Yellow
            $hcId = "hc-softreset-$i"
            $hcBody = @{ type = "health-check"; _id = $hcId } | ConvertTo-Json -Depth 5
            $hcRes = Post-TaskAndPoll $hcBody $hcId
            $recoveryAttempts++

            if ($hcRes -and $hcRes.ok) {
                $recoverySuccess++
                Write-Host ("  [{0,3}/{1}] session-recreate  ok (health-check recovered)" -f $i, $TotalRuns) -ForegroundColor Green
            } else {
                # Step 3: Session recreate also failed — log and continue (guard will catch on next run)
                Write-Host ("  [{0,3}/{1}] session-recreate  FAILED — continuing (guard will catch)" -f $i, $TotalRuns) -ForegroundColor Red
            }
        }
    }

    # ── B) Run recipe with retry on recoverable failure ─────────
    $id = "agent-chaos-{0:D3}" -f $i
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

    $attempt   = 0
    $finalRes  = $null
    $resolved  = $false

    while ($attempt -le $MaxRetries -and -not $resolved) {
        $runId = if ($attempt -eq 0) { $id } else { "${id}-retry-${attempt}" }

        # Re-serialize with updated _id for retries
        $runBody = if ($attempt -eq 0) { $taskBody } else {
            @{
                type  = "run-recipe"
                _id   = $runId
                steps = @(
                    @{ type = "game-cmd"; cmd = @{ type = "skip-to-play" }; postDelay = 2000 }
                    @{ type = "wait-state"; target = "PLAYING"; timeout = 10000 }
                    @{ type = "read-state" }
                    @{ type = "screenshot"; delay = 1000 }
                )
            } | ConvertTo-Json -Depth 10
        }

        $finalRes = Post-TaskAndPoll $runBody $runId
        $attempt++

        if ($finalRes -and $finalRes.ok -eq $true) {
            $resolved = $true
        }
        elseif ($attempt -le $MaxRetries -and (Is-Recoverable $finalRes)) {
            # Recoverable — reload and retry
            $recoveryAttempts++
            $reloadId = "reload-$i-$attempt"
            $reloadBody = @{ type = "reload"; _id = $reloadId } | ConvertTo-Json -Depth 5
            $reloadRes = Post-TaskAndPoll $reloadBody $reloadId
            $reloadsIssued++

            if ($reloadRes -and $reloadRes.ok) {
                $recoverySuccess++
                Write-Host ("  [{0,3}/{1}] recoverable failure — reloaded, retry {2}/{3}" -f $i, $TotalRuns, $attempt, $MaxRetries) -ForegroundColor Yellow
            } else {
                Write-Host ("  [{0,3}/{1}] reload failed — retry {2}/{3} anyway" -f $i, $TotalRuns, $attempt, $MaxRetries) -ForegroundColor Red
            }
            Start-Sleep -Milliseconds 2000
        }
        else {
            $resolved = $true  # non-recoverable or retries exhausted
        }
    }

    $retriesUsed = $attempt - 1
    $details = Extract-Details $finalRes

    # Classify outcome
    if ($finalRes -and $finalRes.ok -eq $true) {
        $status = "PASS"
        $passes++
        $curConsecFails = 0
    }
    elseif ($finalRes._timeout -or $null -eq $finalRes) {
        $status = "TIMEOUT"
        $timeouts++
        $curConsecFails++
        if ($firstFail -lt 0) { $firstFail = $i }
    }
    else {
        $status = "FAIL"
        $fails++
        $curConsecFails++
        if ($firstFail -lt 0) { $firstFail = $i }
    }

    if ($curConsecFails -gt $maxConsecFails) { $maxConsecFails = $curConsecFails }

    if ($details.Reason -and $status -ne "PASS") {
        $errKey = $details.Reason
        if ($errKey.Length -gt 80) { $errKey = $errKey.Substring(0, 80) }
        if ($errors.ContainsKey($errKey)) { $errors[$errKey]++ } else { $errors[$errKey] = 1 }
    }

    # Log line
    $color = switch ($status) { "PASS" { "Green" } "FAIL" { "Red" } "TIMEOUT" { "Yellow" } default { "White" } }
    $extra = "  retries=$retriesUsed"
    if ($details.State)      { $extra += "  state=$($details.State)" }
    if ($details.Screenshot) { $extra += "  ss=$($details.Screenshot)" }
    if ($details.Reason)     { $extra += "  reason=$($details.Reason)" }
    Write-Host ("  [{0,3}/{1}] {2}  {3}{4}" -f $i, $TotalRuns, $id, $status, $extra) -ForegroundColor $color

    # Jitter before next run
    if ($i -lt $TotalRuns) {
        Start-Sleep -Milliseconds ($rng.Next($JitterMinMs, $JitterMaxMs + 1) + $FixedDelayMs)
    }
}

# ── Summary ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  RESULTS — LEVEL 2 CHAOS" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
$completedRuns = $passes + $fails + $timeouts
Write-Host "  Completed runs:   $completedRuns / $TotalRuns" -ForegroundColor $(if ($completedRuns -eq $TotalRuns) { "White" } else { "Yellow" })
Write-Host "  Passes:           $passes"    -ForegroundColor $(if ($passes -eq $TotalRuns) { "Green" } else { "White" })
Write-Host "  Fails:            $fails"     -ForegroundColor $(if ($fails -gt 0) { "Red" } else { "Green" })
Write-Host "  Timeouts:         $timeouts"  -ForegroundColor $(if ($timeouts -gt 0) { "Yellow" } else { "Green" })
Write-Host ""
Write-Host "  Recovery attempts:  $recoveryAttempts" -ForegroundColor White
Write-Host "  Recovery success:   $recoverySuccess"  -ForegroundColor $(if ($recoverySuccess -eq $recoveryAttempts -and $recoveryAttempts -gt 0) { "Green" } elseif ($recoveryAttempts -eq 0) { "White" } else { "Yellow" })
Write-Host "  Soft resets:        $softResets"        -ForegroundColor White
Write-Host "  Max consec fails:   $maxConsecFails"    -ForegroundColor $(if ($maxConsecFails -le 2) { "Green" } else { "Red" })
if ($aborted) {
    Write-Host "  ABORTED:            Yes (after $AbortAfterConsec consecutive failures)" -ForegroundColor Red
}

if ($firstFail -gt 0) {
    Write-Host "  First failure:      run #$firstFail" -ForegroundColor Yellow
}

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "  Error breakdown:" -ForegroundColor Yellow
    foreach ($kv in $errors.GetEnumerator() | Sort-Object Value -Descending) {
        Write-Host ("    [{0,3}x] {1}" -f $kv.Value, $kv.Key) -ForegroundColor Yellow
    }
}

$passRate = if ($completedRuns -gt 0) { [math]::Round(($passes / $completedRuns) * 100, 1) } else { 0 }
$verdict  = if ($passRate -eq 100)      { "ROCK SOLID" }
            elseif ($passRate -ge 98)   { "LEVEL 2 HARDENED" }
            elseif ($passRate -ge 90)   { "MOSTLY STABLE" }
            elseif ($passRate -ge 50)   { "FLAKY" }
            else                        { "BROKEN" }
$vColor   = switch ($verdict) {
    "ROCK SOLID"       { "Green" }
    "LEVEL 2 HARDENED" { "Green" }
    "MOSTLY STABLE"    { "Yellow" }
    "FLAKY"            { "Red" }
    "BROKEN"           { "Red" }
}

Write-Host ""
Write-Host "  Pass rate: ${passRate}%  --  $verdict" -ForegroundColor $vColor
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
