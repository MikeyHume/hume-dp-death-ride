import Phaser from 'phaser';
import { CRT_TUNING, maskTypeToFloat } from '../config/crtTuning';
import { GAME_MODE } from '../config/gameMode';

const FRAG_SHADER = `
precision mediump float;

uniform sampler2D uMainSampler;
varying vec2 outTexCoord;

uniform float uTime;
uniform vec2 uResolution;

// Scanlines
uniform float uScanlineIntensity;
uniform float uScanlineDensity;
uniform float uScanlineRollSpeed;

// Phosphor mask
uniform float uMaskStrength;
uniform float uMaskScale;
uniform float uMaskGap;
uniform float uMaskType;

// Beam / focus
uniform float uBeamFocus;
uniform float uConvergenceError;

// Bloom
uniform float uBloomStrength;
uniform float uBloomRadius;
uniform float uBloomThreshold;

// Curvature
uniform float uCurvature;
uniform float uCornerDarkening;

// Color
uniform float uChromaAberration;
uniform float uColorBleed;
uniform float uSaturation;
uniform float uGamma;
uniform float uBrightness;

// Signal / noise
uniform float uNoiseAmount;
uniform float uNoiseSpeed;
uniform float uJitterAmount;
uniform float uVignette;

// Rage distortion
uniform float uRageDistortion;

// ── Helpers ──

float hash(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

vec2 barrel(vec2 uv, float k) {
    vec2 cc = uv - 0.5;
    float r2 = dot(cc, cc);
    return uv + cc * r2 * k;
}

// ── Main ──

void main() {
    vec2 uv = outTexCoord;

    // --- 1. Jitter (horizontal sync wobble) ---
    float totalJitter = uJitterAmount;
    if (uRageDistortion > 0.0) {
        // Rage adds aggressive horizontal tearing — random scanline-sized blocks shift sideways
        totalJitter += uRageDistortion * 8.0;
        // Occasional big vertical tear (block shift) — a few scanline bands jump hard
        float blockY = floor(uv.y * 12.0 + uTime * 3.0);
        float blockRand = hash(vec2(blockY, floor(uTime * 20.0)));
        if (blockRand > 0.85) {
            uv.x += (blockRand - 0.85) * uRageDistortion * 40.0 / uResolution.x;
        }
    }
    if (totalJitter > 0.0) {
        float lineY = floor(uv.y * uResolution.y);
        float j = (hash(vec2(lineY, floor(uTime * 60.0))) - 0.5) * 2.0;
        uv.x += j * totalJitter / uResolution.x;
    }

    // --- 2. Curvature (barrel distortion) ---
    vec2 cUV = barrel(uv, uCurvature);

    if (cUV.x < 0.0 || cUV.x > 1.0 || cUV.y < 0.0 || cUV.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // --- 3. RGB channel offsets (convergence error + chromatic aberration) ---
    vec2 rOff = vec2(0.0);
    vec2 bOff = vec2(0.0);

    // Convergence error: constant horizontal misalignment (RGB guns)
    if (uConvergenceError > 0.0) {
        float ce = uConvergenceError / uResolution.x;
        rOff.x += ce;
        bOff.x -= ce;
    }

    // Chromatic aberration: radial separation (stronger at edges)
    float totalChroma = uChromaAberration;
    if (uRageDistortion > 0.0) {
        totalChroma += uRageDistortion * 6.0;
    }
    if (totalChroma > 0.0) {
        vec2 caDir = cUV - 0.5;
        float caAmt = totalChroma / uResolution.x;
        rOff += caDir * caAmt;
        bOff -= caDir * caAmt;
    }

    // Sample per-channel
    vec3 color;
    color.r = texture2D(uMainSampler, cUV + rOff).r;
    color.g = texture2D(uMainSampler, cUV).g;
    color.b = texture2D(uMainSampler, cUV + bOff).b;

    // --- 4. Beam focus (horizontal softening — simulates beam spread before mask) ---
    if (uBeamFocus > 0.0) {
        vec2 step = vec2(uBeamFocus / uResolution.x, 0.0);
        vec3 s1 = texture2D(uMainSampler, cUV + step).rgb;
        vec3 s2 = texture2D(uMainSampler, cUV - step).rgb;
        vec3 s3 = texture2D(uMainSampler, cUV + step * 2.0).rgb;
        vec3 s4 = texture2D(uMainSampler, cUV - step * 2.0).rgb;
        vec3 soft = color * 0.4 + (s1 + s2) * 0.2 + (s3 + s4) * 0.1;
        color = soft;
    }

    // --- 5. Color bleed (horizontal smear) ---
    if (uColorBleed > 0.0) {
        vec3 prev = texture2D(uMainSampler, cUV - vec2(uColorBleed / uResolution.x, 0.0)).rgb;
        color = mix(color, prev, 0.3);
    }

    // --- 6. Bloom (3x3 threshold-weighted glow) ---
    if (uBloomStrength > 0.0) {
        vec3 bloom = vec3(0.0);
        vec2 ts = (1.0 / uResolution) * uBloomRadius;
        for (int x = -1; x <= 1; x++) {
            for (int y = -1; y <= 1; y++) {
                vec2 off = vec2(float(x), float(y)) * ts;
                vec3 s = texture2D(uMainSampler, cUV + off).rgb;
                float lum = dot(s, vec3(0.299, 0.587, 0.114));
                bloom += s * max(lum - uBloomThreshold, 0.0);
            }
        }
        color += bloom * (uBloomStrength / 9.0);
    }

    // --- 7. Scanlines ---
    if (uScanlineIntensity > 0.0) {
        float scanPhase = cUV.y * uScanlineDensity * 3.14159265;
        float scan = sin(scanPhase);
        scan = scan * scan;
        color *= 1.0 - uScanlineIntensity * (1.0 - scan);
    }

    // --- 8. Scanline roll (slow vertical bright band) ---
    if (uScanlineRollSpeed > 0.0) {
        float rollPos = fract(cUV.y - uTime * uScanlineRollSpeed * 0.05);
        float rollBand = smoothstep(0.0, 0.015, rollPos) * (1.0 - smoothstep(0.025, 0.06, rollPos));
        color += color * rollBand * 0.25;
    }

    // --- 9. Shadow mask / phosphor grille ---
    if (uMaskStrength > 0.0) {
        vec2 px = cUV * uResolution;
        vec3 mask = vec3(1.0);
        float dim = 1.0 - uMaskStrength;

        if (uMaskType < 0.5) {
            // ── Aperture grille: vertical RGB stripes with dark gaps (Trinitron) ──
            float subW = uMaskScale / 3.0;            // width of one subpixel column
            float triPos = mod(px.x, uMaskScale);     // position within triad
            float subIdx = floor(triPos / subW);       // which subpixel: 0=R, 1=G, 2=B
            float subT = fract(triPos / subW);         // position within subpixel (0–1)

            // Gap shape: bright center, dark edges
            float gapHalf = uMaskGap * 0.5;
            float shape = smoothstep(0.0, gapHalf + 0.05, subT)
                        * (1.0 - smoothstep(1.0 - gapHalf - 0.05, 1.0, subT));

            // RGB channel selection
            if (subIdx < 0.5)      mask = vec3(1.0, dim, dim);
            else if (subIdx < 1.5) mask = vec3(dim, 1.0, dim);
            else                   mask = vec3(dim, dim, 1.0);

            // Apply gap darkening to the mask
            mask *= shape;

        } else if (uMaskType < 1.5) {
            // ── Shadow mask: staggered RGB dots with gaps ──
            float subW = uMaskScale / 3.0;
            float row = floor(px.y / (uMaskScale * 2.0));
            float offset = mod(row, 2.0) * uMaskScale * 1.5;
            float triPos = mod(px.x + offset, uMaskScale);
            float subIdx = floor(triPos / subW);
            float subT = fract(triPos / subW);

            // Horizontal gap
            float gapHalf = uMaskGap * 0.5;
            float shapeH = smoothstep(0.0, gapHalf + 0.05, subT)
                         * (1.0 - smoothstep(1.0 - gapHalf - 0.05, 1.0, subT));

            // Vertical gap (between dot rows)
            float rowT = fract(px.y / (uMaskScale * 2.0));
            float shapeV = smoothstep(0.0, gapHalf + 0.05, rowT)
                         * (1.0 - smoothstep(1.0 - gapHalf - 0.05, 1.0, rowT));

            if (subIdx < 0.5)      mask = vec3(1.0, dim, dim);
            else if (subIdx < 1.5) mask = vec3(dim, 1.0, dim);
            else                   mask = vec3(dim, dim, 1.0);

            mask *= shapeH * shapeV;

        } else {
            // ── Slot mask: vertical RGB columns with horizontal slot gaps ──
            float subW = uMaskScale / 3.0;
            float triPos = mod(px.x, uMaskScale);
            float subIdx = floor(triPos / subW);
            float subT = fract(triPos / subW);

            // Horizontal gap between subpixels
            float gapHalf = uMaskGap * 0.5;
            float shapeH = smoothstep(0.0, gapHalf + 0.05, subT)
                         * (1.0 - smoothstep(1.0 - gapHalf - 0.05, 1.0, subT));

            // Vertical slot gap (repeating horizontal dark bands)
            float slotT = fract(px.y / (uMaskScale * 1.5));
            float shapeV = smoothstep(0.0, 0.15, slotT)
                         * (1.0 - smoothstep(0.7, 0.85, slotT));

            if (subIdx < 0.5)      mask = vec3(1.0, dim, dim);
            else if (subIdx < 1.5) mask = vec3(dim, 1.0, dim);
            else                   mask = vec3(dim, dim, 1.0);

            mask *= shapeH * shapeV;
        }

        color *= mask;
    }

    // --- 10. Saturation ---
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(lum), color, uSaturation);

    // --- 11. Brightness & Gamma ---
    color *= uBrightness;
    color = pow(max(color, vec3(0.0)), vec3(1.0 / max(uGamma, 0.01)));

    // --- 12. Noise (static) ---
    float totalNoise = uNoiseAmount;
    if (uRageDistortion > 0.0) {
        totalNoise += uRageDistortion * 0.12;
    }
    if (totalNoise > 0.0) {
        float n = hash(cUV * uResolution + vec2(uTime * uNoiseSpeed)) * 2.0 - 1.0;
        color += vec3(n * totalNoise);
    }

    // --- 12b. Rage bit-crush (posterization — reduces color depth for digital grit) ---
    if (uRageDistortion > 0.0) {
        float levels = mix(256.0, 12.0, uRageDistortion);
        color = floor(color * levels + 0.5) / levels;
        // Scanline roll during rage (fast moving bright band)
        float rageRoll = fract(cUV.y - uTime * 0.4);
        float rageBand = smoothstep(0.0, 0.01, rageRoll) * (1.0 - smoothstep(0.02, 0.05, rageRoll));
        color += color * rageBand * uRageDistortion * 0.5;
    }

    // --- 13. Vignette ---
    if (uVignette > 0.0) {
        vec2 vc = cUV * 2.0 - 1.0;
        float v = 1.0 - dot(vc, vc) * uVignette;
        color *= clamp(v, 0.0, 1.0);
    }

    // --- 14. Corner darkening ---
    if (uCornerDarkening > 0.0) {
        vec2 cc = cUV * 2.0 - 1.0;
        float cd = 1.0 - length(cc * cc) * uCornerDarkening;
        color *= clamp(cd, 0.0, 1.0);
    }

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export class CRTPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({
      game,
      name: 'CRTPipeline',
      fragShader: FRAG_SHADER,
    });
  }

  onPreRender(): void {
    const t = CRT_TUNING;
    const tier = GAME_MODE.renderTier;

    this.set1f('uTime', this.game.loop.time / 1000);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);

    // Scanlines — reduced density on weakest tiers
    this.set1f('uScanlineIntensity', t.scanlineIntensity);
    this.set1f('uScanlineDensity',
      (tier === 'phone-low' || tier === 'gen-mobile') ? 270 : t.scanlineDensity);
    this.set1f('uScanlineRollSpeed', t.scanlineRollSpeed);

    // Mask
    this.set1f('uMaskStrength', t.maskStrength);
    this.set1f('uMaskScale', t.maskScale);
    this.set1f('uMaskGap', t.maskGap);
    this.set1f('uMaskType', maskTypeToFloat(t.maskType));

    // Beam / focus
    this.set1f('uBeamFocus', t.beamFocus);
    this.set1f('uConvergenceError', t.convergenceError);

    // Bloom — scaled per tier: full → 0.75 → 0.5 → 0 → 0
    const bloomMul = tier === 'desktop' ? 1
      : tier === 'tablet' ? 0.75
      : tier === 'phone-high' ? 0.5
      : 0;  // gen-mobile + phone-low: no bloom (GPU expensive)
    this.set1f('uBloomStrength', t.bloomStrength * bloomMul);
    this.set1f('uBloomRadius', t.bloomRadius);
    this.set1f('uBloomThreshold', t.bloomThreshold);

    // Curvature
    this.set1f('uCurvature', t.curvature);
    this.set1f('uCornerDarkening', t.cornerDarkening);

    // Color
    this.set1f('uChromaAberration', t.chromaAberration);
    this.set1f('uColorBleed', t.colorBleed);
    this.set1f('uSaturation', t.saturation);
    this.set1f('uGamma', t.gamma);
    this.set1f('uBrightness', t.brightness);

    // Noise — scaled per tier: full → 0.75 → 0.5 → 0 → 0
    const noiseMul = tier === 'desktop' ? 1
      : tier === 'tablet' ? 0.75
      : tier === 'phone-high' ? 0.5
      : 0;  // gen-mobile + phone-low: no noise (GPU expensive)
    this.set1f('uNoiseAmount', t.noiseAmount * noiseMul);
    this.set1f('uNoiseSpeed', t.noiseSpeed);
    this.set1f('uJitterAmount', t.jitterAmount);
    this.set1f('uVignette', t.vignette);

    // Rage distortion
    this.set1f('uRageDistortion', t.rageDistortion);
  }
}
