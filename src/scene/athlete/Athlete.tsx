import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { sim } from '../../game/sim'
import type { Side } from '../../game/constants'
import {
  BACKHAND,
  FOREHAND,
  JOINTS,
  READY,
  SERVE_KEYS,
  copyPose,
  makePose,
  sampleTrack,
  type Joint,
  type Pose,
} from './poses'
import { Racket } from './Racket'
import { RocketboxBody, type RigDims, type RocketboxHandle } from './Rocketbox'
import type { Skin } from './skins'

export interface Kit {
  shirt: string
  trim: string
  shorts: string
  skin: string
  hair: string
  shoes: string
  headwear: 'cap' | 'band'
  frame: string
}

export const KITS: Record<'home' | 'away', Kit> = {
  home: {
    shirt: '#f4f6f8',
    trim: '#1f3d6b',
    shorts: '#1f2f4d',
    skin: '#d9a77f',
    hair: '#3a2a1e',
    shoes: '#f0f0f0',
    headwear: 'cap',
    frame: '#e0362c',
  },
  away: {
    shirt: '#e2574c',
    trim: '#ffffff',
    shorts: '#1d1f24',
    skin: '#8d5a3b',
    hair: '#141212',
    shoes: '#2a2d33',
    headwear: 'band',
    frame: '#1e6fd9',
  },
}

function useMaterials(kit: Kit) {
  return useMemo(
    () => ({
      shirt: new THREE.MeshPhysicalMaterial({
        color: kit.shirt,
        roughness: 0.75,
        sheen: 0.6,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color('#ffffff'),
      }),
      trim: new THREE.MeshStandardMaterial({ color: kit.trim, roughness: 0.6 }),
      shorts: new THREE.MeshPhysicalMaterial({
        color: kit.shorts,
        roughness: 0.8,
        sheen: 0.4,
        sheenColor: new THREE.Color('#8899bb'),
      }),
      skin: new THREE.MeshPhysicalMaterial({
        color: kit.skin,
        roughness: 0.55,
        clearcoat: 0.08,
        sheen: 0.2,
        sheenColor: new THREE.Color('#ffcfb0'),
      }),
      hair: new THREE.MeshStandardMaterial({ color: kit.hair, roughness: 0.9 }),
      shoes: new THREE.MeshStandardMaterial({ color: kit.shoes, roughness: 0.5 }),
      sole: new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.8 }),
      sock: new THREE.MeshStandardMaterial({ color: '#f7f7f5', roughness: 0.9 }),
    }),
    [kit],
  )
}

type Mats = ReturnType<typeof useMaterials>

function Limb({ len, r, mat, rEnd }: { len: number; r: number; mat: THREE.Material; rEnd?: number }) {
  // A tapered limb hanging from the joint along -y.
  return (
    <mesh position-y={-len / 2} material={mat} castShadow>
      <cylinderGeometry args={[r, rEnd ?? r * 0.85, len, 14, 1]} />
    </mesh>
  )
}

function Joint({ r, mat }: { r: number; mat: THREE.Material }) {
  return (
    <mesh material={mat} castShadow>
      <sphereGeometry args={[r, 14, 10]} />
    </mesh>
  )
}

function Leg({
  m,
  side,
  hip,
  knee,
}: {
  m: Mats
  side: 1 | -1
  hip: React.Ref<THREE.Group>
  knee: React.Ref<THREE.Group>
}) {
  return (
    <group ref={hip} position={[side * 0.095, -0.04, 0]}>
      <Joint r={0.085} mat={m.shorts} />
      {/* Shorts leg */}
      <mesh position-y={-0.13} material={m.shorts} castShadow>
        <cylinderGeometry args={[0.088, 0.085, 0.26, 14]} />
      </mesh>
      <Limb len={0.44} r={0.072} rEnd={0.056} mat={m.skin} />
      <group ref={knee} position-y={-0.44}>
        <Joint r={0.056} mat={m.skin} />
        <Limb len={0.42} r={0.054} rEnd={0.038} mat={m.skin} />
        <mesh position-y={-0.36} material={m.sock} castShadow>
          <cylinderGeometry args={[0.044, 0.042, 0.1, 12]} />
        </mesh>
        <group position={[0, -0.44, 0.05]}>
          <RoundedBox args={[0.1, 0.075, 0.27]} radius={0.03} smoothness={3} material={m.shoes} castShadow />
          <RoundedBox args={[0.106, 0.025, 0.28]} radius={0.01} smoothness={2} position-y={-0.032} material={m.sole} />
        </group>
      </group>
    </group>
  )
}

