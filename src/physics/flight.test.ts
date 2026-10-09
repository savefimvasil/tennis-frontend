import { describe, expect, it } from 'vitest'
import { inServiceBox, inSinglesCourt, simulate, solveShot } from './flight'
import { netHeightAt } from '../game/constants'

describe('flight model', () => {
  it('drag slows a flat ball', () => {
    const f = simulate({ x: 0, y: 1, z: 11 }, { x: 0, y: 3, z: -30 }, { x: 0, y: 0, z: 0 })
    const last = f.samples[f.samples.length - 1]
    expect(Math.abs(last.vz)).toBeLessThan(30)
  })

  it('topspin dips the ball shorter than backspin', () => {
    const p = { x: 0, y: 1, z: 11 }
    const v = { x: 0, y: 4, z: -26 }
    // Ball travels toward -z; topspin axis = (dz, 0, -dx) = (-1, 0, 0)
    const top = simulate(p, v, { x: -250, y: 0, z: 0 }, { maxBounces: 1 })
    const back = simulate(p, v, { x: 150, y: 0, z: 0 }, { maxBounces: 1 })
    expect(top.bounces[0].z).toBeGreaterThan(back.bounces[0].z)
  })

  it('solver lands topspin drive near target and clears the net', () => {
    const sol = solveShot({
      from: { x: 1, y: 1, z: 11.5 },
      target: { x: -2.5, z: -9 },
      speed: 30,
      spin: 260,
      netClearance: 0.3,
    })
    expect(Math.abs(sol.landing.x + 2.5)).toBeLessThan(0.25)
    expect(Math.abs(sol.landing.z + 9)).toBeLessThan(0.25)
    expect(sol.flight.netCrossY!).toBeGreaterThan(netHeightAt(0) + 0.3)
  })

  it('solver handles a serve into the box', () => {
    const sol = solveShot({
      from: { x: 0.5, y: 2.85, z: 12.1 },
      target: { x: -2.6, z: -5.6 },
      speed: 48,
      spin: 80,
      netClearance: 0.05,
    })
    expect(inServiceBox(sol.landing.x, sol.landing.z, -1, -1)).toBe(true)
    expect(sol.flight.netCrossY!).toBeGreaterThan(netHeightAt(0))
  })

  it('solver lobs', () => {
    const sol = solveShot({
      from: { x: 0, y: 0.8, z: 10 },
      target: { x: 0, z: -10 },
      speed: 0,
      spin: 120,
      netClearance: 1,
      lobPitch: 0.85,
    })
    expect(Math.abs(sol.landing.z + 10)).toBeLessThan(0.3)
    expect(inSinglesCourt(sol.landing.x, sol.landing.z, -1)).toBe(true)
  })
})
