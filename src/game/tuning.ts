// Every gameplay number in one place, for playtesting.

export type ShotType = 'topspin' | 'slice' | 'lob' | 'flat'

export interface ShotSpec {
  speed: number
  spin: number
  netClearance: number
  /** Default depth: distance from the net to the aim point (m). */
  depth: number
  lobPitch?: number
}

export const SHOTS: Record<ShotType, ShotSpec> = {
  topspin: { speed: 29, spin: 270, netClearance: 0.55, depth: 9.2 },
  slice: { speed: 24, spin: -150, netClearance: 0.22, depth: 8.6 },
  lob: { speed: 0, spin: 110, netClearance: 2.2, depth: 9.8, lobPitch: 0.9 },
  flat: { speed: 36, spin: 70, netClearance: 0.18, depth: 9.6 },
}

/**
 * Serve types for a right-hander. sidespin > 0 curves the ball to the server's left (slice),
 * < 0 to the right (kick).
 */
export const SERVES: Record<ShotType, { speed: number; spin: number; sidespin: number; netClearance: number }> = {
  flat: { speed: 52, spin: 60, sidespin: 0, netClearance: 0.04 },
  topspin: { speed: 40, spin: 260, sidespin: -90, netClearance: 0.3 },
  slice: { speed: 44, spin: 80, sidespin: 200, netClearance: 0.12 },
  lob: { speed: 34, spin: 150, sidespin: 0, netClearance: 0.4 },
}

/** Racket's apparent coefficient of restitution: share of the incoming speed returned. */
export const RACKET_EA = 0.4
/** Incoming speed already baked into the SHOTS speeds (a typical rally ball, m/s). */
export const RALLY_BALL_SPEED = 22

export type PaceId = 'club' | 'tour'
/** Swing speed multiplier. Club pace is closer to GTA: slower, loopier rallies. */
export const PACE: Record<PaceId, number> = { club: 0.78, tour: 1 }

export type Grade = 'perfect' | 'good' | 'early' | 'late'

/** pace: speed multiplier; error: standard deviation (m) of where the shot lands vs. the aim point. */
export const GRADE_EFFECT: Record<Grade, { pace: number; error: number }> = {
  perfect: { pace: 1.08, error: 0.28 },
  good: { pace: 1, error: 0.55 },
  early: { pace: 0.86, error: 1.05 },
  late: { pace: 0.84, error: 1.15 },
}

export const TIMING = {
  /** Ideal time between pressing a shot button and the ball reaching the hitting plane. */
  perfect: [0.13, 0.27] as const,
  good: [0.05, 0.48] as const,
  /** Contact happens this long after the swing starts (the contact key of the swing animation). */
  swingLead: 0.2,
}

export const PLAYER = {
  speed: 6.0,
  /** Players reach ~5 m/s in about a second; braking is quicker than accelerating. */
  accel: 9,
  brake: 18,
  swingSlow: 0.45,
  /** Max sideways distance from body to ball at contact. */
  reach: 1.55,
  /** Comfortable sideways distance to the ball at contact: arm plus racket on the forehand,
   * closer on the two-handed backhand, where the racket arm reaches across the body. */
  stance: 1.1,
  stanceBackhand: 0.8,
  /** Ball is struck in front of the body, as in a real forehand. */
  contactAhead: 0.5,
  contactBehind: 0.45,
  minContactY: 0.12,
  maxContactY: 2.75,
  /** How strongly a queued swing pulls the player toward the ball. */
  assist: 0.65,
}

export const SERVE = {
  baselineGap: 0.35,
  /** Toss apex ~2.7 m: within reach of the racket at full stretch (shoulder + arm + racket). */
  tossSpeed: 4.95,
  handHeight: 1.45,
  apex: 1.45 + (4.95 * 4.95) / (2 * 9.81),
  perfectY: [2.45, 2.75] as const,
  goodY: [2.15, 2.75] as const,
  /** From release to contact: the racket swings up from the trophy position. */
  swingTime: 0.15,
}

export type Difficulty = 'easy' | 'pro' | 'ace'

export interface AiSpec {
  speed: number
  reaction: number
  /** Swing speed relative to the player's. */
  pace: number
  /** Probabilities of the AI's timing grade. */
  grades: Record<Grade, number>
  /** Chance of letting an out ball go. */
  readsOut: number
  aimMargin: number
  serveFirst: number
  /** Base chance of an unforced error per shot; rises against fast, deep balls. */
  unforced: number
}

export const AI_LEVELS: Record<Difficulty, AiSpec> = {
  easy: {
    speed: 4.3,
    reaction: 0.45,
    pace: 0.85,
    grades: { perfect: 0.05, good: 0.45, early: 0.25, late: 0.25 },
    readsOut: 0.2,
    aimMargin: 1.9,
    serveFirst: 0.5,
    unforced: 0.11,
  },
  pro: {
    speed: 5.6,
    reaction: 0.22,
    pace: 1,
    grades: { perfect: 0.3, good: 0.5, early: 0.1, late: 0.1 },
    readsOut: 0.7,
    aimMargin: 1.3,
    serveFirst: 0.68,
    unforced: 0.05,
  },
  ace: {
    speed: 6.6,
    reaction: 0.1,
    pace: 1.12,
    grades: { perfect: 0.65, good: 0.33, early: 0.01, late: 0.01 },
    readsOut: 0.97,
    aimMargin: 0.8,
    serveFirst: 0.8,
    unforced: 0.015,
  },
}
