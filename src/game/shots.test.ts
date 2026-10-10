import { describe, expect, it } from 'vitest'
import { resolveShot, rallyTarget } from './shot'
import { setSurface, setWind, simulate } from '../physics/flight'
import { netHeightAt } from './constants'
import { PACE, type ShotType } from './tuning'

// The four groundstrokes must feel different: a shape each, not one shot at four speeds.

function fly(shot: ShotType, pace: 'club' | 'tour') {
  const from = { x: 0, y: 0.95, z: 12 }
  const r = resolveShot(
    {
      from,
      vin: { x: 0, y: -2, z: 22 },
      serve: false,
      shot,
      grade: 'good',
      target: rallyTarget(shot, 0, 0),
      running: false,
      lateral: 1,
      rightX: -1,
      hand: 1,
      swingMul: PACE[pace],
      miss: null,
    },
    () => 0.5,
  )
  const f = simulate(from, r.v, r.w, { maxBounces: 2, maxT: 6 })
  const b1 = f.bounces[0]
  const after = f.samples.filter((s) => s.t > b1.t)
  return {
    speed: r.speed,
    overTape: (f.netCrossY ?? 0) - netHeightAt(0),
    landing: -b1.z,
    time: b1.t,
    kick: Math.max(...after.map((s) => s.y)),
    /** Distance the ball runs on between the two bounces. */
    run: Math.abs(f.bounces[1].z - b1.z),
  }
}

describe('shot shapes', () => {
  setSurface('hard')
  setWind(0, 0)
  for (const pace of ['club', 'tour'] as const) {
    it(`are distinct on ${pace} pace`, () => {
      const top = fly('topspin', pace)
      const slice = fly('slice', pace)
      const flat = fly('flat', pace)
      const lob = fly('lob', pace)
      // Slice skims the tape and lands shorter than the drives; it no longer floats long.
      expect(slice.overTape).toBeLessThan(0.45)
      expect(slice.landing).toBeLessThan(Math.min(top.landing, flat.landing) - 0.8)
      // Topspin clears the net highest of the drives and kicks up the most.
      expect(top.overTape).toBeGreaterThan(flat.overTape + 0.4)
      expect(top.kick).toBeGreaterThan(slice.kick * 1.8)
      // Flat is the fastest and quickest across.
      expect(flat.speed).toBeGreaterThan(top.speed)
      expect(flat.time).toBeLessThan(top.time)
      // Slice stays low and checks up after the bounce.
      expect(slice.kick).toBeLessThan(0.65)
      expect(slice.run).toBeLessThan(top.run * 0.8)
      // Lob goes way up.
      expect(lob.overTape).toBeGreaterThan(5)
    })
  }
})

describe('kick serve', () => {
  it('jumps sideways off the bounce, to the server’s right', () => {
    setSurface('hard')
    setWind(0, 0)
    // Human serves from +z toward -z: the server's right is +x.
    const from = { x: 0.6, y: 2.7, z: 12.2 }
    const r = resolveShot(
      {
        from,
        vin: { x: 0, y: 0, z: 0 },
        serve: true,
        shot: 'topspin',
        grade: 'good',
        target: { x: -2, z: -5.5 },
        running: false,
        lateral: 0,
        rightX: 1,
        hand: 1,
        swingMul: 1,
        miss: null,
      },
      () => 0.5,
    )
    const f = simulate(from, r.v, r.w, { maxBounces: 2, maxT: 4 })
    const b = f.bounces[0]
    const before = f.samples.filter((s) => s.t <= b.t).at(-1)!
    const after = f.samples.find((s) => s.t > b.t + 0.02)!
    // Sideways speed gained at the bounce, beyond the curve it already had.
    expect(after.vx - before.vx).toBeGreaterThan(1)
  })
})

describe('errors are mishits that fly by the same physics', () => {
  const base = (miss: 'net' | 'long' | 'wide', tx: number) =>
    resolveShot(
      {
        from: { x: 0, y: 0.95, z: 12 },
        vin: { x: 0, y: -2, z: 22 },
        serve: false,
        shot: 'topspin',
        grade: 'good',
        target: { x: tx, z: -9.6 },
        running: false,
        lateral: 1,
        rightX: -1,
        hand: 1,
        swingMul: 1,
        miss,
      },
      () => 0.5,
    )
  setSurface('hard')
  setWind(0, 0)
  it('into the net', () => expect(base('net', 0).flight.intoNet).toBe(true))
  it('long', () => expect(-base('long', 0).landing.z).toBeGreaterThan(11.885))
  it('wide, to the side it was aimed', () => {
    expect(base('wide', 2.5).landing.x).toBeGreaterThan(4.115)
    expect(base('wide', -2.5).landing.x).toBeLessThan(-4.115)
  })
})
