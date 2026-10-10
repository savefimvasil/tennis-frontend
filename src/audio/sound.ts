// Procedurally synthesised sound effects. No sample files are shipped.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noise: AudioBuffer | null = null
let crowd: { gain: GainNode } | null = null

export function initAudio() {
  if (ctx) {
    void ctx.resume()
    return
  }
  const AC =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = 0.8
  const comp = ctx.createDynamicsCompressor()
  master.connect(comp).connect(ctx.destination)
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  startCrowd()
}

export function setMuted(m: boolean) {
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05)
}

function noiseBurst(t: number, dur: number, freq: number, q: number, gain: number, pan = 0) {
  if (!ctx || !master || !noise) return
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.playbackRate.value = 0.9 + Math.random() * 0.2
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  const p = ctx.createStereoPanner()
  p.pan.value = pan
  src.connect(f).connect(g).connect(p).connect(master)
  src.start(t, Math.random(), dur + 0.05)
}

function thump(t: number, from: number, to: number, dur: number, gain: number, pan = 0) {
  if (!ctx || !master) return
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(from, t)
  o.frequency.exponentialRampToValueAtTime(to, t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  const p = ctx.createStereoPanner()
  p.pan.value = pan
  o.connect(g).connect(p).connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)
}

/** Distance attenuation relative to the camera end of the court. */
function near(z: number) {
  return 0.35 + 0.65 * Math.max(0, Math.min(1, (z + 12) / 24))
}

export function playHit(power: number, x: number, z: number) {
  if (!ctx) return
  const t = ctx.currentTime
  const v = near(z) * (0.55 + power * 0.6)
  const pan = Math.max(-0.7, Math.min(0.7, x / 8))
  noiseBurst(t, 0.07, 1500 + power * 900, 1.4, v * 0.9, pan)
  noiseBurst(t, 0.03, 4200, 2, v * 0.35, pan)
  thump(t, 260 + power * 80, 110, 0.07, v * 0.7, pan)
}

export function playBounce(power: number, x: number, z: number) {
  if (!ctx) return
  const t = ctx.currentTime
  const v = near(z) * (0.2 + power * 0.5)
  const pan = Math.max(-0.7, Math.min(0.7, x / 8))
  thump(t, 170, 70, 0.06, v, pan)
  noiseBurst(t, 0.04, 900, 1, v * 0.5, pan)
}

export function playNet() {
  if (!ctx) return
  const t = ctx.currentTime
  noiseBurst(t, 0.22, 380, 0.7, 0.35)
  thump(t, 120, 60, 0.12, 0.25)
}

export function playFence() {
  if (!ctx) return
  const t = ctx.currentTime
  for (let i = 0; i < 4; i++) noiseBurst(t + i * 0.025, 0.12, 2400 + i * 300, 4, 0.12)
}

function startCrowd() {
  if (!ctx || !master || !noise) return
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.loop = true
  // A low murmur under the applause only. It used to run all the time at a low level, which
  // the output compressor lifted into a constant hiss on phone speakers: silent at rest now.
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 500
  const gain = ctx.createGain()
  gain.gain.value = 0
  src.connect(f).connect(gain).connect(master)
  src.start()
  crowd = { gain }
}

/** Applause swell: many short claps through a bandpass. */
export function playApplause(strength = 1) {
  if (!ctx || !crowd) return
  const t = ctx.currentTime
  const n = Math.floor(40 + 50 * strength)
  for (let i = 0; i < n; i++) {
    const at = t + Math.random() * (1.6 + strength)
    noiseBurst(
      at,
      0.03,
      1100 + Math.random() * 1400,
      1.2,
      0.05 * strength * (1 - (at - t) / 3.2),
      Math.random() * 1.4 - 0.7,
    )
  }
  crowd.gain.gain.setTargetAtTime(0.04 * strength, t, 0.2)
  crowd.gain.gain.setTargetAtTime(0, t + 1.5, 0.8)
}

export function playGroan() {
  if (!ctx || !master || !noise) return
  const t = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = noise
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.setValueAtTime(700, t)
  f.frequency.linearRampToValueAtTime(260, t + 1.1)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.12, t + 0.15)
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.2)
  src.connect(f).connect(g).connect(master)
  src.start(t, 0, 1.3)
}
