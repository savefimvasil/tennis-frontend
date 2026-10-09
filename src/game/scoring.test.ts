import { describe, expect, it } from 'vitest'
import {
  awardPoint,
  FORMATS,
  isDeuceCourt,
  newMatch,
  pointLabel,
  pressureLabel,
  scoreCall,
  type MatchState,
} from './scoring'
import type { Side } from './constants'

function play(s: MatchState, seq: string): MatchState {
  for (const ch of seq) s = awardPoint(s, (ch === 'a' ? 0 : 1) as Side).state
  return s
}

describe('scoring', () => {
  it('counts a simple game and switches server', () => {
    let s = newMatch(FORMATS.set, 0)
    s = play(s, 'aa')
    expect(pointLabel(s, 0)).toBe('30')
    expect(scoreCall(s)).toBe('30-0')
    s = play(s, 'aa')
    expect(s.games).toEqual([1, 0])
    expect(s.points).toEqual([0, 0])
    expect(s.server).toBe(1)
  })

  it('handles deuce and advantage', () => {
    let s = play(newMatch(FORMATS.set), 'aaabbb')
    expect(scoreCall(s)).toBe('Deuce')
    s = play(s, 'a')
    expect(pointLabel(s, 0)).toBe('AD')
    expect(pointLabel(s, 1)).toBe('40')
    s = play(s, 'b')
    expect(scoreCall(s)).toBe('Deuce')
    s = play(s, 'aa')
    expect(s.games).toEqual([1, 0])
  })

  it('alternates deuce and ad court', () => {
    const s = newMatch(FORMATS.set)
    expect(isDeuceCourt(s)).toBe(true)
    expect(isDeuceCourt(play(s, 'a'))).toBe(false)
    expect(isDeuceCourt(play(s, 'ab'))).toBe(true)
  })

  it('wins a set 6-4 and needs two clear games', () => {
    let s = newMatch(FORMATS.match)
    for (let i = 0; i < 5; i++) s = play(s, 'aaaabbbb')
    expect(s.games).toEqual([5, 5])
    s = play(s, 'aaaa')
    expect(s.games).toEqual([6, 5])
    expect(s.sets).toEqual([])
    s = play(s, 'aaaa')
    expect(s.sets).toEqual([[7, 5]])
    expect(s.games).toEqual([0, 0])
  })

  it('plays a tiebreak at 6-6 with correct serve rotation', () => {
    let s = newMatch(FORMATS.match, 0)
    for (let i = 0; i < 6; i++) s = play(s, 'aaaabbbb')
    expect(s.tiebreak).toBe(true)
    const first = s.tiebreakFirstServer
    expect(s.server).toBe(first)
    s = play(s, 'a')
    expect(s.server).not.toBe(first)
    s = play(s, 'a')
    expect(s.server).not.toBe(first)
    s = play(s, 'a')
    expect(s.server).toBe(first)
    s = play(s, 'bbbbbb') // 3-6
    s = play(s, 'aaa') // 6-6
    expect(s.tiebreak).toBe(true)
    s = play(s, 'aa')
    expect(s.tiebreak).toBe(false)
    expect(s.sets).toEqual([[7, 6]])
    expect(s.server).toBe(first === 0 ? 1 : 0)
  })

  it('finishes the match', () => {
    let s = newMatch(FORMATS.quick)
    for (let g = 0; g < 4; g++) s = play(s, 'aaaa')
    expect(s.winner).toBe(0)
    expect(s.sets).toEqual([[4, 0]])
  })

  it('labels pressure points', () => {
    let s = newMatch(FORMATS.quick, 0)
    s = play(s, 'bbb')
    expect(pressureLabel(s)).toBe('Break point')
    s = newMatch(FORMATS.quick, 0)
    for (let g = 0; g < 3; g++) s = play(s, 'aaaa')
    s = play(s, 'bbbb'.replace(/b/g, 'a').slice(0, 3))
    expect(pressureLabel(s)).toBe('Match point')
  })
})
