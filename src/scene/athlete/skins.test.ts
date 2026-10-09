import { expect, it } from 'vitest'
import { seatSkins } from './skins'

it('dresses both players the same on both screens, never alike', () => {
  expect(seatSkins(['lime', 'black']).map((s) => s.id)).toEqual(['lime', 'black'])
  expect(seatSkins([null, undefined]).map((s) => s.id)).toEqual(['navy', 'coral'])
  expect(seatSkins(['coral', 'coral']).map((s) => s.id)).toEqual(['coral', 'navy'])
  expect(seatSkins(['nope', 'navy']).map((s) => s.id)).toEqual(['navy', 'coral'])
})
