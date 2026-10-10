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
  RECEIVE,
  SERVE_KEYS,
  copyPose,
  makePose,
  sampleTrack,
  type Joint,
  type Pose,
} from './poses'
import {
  approach,
  gaitFor,
  leanFromAccel,
  lookAngles,
  preparedSwingTime,
  smoothstep,
  strideLength,
  toLocal,
} from './anim'
import { Racket } from './Racket'
import { blendInto, makeSample, MOCAP, sampleCycle } from './mocap'
import { PLAYER } from '../../game/tuning'
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
  ankle,
}: {
  m: Mats
  side: 1 | -1
  hip: React.Ref<THREE.Group>
  knee: React.Ref<THREE.Group>
  ankle: React.Ref<THREE.Group>
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
        <group ref={ankle} position-y={-0.44}>
          <group position-z={0.05}>
            <RoundedBox args={[0.1, 0.075, 0.27]} radius={0.03} smoothness={3} material={m.shoes} castShadow />
            <RoundedBox
              args={[0.106, 0.025, 0.28]}
              radius={0.01}
              smoothness={2}
              position-y={-0.032}
              material={m.sole}
            />
          </group>
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
const mocapRun = makeSample()
const mocapCross = makeSample()

/** Joints the shot tracks own. */
const UPPER: Joint[] = ['spine', 'neck', 'lSh', 'lEl', 'rSh', 'rEl', 'rWr']
const LEGS = [
  ['lHip', 'lKnee', 'lAnk'],
  ['rHip', 'rKnee', 'rAnk'],
] as const
/** End of the take-back in the groundstroke tracks (poses.ts). */
const BACKSWING_T = 0.12

/** Blend rate (1/s) per joint: limbs react fast, the head and trunk a little softer. */
function rateFor(j: Joint, swinging: boolean): number {
  if (j === 'neck') return swinging ? 24 : 14
  if (j === 'lHip' || j === 'rHip' || j === 'lKnee' || j === 'rKnee' || j === 'lAnk' || j === 'rAnk')
    return swinging ? 30 : 24
  if (j === 'spine') return swinging ? 32 : 14
  return swinging ? 40 : 16
}

/**
 * Shapes the stroke for the shot type, on top of the shared track (contact stays where the
 * racket IK puts it):
 * - topspin: the racket drops below the ball and finishes high over the shoulder;
 * - slice: high take-back, high-to-low with an open face, finishing low out in front; the
 *   backhand slice is one-handed, the free arm opening back for balance;
 * - flat: a level swing finishing across the body at shoulder height;
 * - lob: an open face lifting up, finishing high.
 */
function styleSwing(target: Pose, swing: string, shot: string, t: number) {
  const back = bump(t, 0.12, 0.13)
  const follow = smoothstep(0.22, 0.4, t) * (1 - smoothstep(0.5, 0.72, t))
  const j = target.j
  const fh = swing === 'forehand'
  if (shot === 'topspin') {
    j.rSh[0] += 0.28 * back - 0.25 * follow
    j.rEl[0] -= 0.2 * follow
  } else if (shot === 'slice') {
    j.rSh[0] += -0.7 * back + 0.95 * follow
    j.rEl[0] += 0.3 * back + 1.1 * follow
    j.rWr[0] -= 0.5 * follow
    if (fh) {
      j.rSh[2] -= 0.25 * back
      j.spine[1] -= 0.4 * follow
    } else {
      // Stay side-on through a one-handed slice; the free arm opens back.
      j.spine[1] += 0.6 * follow
      const open = smoothstep(0.14, 0.3, t) * (1 - smoothstep(0.55, 0.72, t))
      j.lSh[0] += (0.55 - j.lSh[0]) * open
      j.lSh[2] += (0.7 - j.lSh[2]) * open
      j.lEl[0] += (-0.25 - j.lEl[0]) * open
    }
  } else if (shot === 'flat') {
    j.rSh[0] += 0.45 * follow
    j.rEl[0] += 0.55 * follow
    j.spine[1] += (fh ? 0.2 : -0.2) * follow
  } else if (shot === 'lob') {
    j.rSh[0] -= 0.4 * follow
    j.rWr[0] -= 0.45 * smoothstep(0.15, 0.3, t)
  }
}

/** Smooth bump centred on c with half-width w. */
function bump(t: number, c: number, w: number): number {
  const u = 1 - Math.abs(t - c) / w
  return u <= 0 ? 0 : u * u * (3 - 2 * u)
}

/**
 * Sideways distance (along the athlete's right) where the predicted ball crosses the hitting
 * plane: >= 0 means a forehand, the same rule the director uses.
 */
function predictedLateral(a: { x: number; z: number; yaw: number }): number | null {
  const pred = sim.prediction
  if (!pred) return null
  const fx = Math.sin(a.yaw)
  const fz = Math.cos(a.yaw)
  const elapsed = sim.time - sim.predictionStart
  let prevAlong = 0
  let have = false
  for (const p of pred.samples) {
    if (p.t < elapsed) continue
    const along = (p.x - a.x) * fx + (p.z - a.z) * fz - PLAYER.contactAhead
    if (have && prevAlong > 0 && along <= 0) return (p.x - a.x) * -fz + (p.z - a.z) * fx
    prevAlong = along
    have = true
  }
  return null
}

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
    lAnk: useRef<THREE.Group>(null!),
    rHip: useRef<THREE.Group>(null!),
    rKnee: useRef<THREE.Group>(null!),
    rAnk: useRef<THREE.Group>(null!),
  } satisfies Record<Joint, React.RefObject<THREE.Group>>
  const state = useRef({
    phase: 0,
    pose: makePose(READY),
    hipYaw: 0,
    /** Extra pelvis turn from shots: hips lead the shoulders through the stroke. */
    pelvisTurn: 0,
    /** Last local velocity and smoothed local acceleration (m/s, m/s²). */
    vx: 0,
    vz: 0,
    ax: 0,
    az: 0,
    /** Early take-back toward the coming shot (0..1) and its side. */
    prep: 0,
    prepSide: 'forehand' as 'forehand' | 'backhand',
    /** Take-back already made when the current swing started. */
    swingPrep: 0,
    lastSwing: 'none' as string,
    lastHits: -1,
    hitAt: 0,
    look: [0, 0] as [number, number],
    /** Weight of the serve-receiving stance. */
    receive: 0,
  })

  useFrame((clock, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const a = sim.athletes[side]
    const s = state.current
    root.current.position.set(a.x, 0, a.z)
    root.current.rotation.y = a.yaw
    const time = clock.clock.elapsedTime

    // Local velocity relative to facing, and a smoothed acceleration for leaning.
    const v = toLocal(a.vx, a.vz, a.yaw)
    const speed = Math.hypot(v.x, v.z)
    if (dt > 1e-4) {
      const kA = approach(9, dt)
      const clampA = (x: number) => Math.max(-30, Math.min(30, x))
      s.ax += (clampA((v.x - s.vx) / dt) - s.ax) * kA
      s.az += (clampA((v.z - s.vz) / dt) - s.az) * kA
    }
    s.vx = v.x
    s.vz = v.z
    if (sim.hits !== s.lastHits) {
      s.lastHits = sim.hits
      s.hitAt = sim.time
    }

    // ---- Locomotion: a forward/back run and a side shuffle, blended by direction of travel.
    const g = gaitFor(v.x, v.z)
    const stride = strideLength(speed) * (1 - g.shuffle) + 1.05 * g.shuffle
    s.phase += (dt * speed * (Math.PI * 2)) / stride
    const run = Math.min(1, speed / 4.5) * g.run
    // Motion capture where it fits: the forward run, and the fast crossover run sideways
    // (hips turned ~75 degrees into the run). Slow shuffles and backpedalling stay procedural.
    const lateral = speed > 0.25 ? Math.abs(v.x) / speed : 0
    const crossW = lateral * smoothstep(3, 4.6, speed)
    const runW = g.dir > 0 ? (1 - lateral) * smoothstep(1.5, 3.5, speed) : 0
    const u = s.phase / (Math.PI * 2)
    let yawTarget = g.hipYaw
    if (runW > 0.01) {
      sampleCycle(MOCAP.run, u, mocapRun)
      yawTarget += (mocapRun.yaw - MOCAP.run.meanYaw) * runW
    }
    if (crossW > 0.01) {
      sampleCycle(v.x > 0 ? MOCAP.strafeLeft : MOCAP.strafeRight, u, mocapCross)
      yawTarget += (mocapCross.yaw - yawTarget) * crossW
    }
    s.hipYaw += (yawTarget - s.hipYaw) * approach(8, dt)

    const target = tmpRun
    copyPose(READY, target)
    const sw = Math.sin(s.phase) * g.dir
    const idle = Math.sin(time * 2.4 + side) * 0.012
    target.j.lHip[0] = READY.j.lHip[0] * (1 - run * 0.6) + sw * 0.85 * run
    target.j.rHip[0] = READY.j.rHip[0] * (1 - run * 0.6) - sw * 0.85 * run
    target.j.lKnee[0] = READY.j.lKnee[0] * (1 - run * 0.5) + Math.max(0, -sw) * 1.3 * run + 0.25 * run
    target.j.rKnee[0] = READY.j.rKnee[0] * (1 - run * 0.5) + Math.max(0, sw) * 1.3 * run + 0.25 * run
    target.j.lSh[0] += -sw * 0.6 * run
    target.j.rSh[0] += sw * 0.25 * run
    target.lift += Math.abs(Math.cos(s.phase)) * 0.05 * run + idle * (1 - Math.min(1, speed / 1.5))
    target.j.spine[0] += 0.12 * run

    // Side shuffle: the lead leg reaches out, the trail leg closes up; low and springy.
    const shuffle = Math.min(1, speed / 2.2) * g.shuffle
    if (shuffle > 0.01) {
      const open = (1 - Math.cos(s.phase)) * 0.5
      const lead = v.x > 0 ? 1 : -1 // +x is the athlete's left
      const outL = lead > 0 ? 0.36 * open : 0.14 * (1 - open)
      const outR = lead > 0 ? 0.14 * (1 - open) : 0.36 * open
      target.j.lHip[2] += outL * shuffle
      target.j.rHip[2] -= outR * shuffle
      target.j.lKnee[0] += 0.22 * shuffle
      target.j.rKnee[0] += 0.22 * shuffle
      target.j.lHip[0] -= 0.12 * shuffle
      target.j.rHip[0] -= 0.12 * shuffle
      target.lift += (Math.abs(Math.sin(s.phase)) * 0.03 - 0.035) * shuffle
    }

    if (runW > 0.01) {
      // The capture leans hard into a sprint: take half of its spine.
      blendInto(target, mocapRun, runW, 0.5)
      target.lift += (mocapRun.lift - target.lift) * runW
    }
    if (crossW > 0.01) {
      blendInto(target, mocapCross, crossW, 0.5)
      target.lift += (mocapCross.lift - target.lift) * crossW
    }

    // Lean into acceleration; sit into the legs when braking hard.
    const [leanPitch, leanRoll] = leanFromAccel(s.ax, s.az)
    const moving = Math.min(1, speed / 1.2) + Math.min(1, Math.hypot(s.ax, s.az) / 6)
    target.j.spine[0] += leanPitch * Math.min(1, moving)
    target.j.spine[2] += leanRoll * Math.min(1, moving)
    const braking = speed > 0.5 ? Math.max(0, -(s.ax * v.x + s.az * v.z) / speed) : 0
    const brake = Math.min(0.4, braking * 0.025)
    target.j.lKnee[0] += brake
    target.j.rKnee[0] += brake
    target.j.lHip[0] -= brake * 0.5
    target.j.rHip[0] -= brake * 0.5
    target.lift -= brake * 0.12

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

    // Receiving the serve: low wide stance, weight on the toes, swaying side to side.
    const receiving = sim.phase === 'serve' && sim.server !== side && sim.lastHitter === null
    s.receive += ((receiving ? 1 : 0) * (1 - Math.min(1, speed / 1.5)) - s.receive) * approach(5, dt)
    if (s.receive > 0.01) {
      const w = s.receive
      for (const k of JOINTS) {
        for (let i = 0; i < 3; i++) target.j[k][i] += (RECEIVE.j[k][i] - READY.j[k][i]) * w
      }
      target.lift += (RECEIVE.lift - READY.lift) * w
      const sway = Math.sin(time * 2.3 + side * 1.7)
      target.j.spine[2] += sway * 0.05 * w
      target.j.lHip[2] += sway * 0.04 * w
      target.j.rHip[2] += sway * 0.04 * w
      target.lift += Math.max(0, Math.sin(time * 6.5 + side)) * 0.016 * w
    }

    // ---- Early preparation: turn the shoulders and take the racket back as soon as the
    // opponent's shot is read, instead of waiting for the last 0.2 s.
    const incoming =
      sim.lastHitter !== null && sim.lastHitter !== side && (sim.phase === 'rally' || sim.phase === 'serve')
    let prepWant = 0
    if (incoming && a.swing === 'none') {
      const lat = predictedLateral(a)
      if (lat !== null) {
        const want = lat >= 0 ? 'forehand' : 'backhand'
        if (want !== s.prepSide && (s.prep < 0.25 || Math.abs(lat) > 0.5)) s.prepSide = want
        prepWant = smoothstep(0.12, 0.5, sim.time - s.hitAt) * 0.9
      }
    }
    s.prep += (prepWant - s.prep) * approach(prepWant > s.prep ? 5 : 7, dt)

    if (a.swing !== s.lastSwing) {
      // A groundstroke starts from the take-back already made on that side.
      s.swingPrep = a.swing === s.prepSide ? s.prep : 0
      if (a.swing !== 'none') s.prep = 0
      s.lastSwing = a.swing
    }

    let pelvisTurnWant = 0
    if (a.swing === 'none' && s.prep > 0.01) {
      const track = s.prepSide === 'forehand' ? FOREHAND : BACKHAND
      sampleTrack(track, BACKSWING_T * s.prep, tmpTrack)
      const w = Math.min(1, s.prep * 2.5)
      for (const k of UPPER) {
        for (let i = 0; i < 3; i++) target.j[k][i] += (tmpTrack.j[k][i] - target.j[k][i]) * w
      }
      pelvisTurnWant = tmpTrack.j.spine[1] * 0.4
    }

    // ---- Shots: swing tracks override the upper body; hips and legs drive the stroke.
    if (a.swing !== 'none') {
      const track = a.swing === 'forehand' ? FOREHAND : a.swing === 'backhand' ? BACKHAND : SERVE_KEYS
      const raw = a.tossing ? Math.min(a.swingT, 0.95) : a.swingT
      const t = a.swing === 'serve' ? raw : preparedSwingTime(raw, s.swingPrep, BACKSWING_T)
      sampleTrack(track, t, tmpTrack)
      for (const k of UPPER) {
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
        styleSwing(target, a.swing, a.swingShot, t)
        // Hips lead the shoulders: part of the trunk rotation comes from the pelvis.
        pelvisTurnWant = tmpTrack.j.spine[1] * 0.45
        target.j.spine[1] -= pelvisTurnWant * 0.5
        // Load the legs in the take-back, drive up through contact.
        const load = bump(t, 0.1, 0.09)
        const drive = bump(t, 0.21, 0.08)
        target.j.lKnee[0] += 0.18 * load - 0.22 * drive
        target.j.rKnee[0] += 0.18 * load - 0.22 * drive
        target.lift += -0.03 * load + 0.035 * drive
      }
      if (a.swing === 'serve') {
        for (const k of ['lHip', 'rHip', 'lKnee', 'rKnee'] as Joint[]) {
          target.j[k][0] = tmpTrack.j[k][0]
          target.j[k][2] = tmpTrack.j[k][2]
        }
        target.lift = tmpTrack.lift
        pelvisTurnWant = tmpTrack.j.spine[1] * 0.35
      }
    } else if (a.celebrate > 0) {
      // Fist pump: the free arm punches up twice, a little hop.
      const pump = Math.abs(Math.sin(a.celebrate * 7))
      target.j.lSh[0] = -2.3 - pump * 0.5
      target.j.lSh[2] = 0.3
      target.j.lEl[0] = -1.4 + pump * 1.0
      target.j.spine[0] = -0.08
      target.j.neck[0] = -0.3
      target.lift += Math.max(0, Math.sin(a.celebrate * 9)) * 0.06
    } else if (sim.phase === 'dead' && sim.athletes[side === 0 ? 1 : 0].celebrate > 0) {
      // Lost the point: shoulders drop, head down, racket hangs.
      const k = Math.min(1, sim.athletes[side === 0 ? 1 : 0].celebrate)
      target.j.spine[0] += 0.18 * k
      target.j.neck[0] += 0.45 * k
      target.j.lSh[0] += (-0.1 - target.j.lSh[0]) * k
      target.j.lEl[0] += (-0.35 - target.j.lEl[0]) * k
      target.j.rSh[0] += (-0.15 - target.j.rSh[0]) * k
      target.j.rEl[0] += (-0.5 - target.j.rEl[0]) * k
      target.lift += 0.04 * k
    }

    // Keep the chest facing the net while the hips turn toward the run.
    target.j.spine[1] -= s.hipYaw * 0.85
    s.pelvisTurn += (pelvisTurnWant - s.pelvisTurn) * approach(a.swing !== 'none' ? 30 : 10, dt)

    // ---- Head: track the ball.
    const ballBody = sim.ball
    let lookPitch = 0
    let lookYaw = 0
    if (ballBody && sim.phase !== 'idle') {
      const bp = ballBody.translation()
      const l = toLocal(bp.x - a.x, bp.z - a.z, a.yaw)
      const chestYaw = s.hipYaw + s.pelvisTurn + target.j.spine[1]
      const c = Math.cos(chestYaw)
      const sn = Math.sin(chestYaw)
      const [p, y] = lookAngles(l.x * c - l.z * sn, bp.y - 1.55 - target.lift, l.x * sn + l.z * c)
      const w = sim.phase === 'dead' ? 0.3 : a.swing === 'serve' ? 0.4 : 0.85
      lookPitch = p * w
      lookYaw = y * w
    }
    s.look[0] += (lookPitch - s.look[0]) * approach(10, dt)
    s.look[1] += (lookYaw - s.look[1]) * approach(10, dt)
    target.j.neck[0] += s.look[0]
    target.j.neck[1] += s.look[1]

    // ---- Blend toward the target: fast for the stroke, softer elsewhere.
    const swinging = a.swing !== 'none'
    const pose: Pose = s.pose
    for (const j of JOINTS) {
      const k = approach(rateFor(j, swinging), dt)
      const cur = pose.j[j]
      const tgt = target.j[j]
      cur[0] += (tgt[0] - cur[0]) * k
      cur[1] += (tgt[1] - cur[1]) * k
      cur[2] += (tgt[2] - cur[2]) * k
    }
    pose.lift += (target.lift - pose.lift) * approach(swinging ? 38 : 18, dt)
    // Feet stay flat on the court whatever the thigh and shin do (toes point in the air).
    const airborne = Math.max(0, Math.min(1, (pose.lift - 0.04) / 0.08))
    for (const [hip, knee, ank] of LEGS) {
      pose.j[ank][0] = -(pose.j[hip][0] + pose.j[knee][0]) * (1 - airborne * 0.6) + airborne * 0.45
      pose.j[ank][1] = 0
      pose.j[ank][2] = -pose.j[hip][2] * 0.9
    }
    for (const j of JOINTS) {
      const cur = pose.j[j]
      refs[j].current.rotation.set(cur[0], cur[1], cur[2])
    }
    pelvis.current.position.y = dims.pelvisY + pose.lift
    pelvis.current.rotation.y = s.hipYaw + s.pelvisTurn
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
      // Free hand: cradles the racket throat in the ready stance and holds the grip on the
      // two-handed backhand, letting go for the run and the follow-through.
      const lw = freeHandWeight(a.swing, a.swingT, a.swingShot, s.prepSide, s.prep, speed)
      if (lw > 0.01) {
        const lSh = refs.lSh.current
        const lEl = refs.lEl.current
        const onGrip = a.swing === 'backhand' || (a.swing === 'none' && s.prepSide === 'backhand' && s.prep > 0.3)
        for (let pass = 0; pass < 3; pass++) {
          b.hand(ik.hand)
          b.sweetSpot(ik.sweet)
          ik.dir.subVectors(ik.sweet, ik.hand).normalize()
          ik.target.copy(ik.hand).addScaledVector(ik.dir, onGrip ? 0.1 : 0.3)
          b.leftShoulder(ik.shoulder)
          b.leftHand(ik.hand)
          ik.from.subVectors(ik.hand, ik.shoulder).normalize()
          ik.to.subVectors(ik.target, ik.shoulder).normalize()
          ik.q.setFromUnitVectors(ik.from, ik.to)
          ik.qw.identity().slerp(ik.q, lw)
          lSh.getWorldQuaternion(ik.world).premultiply(ik.qw)
          lSh.parent!.getWorldQuaternion(ik.parent)
          lSh.quaternion.copy(ik.parent.invert().multiply(ik.world))
          const reach = ik.hand.distanceTo(ik.shoulder) - ik.target.distanceTo(ik.shoulder)
          lEl.rotation.x = Math.min(0, Math.max(-2.4, lEl.rotation.x - reach * 2 * lw))
          b.drive(joints, pose.lift)
        }
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
      <ContactShadow />
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
        <Leg m={m} side={1} hip={refs.lHip} knee={refs.lKnee} ankle={refs.lAnk} />
        <Leg m={m} side={-1} hip={refs.rHip} knee={refs.rKnee} ankle={refs.rAnk} />
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

/**
 * How firmly the free hand holds the racket: on the throat in the ready stance (not while
 * running), on the grip through a two-handed backhand until the follow-through.
 */
function freeHandWeight(swing: string, t: number, shot: string, prepSide: string, prep: number, speed: number): number {
  // The backhand slice is one-handed: the free hand lets go after the take-back.
  if (swing === 'backhand' && shot === 'slice') return t < 0.08 ? 1 : Math.max(0, 1 - (t - 0.08) / 0.08)
  if (swing === 'backhand') return t < 0.42 ? 1 : Math.max(0, 1 - (t - 0.42) / 0.14)
  if (swing !== 'none') return 0
  if (prepSide === 'backhand' && prep > 0) return Math.min(1, prep * 2)
  const still = 1 - smoothstep(0.8, 2.2, speed)
  return 0.85 * still * (1 - Math.min(1, prep * 3))
}

let blobTexture: THREE.Texture | null = null

/** Soft radial falloff, drawn once and shared by both players. */
function contactTexture(): THREE.Texture {
  if (blobTexture) return blobTexture
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(0,0,0,1)')
  grad.addColorStop(0.45, 'rgba(0,0,0,0.55)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  blobTexture = new THREE.CanvasTexture(c)
  return blobTexture
}

/**
 * Ambient-occlusion blob under the feet. The sun's shadow map is a few centimetres per texel
 * over the whole venue, too coarse to seat the feet on the court; this darkens the contact.
 */
function ContactShadow() {
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: contactTexture(),
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        color: '#000000',
      }),
    [],
  )
  useEffect(() => () => mat.dispose(), [mat])
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.006} scale={[1.1, 0.8, 1]} material={mat} renderOrder={1}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}

const ik = {
  dir: new THREE.Vector3(),
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
