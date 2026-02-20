import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Env vars (read once at module scope) ────────────────────────────
// .trim() guards against trailing whitespace/newlines/quotes pasted in
// Supabase Dashboard — these are invisible but corrupt auth headers.
const PROJECT_URL = Deno.env.get("PROJECT_URL")?.trim();
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")?.trim();
const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID")?.trim();
const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET")?.trim();
const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY")?.trim();

function assertEnv(): void {
  const missing: string[] = [];
  if (!PROJECT_URL) missing.push("PROJECT_URL");
  if (!SERVICE_ROLE_KEY) missing.push("SERVICE_ROLE_KEY");
  if (!SPOTIFY_CLIENT_ID) missing.push("SPOTIFY_CLIENT_ID");
  if (!SPOTIFY_CLIENT_SECRET) missing.push("SPOTIFY_CLIENT_SECRET");
  if (!YOUTUBE_API_KEY) missing.push("YOUTUBE_API_KEY");
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }
}

// ── Spotify client-credentials token ────────────────────────────────
async function getSpotifyToken(): Promise<{ token: string; debug: Record<string, unknown> }> {
  const clientId = SPOTIFY_CLIENT_ID ?? "";
  const clientSecret = SPOTIFY_CLIENT_SECRET ?? "";
  const credentials = `${clientId}:${clientSecret}`;
  const encoded = btoa(credentials);

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${encoded}`,
    },
    body: "grant_type=client_credentials",
  });

  const debug: Record<string, unknown> = {
    clientIdLength: clientId.length,
    clientSecretLength: clientSecret.length,
    // Detect quotes/whitespace contamination
    clientIdStartsWithQuote: clientId.startsWith('"') || clientId.startsWith("'"),
    clientIdEndsWithQuote: clientId.endsWith('"') || clientId.endsWith("'"),
    tokenEndpointStatus: res.status,
  };

  if (!res.ok) {
    const body = await res.text();
    debug.tokenEndpointBody = body;
    throw new Error(`Spotify token error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const token = (data.access_token as string ?? "").trim();

  debug.tokenLength = token.length;
  debug.tokenPreview = token.length > 18
    ? `${token.substring(0, 12)}...${token.substring(token.length - 6)}`
    : "(too short!)";
  debug.tokenType = data.token_type;
  debug.expiresIn = data.expires_in;

  return { token, debug };
}

// ── Spotify: fetch artist info ──────────────────────────────────────
interface SpotifyArtist {
  id: string;
  name: string;
  images: { url: string }[];
}

async function fetchSpotifyArtist(
  token: string,
  artistId: string,
): Promise<SpotifyArtist> {
  const res = await fetch(
    `https://api.spotify.com/v1/artists/${artistId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Spotify artist ${artistId}: ${res.status}`);
  return res.json();
}

// ── Spotify: fetch ALL tracks for an artist via albums ──────────────
interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms: number;
  external_urls: { spotify: string };
  artists: { id: string; name: string }[];
  album: {
    name: string;
    images: { url: string; width: number }[];
  };
}

/** Album types we want to keep (filter in code instead of via include_groups). */
const WANTED_ALBUM_TYPES = new Set(["album", "single", "compilation"]);

interface SyncError {
  artistId: string;
  step: string;
  status: number;
  body: string;
  url?: string;
}

