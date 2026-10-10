import { create } from 'zustand'
import { awardPoint, FORMATS, newMatch, type FormatId, type MatchState, type PointOutcome } from './scoring'
import type { Side } from './constants'
import type { Difficulty, Grade, PaceId } from './tuning'
import { setSurface, type SurfaceId } from '../physics/flight'
import { SKINS } from '../scene/athlete/skins'

export type Screen = 'menu' | 'online' | 'playing' | 'paused' | 'over'

export interface Toast {
  id: number
  title: string
  detail?: string
  tone: 'win' | 'lose' | 'neutral'
}

export type FpsCap = '60' | '30'

/** Settings survive a reload; storage can be unavailable (private mode), so it is optional. */
function saved<T extends string>(key: string, allowed: T[], fallback: T): T {
  try {
    const v = localStorage.getItem(`tennis.${key}`)
    return v && (allowed as string[]).includes(v) ? (v as T) : fallback
  } catch {
    return fallback
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(`tennis.${key}`, value)
  } catch {
    // Not persisted; the setting still applies for this session.
  }
}

export type Quality = 'high' | 'medium' | 'low'

/**
 * Guided practice: a long match against the easy CPU with a coach panel. Steps: serve two
 * in, return three in with good timing, then aim one each way.
 */
export interface Practice {
  step: 0 | 1 | 2 | 3
  count: number
  left: boolean
  right: boolean
  /** Settings to restore afterwards (practice does not overwrite the saved ones). */
  restore: { difficulty: Difficulty; format: FormatId }
}
export const PRACTICE_GOALS = [2, 3, 2] as const

interface GameStore {
  screen: Screen
  /** Single player against the AI, or an online match refereed by the server. */
  mode: 'solo' | 'online'
  /** Opponent's name on the scoreboard. */
  opponentName: string
  difficulty: Difficulty
  format: FormatId
  quality: Quality
  /** Frame-rate cap in play: 30 halves the GPU work (quieter fans, longer battery). */
  fps: FpsCap
  pace: PaceId
  surface: SurfaceId
  /** Player's character/outfit id (see scene/athlete/skins.ts). */
  skin: string
  match: MatchState
  serveNumber: 1 | 2
  toast: Toast | null
  timing: { id: number; grade: Grade } | null
  /** The last serve's speed, flashed big on screen. */
  serveFlash: { id: number; kmh: number } | null
  muted: boolean
  stats: { winners: [number, number]; aces: [number, number]; errors: [number, number]; rally: number; longest: number }
  practice: Practice | null
  startPractice(): void
  /** Progress events from the director: a serve in, a rally shot in (with its grade and x). */
  practiceEvent(e: { kind: 'serveIn' } | { kind: 'rallyIn'; grade: Grade; x: number }): void
  setDifficulty(d: Difficulty): void
  setFormat(f: FormatId): void
  setQuality(q: Quality): void
  setFps(f: FpsCap): void
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
  showServeSpeed(kmh: number): void
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

const SKIN_IDS = SKINS.map((s) => s.id)
const initialSurface = saved<SurfaceId>('surface', ['hard', 'clay', 'grass'], 'hard')
setSurface(initialSurface)

function freshStats(): GameStore['stats'] {
  return { winners: [0, 0], aces: [0, 0], errors: [0, 0], rally: 0, longest: 0 }
}

export const useGame = create<GameStore>((set, get) => ({
  screen: 'menu',
  mode: 'solo',
  opponentName: 'R. Okafor',
  difficulty: saved('difficulty', ['easy', 'pro', 'ace'], 'pro'),
  format: saved('format', Object.keys(FORMATS) as FormatId[], 'quick'),
  quality: saved('quality', ['high', 'medium', 'low'], 'medium'),
  fps: saved('fps', ['60', '30'], '60'),
  pace: saved('pace', ['club', 'tour'], 'club'),
  surface: initialSurface,
  skin: saved('skin', SKIN_IDS, 'navy'),
  match: newMatch(FORMATS.quick, 0),
  serveNumber: 1,
  toast: null,
  timing: null,
  serveFlash: null,
  muted: saved('muted', ['1', '0'], '0') === '1',
  stats: freshStats(),
  practice: null,
  startPractice: () => {
    const st = get()
    const restore = st.practice?.restore ?? { difficulty: st.difficulty, format: st.format }
    save('practiced', '1')
    st.start()
    set({
      difficulty: 'easy',
      format: 'match',
      match: newMatch(FORMATS.match, 0),
      practice: { step: 0, count: 0, left: false, right: false, restore },
    })
  },
  practiceEvent: (e) => {
    const p = get().practice
    if (!p || p.step === 3) return
    const next = { ...p }
    if (p.step === 0 && e.kind === 'serveIn') next.count += 1
    if (p.step === 1 && e.kind === 'rallyIn' && (e.grade === 'perfect' || e.grade === 'good')) next.count += 1
    if (p.step === 2 && e.kind === 'rallyIn') {
      if (e.x < -1.6) next.left = true
      if (e.x > 1.6) next.right = true
      next.count = Number(next.left) + Number(next.right)
    }
    if (next.count >= PRACTICE_GOALS[p.step]) {
      next.step = (p.step + 1) as Practice['step']
      next.count = 0
    }
    set({ practice: next })
  },
  setDifficulty: (difficulty) => {
    save('difficulty', difficulty)
    set({ difficulty })
  },
  setFormat: (format) => {
    save('format', format)
    set({ format })
  },
  setQuality: (quality) => {
    save('quality', quality)
    set({ quality })
  },
  setFps: (fps) => {
    save('fps', fps)
    set({ fps })
  },
  setPace: (pace) => {
    save('pace', pace)
    set({ pace })
  },
  setSurface: (surface) => {
    save('surface', surface)
    setSurface(surface)
    set({ surface })
  },
  setSkin: (skin) => {
    save('skin', skin)
    set({ skin })
  },
  toggleMute: () => {
    const muted = !get().muted
    save('muted', muted ? '1' : '0')
    set({ muted })
  },
  start: () => {
    // Leaving practice for a real match brings the player's own settings back.
    const restore = get().practice?.restore
    const format = restore ? restore.format : get().format
    set({
      ...(restore ?? {}),
      practice: null,
      mode: 'solo',
      opponentName: 'R. Okafor',
      screen: 'playing',
      match: newMatch(FORMATS[format], 0),
      serveNumber: 1,
      toast: null,
      stats: freshStats(),
    })
  },
  pause: () => get().screen === 'playing' && set({ screen: 'paused' }),
  resume: () => get().screen === 'paused' && set({ screen: 'playing' }),
  quit: () => {
    const p = get().practice
    set({
      screen: 'menu',
      toast: null,
      mode: 'solo',
      opponentName: 'R. Okafor',
      practice: null,
      ...(p ? p.restore : {}),
    })
  },
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
  showServeSpeed: (kmh) => set({ serveFlash: { id: seq++, kmh } }),
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
  /** Serve aim during the toss: 0 middle of the box, +-1 the lines, beyond is out. */
  serveAim: 0,
  /** Where my server stands on screen (CSS px), so the serve meter can sit beside them. */
  serveAnchor: { x: 0, y: 0, ok: false },
}
