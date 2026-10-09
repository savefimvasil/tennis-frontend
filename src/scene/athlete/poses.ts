// Procedural animation: joint rotations (Euler XYZ, radians) for a right-handed
// athlete built facing +z. Arms and legs hang along -y at rest.
// Shoulder/hip x < 0 swings the limb forward, z < 0 raises the right arm sideways.

export const JOINTS = ['spine', 'neck', 'lSh', 'lEl', 'rSh', 'rEl', 'rWr', 'lHip', 'lKnee', 'rHip', 'rKnee'] as const
export type Joint = (typeof JOINTS)[number]
export type Euler3 = [number, number, number]

export interface Pose {
  j: Record<Joint, Euler3>
  /** Pelvis height offset (crouch / jump). */
  lift: number
}

export type PartialPose = { j?: Partial<Record<Joint, Euler3>>; lift?: number }

export function makePose(p: PartialPose = {}): Pose {
  const j = {} as Record<Joint, Euler3>
  for (const k of JOINTS) j[k] = (p.j?.[k] ?? [0, 0, 0]).slice() as Euler3
  return { j, lift: p.lift ?? 0 }
}

export const READY: Pose = makePose({
  j: {
    spine: [0.28, 0, 0],
    neck: [-0.22, 0, 0],
    rSh: [-0.45, 0.1, -0.18],
    rEl: [-1.25, 0, 0],
    rWr: [0.3, 0, 0.9],
    lSh: [-0.5, -0.1, 0.32],
    lEl: [-1.25, 0, 0],
    lHip: [-0.45, 0, 0.06],
    rHip: [-0.45, 0, -0.06],
    lKnee: [0.75, 0, 0],
    rKnee: [0.75, 0, 0],
  },
  lift: -0.09,
})

type Key = { t: number; pose: Pose }

function keys(list: [number, PartialPose][]): Key[] {
  return list.map(([t, p]) => ({ t, pose: makePose(mergeReady(p)) }))
}

/** Unspecified joints inherit the ready stance so keys only describe what moves. */
function mergeReady(p: PartialPose): PartialPose {
  const j: Partial<Record<Joint, Euler3>> = {}
  for (const k of JOINTS) j[k] = p.j?.[k] ?? READY.j[k]
  return { j, lift: p.lift ?? READY.lift }
}

// Groundstrokes: contact happens 0.2 s after the swing starts.
export const FOREHAND = keys([
  [0, {}],
  [0.12, {
    j: {
      spine: [0.22, -1.15, 0],
      rSh: [0.35, 0, -1.2],
      rEl: [-0.55, 0, 0],
      rWr: [0, 0, 0.2],
      lSh: [-1.25, 0, 0.35],
      lEl: [-0.2, 0, 0],
    },
  }],
  [0.2, {
    j: {
      spine: [0.2, 0.1, 0],
      rSh: [-0.2, 0, -1.35],
      rEl: [-0.15, 0, 0],
      rWr: [0, 0, 0.05],
      lSh: [-0.7, 0, 0.75],
      lEl: [-0.3, 0, 0],
    },
  }],
  [0.36, {
    j: {
      spine: [0.18, 1.05, 0],
      rSh: [-1.7, 0, -0.55],
      rEl: [-1.9, 0, 0],
      rWr: [0.3, 0, 0.4],
      lSh: [-0.25, 0, 0.45],
      lEl: [-0.8, 0, 0],
    },
  }],
  [0.72, {}],
])

export const BACKHAND = keys([
  [0, {}],
  [0.12, {
    j: {
      spine: [0.22, 1.2, 0],
      rSh: [0.1, 0, 0.55],
      rEl: [-0.7, 0, 0],
      rWr: [0, 0, -0.3],
      lSh: [0.25, 0, 0.85],
      lEl: [-0.6, 0, 0],
    },
  }],
  [0.2, {
    j: {
      spine: [0.2, -0.15, 0],
      rSh: [-0.6, 0, 0.6],
      rEl: [-0.3, 0, 0],
      rWr: [0, 0, -0.1],
      lSh: [-0.55, 0, 0.95],
      lEl: [-0.45, 0, 0],
    },
  }],
  [0.36, {
    j: {
      spine: [0.15, -1.1, 0],
      rSh: [-2.2, 0, 0.3],
      rEl: [-1.4, 0, 0],
      rWr: [0.2, 0, -0.4],
      lSh: [-2.0, 0, 0.2],
      lEl: [-1.4, 0, 0],
    },
  }],
  [0.72, {}],
])

