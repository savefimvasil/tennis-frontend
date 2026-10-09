import * as THREE from 'three'
import { rng } from './textures'

// Court surfaces. The photo-scanned detail (bottom of this file) is tinted by a procedural
// macro colour map; the fully procedural maps below stand in while the photos load.
// Three layers per surface keep it from looking like plastic:
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
  speckle = 0.16,
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
          const k = 1 + (speck[i] - 0.5) * speckle + (extra ? extra(x, y) : 0)
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

// ------------------------------------------------------------------ photo-scanned surfaces

export type SurfaceKind = 'hard' | 'hardOuter' | 'clay' | 'grass' | 'lawn'

/** Base and patch colours of the macro map per surface: the photo detail is tinted to these. */
const MACRO: Record<SurfaceKind, [string, string, number]> = {
  hard: ['#2b5c8e', '#336a9c', 5],
  hardOuter: ['#3c7455', '#457e5c', 6],
  clay: ['#c0603a', '#a54f2f', 33],
  grass: ['#4b8638', '#5a8f3c', 43],
  lawn: ['#55703c', '#4a6534', 47],
}

const macroCache = new Map<string, THREE.Texture>()

/**
 * The large non-repeating colour map laid once over the whole area: tone patches, plus clay
 * brush streaks or mown stripes. Fine speckle is left to the photo detail.
 */
export function macroMap(kind: SurfaceKind, length: number) {
  const key = 'macro' + kind + length
  const hit = macroCache.get(key)
  if (hit) return hit
  const [base, alt, seed] = MACRO[kind]
  let extra: ((x: number, y: number) => number) | undefined
  if (kind === 'clay') {
    const streak = fbm(256, 512, 2, 3, 37, 0.08)
    extra = (x, y) => (streak[y * 256 + x] - 0.5) * 0.12
  } else if (kind === 'grass') {
    extra = (_x, y) => (Math.floor((y / 512) * (length / 2)) % 2 === 0 ? 1 : -1) * 0.07
  }
  const t = colourMap(256, 512, srgb(base), srgb(alt), seed, extra, 0.03)
  macroCache.set(key, t)
  return t
}

/** Tiling of the photo detail per surface, in metres. Different periods hide the repeat. */
export const DETAIL = {
  hard: { grainTile: 2.4, roughTile: 3.7, normalScale: 0.55, roughness: 1.3 },
  clay: { grainTile: 1.8, roughTile: 2.9, normalScale: 0.45, roughness: 1.15 },
  grass: { grainTile: 1.4, roughTile: 2.3, normalScale: 0.9, roughness: 1.3 },
} as const

/**
 * Ground material: photo detail (colour normalised to a mean of linear 0.5, normal, roughness)
 * tiled in metres, multiplied by the macro colour map that spans the whole `width` x `length`.
 */
export function detailSurfaceMaterial(
  detail: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture },
  macro: THREE.Texture,
  width: number,
  length: number,
  d: { grainTile: number; roughTile: number; normalScale: number; roughness: number },
) {
  const tile = (t: THREE.Texture, size: number) => {
    const c = t.clone()
    c.repeat.set(width / size, length / size)
    c.needsUpdate = true
    return c
  }
  const mat = new THREE.MeshStandardMaterial({
    map: tile(detail.map, d.grainTile),
    normalMap: tile(detail.normalMap, d.grainTile),
    normalScale: new THREE.Vector2(d.normalScale, d.normalScale),
    roughnessMap: tile(detail.roughnessMap, d.roughTile),
    roughness: d.roughness,
    metalness: 0,
    envMapIntensity: 0.35,
  })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.macroMap = { value: macro }
    shader.vertexShader = shader.vertexShader
      .replace('#include <uv_pars_vertex>', '#include <uv_pars_vertex>\nvarying vec2 vMacroUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMacroUv = uv;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <uv_pars_fragment>',
        '#include <uv_pars_fragment>\nvarying vec2 vMacroUv;\nuniform sampler2D macroMap;',
      )
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\ndiffuseColor.rgb *= 2.0 * texture2D( macroMap, vMacroUv ).rgb;',
      )
  }
  mat.customProgramCacheKey = () => 'macro-detail'
  // The tiled copies are owned by the material; the macro map is cached and shared.
  const dispose = mat.dispose.bind(mat)
  mat.dispose = () => {
    mat.map?.dispose()
    mat.normalMap?.dispose()
    mat.roughnessMap?.dispose()
    dispose()
  }
  return mat
}
