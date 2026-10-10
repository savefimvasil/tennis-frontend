import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildPosed, FEMALE_SKIN, MALE_SKIN, useAvatarAssets, type StillPose } from './athlete/posed'
import { rng } from './textures'

// A handful of spectators on the bench, as real avatars (the players' Rocketbox models) in
// still poses. Nobody moves, so each person is posed once and baked into static geometry, and
// everyone sharing a material is merged: a bench of ten is a handful of plain meshes instead
// of thirty skinned ones re-skinned every frame (shadow pass included).

export interface SeatSpot {
  x: number
  /** Top of the bench. */
  y: number
  z: number
}

const SHIRTS: (string | null)[] = ['#c6463f', '#f0c24b', '#3b7a57', '#e8e4dc', '#1e1e24', '#d97a3a', '#9a5ba8', null]
const POSES: StillPose[] = ['sit', 'sit', 'sit', 'clapA']

const v = new THREE.Vector3()
const n = new THREE.Vector3()
const nm = new THREE.Matrix3()

/** The skinned mesh in its current pose as a plain geometry in world space. */
function bake(mesh: THREE.SkinnedMesh): THREE.BufferGeometry {
  const src = mesh.geometry
  const pos = src.attributes.position as THREE.BufferAttribute
  const nrm = src.attributes.normal as THREE.BufferAttribute
  const out = new THREE.BufferGeometry()
  const p = new Float32Array(pos.count * 3)
  const q = new Float32Array(pos.count * 3)
  nm.getNormalMatrix(mesh.matrixWorld)
  for (let i = 0; i < pos.count; i++) {
    // Normals follow the same bone blend: skin a point just off the surface and take the difference.
    v.fromBufferAttribute(pos, i)
    n.fromBufferAttribute(nrm, i).multiplyScalar(0.01).add(v)
    mesh.applyBoneTransform(i, v)
    mesh.applyBoneTransform(i, n)
    n.sub(v).applyMatrix3(nm).normalize()
    v.applyMatrix4(mesh.matrixWorld)
    v.toArray(p, i * 3)
    n.toArray(q, i * 3)
  }
  out.setAttribute('position', new THREE.BufferAttribute(p, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(q, 3))
  out.setAttribute('uv', src.attributes.uv)
  out.setIndex(src.index)
  return out
}

/** Seats `count` people on the given spots, facing `yaw`, baked into a few static meshes. */
export function Spectators({
  spots,
  count,
  yaw,
  seed,
  gap = 0.9,
}: {
  spots: SeatSpot[]
  count: number
  yaw: number
  seed: number
  /** Keep this much free bench (m) beside each person. */
  gap?: number
}) {
  const male = useAvatarAssets(MALE_SKIN)
  const female = useAvatarAssets(FEMALE_SKIN)
  const people = useMemo(() => {
    const r = rng(seed)
    const pool = [...spots]
    const out: { spot: SeatSpot; pose: StillPose; shirt: string | null; female: boolean }[] = []
    while (out.length < count && pool.length) {
      const i = Math.floor(r() * pool.length)
      const spot = pool.splice(i, 1)[0]
      // Leave a gap next to each person: friends sit apart on a half-empty bleacher.
      for (let j = pool.length - 1; j >= 0; j--)
        if (gap > 0 && Math.abs(pool[j].z - spot.z) < gap && Math.abs(pool[j].y - spot.y) < 0.1) pool.splice(j, 1)
      const female = r() < 0.4
      out.push({
        spot,
        pose: POSES[Math.floor(r() * POSES.length)],
        shirt: female ? null : SHIRTS[Math.floor(r() * SHIRTS.length)],
        female,
      })
    }
    return out
  }, [spots, count, seed, gap])

  const baked = useMemo(() => {
    const groups = new Map<string, { material: THREE.Material; parts: THREE.BufferGeometry[] }>()
    const avatars = people.map((p) => {
      const a = buildPosed(p.female ? female : male)
      a.shirt(p.shirt)
      a.pose(p.pose)
      // Seated poses keep the hips at standing height: drop the body so the hips meet the bench.
      const hip = a.scene.getObjectByName('Bip01_Pelvis')!.getWorldPosition(new THREE.Vector3())
      const seat = new THREE.Group()
      seat.position.set(p.spot.x, p.spot.y, p.spot.z)
      seat.rotation.y = yaw
      a.scene.position.y = -hip.y + 0.06
      seat.add(a.scene)
      seat.updateMatrixWorld(true)
      a.scene.traverse((o) => {
        const m = o as THREE.SkinnedMesh
        if (!m.isSkinnedMesh) return
        const mat = m.material as THREE.MeshStandardMaterial
        const part = mat === a.materials.hair ? 'hair' : mat === a.materials.head ? 'head' : 'body'
        // One material per skin, part and shirt colour (the shirt is the body texture).
        const key = `${p.female ? 'f' : 'm'}|${part}|${part === 'body' ? (p.shirt ?? '-') : ''}`
        if (!groups.has(key)) groups.set(key, { material: mat.clone(), parts: [] })
        groups.get(key)!.parts.push(bake(m))
      })
      return a
    })
    for (const a of avatars) a.dispose()
    return [...groups.values()].map(({ material, parts }) => {
      const geometry = mergeGeometries(parts)!
      for (const g of parts) g.dispose()
      return { geometry, material }
    })
  }, [people, yaw, male, female])
  useEffect(
    () => () => {
      for (const b of baked) {
        b.geometry.dispose()
        b.material.dispose()
      }
    },
    [baked],
  )

  return (
    <group>
      {baked.map((b, i) => (
        <mesh key={i} geometry={b.geometry} material={b.material} receiveShadow />
      ))}
    </group>
  )
}
