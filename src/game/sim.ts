import type { RapierRigidBody } from '@react-three/rapier'
import type { Side } from './constants'
import type { Grade, ShotType } from './tuning'

// Mutable per-frame simulation state. Kept outside React so the 120 Hz game loop
// never triggers re-renders; components read it inside useFrame.

export type SwingKind = 'forehand' | 'backhand' | 'serve' | 'none'

export interface Athlete {
  x: number
  z: number
  vx: number
  vz: number
  /** Facing yaw: the human looks toward -z (PI), the AI toward +z (0). */
  yaw: number
  swing: SwingKind
  swingT: number
  swingShot: ShotType
  /** Serve: ball tossed and awaiting the hit. */
  tossing: boolean
  /** Queued shot from the input (human) or plan (AI). */
  queued: { shot: ShotType; grade: Grade | null; pressedAt: number; releasedAt?: number } | null
  /** Movement target for the AI. */
  target: { x: number; z: number } | null
  celebrate: number
  /** Split-step timer (s remaining). */
  /** Seconds of sustained running in one direction: builds top speed up to a sprint. */
  run: number
  split: number
  /** Ball height expected at contact, used to bend the swing. */
  contactY: number
  /** Where the ball will be met (world), used to aim the racket arm; set when a swing starts. */
  aim: { x: number; y: number; z: number } | null
  /** Sim time of the planned contact. */
  contactAt: number
  /** Racket sweet spot (world), written by the renderer each frame. */
  sweet: { x: number; y: number; z: number } | null
  /** A released serve waiting for the racket to reach the ball. */
  pendingServe: { shot: ShotType; grade: Grade; aimX: number } | null
}

export type RallyPhase = 'idle' | 'serve' | 'rally' | 'dead'

export interface BallEvent {
  id: number
  kind: 'hit' | 'bounce' | 'net' | 'fence'
  x: number
  y: number
  z: number
  power: number
}

export const sim = {
  ball: null as RapierRigidBody | null,
  time: 0,
  phase: 'idle' as RallyPhase,
  server: 0 as Side,
  serveNumber: 1 as 1 | 2,
  deuceCourt: true,
  /** The server is holding the ball (pre-toss). */
  held: true,
  lastHitter: null as Side | null,
  hits: 0,
  /** Bounces since the last hit. */
  bounces: 0,
  firstBounce: null as { x: number; z: number } | null,
  /**
   * A close line call under review (Hawk-Eye): the bounce mark, the line it was judged
   * against, and how far out it was. The camera and the court graphics show it while set.
   */
  review: null as {
    x: number
    z: number
    /** The line: 'x' = a sideline at x = value, 'z' = a baseline/service line at z = value. */
    axis: 'x' | 'z'
    value: number
    cm: number
  } | null,
  netTouched: false,
  receiverTouched: false,
  deadTimer: 0,
  prevVy: 0,
  prevV: { x: 0, y: 0, z: 0 },
  prevW: { x: 0, y: 0, z: 0 },
  prevZ: 0,
  landing: null as { x: number; z: number; t: number } | null,
  /** Predicted flight of the current shot for AI and assists. */
  prediction: null as import('../physics/flight').Flight | null,
  predictionStart: 0,
  shake: 0,
  events: [] as BallEvent[],
  athletes: [makeAthlete(Math.PI), makeAthlete(0)] as [Athlete, Athlete],
}

function makeAthlete(yaw: number): Athlete {
  return {
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    yaw,
    swing: 'none',
    swingT: 0,
    swingShot: 'topspin',
    tossing: false,
    queued: null,
    target: null,
    celebrate: 0,
    split: 0,
    run: 0,
    contactY: 1,
    aim: null,
    contactAt: 0,
    sweet: null,
    pendingServe: null,
  }
}

let eventSeq = 1

export function pushEvent(e: Omit<BallEvent, 'id'>) {
  sim.events.push({ ...e, id: eventSeq++ })
  if (sim.events.length > 32) sim.events.shift()
}
