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

export const SERVES: Record<ShotType, { speed: number; spin: number; netClearance: number }> = {
  flat: { speed: 52, spin: 60, netClearance: 0.04 },
  topspin: { speed: 43, spin: 230, netClearance: 0.3 },
  slice: { speed: 44, spin: 120, netClearance: 0.12 },
  lob: { speed: 34, spin: 150, netClearance: 0.4 },
}

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
  /** Start the swing animation this long before contact. */
  swingLead: 0.2,
}

export const PLAYER = {
  speed: 6.2,
  /** Elite players reach ~5-6 m/s within 1 s; braking is quicker than accelerating. */
  accel: 15,
  brake: 26,
  swingSlow: 0.45,
  /** Max sideways distance from body to ball at contact. */
  reach: 1.55,
  /** Ball is struck slightly in front of the body. */
  contactAhead: 0.35,
  contactBehind: 0.45,
  minContactY: 0.12,
  maxContactY: 2.75,
  /** How strongly a queued swing pulls the player toward the ball. */
  assist: 0.65,
}

export const SERVE = {
  baselineGap: 0.35,
  tossSpeed: 5.3,
  handHeight: 1.45,
  perfectY: [2.62, 3.05] as const,
  goodY: [2.25, 3.3] as const,
}

export type Difficulty = 'easy' | 'pro' | 'ace'

export interface AiSpec {
  speed: number
  reaction: number
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
    speed: 4.9,
    reaction: 0.32,
    grades: { perfect: 0.1, good: 0.5, early: 0.2, late: 0.2 },
    readsOut: 0.3,
    aimMargin: 1.5,
    serveFirst: 0.55,
    unforced: 0.07,
  },
  pro: {
    speed: 5.8,
    reaction: 0.2,
    grades: { perfect: 0.3, good: 0.5, early: 0.1, late: 0.1 },
    readsOut: 0.7,
    aimMargin: 1.3,
    serveFirst: 0.68,
    unforced: 0.03,
  },
  ace: {
    speed: 6.6,
    reaction: 0.12,
    grades: { perfect: 0.55, good: 0.4, early: 0.03, late: 0.02 },
    readsOut: 0.95,
    aimMargin: 1.0,
    serveFirst: 0.78,
    unforced: 0.012,
  },
}
