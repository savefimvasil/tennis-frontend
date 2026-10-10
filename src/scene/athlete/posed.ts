import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { athleteMaterial, AVATAR_BASE, mergeByMaterial, setShirt } from './Rocketbox'
import { SKINS, type Skin } from './skins'

// Rocketbox avatars in fixed poses, for people who do not play: the umpire, ball kids and
// the crowd (baked into a sprite atlas). Bones are aimed directly in world space, so no
// animation rig is needed. The avatar is authored facing +z with its root at the floor.

export type StillPose = 'sit' | 'clapA' | 'clapB' | 'cheer' | 'umpire' | 'kneel' | 'attention'

const v1 = new THREE.Vector3()
const v2 = new THREE.Vector3()
const q1 = new THREE.Quaternion()
const q2 = new THREE.Quaternion()

/** Turns `bone` so the direction to `child` points along `dir` (world space). */
function aim(scene: THREE.Object3D, bone: string, child: string, dir: THREE.Vector3Like) {
  const b = scene.getObjectByName(bone)
  const c = scene.getObjectByName(child)
  if (!b || !c || !b.parent) return
  b.updateWorldMatrix(true, true)
  const cur = c.getWorldPosition(v2).sub(b.getWorldPosition(v1)).normalize()
  const turn = q1.setFromUnitVectors(cur, new THREE.Vector3(dir.x, dir.y, dir.z).normalize())
  const world = b.getWorldQuaternion(q2).premultiply(turn)
  b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world))
  b.updateMatrixWorld(true)
}

/** Moves the hips (and everything above and below them) down by `dy` metres. */
function lowerPelvis(scene: THREE.Object3D, dy: number) {
  const hips = scene.getObjectByName('Bip01')
  if (!hips?.parent) return
  hips.parent.updateWorldMatrix(true, false)
  const local = hips.parent.worldToLocal(hips.getWorldPosition(v1).add(v2.set(0, -dy, 0)))
  hips.position.copy(local)
  hips.updateMatrixWorld(true)
}

interface Limb {
  thigh?: THREE.Vector3Like
  calf?: THREE.Vector3Like
  upper?: THREE.Vector3Like
  fore?: THREE.Vector3Like
}

/** Limb directions per pose, written for the avatar's left side (+x); mirrored for the right. */
const POSES: Record<StillPose, { limb: Limb; drop?: number; right?: Limb }> = {
  // Seated: thighs forward, shins down, hands resting on the thighs.
  sit: {
    limb: {
      thigh: { x: 0.12, y: -0.15, z: 1 },
      calf: { x: 0.04, y: -1, z: 0.12 },
      upper: { x: 0.14, y: -0.9, z: 0.35 },
      fore: { x: -0.12, y: -0.35, z: 1 },
    },
  },
  clapA: {
    limb: {
      thigh: { x: 0.12, y: -0.15, z: 1 },
      calf: { x: 0.04, y: -1, z: 0.12 },
      upper: { x: 0.25, y: -0.55, z: 0.75 },
      fore: { x: -0.62, y: 0.42, z: 0.65 },
    },
  },
  clapB: {
    limb: {
      thigh: { x: 0.12, y: -0.15, z: 1 },
      calf: { x: 0.04, y: -1, z: 0.12 },
      upper: { x: 0.28, y: -0.5, z: 0.75 },
      fore: { x: -0.15, y: 0.55, z: 0.85 },
    },
  },
  cheer: {
    limb: {
      thigh: { x: 0.12, y: -0.15, z: 1 },
      calf: { x: 0.04, y: -1, z: 0.12 },
      upper: { x: 0.45, y: 0.9, z: 0.12 },
      fore: { x: 0.18, y: 1, z: 0.06 },
    },
  },
  umpire: {
    limb: {
      thigh: { x: 0.1, y: -0.12, z: 1 },
      calf: { x: 0.03, y: -1, z: 0.1 },
      upper: { x: 0.1, y: -0.82, z: 0.5 },
      fore: { x: -0.3, y: -0.05, z: 1 },
    },
  },
  // Ball kid down on one knee at the net post, ready to run.
  kneel: {
    drop: 0.42,
    limb: {
      thigh: { x: 0.12, y: -0.2, z: 1 },
      calf: { x: 0.02, y: -1, z: 0.05 },
      upper: { x: 0.12, y: -0.75, z: 0.55 },
      fore: { x: -0.25, y: -0.45, z: 0.85 },
    },
    right: {
      thigh: { x: 0.08, y: -1, z: 0.15 },
      calf: { x: 0, y: -0.12, z: -1 },
      upper: { x: 0.12, y: -0.75, z: 0.55 },
      fore: { x: -0.25, y: -0.45, z: 0.85 },
    },
  },
  // Standing still, hands behind the back.
  attention: {
    limb: { upper: { x: 0.1, y: -1, z: -0.22 }, fore: { x: -0.55, y: -0.2, z: -0.55 } },
  },
}

