import { describe, expect, it } from 'vitest'
import { BallBody } from './ballBody'
import { setSurface, setWind, simulate, type V3 } from './flight'
import { netHeightAt, PHYSICS } from '../game/constants'

// The live ball and the predictor (and the server, which runs simulate/advance) take the same
// steps: what the landing ring and the AI read is exactly what the ball then does.

function live(p: V3, v: V3, w: V3, seconds: number) {
  const b = new BallBody()
  b.setTranslation(p)
  b.setLinvel(v)
  b.setAngvel(w)
  const out: { t: number; p: V3 }[] = []
  const events: { t: number; kind: string }[] = []
  for (let t = 0; t <= seconds; t += PHYSICS.timeStep) {
    out.push({ t, p: b.translation() })
    b.step(PHYSICS.timeStep)
    if (b.events.bounce) events.push({ t, kind: 'bounce' })
    if (b.events.net) events.push({ t, kind: b.events.net })
  }
  return { out, events }
}

describe('live ball = predictor', () => {
  setSurface('hard')
  setWind(1.2, -0.6)
  const cases: [string, V3, V3, V3][] = [
    ['topspin drive', { x: 0.4, y: 0.95, z: 11.5 }, { x: -1.5, y: 5.2, z: -27 }, { x: -280, y: 0, z: 0 }],
    ['slice', { x: -0.8, y: 1.1, z: 11 }, { x: 1, y: 2.5, z: -24 }, { x: 250, y: 0, z: 0 }],
    ['net cord', { x: 0, y: 1.0, z: 8 }, { x: 0, y: 1.6, z: -16 }, { x: 0, y: 0, z: 0 }],
    ['into the net', { x: 0, y: 0.6, z: 8 }, { x: 0, y: 0.5, z: -20 }, { x: 0, y: 0, z: 0 }],
  ]
  for (const [name, p, v, w] of cases) {
    it(name, () => {
      const f = simulate(p, v, w, { maxBounces: 3, maxT: 3 })
      const { out } = live(p, v, w, 3)
      for (const s of f.samples) {
        const l = out.find((o) => Math.abs(o.t - s.t) < 1e-9)!
        expect(Math.hypot(l.p.x - s.x, l.p.y - s.y, l.p.z - s.z)).toBeLessThan(1e-9)
      }
    })
  }

  it('a ball clipping the tape is deflected (a net cord), one into the net drops on its side', () => {
    // Centre just under the tape height at the net: the tape catches it.
    const cord = simulate({ x: 0, y: 1.0, z: 3 }, { x: 0, y: 0, z: -14 }, { x: 0, y: 0, z: 0 }, { maxT: 2 })
    expect(cord.cord || cord.intoNet).toBe(true)
    const low = simulate({ x: 0, y: 0.5, z: 3 }, { x: 0, y: 0.5, z: -20 }, { x: 0, y: 0, z: 0 }, { maxT: 2 })
    expect(low.intoNet).toBe(true)
    expect(low.bounces[0].z).toBeGreaterThan(0)
    expect(netHeightAt(0)).toBeGreaterThan(0.9)
  })
})
