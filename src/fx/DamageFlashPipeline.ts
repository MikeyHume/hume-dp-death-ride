import Phaser from 'phaser';
import { TUNING } from '../config/tuning';

const FRAG_SHADER = `
precision mediump float;

uniform sampler2D uMainSampler;
varying vec2 outTexCoord;

uniform float uIntensity;       // 0 = passthrough, 1 = full damage effect
uniform float uContrast;        // contrast boost (1.0 = normal)
uniform float uBrightness;      // brightness lift
uniform float uWhiteThreshold;  // luminance above this stays white
uniform float uGlowRadius;      // UV-space sample offset for glow
uniform float uGlowStrength;    // how much glow to add

void main() {
    vec2 uv = outTexCoord;
    vec4 color = texture2D(uMainSampler, uv);

    if (uIntensity <= 0.0) {
        gl_FragColor = color;
        return;
    }

    // 1. Desaturate to luminance
    float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));

    // 2. Contrast + brightness boost
    float boosted = clamp((lum - 0.5) * uContrast + 0.5 + uBrightness, 0.0, 1.0);

    // 3. Red color grade — white shines through at top, mid=red, dark=dark red→black
    float whiteBlend = smoothstep(uWhiteThreshold, 1.0, boosted);
    vec3 redGrade;
    redGrade.r = boosted;
    redGrade.g = boosted * whiteBlend;
    redGrade.b = boosted * whiteBlend;

    // 4. Glow — multi-tap blur at two radii, applied in red color space
    float glowLum = 0.0;
    float r1 = uGlowRadius;
    float r2 = uGlowRadius * 2.5;

    // Inner ring (4 taps)
    glowLum += dot(texture2D(uMainSampler, uv + vec2( r1, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    glowLum += dot(texture2D(uMainSampler, uv + vec2(-r1, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    glowLum += dot(texture2D(uMainSampler, uv + vec2(0.0,  r1)).rgb, vec3(0.299, 0.587, 0.114));
    glowLum += dot(texture2D(uMainSampler, uv + vec2(0.0, -r1)).rgb, vec3(0.299, 0.587, 0.114));

    // Outer ring (4 taps, half weight)
    glowLum += dot(texture2D(uMainSampler, uv + vec2( r2, 0.0)).rgb, vec3(0.299, 0.587, 0.114)) * 0.5;
    glowLum += dot(texture2D(uMainSampler, uv + vec2(-r2, 0.0)).rgb, vec3(0.299, 0.587, 0.114)) * 0.5;
    glowLum += dot(texture2D(uMainSampler, uv + vec2(0.0,  r2)).rgb, vec3(0.299, 0.587, 0.114)) * 0.5;
    glowLum += dot(texture2D(uMainSampler, uv + vec2(0.0, -r2)).rgb, vec3(0.299, 0.587, 0.114)) * 0.5;

    // Diagonals (4 taps, 0.7 weight)
    float rd = r1 * 0.707;
    glowLum += dot(texture2D(uMainSampler, uv + vec2( rd,  rd)).rgb, vec3(0.299, 0.587, 0.114)) * 0.7;
    glowLum += dot(texture2D(uMainSampler, uv + vec2(-rd,  rd)).rgb, vec3(0.299, 0.587, 0.114)) * 0.7;
    glowLum += dot(texture2D(uMainSampler, uv + vec2( rd, -rd)).rgb, vec3(0.299, 0.587, 0.114)) * 0.7;
    glowLum += dot(texture2D(uMainSampler, uv + vec2(-rd, -rd)).rgb, vec3(0.299, 0.587, 0.114)) * 0.7;

    glowLum /= (4.0 + 4.0 * 0.5 + 4.0 * 0.7); // weighted average

    // Add glow as red-tinted bloom
    float glowWhite = smoothstep(uWhiteThreshold, 1.0, glowLum);
    redGrade.r += glowLum * uGlowStrength;
    redGrade.g += glowLum * uGlowStrength * glowWhite;
    redGrade.b += glowLum * uGlowStrength * glowWhite;
    redGrade = clamp(redGrade, 0.0, 1.0);

    // Mix with original based on intensity
    color.rgb = mix(color.rgb, redGrade, uIntensity);

    gl_FragColor = color;
}
`;

export class DamageFlashPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  /** Public intensity — tween this from 1→0 for the flash. At 0, shader is a passthrough. */
  intensity = 0;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: 'DamageFlashPipeline',
      fragShader: FRAG_SHADER,
    });
  }

  onPreRender(): void {
    this.set1f('uIntensity', this.intensity);
    this.set1f('uContrast', TUNING.DAMAGE_FLASH_CONTRAST);
    this.set1f('uBrightness', TUNING.DAMAGE_FLASH_BRIGHTNESS);
    this.set1f('uWhiteThreshold', TUNING.DAMAGE_FLASH_WHITE_THRESHOLD);
    this.set1f('uGlowRadius', TUNING.DAMAGE_FLASH_GLOW_RADIUS);
    this.set1f('uGlowStrength', TUNING.DAMAGE_FLASH_GLOW_STRENGTH);
  }
}
