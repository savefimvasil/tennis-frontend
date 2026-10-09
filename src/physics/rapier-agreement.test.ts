import { beforeAll, describe, expect, it } from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import { BALL, PHYSICS } from '../game/constants'
import { aeroForce, applyBounce, simulate, type V3 } from './flight'

// The AI, landing marker and shot solver all rely on the lightweight predictor.
// This checks it against the real Rapier simulation, including the bounce.

beforeAll(async () => {
  await RAPIER.init()
})

function rapierFlight(p: V3, v: V3, w: V3, seconds: number) {
  const world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 })
  world.timestep = PHYSICS.timeStep
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(60, 0.5, 60).setTranslation(0, -0.5, 0).setRestitution(BALL.restitution).setFriction(BALL.friction),
    ground,
  )
  const ball = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setLinvel(v.x, v.y, v.z).setAngvel(w).setCcdEnabled(true).setAngularDamping(0.05),
  )
  world.createCollider(RAPIER.ColliderDesc.ball(BALL.radius).setMass(BALL.mass).setRestitution(BALL.restitution).setFriction(BALL.friction), ball)
  const f: V3 = { x: 0, y: 0, z: 0 }
  const bounces: { x: number; z: number; vxAfter: number; vzAfter: number; vyAfter: number }[] = []
  let prev = { v: ball.linvel(), w: ball.angvel(), p: ball.translation() }
  for (let t = 0; t < seconds; t += PHYSICS.timeStep) {
    aeroForce(ball.linvel(), ball.angvel(), f)
    ball.resetForces(true)
    ball.addForce(f, true)
    world.step()
    const lv = ball.linvel()
    if (prev.v.y < -0.4 && lv.y > 0.05 && ball.translation().y < 0.25) {
      // Same correction the match director applies.
      const v2 = { ...prev.v }
      const w2 = { ...prev.w }
      applyBounce(v2, w2)
      ball.setLinvel(v2, true)
      ball.setAngvel(w2, true)
      bounces.push({ x: prev.p.x, z: prev.p.z, vxAfter: v2.x, vzAfter: v2.z, vyAfter: v2.y })
    }
    prev = { v: ball.linvel(), w: ball.angvel(), p: ball.translation() }
  }
  return bounces
}

describe('predictor vs Rapier', () => {
  const cases: [string, V3, V3, V3][] = [
    ['flat drive', { x: 0, y: 1, z: 11 }, { x: -2, y: 3, z: -30 }, { x: -60, y: 0, z: 0 }],
    ['heavy topspin', { x: 1, y: 1, z: 11 }, { x: -1, y: 6, z: -26 }, { x: -280, y: 0, z: 0 }],
    ['slice', { x: 0, y: 0.9, z: 11 }, { x: 1, y: 4, z: -22 }, { x: 160, y: 0, z: 0 }],
    ['lob', { x: 0, y: 0.8, z: 10 }, { x: 0, y: 13, z: -14 }, { x: -100, y: 0, z: 0 }],
  ]
  it.each(cases)('%s: first bounce and kick agree', (_name, p, v, w) => {
    const real = rapierFlight(p, v, w, 4)
    const pred = simulate(p, v, w, { maxBounces: 2, maxT: 4 })
    expect(real.length).toBeGreaterThanOrEqual(2)
    expect(Math.hypot(real[0].x - pred.bounces[0].x, real[0].z - pred.bounces[0].z)).toBeLessThan(0.3)
    // Second bounce tests the post-bounce model (restitution, friction, spin kick).
    const d2 = Math.hypot(real[1].x - pred.bounces[1].x, real[1].z - pred.bounces[1].z)
    console.log(_name, 'bounce1 err', Math.hypot(real[0].x - pred.bounces[0].x, real[0].z - pred.bounces[0].z).toFixed(3), 'bounce2 err', d2.toFixed(3), 'vy after', real[0].vyAfter.toFixed(2))
    // Within roughly one physics step of travel; the AI re-predicts from the real ball after each bounce.
    expect(d2).toBeLessThan(0.7)
  })
})
