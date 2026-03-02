// Quick script to read and format perf telemetry from Vite dev server
const http = require('http');

http.get('http://localhost:8081/perf-tele', (res) => {
  let buf = '';
  res.on('data', c => buf += c);
  res.on('end', () => {
    const d = JSON.parse(buf);
    const real = d.filter(x => x.fps > 0);
    console.log('Snapshots:', real.length);
    console.log('');

    // Group by device
    const devices = {};
    for (const s of real) {
      const key = s.device || '?';
      if (!(key in devices)) devices[key] = [];
      devices[key].push(s);
    }

    for (const [dev, snaps] of Object.entries(devices)) {
      const fpsList = snaps.map(s => s.fps);
      const min = Math.min(...fpsList);
      const max = Math.max(...fpsList);
      const avg = fpsList.reduce((a, b) => a + b, 0) / fpsList.length;
      const states = [...new Set(snaps.map(s => s.game_state))];
      console.log(dev);
      console.log('  FPS: min=' + min + ' avg=' + avg.toFixed(1) + ' max=' + max);
      console.log('  States seen:', states.join(', '));
      console.log('  Snapshots:', snaps.length);
      console.log('  Version:', snaps[snaps.length - 1].version);
      console.log('  Tier:', snaps[0].tier);
      console.log('');
    }

    console.log('--- Last 10 ---');
    for (const s of real.slice(-10)) {
      const dev = (s.device || '?').padEnd(25);
      const st = (s.game_state || '?').padEnd(12);
      const fps = ('fps=' + s.fps).padEnd(10);
      const avg = ('avg=' + s.fps_avg).padEnd(10);
      console.log(dev, st, fps, avg, 'v=' + s.version);
    }
  });
});
