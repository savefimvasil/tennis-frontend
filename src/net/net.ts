import { io, type Socket } from 'socket.io-client'
import { create } from 'zustand'
import {
  matchToLocal,
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type OpenRoom,
  type PointStart,
  type RallyResult,
  type RoomSettings,
  type RoomSnapshot,
  type Seat,
  type SeatGrant,
  type ServerToClientEvents,
} from './protocol'
import { useGame } from '../game/store'
import {
  onlineCorrect,
  onlinePointStart,
  onlineRallyOver,
  onlineRemoteState,
  onlineStrike,
  onlineStrikeRefused,
  onlineToss,
  isOnline,
  setOnline,
} from '../game/director'
import { sim } from '../game/sim'
import type { Side } from '../game/constants'

// Connection to the multiplayer server. The game never needs it: the Online button only
// appears once a server answers, and single player works with no network at all.

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export type NetStatus = 'off' | 'probing' | 'up' | 'down'

interface NetStore {
  status: NetStatus
  url: string | null
  name: string
  rtt: number | null
  room: RoomSnapshot | null
  seat: Seat | null
  openRooms: OpenRoom[]
  queued: boolean
  error: string | null
  setName(name: string): void
}

const NAME_KEY = 'tennis.name'
const TOKEN_KEY = 'tennis.seat'

function storedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export const useNet = create<NetStore>((set) => ({
  status: 'off',
  url: null,
  name: storedName(),
  rtt: null,
  room: null,
  seat: null,
  openRooms: [],
  queued: false,
  error: null,
  setName: (name) => {
    try {
      localStorage.setItem(NAME_KEY, name)
    } catch {
      // Private mode: the name just is not remembered.
    }
    set({ name })
  },
}))

/**
 * Where the server is: `?server=` in the page URL, else VITE_SERVER_URL at build time,
 * else port 3000 on the same host in development, else the page's own origin (a deploy
 * that serves the game and the server behind one domain).
 */
export function serverUrl(): string | null {
  const param = new URLSearchParams(location.search).get('server')
  if (param) return param.replace(/\/$/, '')
  const env = import.meta.env.VITE_SERVER_URL as string | undefined
  if (env === 'none') return null
  if (env) return env.replace(/\/$/, '')
  if (import.meta.env.DEV) return `${location.protocol}//${location.hostname}:3000`
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return null
  return location.origin
}

/** Counters for tests and debugging: my swings sent and refused by the server. */
export const netStats = { strikes: 0, refused: 0, refusals: [] as string[] }

let socket: GameSocket | null = null
/** Server clock minus performance.now(), ms. */
let offset = 0
let bestRtt = Infinity

export function serverNow() {
  return performance.now() + offset
}

async function probe(url: string): Promise<boolean> {
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 4000)
    const res = await fetch(`${url}/health`, { signal: ctl.signal })
    clearTimeout(timer)
    if (!res.ok) return false
    const body = (await res.json()) as { status?: string; protocol?: number }
    return body.status === 'ok' && body.protocol === PROTOCOL_VERSION
  } catch {
    return false
  }
}

/** Looks for a server in the background; retries every 30 s while none answers. */
export function startNet() {
  const url = serverUrl()
  if (!url || socket) return
  useNet.setState({ status: 'probing', url })
  const attempt = async () => {
    if (await probe(url)) connect(url)
    else {
      useNet.setState({ status: 'down' })
      setTimeout(attempt, 30_000)
    }
  }
  void attempt()
}

async function syncClock() {
  if (!socket?.connected) return
  // Several NTP-style samples; keep the one with the shortest round trip.
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now()
    try {
      const res = await socket.timeout(2000).emitWithAck('clock:sync', { clientT: t0 })
      const t1 = performance.now()
      const rtt = t1 - t0
      if (rtt <= bestRtt * 1.5 || i === 0) {
        if (rtt < bestRtt) bestRtt = rtt
        offset = res.serverT + rtt / 2 - t1
        useNet.setState({ rtt: Math.round(rtt) })
      }
    } catch {
      return
    }
  }
}

