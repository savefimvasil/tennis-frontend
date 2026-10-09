import { describe, expect, it } from 'vitest'
import {
  applyBounce,
  courtPaceRating,
  inServiceBox,
  inSinglesCourt,
  setSurface,
  setWind,
  simulate,
  solveShot,
  SURFACES,
} from './flight'
import { PACE, SHOTS } from '../game/tuning'
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

  it('surfaces fall into the right ITF pace categories', () => {
    expect(courtPaceRating(SURFACES.clay)).toBeLessThanOrEqual(29)
    const hard = courtPaceRating(SURFACES.hard)
    expect(hard).toBeGreaterThanOrEqual(35)
    expect(hard).toBeLessThan(45)
    expect(courtPaceRating(SURFACES.grass)).toBeGreaterThanOrEqual(45)
  })

  it('clay bounces slower and higher than grass', () => {
    const run = (id: 'clay' | 'grass') => {
      const v = { x: 0, y: -8.27, z: -28.8 }
      const w = { x: 0, y: 0, z: 0 }
      applyBounce(v, w, SURFACES[id])
      return v
    }
    const clay = run('clay')
    const grass = run('grass')
    expect(Math.abs(clay.z)).toBeLessThan(Math.abs(grass.z))
    expect(clay.y).toBeGreaterThan(grass.y)
  })

  it('aims through crosswind and sidespin', () => {
    setWind(3, 0)
    const sol = solveShot({
      from: { x: -0.6, y: 2.9, z: 12.1 },
      target: { x: 3.2, z: -5.4 },
      speed: 44,
      spin: 120,
      sidespin: 180,
      netClearance: 0.12,
    })
    setWind(0, 0)
    expect(Math.hypot(sol.landing.x - 3.2, sol.landing.z + 5.4)).toBeLessThan(0.15)
  })

  it('setSurface switches the live bounce model', () => {
    setSurface('clay')
    const v = { x: 0, y: -8.27, z: -28.8 }
    applyBounce(v, { x: 0, y: 0, z: 0 })
    setSurface('hard')
    const v2 = { x: 0, y: -8.27, z: -28.8 }
    applyBounce(v2, { x: 0, y: 0, z: 0 })
    expect(Math.abs(v.z)).toBeLessThan(Math.abs(v2.z))
  })

  it.each(['club', 'tour'] as const)('%s-pace topspin rally ball stays at a realistic height', (pace) => {
    const s = SHOTS.topspin
    const k = PACE[pace]
    const from = { x: 0, y: 0.95, z: 12.2 }
    const sol = solveShot({
      from,
      target: { x: 0, z: -s.depth },
      speed: s.speed * k,
      spin: s.spin * k,
      sidespin: 0,
      netClearance: s.netClearance,
    })
    const apex = Math.max(...sol.flight.samples.map((p) => p.y))
    // Tour topspin crosses the net 0.9-1.5 m above the tape; club balls loop a little higher.
    expect(sol.flight.netCrossY).toBeLessThan(pace === 'club' ? 2.35 : 2)
    expect(apex).toBeLessThan(pace === 'club' ? 2.4 : 2.05)
  })
})
