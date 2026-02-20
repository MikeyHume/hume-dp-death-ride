// Extract video IDs and titles from YouTube channel/playlist HTML
import { readFileSync } from 'fs';

const file = process.argv[2];
if (!file) { console.error('Usage: node extract_yt.mjs <html_file>'); process.exit(1); }

const html = readFileSync(file, 'utf8');

// YouTube embeds video data as JSON in ytInitialData
const dataMatch = html.match(/var ytInitialData = ({.*?});<\/script>/s);
if (!dataMatch) {
  // Fallback: try to extract videoId + title pairs from raw HTML
  const re = /"videoId":"([A-Za-z0-9_-]{11})"/g;
  const titleRe = /"title":\{"runs":\[\{"text":"([^"]+)"\}\]/g;
  let m;
  const ids = [];
  while ((m = re.exec(html)) !== null) ids.push(m[1]);
  console.error(`Fallback: found ${[...new Set(ids)].length} unique video IDs`);
  for (const id of [...new Set(ids)]) console.log(id + ' | ???');
  process.exit(0);
}

try {
  const data = JSON.parse(dataMatch[1]);
  const vids = [];

  // Recurse through the JSON to find all videoRenderer objects
  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.videoRenderer) {
      const vr = obj.videoRenderer;
      const id = vr.videoId;
      const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || '???';
      vids.push({ id, title });
      return;
    }
    if (obj.gridVideoRenderer) {
      const gvr = obj.gridVideoRenderer;
      const id = gvr.videoId;
      const title = gvr.title?.runs?.[0]?.text || gvr.title?.simpleText || '???';
      vids.push({ id, title });
      return;
    }
    if (obj.playlistVideoRenderer) {
      const pvr = obj.playlistVideoRenderer;
      const id = pvr.videoId;
      const title = pvr.title?.runs?.[0]?.text || pvr.title?.simpleText || '???';
      vids.push({ id, title });
      return;
    }
    if (obj.richItemRenderer?.content) {
      walk(obj.richItemRenderer.content);
      return;
    }
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
    } else {
      for (const key of Object.keys(obj)) walk(obj[key]);
    }
  }

  walk(data);

  const seen = new Set();
  for (const v of vids) {
    if (!seen.has(v.id)) {
      seen.add(v.id);
      console.log(`${v.id} | ${v.title}`);
    }
  }
  console.error(`Found ${seen.size} videos`);
} catch (e) {
  console.error('JSON parse error:', e.message);
}