function connect(url: string) {
  const s: GameSocket = io(url, {
    transports: ['websocket'],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  })
  socket = s
  s.on('connect', () => {
    useNet.setState({ status: 'up', error: null })
    bestRtt = Infinity
    void syncClock()
    void resumeSeat()
  })
  s.on('disconnect', () => useNet.setState({ status: 'down', queued: false }))
  s.on('sys:ping', (_req, ack) => ack())
  s.on('room:state', (room) => useNet.setState({ room }))
  s.on('lobby:rooms', (openRooms) => useNet.setState({ openRooms }))
  s.on('match:found', (grant) => takeSeat(grant))
  s.on('match:start', ({ room }) => {
    lastStart = null
    beginMatch(room)
  })
  s.on('point:start', (ps) => {
    // Kept until the match is set up: after a reconnect the server restarts the point
    // before the seat comes back.
    lastStart = ps
    applyStart()
  })
  s.on('point:result', (r) => pointResult(r))
  s.on('match:over', (m) => {
    const seat = useNet.getState().seat
    if (seat === null) return
    const local = m.match ? matchToLocal(seat, m.match) : null
    const winner: Side = m.winner === seat ? 0 : 1
    forgetSeat()
    useGame
      .getState()
      .endOnline(local, winner, m.reason === 'forfeit' ? (winner === 0 ? 'Opponent left' : 'Forfeit') : undefined)
  })
  s.on('opponent:state', (st) => onlineRemoteState(st))
  s.on('opponent:toss', (msg) => onlineToss(msg))
  s.on('rally:strike', (msg) => onlineStrike(msg))
  s.on('you:correct', (pos) => onlineCorrect(pos))
  s.on('opponent:disconnected', ({ graceMs }) =>
    useGame.getState().showToast('Opponent lost connection', 'neutral', `Waiting ${Math.round(graceMs / 1000)} s`),
  )
  s.on('opponent:reconnected', () => useGame.getState().showToast('Opponent is back', 'neutral', 'Replaying the point'))
  s.on('opponent:left', () => useNet.setState({ error: 'Your opponent left the room' }))
  s.on('room:rtt', (rtts) => {
    const seat = useNet.getState().seat
    if (seat !== null && rtts[seat] !== null) useNet.setState({ rtt: rtts[seat] })
  })
  // Keep the clock honest over long sessions.
  setInterval(() => void syncClock(), 15_000)
}

function link() {
  const seat = useNet.getState().seat as Side
  setOnline({
    seat,
    now: serverNow,
    send: {
      state: (msg) => socket?.volatile.emit('game:state', msg),
      toss: (msg) => socket?.emit('game:toss', msg),
      press: (msg) => socket?.emit('game:press', msg),
      strike: (msg) => {
        netStats.strikes++
        socket
          ?.timeout(3000)
          .emitWithAck('game:strike', msg)
          .then((res) => {
            if (res.ok) return
            netStats.refused++
            netStats.refusals.push(res.error.message)
            onlineStrikeRefused(msg.hit)
          })
          .catch(() => onlineStrikeRefused(msg.hit))
      },
    },
  })
}

/** The latest point:start, applied once this client is in the match. */
let lastStart: PointStart | null = null

function applyStart() {
  const ps = lastStart
  const seat = useNet.getState().seat
  if (!ps || seat === null || useGame.getState().mode !== 'online' || !isOnline()) return
  useGame.setState({ match: matchToLocal(seat, ps.match), serveNumber: ps.serveNumber })
  onlinePointStart(ps)
}

function beginMatch(room: RoomSnapshot) {
  const { seat } = useNet.getState()
  if (seat === null || !room.match) return
  const opp = room.seats[seat === 0 ? 1 : 0]
  link()
  useGame.getState().startOnline({
    format: room.settings.format,
    surface: room.settings.surface,
    pace: room.settings.pace,
    opponent: opp?.name ?? 'Opponent',
    match: matchToLocal(seat, room.match),
  })
  useNet.setState({ room, queued: false })
  applyStart()
}

const REASON: Record<string, { title: string; kind: 'winner' | 'ace' | 'error' | 'double' | null }> = {
  ace: { title: 'Ace', kind: 'ace' },
  winner: { title: 'Winner', kind: 'winner' },
  out: { title: 'Out', kind: 'error' },
  net: { title: 'Net', kind: 'error' },
  'double-fault': { title: 'Double fault', kind: 'double' },
  forfeit: { title: 'Forfeit', kind: null },
}

