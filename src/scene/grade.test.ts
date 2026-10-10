import { describe, expect, it } from 'vitest'
import { grade, GRADES } from './grade'

describe('venue colour grades', () => {
  for (const [venue, g] of Object.entries(GRADES)) {
    it(`${venue}: keeps greys near grey, black and white in range`, () => {
      const mid: [number, number, number] = [0.5, 0.5, 0.5]
      grade(mid, g)
      for (const c of mid) expect(Math.abs(c - 0.5)).toBeLessThan(0.05)
      for (const v of [0, 1]) {
        const c: [number, number, number] = [v, v, v]
        grade(c, g)
        for (const x of c) expect(x).toBeGreaterThanOrEqual(0)
        for (const x of c) expect(x).toBeLessThanOrEqual(1)
      }
      // Colour gets richer, not duller.
      const red: [number, number, number] = [0.7, 0.35, 0.3]
      grade(red, g)
      expect(red[0] - red[2]).toBeGreaterThan(0.4)
    })
  }
})
