import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { buildPosed, FEMALE_SKIN, MALE_SKIN, useAvatarAssets, type StillPose } from './athlete/posed'
import { rng } from './textures'

// A handful of spectators on the bleacher, as real posed avatars (the players' Rocketbox
// models in still poses). Sprite impostors are fine for a stadium seen from far away; a few
// people a few metres from the camera need to be real.

export interface SeatSpot {
  x: number
  /** Top of the bench. */
  y: number
  z: number
}

const SHIRTS: (string | null)[] = ['#c6463f', '#f0c24b', '#3b7a57', '#e8e4dc', '#1e1e24', '#d97a3a', '#9a5ba8', null]
const POSES: StillPose[] = ['sit', 'sit', 'sit', 'clapA']

function Spectator({
  spot,
  yaw,
  pose,
  shirt,
  assets,
}: {
  spot: SeatSpot
  yaw: number
  pose: StillPose
  shirt: string | null
  assets: ReturnType<typeof useAvatarAssets>
}) {
  const avatar = useMemo(() => {
    const a = buildPosed(assets, { castShadow: true })
    a.shirt(shirt)
    a.pose(pose)
    return a
  }, [assets, pose, shirt])
  useEffect(() => () => avatar.dispose(), [avatar])
  // Seated poses keep the hips at standing height: drop the body so the hips meet the bench.
  const offsetY = useMemo(() => {
    const hip = avatar.scene.getObjectByName('Bip01_Pelvis')!.getWorldPosition(new THREE.Vector3())
    return -hip.y + 0.06
  }, [avatar])
  return (
    <group position={[spot.x, spot.y, spot.z]} rotation-y={yaw}>
      <primitive object={avatar.scene} position-y={offsetY} />
    </group>
  )
}

/** Seats `count` people on the given spots (picked evenly, in small groups), facing `yaw`. */
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
  return (
    <group>
      {people.map((p, i) => (
        <Spectator key={i} spot={p.spot} yaw={yaw} pose={p.pose} shirt={p.shirt} assets={p.female ? female : male} />
      ))}
    </group>
  )
}
