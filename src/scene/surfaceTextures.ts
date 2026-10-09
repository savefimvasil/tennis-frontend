import * as THREE from 'three'
import { rng } from './textures'

// Procedural PBR maps for the court surfaces. Three layers per surface keep it from
// looking like plastic:
//  - a large non-repeating colour map over the whole area (tone variation, wear, stripes),
//  - a fine tiling normal map for the grain (sand in acrylic, clay granules, grass blades),
//  - a mid-scale roughness map so highlights break up instead of sliding across.

/** Tileable fractal value noise in [0, 1]. `freq` lattice cells across the tile for the first octave. */
function fbm(w: number, h: number, freq: number, octaves: number, seed: number, stretchY = 1): Float32Array {
  const out = new Float32Array(w * h)
  let amp = 1
  let total = 0
  for (let o = 0; o < octaves; o++) {
    const fx = freq << o
    const fy = Math.max(1, Math.round((freq << o) / stretchY))
    const r = rng(seed * 7919 + o * 104729)
    const lattice = new Float32Array(fx * fy)
    for (let i = 0; i < lattice.length; i++) lattice[i] = r()
    for (let y = 0; y < h; y++) {
      const gy = (y / h) * fy
      const y0 = Math.floor(gy)
      const ty = gy - y0
      const sy = ty * ty * (3 - 2 * ty)
      const r0 = (y0 % fy) * fx
      const r1 = ((y0 + 1) % fy) * fx
      for (let x = 0; x < w; x++) {
        const gx = (x / w) * fx
        const x0 = Math.floor(gx)
        const tx = gx - x0
        const sx = tx * tx * (3 - 2 * tx)
        const c0 = x0 % fx
        const c1 = (x0 + 1) % fx
        const a = lattice[r0 + c0] + (lattice[r0 + c1] - lattice[r0 + c0]) * sx
        const b = lattice[r1 + c0] + (lattice[r1 + c1] - lattice[r1 + c0]) * sx
        out[y * w + x] += (a + (b - a) * sy) * amp
      }
    }
    total += amp
    amp *= 0.5
  }
  for (let i = 0; i < out.length; i++) out[i] /= total
  return out
}

function toTexture(w: number, h: number, fill: (data: Uint8ClampedArray) => void, color: boolean) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const img = g.createImageData(w, h)
  fill(img.data)
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  if (color) t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

/** Tangent-space normal map (OpenGL convention) from a tileable height field. */
function normalMap(height: Float32Array, w: number, h: number, strength: number) {
  return toTexture(
    w,
    h,
    (d) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const l = height[y * w + ((x - 1 + w) % w)]
          const r = height[y * w + ((x + 1) % w)]
          const u = height[((y - 1 + h) % h) * w + x]
          const dn = height[((y + 1) % h) * w + x]
          const nx = (l - r) * strength
          const ny = (dn - u) * strength
          const len = Math.hypot(nx, ny, 1)
          const i = (y * w + x) * 4
          d[i] = ((nx / len) * 0.5 + 0.5) * 255
          d[i + 1] = ((ny / len) * 0.5 + 0.5) * 255
          d[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
          d[i + 3] = 255
        }
      }
    },
    false,
  )
}

function roughnessMap(w: number, h: number, base: number, spread: number, seed: number) {
  const n = fbm(w, h, 6, 4, seed)
  return toTexture(
    w,
    h,
    (d) => {
      for (let i = 0; i < n.length; i++) {
        const v = Math.max(0, Math.min(1, base + (n[i] - 0.5) * spread)) * 255
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v
        d[i * 4 + 3] = 255
      }
    },
    false,
  )
}

/** Large colour map: base colour modulated by low-frequency patches and fine speckle. */
function colourMap(
  w: number,
  h: number,
  base: THREE.Color,
  alt: THREE.Color,
  seed: number,
  extra?: (x: number, y: number) => number,
) {
  const macro = fbm(w, h, 4, 5, seed)
  const speck = fbm(w, h, 96, 2, seed + 3)
  return toTexture(
    w,
    h,
    (d) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x
          // Blend toward the alternate tone in patches, then add speckle and any pattern.
          const m = Math.max(0, Math.min(1, (macro[i] - 0.35) * 1.6))
          const k = 1 + (speck[i] - 0.5) * 0.16 + (extra ? extra(x, y) : 0)
          d[i * 4] = Math.min(255, (base.r + (alt.r - base.r) * m) * 255 * k)
          d[i * 4 + 1] = Math.min(255, (base.g + (alt.g - base.g) * m) * 255 * k)
          d[i * 4 + 2] = Math.min(255, (base.b + (alt.b - base.b) * m) * 255 * k)
          d[i * 4 + 3] = 255
        }
      }
    },
    true,
  )
}