function pointResult(r: RallyResult) {
  const seat = useNet.getState().seat
  const g = useGame.getState()
  if (seat === null || g.mode !== 'online') return
  onlineRallyOver()
  if (r.kind === 'fault') {
    g.setServeNumber(2)
    g.showToast(r.reason === 'net' ? 'Net' : 'Fault', 'neutral', 'Second serve')
    return
  }
  if (r.kind === 'let') {
    g.showToast('Let', 'neutral', 'Replay the serve')
    return
  }
  const winner: Side = r.winner === seat ? 0 : 1
  sim.athletes[winner].celebrate = 1.4
  const why = REASON[r.reason] ?? { title: 'Point', kind: null }
  g.onlinePoint(matchToLocal(seat, r.match), winner, why.title, why.kind, r.outcome)
}

// ---------------------------------------------------------------- lobby actions

function saveSeat(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Without storage a reload just cannot resume the seat.
  }
}

function forgetSeat() {
  lastStart = null
  saveSeat(null)
  useNet.setState({ seat: null, room: null })
  setOnline(null)
}

function takeSeat(grant: SeatGrant) {
  saveSeat(grant.token)
  useNet.setState({ seat: grant.seat, room: grant.room, queued: false, error: null })
  if (grant.room.status === 'playing' || grant.room.status === 'paused') beginMatch(grant.room)
}

/** After a dropped connection or a reload: take the same seat back if the room still exists. */
async function resumeSeat() {
  let token: string | null = null
  try {
    token = sessionStorage.getItem(TOKEN_KEY)
  } catch {
    token = null
  }
  if (!token || !socket) return
  const res = await socket
    .timeout(3000)
    .emitWithAck('room:resume', { token })
    .catch(() => null)
  if (res?.ok) takeSeat(res)
  else saveSeat(null)
}

function fail(res: { ok: false; error: { message: string } } | null) {
  useNet.setState({ error: res?.error.message ?? 'The server did not answer' })
}

function playerName() {
  return useNet.getState().name.trim() || 'Player'
}

export async function createRoom(isPublic: boolean) {
  if (!socket) return
  const g = useGame.getState()
  const settings: RoomSettings = { format: g.format, surface: g.surface, pace: g.pace }
  const res = await socket
    .timeout(3000)
    .emitWithAck('room:create', {
      name: playerName(),
      kit: useGame.getState().skin,
      settings,
      isPublic,
      protocol: PROTOCOL_VERSION,
    })
    .catch(() => null)
  if (res?.ok) takeSeat(res)
  else fail(res)
}

export async function joinRoom(code: string) {
  if (!socket) return
  const res = await socket
    .timeout(3000)
    .emitWithAck('room:join', { code, name: playerName(), kit: useGame.getState().skin, protocol: PROTOCOL_VERSION })
    .catch(() => null)
  if (res?.ok) takeSeat(res)
  else fail(res)
}

export async function quickMatch() {
  if (!socket) return
  const res = await socket
    .timeout(3000)
    .emitWithAck('match:quick', { name: playerName(), kit: useGame.getState().skin, protocol: PROTOCOL_VERSION })
    .catch(() => null)
  if (!res?.ok) return fail(res)
  if (res.status === 'queued') useNet.setState({ queued: true, error: null })
  else takeSeat(res)
}

export async function cancelQuick() {
  await socket
    ?.timeout(3000)
    .emitWithAck('match:cancel', {})
    .catch(() => null)
  useNet.setState({ queued: false })
}

export async function setReady(ready: boolean) {
  const res = await socket
    ?.timeout(3000)
    .emitWithAck('player:ready', { ready })
    .catch(() => null)
  if (res && !res.ok) fail(res)
}

/** Leaves the room; during a match this forfeits it. */
export async function leaveRoom() {
  await socket
    ?.timeout(3000)
    .emitWithAck('room:leave', {})
    .catch(() => null)
  forgetSeat()
}

export async function watchLobby(watch: boolean) {
  const res = await socket
    ?.timeout(3000)
    .emitWithAck('lobby:watch', { watch })
    .catch(() => null)
  if (res?.ok) useNet.setState({ openRooms: res.rooms })
}
