// test-vram-fix.mjs — Test if v0.00.67 VRAM fix prevents iPhone Xs crash
// Run on Mac: node test-vram-fix.mjs
import http from 'http';

const GAME_URL = 'http://192.168.1.150:8081/?test=1';

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
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
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
    capabilities: {
      alwaysMatch: {
        browserName: 'safari',
        platformName: 'iOS',
        'safari:deviceUDID': '00008020-001345143C52002E',
        'safari:automaticInspection': true
      }
    }
  });

  if (!sess.body?.value?.sessionId) {
    console.error('Failed:', JSON.stringify(sess.body).slice(0, 500));
    process.exit(1);
  }

  const sid = sess.body.value.sessionId;
  console.log('Session:', sid);

  await new Promise(r => setTimeout(r, 1000));

  // Step 1: verify session with about:blank
  console.log('Step 1: Verifying session with about:blank...');
  try {
    await wd('POST', '/session/' + sid + '/url', { url: 'about:blank' });
    const r1 = await wd('POST', '/session/' + sid + '/execute/sync', { script: 'return document.title', args: [] });
    console.log('about:blank OK, title:', r1.body?.value);
  } catch (e) {
    console.error('about:blank failed:', e.message);
  }

  await new Promise(r => setTimeout(r, 500));

  // Step 2: Load the game
  console.log('Step 2: Loading game at ' + GAME_URL);
  try {
    const nav = await wd('POST', '/session/' + sid + '/url', { url: GAME_URL });
    console.log('Navigation response:', nav.status);
  } catch (e) {
    console.error('Navigation error:', e.message);
  }

  // Step 3: Poll for game state
  let maxFrames = 0;
  let survived = false;
  let lastState = null;

  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const t = (i + 1) + 's';
    try {
      const r = await wd('POST', '/session/' + sid + '/execute/sync', {
        script: [
          'var dp = window.__deviceProfile || {};',
          'var tm = window.__dpMotoTest || {};',
          'var bc = window.__bootCounts || {};',
          'var pg = window.__phaserGame;',
          'return JSON.stringify({',
          '  title: document.title,',
          '  tier: dp.tier || "?",',
          '  label: dp.label || "?",',
          '  bootDone: !!window.__bootComplete,',
          '  bootLoaded: bc.loaded || 0,',
          '  bootFailed: bc.failed || 0,',
          '  bootTotal: bc.total || 0,',
          '  bootElapsed: bc.elapsed || 0,',
          '  gsReady: !!window.__gameSceneReady,',
          '  gsError: window.__gameSceneError || null,',
          '  state: tm.state || "none",',
          '  frames: tm.frameCount || 0,',
          '  vpW: window.innerWidth,',
          '  vpH: window.innerHeight,',
          '  canvasW: pg ? pg.config.width : 0,',
          '  canvasH: pg ? pg.config.height : 0',
          '});'
        ].join('\n'),
        args: []
      });

      if (r.status === 200 && r.body?.value) {
        const state = JSON.parse(r.body.value);
        lastState = state;
        maxFrames = Math.max(maxFrames, state.frames);
        const parts = [
          'tier=' + state.tier,
          'boot=' + (state.bootDone ? state.bootLoaded + '/' + state.bootTotal + ' in ' + state.bootElapsed + 'ms' : 'loading'),
          'gs=' + (state.gsReady ? 'ready' : (state.gsError ? 'ERROR' : 'loading')),
          'frames=' + state.frames,
          'state=' + state.state,
          'canvas=' + state.canvasW + 'x' + state.canvasH,
          'vp=' + state.vpW + 'x' + state.vpH
        ];
        console.log(t + ': ' + parts.join(' | '));
        if (state.frames > 30) survived = true;
      }
    } catch (e) {
      console.error(t + ': DEAD - ' + e.message);
      break;
    }
  }

  try { await wd('DELETE', '/session/' + sid); } catch {}

  console.log('');
  if (survived) {
    console.log('=== PASS — iPhone Xs survived v0.00.67 (' + maxFrames + ' frames) ===');
  } else {
    console.log('=== FAIL — iPhone Xs crashed (max ' + maxFrames + ' frames) ===');
  }
  if (lastState) console.log('Last state:', JSON.stringify(lastState, null, 2));
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
