// Extract video IDs, titles, and durations from YouTube channel/playlist HTML
import { readFileSync } from 'fs';

const files = [
  'yt_angelbaby.html',
  'yt_deathpixie.html',
  'yt_deathpixie_pl.html',
  'yt_pro6lema.html',
  'yt_kaiwav.html',
];

const allVids = [];
const seen = new Set();

for (const file of files) {
  const html = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
  const dataMatch = html.match(/var ytInitialData = ({.*?});<\/script>/s);
  if (!dataMatch) { console.error(`No ytInitialData in ${file}`); continue; }

  const data = JSON.parse(dataMatch[1]);

  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;

    const renderers = ['videoRenderer', 'gridVideoRenderer', 'playlistVideoRenderer'];
    for (const rKey of renderers) {
      if (obj[rKey]) {
        const r = obj[rKey];
        const id = r.videoId;
        const title = r.title?.runs?.[0]?.text || r.title?.simpleText || '???';
        // Duration in "simpleText" format like "2:30" or "21:34"
        const durSimple = r.lengthText?.simpleText || r.thumbnailOverlays
          ?.find(o => o.thumbnailOverlayTimeStatusRenderer)
          ?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText || '';
        // Also check accessibility label like "2 minutes, 30 seconds"
        const durLabel = r.lengthText?.accessibility?.accessibilityData?.label || '';

        let durationMs = 0;
        if (durSimple) {
          const parts = durSimple.split(':').map(Number);
          if (parts.length === 2) durationMs = (parts[0] * 60 + parts[1]) * 1000;
          else if (parts.length === 3) durationMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
        }

        if (!seen.has(id)) {
          seen.add(id);
          allVids.push({ id, title, durationMs, durSimple, source: file });
        }
        return;
      }
    }
    if (obj.richItemRenderer?.content) { walk(obj.richItemRenderer.content); return; }
    if (Array.isArray(obj)) { for (const item of obj) walk(item); }
    else { for (const key of Object.keys(obj)) walk(obj[key]); }
  }

  walk(data);
}

console.log(JSON.stringify(allVids, null, 2));
console.error(`Total: ${allVids.length} unique videos with durations`);
