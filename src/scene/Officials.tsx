import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { COURT } from '../game/constants'
import { buildPosed, FEMALE_SKIN, MALE_SKIN, useAvatarAssets, type StillPose } from './athlete/posed'

// The people around the court: a chair umpire and ball kids, posed from the same
// Rocketbox avatars as the players (static poses, so no animation cost beyond skinning).

interface Person {
  who: 'male' | 'female'
  pose: StillPose
  shirt: string | null
  position: [number, number, number]
  /** Yaw: 0 faces +z. */
  yaw: number
  scale?: number
}

const UMPIRE_X = -(COURT.netPostX + 1.1)
/** Top of the umpire chair's seat. */
const UMPIRE_SEAT = 2.05
const KID_SHIRT = '#5b3fa0'

function people(detail: 'high' | 'medium' | 'low'): Person[] {
  const list: Person[] = [
    // In the chair, facing the court (+x).
    { who: 'male', pose: 'umpire', shirt: null, position: [UMPIRE_X - 0.02, UMPIRE_SEAT, 0], yaw: Math.PI / 2 },
  ]
  if (detail === 'low') return list
  const netX = COURT.doublesHalfWidth + 1.05
  list.push(
    // Down on one knee at each end of the net, facing the court.
    { who: 'female', pose: 'kneel', shirt: KID_SHIRT, position: [netX, 0, 0.55], yaw: -Math.PI / 2, scale: 0.86 },
    { who: 'male', pose: 'kneel', shirt: KID_SHIRT, position: [-netX, 0, -1.05], yaw: Math.PI / 2, scale: 0.86 },
  )
  if (detail === 'high') {
    // Standing behind the far baseline, either side.
    const z = -(COURT.halfLength + 4.2)
    const x = COURT.singlesHalfWidth + 2.6
    list.push(
      { who: 'male', pose: 'attention', shirt: KID_SHIRT, position: [x, 0, z], yaw: 0, scale: 0.86 },
      { who: 'female', pose: 'attention', shirt: KID_SHIRT, position: [-x, 0, z], yaw: 0, scale: 0.86 },
    )
  }
  return list
}

function Official({ person, assets }: { person: Person; assets: ReturnType<typeof useAvatarAssets> }) {
  const avatar = useMemo(() => {
    const a = buildPosed(assets, { castShadow: true })
    a.shirt(person.shirt)
    a.pose(person.pose)
    return a
  }, [assets, person])
  useEffect(() => () => avatar.dispose(), [avatar])

  // Seated poses keep the hips at standing height: drop the body so the hips meet the seat.
  const offsetY = useMemo(() => {
    if (person.pose !== 'umpire' && person.pose !== 'sit') return 0
    const hip = avatar.scene.getObjectByName('Bip01_Pelvis')!.getWorldPosition(new THREE.Vector3())
    return -hip.y + 0.06
  }, [avatar, person.pose])

  const s = person.scale ?? 1
  return (
    <group position={person.position} rotation-y={person.yaw} scale={s}>
      <primitive object={avatar.scene} position-y={offsetY} />
    </group>
  )
}

export function Officials({ detail }: { detail: 'high' | 'medium' | 'low' }) {
  const male = useAvatarAssets(MALE_SKIN)
  const female = useAvatarAssets(FEMALE_SKIN)
  const list = useMemo(() => people(detail), [detail])
  return (
    <group>
      {list.map((p, i) => (
        <Official key={`${detail}-${i}`} person={p} assets={p.who === 'male' ? male : female} />
      ))}
    </group>
  )
}
