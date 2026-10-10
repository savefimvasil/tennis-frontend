// COPY of tennis-backend/src/protocol/protocol.ts (the wire contract). Keep the two identical.

/**
 * Wire protocol shared by tennis-backend and tennis-frontend.
 *
 * This file is self-contained (no imports) so the frontend can copy it verbatim to
 * `src/net/protocol.ts` and type its socket as
 * `Socket<ServerToClientEvents, ClientToServerEvents>` from socket.io-client.
 *
 * Coordinates: everything on the wire is in the CANONICAL court frame, where seat 0
 * defends +z and seat 1 defends -z (the frontend's HUMAN/AI layout). A client sitting in
 * seat 1 renders itself at +z, so it converts with `toCanonical`/`fromCanonical` (a
 * 180 degree turn about the y axis, which leaves the physics unchanged).
 *
 * Times: `t` fields are the server clock in milliseconds (since the server process
 * started), as estimated by the client through `clock:sync`.
 *
 * Authority: clients send inputs (key presses, the toss, swings with their contact point
 * and stick), never results. The server checks each swing against its own simulation of
 * the ball, recomputes the shot with the shared shot code and a seed the client cannot
 * choose, and makes every line call. See docs/MULTIPLAYER.md.
 */

export const PROTOCOL_VERSION = 2

// ------------------------------------------------------------------ primitives

export type Seat = 0 | 1
export type ShotType = 'topspin' | 'slice' | 'lob' | 'flat'
export type Grade = 'perfect' | 'good' | 'early' | 'late'
export type SwingKind = 'forehand' | 'backhand' | 'serve' | 'none'
export type FormatId = 'quick' | 'set' | 'match'
export type SurfaceId = 'hard' | 'clay' | 'grass'
export type PaceId = 'club' | 'tour'

export interface V3 {
  x: number
  y: number
  z: number
}

export interface BallState {
  p: V3
  v: V3
  /** Angular velocity (rad/s). */
  w: V3
}

// ------------------------------------------------------------------ rooms

export interface RoomSettings {
  format: FormatId
  surface: SurfaceId
  pace: PaceId
}

export type RoomStatus = 'lobby' | 'playing' | 'paused' | 'finished'

export interface SeatInfo {
  name: string
  /** The player's outfit id (the frontend's skins), so both screens dress them the same. */
  kit: string | null
  connected: boolean
  ready: boolean
  /** Last measured round trip (ms), or null before the first measurement. */
  rtt: number | null
}

/** Mirrors the frontend's MatchState (src/game/scoring.ts). */
export interface MatchScore {
  config: { setsToWin: number; gamesPerSet: number }
  sets: [number, number][]
  games: [number, number]
  points: [number, number]
  tiebreak: boolean
  server: Seat
  tiebreakFirstServer: Seat
  winner: Seat | null
}

export interface RoomSnapshot {
  code: string
  /** Quick-match rooms are not joinable by code. */
  quick: boolean
  /** Public rooms show up in the open-games list; private ones are joined by code only. */
  isPublic: boolean
  status: RoomStatus
  settings: RoomSettings
  seats: [SeatInfo | null, SeatInfo | null]
  match: MatchScore | null
  serveNumber: 1 | 2
  /** Id of the current rally (increments on every serve attempt). 0 before the first. */
  rallyId: number
  /** Server clock (ms) when the snapshot was taken. */
  serverT: number
}

/** A public room with one player waiting for an opponent (no database: lives in server memory). */
export interface OpenRoom {
  code: string
  host: string
  settings: RoomSettings
  /** Seconds the host has been waiting. */
  waitingS: number
}

/** Returned when a client takes a seat; keep `token` (e.g. sessionStorage) to resume. */
export interface SeatGrant {
  code: string
  seat: Seat
  token: string
  room: RoomSnapshot
}

// ------------------------------------------------------------------ rallies

export interface PointStart {
  rallyId: number
  server: Seat
  serveNumber: 1 | 2
  /** True when serving from the deuce (right-hand) court. */
  deuceCourt: boolean
  /** Wind for this rally (canonical frame, m/s). */
  wind: { x: number; z: number }
  match: MatchScore
  /** Server clock (ms) at which the serve may start; until then clients play out the dead time. */
  startsAt: number
  /** Seed for this rally's shot scatter (shotRng(seed, hit) in shared/shot.ts). */
  seed: number
}