export interface PosedAvatar {
  scene: THREE.Group
  /** Re-poses the same avatar. */
  pose(p: StillPose): void
  /** Swaps the shirt colour (null: the avatar's own). Returns the material in use. */
  shirt(hex: string | null): void
  /** The three materials, to tell the parts apart. */
  materials: { body: THREE.MeshStandardMaterial; head: THREE.MeshStandardMaterial; hair: THREE.MeshStandardMaterial }
  /** Frees the avatar; materials in `keep` stay (something else renders with them). */
  dispose(keep?: Set<THREE.Material>): void
}

type AvatarTextures = Record<'body' | 'bodyNormal' | 'head' | 'headNormal', THREE.Texture> & { opacity?: THREE.Texture }

/** Loads an avatar's model and textures (suspends). */
export function useAvatarAssets(skin: Skin) {
  const gltf = useGLTF(AVATAR_BASE + skin.glb)
  const tex = useTexture({
    body: AVATAR_BASE + skin.body,
    bodyNormal: AVATAR_BASE + skin.bodyNormal,
    head: AVATAR_BASE + skin.head,
    headNormal: AVATAR_BASE + skin.headNormal,
    ...(skin.opacity ? { opacity: AVATAR_BASE + skin.opacity } : {}),
  }) as AvatarTextures
  return { gltf, tex }
}

export function buildPosed(
  assets: ReturnType<typeof useAvatarAssets>,
  opts: { castShadow?: boolean } = {},
): PosedAvatar {
  const { gltf, tex } = assets
  const scene = cloneSkinned(gltf.scene) as THREE.Group
  for (const t of [tex.body, tex.head]) t.colorSpace = THREE.SRGBColorSpace
  const body = athleteMaterial(
    new THREE.MeshStandardMaterial({ map: tex.body, normalMap: tex.bodyNormal, roughness: 0.75 }),
    0,
  )
  const head = new THREE.MeshStandardMaterial({ map: tex.head, normalMap: tex.headNormal, roughness: 0.6 })
  const hair = new THREE.MeshStandardMaterial({
    map: tex.head,
    alphaMap: tex.opacity,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.7,
  })
  const pick = (m: THREE.Material) => (m.name.includes('opacity') ? hair : m.name.includes('head') ? head : body)
  const geometries = mergeByMaterial(scene, pick)
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh
    if (m.isSkinnedMesh) m.castShadow = m.receiveShadow = !!opts.castShadow
  })
  // Rest pose, to re-pose from scratch.
  const rest = new Map<THREE.Object3D, { q: THREE.Quaternion; p: THREE.Vector3 }>()
  scene.traverse((o) => rest.set(o, { q: o.quaternion.clone(), p: o.position.clone() }))
  scene.updateMatrixWorld(true)
  // Which side of the body is +x.
  const leftX = Math.sign(scene.getObjectByName('Bip01_L_UpperArm')!.getWorldPosition(v1).x) || 1

  const applyLimbs = (side: 'L' | 'R', limb: Limb, mirror: number) => {
    const m = (d: THREE.Vector3Like) => ({ x: d.x * mirror, y: d.y, z: d.z })
    if (limb.thigh) aim(scene, `Bip01_${side}_Thigh`, `Bip01_${side}_Calf`, m(limb.thigh))
    if (limb.calf) aim(scene, `Bip01_${side}_Calf`, `Bip01_${side}_Foot`, m(limb.calf))
    if (limb.upper) aim(scene, `Bip01_${side}_UpperArm`, `Bip01_${side}_Forearm`, m(limb.upper))
    if (limb.fore) aim(scene, `Bip01_${side}_Forearm`, `Bip01_${side}_Hand`, m(limb.fore))
  }

  return {
    scene,
    materials: { body, head, hair },
    pose(p) {
      for (const [o, r] of rest) {
        o.quaternion.copy(r.q)
        o.position.copy(r.p)
      }
      scene.updateMatrixWorld(true)
      const def = POSES[p]
      if (def.drop) lowerPelvis(scene, def.drop)
      applyLimbs('L', def.limb, leftX)
      applyLimbs('R', def.right ?? def.limb, -leftX)
      scene.updateMatrixWorld(true)
    },
    shirt(hex) {
      setShirt(body, hex)
    },
    dispose(keep) {
      for (const g of geometries) g.dispose()
      for (const m of [body, head, hair]) if (!keep?.has(m)) m.dispose()
    },
  }
}

export const MALE_SKIN = SKINS[0]
export const FEMALE_SKIN = SKINS.find((s) => s.id === 'female')!
