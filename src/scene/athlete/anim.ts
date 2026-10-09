// Pure helpers for the athlete animation (no three.js, no React), so they can be unit tested.
// Angles are radians; "local" means relative to the athlete's facing (+z forward, +x to the right
// of a player facing +z).

/** Monotone cubic Hermite through (ts, vs): smooth velocity, no overshoot between keys. */
export function monotoneCubic(ts: readonly number[], vs: readonly number[], t: number): number {
  const n = ts.length
  if (t <= ts[0]) return vs[0]
  if (t >= ts[n - 1]) return vs[n - 1]
  let i = 0
  while (i < n - 2 && t > ts[i + 1]) i++
  const h = ts[i + 1] - ts[i]
  const d = (vs[i + 1] - vs[i]) / h
  const tangent = (k: number) => {
    if (k === 0 || k === n - 1) return 0
    const d0 = (vs[k] - vs[k - 1]) / (ts[k] - ts[k - 1])
    const d1 = (vs[k + 1] - vs[k]) / (ts[k + 1] - ts[k])
    // A local extremum (or a hold) stops there; otherwise keep moving through the key.
    if (d0 * d1 <= 0) return 0
    // Weighted harmonic mean (Fritsch-Butland): stays monotone on uneven key spacing.
    const w0 = 2 * (ts[k + 1] - ts[k]) + (ts[k] - ts[k - 1])
    const w1 = ts[k + 1] - ts[k] + 2 * (ts[k] - ts[k - 1])
    return (w0 + w1) / (w0 / d0 + w1 / d1)
  }
  const m0 = tangent(i)
  const m1 = tangent(i + 1)
  const u = (t - ts[i]) / h
  const u2 = u * u
  const u3 = u2 * u
  // Clamp the tangents so the segment never overshoots its end values.
  const lim = 3 * Math.abs(d)
  const c0 = Math.max(-lim, Math.min(lim, m0))
  const c1 = Math.max(-lim, Math.min(lim, m1))
  return (
    (2 * u3 - 3 * u2 + 1) * vs[i] + (u3 - 2 * u2 + u) * h * c0 + (-2 * u3 + 3 * u2) * vs[i + 1] + (u3 - u2) * h * c1
  )
}

/** Stride of one full leg cycle (two steps) for a running speed: short quick steps when slow. */
export function strideLength(speed: number): number {
  return Math.max(0.9, Math.min(2.3, 0.85 + speed * 0.3))
}

export interface Gait {
  /** 0..1: how much of the motion is a forward/backward run. */
  run: number
  /** 0..1: side-shuffle share (lateral steps without crossing the feet). */
  shuffle: number
  /** Target hip yaw (radians): hips turn into a crossover run on fast lateral moves. */
  hipYaw: number
  /** +1 running forward, -1 backpedalling (for the leg swing direction). */
  dir: 1 | -1
}

/**
 * Splits local velocity into gait layers. Slow lateral moves are side shuffles facing the net;
 * fast ones turn the hips into a crossover run. The hip target is continuous in the direction
 * of travel, so moving straight sideways no longer flips the hips from one side to the other.
 */
export function gaitFor(lx: number, lz: number): Gait {
  const speed = Math.hypot(lx, lz)
  if (speed < 0.25) return { run: 0, shuffle: 0, hipYaw: 0, dir: 1 }
  const lateral = Math.abs(lx) / speed
  // Above ~3.5 m/s a sideways move becomes a turned run (crossover), below it a shuffle.
  const cross = smoothstep(3, 4.6, speed)
  const shuffle = lateral * lateral * (1 - cross)
  const run = 1 - shuffle
  const heading = Math.atan2(lx, Math.abs(lz))
  const hipYaw = Math.max(-1.1, Math.min(1.1, heading)) * (0.25 + 0.75 * cross) * Math.min(1, speed / 1.5)
  return { run, shuffle, hipYaw, dir: lz < -0.2 * speed ? -1 : 1 }
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** Exponential approach factor for a time constant given as a rate (1/s). */
export function approach(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt)
}

/** World velocity -> local (facing) frame for a body turned by `yaw` about y. */
export function toLocal(vx: number, vz: number, yaw: number): { x: number; z: number } {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return { x: vx * c - vz * s, z: vx * s + vz * c }
}

/**
 * Body lean from local acceleration (m/s²): forward when speeding up, back when braking,
 * into the turn sideways. Returns [pitch, roll] for the spine.
 */
export function leanFromAccel(ax: number, az: number): [number, number] {
  const pitch = Math.max(-0.22, Math.min(0.26, az * 0.022))
  const roll = Math.max(-0.2, Math.min(0.2, -ax * 0.02))
  return [pitch, roll]
}

/**
 * Head turn toward a point given in the chest's local frame (x right, y up, z forward).
 * Returns [pitch, yaw] additions for the neck joint (negative pitch looks up).
 */
export function lookAngles(x: number, y: number, z: number): [number, number] {
  const yaw = Math.max(-1.0, Math.min(1.0, Math.atan2(x, Math.max(0.05, z))))
  const horiz = Math.hypot(x, z)
  const pitch = Math.max(-0.7, Math.min(0.45, -Math.atan2(y, Math.max(0.3, horiz)) * 0.8))
  return [pitch, yaw]
}

/** Shortest signed difference between two angles. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * Swing time remap for a prepared backswing: the shot starts from the take-back the player
 * already made (fraction `prep` of the way to the backswing key), not from the ready stance.
 */
export function preparedSwingTime(t: number, prep: number, backswingT: number): number {
  if (t >= backswingT || prep <= 0) return t
  return backswingT * prep + t * (1 - prep)
}
