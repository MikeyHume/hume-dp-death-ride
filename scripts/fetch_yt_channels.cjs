const https = require('https');
const YT_KEY = 'AIzaSyASulXrMXNOvseby4KxiGMZvPZNyy-8bS4';

const CHANNELS = {
  'angelbaby': 'UUF9KQkpz41QCKW4vK9Hp2qQ',
  'kai.wav': 'UUHpg9UkjVo4O_1CN8LFmpVA',
  'lofi gma': 'UUMIt0uJnP4yZm56S9mgz2qw',
  'Pro6lema': 'UUWpiU-rppVkJtiZ1n2L1d5g',
  'twenty16': 'UUAZCSR0k5j-C7RoM3mOwOng',
};

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function getAllVideos(playlistId) {
  const videos = [];
  let pageToken = '';
  while (true) {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${YT_KEY}${pageToken ? '&pageToken=' + pageToken : ''}`;
    const r = await get(url);
    if (r.error) { console.log('  ERROR:', r.error.message); break; }
    for (const item of (r.items || [])) {
      videos.push({
        id: item.snippet.resourceId.videoId,
        title: item.snippet.title,
      });
    }
    if (!r.nextPageToken) break;
    pageToken = r.nextPageToken;
  }
  return videos;
}

async function main() {
  for (const [name, playlistId] of Object.entries(CHANNELS)) {
    console.log(`\n=== ${name} ===`);
    const videos = await getAllVideos(playlistId);
    console.log(`Total videos: ${videos.length}`);
    videos.forEach(v => console.log(`  ${v.id} | ${v.title}`));
  }
}

main().catch(e => console.error(e));
