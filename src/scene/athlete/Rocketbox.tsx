import { useImperativeHandle, useMemo, type Ref } from 'react'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { Joint } from './poses'

// Microsoft Rocketbox avatar (MIT) driven by the procedural rig.
// The rig computes joint rotations in "arms hanging" space; each Rocketbox bone copies
// its rig joint's world rotation, corrected from the avatar's A-pose rest orientation.

const BASE = import.meta.env.BASE_URL + 'models/rocketbox/'

export interface RocketboxSpec {
  glb: string
  body: string
  bodyNormal: string
  head: string
  headNormal: string
}

export const ROCKETBOX: Record<'home' | 'away', RocketboxSpec> = {
  home: {
    glb: 'Sports_Male_04.glb',
    body: 'm026_body_color.jpg',
    bodyNormal: 'm026_body_normal.jpg',
    head: 'm026_head_color.jpg',
    headNormal: 'm026_head_normal.jpg',
  },
  away: {
    glb: 'Sports_Male_04.glb',
    body: 'm026_body_color_red.jpg',
    bodyNormal: 'm026_body_normal.jpg',
    head: 'm026_head_color.jpg',
    headNormal: 'm026_head_normal.jpg',
  },
}

/** Rig proportions matching the Rocketbox skeleton (metres). */
export const ROCKETBOX_DIMS = { pelvisY: 0.893, spineY: 0.12, shoulderY: 0.412, shoulderX: 0.21 }

type Source = { joint: Joint | 'pelvis'; blendFrom?: Joint | 'pelvis'; blend?: number }

/** Bone -> rig joint. Partial blends spread spine twist over several vertebrae. */
const MAP: Record<string, Source> = {
  Bip01_Pelvis: { joint: 'pelvis' },
  Bip01_Spine: { joint: 'spine', blendFrom: 'pelvis', blend: 0.34 },
  Bip01_Spine1: { joint: 'spine', blendFrom: 'pelvis', blend: 0.67 },
  Bip01_Spine2: { joint: 'spine' },
  Bip01_Neck: { joint: 'neck', blendFrom: 'spine', blend: 0.5 },
  Bip01_Head: { joint: 'neck' },
  Bip01_R_UpperArm: { joint: 'rSh' },
  Bip01_R_Forearm: { joint: 'rEl' },
  Bip01_R_Hand: { joint: 'rWr' },
  Bip01_L_UpperArm: { joint: 'lSh' },
  Bip01_L_Forearm: { joint: 'lEl' },
  Bip01_L_Hand: { joint: 'lEl' },
  Bip01_L_Thigh: { joint: 'lHip' },
  Bip01_L_Calf: { joint: 'lKnee' },
  Bip01_L_Foot: { joint: 'lKnee' },
  Bip01_R_Thigh: { joint: 'rHip' },
  Bip01_R_Calf: { joint: 'rKnee' },
  Bip01_R_Foot: { joint: 'rKnee' },
}

/** Bones whose rest direction (towards `child`) is rotated to hang straight down. */
const HANG: Record<string, string> = {
  Bip01_R_UpperArm: 'Bip01_R_Forearm',
  Bip01_R_Forearm: 'Bip01_R_Hand',
  Bip01_R_Hand: 'Bip01_R_Finger2',
  Bip01_L_UpperArm: 'Bip01_L_Forearm',
  Bip01_L_Forearm: 'Bip01_L_Hand',
  Bip01_L_Hand: 'Bip01_L_Finger2',
  Bip01_L_Thigh: 'Bip01_L_Calf',
  Bip01_L_Calf: 'Bip01_L_Foot',
  Bip01_R_Thigh: 'Bip01_R_Calf',
  Bip01_R_Calf: 'Bip01_R_Foot',
}
/** Feet keep their rest angle relative to the corrected calf. */
const SHARE_HANG: Record<string, string> = { Bip01_L_Foot: 'Bip01_L_Calf', Bip01_R_Foot: 'Bip01_R_Calf' }

export interface RocketboxHandle {
  drive(joints: Record<Joint | 'pelvis', THREE.Object3D>, lift: number): void
}

interface Driven {
  bone: THREE.Bone
  src: Source
  restHang: THREE.Quaternion
}

const qa = new THREE.Quaternion()
const qb = new THREE.Quaternion()
const qParent = new THREE.Quaternion()
const vLift = new THREE.Vector3()

