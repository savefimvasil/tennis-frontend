import { it } from 'vitest'
import { simulate, solveShot } from './flight'

it('solver timing', () => {
  // Warm up the JIT so the first measurement is not skewed.
  for (let i = 0; i < 20; i++)
    solveShot({ from: { x: 0, y: 1, z: 11 }, target: { x: 1, z: -8 }, speed: 28, spin: 200, netClearance: 0.4 })
  const t0 = performance.now()
  for (let i = 0; i < 20; i++)
    solveShot({
      from: { x: 1, y: 1, z: 11.5 },
      target: { x: -2.5 + i * 0.1, z: -9 },
      speed: 29,
      spin: 270,
      netClearance: 0.5,
    })
  const t1 = performance.now()
  for (let i = 0; i < 20; i++)
    solveShot({
      from: { x: 0.5, y: 2.9, z: 12.1 },
      target: { x: -2.6, z: -5.6 },
      speed: 44,
      spin: 80,
      sidespin: 200,
      netClearance: 0.1,
    })
  const t2 = performance.now()
  for (let i = 0; i < 20; i++)
    simulate(
      { x: 0, y: 1, z: -11 },
      { x: 0, y: 4, z: 26 },
      { x: 250, y: 0, z: 0 },
      { maxBounces: 2, maxT: 3.5, sampleEvery: 2 },
    )
  const t3 = performance.now()
  console.log(
    'drive ms',
    ((t1 - t0) / 20).toFixed(2),
    'serve ms',
    ((t2 - t1) / 20).toFixed(2),
    'predict ms',
    ((t3 - t2) / 20).toFixed(3),
  )
})
