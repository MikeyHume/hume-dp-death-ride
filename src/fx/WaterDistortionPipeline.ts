import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { GAME_MODE } from '../config/gameMode';

const FRAG_SHADER = `
precision mediump float;

uniform sampler2D uMainSampler;
varying vec2 outTexCoord;

uniform float uAmplitude;
uniform float uFrequency;
uniform float uPhase;
uniform int   uOctaves;
uniform float uLacunarity;
uniform float uGain;
uniform float uYAmount;

// Color tint
uniform float uTintHue;        // target hue (0-1, mapped from 0-360 degrees)
uniform float uTintSaturation; // saturation of tinted result (0=gray, 1=vivid)
uniform float uTintMix;        // blend: 0=original, 1=full monochromatic tint

// RGB <-> HSL conversion helpers
vec3 rgb2hsl(vec3 c) {
    float maxC = max(c.r, max(c.g, c.b));
    float minC = min(c.r, min(c.g, c.b));
    float l = (maxC + minC) * 0.5;
    if (maxC == minC) return vec3(0.0, 0.0, l);
    float d = maxC - minC;
    float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
    float h;
    if (maxC == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
    return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
    if (t < 0.5) return q;
    if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
    return p;
}

vec3 hsl2rgb(vec3 hsl) {
    if (hsl.y == 0.0) return vec3(hsl.z);
    float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
    float p = 2.0 * hsl.z - q;
    return vec3(
        hue2rgb(p, q, hsl.x + 1.0/3.0),
        hue2rgb(p, q, hsl.x),
        hue2rgb(p, q, hsl.x - 1.0/3.0)
    );
}

void main() {
    vec2 uv = outTexCoord;

    // Turbulent displacement — layered sine waves at increasing frequencies
    float offsetX = 0.0;
    float offsetY = 0.0;
    float freq = uFrequency;
    float amp = uAmplitude;

    for (int i = 0; i < 4; i++) {
        if (i >= uOctaves) break;
        float phaseOff = float(i) * 1.7;
        offsetX += sin(uv.y * freq + uPhase + phaseOff) * amp;
        offsetY += sin(uv.x * freq * 0.7 + uPhase * 1.3 + phaseOff + 2.5) * amp * uYAmount;
        freq *= uLacunarity;
        amp *= uGain;
    }

    vec2 distorted = vec2(
        clamp(uv.x + offsetX, 0.0, 1.0),
        clamp(uv.y + offsetY, 0.0, 1.0)
    );

    vec4 color = texture2D(uMainSampler, distorted);

    // Monochromatic tint — replace hue, override saturation, preserve lightness
    if (uTintMix > 0.0) {
        vec3 hsl = rgb2hsl(color.rgb);
        vec3 tinted = hsl2rgb(vec3(uTintHue, uTintSaturation, hsl.z));
        color.rgb = mix(color.rgb, tinted, uTintMix);
    }

    gl_FragColor = color;
}
`;

export class WaterDistortionPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private phase = 0;
  private lastStepTime = 0;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: 'WaterDistortionPipeline',
      fragShader: FRAG_SHADER,
    });
  }

  onPreRender(): void {
    const now = this.game.loop.time; // ms
    const stepInterval = 1000 / TUNING.REFLECTION_WAVE_FPS;

    // Step phase at fixed intervals for retro chunky feel
    if (now - this.lastStepTime >= stepInterval) {
      this.phase += 1.0;
      this.lastStepTime = now - ((now - this.lastStepTime) % stepInterval);
    }

    this.set1f('uAmplitude', TUNING.REFLECTION_WAVE_AMPLITUDE);
    this.set1f('uFrequency', TUNING.REFLECTION_WAVE_FREQUENCY);
    this.set1f('uPhase', this.phase);
    this.set1i('uOctaves', TUNING.REFLECTION_TURB_OCTAVES);
    this.set1f('uLacunarity', TUNING.REFLECTION_TURB_LACUNARITY);
    this.set1f('uGain', TUNING.REFLECTION_TURB_GAIN);
    this.set1f('uYAmount', TUNING.REFLECTION_TURB_Y_AMOUNT);

    // Color tint — free on mobile GPU (confirmed via shader stress test)
    this.set1f('uTintHue', TUNING.REFLECTION_TINT_HUE / 360);
    this.set1f('uTintSaturation', TUNING.REFLECTION_TINT_SATURATION);
    this.set1f('uTintMix', TUNING.REFLECTION_TINT_MIX);
  }
}
