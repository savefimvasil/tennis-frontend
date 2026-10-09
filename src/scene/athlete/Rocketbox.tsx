import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Joint } from './poses'
import { Racket } from './Racket'
import { SKINS, type Skin } from './skins'

// Microsoft Rocketbox avatar (MIT) driven by the procedural rig.
// The rig computes joint rotations in "arms hanging" space; each Rocketbox bone copies
// its rig joint's world rotation, corrected from the avatar's A-pose rest orientation.

const BASE = import.meta.env.BASE_URL + 'models/rocketbox/'

/** Rig proportions measured from the avatar's skeleton (metres). */
export interface RigDims {
  pelvisY: number
  spineY: number
  shoulderY: number
  shoulderX: number
}

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
  /** World position of the racket's sweet spot (string-bed centre) after the last drive. */
  sweetSpot(out: THREE.Vector3): THREE.Vector3
  /** World position of the racket shoulder. */
  shoulder(out: THREE.Vector3): THREE.Vector3
  /** World position of the racket hand (wrist joint). */
  hand(out: THREE.Vector3): THREE.Vector3
}

/** String-bed centre in racket-local space (see Racket.tsx: head at -0.47 under a +0.06 offset). */
const SWEET_LOCAL = new THREE.Vector3(0, -0.41, 0)

interface Driven {
  bone: THREE.Bone
  src: Source
  restHang: THREE.Quaternion
}

const qa = new THREE.Quaternion()
const qb = new THREE.Quaternion()
const qParent = new THREE.Quaternion()
const vLift = new THREE.Vector3()

/** Repaints the avatar's blue top in another colour, keeping the cloth shading. */
function recolourShirt(src: THREE.Texture, hex: string): THREE.Texture {
  const img = src.image as HTMLImageElement
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const g = canvas.getContext('2d')!
  g.drawImage(img, 0, 0)
  const data = g.getImageData(0, 0, canvas.width, canvas.height)
  const d = data.data
  const c = new THREE.Color(hex)
  const tr = c.r * 255
  const tg = c.g * 255
  const tb = c.b * 255
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]
    const gg = d[i + 1]
    const b = d[i + 2]
    const mx = Math.max(r, gg, b)
    const mn = Math.min(r, gg, b)
    if (b > r * 1.25 && b > gg * 1.1 && (mx - mn) / (mx + 1) > 0.25) {
      const k = Math.min(1.15, (mx / 255) * 1.9)
      d[i] = Math.min(255, tr * k)
      d[i + 1] = Math.min(255, tg * k)
      d[i + 2] = Math.min(255, tb * k)
    }
  }
  g.putImageData(data, 0, 0)
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

const worldPos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3())

/**
 * The exported avatar is split into ~7 skinned primitives that share one skeleton.
 * Merging those that share a material cuts draw calls (and skinning passes, shadows
 * included) from ~7 to 2-3 per player.
 */
function mergeByMaterial(scene: THREE.Object3D, pick: (m: THREE.Material) => THREE.Material): THREE.BufferGeometry[] {
  const created: THREE.BufferGeometry[] = []
  const meshes: THREE.SkinnedMesh[] = []
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh)
  })
  const groups = new Map<THREE.Material, THREE.SkinnedMesh[]>()
  for (const m of meshes) {
    const mat = pick(Array.isArray(m.material) ? m.material[0] : m.material)
    groups.set(mat, [...(groups.get(mat) ?? []), m])
  }
  for (const [mat, list] of groups) {
    const first = list[0]
    const geometry = list.length > 1 ? mergeGeometries(list.map((m) => m.geometry)) : first.geometry
    if (!geometry) {
      // Incompatible attributes: keep the parts as they are.
      for (const m of list) {
        m.material = mat
        m.castShadow = m.receiveShadow = true
        m.frustumCulled = false
      }
      continue
    }
    if (geometry !== first.geometry) created.push(geometry)
    const merged = new THREE.SkinnedMesh(geometry, mat)
    merged.name = first.name
    merged.position.copy(first.position)
    merged.quaternion.copy(first.quaternion)
    merged.scale.copy(first.scale)
    merged.bind(first.skeleton, first.bindMatrix)
    merged.castShadow = true
    merged.receiveShadow = true
    // Skinned bounds follow the rest pose; skip culling so swings never pop out.
    merged.frustumCulled = false
    first.parent!.add(merged)
    for (const m of list) m.parent!.remove(m)
  }
  return created
}

