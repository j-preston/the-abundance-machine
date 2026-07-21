// Generative score — the sim, sonified. Raw WebAudio, zero audio files
// (with one exception: /assets/epilogue.mp3 replaces the win swell if present —
// the drop-in slot for the week's outro song).
//
// Layers:
//  - Pulse: soft ostinato whose tempo maps to PF throughput (60→132 BPM).
//  - Harmony: lydian pads while the Gap is healthy; a detuned drone fades in
//    underneath as the curves diverge. You HEAR the gap before you look up.
//  - Chimes: builds pluck pentatonic; tiers get a rising fourth; forecasts
//    resolve as a major second (calibrated) or tritone (not); fusion blooms.
//  - Endings: cascade keeps the pulse but drops all harmony (the machine runs
//    on without you); shutdown is a tape-stop; wins swell into the epilogue.
import { setAudioToastHook } from '../ui/panels.js';

const A2 = 110;
const st = (n) => A2 * Math.pow(2, n / 12); // semitones above A2

class Score {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('abundance-muted') === '1';
    this.running = false;
    this.tempo = 60;
    this.beat = 0;
    this.gapLevel = 0;
    this.epilogueBuffer = undefined; // undefined = not fetched, null = absent
    this.harmonyKilled = false;
  }

  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    this.master.connect(comp).connect(this.ctx.destination);

    // Pad bus.
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0;
    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 900;
    this.padGain.connect(padFilter).connect(this.master);
    // Lydian-leaning pad: A, E, B, G# — optimism as a discipline.
    this.padOscs = [st(0), st(7), st(14), st(23)].map((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = i < 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 4;
      const g = this.ctx.createGain();
      g.gain.value = [0.5, 0.4, 0.3, 0.22][i];
      o.connect(g).connect(this.padGain);
      o.start();
      return o;
    });

    // The drone underneath — detuned, uneasy.
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0;
    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 220;
    this.droneGain.connect(droneFilter).connect(this.master);
    this.droneOscs = [st(-12), st(-12) + 1.7].map((f) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = 0.3;
      o.connect(g).connect(this.droneGain);
      o.start();
      return o;
    });

    // Pulse scheduler.
    this.nextNote = this.ctx.currentTime + 0.1;
    this.schedTimer = setInterval(() => this.schedule(), 90);

    this.fetchEpilogue();
  }

  fetchEpilogue() {
    if (this.epilogueBuffer !== undefined) return;
    this.epilogueBuffer = null;
    fetch('assets/epilogue.mp3')
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((buf) => this.ctx.decodeAudioData(buf))
      .then((decoded) => { this.epilogueBuffer = decoded; })
      .catch(() => { this.epilogueBuffer = null; });
  }

  schedule() {
    if (!this.ctx || !this.running) return;
    const lookahead = 0.25;
    const pattern = [0, 7, 12, 7, 3, 7, 12, 15]; // pentatonic-ish ostinato
    while (this.nextNote < this.ctx.currentTime + lookahead) {
      const t = this.nextNote;
      const n = pattern[this.beat % pattern.length];
      this.pluck(st(n + 12), t, 0.10, 0.22, 'triangle');
      this.beat++;
      this.nextNote += 30 / this.tempo; // eighth notes
    }
  }

  pluck(freq, t, gain, dur, type = 'sine') {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  chord(freqs, gain = 0.12, dur = 2.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const f of freqs) this.pluck(f, t, gain, dur, 'sine');
  }

  startRun() {
    this.running = true;
    this.harmonyKilled = false;
    this.beat = 0;
    if (this.epilogueSource) { try { this.epilogueSource.stop(); } catch { /* done */ } this.epilogueSource = null; }
    if (this.ctx) {
      this.padGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.padGain.gain.setTargetAtTime(0.11, this.ctx.currentTime, 1.2);
      this.nextNote = this.ctx.currentTime + 0.1;
    }
  }

  stopRun() {
    this.running = false;
    if (this.ctx) {
      this.padGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
      this.droneGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    }
    if (this.epilogueSource) { try { this.epilogueSource.stop(); } catch { /* done */ } this.epilogueSource = null; }
  }

  /** Per-frame binding of sim state → sound. */
  update(state, data, app) {
    if (!this.ctx || !this.running) return;
    // Tempo ← PF throughput. 60 BPM idle → 132 at gigawatt scale.
    const pfNorm = Math.min(1, (state.pf || 0) / 500);
    this.tempo = 60 + 72 * pfNorm;
    if (this.harmonyKilled) return;

    // Harmony ← the Gap. Pads thin; the drone rises underneath.
    const G = state.history.g.length ? state.history.g[state.history.g.length - 1] : 0.5;
    const danger = Math.max(0, Math.min(1, (G - 1) / 1.2));
    const t = this.ctx.currentTime;
    this.padGain.gain.setTargetAtTime(0.11 * (1 - danger * 0.8), t, 0.8);
    this.droneGain.gain.setTargetAtTime(0.09 * danger, t, 0.8);
  }

  /** Chime grammar, driven by sim toasts (hooked from panels). */
  toast(t) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (t.kind === 'hint' || t.kind === 'info') return;
    if (t.kind === 'tier') {
      this.pluck(st(12), now, 0.14, 0.5);
      this.pluck(st(17), now + 0.16, 0.16, 0.9); // the rising fourth
    } else if (t.kind === 'forecast') {
      if (t.f > 0) { this.pluck(st(15), now, 0.12, 0.5); this.pluck(st(17), now + 0.12, 0.12, 0.7); } // major 2nd
      else { this.pluck(st(15), now, 0.12, 0.5); this.pluck(st(21), now + 0.12, 0.12, 0.7); } // tritone
    } else if (t.kind === 'incident') {
      this.pluck(st(-5), now, 0.16, 1.2, 'sawtooth');
      this.pluck(st(-4), now + 0.05, 0.12, 1.2, 'sawtooth');
    } else if (t.kind === 'fusion') {
      // One huge bloomed chord with a long tail — the wonder moment.
      this.chord([st(0), st(7), st(12), st(16), st(23), st(26)], 0.13, 6);
    } else if (t.kind === 'warn') {
      this.pluck(st(3), now, 0.1, 0.4);
    }
  }

  /** Build-complete pluck (called from grid via toast hook on first builds
      and cheaply for every completion via panels). */
  buildChime() {
    if (!this.ctx) return;
    this.pluck(st(19), this.ctx.currentTime, 0.08, 0.3);
  }

  ending(type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (type === 'cascade') {
      // Harmony drops out entirely; the pulse keeps running without you.
      this.harmonyKilled = true;
      this.padGain.gain.setTargetAtTime(0, t, 0.3);
      this.droneGain.gain.setTargetAtTime(0, t, 2.0);
      this.tempo = 132;
    } else if (type === 'pulledPlug') {
      // Tape stop.
      this.running = false;
      for (const o of [...this.padOscs, ...this.droneOscs]) {
        o.frequency.setTargetAtTime(o.frequency.value * 0.05, t, 0.5);
      }
      this.padGain.gain.setTargetAtTime(0, t, 1.2);
      this.droneGain.gain.setTargetAtTime(0, t, 1.2);
    } else if (type === 'silentRace') {
      this.running = false;
      this.padGain.gain.setTargetAtTime(0.03, t, 2);
      this.droneGain.gain.setTargetAtTime(0.06, t, 2);
    } else {
      // Wins: the full ensemble swells into the epilogue.
      this.droneGain.gain.setTargetAtTime(0, t, 0.5);
      if (this.epilogueBuffer) {
        // The outro-song slot: the swarm assembles to the actual episode outro.
        this.running = false;
        this.padGain.gain.setTargetAtTime(0, t, 1.5);
        const src = this.ctx.createBufferSource();
        src.buffer = this.epilogueBuffer;
        const g = this.ctx.createGain();
        g.gain.value = 0.85;
        src.connect(g).connect(this.master);
        src.start(t + 0.5);
        this.epilogueSource = src;
      } else {
        this.tempo = 96;
        this.padGain.gain.setTargetAtTime(0.16, t, 2);
        this.chord([st(0), st(7), st(12), st(16), st(24)], 0.1, 8);
      }
    }
  }

  beatCount() {
    return this.beat;
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('abundance-muted', this.muted ? '1' : '0');
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }
}

export const audio = new Score();
setAudioToastHook((t) => audio.toast(t));
