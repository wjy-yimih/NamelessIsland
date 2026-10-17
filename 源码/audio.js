/* Island ambience: generated locally; no audio files or network requests. */
(() => {
  'use strict';
  let context = null;
  let master = null;
  let volume = 0.42;
  const active = new Map();
  const ramps = new Set();

  function ensureContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('你的浏览器暂不支持环境声音。');
    if (!context) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = volume;
      master.connect(context.destination);
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  }

  function noiseBuffer(ctx, kind) {
    const length = Math.floor(ctx.sampleRate * 4);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      let brown = 0;
      let slow = 0;
      for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1;
        brown = (brown + 0.022 * white) / 1.022;
        slow = slow * 0.998 + Math.random() * 0.002;
        data[i] = kind === 'fire'
          ? brown * 4.4 + (Math.random() > 0.9994 ? white * 0.55 : 0)
          : kind === 'wind' ? brown * 5.2 * (0.45 + slow) : white * 0.42;
      }
    }
    return buffer;
  }

  function createLayer(name) {
    const ctx = ensureContext();
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = noiseBuffer(ctx, name);
    source.loop = true;
    filter.type = name === 'rain' ? 'lowpass' : 'lowpass';
    filter.frequency.value = name === 'rain' ? 3800 : name === 'fire' ? 950 : 480;
    filter.Q.value = 0.35;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(name === 'rain' ? 0.65 : 0.58, ctx.currentTime + 0.65);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    let oscillator = null;
    let modulation = null;
    if (name === 'wind') {
      oscillator = ctx.createOscillator();
      modulation = ctx.createGain();
      oscillator.frequency.value = 0.09;
      modulation.gain.value = 160;
      oscillator.connect(modulation);
      modulation.connect(filter.frequency);
      oscillator.start();
    }
    return { source, filter, gain, oscillator, modulation };
  }

  function stop(name, immediate = false) {
    const layer = active.get(name);
    if (!layer) return;
    active.delete(name);
    const dispose = () => {
      try { layer.source.stop(); } catch (_) { /* Already stopped. */ }
      if (layer.oscillator) { try { layer.oscillator.stop(); } catch (_) {} }
      Object.values(layer).forEach(node => { if (node && node.disconnect) node.disconnect(); });
    };
    if (immediate || !context) { dispose(); return; }
    layer.gain.gain.cancelScheduledValues(context.currentTime);
    layer.gain.gain.setTargetAtTime(0, context.currentTime, 0.12);
    const handle = window.setTimeout(() => { ramps.delete(handle); dispose(); }, 650);
    ramps.add(handle);
  }

  window.IslandAudio = {
    toggle(name) {
      if (!['rain', 'fire', 'wind'].includes(name)) return false;
      if (active.has(name)) { stop(name); return false; }
      active.set(name, createLayer(name));
      return true;
    },
    setVolume(value) {
      volume = Math.max(0, Math.min(1, Number(value) || 0));
      if (master && context) master.gain.setTargetAtTime(volume, context.currentTime, 0.08);
    },
    stopAll() { Array.from(active.keys()).forEach(name => stop(name)); },
    getActive() { return Array.from(active.keys()); },
    setMaster(enabled) { if (!enabled) this.stopAll(); },
    dispose() {
      Array.from(active.keys()).forEach(name => stop(name, true));
      if (context) context.close().catch(() => {});
      context = null;
      master = null;
    }
  };
})();