export interface SurfaceMaps {
  map: THREE.Texture
  normalMap: THREE.Texture
  roughnessMap: THREE.Texture
  normalScale: number
  /** Metres covered by one tile of the grain normal map. */
  grainTile: number
  /** Metres covered by one tile of the roughness map. */
  roughTile: number
}

const cache = new Map<string, SurfaceMaps>()

/** Colour components in sRGB, as written into an sRGB canvas texture. */
function srgb(hex: string) {
  const c = { r: 0, g: 0, b: 0 }
  new THREE.Color(hex).getRGB(c, THREE.SRGBColorSpace)
  return new THREE.Color(c.r, c.g, c.b)
}

/**
 * PBR maps for an area of `width` x `length` metres. `kind` picks the material character.
 * The colour map covers the whole area once; grain and roughness tile at fixed sizes.
 */
export function surfaceMaps(kind: 'hard' | 'hardOuter' | 'clay' | 'grass', length: number): SurfaceMaps {
  const key = kind + length
  const hit = cache.get(key)
  if (hit) return hit
  let maps: SurfaceMaps
  if (kind === 'hard' || kind === 'hardOuter') {
    // Acrylic hard court: paint with sand mixed in. Matte, fine sandpaper grain.
    const base = srgb(kind === 'hard' ? '#2b5c8e' : '#3c7455')
    const alt = srgb(kind === 'hard' ? '#336a9c' : '#457e5c')
    const grain = fbm(256, 256, 48, 3, 11)
    maps = {
      map: colourMap(256, 512, base, alt, kind === 'hard' ? 5 : 6),
      normalMap: normalMap(grain, 256, 256, 2.2),
      roughnessMap: roughnessMap(128, 128, 0.86, 0.18, 21),
      normalScale: 0.9,
      grainTile: 0.6,
      roughTile: 3,
    }
  } else if (kind === 'clay') {
    // Crushed brick: coarse granules, darker damp patches, sweeper brush streaks.
    const grain = fbm(256, 256, 64, 3, 31)
    const streak = fbm(256, 512, 2, 3, 37, 0.08)
    maps = {
      map: colourMap(256, 512, srgb('#c0603a'), srgb('#a54f2f'), 33, (x, y) => (streak[y * 256 + x] - 0.5) * 0.12),
      normalMap: normalMap(grain, 256, 256, 3.4),
      roughnessMap: roughnessMap(128, 128, 0.95, 0.1, 35),
      normalScale: 1.2,
      grainTile: 0.5,
      roughTile: 2,
    }
  } else {
    // Mown grass: 2 m stripes across the court, blades as stretched noise.
    const blades = fbm(256, 256, 64, 3, 41, 6)
    const stripes = (_x: number, y: number) => (Math.floor((y / 512) * (length / 2)) % 2 === 0 ? 1 : -1) * 0.07
    maps = {
      map: colourMap(256, 512, srgb('#4b8638'), srgb('#5a8f3c'), 43, stripes),
      normalMap: normalMap(blades, 256, 256, 2.6),
      roughnessMap: roughnessMap(128, 128, 0.9, 0.14, 45),
      normalScale: 1,
      grainTile: 0.4,
      roughTile: 2,
    }
  }
  cache.set(key, maps)
  return maps
}

/** Material for a ground plane of `width` x `length` metres using the surface maps. */
export function surfaceMaterial(maps: SurfaceMaps, width: number, length: number) {
  const tile = (t: THREE.Texture, size: number) => {
    const c = t.clone()
    c.repeat.set(width / size, length / size)
    c.needsUpdate = true
    return c
  }
  return new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: tile(maps.normalMap, maps.grainTile),
    normalScale: new THREE.Vector2(maps.normalScale, maps.normalScale),
    roughnessMap: tile(maps.roughnessMap, maps.roughTile),
    roughness: 1,
    metalness: 0,
    // Ground reflects the sky only faintly; strong reflections are what read as plastic.
    envMapIntensity: 0.35,
  })
}