async function fetchAllArtistTracks(
  token: string,
  artistId: string,
  artistName: string,
): Promise<{ tracks: SpotifyTrack[]; albumIdsCount: number; errors: SyncError[] }> {
  const tracks: SpotifyTrack[] = [];
  const seenIds = new Set<string>();
  const errors: SyncError[] = [];

  // Use /v1/search instead of /v1/artists/{id}/albums — the albums endpoint
  // returns misleading "Invalid limit" errors under client credentials.
  // Search uses `q=artist:{name}&type=album` which avoids the broken endpoint.
  const searchUrl = new URL("https://api.spotify.com/v1/search");
  searchUrl.searchParams.set("q", `artist:${artistName}`);
  searchUrl.searchParams.set("type", "album");
  // Spotify development-mode apps cap limit well below the documented max of 50.
  // limit=10 is proven to work; limit=20 and limit=50 both return 400 "Invalid limit".
  searchUrl.searchParams.set("limit", "10");
  let albumUrl: string | null = searchUrl.toString();

  // Store album metadata from search results (name, images) so we can
  // attach it to tracks later — the /albums/{id}/tracks endpoint only
  // returns simplified track objects without album info.
  interface AlbumMeta { id: string; name: string; images: { url: string; width?: number }[] }
  const albumMetas: AlbumMeta[] = [];
  const seenAlbumIds = new Set<string>();
  while (albumUrl) {
    const res = await fetch(albumUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      errors.push({
        artistId,
        step: "album_search",
        status: res.status,
        body,
        url: albumUrl,
      });
      break;
    }
    const data = await res.json();
    const items = data.albums?.items ?? [];
    for (const a of items) {
      // Filter: correct album type + artist must match (search can return others)
      if (!WANTED_ALBUM_TYPES.has(a.album_type)) continue;
      const isArtistMatch = (a.artists ?? []).some(
        (ar: { id: string }) => ar.id === artistId,
      );
      if (!isArtistMatch) continue;
      if (seenAlbumIds.has(a.id)) continue;
      seenAlbumIds.add(a.id);
      albumMetas.push({ id: a.id, name: a.name, images: a.images ?? [] });
    }
    // Paginate via data.albums.next (search nests under .albums)
    albumUrl = data.albums?.next ?? null;
  }

  // Fetch tracks per album individually via /v1/albums/{id}/tracks.
  // The batch /v1/albums?ids=... endpoint returns 403 in dev-mode apps.
  // Use limit=10 (dev-mode safe) and paginate within each album.
  for (const albumMeta of albumMetas) {
    let tracksUrl: string | null =
      `https://api.spotify.com/v1/albums/${albumMeta.id}/tracks?limit=10`;
    while (tracksUrl) {
      const res = await fetch(tracksUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.text();
        errors.push({
          artistId,
          step: "album_tracks_fetch",
          status: res.status,
          body,
          url: tracksUrl,
        });
        break;
      }
      const data = await res.json();
      for (const t of data.items ?? []) {
        if (seenIds.has(t.id)) continue;
        seenIds.add(t.id);
        tracks.push({
          ...t,
          album: {
            name: albumMeta.name,
            images: albumMeta.images,
          },
        });
      }
      tracksUrl = data.next ?? null;
    }
  }
  const albumIds = albumMetas.map((m) => m.id);

  // Fallback: if no albums found, try top-tracks endpoint
  if (albumIds.length === 0) {
    const res = await fetch(
      `https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      const data = await res.json();
      for (const t of data.tracks ?? []) {
        if (seenIds.has(t.id)) continue;
        seenIds.add(t.id);
        tracks.push({
          id: t.id,
          name: t.name,
          duration_ms: t.duration_ms,
          external_urls: t.external_urls,
          artists: t.artists,
          album: {
            name: t.album?.name ?? "",
            images: t.album?.images ?? [],
          },
        });
      }
    }
  }

  return { tracks, albumIdsCount: albumIds.length, errors };
}

// ── YouTube search + scoring ────────────────────────────────────────
interface YTSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: { high?: { url: string } };
  };
}

/** Strip punctuation and normalise for fuzzy comparison. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/** Check if a string contains all significant words from another. */
function containsWords(haystack: string, needle: string): boolean {
  const h = norm(haystack);
  const words = norm(needle).split(" ").filter((w) => w.length > 2);
  if (words.length === 0) return true;
  return words.every((w) => h.includes(w));
}

const NEGATIVE_KEYWORDS = ["live", "cover", "remix", "acoustic", "karaoke", "instrumental"];

function scoreYTResult(
  item: YTSearchItem,
  trackName: string,
  artistName: string,
): number {
  const title = item.snippet.title;
  const channel = item.snippet.channelTitle;
  const tNorm = norm(title);
  const trackNorm = norm(trackName);
  let score = 0;

  // Must roughly contain the track name
  if (!containsWords(title, trackName)) return -1;

  // Artist name in video title or channel
  if (containsWords(title, artistName)) score += 30;
  if (containsWords(channel, artistName)) score += 20;

  // Official keywords
  if (/official/i.test(title)) score += 15;
  if (/music video/i.test(title)) score += 10;
  if (/official audio/i.test(title)) score += 10;
  if (/visualizer/i.test(title)) score += 5;

  // Penalise negative keywords UNLESS the Spotify track name has them
  for (const kw of NEGATIVE_KEYWORDS) {
    if (tNorm.includes(kw) && !trackNorm.includes(kw)) {
      score -= 25;
    }
  }

  // Shorter titles are usually more on-topic
  if (title.length < 80) score += 5;

  return score;
}

async function searchYouTube(
  query: string,
  maxResults = 5,
): Promise<YTSearchItem[]> {
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    videoCategoryId: "10", // Music category
    maxResults: String(maxResults),
    key: YOUTUBE_API_KEY!,
  });
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params}`,
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube search error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return (data.items ?? []) as YTSearchItem[];
}

function pickBestYTMatch(
  items: YTSearchItem[],
  trackName: string,
  artistName: string,
): YTSearchItem | null {
  let best: YTSearchItem | null = null;
  let bestScore = -1;
  for (const item of items) {
    const s = scoreYTResult(item, trackName, artistName);
    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  }
  return best;
}

// ── Spotify: batch-fetch full track objects for popularity ────────────
const POPULARITY_BATCH_SIZE = 10; // dev-mode safe

async function fetchTrackPopularities(
  token: string,
  trackIds: string[],
): Promise<{ popularityMap: Map<string, number>; errors: SyncError[] }> {
  const popularityMap = new Map<string, number>();
  const errors: SyncError[] = [];

  for (let i = 0; i < trackIds.length; i += POPULARITY_BATCH_SIZE) {
    const batch = trackIds.slice(i, i + POPULARITY_BATCH_SIZE);
    const url = `https://api.spotify.com/v1/tracks?ids=${batch.join(",")}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      // If batch fails (403 in dev mode), fall back to individual fetches
      if (res.status === 403) {
        for (const id of batch) {
          try {
            const singleRes = await fetch(
              `https://api.spotify.com/v1/tracks/${id}`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (singleRes.ok) {
              const t = await singleRes.json();
              popularityMap.set(id, t.popularity ?? 0);
            }
          } catch {
            // skip individual failures
          }
        }
      } else {
        errors.push({
          artistId: "batch",
          step: "popularity_batch",
          status: res.status,
          body: body.substring(0, 200),
          url,
        });
      }
      continue;
    }
    const data = await res.json();
    for (const t of data.tracks ?? []) {
      if (t && t.id) {
        popularityMap.set(t.id, t.popularity ?? 0);
      }
    }
  }

  return { popularityMap, errors };
}

