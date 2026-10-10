import data from './mocap.json'
import type { Euler3, Joint, Pose } from './poses'

// Motion-captured gait cycles (Mixamo, converted by tools/mixamo): legs, spine and pelvis for
// one cycle of two steps, sampled at 30 fps, in the rig's joint space. They replace the
// procedural leg swing where they fit: the forward run and the fast crossover run sideways.

export type MocapJoint = 'spine' | 'lHip' | 'lKnee' | 'lAnk' | 'rHip' | 'rKnee' | 'rAnk'
export const MOCAP_JOINTS: MocapJoint[] = ['spine', 'lHip', 'lKnee', 'lAnk', 'rHip', 'rKnee', 'rAnk']

interface Frame {
  j: Record<MocapJoint, Euler3>
  lift: number
  /** Pelvis heading (radians, + toward the athlete's left). */
  yaw: number
}

export interface Cycle {
  duration: number
  /** Metres covered by one cycle as captured. */
  distance: number
  frames: Frame[]
  /** Mean pelvis heading over the cycle (the run's twist oscillates around it). */
  meanYaw: number
}

function cycle(c: Omit<Cycle, 'meanYaw'>): Cycle {
  return { ...c, meanYaw: c.frames.reduce((s, f) => s + f.yaw, 0) / c.frames.length }
}

export const MOCAP = {
  run: cycle(data.run as Omit<Cycle, 'meanYaw'>),
  strafeRight: cycle(data.strafeRight as Omit<Cycle, 'meanYaw'>),
  strafeLeft: cycle(data.strafeLeft as Omit<Cycle, 'meanYaw'>),
}

export interface MocapSample {
  j: Record<MocapJoint, Euler3>
  lift: number
  yaw: number
}

export function makeSample(): MocapSample {
  const j = {} as Record<MocapJoint, Euler3>
  for (const k of MOCAP_JOINTS) j[k] = [0, 0, 0]
  return { j, lift: 0, yaw: 0 }
}

/** The cycle at `u` (0..1, wraps), interpolated between frames. */
export function sampleCycle(c: Cycle, u: number, out: MocapSample): MocapSample {
  const n = c.frames.length
  const x = (((u % 1) + 1) % 1) * n
  const i = Math.floor(x) % n
  const k = x - Math.floor(x)
  const a = c.frames[i]
  const b = c.frames[(i + 1) % n]
  for (const jn of MOCAP_JOINTS) for (let e = 0; e < 3; e++) out.j[jn][e] = a.j[jn][e] + (b.j[jn][e] - a.j[jn][e]) * k
  out.lift = a.lift + (b.lift - a.lift) * k
  out.yaw = a.yaw + (b.yaw - a.yaw) * k
  return out
}

/** Blends the sample's legs and spine into `pose` with weight `w` (spine scaled by `spineShare`). */
export function blendInto(pose: Pose, s: MocapSample, w: number, spineShare = 1) {
  if (w <= 0) return
  for (const jn of MOCAP_JOINTS) {
    const ww = jn === 'spine' ? w * spineShare : w
    const dst = pose.j[jn as Joint]
    for (let e = 0; e < 3; e++) dst[e] += (s.j[jn][e] - dst[e]) * ww
  }
}
