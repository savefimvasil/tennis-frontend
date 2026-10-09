import { other, type Side } from './constants'

export interface MatchConfig {
  /** Sets needed to win the match (1 = one set, 2 = best of three). */
  setsToWin: number
  /** Games needed to win a set (6 normally). A tiebreak is played at N-N. */
  gamesPerSet: number
}

export interface MatchState {
  config: MatchConfig
  /** Final games score of every completed set. */
  sets: [number, number][]
  games: [number, number]
  points: [number, number]
  tiebreak: boolean
  server: Side
  /** Who served the first point of the current tiebreak (they receive first next set). */
  tiebreakFirstServer: Side
  winner: Side | null
}

export type PointOutcome = 'point' | 'game' | 'set' | 'match'

export const FORMATS = {
  quick: { setsToWin: 1, gamesPerSet: 4 },
  set: { setsToWin: 1, gamesPerSet: 6 },
  match: { setsToWin: 2, gamesPerSet: 6 },
} satisfies Record<string, MatchConfig>

export type FormatId = keyof typeof FORMATS

export function newMatch(config: MatchConfig, firstServer: Side = 0): MatchState {
  return {
    config,
    sets: [],
    games: [0, 0],
    points: [0, 0],
    tiebreak: false,
    server: firstServer,
    tiebreakFirstServer: firstServer,
    winner: null,
  }
}

function inc(pair: [number, number], side: Side): [number, number] {
  const next: [number, number] = [pair[0], pair[1]]
  next[side] += 1
  return next
}

export function setsWon(s: MatchState, side: Side): number {
  return s.sets.filter(([a, b]) => (side === 0 ? a > b : b > a)).length
}

/** Returns the new state after `winner` wins a point, plus what that point decided. */
export function awardPoint(s: MatchState, winner: Side): { state: MatchState; outcome: PointOutcome } {
  if (s.winner !== null) return { state: s, outcome: 'match' }
  const loser = other(winner)
  const points = inc(s.points, winner)

  if (s.tiebreak) {
    if (points[winner] >= 7 && points[winner] - points[loser] >= 2) {
      // Tiebreak counts as the deciding game of the set.
      const games = inc(s.games, winner)
      return finishSet({ ...s, games, points: [0, 0], tiebreak: false }, winner, other(s.tiebreakFirstServer))
    }
    const total = points[0] + points[1]
    // First point served by A, then two each, alternating.
    const server: Side = Math.floor((total + 1) / 2) % 2 === 0 ? s.tiebreakFirstServer : other(s.tiebreakFirstServer)
    return { state: { ...s, points, server }, outcome: 'point' }
  }

  if (points[winner] >= 4 && points[winner] - points[loser] >= 2) {
    const games = inc(s.games, winner)
    const nextServer = other(s.server)
    const target = s.config.gamesPerSet
    if (games[winner] >= target && games[winner] - games[loser] >= 2) {
      return finishSet({ ...s, games, points: [0, 0] }, winner, nextServer)
    }
    if (games[0] === target && games[1] === target) {
      return {
        state: { ...s, games, points: [0, 0], server: nextServer, tiebreak: true, tiebreakFirstServer: nextServer },
        outcome: 'game',
      }
    }
    return { state: { ...s, games, points: [0, 0], server: nextServer }, outcome: 'game' }
  }

  return { state: { ...s, points }, outcome: 'point' }
}

function finishSet(s: MatchState, winner: Side, nextServer: Side): { state: MatchState; outcome: PointOutcome } {
  const sets = [...s.sets, s.games]
  const next: MatchState = { ...s, sets, games: [0, 0], points: [0, 0], tiebreak: false, server: nextServer }
  if (setsWon(next, winner) >= s.config.setsToWin) {
    return { state: { ...next, winner }, outcome: 'match' }
  }
  return { state: next, outcome: 'set' }
}

const CALLS = ['0', '15', '30', '40']

/** Scoreboard label for one side's points in the current game. */
export function pointLabel(s: MatchState, side: Side): string {
  const mine = s.points[side]
  if (s.tiebreak) return String(mine)
  const theirs = s.points[other(side)]
  if (mine >= 3 && theirs >= 3) {
    if (mine === theirs) return '40'
    return mine > theirs ? 'AD' : '40'
  }
  return CALLS[Math.min(mine, 3)]
}

/** Spoken call for the umpire banner, e.g. "30-15", "Deuce", "Advantage". */
export function scoreCall(s: MatchState): string {
  const [a, b] = s.points
  if (s.tiebreak) return `${a}-${b}`
  if (a + b === 0) return ''
  if (a >= 3 && b >= 3) {
    if (a === b) return 'Deuce'
    return 'Advantage'
  }
  const srv = s.server
  const first = CALLS[s.points[srv]]
  const second = CALLS[s.points[other(srv)]]
  return first === second ? `${first} all` : `${first}-${second}`
}

/** True when the next point is played from the deuce (right-hand) court. */
export function isDeuceCourt(s: MatchState): boolean {
  return (s.points[0] + s.points[1]) % 2 === 0
}

/** Break point / set point / match point for whoever could win on the next point. */
export function pressureLabel(s: MatchState): string | null {
  if (s.winner !== null) return null
  for (const side of [0, 1] as Side[]) {
    const won = awardPoint(s, side).outcome
    if (won === 'match') return 'Match point'
    if (won === 'set') return 'Set point'
    if (won === 'game' && side !== s.server && !s.tiebreak) return 'Break point'
  }
  return null
}