// ── Main handler ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  try {
    assertEnv();

    // Parse body
    let dryRun = true;
    let debug = false;
    let artistIds: string[] = [];
    try {
      const body = await req.json();
      if (typeof body.dryRun === "boolean") dryRun = body.dryRun;
      if (typeof body.debug === "boolean") debug = body.debug;
      if (Array.isArray(body.artist_ids)) artistIds = body.artist_ids;
    } catch {
      // empty body is fine
    }

    if (artistIds.length === 0) {
      return json({ ok: false, error: "Provide artist_ids: string[]" }, 400);
    }

    const db = createClient(PROJECT_URL!, SERVICE_ROLE_KEY!);
    const { token: spotifyToken, debug: tokenDebug } = await getSpotifyToken();

    // ── Diagnostic probes (only when debug=true) ──────────────────────
    let diagnostics: Record<string, unknown> | undefined;
    if (debug) {
      const authHeader = `Bearer ${spotifyToken}`;

      // ── Probe A: hardcoded URL, no URL API at all ──
      // This is the control. If this fails, the token/auth is the problem.
      const hardcodedUrl = "https://api.spotify.com/v1/search?q=artist%3ADrake&type=album&limit=10";
      const probeA = await fetch(hardcodedUrl, {
        headers: { Authorization: authHeader },
      });
      const probeABody = await probeA.text();

      // ── Probe B: same query built via URLSearchParams ──
      // If A works but B fails, URLSearchParams encoding is the problem.
      const bUrl = new URL("https://api.spotify.com/v1/search");
      bUrl.searchParams.set("q", "artist:Drake");
      bUrl.searchParams.set("type", "album");
      bUrl.searchParams.set("limit", "10");
      const probeBUrl = bUrl.toString();
      const probeB = await fetch(probeBUrl, {
        headers: { Authorization: authHeader },
      });
      const probeBBody = await probeB.text();

      // ── Probe C: /artists/{id} (known working endpoint) ──
      const probeId = artistIds.length > 0 ? artistIds[0] : "5uzPIJDzWAujemRDKiJMRj";
      const probeCUrl = `https://api.spotify.com/v1/artists/${probeId}`;
      const probeC = await fetch(probeCUrl, {
        headers: { Authorization: authHeader },
      });
      const probeCBody = await probeC.text();

      // ── Probe D: /artists/{id}/albums (the broken endpoint) ──
      const probeDUrl = `https://api.spotify.com/v1/artists/${probeId}/albums?limit=50`;
      const probeD = await fetch(probeDUrl, {
        headers: { Authorization: authHeader },
      });
      const probeDBody = await probeD.text();

      // ── Header & credential diagnostics ──
      const tokenTrimmed = spotifyToken.trim();
      const hasHiddenChars = spotifyToken !== tokenTrimmed;
      const hasNewline = spotifyToken.includes("\n") || spotifyToken.includes("\r");

      diagnostics = {
        credentials: {
          clientIdLength: (SPOTIFY_CLIENT_ID ?? "").length,
          clientSecretLength: (SPOTIFY_CLIENT_SECRET ?? "").length,
          clientIdHasWhitespace: (SPOTIFY_CLIENT_ID ?? "") !== (SPOTIFY_CLIENT_ID ?? "").trim(),
          clientSecretHasWhitespace: (SPOTIFY_CLIENT_SECRET ?? "") !== (SPOTIFY_CLIENT_SECRET ?? "").trim(),
          clientIdStartsWithQuote: /^["']/.test(SPOTIFY_CLIENT_ID ?? ""),
          clientIdEndsWithQuote: /["']$/.test(SPOTIFY_CLIENT_ID ?? ""),
          clientSecretStartsWithQuote: /^["']/.test(SPOTIFY_CLIENT_SECRET ?? ""),
          clientSecretEndsWithQuote: /["']$/.test(SPOTIFY_CLIENT_SECRET ?? ""),
        },
        token: {
          ...tokenDebug,
          hasHiddenChars,
          hasNewline,
          authHeaderLength: authHeader.length,
          authHeaderPreview: `Bearer ${spotifyToken.substring(0, 8)}...${spotifyToken.substring(spotifyToken.length - 8)}`,
        },
        probeA_hardcoded: {
          url: hardcodedUrl,
          status: probeA.status,
          body: probeABody.substring(0, 300),
          verdict: probeA.ok ? "TOKEN WORKS" : "TOKEN BROKEN",
        },
        probeB_urlSearchParams: {
          url: probeBUrl,
          urlMatchesHardcoded: probeBUrl === hardcodedUrl,
          status: probeB.status,
          body: probeBBody.substring(0, 300),
          verdict: probeB.ok
            ? "URLSearchParams OK"
            : probeA.ok
              ? "URLSearchParams ENCODING BUG"
              : "same failure as A (token issue)",
        },
        probeC_artist: {
          url: probeCUrl,
          status: probeC.status,
          body: probeCBody.substring(0, 300),
        },
        probeD_albums: {
          url: probeDUrl,
          status: probeD.status,
          body: probeDBody.substring(0, 300),
          verdict: probeD.ok
            ? "ALBUMS ENDPOINT WORKS"
            : probeA.ok
              ? "ALBUMS ENDPOINT BROKEN (search works)"
              : "same failure as A (token issue)",
        },
      };
    }

    // ── Step 1: Sync Spotify catalog ────────────────────────────────
    let tracksUpserted = 0;
    let artistsProcessed = 0;
    let albumIdsCount = 0;
    let tracksFetched = 0;
    const syncErrors: SyncError[] = [];
    const allTrackIds: string[] = [];  // collect for popularity fetch

    for (const artistId of artistIds) {
      // Upsert artist
      let artist: SpotifyArtist;
      try {
        artist = await fetchSpotifyArtist(spotifyToken, artistId);
      } catch (err) {
        syncErrors.push({
          artistId,
          step: "artist_fetch",
          status: 0,
          body: (err as Error).message,
        });
        continue; // skip this artist, don't crash the batch
      }
      artistsProcessed++;
      if (!dryRun) {
        await db.from("music_artists").upsert(
          {
            spotify_artist_id: artist.id,
            name: artist.name,
            image_url: artist.images?.[0]?.url ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "spotify_artist_id" },
        );
      }

      // Fetch all tracks and upsert
      const result = await fetchAllArtistTracks(spotifyToken, artistId, artist.name);
      syncErrors.push(...result.errors);
      albumIdsCount += result.albumIdsCount;
      tracksFetched += result.tracks.length;
      for (const t of result.tracks) {
        const bestImage = t.album.images?.sort(
          (a: { width?: number }, b: { width?: number }) =>
            (b.width ?? 0) - (a.width ?? 0),
        )[0];
        if (!dryRun) {
          await db.from("music_tracks").upsert(
            {
              spotify_track_id: t.id,
              title: t.name,
              artist_name: t.artists.map((a) => a.name).join(", "),
              album_name: t.album.name,
              album_image_url: bestImage?.url ?? null,
              duration_ms: t.duration_ms,
              spotify_url: t.external_urls?.spotify ?? null,
              spotify_artist_id: artistId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "spotify_track_id" },
          );
        }
        allTrackIds.push(t.id);
        tracksUpserted++;
      }
    }

    // ── Step 2: YouTube matching ────────────────────────────────────
    // Fetch tracks needing a YouTube match
    const { data: unmatchedRows, error: fetchErr } = await db
      .from("music_tracks")
      .select("spotify_track_id, title, artist_name, youtube_is_manual")
      .or("youtube_video_id.is.null,youtube_video_id.eq.")
      .order("title");

    if (fetchErr) {
      return json({
        ok: false,
        error: `DB fetch error: ${fetchErr.message}`,
        spotify: { artistsProcessed, albumIdsCount, tracksFetched, tracksUpserted, dryRun },
      }, 500);
    }

    const needMatch = (unmatchedRows ?? []).filter(
      (r: any) => !r.youtube_is_manual,
    );
    const skippedManual = (unmatchedRows ?? []).length - needMatch.length;

    let matched = 0;
    const failedNames: string[] = [];

    for (const row of needMatch) {
      const query = `${row.artist_name} ${row.title} official`;
      try {
        const results = await searchYouTube(query, 5);
        const best = pickBestYTMatch(results, row.title, row.artist_name);

        if (best) {
          const videoId = best.id.videoId;
          if (!dryRun) {
            await db
              .from("music_tracks")
              .update({
                youtube_video_id: videoId,
                youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
                youtube_thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                youtube_title: best.snippet.title,
                youtube_channel_title: best.snippet.channelTitle,
                youtube_matched_at: new Date().toISOString(),
              })
              .eq("spotify_track_id", row.spotify_track_id);
          }
          matched++;
        } else {
          if (failedNames.length < 10) failedNames.push(row.title);
        }
      } catch (err) {
        if (failedNames.length < 10) {
          failedNames.push(`${row.title} (${(err as Error).message})`);
        }
      }
    }

    // ── Step 3: Popularity scores ───────────────────────────────────
    let popularityUpdated = 0;
    if (!dryRun && allTrackIds.length > 0) {
      const { popularityMap, errors: popErrors } = await fetchTrackPopularities(
        spotifyToken,
        allTrackIds,
      );
      syncErrors.push(...popErrors);

      for (const [trackId, popularity] of popularityMap) {
        const { error: upErr } = await db
          .from("music_tracks")
          .update({ popularity })
          .eq("spotify_track_id", trackId);
        if (!upErr) popularityUpdated++;
      }
    }

    return json({
      ok: syncErrors.length === 0,
      dryRun,
      spotify: { artistsProcessed, albumIdsCount, tracksFetched, tracksUpserted },
      errors: syncErrors.length > 0 ? syncErrors : undefined,
      youtube: {
        needingMatch: needMatch.length,
        matched,
        skippedManual,
        failedNames,
      },
      popularity: {
        tracksChecked: allTrackIds.length,
        updated: popularityUpdated,
      },
      diagnostics,
    });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});

// ── Helpers ─────────────────────────────────────────────────────────
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