function Arm({
  m,
  side,
  sh,
  el,
  children,
  dims,
}: {
  m: Mats
  side: 1 | -1
  sh: React.Ref<THREE.Group>
  el: React.Ref<THREE.Group>
  children?: React.ReactNode
  dims: Dims
}) {
  return (
    // XZY: twist about the arm's own axis first, then raise sideways, then swing forward/back.
    <group ref={sh} position={[side * dims.shoulderX, dims.shoulderY, 0]} rotation-order="XZY">
      <Joint r={0.068} mat={m.shirt} />
      {/* Sleeve */}
      <mesh position-y={-0.07} material={m.shirt} castShadow>
        <cylinderGeometry args={[0.068, 0.062, 0.15, 12]} />
      </mesh>
      <Limb len={0.29} r={0.05} rEnd={0.042} mat={m.skin} />
      <group ref={el} position-y={-0.29}>
        <Joint r={0.043} mat={m.skin} />
        <Limb len={0.25} r={0.04} rEnd={0.032} mat={m.skin} />
        <group position-y={-0.27}>
          <mesh material={m.skin} castShadow scale={[0.9, 1.2, 0.7]}>
            <sphereGeometry args={[0.042, 12, 10]} />
          </mesh>
          {children}
        </group>
      </group>
    </group>
  )
}

type Dims = RigDims

const PRIMITIVE_DIMS: Dims = { pelvisY: 0.95, spineY: 0.06, shoulderY: 0.43, shoulderX: 0.2 }

const tmpTrack = makePose()
const tmpRun = makePose()

