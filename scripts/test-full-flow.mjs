// test-full-flow.mjs — Full game flow test on real iPhone Xs
// Tests: BIOS → TITLE → PLAYING → DIE → NAME_ENTRY → DEAD → TITLE (x2 cycles)
// Run on Mac: node test-full-flow.mjs
import http from 'http';

const GAME_URL = 'http://192.168.1.150:8081/?test=1';
const TIMEOUT = 120000; // 2 minutes max

function wd(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: 'localhost', port: 4723, path, method, headers: { 'Content-Type': 'application/json' }, timeout: 10000 };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Read game state from window.__dpMotoTest.state (the TestState object)
function getState(sid) {
  return wd('POST', '/session/' + sid + '/execute/sync', {
    script: [
      'var t = window.__dpMotoTest;',
      'if (!t || !t.state) return JSON.stringify({ready:false});',
      'var s = t.state;',
      'return JSON.stringify({',
      '  ready: true,',
      '  stateNum: s.state,',
      '  stateName: s.stateName,',
      '  frameCount: s.frameCount,',
      '  fps: s.fps,',
      '  fpsAvg: s.fpsAvg,',
      '  alive: s.alive,',
      '  score: s.score,',
      '  biosVisible: s.biosVisible,',
      '  sceneName: s.ui ? s.ui.sceneName : "?",',
      '  stateVersion: s.stateVersion,',
      '  playerY: s.playerY,',
      '  difficulty: s.difficulty',
      '});',
    ].join('\n'),
    args: []
  }).then(r => {
    if (r.status === 200 && r.body?.value) return JSON.parse(r.body.value);
    return null;
  });
}

// Send a command via pushCommand (the correct test mode API)
function sendCommand(sid, cmdObj) {
  const cmdJson = JSON.stringify(cmdObj);
  return wd('POST', '/session/' + sid + '/execute/sync', {
    script: [
      'var t = window.__dpMotoTest;',
      'if (t && t.pushCommand) {',
      '  t.pushCommand(' + JSON.stringify(cmdJson) + ');',
      '  return "queued";',
      '}',
      'return "no-test-mode";'
    ].join('\n'),
    args: []
  }).then(r => r.body?.value || 'error');
}

