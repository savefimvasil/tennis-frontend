import { monotoneCubic } from './anim'

// Procedural animation: joint rotations (Euler XYZ, radians) for a right-handed
// athlete built facing +z. Arms and legs hang along -y at rest.
// Shoulder/hip x < 0 swings the limb forward, z < 0 raises the right arm sideways.

export const JOINTS = [
  'spine',
  'neck',
  'lSh',
  'lEl',
  'rSh',
  'rEl',
  'rWr',
  'lHip',
  'lKnee',
  'lAnk',
  'rHip',
  'rKnee',
  'rAnk',
] as const
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

export type Key = { t: number; pose: Pose }

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
  [
    0.12,
    {
      j: {
        spine: [0.22, -1.15, 0],
        rSh: [0.35, -0.9, -1.2],
        rEl: [-0.55, 0, 0],
        rWr: [0, 0, 0.2],
        // Left arm points at the incoming ball.
        lSh: [-1.45, 0, 0.12],
        lEl: [-0.15, 0, 0],
      },
    },
  ],
  [
    0.2,
    {
      j: {
        spine: [0.2, 0.35, 0],
        rSh: [-0.45, -1.5, -1.25],
        rEl: [-0.35, 0, 0],
        // Wrist laid back so the racket head reaches out to the side, face to the net.
        rWr: [-1.1, 0, 0.05],
        // Left arm folds across the chest as the body rotates through.
        lSh: [-1.15, 0, -0.35],
        lEl: [-1.1, 0, 0],
      },
    },
  ],
  [
    0.36,
    {
      j: {
        spine: [0.18, 1.05, 0],
        rSh: [-1.7, -1.0, -0.55],
        rEl: [-1.9, 0, 0],
        rWr: [0.3, 0, 0.4],
        lSh: [-0.25, 0, 0.45],
        lEl: [-0.8, 0, 0],
      },
    },
  ],
  [0.72, {}],
])

// Two-handed backhand: both hands stay on the grip. The racket goes back by the left hip in
// front of the body (not across it), is met with both arms long out in front, and finishes
// with the hands by the right shoulder.
export const BACKHAND = keys([
  [0, {}],
  [
    0.12,
    {
      j: {
        spine: [0.26, 1.2, 0],
        rSh: [-0.6, 0.55, 0.62],
        rEl: [-0.55, 0, 0],
        rWr: [0.25, 0, -0.55],
        lSh: [-0.55, 0, 0.12],
        lEl: [-1.0, 0, 0],
      },
    },
  ],
  [
    0.2,
    {
      j: {
        spine: [0.2, 0.05, 0],
        rSh: [-0.95, 0.85, 0.32],
        rEl: [-0.25, 0, 0],
        rWr: [-0.55, 0, -0.1],
        lSh: [-0.95, 0, -0.25],
        lEl: [-0.45, 0, 0],
      },
    },
  ],
  [
    0.36,
    {
      j: {
        spine: [0.14, -0.95, 0],
        rSh: [-1.3, 0.45, 0.05],
        rEl: [-1.85, 0, 0],
        rWr: [0.35, 0, -0.3],
        lSh: [-1.2, 0, -0.6],
        lEl: [-1.7, 0, 0],
      },
    },
  ],
  [0.72, {}],
])

/** Receiving the serve: low and wide, weight forward, racket out in front on both hands. */
export const RECEIVE: Pose = makePose(
  mergeReady({
    j: {
      spine: [0.55, 0, 0],
      neck: [-0.48, 0, 0],
      rSh: [-0.85, 0.2, 0.18],
      rEl: [-1.3, 0, 0],
      rWr: [0.35, 0, 1.05],
      lSh: [-0.8, -0.1, 0.22],
      lEl: [-1.3, 0, 0],
      lHip: [-0.78, 0, 0.27],
      rHip: [-0.78, 0, -0.27],
      lKnee: [1.3, 0, 0],
      rKnee: [1.3, 0, 0],
    },
    lift: -0.25,
  }),
)

// Serve: trophy position by 0.5 s and held until the hit, which jumps time to 1.0.
export const SERVE_KEYS = keys([
  [0, {}],
  [
    0.5,
    {
      j: {
        spine: [-0.25, -0.9, 0],
        neck: [-0.5, 0.5, 0],
        rSh: [0.2, -0.6, -2.25],
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
    },
  ],
  [
    0.95,
    {
      j: {
        spine: [-0.3, -0.85, 0],
        neck: [-0.55, 0.5, 0],
        rSh: [0.3, -0.6, -2.3],
        rEl: [-2.2, 0, 0],
        rWr: [0.4, 0, 0.2],
        lSh: [-2.9, 0, 0.1],
        lEl: [-0.1, 0, 0],
        lKnee: [0.8, 0, 0],
        rKnee: [0.9, 0, 0],
      },
      lift: -0.18,
    },
  ],
  [
    1.0,
    {
      j: {
        spine: [0.15, 0.1, 0],
        neck: [-0.4, 0, 0],
        rSh: [-2.95, -1.0, -0.3],
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
    },
  ],
  [
    1.25,
    {
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
    },
  ],
  [1.75, {}],
])

/** Key times and per-channel values of a track, laid out for the spline. */
interface Channels {
  ts: number[]
  j: Record<Joint, [number[], number[], number[]]>
  lift: number[]
}

const channelCache = new WeakMap<Key[], Channels>()

function channels(track: Key[]): Channels {
  let c = channelCache.get(track)
  if (!c) {
    const j = {} as Channels['j']
    for (const k of JOINTS) j[k] = [0, 1, 2].map((i) => track.map((key) => key.pose.j[k][i])) as Channels['j'][Joint]
    c = { ts: track.map((key) => key.t), j, lift: track.map((key) => key.pose.lift) }
    channelCache.set(track, c)
  }
  return c
}

/**
 * Samples a keyframe track at time t into `out`. A monotone cubic spline per channel keeps the
 * motion flowing through the keys (the racket is still moving at contact) while stopping at
 * real turning points such as the end of the backswing, and never overshooting a key.
 */
export function sampleTrack(track: Key[], t: number, out: Pose): Pose {
  const c = channels(track)
  for (const k of JOINTS) {
    const ch = c.j[k]
    out.j[k][0] = monotoneCubic(c.ts, ch[0], t)
    out.j[k][1] = monotoneCubic(c.ts, ch[1], t)
    out.j[k][2] = monotoneCubic(c.ts, ch[2], t)
  }
  out.lift = monotoneCubic(c.ts, c.lift, t)
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