export function RocketboxBody({ spec, handle }: { spec: RocketboxSpec; handle: Ref<RocketboxHandle> }) {
  const gltf = useGLTF(BASE + spec.glb)
  const tex = useTexture({
    body: BASE + spec.body,
    bodyNormal: BASE + spec.bodyNormal,
    head: BASE + spec.head,
    headNormal: BASE + spec.headNormal,
  })

  const rig = useMemo(() => {
    const scene = cloneSkinned(gltf.scene)
    for (const t of [tex.body, tex.head]) t.colorSpace = THREE.SRGBColorSpace
    for (const t of Object.values(tex)) t.anisotropy = 8
    const body = new THREE.MeshPhysicalMaterial({
      map: tex.body,
      normalMap: tex.bodyNormal,
      roughness: 0.72,
      sheen: 0.35,
      sheenRoughness: 0.7,
      sheenColor: new THREE.Color('#ffffff'),
    })
    const head = new THREE.MeshPhysicalMaterial({ map: tex.head, normalMap: tex.headNormal, roughness: 0.55, sheen: 0.15 })
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh
      if (!m.isMesh) return
      m.castShadow = true
      m.receiveShadow = true
      // Skinned bounds follow the rest pose; skip culling so swings never pop out.
      m.frustumCulled = false
      const pick = (mat: THREE.Material) => (mat.name.includes('head') ? head : body)
      m.material = Array.isArray(m.material) ? m.material.map(pick) : pick(m.material)
    })

    // Rest pose, measured in the avatar's own space (it is authored facing +z, metres).
    scene.updateMatrixWorld(true)
    const rootInv = new THREE.Quaternion()
    scene.getWorldQuaternion(rootInv).invert()
    const down = new THREE.Vector3(0, -1, 0)
    const corrections = new Map<string, THREE.Quaternion>()
    const pos = (n: string) => scene.getObjectByName(n)!.getWorldPosition(new THREE.Vector3())
    for (const [bone, child] of Object.entries(HANG)) {
      const dir = pos(child).sub(pos(bone)).normalize()
      corrections.set(bone, new THREE.Quaternion().setFromUnitVectors(dir, down))
    }
    const driven: Driven[] = []
    // Traversal order is parent-before-child, which drive() relies on.
    scene.traverse((o) => {
      const src = MAP[o.name]
      if (!src || !(o as THREE.Bone).isBone) return
      const restModel = o.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootInv)
      const corr = corrections.get(o.name) ?? corrections.get(SHARE_HANG[o.name] ?? '') ?? new THREE.Quaternion()
      driven.push({ bone: o as THREE.Bone, src, restHang: corr.clone().multiply(restModel) })
    })
    const hips = scene.getObjectByName('Bip01') as THREE.Bone
    return { scene, driven, hips, hipsRest: hips.position.clone() }
  }, [gltf, tex])

  useImperativeHandle(
    handle,
    () => ({
      drive(joints, lift) {
        const { driven, hips, hipsRest } = rig
        // Pelvis height: move the root bone by `lift` in world space.
        const parent = hips.parent!
        parent.updateWorldMatrix(true, false)
        vLift.set(0, lift, 0).applyQuaternion(parent.getWorldQuaternion(qParent).invert())
        const sc = parent.getWorldScale(new THREE.Vector3())
        hips.position.set(hipsRest.x + vLift.x / sc.x, hipsRest.y + vLift.y / sc.y, hipsRest.z + vLift.z / sc.z)
        hips.updateMatrixWorld()

        for (const d of driven) {
          joints[d.src.joint].getWorldQuaternion(qa)
          if (d.src.blendFrom) {
            joints[d.src.blendFrom].getWorldQuaternion(qb)
            qa.copy(qb.slerp(qa, d.src.blend ?? 1))
          }
          // Desired world rotation, then convert to the bone's local space.
          qa.multiply(d.restHang)
          d.bone.parent!.getWorldQuaternion(qParent)
          d.bone.quaternion.copy(qParent.invert().multiply(qa))
          d.bone.updateMatrixWorld()
        }
      },
    }),
    [rig],
  )

  return <primitive object={rig.scene} />
}

useGLTF.preload(BASE + ROCKETBOX.home.glb)
