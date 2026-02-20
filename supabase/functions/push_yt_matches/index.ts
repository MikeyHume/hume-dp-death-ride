// Temporary edge function to push manual YouTube video matches
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("PROJECT_URL")?.trim();
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")?.trim();

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("POST only", { status: 405 });
  }

  if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
    return new Response("Missing env vars", { status: 500 });
  }

  const db = createClient(PROJECT_URL, SERVICE_ROLE_KEY);
  const updates: Array<{
    id: string;
    youtube_video_id: string;
    youtube_url: string;
    youtube_thumbnail_url: string;
    youtube_title: string;
    youtube_is_manual: boolean;
  }> = await req.json();

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const u of updates) {
    const { error } = await db
      .from("music_tracks")
      .update({
        youtube_video_id: u.youtube_video_id,
        youtube_url: u.youtube_url,
        youtube_thumbnail_url: u.youtube_thumbnail_url,
        youtube_title: u.youtube_title,
        youtube_is_manual: u.youtube_is_manual,
        youtube_matched_at: new Date().toISOString(),
      })
      .eq("id", u.id);

    if (error) {
      failed++;
      errors.push(`${u.id}: ${error.message}`);
    } else {
      success++;
    }
  }

  return new Response(
    JSON.stringify({ success, failed, total: updates.length, errors }),
    { headers: { "Content-Type": "application/json" } }
  );
});
