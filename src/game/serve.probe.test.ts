/// <reference types="node" />
import { writeFileSync } from 'node:fs'
import { beforeAll, it } from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import type { RapierRigidBody } from '@react-three/rapier'
import { HUMAN, PHYSICS } from './constants'
import { onFenceTouch, onNetTouch, resetForServe, stepGame } from './director'
import { sim } from './sim'
import { useGame } from './store'
import { botHuman, buildWorld } from './testWorld'

beforeAll(async () => {
  await RAPIER.init()
})

// Balance probe (slow, opt-in): PROBE=1 npx vitest run src/game/serve.probe.test.ts
// Plays a few hundred points per AI level with the scripted player and writes how often
// each side wins its service points to /tmp/serve-probe.txt.
it.skipIf(!process.env.PROBE)(
  'serve outcomes per level',
  () => {
    const out: string[] = []
    for (const level of ['easy', 'pro', 'ace'] as const) {
      const { world, ball, netHandles, fenceHandles } = buildWorld()
      sim.ball = ball as unknown as RapierRigidBody
      const g = useGame.getState()
      g.setFormat('match')
      g.setDifficulty(level)
      g.start()
      resetForServe()
      const q = new RAPIER.EventQueue(true)
      const bot = { tossAt: -1, pressedFor: 0 }
      let lastToast = 0,
        hitsMax = 0
      const human = { pts: 0, won: 0, returned: 0, aces: 0 }
      const ai = { pts: 0, won: 0, returned: 0, aces: 0 }
      let serverAtStart = sim.server
      for (let step = 0; step < 120 * 60 * 60 && human.pts + ai.pts < 400; step++) {
        if (useGame.getState().match.winner !== null) {
          g.start()
          resetForServe()
        }
        if (sim.lastHitter === null) serverAtStart = sim.server
        botHuman(bot)
        stepGame(PHYSICS.timeStep)
        world.step(q)
        q.drainCollisionEvents((h1, h2, s) => {
          if (!s) return
          if (netHandles.has(h1) || netHandles.has(h2)) onNetTouch()
          if (fenceHandles.has(h1) || fenceHandles.has(h2)) onFenceTouch()
        })
        hitsMax = Math.max(hitsMax, sim.hits)
        const t = useGame.getState().toast
        if (t && t.id !== lastToast) {
          lastToast = t.id
          if (t.title !== 'Fault' && t.title !== 'Net' && t.title !== 'Let') {
            const side = serverAtStart === HUMAN ? human : ai
            side.pts++
            if (t.tone === (serverAtStart === HUMAN ? 'win' : 'lose')) side.won++
            if (hitsMax >= 2) side.returned++
            if (t.title === 'Ace') side.aces++
          }
          hitsMax = 0
        }
      }
      const f = (x: { pts: number; won: number; returned: number; aces: number }) =>
        `serve pts ${x.pts} won ${((x.won / x.pts) * 100).toFixed(0)}% returned ${((x.returned / x.pts) * 100).toFixed(0)}% aces ${x.aces}`
      out.push(`${level}: HUMAN ${f(human)} | AI ${f(ai)}`)
    }
    writeFileSync('/tmp/serve-probe.txt', out.join('\n'))
  },
  900000,
)
