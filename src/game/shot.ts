import { COURT, HUMAN, type Side } from './constants'
import { solveShot, type ShotSolution, type V3 } from '../physics/flight'
import {
  GRADE_EFFECT,
  RACKET_EA,
  RALLY_BALL_SPEED,
  SERVE,
  SERVES,
  SHOTS,
  TIMING,
  type Grade,
  type ShotType,
} from './tuning'

// How a swing becomes a ball flight: timing grade, aim, scatter and the shot solver.
// Pure and deterministic for a given random source, so the multiplayer server runs this
// exact file (vendored into tennis-backend) to recompute every shot a client claims.

/** Random source returning [0, 1). */
export type Rng = () => number

/** Small, fast seeded PRNG (mulberry32). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Random source for hit `hit` of a rally whose server-issued seed is `seed`. */
export function shotRng(seed: number, hit: number): Rng {
  return mulberry32((seed ^ Math.imul(hit + 1, 0x9e3779b1)) >>> 0)
}

/** Standard normal sample (Box-Muller), clipped to +-2.5 sigma. */
export function gauss(rng: Rng) {
  const u = 1 - rng()
  const v = rng()
  const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return Math.max(-2.5, Math.min(2.5, n))
}

/** Grades a press `tt` seconds before contact; `widen` > 1 stretches the windows around the ideal. */
export function gradeFor(tt: number, widen = 1): Grade {
  const mid = (TIMING.perfect[0] + TIMING.perfect[1]) / 2
  // Early presses are stretched forward in time, late ones squeezed toward contact.
  const d = tt >= mid ? mid + (tt - mid) / widen : mid - (mid - tt) / widen
  if (d >= TIMING.perfect[0] && d <= TIMING.perfect[1]) return 'perfect'
  if (d >= TIMING.good[0] && d <= TIMING.good[1]) return 'good'
  return d > TIMING.good[1] ? 'early' : 'late'
}

/** Serve timing: how high the toss was when the racket started up from the trophy position. */
export function serveGrade(y: number, vy: number): Grade {
  if (y >= SERVE.perfectY[0] && y <= SERVE.perfectY[1]) return 'perfect'
  if (y >= SERVE.goodY[0] && y <= SERVE.goodY[1]) return 'good'
  return vy > 0 ? 'early' : 'late'
}

/** Sideways sign (+1 right of the centre mark, in world x) the server stands on. */
export function serverXSign(server: Side, deuce: boolean): 1 | -1 {
  const s = server === HUMAN ? 1 : -1
  return (deuce ? s : -s) as 1 | -1
}

/**
 * Serve aim, in world x (the server's screen right is +x for the player): 0 is the middle
 * of the box and +-1 lands just inside its side lines (wide, or down the T). The aim is
 * swept by holding left/right during the toss, so it can overshoot: past ~1.15 it is out.
 */
export function serveTarget(server: Side, deuce: boolean, aimX: number, safe: boolean) {
  const boxSign = -serverXSign(server, deuce)
  // Box spans 0..4.115 from the centre line; aim it between ~0.25 m inside each line.
  const centre = boxSign * 2.06
  const span = 1.8
  const x = centre + Math.max(-SERVE.aimMax, Math.min(SERVE.aimMax, aimX)) * span
  const depth = COURT.serviceLine - (safe ? 1.25 : 0.75)
  const receiverSign = server === HUMAN ? -1 : 1
  return { x, z: receiverSign * depth }
}

/** Groundstroke aim for a player defending +z: the stick steers across, up/down sets depth. */
export function rallyTarget(shot: ShotType, moveX: number, moveY: number) {
  const tx = Math.max(-3.7, Math.min(3.7, moveX * 3.1))
  const depth = Math.max(4.8, Math.min(11.1, SHOTS[shot].depth + moveY * 1.7))
  return { x: tx, z: -depth }
}

export type Miss = 'net' | 'long' | 'wide' | null

export interface ShotInput {
  /** Ball position at contact. */
  from: V3
  /** Ball velocity just before contact. */
  vin: V3
  serve: boolean
  shot: ShotType
  grade: Grade
  target: { x: number; z: number }
  /** Hitting on the run spreads the shot. */
  running: boolean
  /** Sideways distance from the body to the ball (+ forehand side). */
  lateral: number
  /** World x of the hitter's right-hand direction; early/late contact pulls/pushes along it. */
  rightX: number
  /** +1 forehand, -1 backhand. */
  hand: 1 | -1
  /** Swing speed multiplier (court pace, AI level). */
  swingMul: number
  /** Forced error (AI only). */
  miss: Miss
}

export interface ShotResult extends ShotSolution {
  speed: number
}

/** Turns a swing into a launch velocity and spin. Consumes `rng` in a fixed order. */
export function resolveShot(inp: ShotInput, rng: Rng): ShotResult {
  const { from, vin, serve, shot, grade, target, miss } = inp
  const eff = GRADE_EFFECT[grade]
  const running = inp.running ? 0.35 : 0
  // Harder contacts are less accurate: incoming pace, awkward height, reaching wide.
  const pace = Math.hypot(vin.x, vin.y, vin.z)
  const height = from.y < 0.45 ? (0.45 - from.y) * 2.5 : from.y > 1.8 ? (from.y - 1.8) * 1.2 : 0
  const reach = Math.max(0, Math.abs(inp.lateral) - 0.9) * 1.2
  const difficulty = serve ? 1 : 1 + Math.max(0, pace - 24) / 22 + height + reach
  const errScale = (serve ? 0.5 : 1) * (eff.error + running) * difficulty
  // Depth scatters more than direction for real groundstrokes.
  let tx = target.x + gauss(rng) * errScale * 0.75
  let tz = target.z + gauss(rng) * errScale
  // Early contact pulls the ball across the body, late contact pushes it the other way.
  if (!serve && (grade === 'early' || grade === 'late')) {
    const bias = (grade === 'early' ? -1 : 1) * inp.hand * (0.8 + rng() * 0.7)
    tx += inp.rightX * bias
  }
  if (miss === 'long') tz += Math.sign(tz) * (COURT.halfLength - Math.abs(tz) + 0.4 + rng() * 1.2)
  if (miss === 'wide') tx = Math.sign(tx || 1) * (COURT.singlesHalfWidth + 0.3 + rng() * 1)
  const spec = serve ? SERVES[shot] : SHOTS[shot]
  let netClearance = spec.netClearance
  // Mistimed shots sometimes find the tape.
  if ((grade === 'early' || grade === 'late') && rng() < 0.3) netClearance -= 0.25 + rng() * 0.3
  if (miss === 'net') netClearance = -0.35 - rng() * 0.3
  const lowBall = from.y < 0.45 && !serve ? 0.85 : 1
  // Racket impact: part of the incoming ball's speed comes back (v_out = eA v_in + (1 + eA) V_racket).
  const rebound = serve || shot === 'lob' ? 0 : Math.max(-3, Math.min(8, RACKET_EA * (pace - RALLY_BALL_SPEED)))
  const sol = solveShot({
    from,
    target: { x: tx, z: tz },
    speed: spec.speed * eff.pace * lowBall * inp.swingMul + rebound,
    // Spin scales with racket-head speed like the pace does.
    spin: spec.spin * (grade === 'perfect' ? 1.1 : 1) * (serve ? 1 : inp.swingMul),
    sidespin: serve ? SERVES[shot].sidespin : 0,
    netClearance,
    lobPitch: serve ? undefined : SHOTS[shot].lobPitch,
  })
  return { ...sol, speed: Math.hypot(sol.v.x, sol.v.y, sol.v.z) }
}
