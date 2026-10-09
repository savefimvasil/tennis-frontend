import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

// Photo-scanned CC0 PBR sets from public/textures (see public/textures/LICENSE.md and
// tools/textures/fetch.mjs). Loading suspends; callers keep a procedural fallback.

export type PbrSet =
  | 'court/hard'
  | 'court/clay'
  | 'court/grass'
  | 'venue/concrete'
  | 'venue/stucco'
  | 'venue/roof'
  | 'venue/paving'
  | 'venue/bark'

export interface PbrTextures {
  map: THREE.Texture
  normalMap: THREE.Texture
  roughnessMap: THREE.Texture
}

const BASE = `${import.meta.env.BASE_URL}textures/`

function urls(set: PbrSet) {
  return {
    map: `${BASE}${set}/color.webp`,
    normalMap: `${BASE}${set}/normal.webp`,
    roughnessMap: `${BASE}${set}/rough.webp`,
  }
}

/** Starts downloading sets before they are needed, so switching to them never suspends. */
export function preloadPbr(...sets: PbrSet[]) {
  for (const s of sets) useTexture.preload(Object.values(urls(s)))
}

/** Loads a set (suspends until ready). Colour is sRGB, normal and roughness linear; all repeat. */
export function usePbr(set: PbrSet): PbrTextures {
  const t = useTexture(urls(set)) as PbrTextures
  for (const [key, tex] of Object.entries(t) as [keyof PbrTextures, THREE.Texture][]) {
    const colorSpace = key === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace
    if (tex.colorSpace === colorSpace && tex.wrapS === THREE.RepeatWrapping) continue
    tex.colorSpace = colorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    // Anisotropic filtering is the main cost of these maps: only the ground, seen at grazing
    // angles, gets it. Walls, stands and trunks face the camera and look the same without.
    tex.anisotropy = set.startsWith('court/') ? 4 : 1
    tex.needsUpdate = true
  }
  return t
}

/** A copy with its own repeat; it shares the image (and the GPU texture) with the original. */
export function tiled(t: THREE.Texture, x: number, y: number) {
  const c = t.clone()
  c.repeat.set(x, y)
  c.needsUpdate = true
  return c
}

/**
 * Box-projected UVs in metres for geometry made of axis-aligned faces: each vertex is
 * projected along the dominant axis of its normal. Call after positioning the geometry.
 */
export function metreUvs(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i))
    const ny = Math.abs(nor.getY(i))
    const nz = Math.abs(nor.getZ(i))
    const [u, v] =
      ny >= nx && ny >= nz
        ? [pos.getX(i), pos.getZ(i)]
        : nx >= nz
          ? [pos.getZ(i), pos.getY(i)]
          : [pos.getX(i), pos.getY(i)]
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geo
}
