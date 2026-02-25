export const CRT_TUNING = {
  // ── Scanlines ──
  scanlineIntensity: 0.08,     // strength of scanline darkening (0 = off, 1 = fully dark lines) — secondary to mask
  scanlineDensity: 540,        // number of scanlines across screen height (540 = one per 2px at 1080p)
  scanlineRollSpeed: 0,      // slow vertical rolling bright band speed (0 = disabled)

  // ── Phosphor / Mask ──  (PRIMARY aesthetic — strong RGB stripe look)
  maskStrength: 0.69,          // RGB channel separation depth (0 = off, 1 = only active channel lit)
  maskScale: 6.0,              // phosphorPitch — pixels per RGB triad (6 = 2px per subpixel at 1080p)
  maskGap: 0.25,               // grilleGap / blackLevel — dark gap width between phosphor stripes (0 = no gap, 1 = all gap)
  maskType: 'aperture_grille' as 'aperture_grille' | 'shadow_mask' | 'slot_mask',

  // ── Beam / Focus ──
  beamFocus: 1.2,              // focusSoftness — horizontal blur radius in pixels before mask (simulates beam spread)
  convergenceError: 0.5,       // constant horizontal RGB misalignment in pixels (gun convergence)

  // ── Bloom / Glow ──
  bloomStrength: 1,          // glow amount on bright areas (0 = off) — helps phosphors bleed into gaps
  bloomRadius: 5.0,            // blur radius in pixels for bloom sampling
  bloomThreshold: 0.25,        // brightness threshold where bloom begins (0–1) — lower = more dreamy glow

  // ── Curvature / Geometry ──
  curvature: 0.001,             // barrel distortion strength (0 = flat, 0.1 = heavy)
  cornerDarkening: 0,       // darker corners / bezel falloff (0 = off)

  // ── Color / Artifacts ──
  chromaAberration: 1.0,       // radial RGB separation in pixels at screen edge (0 = off)
  colorBleed: 0.0,             // horizontal color bleed/smear (0 = off, higher = more bleed)
  saturation: 1.1,             // overall saturation (1.0 = normal, >1 = vivid)
  gamma: 1.15,                 // display gamma (1.0 = linear, >1 = brighter mids — lifts shadows)
  brightness: 1.6,             // overall brightness multiplier (raised to compensate for mask darkening)

  // ── Signal / Noise ──
  noiseAmount: 0.02,           // static noise amplitude (0 = off)
  noiseSpeed: 10.0,            // temporal noise speed (how fast static flickers)
  jitterAmount: 0.3,           // horizontal jitter / wobbly sync in pixels (0 = off)
  vignette: 0,              // vignette strength (0 = off, darkens edges)

  // ── Rage distortion ──
  rageDistortionMax: .25,        // target intensity during rage (tune this — higher = more gnarly)
  rageDistortion: 0,           // runtime value (driven by GameScene — do not edit)
};

// ── CRT test profiles (URL param: ?crt_profile=NAME) ──────────
const CRT_PROFILES: Record<string, Partial<typeof CRT_TUNING>> = {
  'no-bloom':    { bloomStrength: 0 },
  'no-beam':     { beamFocus: 0 },
  'lean':        { bloomStrength: 0, beamFocus: 0 },
  'essential':   { bloomStrength: 0, beamFocus: 0, chromaAberration: 0, convergenceError: 0 },
  'scan-mask':   { bloomStrength: 0, beamFocus: 0, chromaAberration: 0, convergenceError: 0,
                   noiseAmount: 0, jitterAmount: 0, colorBleed: 0 },
  'passthrough': { scanlineIntensity: 0, scanlineRollSpeed: 0, maskStrength: 0,
                   beamFocus: 0, convergenceError: 0, bloomStrength: 0,
                   curvature: 0, cornerDarkening: 0, chromaAberration: 0, colorBleed: 0,
                   saturation: 1.0, gamma: 1.0, brightness: 1.0,
                   noiseAmount: 0, jitterAmount: 0, vignette: 0 },
};

// Apply profile/individual overrides at module load
if (typeof window !== 'undefined') {
  try {
    const params = new URLSearchParams(window.location.search);
    const profile = params.get('crt_profile');
    if (profile && profile in CRT_PROFILES) {
      Object.assign(CRT_TUNING, CRT_PROFILES[profile]);
    }
    // Individual overrides: ?crt_bloomStrength=0&crt_beamFocus=0.5
    for (const [key, val] of params) {
      if (key.startsWith('crt_') && key !== 'crt_profile') {
        const prop = key.slice(4);
        if (prop in CRT_TUNING && typeof (CRT_TUNING as any)[prop] === 'number') {
          (CRT_TUNING as any)[prop] = parseFloat(val);
        }
      }
    }
  } catch { /* SSR safety */ }
}

/** Convert maskType string to shader uniform float */
export function maskTypeToFloat(type: typeof CRT_TUNING.maskType): number {
  switch (type) {
    case 'aperture_grille': return 0.0;
    case 'shadow_mask': return 1.0;
    case 'slot_mask': return 2.0;
  }
}
