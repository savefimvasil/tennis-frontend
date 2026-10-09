import { beforeAll, describe, expect, it } from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import type { RapierRigidBody } from '@react-three/rapier'
import { BALL, COURT, HUMAN, PHYSICS, netHeightAt } from './constants'
import { onFenceTouch, onNetTouch, resetForServe, stepGame } from './director'
import { sim } from './sim'
import { useGame } from './store'
import { virtualInput } from '../input/input'
import type { ShotType } from './tuning'

// Plays whole matches headlessly: real Rapier physics, the real director and AI,
// and a simple scripted bot standing in for the human player.

function buildWorld() {
  const world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 })
  world.timestep = PHYSICS.timeStep
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(60, 0.5, 60).setTranslation(0, -0.5, 0).setRestitution(BALL.restitution).setFriction(BALL.friction),
    ground,
  )
  const netHandles = new Set<number>()
  const fenceHandles = new Set<number>()
  const seg = 16
  for (let i = 0; i < seg; i++) {
    const w = (COURT.netPostX * 2) / seg
    const x = -COURT.netPostX + w * (i + 0.5)
    const h = netHeightAt(x)
    const c = world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2, 0.015)
        .setTranslation(x, h / 2, 0)
        .setRestitution(0.05)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setFriction(0.9)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      ground,
    )
    netHandles.add(c.handle)
  }
  const walls: [number, number, number, number][] = [
    [COURT.fenceX + 0.1, 0, 0.1, COURT.fenceZ],
    [-COURT.fenceX - 0.1, 0, 0.1, COURT.fenceZ],
    [0, COURT.fenceZ + 0.1, COURT.fenceX, 0.1],
    [0, -COURT.fenceZ - 0.1, COURT.fenceX, 0.1],
  ]
  for (const [x, z, hx, hz] of walls) {
    const c = world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, COURT.fenceHeight / 2, hz)
        .setTranslation(x, COURT.fenceHeight / 2, z)
        .setRestitution(0.25)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      ground,
    )
    fenceHandles.add(c.handle)
  }
  const ball = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1.4, 12).setCcdEnabled(true).setCanSleep(false).setAngularDamping(0.05),
  )
  world.createCollider(
    RAPIER.ColliderDesc.ball(BALL.radius).setMass(BALL.mass).setRestitution(BALL.restitution).setFriction(BALL.friction),
    ball,
  )
  return { world, ball, netHandles, fenceHandles }
}

/** Scripted human: walks to the predicted ball, swings with decent timing, aims around. */
function botHuman(state: { tossAt: number; pressedFor: number }) {
  const a = sim.athletes[HUMAN]
  const g = useGame.getState()
  virtualInput.move.x = 0
  virtualInput.move.y = 0
  if (sim.phase === 'serve' && sim.server === HUMAN && sim.lastHitter === null) {
    if (sim.held) {
      if (state.tossAt < 0) {
        state.tossAt = sim.time
        virtualInput.press('flat')
      }
    } else if (sim.time - state.tossAt > 0.52) {
      virtualInput.release('flat')
    }
    return
  }
  state.tossAt = -1
  if (g.screen !== 'playing') return
  const ball = sim.ball!
  const p = ball.translation()
  const v = ball.linvel()
  if (sim.lastHitter === 1 && sim.prediction) {
    const elapsed = sim.time - sim.predictionStart
    const target =
      sim.prediction.samples.find((s) => s.t > elapsed && s.z > 8 && s.y < 1.4 && s.vy < 0 && s.t > (sim.prediction!.bounces[0]?.t ?? 0)) ??
      sim.prediction.samples.find((s) => s.t > elapsed && s.z > 6)
    if (target) {
      const dx = target.x - 0.75 - a.x
      const dz = target.z + 0.35 - a.z
      virtualInput.move.x = Math.max(-1, Math.min(1, dx * 3))
      virtualInput.move.y = -Math.max(-1, Math.min(1, dz * 3))
    }
    if (sim.phase === 'rally' && v.z > 0.5 && !a.queued) {
      const tt = (a.z - 0.35 - p.z) / v.z
      if (tt < 0.25 && tt > 0) {
        const shots: ShotType[] = ['topspin', 'topspin', 'slice', 'flat', 'lob']
        virtualInput.press(shots[Math.floor(Math.random() * shots.length)])
        virtualInput.move.x = Math.random() * 2 - 1
      }
    }
  } else {
    virtualInput.move.x = Math.max(-1, Math.min(1, -a.x))
    virtualInput.move.y = -Math.max(-1, Math.min(1, (COURT.halfLength + 0.8 - a.z) * 2))
  }
  void state.pressedFor
}

beforeAll(async () => {
  await RAPIER.init()
})

describe('full match simulation', () => {
  it.each(['easy', 'pro', 'ace'] as const)('plays a quick match against %s to completion', (difficulty) => {
    const { world, ball, netHandles, fenceHandles } = buildWorld()
    sim.ball = ball as unknown as RapierRigidBody
    const g = useGame.getState()
    g.setFormat('quick')
    g.setDifficulty(difficulty)
    g.start()
    resetForServe()
    const queue = new RAPIER.EventQueue(true)
    const endings = new Map<string, number>()
    let lastToast = 0
    let longestPhase = 0
    let phaseSince = sim.time
    let lastPhase = sim.phase
    let maxRally = 0
    const bot = { tossAt: -1, pressedFor: 0 }
    const dt = PHYSICS.timeStep
    let steps = 0

    while (useGame.getState().match.winner === null && steps < 120 * 60 * 40) {
      botHuman(bot)
      stepGame(dt)
      world.step(queue)
      queue.drainCollisionEvents((h1, h2, started) => {
        if (!started) return
        if (netHandles.has(h1) || netHandles.has(h2)) onNetTouch()
        if (fenceHandles.has(h1) || fenceHandles.has(h2)) onFenceTouch()
      })
      steps++
      const st = useGame.getState()
      if (st.toast && st.toast.id !== lastToast) {
        lastToast = st.toast.id
        endings.set(st.toast.title, (endings.get(st.toast.title) ?? 0) + 1)
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
    console.log('stats', JSON.stringify(stats), 'max rally', maxRally, 'longest phase s', longestPhase.toFixed(1))
    expect(m.winner).not.toBeNull()
    expect(longestPhase).toBeLessThan(20)
    expect(maxRally).toBeGreaterThan(2)
  }, 120000)
})