// Serve: trophy position by 0.5 s and held until the hit, which jumps time to 1.0.
export const SERVE_KEYS = keys([
  [0, {}],
  [0.5, {
    j: {
      spine: [-0.25, -0.9, 0],
      neck: [-0.5, 0.5, 0],
      rSh: [0.2, 0, -2.25],
      rEl: [-2.0, 0, 0],
      rWr: [0.4, 0, 0.2],
      lSh: [-2.85, 0, 0.1],
      lEl: [-0.1, 0, 0],
      lHip: [-0.2, 0, 0.1],
      rHip: [-0.4, 0, -0.1],
      lKnee: [0.65, 0, 0],
      rKnee: [0.8, 0, 0],
    },
    lift: -0.14,
  }],
  [0.95, {
    j: {
      spine: [-0.3, -0.85, 0],
      neck: [-0.55, 0.5, 0],
      rSh: [0.3, 0, -2.3],
      rEl: [-2.2, 0, 0],
      rWr: [0.4, 0, 0.2],
      lSh: [-2.9, 0, 0.1],
      lEl: [-0.1, 0, 0],
      lKnee: [0.8, 0, 0],
      rKnee: [0.9, 0, 0],
    },
    lift: -0.18,
  }],
  [1.0, {
    j: {
      spine: [0.15, 0.1, 0],
      neck: [-0.4, 0, 0],
      rSh: [-2.95, 0, -0.3],
      rEl: [-0.05, 0, 0],
      rWr: [0.2, 0, 0],
      lSh: [-1.0, 0, 0.4],
      lEl: [-0.5, 0, 0],
      lHip: [-0.1, 0, 0],
      rHip: [0.1, 0, 0],
      lKnee: [0.1, 0, 0],
      rKnee: [0.15, 0, 0],
    },
    lift: 0.12,
  }],
  [1.25, {
    j: {
      spine: [0.55, 0.9, 0],
      rSh: [-0.6, 0, 0.65],
      rEl: [-0.6, 0, 0],
      rWr: [0.3, 0, -0.4],
      lSh: [-0.3, 0, 0.6],
      lEl: [-0.9, 0, 0],
      lHip: [-0.8, 0, 0],
      rHip: [0.3, 0, 0],
      lKnee: [0.6, 0, 0],
      rKnee: [0.9, 0, 0],
    },
    lift: -0.05,
  }],
  [1.75, {}],
])

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function smooth(t: number) {
  return t * t * (3 - 2 * t)
}

/** Samples a keyframe track at time t into `out`. */
export function sampleTrack(track: Key[], t: number, out: Pose): Pose {
  let i = 0
  while (i < track.length - 2 && t > track[i + 1].t) i++
  const a = track[i]
  const b = track[i + 1]
  const u = smooth(Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))))
  for (const k of JOINTS) {
    const ja = a.pose.j[k]
    const jb = b.pose.j[k]
    out.j[k][0] = lerp(ja[0], jb[0], u)
    out.j[k][1] = lerp(ja[1], jb[1], u)
    out.j[k][2] = lerp(ja[2], jb[2], u)
  }
  out.lift = lerp(a.pose.lift, b.pose.lift, u)
  return out
}

export function copyPose(src: Pose, out: Pose) {
  for (const k of JOINTS) {
    out.j[k][0] = src.j[k][0]
    out.j[k][1] = src.j[k][1]
    out.j[k][2] = src.j[k][2]
  }
  out.lift = src.lift
}
