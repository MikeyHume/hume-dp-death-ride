import { TUNING } from '../config/tuning';

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private distortionNode: WaveShaperNode | null = null;
  private distortionWet: GainNode | null = null;
  private distortionDry: GainNode | null = null;
  private started: boolean = false;

  /** Must be called from a user gesture (e.g. first Space press) */
  start(): void {
    if (this.started) return;
    this.started = true;

    try {
      this.ctx = new AudioContext();
    } catch (e) {
      console.warn('AudioSystem: AudioContext creation failed', e);
      return;
    }

    // Engine oscillator — sawtooth for gritty motorbike feel
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = TUNING.ENGINE_BASE_FREQ;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    // Distortion chain: osc → [dry + wet(waveshaper)] → gain → destination
    this.distortionNode = this.ctx.createWaveShaper();
    this.distortionNode.oversample = '4x';
    this.distortionDry = this.ctx.createGain();
    this.distortionDry.gain.value = 1;
    this.distortionWet = this.ctx.createGain();
    this.distortionWet.gain.value = 0;

    this.engineOsc.connect(this.distortionDry);
    this.engineOsc.connect(this.distortionNode);
    this.distortionNode.connect(this.distortionWet);
    this.distortionDry.connect(this.engineGain);
    this.distortionWet.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();

    // Generate distortion curve (aggressive clipping)
    this.updateDistortionCurve(400);
  }

  /** Update engine pitch + volume based on player speed and input */
  updateEngine(playerSpeed: number, roadSpeed: number, spaceHeld: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;

    const maxSpeed = roadSpeed * TUNING.MAX_SPEED_MULTIPLIER;
    const speedRatio = maxSpeed > 0 ? Math.min(playerSpeed / maxSpeed, 1) : 0;

    if (spaceHeld || playerSpeed > 0) {
      // Active engine: frequency and volume scale with speed
      const freq = TUNING.ENGINE_BASE_FREQ + speedRatio * (TUNING.ENGINE_MAX_FREQ - TUNING.ENGINE_BASE_FREQ);
      this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
      const vol = Math.max(speedRatio * TUNING.ENGINE_VOLUME, TUNING.ENGINE_IDLE_VOLUME);
      this.engineGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.05);
    } else {
      // Idle putter: low freq, quiet
      this.engineOsc.frequency.setTargetAtTime(TUNING.ENGINE_IDLE_FREQ, this.ctx.currentTime, 0.1);
      this.engineGain.gain.setTargetAtTime(TUNING.ENGINE_IDLE_VOLUME, this.ctx.currentTime, 0.1);
    }
  }

  /** Generate a gnarly distortion curve for the waveshaper */
  private updateDistortionCurve(amount: number): void {
    if (!this.distortionNode) return;
    const samples = 44100;
    const curve = new Float32Array(samples);
    const k = amount;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    this.distortionNode.curve = curve;
  }

  /** Set engine distortion mix (0 = clean, 1 = full fuzz) */
  setDistortion(amount: number): void {
    if (!this.ctx || !this.distortionDry || !this.distortionWet) return;
    this.distortionDry.gain.setTargetAtTime(1 - amount, this.ctx.currentTime, 0.1);
    this.distortionWet.gain.setTargetAtTime(amount * 2, this.ctx.currentTime, 0.1);
  }

  /** Rocket launch whoosh */
  playRocketLaunch(): void {
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 200;
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.15);

    const gain = this.ctx.createGain();
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  /** Silence engine (death / title screen) */
  silenceEngine(): void {
    if (!this.ctx || !this.engineGain) return;
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  /** Low boom for car-vs-crash explosions */
  playExplosion(): void {
    if (!this.ctx) return;

    // Short low-frequency boom + noise layer
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 60;
    osc.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 0.3);

    const oscGain = this.ctx.createGain();
    oscGain.gain.value = TUNING.EXPLOSION_VOLUME;
    oscGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);

    // Noise crackle layer
    const length = Math.floor(this.ctx.sampleRate * 0.3);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.value = TUNING.EXPLOSION_VOLUME * 0.5;
    noise.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noise.start();
  }

  /** Katana whoosh sound */
  playSlash(): void {
    if (!this.ctx) return;

    // High-frequency noise sweep for a blade whoosh
    const length = Math.floor(this.ctx.sampleRate * 0.12);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Bandpass-like sweep: envelope peaks in middle, noise filtered by sine
      data[i] = (Math.random() * 2 - 1) * Math.sin(t * Math.PI) * (1 - t * 0.5);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = TUNING.KATANA_SLASH_VOLUME;

    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();
  }

  /** Short noise burst for crash / death impact */
  playImpact(): void {
    if (!this.ctx) return;

    // White noise buffer
    const length = Math.floor(this.ctx.sampleRate * TUNING.IMPACT_DURATION);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length); // decaying noise
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = TUNING.IMPACT_VOLUME;

    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();
  }

  destroy(): void {
    if (this.engineOsc) {
      this.engineOsc.stop();
      this.engineOsc.disconnect();
    }
    if (this.distortionNode) this.distortionNode.disconnect();
    if (this.distortionDry) this.distortionDry.disconnect();
    if (this.distortionWet) this.distortionWet.disconnect();
    if (this.engineGain) {
      this.engineGain.disconnect();
    }
    if (this.ctx) {
      this.ctx.close();
    }
  }
}
