import { describe, expect, it } from 'vitest'
import { PHYSICS } from './constants'
import { botHuman, buildWorld } from './testWorld'
import { resetForServe, stepGame } from './director'
import { sim } from './sim'
import { useGame } from './store'

// Plays whole matches headlessly: the real ball model, the real director and AI,
// and a simple scripted bot standing in for the human player.

describe('full match simulation', () => {
  it.each(['easy', 'pro', 'ace'] as const)(
    'plays a quick match against %s to completion',
    (difficulty) => {
      const { ball } = buildWorld()
      sim.ball = ball
      const g = useGame.getState()
      g.setFormat('quick')
      g.setDifficulty(difficulty)
      g.start()
      resetForServe()
      const endings = new Map<string, number>()
      let lastToast = 0
      let longestPhase = 0
      let phaseSince = sim.time
      let lastPhase = sim.phase
      let maxRally = 0
      let totalHits = 0
      let points = 0
      const bot: { tossAt: number; pressedFor: number; pressAt?: number; aim?: number; aimUntil?: number } = {
        tossAt: -1,
        pressedFor: 0,
      }
      const dt = PHYSICS.timeStep
      let steps = 0

      while (useGame.getState().match.winner === null && steps < 120 * 60 * 150) {
        botHuman(bot)
        stepGame(dt)
        steps++
        const st = useGame.getState()
        if (st.toast && st.toast.id !== lastToast) {
          lastToast = st.toast.id
          endings.set(st.toast.title, (endings.get(st.toast.title) ?? 0) + 1)
          totalHits += sim.hits
          if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.DIAG) {
            const bp = ball.translation()
            const h = sim.athletes[0]
            console.log(
              'END',
              st.toast.title,
              'lastHitter',
              sim.lastHitter,
              'ball',
              bp.x.toFixed(2),
              bp.y.toFixed(2),
              bp.z.toFixed(2),
              'hits',
              sim.hits,
              'human',
              h.x.toFixed(2),
              h.z.toFixed(2),
              'queued',
              !!h.queued,
            )
          }
          points++
        }
        maxRally = Math.max(maxRally, sim.hits)
        if (sim.phase !== lastPhase) {
          lastPhase = sim.phase
          phaseSince = sim.time
        }
        if (sim.phase !== 'rally') longestPhase = Math.max(longestPhase, sim.time - phaseSince)
      }

      const m = useGame.getState().match
      const stats = useGame.getState().stats
      console.log(difficulty, 'sets', JSON.stringify(m.sets), 'winner', m.winner, 'minutes', (sim.time / 60).toFixed(1))
      console.log('endings', JSON.stringify(Object.fromEntries(endings)))
      console.log(
        'stats',
        JSON.stringify(stats),
        'avg rally',
        (totalHits / Math.max(1, points)).toFixed(1),
        'max rally',
        maxRally,
        'longest phase s',
        longestPhase.toFixed(1),
      )
      expect(m.winner).not.toBeNull()
      expect(longestPhase).toBeLessThan(20)
      expect(maxRally).toBeGreaterThan(2)
    },
    120000,
  )
})
