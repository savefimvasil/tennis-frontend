// Shared terrain functions for the backdrop: the hillside height field and noise fields.

/** Height of the hillside rising behind the club (metres), zero within ~95 m. */
export function hillHeight(x: number, z: number) {
  const r = Math.hypot(x, z)
  const ang = Math.atan2(z, x)
  // Strongest behind the club (-z), fading toward the bay (+x).
  const behind = Math.max(0, -Math.sin(ang)) * 0.75 + Math.max(0, -Math.cos(ang)) * 0.45
  const rise = Math.max(0, r - 95) * 0.16 * Math.min(1, behind)
  const ripple = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 6 + Math.sin(x * 0.05 + z * 0.03) * 2.5
  return rise > 0 ? rise + ripple * Math.min(1, rise / 12) : 0
}

function hash2(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Smooth value noise in [0, 1]. */
export function valueNoise(x: number, z: number) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  const a = hash2(ix, iz)
  const b = hash2(ix + 1, iz)
  const c = hash2(ix, iz + 1)
  const d = hash2(ix + 1, iz + 1)
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz
}

/** Fractal noise in roughly [0, 1]: large patches with smaller detail. */
export function fbm(x: number, z: number, octaves = 4) {
  let s = 0
  let amp = 0.5
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    s += valueNoise(x, z) * amp
    norm += amp
    x = x * 2.03 + 17.1
    z = z * 2.03 - 9.4
    amp *= 0.5
  }
  return s / norm
}

/** 0..1: how wooded the land is here (groves along gullies, open dry slopes between). */
export function woodland(x: number, z: number) {
  return fbm(x * 0.012, z * 0.012)
}
