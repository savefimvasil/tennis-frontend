import { BallBody } from '../physics/ballBody'
import { COURT, HUMAN } from './constants'
import { sim } from './sim'
import { useGame } from './store'
import { virtualInput } from '../input/input'
import type { ShotType } from './tuning'

/** A headless ball for tests and bots: the same analytic ball the game plays with. */
export function buildWorld() {
  return { ball: new BallBody() }
}

/** Scripted human: walks to the predicted ball, swings with decent timing, aims around. */
export function botHuman(state: {
  tossAt: number
  pressedFor: number
  pressAt?: number
  aim?: number
  aimUntil?: number
  /** Stick held while serving (-1..1); a function picks it per serve. */
  serveAim?: () => number
  /** Toss release delay (s); 0.52 is near the top of the toss. */
  releaseAfter?: number
  chosenAim?: number
}) {
  const a = sim.athletes[HUMAN]
  const g = useGame.getState()
  virtualInput.move.x = 0
  virtualInput.move.y = 0
  if (sim.phase === 'serve' && sim.server === HUMAN && sim.lastHitter === null) {
    if (sim.held) {
      if (state.tossAt < 0) {
        state.tossAt = sim.time
        state.chosenAim = state.serveAim?.() ?? 0
        virtualInput.press('flat')
      }
    } else {
      virtualInput.move.x = state.chosenAim ?? 0
      if (sim.time - state.tossAt > (state.releaseAfter ?? 0.52)) virtualInput.release('flat')
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
    // Take the ball at a comfortable height after the bounce, stepping in rather than retreating to the fence.
    const bounceT = sim.prediction.bounces[0]?.t ?? 0
    const after = sim.prediction.samples.filter((s) => s.t > elapsed && s.t > bounceT && s.z > 6)
    const target =
      after.find((s) => s.y > 0.5 && s.y < 1.6 && s.z < 16.5) ??
      after.find((s) => s.y < 1.8 && s.z < 18) ??
      sim.prediction.samples.find((s) => s.t > elapsed && s.z > 6)
    if (target) {
      const dx = target.x - 0.75 - a.x
      const dz = target.z + 0.35 - a.z
      virtualInput.move.x = Math.max(-1, Math.min(1, dx * 3))
      virtualInput.move.y = -Math.max(-1, Math.min(1, dz * 3))
    }
    if (sim.phase === 'rally' && v.z > 0.5 && !a.queued) {
      const tt = (a.z - 0.35 - p.z) / v.z
      // A decent club player: presses somewhere between 0.05 s and 0.5 s before contact.
      if (state.pressAt === undefined) state.pressAt = 0.05 + Math.random() * 0.45
      if (tt < state.pressAt && tt > 0) {
        state.pressAt = undefined
        const shots: ShotType[] = ['topspin', 'topspin', 'slice', 'flat', 'lob']
        virtualInput.press(shots[Math.floor(Math.random() * shots.length)])
        state.aim = Math.random() * 2 - 1
        state.aimUntil = sim.time + 0.6
      }
    }
    // Hold the aim direction through contact, like a player pushing the stick.
    if (state.aimUntil !== undefined && sim.time < state.aimUntil) virtualInput.move.x = state.aim ?? 0
  } else {
    virtualInput.move.x = Math.max(-1, Math.min(1, -a.x))
    virtualInput.move.y = -Math.max(-1, Math.min(1, (COURT.halfLength + 0.8 - a.z) * 2))
  }
  void state.pressedFor
}