/** 20-30 Hz snapshot of one athlete, sent volatile (droppable). */
export interface AthleteState {
  rallyId: number
  /** Sender's sim step counter, to drop out-of-order packets. */
  seq: number
  t: number
  x: number
  z: number
  vx: number
  vz: number
  yaw: number
  swing: SwingKind
  swingT: number
  swingShot: ShotType
  tossing: boolean
}

/** The server tossed the ball: it leaves `p` straight up at SERVE.tossSpeed at time `t`. */
export interface TossMsg {
  rallyId: number
  t: number
  shot: ShotType
  p: V3
}

/** A shot key went down. Sent at once so the server can bound the claimed press time. */
export interface PressMsg {
  rallyId: number
  /** The hit this press is for (the next strike number). */
  hit: number
  shot: ShotType
  t: number
}

/**
 * A swing that met the ball: inputs and the contact the client saw, no outcome. The
 * server checks the contact against its own ball and recomputes the shot.
 */
export interface StrikeIntent {
  rallyId: number
  /** 1-based hit number within the rally (1 = the serve). */
  hit: number
  kind: 'serve' | 'shot'
  shot: ShotType
  /** Server clock (ms) at contact, as estimated by the hitter. */
  t: number
  /** Ball position at contact and its velocity just before. */
  p: V3
  vin: V3
  /**
   * Stick at contact, in the hitter's own view (x right, y up = deeper), each in [-1, 1].
   * Serves send the swept aim instead, which may reach +-SERVE.aimMax (past the lines).
   */
  aim: { x: number; y: number }
  /** Groundstrokes: when the shot key was pressed (server clock ms). */
  pressT?: number
  /** Groundstrokes: how long the key was held into the stroke, 0..1 (see POWER_HOLD). */
  power?: number
  /** Sideways distance from body to ball (+ forehand side). */
  lateral: number
  /** Hitter's right-hand direction, x component in the hitter's own view. */
  rightX: number
  hand: 1 | -1
  running: boolean
}

/** The server's version of a strike, sent to both players. */
export interface StrikeResolved {
  rallyId: number
  hit: number
  from: Seat
  kind: 'serve' | 'shot'
  shot: ShotType
  grade: Grade
  /** Server clock (ms) at contact. */
  t: number
  /** Ball state right after contact. */
  ball: BallState
  landing: { x: number; z: number }
  /** Launch speed, m/s. */
  speed: number
}

export type PointReason = 'ace' | 'winner' | 'out' | 'net' | 'double-fault' | 'forfeit'

export type RallyResult =
  | {
      rallyId: number
      kind: 'point'
      winner: Seat
      reason: PointReason
      outcome: 'point' | 'game' | 'set' | 'match'
      match: MatchScore
      hits: number
    }
  | { rallyId: number; kind: 'fault'; reason: 'fault' | 'net'; serveNumber: 2 }
  | { rallyId: number; kind: 'let' }

export interface MatchOver {
  winner: Seat
  reason: 'score' | 'forfeit'
  match: MatchScore | null
}

// ------------------------------------------------------------------ acks

export type ErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'room_full'
  | 'not_in_room'
  | 'already_in_room'
  | 'wrong_state'
  | 'not_your_turn'
  | 'stale'
  | 'invalid'
  | 'version'

export interface Fail {
  ok: false
  error: { code: ErrorCode; message: string }
}

export type Ack<T = object> = ({ ok: true } & T) | Fail

// ------------------------------------------------------------------ events

