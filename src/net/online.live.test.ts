/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

// Live online match against a running server, one player per process:
//   LIVE_SERVER=http://localhost:3000 ROLE=host  CODE_FILE=/tmp/code npx vitest run src/net/online.live.test.ts &
//   LIVE_SERVER=http://localhost:3000 ROLE=guest CODE_FILE=/tmp/code npx vitest run src/net/online.live.test.ts
// Each process runs the real director, net layer and Rapier physics in real time with a
// scripted player, so the server's validation sees honest clients with real latency.

const SERVER = process.env.LIVE_SERVER
const ROLE = process.env.ROLE ?? 'host'
const CODE_FILE = process.env.CODE_FILE ?? '/tmp/tennis-room-code'
const SECONDS = Number(process.env.SECONDS ?? 90)

describe.skipIf(!SERVER)('live online match', () => {
  it(`plays as ${ROLE}`, async () => {
    Object.assign(globalThis, { location: new URL(`http://localhost/?server=${SERVER}`) })
    const RAPIER = (await import('@dimforge/rapier3d-compat')).default
    await RAPIER.init()
    const { buildWorld } = await import('../game/testWorld')
    const { sim } = await import('../game/sim')
    const { useGame } = await import('../game/store')
    const { stepGame, onNetTouch, onFenceTouch } = await import('../game/director')
    const { virtualInput } = await import('../input/input')
    const { PHYSICS } = await import('../game/constants')
    const net = await import('./net')
    type Body = import('@react-three/rapier').RapierRigidBody

    const { world, ball, netHandles, fenceHandles } = buildWorld()
    sim.ball = ball as unknown as Body
    const queue = new RAPIER.EventQueue(true)

    net.useNet.getState().setName(ROLE === 'host' ? 'Hosty' : 'Guesty')
    net.startNet()
    const until = async (cond: () => boolean, ms: number, what: string) => {
      const t0 = Date.now()
      while (!cond()) {
        if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`)
        await new Promise((r) => setTimeout(r, 20))
      }
    }
    await until(() => net.useNet.getState().status === 'up', 10000, 'server up')
    await new Promise((r) => setTimeout(r, 300))

    if (ROLE === 'host') {
      writeFileSync(CODE_FILE, '')
      await net.createRoom(false)
      const code = net.useNet.getState().room!.code
      writeFileSync(CODE_FILE, code)
      await until(() => net.useNet.getState().room?.seats.every((s) => s) ?? false, 30000, 'guest joined')
    } else {
      await until(() => existsSync(CODE_FILE) && readFileSync(CODE_FILE, 'utf8').length > 0, 30000, 'room code')
      await net.joinRoom(readFileSync(CODE_FILE, 'utf8'))
    }
    await net.setReady(true)
    await until(() => useGame.getState().mode === 'online', 15000, 'match start')

    // Real-time physics loop with a scripted player.
    let tossing = false
    let pressedFor = -1
    const results: string[] = []
    let lastToast = 0
    const bot = () => {
      const p = ball.translation()
      const v = ball.linvel()
      const me = sim.athletes[0]
      virtualInput.move.x = 0
      virtualInput.move.y = 0
      if (sim.phase === 'serve' && sim.server === 0 && sim.lastHitter === null) {
        if (sim.held && !tossing) {
          tossing = true
          virtualInput.press('flat')
        } else if (!sim.held && tossing && p.y > 2.5 && v.y < 0.5) {
          tossing = false
          virtualInput.release('flat')
        }
        return
      }
      tossing = false
      if (sim.lastHitter === 1 && sim.prediction) {
        const elapsed = sim.time - sim.predictionStart
        const bounceT = sim.prediction.bounces[0]?.t ?? 0
        const after = sim.prediction.samples.filter((s) => s.t > elapsed && s.t > bounceT && s.z > 6)
        const target = after.find((s) => s.y > 0.5 && s.y < 1.4 && s.z < 16.5) ?? after.find((s) => s.y < 1.8)
        if (target) {
          virtualInput.move.x = Math.max(-1, Math.min(1, (target.x - 1.1 - me.x) * 3))
          virtualInput.move.y = -Math.max(-1, Math.min(1, (target.z + 0.4 - me.z) * 3))
        }
        if (sim.phase === 'rally' && v.z > 0.5 && pressedFor !== sim.hits) {
          const tt = (me.z - 0.5 - p.z) / v.z
          if (tt > 0 && tt < 0.22) {
            pressedFor = sim.hits
            virtualInput.press('topspin')
            setTimeout(() => virtualInput.release('topspin'), 50)
          }
        }
      }
    }

    const dt = PHYSICS.timeStep
    let acc = 0
    let last = performance.now()
    const end = Date.now() + SECONDS * 1000
    let maxRally = 0
    while (Date.now() < end && useGame.getState().screen !== 'over') {
      await new Promise((r) => setTimeout(r, 4))
      const now = performance.now()
      acc += (now - last) / 1000
      last = now
      while (acc >= dt) {
        acc -= dt
        bot()
        stepGame(dt)
        world.step(queue)
        queue.drainCollisionEvents((h1, h2, started) => {
          if (!started) return
          if (netHandles.has(h1) || netHandles.has(h2)) onNetTouch()
          if (fenceHandles.has(h1) || fenceHandles.has(h2)) onFenceTouch()
        })
      }
      maxRally = Math.max(maxRally, sim.hits)
      const toast = useGame.getState().toast
      if (toast && toast.id !== lastToast) {
        lastToast = toast.id
        results.push(`${toast.title}${toast.detail ? ` (${toast.detail})` : ''}`)
      }
    }
    const g = useGame.getState()
    writeFileSync(
      `${CODE_FILE}.${ROLE}.json`,
      JSON.stringify(
        {
          score: { sets: g.match.sets, games: g.match.games, points: g.match.points },
          calls: results,
          strikes: net.netStats.strikes,
          refused: net.netStats.refused,
          refusals: net.netStats.refusals,
          maxRally,
        },
        null,
        1,
      ),
    )
    expect(results.length).toBeGreaterThan(3)
    expect(net.netStats.strikes).toBeGreaterThan(2)
    expect(net.netStats.refused).toBeLessThanOrEqual(Math.max(1, net.netStats.strikes * 0.1))
  }, 180_000)
})
