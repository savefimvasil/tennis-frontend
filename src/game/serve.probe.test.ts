/// <reference types="node" />
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { HUMAN, PHYSICS } from './constants'
import { resetForServe, stepGame } from './director'
import { sim } from './sim'
import { useGame } from './store'
import { botHuman, buildWorld } from './testWorld'

// Balance probe (slow, opt-in): PROBE=1 npx vitest run src/game/serve.probe.test.ts
// Plays a few hundred points per AI level with the scripted player and writes how often
// each side wins its service points to /tmp/serve-probe.txt.
it.skipIf(!process.env.PROBE)(
  'serve outcomes per level',
  () => {
    const out: string[] = []
    for (const level of ['beginner', 'easy', 'pro', 'champion'] as const) {
      const { ball } = buildWorld()
      sim.ball = ball
      const g = useGame.getState()
      g.setFormat('match')
      g.setDifficulty(level)
      g.start()
      resetForServe()
      const exploit = !!process.env.EXPLOIT
      const bot = {
        tossAt: -1,
        pressedFor: 0,
        // The exploit: stick hard left or right, release at the top of the toss.
        serveAim: exploit ? () => (Math.random() < 0.5 ? -1 : 1) * Number(process.env.EXPLOIT) : undefined,
        releaseAfter: exploit ? 0.42 : undefined,
      }
      let lastToast = 0,
        hitsMax = 0
      const human = { pts: 0, won: 0, returned: 0, aces: 0, faults: 0, doubles: 0, firstIn: 0, firsts: 0 }
      const ai = { pts: 0, won: 0, returned: 0, aces: 0, faults: 0, doubles: 0, firstIn: 0, firsts: 0 }
      let serverAtStart = sim.server
      for (let step = 0; step < 120 * 60 * 60 && human.pts + ai.pts < 400; step++) {
        if (useGame.getState().match.winner !== null) {
          g.start()
          resetForServe()
        }
        if (sim.lastHitter === null) serverAtStart = sim.server
        botHuman(bot)
        stepGame(PHYSICS.timeStep)
        hitsMax = Math.max(hitsMax, sim.hits)
        const t = useGame.getState().toast
        if (t && t.id !== lastToast) {
          lastToast = t.id
          const sv = serverAtStart === HUMAN ? human : ai
          if (t.title === 'Fault' || t.title === 'Net') sv.faults++
          if (t.title === 'Double fault') sv.doubles++
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
      const pc = (n: number, d: number) => `${((n / Math.max(1, d)) * 100).toFixed(0)}%`
      const f = (x: typeof human) =>
        `serve pts ${x.pts} won ${pc(x.won, x.pts)} returned ${pc(x.returned, x.pts)} aces ${pc(x.aces, x.pts)} ` +
        `faults ${x.faults} (${pc(x.faults, x.pts + x.faults)} of serves) doubles ${pc(x.doubles, x.pts)}`
      out.push(`${level}: HUMAN ${f(human)} | AI ${f(ai)}`)
    }
    writeFileSync('/tmp/serve-probe.txt', out.join('\n'))
  },
  900000,
)