async function run() {
  // Clean stale sessions
  try {
    const sessions = await wd('GET', '/sessions', null);
    if (sessions.body?.value?.length) {
      for (const s of sessions.body.value) {
        console.log('Cleaning stale session:', s.id);
        await wd('DELETE', '/session/' + s.id);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch {}

  console.log('Creating session...');
  const sess = await wd('POST', '/session', {
    capabilities: { alwaysMatch: { browserName: 'safari', platformName: 'iOS', 'safari:deviceUDID': '00008020-001345143C52002E', 'safari:automaticInspection': true } }
  });

  if (!sess.body?.value?.sessionId) {
    console.error('Session failed:', JSON.stringify(sess.body).slice(0, 500));
    process.exit(1);
  }

  const sid = sess.body.value.sessionId;
  console.log('Session:', sid);

  await new Promise(r => setTimeout(r, 1000));

  console.log('Loading game at ' + GAME_URL);
  await wd('POST', '/session/' + sid + '/url', { url: GAME_URL });

  const startTime = Date.now();
  let lastStateName = '';
  let titleCount = 0;
  let deathCount = 0;
  let cyclesDone = 0;
  let lastFps = 0;
  let playingFrames = 0; // frames spent in PLAYING state
  let commandCooldown = 0; // prevent command spam

  // Wait for game to boot and cycle through states
  while (Date.now() - startTime < TIMEOUT) {
    await new Promise(r => setTimeout(r, 1000));
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

    let state;
    try {
      state = await getState(sid);
    } catch (err) {
      console.error(elapsed + 's: SESSION DIED - ' + err.message);
      break;
    }

    if (!state || !state.ready) {
      console.log(elapsed + 's: waiting for test mode...');
      continue;
    }

    const sn = state.stateName || 'UNKNOWN';
    lastFps = state.fps || 0;
    commandCooldown = Math.max(0, commandCooldown - 1);

    if (sn !== lastStateName) {
      console.log(elapsed + 's: >>> STATE CHANGE: ' + lastStateName + ' -> ' + sn +
        ' (frames=' + state.frameCount + ', fps=' + state.fps + ', score=' + state.score + ')');
      lastStateName = sn;
      playingFrames = 0; // reset per-state frame counter

      // Track cycles
      if (sn === 'TITLE') {
        titleCount++;
        if (titleCount > 1) {
          cyclesDone++;
          console.log(elapsed + 's: === CYCLE ' + cyclesDone + ' COMPLETE ===');
          if (cyclesDone >= 2) {
            console.log(elapsed + 's: === ALL CYCLES DONE ===');
            break;
          }
        }
      }
      if (sn === 'DEAD') deathCount++;
    } else {
      // Progress display every 5 seconds
      if (parseInt(elapsed) % 5 === 0) {
        console.log(elapsed + 's: ' + sn + ' | frames=' + state.frameCount + ' fps=' + state.fps +
          ' score=' + state.score + ' alive=' + state.alive + ' difficulty=' + (state.difficulty || 0).toFixed(2));
      }
    }

    // Auto-advance based on state (only send commands when cooldown is 0)
    if (commandCooldown > 0) continue;

    try {
      if (sn === 'TITLE') {
        // Send tap to advance from title → tutorial (skipped by test mode) → starting → playing
        console.log(elapsed + 's: [cmd] tap (advance from TITLE)');
        await sendCommand(sid, { type: 'tap' });
        commandCooldown = 3; // wait 3s before next command

      } else if (sn === 'TUTORIAL' || sn === 'STARTING') {
        // Test mode auto-skips these, but tap to help if stuck
        console.log(elapsed + 's: [cmd] tap (advance from ' + sn + ')');
        await sendCommand(sid, { type: 'tap' });
        commandCooldown = 2;

      } else if (sn === 'PLAYING') {
        playingFrames++;
        // Let the game play for a few seconds, then force death
        if (state.frameCount > 150 && playingFrames >= 5) {
          console.log(elapsed + 's: [cmd] die (played enough: frames=' + state.frameCount + ' score=' + state.score + ')');
          await sendCommand(sid, { type: 'die' });
          commandCooldown = 2;
        } else {
          // Keep playing — send speed taps to generate score
          await sendCommand(sid, { type: 'speed-tap' });
        }

      } else if (sn === 'DYING') {
        // Wait for death animation to complete
        commandCooldown = 2;

      } else if (sn === 'NAME_ENTRY') {
        // Submit name to advance
        console.log(elapsed + 's: [cmd] submit-name');
        await sendCommand(sid, { type: 'submit-name', name: 'TEST' });
        commandCooldown = 3;

      } else if (sn === 'DEAD') {
        // Use return-title command (tap from DEAD goes to PLAYING, not TITLE)
        console.log(elapsed + 's: [cmd] return-title (back to TITLE for next cycle)');
        await sendCommand(sid, { type: 'return-title' });
        commandCooldown = 3;
      }
    } catch (err) {
      console.error(elapsed + 's: Command error: ' + err.message);
    }
  }

  try { await wd('DELETE', '/session/' + sid); } catch {}

  console.log('');
  console.log('=== RESULTS ===');
  console.log('Cycles completed: ' + cyclesDone + '/2');
  console.log('Deaths: ' + deathCount);
  console.log('Last FPS: ' + lastFps);
  console.log('Duration: ' + ((Date.now() - startTime) / 1000).toFixed(0) + 's');
  if (cyclesDone >= 2) {
    console.log('=== PASS ===');
  } else {
    console.log('=== FAIL ===');
  }
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
