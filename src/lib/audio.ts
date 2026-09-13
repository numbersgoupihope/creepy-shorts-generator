const BASE_DETUNE_CENTS = 4;
const MAX_DETUNE_CENTS = 45;
const BASE_DRONE_GAIN = 0.075;
const MAX_DRONE_GAIN = 0.16;

function distortionCurve(amount: number): Float32Array {
  const samples = 256;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private tension = 0;
  enabled = false;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async enable() {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") await ctx.resume();
    if (this.enabled) return;
    this.enabled = true;

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    droneGain.connect(this.masterGain!);
    droneGain.gain.linearRampToValueAtTime(BASE_DRONE_GAIN, ctx.currentTime + 1.5);
    this.droneGain = droneGain;

    const oscA = ctx.createOscillator();
    oscA.type = "sine";
    oscA.frequency.value = 55;
    oscA.connect(droneGain);
    oscA.start();

    const oscB = ctx.createOscillator();
    oscB.type = "sine";
    oscB.frequency.value = 55;
    oscB.detune.value = BASE_DETUNE_CENTS;
    oscB.connect(droneGain);
    oscB.start();

    this.oscA = oscA;
    this.oscB = oscB;
  }

  disable() {
    if (!this.enabled || !this.ctx) return;
    this.enabled = false;
    const ctx = this.ctx;
    const droneGain = this.droneGain;
    const oscA = this.oscA;
    const oscB = this.oscB;
    if (droneGain) {
      droneGain.gain.cancelScheduledValues(ctx.currentTime);
      droneGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    }
    setTimeout(() => {
      oscA?.stop();
      oscB?.stop();
    }, 450);
    this.droneGain = null;
    this.oscA = null;
    this.oscB = null;
  }

  /** t in [0, 1] — 0 is calm, 1 is the last seconds of the timer. */
  setTension(t: number) {
    this.tension = Math.max(0, Math.min(1, t));
    if (!this.enabled || !this.ctx || !this.oscB || !this.droneGain) return;
    const cents =
      BASE_DETUNE_CENTS + (MAX_DETUNE_CENTS - BASE_DETUNE_CENTS) * this.tension;
    this.oscB.detune.linearRampToValueAtTime(cents, this.ctx.currentTime + 0.8);
    const gain = BASE_DRONE_GAIN + (MAX_DRONE_GAIN - BASE_DRONE_GAIN) * this.tension;
    this.droneGain.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 1.2);
  }

  playCorrect() {
    const ctx = this.ensureContext();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.masterGain!);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.25);
    osc.connect(gain);

    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);

    osc.start();
    osc.stop(ctx.currentTime + 0.55);
  }

  playIncorrect() {
    const ctx = this.ensureContext();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.masterGain!);

    const shaper = ctx.createWaveShaper();
    shaper.curve = distortionCurve(28) as Float32Array<ArrayBuffer>;
    shaper.connect(gain);

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(70, ctx.currentTime + 0.4);
    osc.connect(shaper);

    gain.gain.linearRampToValueAtTime(0.13, ctx.currentTime + 0.03);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.45);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  }

  /** A warped, stuttering, garbled tone for the corrupted voice memo —
   * deep pitch distortion, panning across as if approaching, rising
   * volume, then an abrupt hard cutoff (no fade-out). Intensity matched to
   * the home video beat's audio (playHomeVideoAudio) so the two beats feel
   * like they belong to the same escalating build. */
  playCorruptedVoice() {
    const ctx = this.ensureContext();
    const duration = 3.8;
    const now = ctx.currentTime;
    const end = now + duration;

    // Pans further across, past center, as it "approaches" — a stronger
    // sense of closing in than before.
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(-0.9, now);
    panner.pan.linearRampToValueAtTime(0.35, end);
    panner.connect(this.masterGain!);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.connect(panner);

    // Opens up slightly as it approaches, like clearing through a bad signal.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(550, now);
    filter.frequency.linearRampToValueAtTime(2400, end);
    filter.connect(envelope);

    const shaper = ctx.createWaveShaper();
    shaper.curve = distortionCurve(70) as Float32Array<ArrayBuffer>;
    shaper.connect(filter);

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, now);
    osc.connect(shaper);

    // Pitch wobble — warped-tape vibrato, deepening as it goes, deeper than before.
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 4.5;
    const wobbleGain = ctx.createGain();
    wobbleGain.gain.setValueAtTime(45, now);
    wobbleGain.gain.linearRampToValueAtTime(85, end);
    wobble.connect(wobbleGain);
    wobbleGain.connect(osc.frequency);

    // Granular stutter — chops the tone into garbled syllable-like bursts,
    // each one louder than the last.
    let t = now;
    while (t < end) {
      const progress = (t - now) / duration;
      const burst = 0.08 + Math.random() * 0.14;
      const gap = 0.03 + Math.random() * 0.09;
      const peak = 0.2 + 0.4 * progress;
      envelope.gain.setValueAtTime(0, t);
      envelope.gain.linearRampToValueAtTime(peak, t + 0.01);
      envelope.gain.setValueAtTime(peak, t + burst);
      envelope.gain.linearRampToValueAtTime(0, t + burst + 0.02);
      t += burst + gap;
    }
    // Hard cutoff — it doesn't fade, it just stops.
    envelope.gain.cancelScheduledValues(end);
    envelope.gain.setValueAtTime(0, end);

    osc.start(now);
    osc.stop(end + 0.05);
    wobble.start(now);
    wobble.stop(end + 0.05);
  }

  /** The home video beat's audio — the opening phrase of "Twinkle Twinkle
   * Little Star" (public domain: the 18th-century French folk melody
   * "Ah! vous dirai-je, maman"), synthesized procedurally, played in
   * reverse, pitched well down, with each note dragging longer than the
   * last — like tape being pulled slower and slower — then an abrupt hard
   * cutoff synced to the clip's cut to black. No copyrighted recording or
   * modern melody is used anywhere here. */
  playHomeVideoAudio() {
    this.playMelodyLayer(this.ensureContext(), this.ensureContext().currentTime, 4.4);
  }

  /** Shared melody/tone layer — same reversed, tape-slowing phrase as
   * playHomeVideoAudio() above, stretched to fit an arbitrary duration so
   * it can underlie a generated clip of any length. Kept separate from
   * the pitch-shift-down drone in playGeneratedClip(): this is "whatever
   * melody/tone plays", the drone is a distinct always-present layer on
   * top of it. */
  private playMelodyLayer(ctx: AudioContext, now: number, duration: number) {
    const end = now + duration;
    const baseFreq = 261.63 / 2.5; // C4, pitched down roughly an octave and a half

    // "Twin-kle twin-kle lit-tle star" as semitone offsets from the base
    // note, reversed.
    const OPENING_PHRASE_SEMITONES = [0, 0, 7, 7, 9, 9, 7];
    const notes = [...OPENING_PHRASE_SEMITONES].reverse();

    // Slow stereo drift, like the sound is moving past rather than sitting still.
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(-0.4, now);
    panner.pan.linearRampToValueAtTime(0.4, end);
    panner.connect(this.masterGain!);

    // Closes in like a bad tape head — brighter at first, muffled by the end.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.linearRampToValueAtTime(500, end);
    filter.connect(panner);

    const masterEnv = ctx.createGain();
    masterEnv.gain.setValueAtTime(0, now);
    masterEnv.gain.linearRampToValueAtTime(0.22, now + 0.3);
    masterEnv.connect(filter);

    let t = now;
    const perNoteBase = duration / notes.length;
    notes.forEach((semitone, i) => {
      const stretch = 1 + (i / notes.length) * 1.8; // later notes drag longer
      const noteDur = perNoteBase * stretch * 0.9;
      const freq = baseFreq * Math.pow(2, semitone / 12);

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(freq * (1 - 0.08 * (i / notes.length)), t + noteDur);

      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0, t);
      noteGain.gain.linearRampToValueAtTime(1, t + 0.05);
      noteGain.gain.setValueAtTime(1, t + noteDur * 0.7);
      noteGain.gain.linearRampToValueAtTime(0, t + noteDur);
      noteGain.connect(masterEnv);

      osc.connect(noteGain);
      osc.start(t);
      osc.stop(t + noteDur + 0.05);

      t += noteDur;
    });

    // Hard cut — no fade, matching the clip's instant cut to black.
    masterEnv.gain.cancelScheduledValues(end);
    masterEnv.gain.setValueAtTime(0, end);
  }

  /** The full audio bed for one generated clip: the melody/tone layer
   * above, plus a separate, always-present drone that continuously
   * pitch-shifts downward from `droneStartHz` toward `droneEndHz` across
   * the whole clip duration — sinking into felt-not-heard territory by
   * the spike moment. Both layers share one hard cutoff at `durationMs`,
   * synced to the clip's instant cut to black; returns a `stop()` you can
   * call to force that cutoff early (e.g. if the clip is interrupted). */
  playGeneratedClip({
    durationMs,
    droneStartHz,
    droneEndHz,
  }: {
    durationMs: number;
    droneStartHz: number;
    droneEndHz: number;
  }): () => void {
    const ctx = this.ensureContext();
    // Call from a real user gesture (the Generate button click) — this
    // resumes a context browsers create suspended under autoplay policy.
    if (ctx.state === "suspended") void ctx.resume();
    const duration = durationMs / 1000;
    const now = ctx.currentTime;
    const end = now + duration;

    this.playMelodyLayer(ctx, now, duration);

    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0, now);
    droneGain.gain.linearRampToValueAtTime(0.2, now + 0.6);
    droneGain.connect(this.masterGain!);

    const drone = ctx.createOscillator();
    drone.type = "sine";
    drone.frequency.setValueAtTime(droneStartHz, now);
    drone.frequency.exponentialRampToValueAtTime(Math.max(1, droneEndHz), end);
    drone.connect(droneGain);
    drone.start(now);

    // Hard cut — no fade, in sync with the clip's instant cut to black.
    droneGain.gain.cancelScheduledValues(end);
    droneGain.gain.setValueAtTime(0, end);
    drone.stop(end + 0.05);

    return () => {
      const stopNow = ctx.currentTime;
      droneGain.gain.cancelScheduledValues(stopNow);
      droneGain.gain.setValueAtTime(0, stopNow);
      drone.stop(stopNow + 0.02);
    };
  }
}

let instance: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!instance) instance = new AudioEngine();
  return instance;
}