export interface ClientToServerEvents {
  'room:create': (
    req: {
      name: string
      kit?: string
      settings?: Partial<RoomSettings>
      isPublic?: boolean
      protocol?: number
    },
    ack: (res: Ack<SeatGrant>) => void,
  ) => void
  'room:join': (
    req: { code: string; name: string; kit?: string; protocol?: number },
    ack: (res: Ack<SeatGrant>) => void,
  ) => void
  /** Open public games anyone can join with room:join. */
  'room:list': (req: object, ack: (res: Ack<{ rooms: OpenRoom[] }>) => void) => void
  /** Subscribe to (or stop) live `lobby:rooms` pushes while a browse screen is open. */
  'lobby:watch': (req: { watch: boolean }, ack: (res: Ack<{ rooms: OpenRoom[] }>) => void) => void
  /** Rebinds a seat after a dropped connection or a page reload. */
  'room:resume': (req: { token: string }, ack: (res: Ack<SeatGrant>) => void) => void
  'room:leave': (req: object, ack: (res: Ack) => void) => void
  'match:quick': (
    req: { name: string; kit?: string; protocol?: number },
    ack: (res: Ack<{ status: 'queued' } | ({ status: 'matched' } & SeatGrant)>) => void,
  ) => void
  'match:cancel': (req: object, ack: (res: Ack) => void) => void
  'player:ready': (req: { ready: boolean }, ack: (res: Ack) => void) => void
  /** NTP-style clock sync: offset = serverT + rtt / 2 - clientNow. */
  'clock:sync': (req: { clientT: number }, ack: (res: { clientT: number; serverT: number }) => void) => void
  'game:state': (msg: AthleteState) => void
  'game:toss': (msg: TossMsg) => void
  'game:press': (msg: PressMsg) => void
  /** Rejected swings ack with `invalid` and the ball carries on as the server has it. */
  'game:strike': (msg: StrikeIntent, ack: (res: Ack<{ strike: StrikeResolved }>) => void) => void
}

export interface ServerToClientEvents {
  'room:state': (room: RoomSnapshot) => void
  /** The open-games list changed (sent to sockets that called lobby:watch). */
  'lobby:rooms': (rooms: OpenRoom[]) => void
  /** Quick match paired this socket (it was queued). */
  'match:found': (grant: SeatGrant) => void
  'match:start': (info: { room: RoomSnapshot; firstServer: Seat }) => void
  'point:start': (p: PointStart) => void
  'point:result': (r: RallyResult) => void
  'match:over': (m: MatchOver) => void
  'opponent:state': (msg: AthleteState) => void
  'opponent:toss': (msg: TossMsg) => void
  /** Every accepted strike, both players' (the hitter compares it with its own prediction). */
  'rally:strike': (msg: StrikeResolved) => void
  /** The server moved this player back: it ran faster than the game allows. */
  'you:correct': (pos: { x: number; z: number }) => void
  'opponent:disconnected': (info: { seat: Seat; graceMs: number }) => void
  'opponent:reconnected': (info: { seat: Seat }) => void
  'opponent:left': (info: { seat: Seat }) => void
  /** Latest round trips of both seats, every couple of seconds. */
  'room:rtt': (rtt: [number | null, number | null]) => void
  /** Server-measured RTT probe; ack immediately. */
  'sys:ping': (req: { serverT: number }, ack: () => void) => void
}

// ------------------------------------------------------------------ helpers

/** Canonical <-> local frame for a seat: seat 1 is turned 180 degrees about y. */
export function toCanonical<T extends { x: number; z: number }>(seat: Seat, v: T): T {
  return seat === 0 ? v : { ...v, x: -v.x, z: -v.z }
}
export const fromCanonical = toCanonical

export function ballToCanonical(seat: Seat, b: BallState): BallState {
  return {
    p: toCanonical(seat, b.p),
    v: toCanonical(seat, b.v),
    w: toCanonical(seat, b.w),
  }
}
export const ballFromCanonical = ballToCanonical

/** Yaw also turns by PI for seat 1. */
export function yawToCanonical(seat: Seat, yaw: number): number {
  return seat === 0 ? yaw : yaw + Math.PI
}
export const yawFromCanonical = yawToCanonical

/**
 * Score from the server (indexed by seat) as the local client sees it, where index 0 is
 * always "me" (the frontend's HUMAN). A no-op for seat 0.
 */
export function matchToLocal(seat: Seat, m: MatchScore): MatchScore {
  if (seat === 0) return m
  const swap = (p: [number, number]): [number, number] => [p[1], p[0]]
  const flip = (s: Seat): Seat => (s === 0 ? 1 : 0)
  return {
    ...m,
    sets: m.sets.map(swap),
    games: swap(m.games),
    points: swap(m.points),
    server: flip(m.server),
    tiebreakFirstServer: flip(m.tiebreakFirstServer),
    winner: m.winner === null ? null : flip(m.winner),
  }
}

/** Seat on the wire -> side in the local sim (0 = me / HUMAN, 1 = opponent / AI). */
export function seatToSide(mySeat: Seat, seat: Seat): Seat {
  return seat === mySeat ? 0 : 1
}
