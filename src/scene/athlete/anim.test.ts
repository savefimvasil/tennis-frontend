import { describe, expect, it } from 'vitest'
import { gaitFor, leanFromAccel, lookAngles, monotoneCubic, preparedSwingTime, strideLength, toLocal } from './anim'
import { BACKHAND, FOREHAND, JOINTS, SERVE_KEYS, makePose, sampleTrack } from './poses'

describe('monotoneCubic', () => {
  const ts = [0, 0.12, 0.2, 0.36, 0.72]
  const vs = [0, -1.15, 0.35, 1.05, 0]

  it('passes through every key and clamps outside', () => {
    ts.forEach((t, i) => expect(monotoneCubic(ts, vs, t)).toBeCloseTo(vs[i], 9))
    expect(monotoneCubic(ts, vs, -1)).toBe(0)
    expect(monotoneCubic(ts, vs, 5)).toBe(0)
  })

  it('never overshoots a segment', () => {
    for (let i = 0; i < ts.length - 1; i++) {
      const lo = Math.min(vs[i], vs[i + 1])
      const hi = Math.max(vs[i], vs[i + 1])
      for (let u = 0; u <= 1; u += 0.05) {
        const v = monotoneCubic(ts, vs, ts[i] + (ts[i + 1] - ts[i]) * u)
        expect(v).toBeGreaterThanOrEqual(lo - 1e-9)
        expect(v).toBeLessThanOrEqual(hi + 1e-9)
      }
    }
  })

  it('keeps moving through a key that is not a turning point (contact)', () => {
    // 0.2 sits between -1.15 and 1.05: the old per-segment smoothstep stopped dead there.
    const e = 1e-3
    const speed = (monotoneCubic(ts, vs, 0.2 + e) - monotoneCubic(ts, vs, 0.2 - e)) / (2 * e)
    expect(speed).toBeGreaterThan(5)
  })

  it('samples whole tracks without NaN, ending in the ready pose', () => {
    const out = makePose()
    for (const track of [FOREHAND, BACKHAND, SERVE_KEYS]) {
      const end = track[track.length - 1]
      for (let t = 0; t <= end.t; t += 0.01) {
        sampleTrack(track, t, out)
        for (const k of JOINTS) for (const c of out.j[k]) expect(Number.isFinite(c)).toBe(true)
      }
      sampleTrack(track, end.t, out)
      for (const k of JOINTS) expect(out.j[k]).toEqual(end.pose.j[k])
    }
  })
})

describe('gaitFor', () => {
  it('stands still when not moving', () => {
    expect(gaitFor(0, 0)).toMatchObject({ run: 0, shuffle: 0, hipYaw: 0 })
  })

  it('shuffles on slow sideways moves and runs forward', () => {
    expect(gaitFor(2, 0).shuffle).toBeGreaterThan(0.9)
    expect(gaitFor(0, 3).run).toBe(1)
    expect(gaitFor(0, -3).dir).toBe(-1)
  })

  it('turns the hips into a crossover run when fast', () => {
    const slow = gaitFor(2, 0)
    const fast = gaitFor(5.5, 0)
    expect(fast.shuffle).toBeLessThan(0.05)
    expect(Math.abs(fast.hipYaw)).toBeGreaterThan(Math.abs(slow.hipYaw))
  })

  it('has no hip flip when moving straight sideways', () => {
    // Forward-ish and backward-ish lateral runs both turn the hips the same way.
    const a = gaitFor(5, 0.1)
    const b = gaitFor(5, -0.1)
    expect(Math.sign(a.hipYaw)).toBe(Math.sign(b.hipYaw))
    expect(Math.abs(a.hipYaw - b.hipYaw)).toBeLessThan(0.05)
  })
})

describe('small helpers', () => {
  it('shortens the stride when slow', () => {
    expect(strideLength(1)).toBeLessThan(strideLength(5))
  })

  it('leans forward when accelerating and back when braking', () => {
    expect(leanFromAccel(0, 9)[0]).toBeGreaterThan(0)
    expect(leanFromAccel(0, -18)[0]).toBeLessThan(0)
  })

  it('looks up at a high ball and to the side', () => {
    const [pitch, yaw] = lookAngles(2, 3, 2)
    expect(pitch).toBeLessThan(0)
    expect(yaw).toBeGreaterThan(0)
  })

  it('converts to the local frame', () => {
    const l = toLocal(0, -1, Math.PI) // facing -z, moving -z = forward
    expect(l.z).toBeCloseTo(1)
    expect(l.x).toBeCloseTo(0)
  })

  it('starts a prepared swing from the take-back and joins the track at the backswing', () => {
    expect(preparedSwingTime(0, 0.8, 0.12)).toBeCloseTo(0.096)
    expect(preparedSwingTime(0.12, 0.8, 0.12)).toBeCloseTo(0.12)
    expect(preparedSwingTime(0.3, 0.8, 0.12)).toBe(0.3)
    expect(preparedSwingTime(0.05, 0, 0.12)).toBe(0.05)
  })
})
