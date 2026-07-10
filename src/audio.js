// Синтезированные звуки через WebAudio — без внешних файлов.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      // общий буфер белого шума
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _noiseShot({ dur, cutoff, vol, bodyFreq }) {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;

    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(cutoff, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.15), t + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);

    // низкочастотный "удар"
    if (bodyFreq) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(bodyFreq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, bodyFreq * 0.4), t + 0.09);
      const og = this.ctx.createGain();
      og.gain.setValueAtTime(vol * 0.9, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(og).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.14);
    }
  }

  shot(type, vol = 1) {
    if (!this.ctx) return;
    switch (type) {
      case 'ak':
        this._noiseShot({ dur: 0.16, cutoff: 2600, vol: 0.5 * vol, bodyFreq: 140 });
        break;
      case 'usp':
        this._noiseShot({ dur: 0.09, cutoff: 1300, vol: 0.22 * vol, bodyFreq: 220 });
        break;
      case 'awp':
        this._noiseShot({ dur: 0.45, cutoff: 1100, vol: 0.8 * vol, bodyFreq: 80 });
        break;
      default:
        this._noiseShot({ dur: 0.12, cutoff: 2000, vol: 0.4 * vol, bodyFreq: 150 });
    }
  }

  swing() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(600, t);
    filt.frequency.exponentialRampToValueAtTime(2400, t + 0.1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.16);
  }

  _click(freq, when, vol = 0.12, dur = 0.03) {
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.01);
  }

  reload(dur = 2) {
    if (!this.ctx) return;
    this._click(700, 0.05);
    this._click(420, dur * 0.45, 0.14);
    this._click(900, dur - 0.25, 0.16, 0.04);
  }

  dryfire() { if (this.ctx) this._click(1400, 0, 0.08, 0.02); }

  hit(head) {
    if (!this.ctx) return;
    this._click(head ? 1600 : 1100, 0, 0.14, 0.05);
  }

  hurt() {
    if (!this.ctx) return;
    this._noiseShot({ dur: 0.12, cutoff: 500, vol: 0.3, bodyFreq: 90 });
  }

  step(vol = 0.07) {
    if (!this.ctx) return;
    this._noiseShot({ dur: 0.05, cutoff: 500 + Math.random() * 200, vol, bodyFreq: 0 });
  }

  // писк таймера бомбы
  beep() {
    if (!this.ctx) return;
    this._click(1150, 0, 0.1, 0.06);
  }

  // бомба установлена: два восходящих сигнала
  planted() {
    if (!this.ctx) return;
    this._click(660, 0, 0.16, 0.12);
    this._click(880, 0.16, 0.16, 0.16);
  }

  // бомба обезврежена: щелчок + нисходящий сигнал
  defused() {
    if (!this.ctx) return;
    this._click(1400, 0, 0.12, 0.04);
    this._click(700, 0.12, 0.14, 0.2);
  }

  // взрыв бомбы: длинный низкий грохот
  explosion() {
    if (!this.ctx) return;
    this._noiseShot({ dur: 1.4, cutoff: 900, vol: 0.9, bodyFreq: 48 });
    this._noiseShot({ dur: 0.5, cutoff: 3000, vol: 0.5, bodyFreq: 90 });
  }

  // джингл конца раунда: победа — вверх, поражение — вниз
  sting(win) {
    if (!this.ctx) return;
    const notes = win ? [523, 659, 784] : [392, 330, 262];
    notes.forEach((f, i) => this._click(f, i * 0.14, 0.12, 0.13));
  }

  // звон монет при покупке
  cash() {
    if (!this.ctx) return;
    this._click(1800, 0, 0.1, 0.03);
    this._click(2400, 0.05, 0.1, 0.04);
  }

  // тик рулетки кейса
  caseTick() {
    if (!this.ctx) return;
    this._click(1900 + Math.random() * 400, 0, 0.05, 0.02);
  }

  // выпадение предмета из кейса; rare — фанфары подлиннее
  caseReveal(rare) {
    if (!this.ctx) return;
    const notes = rare ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
    notes.forEach((f, i) => this._click(f, i * 0.11, 0.13, 0.14));
  }
}