/** Rotates a bone about a world-space axis, in the current pose. */
function rotateBoneWorld(bone: THREE.Object3D, axis: THREE.Vector3, angle: number) {
  const r = new THREE.Quaternion().setFromAxisAngle(axis, angle)
  const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(r)
  const parent = bone.parent!.getWorldQuaternion(new THREE.Quaternion())
  bone.quaternion.copy(parent.invert().multiply(world))
  bone.updateMatrixWorld(true)
}

/**
 * Closes a hand around a racket grip by curling each finger chain toward the palm.
 * Returns the hand's palm frame (rest pose, world space).
 */
function curlHand(scene: THREE.Object3D, side: 'R' | 'L', amount: number) {
  const get = (n: string) => scene.getObjectByName(`Bip01_${side}_${n}`)!
  const hand = worldPos(get('Hand'))
  const fingerDir = worldPos(get('Finger2')).sub(hand).normalize()
  const across = worldPos(get('Finger1')).sub(worldPos(get('Finger4')))
  across.addScaledVector(fingerDir, -across.dot(fingerDir)).normalize()
  const palm = new THREE.Vector3().crossVectors(fingerDir, across).normalize()
  // A-pose palms face down and the thumb sits on the palm side.
  const thumb = worldPos(get('Finger0')).sub(hand)
  if (palm.y * -2 + palm.dot(thumb) * 10 < 0) palm.negate()

  const curlChain = (names: string[], angles: number[], axis: THREE.Vector3) => {
    names.forEach((n, i) => {
      const bone = scene.getObjectByName(`Bip01_${side}_${n}`)
      const child = scene.getObjectByName(`Bip01_${side}_${names[i + 1] ?? n + 'Nub'}`) ?? bone?.children[0]
      if (!bone) return
      // Pick the rotation direction that moves the segment toward the palm.
      const seg = child ? worldPos(child).sub(worldPos(bone)) : fingerDir.clone()
      const turned = seg.clone().applyAxisAngle(axis, 0.3)
      const sign = turned.dot(palm) > seg.dot(palm) ? 1 : -1
      rotateBoneWorld(bone, axis, sign * angles[i] * amount)
    })
  }
  for (const f of ['1', '2', '3', '4'])
    curlChain([`Finger${f}`, `Finger${f}1`, `Finger${f}2`], [1.25, 1.35, 0.85], across)
  curlChain(['Finger0', 'Finger01', 'Finger02'], [0.35, 0.55, 0.45], fingerDir)
  return { hand, fingerDir, across, palm }
}

