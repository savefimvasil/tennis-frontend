// Every gameplay number in one place, for playtesting.

export type ShotType = 'topspin' | 'slice' | 'lob' | 'flat'

export interface ShotSpec {
  speed: number
  spin: number
  netClearance: number
  /** Default depth: distance from the net to the aim point (m). */
  depth: number
  /** Fixed launch angle (rad): the solver finds the speed instead (lob, slice). */
  lobPitch?: number
}

export const SHOTS: Record<ShotType, ShotSpec> = {
  // Four shapes, not four speeds of the same shot:
  // - topspin: ~3000 rpm, a high arc 1-1.4 m over the tape, dips in deep and kicks up high
  //   (spin adds drag, so it is struck harder than it lands: ~120 km/h on tour pace);
  // - slice: backspin on a fixed low launch, skims ~0.3 m over the tape to mid-court and
  //   stays low and slows after the bounce (as a speed-solved shot it used to float long);
  // - flat: the fastest and lowest, deepest, skidding through;
  // - lob: high and deep over the net player.
  topspin: { speed: 34, spin: 310, netClearance: 0.55, depth: 9.6 },
  slice: { speed: 25, spin: -260, netClearance: 0.28, depth: 8.0, lobPitch: 0.07 },
  lob: { speed: 0, spin: 110, netClearance: 2.2, depth: 9.8, lobPitch: 0.9 },
  flat: { speed: 40, spin: 50, netClearance: 0.15, depth: 10.2 },
}

/**
 * Serve types for a right-hander. sidespin > 0 curves the ball to the server's left (slice),
 * < 0 to the right. gyro is spin about the line of flight: nothing in the air, but at the
 * bounce it grips and kicks the ball sideways (> 0 to the server's right). The kick serve's
 * tilted axis is all three: ~4000 rpm that dips it in, then jumps it up and away.
 */
export const SERVES: Record<
  ShotType,
  { speed: number; spin: number; sidespin: number; gyro?: number; netClearance: number }
> = {
  flat: { speed: 52, spin: 60, sidespin: 0, netClearance: 0.04 },
  topspin: { speed: 40, spin: 330, sidespin: -60, gyro: 250, netClearance: 0.3 },
  slice: { speed: 44, spin: 80, sidespin: 200, netClearance: 0.12 },
  lob: { speed: 34, spin: 150, sidespin: 0, netClearance: 0.4 },
}

/** Racket's apparent coefficient of restitution: share of the incoming speed returned. */
export const RACKET_EA = 0.4
/** Incoming speed already baked into the SHOTS speeds (a typical rally ball, m/s). */
export const RALLY_BALL_SPEED = 22

export type PaceId = 'club' | 'tour'
/**
 * Swing speed multiplier, applied to both ball speed and spin (both scale with racket-head speed).
 * Club pace is closer to GTA: slower rallies. Below ~0.85 a groundstroke has to be lofted
 * well above 2.5 m to reach a deep target, which looks like a moonball.
 */
export const PACE: Record<PaceId, number> = { club: 0.88, tour: 1 }

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
  /**
   * Holding a run in one direction builds up to a sprint over `sprintRamp` seconds: a quick
   * first step, then a little extra for the long chases out wide.
   */
  sprint: 7.0,
  sprintRamp: 0.6,
  /** Players reach ~5 m/s in well under a second; braking is quicker than accelerating. */
  accel: 11,
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
  /**
   * Serve direction works like power: holding left/right during the toss sweeps the aim at
   * this rate (aim units per second). 1 is the line (wide or the T); past ~1.2 it is a fault.
   */
  aimRate: 2.8,
  aimMax: 1.6,
}

export type Difficulty = 'beginner' | 'easy' | 'pro' | 'champion'

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
  /** Chance of aiming through the middle instead of away from the player. */
  centre: number
  /** Extra error chance on serve returns, scaled by the serve's pace and how wide it is. */
  returnError: number
  /** Extra sideways reach (m) when returning serve: lunges and blocked returns. */
  returnReach: number
  /** Typical error (m, sideways) in reading where the ball will be: it arrives off-balance. */
  readNoise: number
}

/** Help the human player gets at each difficulty. */
export interface PlayerHelp {
  /** Pull toward the stance spot once a shot key is pressed (share of top speed). */
  assist: number
  /** Pull toward the stance spot before any key is pressed (GTA-style auto-positioning). */
  track: number
  /** Widens the timing windows around the ideal press time. */
  timing: number
  /** Max sideways distance to the ball at contact. */
  reach: number
  /** Scales the landing scatter of the player's shots. */
  error: number
}

export const PLAYER_HELP: Record<Difficulty, PlayerHelp> = {
  beginner: { assist: 1, track: 0.45, timing: 1.4, reach: 1.85, error: 0.75 },
  easy: { assist: 0.75, track: 0.2, timing: 1.15, reach: 1.65, error: 0.85 },
  pro: { assist: 0.6, track: 0, timing: 1, reach: 1.55, error: 1 },
  champion: { assist: 0.5, track: 0, timing: 0.92, reach: 1.5, error: 1.05 },
}

/** Online matches: both players get the same, mid-level help (the server enforces it). */
export const ONLINE_HELP: PlayerHelp = { assist: 0.75, track: 0.2, timing: 1.15, reach: 1.65, error: 0.85 }

export const AI_LEVELS: Record<Difficulty, AiSpec> = {
  beginner: {
    speed: 4.5,
    reaction: 0.42,
    pace: 0.86,
    grades: { perfect: 0.08, good: 0.44, early: 0.24, late: 0.24 },
    readsOut: 0.1,
    aimMargin: 2.2,
    serveFirst: 0.45,
    unforced: 0.07,
    centre: 0.5,
    returnError: 0.2,
    returnReach: 0.2,
    readNoise: 0.55,
  },
  easy: {
    speed: 5.6,
    reaction: 0.22,
    pace: 1,
    grades: { perfect: 0.3, good: 0.5, early: 0.1, late: 0.1 },
    readsOut: 0.7,
    aimMargin: 1.3,
    serveFirst: 0.68,
    unforced: 0.05,
    centre: 0.28,
    returnError: 0.12,
    returnReach: 0.45,
    readNoise: 0.32,
  },
  pro: {
    // As fast as the player (both sprint to 7 m/s): it wins on reading the ball, not on legs.
    speed: 6.0,
    reaction: 0.1,
    pace: 1.06,
    grades: { perfect: 0.65, good: 0.33, early: 0.01, late: 0.01 },
    readsOut: 0.97,
    aimMargin: 1.0,
    serveFirst: 0.8,
    unforced: 0.045,
    centre: 0.15,
    returnError: 0.12,
    returnReach: 0.6,
    readNoise: 0.16,
  },
  champion: {
    // The hardest: reads the ball almost perfectly, hits harder and closer to the lines,
    // and hardly misses. Same legs as the player: it wins on anticipation.
    speed: 6.0,
    reaction: 0.06,
    pace: 1.1,
    grades: { perfect: 0.82, good: 0.17, early: 0.005, late: 0.005 },
    readsOut: 0.99,
    aimMargin: 0.75,
    serveFirst: 0.86,
    unforced: 0.022,
    centre: 0.08,
    returnError: 0.06,
    returnReach: 0.7,
    readNoise: 0.08,
  },
}