/** A stylised athlete with procedural animation driven by the simulation state. */
export function Athlete({ side, kit, skin }: { side: Side; kit: Kit; skin?: Skin }) {
  const m = useMaterials(kit)
  // With a skinned avatar the primitive body becomes an invisible driver rig sized to its skeleton.
  const [modelDims, setModelDims] = useState<Dims | null>(null)
  // Only update when the measurements change, so a re-render can never loop back into the avatar.
  const onDims = useCallback(
    (d: Dims) =>
      setModelDims((cur) =>
        cur &&
        cur.pelvisY === d.pelvisY &&
        cur.spineY === d.spineY &&
        cur.shoulderY === d.shoulderY &&
        cur.shoulderX === d.shoulderX
          ? cur
          : d,
      ),
    [],
  )
  const dims = (skin && modelDims) || PRIMITIVE_DIMS
  useEffect(() => {
    for (const mat of Object.values(m)) mat.visible = !skin
  }, [m, skin])
  const body = useRef<RocketboxHandle>(null)
  const jointMap = useRef<Record<Joint | 'pelvis', THREE.Object3D> | null>(null)
  const root = useRef<THREE.Group>(null!)
  const pelvis = useRef<THREE.Group>(null!)
  const refs = {
    spine: useRef<THREE.Group>(null!),
    neck: useRef<THREE.Group>(null!),
    lSh: useRef<THREE.Group>(null!),
    lEl: useRef<THREE.Group>(null!),
    rSh: useRef<THREE.Group>(null!),
    rEl: useRef<THREE.Group>(null!),
    rWr: useRef<THREE.Group>(null!),
    lHip: useRef<THREE.Group>(null!),
    lKnee: useRef<THREE.Group>(null!),
    rHip: useRef<THREE.Group>(null!),
    rKnee: useRef<THREE.Group>(null!),
  } satisfies Record<Joint, React.RefObject<THREE.Group>>
  const state = useRef({ phase: 0, pose: makePose(READY), hipYaw: 0, bob: 0 })

  useFrame((clock, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const a = sim.athletes[side]
    const s = state.current
    root.current.position.set(a.x, 0, a.z)
    root.current.rotation.y = a.yaw

    // Local velocity relative to facing.
    const c = Math.cos(a.yaw)
    const sn = Math.sin(a.yaw)
    const lx = a.vx * c - a.vz * sn
    const lz = a.vx * sn + a.vz * c
    const speed = Math.hypot(lx, lz)
    const run = Math.min(1, speed / 4.5)
    // Stride-matched cycle: one full leg cycle (two steps) covers ~1.9 m, so feet don't skate.
    s.phase += dt * speed * ((Math.PI * 2) / 1.9)

    // Legs: run toward the movement direction by twisting the hips.
    let heading = Math.atan2(lx, lz)
    let dir = 1
    if (Math.abs(heading) > Math.PI / 2) {
      heading = heading - Math.sign(heading) * Math.PI
      dir = -1
    }
    const wantYaw = speed > 0.4 ? Math.max(-1, Math.min(1, heading)) : 0
    s.hipYaw += (wantYaw - s.hipYaw) * Math.min(1, dt * 10)

    const target = tmpRun
    copyPose(READY, target)
    const sw = Math.sin(s.phase) * dir
    const idle = Math.sin(clock.clock.elapsedTime * 2.4 + side) * 0.012
    target.j.lHip[0] = READY.j.lHip[0] * (1 - run * 0.6) + sw * 0.85 * run
    target.j.rHip[0] = READY.j.rHip[0] * (1 - run * 0.6) - sw * 0.85 * run
    target.j.lKnee[0] = READY.j.lKnee[0] * (1 - run * 0.5) + Math.max(0, -sw) * 1.3 * run + 0.25 * run
    target.j.rKnee[0] = READY.j.rKnee[0] * (1 - run * 0.5) + Math.max(0, sw) * 1.3 * run + 0.25 * run
    target.j.lSh[0] += -sw * 0.6 * run
    target.j.rSh[0] += sw * 0.25 * run
    target.lift += Math.abs(Math.cos(s.phase)) * 0.05 * run + idle * (1 - run)
    target.j.spine[0] += 0.12 * run

    // Split step: a small hop with feet apart as the opponent strikes.
    if (a.split > 0 && a.swing === 'none') {
      const u = 1 - a.split / 0.32
      const hop = Math.sin(u * Math.PI)
      target.lift += hop * 0.06 - (u > 0.7 ? (u - 0.7) * 0.25 : 0)
      target.j.lHip[2] += 0.12 * hop
      target.j.rHip[2] -= 0.12 * hop
      target.j.lKnee[0] += 0.25 * (1 - hop)
      target.j.rKnee[0] += 0.25 * (1 - hop)
    }

    // Upper body: swing tracks override the ready stance.
    if (a.swing !== 'none') {
      const track = a.swing === 'forehand' ? FOREHAND : a.swing === 'backhand' ? BACKHAND : SERVE_KEYS
      const t = a.tossing ? Math.min(a.swingT, 0.95) : a.swingT
      sampleTrack(track, t, tmpTrack)
      const upper: Joint[] = ['spine', 'neck', 'lSh', 'lEl', 'rSh', 'rEl', 'rWr']
      for (const k of upper) {
        target.j[k][0] = tmpTrack.j[k][0]
        target.j[k][1] = tmpTrack.j[k][1]
        target.j[k][2] = tmpTrack.j[k][2]
      }
      if (a.swing !== 'serve') {
        // Bend the swing to the ball: crouch for low balls, raise the arm for high ones.
        const dy = Math.max(-0.8, Math.min(1.1, a.contactY - 1.0))
        const w = Math.sin(Math.min(1, t / 0.45) * Math.PI)
        const low = Math.min(0, dy)
        target.lift += low * 0.32 * w
        target.j.lKnee[0] -= low * 0.9 * w
        target.j.rKnee[0] -= low * 0.9 * w
        target.j.lHip[0] += low * 0.75 * w
        target.j.rHip[0] += low * 0.75 * w
        target.j.spine[0] -= low * 0.35 * w
        if (a.swing === 'forehand') target.j.rSh[2] -= dy * 0.65 * w
        else {
          target.j.rSh[2] += dy * 0.55 * w
          target.j.lSh[2] += dy * 0.55 * w
        }
      }
      if (a.swing === 'serve') {
        for (const k of ['lHip', 'rHip', 'lKnee', 'rKnee'] as Joint[]) {
          target.j[k][0] = tmpTrack.j[k][0]
          target.j[k][2] = tmpTrack.j[k][2]
        }
        target.lift = tmpTrack.lift
      }
    } else if (a.celebrate > 0) {
      target.j.lSh[0] = -2.7
      target.j.lSh[2] = 0.35
      target.j.lEl[0] = -0.5
      target.j.spine[0] = -0.05
      target.lift += Math.max(0, Math.sin(a.celebrate * 9)) * 0.06
    }

    // Keep the chest facing the net while the hips turn toward the run.
    target.j.spine[1] -= s.hipYaw * 0.85

    const k = 1 - Math.exp(-dt * (a.swing !== 'none' ? 38 : 16))
    const pose: Pose = s.pose
    for (const j of JOINTS) {
      const cur = pose.j[j]
      const tgt = target.j[j]
      cur[0] += (tgt[0] - cur[0]) * k
      cur[1] += (tgt[1] - cur[1]) * k
      cur[2] += (tgt[2] - cur[2]) * k
      refs[j].current.rotation.set(cur[0], cur[1], cur[2])
    }
    pose.lift += (target.lift - pose.lift) * k
    pelvis.current.position.y = dims.pelvisY + pose.lift
    pelvis.current.rotation.y = s.hipYaw
    if (body.current) {
      const joints = (jointMap.current ??= { ...jointObjects(refs), pelvis: pelvis.current })
      const b = body.current
      b.drive(joints, pose.lift)
      // Racket-arm IK: around contact, turn the shoulder so the string bed points at the
      // planned contact point, then pose the skeleton again with the correction.
      const w = a.aim ? aimWeight(a.swing, a.swingT) : 0
      if (w > 0 && a.aim) {
        // Three-joint IK, a few passes: turn the shoulder toward the ball, turn the wrist so the
        // racket head reaches out toward it, then bend or straighten the elbow by the length error.
        ik.target.set(a.aim.x, a.aim.y, a.aim.z)
        const sh = refs.rSh.current
        const el = refs.rEl.current
        const wr = refs.rWr.current
        const turn = (joint: THREE.Object3D, pivot: THREE.Vector3) => {
          ik.from.subVectors(ik.sweet, pivot).normalize()
          ik.to.subVectors(ik.target, pivot).normalize()
          ik.q.setFromUnitVectors(ik.from, ik.to)
          ik.qw.identity().slerp(ik.q, w)
          joint.getWorldQuaternion(ik.world).premultiply(ik.qw)
          joint.parent!.getWorldQuaternion(ik.parent)
          joint.quaternion.copy(ik.parent.invert().multiply(ik.world))
          b.drive(joints, pose.lift)
          b.sweetSpot(ik.sweet)
        }
        for (let pass = 0; pass < 3; pass++) {
          b.shoulder(ik.shoulder)
          b.sweetSpot(ik.sweet)
          turn(sh, ik.shoulder)
          b.hand(ik.hand)
          turn(wr, ik.hand)
          const error = ik.sweet.distanceTo(ik.shoulder) - ik.target.distanceTo(ik.shoulder)
          // Elbow flexion is negative x; never hyperextend past straight.
          el.rotation.x = Math.min(0, Math.max(-2.2, el.rotation.x - error * 1.6 * w))
          b.drive(joints, pose.lift)
        }
        b.sweetSpot(ik.sweet)
        b.shoulder(ik.shoulder)
        turn(sh, ik.shoulder)
      }
      // Tell the game where the racket is, so the ball is struck from the strings.
      b.sweetSpot(ik.sweet)
      a.sweet = { x: ik.sweet.x, y: ik.sweet.y, z: ik.sweet.z }
    }
  })

  const headwear =
    kit.headwear === 'cap' ? (
      <group position={[0, 0.06, 0]}>
        <mesh material={m.shirt} castShadow>
          <sphereGeometry args={[0.112, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, -0.005, 0.1]} rotation-x={0.25} material={m.trim} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.012, 20, 1, false, -Math.PI / 2, Math.PI]} />
        </mesh>
      </group>
    ) : (
      <mesh position-y={0.04} material={m.trim} castShadow>
        <torusGeometry args={[0.108, 0.018, 8, 24]} />
      </mesh>
    )

  return (
    <group ref={root}>
      {skin ? (
        <Suspense fallback={null}>
          <RocketboxBody key={skin.id} skin={skin} frame={kit.frame} handle={body} onDims={onDims} />
        </Suspense>
      ) : null}
      <group ref={pelvis} position-y={dims.pelvisY}>
        {/* Hips */}
        <mesh material={m.shorts} castShadow scale={[1.3, 1, 0.9]}>
          <capsuleGeometry args={[0.12, 0.08, 6, 14]} />
        </mesh>
        <Leg m={m} side={1} hip={refs.lHip} knee={refs.lKnee} />
        <Leg m={m} side={-1} hip={refs.rHip} knee={refs.rKnee} />
        <group ref={refs.spine} position-y={dims.spineY}>
          {/* Torso */}
          <mesh position-y={0.24} material={m.shirt} castShadow scale={[1.18, 1, 0.74]}>
            <capsuleGeometry args={[0.16, 0.26, 8, 18]} />
          </mesh>
          {/* Collar trim */}
          <mesh position-y={0.47} rotation-x={Math.PI / 2} material={m.trim}>
            <torusGeometry args={[0.065, 0.012, 6, 18]} />
          </mesh>
          <group ref={refs.neck} position-y={0.5}>
            <mesh position-y={0.04} material={m.skin} castShadow>
              <cylinderGeometry args={[0.045, 0.05, 0.1, 12]} />
            </mesh>
            <group position-y={0.17}>
              <mesh material={m.skin} castShadow scale={[0.92, 1.1, 1]}>
                <sphereGeometry args={[0.105, 24, 18]} />
              </mesh>
              {/* Hair */}
              <mesh position={[0, 0.02, -0.01]} material={m.hair} castShadow scale={[0.95, 1.08, 1.02]}>
                <sphereGeometry args={[0.106, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
              </mesh>
              {/* Nose and ears give the head a readable facing */}
              <mesh position={[0, -0.01, 0.1]} material={m.skin}>
                <coneGeometry args={[0.018, 0.04, 8]} />
              </mesh>
              {[1, -1].map((e) => (
                <mesh key={e} position={[e * 0.095, 0, 0]} material={m.skin} scale={[0.5, 1, 0.8]}>
                  <sphereGeometry args={[0.03, 8, 8]} />
                </mesh>
              ))}
              {headwear}
            </group>
          </group>
          <Arm m={m} side={1} sh={refs.lSh} el={refs.lEl} dims={dims} />
          <Arm m={m} side={-1} sh={refs.rSh} el={refs.rEl} dims={dims}>
            <group ref={refs.rWr}>{skin ? null : <Racket frame={kit.frame} />}</group>
          </Arm>
        </group>
      </group>
    </group>
  )
}

const ik = {
  target: new THREE.Vector3(),
  shoulder: new THREE.Vector3(),
  hand: new THREE.Vector3(),
  sweet: new THREE.Vector3(),
  from: new THREE.Vector3(),
  to: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  qw: new THREE.Quaternion(),
  world: new THREE.Quaternion(),
  parent: new THREE.Quaternion(),
}

/** IK blend around the contact key: groundstrokes meet the ball at 0.2 s, the serve at 1.0 s. */
function aimWeight(swing: string, t: number): number {
  const contact = swing === 'serve' ? 1 : 0.2
  const before = swing === 'serve' ? 0.12 : 0.14
  const after = 0.16
  if (t < contact - before || t > contact + after) return 0
  const u = t < contact ? (t - (contact - before)) / before : 1 - (t - contact) / after
  return u * u * (3 - 2 * u)
}

function jointObjects(refs: Record<Joint, React.RefObject<THREE.Group>>) {
  const out = {} as Record<Joint, THREE.Object3D>
  for (const k of JOINTS) out[k] = refs[k].current
  return out
}
