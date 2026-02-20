const https = require('https');

const CLIENT_ID = 'e20013b88ebc46018a93ab9c0489edd8';
const CLIENT_SECRET = 'c875811cee0d436c9df8e9b5e752984d';

const ARTISTS = {
  'angelbaby': '6g4ZsQkAV0t8qDAYlB5QGr',
  'kai.wav': '5IPEenyFaDk0FQkFbKG0dU',
  'lofi gma': '4LgILYbU9dlASWbKjk4JE3',
  'Pro6lema': '5bKEBKgPviDlk2xkZeTTBA',
  'twenty16': '13sZjhnPfCPkuD6HQT9XUN',
};

function post(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function get(url, token) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Authorization: 'Bearer ' + token } }, res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function getToken() {
  const body = `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`;
  const r = await post('https://accounts.spotify.com/api/token', body);
  return r.access_token;
}

async function getAllAlbums(token, artistId) {
  const albums = [];
  let offset = 0;
  while (true) {
    const r = await get(`https://api.spotify.com/v1/artists/${artistId}/albums?limit=10&offset=${offset}&include_groups=single,album`, token);
    if (r.error) { console.log('  ERROR:', r.error.message); return albums; }
    albums.push(...r.items);
    if (!r.next) break;
    offset += 10;
  }
  return albums;
}

async function getAlbumTracks(token, albumId) {
  const r = await get(`https://api.spotify.com/v1/albums/${albumId}/tracks?limit=10`, token);
  if (r.error) { console.log('  ERROR getting tracks for', albumId, ':', r.error.message); return []; }
  return r.items || [];
}

async function main() {
  const token = await getToken();
  console.log('Token OK');

  for (const [name, id] of Object.entries(ARTISTS)) {
    console.log(`\n=== ${name} (${id}) ===`);
    const albums = await getAllAlbums(token, id);
    console.log(`Albums/Singles: ${albums.length}`);

    const allTracks = [];
    for (const album of albums) {
      const tracks = await getAlbumTracks(token, album.id);
      for (const t of tracks) {
        allTracks.push({
          id: t.id,
          name: t.name,
          album: album.name,
          duration_ms: t.duration_ms,
          artists: t.artists.map(a => a.name).join(', '),
        });
      }
    }

    console.log(`Total tracks: ${allTracks.length}`);
    allTracks.forEach(t => {
      console.log(`  ${t.id} | ${t.name} | ${t.album} | ${t.artists} | ${t.duration_ms}ms`);
    });
  }
}

main().catch(e => console.error(e));
