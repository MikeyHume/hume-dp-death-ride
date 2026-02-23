/**
 * Hume music manifest — all self-hosted tracks available in Supabase Storage.
 * Audio files live in the "music" bucket under Rythem_Songs/.
 * Used by HumePlayerSystem for TOS-compliant local audio playback.
 */

const SUPABASE_STORAGE_BASE = 'https://wdaljqcoyhselitaxaeu.supabase.co/storage/v1/object/public/music/Rythem_Songs';

export interface HumeTrack {
  /** Display name (e.g. "DEATHPIXIE - HELL GIRL") */
  name: string;
  /** Filename (e.g. "DEATHPIXIE - HELL GIRL.mp3") */
  file: string;
  /** Parsed artist from filename */
  artist: string;
  /** Parsed title from filename */
  title: string;
  /** Full Supabase Storage public URL */
  url: string;
}

/** All filenames in the bucket (uploaded via scripts/upload_music_to_supabase.cjs). */
const FILES: string[] = [
  'ANGELBABY - AM I JUST HIGH.mp3',
  'ANGELBABY - COCA COLA.mp3',
  'ANGELBABY - DIE4YOU.mp3',
  'ANGELBABY - ENDLESS SUMMER.mp3',
  'ANGELBABY - FEEL GOOD INC.mp3',
  'ANGELBABY - GRINCH ON CHRISTMAS.mp3',
  'ANGELBABY - I BROKE TIME.mp3',
  'ANGELBABY - NEW LOCATION.mp3',
  'ANGELBABY - NOTHING REALLY MATTERS.mp3',
  'ANGELBABY - SURRENDER.mp3',
  'ANGELBABY - UNSEEN.mp3',
  'ANGELBABY - WALKING DEAD.mp3',
  'ANGELBABY - WAYSIDE.mp3',
  'ANGELBABY - WHAT HAPPENS WHEN WE DIE.mp3',
  'ANGELBABY x ARRESTED YOUTH - FACEDOWN.mp3',
  'ANGELBABY x BLVCK SVM - LIVE FOREVER.mp3',
  'ANGELBABY x BRANDYN BURNETTE - MINTED.mp3',
  'ANGELBABY x BRYCE VINE - GOD MADE ME LIKE THIS.mp3',
  'ANGELBABY x GINO THE GHOST - THE OTHERSIDE.mp3',
  'ANGELBABY x GRIMESAI - IM FINE.mp3',
  'ANGELBABY x JAGWAR TWIN - LIFE IS GOOD.mp3',
  'ANGELBABY x JFARRARI - WAKE UP FUCKED UP.mp3',
  'ANGELBABY x MADALEN DUKE - CUT THE LIGHTS.mp3',
  'ANGELBABY x PORCHLIGHT - SO DUMB.mp3',
  'ANGELBABY x PRETTYMUCH - BEFORE YOU.mp3',
  'ANGELBABY x PRETTYMUCH x NIGHT TALES - BEFORE YOU REMIX.mp3',
  'ANGELBABY x PRETTYMUCH x OLIVER NELSON - BEFORE YOU REMIX.mp3',
  'ANGELBABY x RUDYWADE - DARK MODE.mp3',
  'ANGELBABY x STOLAR - VIEW FROM THE MOON.mp3',
  'ANGELBABY x TK - BLACK HOLE.mp3',
  'ANGELBABY x VOILA - IMPOSTER.mp3',
  'DEATHPIXIE - 44.mp3',
  'DEATHPIXIE - ATE.mp3',
  'DEATHPIXIE - BLOOD BEAT.mp3',
  'DEATHPIXIE - DEATH MACHINE.mp3',
  'DEATHPIXIE - DEATHPIXIES PROLOGUE.mp3',
  'DEATHPIXIE - DOMINATRIX.mp3',
  'DEATHPIXIE - GAS ON FIRE.mp3',
  'DEATHPIXIE - HELL GIRL.mp3',
  'DEATHPIXIE - HENTAI.mp3',
  'DEATHPIXIE - KAWASAKI.mp3',
  'DEATHPIXIE - KILLAMONSTA.mp3',
  'DEATHPIXIE - LIL BITCH.mp3',
  'DEATHPIXIE - MAIN CHARACTER ENERGY.mp3',
  'DEATHPIXIE - MATAR 9 KTB.mp3',
  'DEATHPIXIE - MERRY DEATHMAS.mp3',
  'DEATHPIXIE - MONSTER IN MY BED.mp3',
  'DEATHPIXIE - MORE COWBELL.mp3',
  'DEATHPIXIE - NOSFERATU.mp3',
  'DEATHPIXIE - OKINAWA.mp3',
  'DEATHPIXIE - RED MALIBU.mp3',
  'DEATHPIXIE - SAFE WORD.mp3',
  'DEATHPIXIE - SLIP.mp3',
  'DEATHPIXIE - TOKYO BLOOD.mp3',
  'DEATHPIXIE - WALKING NIGHTMARE.mp3',
  'DEATHPIXIE x CISZAK - FEED MY APPETITE.mp3',
  'DEATHPIXIE x CYPARISS - NIGHTMARECORE.mp3',
  'DEATHPIXIE x DEADMAU5 - RAISE YOUR WEAPON.mp3',
  'DEATHPIXIE x LEXY PANTERRA - SAFE WORD DEATHMIX.mp3',
  'DEATHPIXIE x MERYLL - DIE AND LIVE AGAIN.mp3',
  'DEATHPIXIE x ODDKIDOUT - HELL GIRL II.mp3',
  'DEATHPIXIE x PRO6LEMA - GRIM REAPER.mp3',
  'DEATHPIXIE x RAIZHELL - NEW BLOOD.mp3',
  'DEATHPIXIE x REZADEAD - BRAIN ROT.mp3',
  'DEATHPIXIE x REZADEAD - DIGITAL KILL SHIT.mp3',
  'DEATHPIXIE x SKYLAR GREY - LET YOU LIE.mp3',
  'DEATHPIXIE x T78 - WELCOME TO THE FREAKSHOW.mp3',
  'DEATHPIXIE x WHIPPED CREAM - PHONK TECHNO.mp3',
  'ISOLATE.EXE x DEATHPIXIE - BLIND.mp3',
  'KAI.WAV - BETTER WHEN ITS YOU.mp3',
  'KAI.WAV - FUNKTION.mp3',
  'KAI.WAV - LOVE IN THE MUSIC.mp3',
  'KAI.WAV - SET ME FREE.mp3',
  'KAI.WAV - THATS A VIBE.mp3',
  'KAI.WAV - TOP FLOOR.mp3',
  'KAI.WAV - UNO DOS TRES.mp3',
  'KAI.WAV x ALOE BLACC - I NEED A DOLLAR.mp3',
  'KAI.WAV x ALOE BLACC x TIAGO RIBEIRO - I NEED A DOLLAR REMIX.mp3',
  'LOFI GMA - BONSAI.mp3',
  'LOFI GMA - CHERRY TREE.mp3',
  'LOFI GMA - GARDEN DREAMS.mp3',
  'LOFI GMA - GENTLE NIGHT.mp3',
  'LOFI GMA - GREEN TEA.mp3',
  'LOFI GMA - QUIET HOUR.mp3',
  'LOFI GMA - RAINY WINDOW.mp3',
  'LOFI GMA - RAMEN.mp3',
  'LOFI GMA - SHUMAI.mp3',
  'LOFI GMA - SOUP DUMPLINGS.mp3',
  'LOFI GMA - TEA LEAVES.mp3',
  'PRO6LEMA - BICUDA PHONK.mp3',
  'PRO6LEMA - BREJA BREJA.mp3',
  'PRO6LEMA - CORTURA.mp3',
  'PRO6LEMA - FEITICO 99.mp3',
  'PRO6LEMA - HIPNOTICA.mp3',
  'PRO6LEMA - HOJE EM DIA E DIFICIL ENCONTRAR.mp3',
  'PRO6LEMA - ITALY.mp3',
  'PRO6LEMA - MINION BRAIN ROT.mp3',
  'PRO6LEMA - QUE PERIGX.mp3',
  'PRO6LEMA - QUE YONA.mp3',
  'PRO6LEMA - TRANCEMELODIA.mp3',
  'PRO6LEMA - VIDA.mp3',
  'PRO6LEMA x CHILX x RUBIKDICE - GENESIS.mp3',
  'PRO6LEMA x DEATHPIXIE - MENINA.mp3',
  'PRO6LEMA x HXDES - ALL EYES ON RANI.mp3',
  'PRO6LEMA x NASHI x ANKXRA - VAPO NO SETOR.mp3',
  'TWENTY16 - STRANGER.mp3',
];

/** Parse "ARTIST - TITLE.mp3" or "ARTIST x FEAT - TITLE.mp3" into artist + title. */
function parseFilename(file: string): { artist: string; title: string } {
  const base = file.replace('.mp3', '');
  const dashIdx = base.lastIndexOf(' - ');
  if (dashIdx === -1) return { artist: '', title: base };
  return {
    artist: base.substring(0, dashIdx),
    title: base.substring(dashIdx + 3),
  };
}

/** Build a Supabase Storage public URL for a filename. */
function buildUrl(file: string): string {
  return `${SUPABASE_STORAGE_BASE}/${encodeURIComponent(file)}`;
}

/** All hume tracks, parsed and ready. */
export const HUME_TRACKS: HumeTrack[] = FILES.map(file => {
  const { artist, title } = parseFilename(file);
  return {
    name: file.replace('.mp3', ''),
    file,
    artist,
    title,
    url: buildUrl(file),
  };
});

/** Quick lookup: does a filename exist in the hume catalog? */
export const HUME_FILE_SET: Set<string> = new Set(FILES);

/** Total track count. */
export const HUME_TRACK_COUNT = FILES.length;
