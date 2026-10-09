import { create } from 'zustand'
import { awardPoint, FORMATS, newMatch, type FormatId, type MatchState, type PointOutcome } from './scoring'
import type { Side } from './constants'
import type { Difficulty, Grade, PaceId } from './tuning'
import { setSurface, type SurfaceId } from '../physics/flight'

export type Screen = 'menu' | 'online' | 'playing' | 'paused' | 'over'

export interface Toast {
  id: number
  title: string
  detail?: string
  tone: 'win' | 'lose' | 'neutral'
}

export type Quality = 'high' | 'medium' | 'low'

interface GameStore {
  screen: Screen
  /** Single player against the AI, or an online match refereed by the server. */
  mode: 'solo' | 'online'
  /** Opponent's name on the scoreboard. */
  opponentName: string
  difficulty: Difficulty
  format: FormatId
  quality: Quality
  pace: PaceId
  surface: SurfaceId
  /** Player's character/outfit id (see scene/athlete/skins.ts). */
  skin: string
  match: MatchState
  serveNumber: 1 | 2
  toast: Toast | null
  timing: { id: number; grade: Grade } | null
  muted: boolean
  stats: { winners: [number, number]; aces: [number, number]; errors: [number, number]; rally: number; longest: number }
  setDifficulty(d: Difficulty): void
  setFormat(f: FormatId): void
  setQuality(q: Quality): void
  setPace(p: PaceId): void
  setSurface(s: SurfaceId): void
  setSkin(s: string): void
  toggleMute(): void
  start(): void
  pause(): void
  resume(): void
  quit(): void
  /** Opens the online lobby. */
  openOnline(): void
  point(winner: Side, title: string, detail?: string, kind?: 'winner' | 'ace' | 'error' | 'double'): PointOutcome
  setServeNumber(n: 1 | 2): void
  showToast(title: string, tone: Toast['tone'], detail?: string): void
  showTiming(grade: Grade): void
  setRally(n: number): void
  /** Starts an online match with the room's settings; the score then comes from the server. */
  startOnline(opts: { format: FormatId; surface: SurfaceId; pace: PaceId; opponent: string; match: MatchState }): void
  /** Applies the server's call on a point. `kind` feeds the match stats. */
  onlinePoint(
    match: MatchState,
    winner: Side,
    title: string,
    kind: 'winner' | 'ace' | 'error' | 'double' | null,
    outcome: PointOutcome,
  ): void
  /** Ends an online match (or abandons it) and shows the result screen. */
  endOnline(match: MatchState | null, winner: Side, note?: string): void
}

let seq = 1

function freshStats(): GameStore['stats'] {
  return { winners: [0, 0], aces: [0, 0], errors: [0, 0], rally: 0, longest: 0 }
}

export const useGame = create<GameStore>((set, get) => ({
  screen: 'menu',
  mode: 'solo',
  opponentName: 'R. Okafor',
  difficulty: 'pro',
  format: 'quick',
  quality: 'medium',
  pace: 'club',
  surface: 'hard',
  skin: 'navy',
  match: newMatch(FORMATS.quick, 0),
  serveNumber: 1,
  toast: null,
  timing: null,
  muted: false,
  stats: freshStats(),
  setDifficulty: (difficulty) => set({ difficulty }),
  setFormat: (format) => set({ format }),
  setQuality: (quality) => set({ quality }),
  setPace: (pace) => set({ pace }),
  setSurface: (surface) => {
    setSurface(surface)
    set({ surface })
  },
  setSkin: (skin) => set({ skin }),
  toggleMute: () => set({ muted: !get().muted }),
  start: () =>
    set({
      mode: 'solo',
      opponentName: 'R. Okafor',
      screen: 'playing',
      match: newMatch(FORMATS[get().format], 0),
      serveNumber: 1,
      toast: null,
      stats: freshStats(),
    }),
  pause: () => get().screen === 'playing' && set({ screen: 'paused' }),
  resume: () => get().screen === 'paused' && set({ screen: 'playing' }),
  quit: () => set({ screen: 'menu', toast: null, mode: 'solo', opponentName: 'R. Okafor' }),
  openOnline: () => set({ screen: 'online', mode: 'solo', toast: null }),
  point: (winner, title, detail, kind) => {
    const { state, outcome } = awardPoint(get().match, winner)
    const stats = { ...get().stats }
    const bump = (key: 'winners' | 'aces' | 'errors', side: Side) => {
      const pair: [number, number] = [...stats[key]] as [number, number]
      pair[side] += 1
      stats[key] = pair
    }
    if (kind === 'winner') bump('winners', winner)
    if (kind === 'ace') bump('aces', winner)
    if (kind === 'error' || kind === 'double') bump('errors', winner === 0 ? 1 : 0)
    stats.longest = Math.max(stats.longest, stats.rally)
    const tone: Toast['tone'] = winner === 0 ? 'win' : 'lose'
    let fullDetail = detail
    if (outcome === 'game') fullDetail = winner === 0 ? 'Game, you' : 'Game, opponent'
    if (outcome === 'set') fullDetail = winner === 0 ? 'Set, you' : 'Set, opponent'
    set({ match: state, serveNumber: 1, stats, toast: { id: seq++, title, detail: fullDetail, tone } })
    if (outcome === 'match') setTimeout(() => set({ screen: 'over' }), 2600)
    return outcome
  },
  setServeNumber: (serveNumber) => set({ serveNumber }),
  showToast: (title, tone, detail) => set({ toast: { id: seq++, title, tone, detail } }),
  showTiming: (grade) => set({ timing: { id: seq++, grade } }),
  setRally: (rally) => set({ stats: { ...get().stats, rally } }),
  startOnline: ({ format, surface, pace, opponent, match }) => {
    setSurface(surface)
    set({
      mode: 'online',
      opponentName: opponent,
      format,
      surface,
      pace,
      screen: 'playing',
      match,
      serveNumber: 1,
      toast: null,
      stats: freshStats(),
    })
  },
  onlinePoint: (match, winner, title, kind, outcome) => {
    const stats = { ...get().stats }
    const bump = (key: 'winners' | 'aces' | 'errors', side: Side) => {
      const pair: [number, number] = [...stats[key]] as [number, number]
      pair[side] += 1
      stats[key] = pair
    }
    if (kind === 'winner') bump('winners', winner)
    if (kind === 'ace') bump('aces', winner)
    if (kind === 'error' || kind === 'double') bump('errors', winner === 0 ? 1 : 0)
    stats.longest = Math.max(stats.longest, stats.rally)
    let detail: string | undefined
    const opp = get().opponentName
    if (outcome === 'game') detail = winner === 0 ? 'Game, you' : `Game, ${opp}`
    if (outcome === 'set') detail = winner === 0 ? 'Set, you' : `Set, ${opp}`
    set({
      match,
      serveNumber: 1,
      stats,
      toast: { id: seq++, title, detail, tone: winner === 0 ? 'win' : 'lose' },
    })
  },
  endOnline: (match, winner, note) => {
    const m = match ?? get().match
    set({ match: { ...m, winner }, toast: note ? { id: seq++, title: note, tone: 'neutral' } : get().toast })
    setTimeout(() => get().mode === 'online' && set({ screen: 'over' }), note ? 1500 : 2600)
  },
}))

/** Transient HUD values written every frame without React renders. */
export const hudLive = {
  tossMeter: null as number | null,
  ballSpeedKmh: 0,
  lastShotKmh: 0,
  wind: { x: 0, z: 0 },
  serveStage: null as 'aim' | 'toss' | null,
  tossFalling: false,
}
