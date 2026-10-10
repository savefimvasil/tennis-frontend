import * as THREE from 'three'

// Procedural PBR sets (colour, normal, roughness) for materials the photo library lacks:
// light glulam timber, painted or oiled planks, and the hall's woven membrane. Generated once
// on a canvas at load time, so there is nothing to download and no licence to track.

function hash(x: number, y: number, seed: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return s - Math.floor(s)
}

/** Tileable value noise: the lattice wraps every `period` cells. */
function noise(x: number, y: number, period: number, seed: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const w = (v: number) => ((v % period) + period) % period
  const a = hash(w(ix), w(iy), seed)
  const b = hash(w(ix + 1), w(iy), seed)
  const c = hash(w(ix), w(iy + 1), seed)
  const d = hash(w(ix + 1), w(iy + 1), seed)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

function fbm(x: number, y: number, period: number, seed: number, octaves = 4) {
  let s = 0
  let amp = 0.5
  let norm = 0
  let p = period
  for (let i = 0; i < octaves; i++) {
    s += noise(x, y, p, seed + i) * amp
    norm += amp
    x *= 2
    y *= 2
    p *= 2
    amp *= 0.5
  }
  return s / norm
}

export interface PbrMaps {
  map: THREE.Texture
  normalMap: THREE.Texture
  roughnessMap: THREE.Texture
}

/**
 * Builds the three maps from per-pixel functions: colour (sRGB 0..1), height (0..1) and
 * roughness (0..1). The normal map comes from the height field's gradient, wrapping at the edges.
 */
function build(
  size: number,
  pixel: (u: number, v: number) => { r: number; g: number; b: number; h: number; rough: number },
  bump: number,
): PbrMaps {
  const col = new Uint8ClampedArray(new ArrayBuffer(size * size * 4))
  const rough = new Uint8ClampedArray(new ArrayBuffer(size * size * 4))
  const height = new Float32Array(size * size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const p = pixel(x / size, y / size)
      const i = y * size + x
      col.set([p.r * 255, p.g * 255, p.b * 255, 255], i * 4)
      rough.set([0, p.rough * 255, 0, 255], i * 4)
      height[i] = p.h
    }
  const nrm = new Uint8ClampedArray(new ArrayBuffer(size * size * 4))
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * bump
      const dy = (at(x, y + 1) - at(x, y - 1)) * bump
      const len = Math.hypot(dx, dy, 1)
      nrm.set(
        [(-dx / len) * 127.5 + 127.5, (dy / len) * 127.5 + 127.5, (1 / len) * 127.5 + 127.5, 255],
        (y * size + x) * 4,
      )
    }
  const tex = (data: Uint8ClampedArray<ArrayBuffer>, srgb: boolean) => {
    const c = document.createElement('canvas')
    c.width = c.height = size
    c.getContext('2d')!.putImageData(new ImageData(data, size, size), 0, 0)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
    return t
  }
  return { map: tex(col, true), normalMap: tex(nrm, false), roughnessMap: tex(rough, false) }
}

const cache = new Map<string, PbrMaps>()
function memo(key: string, make: () => PbrMaps) {
  let m = cache.get(key)
  if (!m) cache.set(key, (m = make()))
  return m
}

/**
 * Glued-laminated spruce: grain along u, laminations stacked along v (`lams` per tile),
 * thin dark glue lines between them, growth rings swirling through the grain.
 */
export function glulam(lams = 6): PbrMaps {
  return memo(`glulam-${lams}`, () =>
    build(
      512,
      (u, v) => {
        const lam = Math.floor(v * lams)
        const lv = v * lams - lam
        // Growth rings: a wavy distance field, different for each lamination.
        const warp = fbm(u * 4, v * lams, 4, lam + 3) * 2.2
        const rings = Math.sin((lv * 3.2 + warp + lam * 1.7) * Math.PI * 2) * 0.5 + 0.5
        const late = Math.pow(rings, 6)
        const fibre = fbm(u * 64, v * lams * 3, 64, 9, 3)
        const tone = 0.92 + (hash(lam, 0, 5) - 0.5) * 0.12
        const glue = lv < 0.025 || lv > 0.975 ? 1 : 0
        let r = (0.86 - late * 0.12 - fibre * 0.05) * tone
        let g = (0.66 - late * 0.12 - fibre * 0.05) * tone
        let b = (0.42 - late * 0.1 - fibre * 0.04) * tone
        if (glue) ((r *= 0.55), (g *= 0.5), (b *= 0.45))
        return { r, g, b, h: 0.5 + fibre * 0.25 - late * 0.15 - glue * 0.6, rough: 0.55 + late * 0.1 + fibre * 0.1 }
      },
      2.5,
    ),
  )
}

/** Vertical tongue-and-groove planks (`n` per tile), oiled oak or painted (`paint` colour). */
export function planks(n = 8, paint?: [number, number, number]): PbrMaps {
  return memo(`planks-${n}-${paint?.join(',') ?? 'oak'}`, () =>
    build(
      512,
      (u, v) => {
        const k = Math.floor(u * n)
        const lu = u * n - k
        const warp = fbm(u * n, v * 3, n, k + 11) * 2
        const rings = Math.sin((lu * 2.4 + warp + v * 0.6 + k) * Math.PI * 2) * 0.5 + 0.5
        const late = Math.pow(rings, 5)
        const fibre = fbm(u * n * 6, v * 48, n * 6, 21, 3)
        const groove = lu < 0.03 || lu > 0.97 ? 1 : 0
        const tone = 0.9 + (hash(k, 1, 7) - 0.5) * 0.18
        let r: number
        let g: number
        let b: number
        if (paint) {
          const shade = 0.97 - late * 0.04 - fibre * 0.04
          ;[r, g, b] = paint.map((c) => c * shade) as [number, number, number]
        } else {
          r = (0.8 - late * 0.16 - fibre * 0.06) * tone
          g = (0.6 - late * 0.15 - fibre * 0.05) * tone
          b = (0.38 - late * 0.1 - fibre * 0.04) * tone
        }
        if (groove) ((r *= 0.45), (g *= 0.42), (b *= 0.4))
        const rough = paint ? 0.55 + fibre * 0.1 : 0.6 + late * 0.12 + fibre * 0.1
        return { r, g, b, h: 0.55 + fibre * 0.2 - late * (paint ? 0.04 : 0.12) - groove * 0.6, rough }
      },
      3,
    ),
  )
}

/** PVC-coated polyester membrane: a fine basket weave with a faint mottle. */
export function membrane(): PbrMaps {
  return memo('membrane', () =>
    build(
      256,
      (u, v) => {
        const wu = Math.sin(u * Math.PI * 2 * 64) * 0.5 + 0.5
        const wv = Math.sin(v * Math.PI * 2 * 64) * 0.5 + 0.5
        const weave = (Math.floor(u * 64) + Math.floor(v * 64)) % 2 ? wu : wv
        const mottle = fbm(u * 6, v * 6, 6, 31, 3)
        const c = 0.93 + mottle * 0.05 - weave * 0.02
        return { r: c, g: c * 0.99, b: c * 0.96, h: weave * 0.6 + mottle * 0.2, rough: 0.8 + weave * 0.1 }
      },
      1.2,
    ),
  )
}

/** Copies a set with its own repeat (the cached textures are shared). */
export function repeated(m: PbrMaps, x: number, y: number): PbrMaps {
  const r = (t: THREE.Texture) => {
    const c = t.clone()
    c.repeat.set(x, y)
    c.needsUpdate = true
    return c
  }
  return { map: r(m.map), normalMap: r(m.normalMap), roughnessMap: r(m.roughnessMap) }
}