export function RocketboxBody({
  skin,
  frame,
  handle,
  onDims,
}: {
  skin: Skin
  frame: string
  handle: Ref<RocketboxHandle>
  onDims?: (d: RigDims) => void
}) {
  const gltf = useGLTF(BASE + skin.glb)
  const tex = useTexture({
    body: BASE + skin.body,
    bodyNormal: BASE + skin.bodyNormal,
    head: BASE + skin.head,
    headNormal: BASE + skin.headNormal,
    ...(skin.opacity ? { opacity: BASE + skin.opacity } : {}),
  }) as Record<'body' | 'bodyNormal' | 'head' | 'headNormal', THREE.Texture> & { opacity?: THREE.Texture }

  const rig = useMemo(() => {
    const scene = cloneSkinned(gltf.scene)
    for (const t of [tex.body, tex.head]) t.colorSpace = THREE.SRGBColorSpace
    for (const t of Object.values(tex)) if (t) t.anisotropy = 8
    const bodyMap = skin.shirt ? recolourShirt(tex.body, skin.shirt) : tex.body
    // Standard (not physical/sheen) materials: the players fill a lot of pixels near the camera.
    const body = new THREE.MeshStandardMaterial({ map: bodyMap, normalMap: tex.bodyNormal, roughness: 0.72 })
    const head = new THREE.MeshStandardMaterial({ map: tex.head, normalMap: tex.headNormal, roughness: 0.55 })
    const hair = new THREE.MeshStandardMaterial({
      map: tex.head,
      alphaMap: tex.opacity,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 0.7,
    })
    const pick = (mat: THREE.Material) =>
      mat.name.includes('opacity') ? hair : mat.name.includes('head') ? head : body
    const mergedGeometries = mergeByMaterial(scene, pick)
    // Rest pose, measured in the avatar's own space (authored facing +z, metres).
    scene.updateMatrixWorld(true)
    const p = (n: string) => worldPos(scene.getObjectByName(n)!)
    const dims: RigDims = {
      pelvisY: p('Bip01_Pelvis').y,
      spineY: p('Bip01_Spine').y - p('Bip01_Pelvis').y,
      shoulderY: p('Bip01_R_UpperArm').y - p('Bip01_Spine').y,
      shoulderX: Math.abs(p('Bip01_R_UpperArm').x),
    }

    // Close the hands: the right one around the grip, the left one relaxed.
    const grip = curlHand(scene, 'R', 1)
    curlHand(scene, 'L', 0.55)

    // Racket mount, in the hand bone's space. Handshake grip: the handle runs diagonally
    // across the palm from the heel of the hand toward the index knuckle, string bed
    // parallel to the palm (eastern forehand).
    const headDir = grip.across.clone().addScaledVector(grip.fingerDir, 0.6).normalize()
    const faceNormal = grip.palm.clone().addScaledVector(headDir, -grip.palm.dot(headDir)).normalize()
    const yAxis = headDir.clone().negate()
    const xAxis = new THREE.Vector3().crossVectors(yAxis, faceNormal).normalize()
    const centre = grip.hand.clone().addScaledVector(grip.fingerDir, 0.07).addScaledVector(grip.palm, 0.03)
    const origin = centre.clone().addScaledVector(headDir, 0.03)
    const racketWorld = new THREE.Matrix4().makeBasis(xAxis, yAxis, faceNormal).setPosition(origin)
    const handBone = scene.getObjectByName('Bip01_R_Hand') as THREE.Bone
    const mount = new THREE.Group()
    mount.matrixAutoUpdate = true
    new THREE.Matrix4()
      .copy(handBone.matrixWorld)
      .invert()
      .multiply(racketWorld)
      .decompose(mount.position, mount.quaternion, mount.scale)
    handBone.add(mount)

    const rootInv = new THREE.Quaternion()
    scene.getWorldQuaternion(rootInv).invert()
    const down = new THREE.Vector3(0, -1, 0)
    const corrections = new Map<string, THREE.Quaternion>()
    for (const [bone, child] of Object.entries(HANG)) {
      const dir = p(child).sub(p(bone)).normalize()
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
    const dispose = () => {
      for (const g of mergedGeometries) g.dispose()
      for (const m of [body, head, hair]) m.dispose()
      if (bodyMap !== tex.body) bodyMap.dispose()
    }
    const shoulderBone = scene.getObjectByName('Bip01_R_UpperArm')!
    return {
      scene,
      driven,
      hips,
      hipsRest: hips.position.clone(),
      dims,
      mount,
      dispose,
      shoulderBone,
      handBone,
    }
    // useTexture returns a fresh keyed object on every render, so depend on the textures
    // themselves: depending on `tex` rebuilt the whole avatar every frame.
  }, [gltf, tex.body, tex.bodyNormal, tex.head, tex.headNormal, tex.opacity, skin.shirt])

  // Free the GPU resources of a rig that is replaced (skin change) or unmounted.
  useEffect(() => () => rig.dispose(), [rig])

  useEffect(() => {
    onDims?.(rig.dims)
  }, [rig, onDims])

  // The racket follows the hand's grip mount; its matrix is copied after the skeleton is posed.
  const racket = useRef<THREE.Group>(null)

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

        const r = racket.current
        if (r?.parent) {
          rig.mount.updateWorldMatrix(true, false)
          r.parent.updateWorldMatrix(true, false)
          r.matrix.copy(r.parent.matrixWorld).invert().multiply(rig.mount.matrixWorld)
          r.matrixWorldNeedsUpdate = true
        }
      },
      sweetSpot(out) {
        const r = racket.current
        if (!r) return out.set(0, 0, 0)
        r.updateWorldMatrix(true, false)
        return out.copy(SWEET_LOCAL).applyMatrix4(r.matrixWorld)
      },
      shoulder(out) {
        return rig.shoulderBone.getWorldPosition(out)
      },
      hand(out) {
        return rig.handBone.getWorldPosition(out)
      },
    }),
    [rig],
  )

  return (
    <>
      <primitive object={rig.scene} />
      <group ref={racket} matrixAutoUpdate={false}>
        <Racket frame={frame} />
      </group>
    </>
  )
}

for (const glb of new Set(SKINS.map((s) => s.glb))) useGLTF.preload(BASE + glb)
