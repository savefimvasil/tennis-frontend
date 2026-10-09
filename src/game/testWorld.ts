import RAPIER from '@dimforge/rapier3d-compat'
import { BALL, COURT, PHYSICS, netHeightAt } from './constants'

/** Headless Rapier world matching the scene's colliders: ground, net and fence (for tests and bots). */
export function buildWorld() {
  const world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 })
  world.timestep = PHYSICS.timeStep
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(60, 0.5, 60)
      .setTranslation(0, -0.5, 0)
      .setRestitution(BALL.restitution)
      .setFriction(BALL.friction),
    ground,
  )
  const netHandles = new Set<number>()
  const fenceHandles = new Set<number>()
  const seg = 16
  for (let i = 0; i < seg; i++) {
    const w = (COURT.netPostX * 2) / seg
    const x = -COURT.netPostX + w * (i + 0.5)
    const h = netHeightAt(x)
    const c = world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2, 0.015)
        .setTranslation(x, h / 2, 0)
        .setRestitution(0.05)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setFriction(0.9)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      ground,
    )
    netHandles.add(c.handle)
  }
  const walls: [number, number, number, number][] = [
    [COURT.fenceX + 0.1, 0, 0.1, COURT.fenceZ],
    [-COURT.fenceX - 0.1, 0, 0.1, COURT.fenceZ],
    [0, COURT.fenceZ + 0.1, COURT.fenceX, 0.1],
    [0, -COURT.fenceZ - 0.1, COURT.fenceX, 0.1],
  ]
  for (const [x, z, hx, hz] of walls) {
    const c = world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, COURT.fenceHeight / 2, hz)
        .setTranslation(x, COURT.fenceHeight / 2, z)
        .setRestitution(0.25)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      ground,
    )
    fenceHandles.add(c.handle)
  }
  const ball = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 1.4, 12)
      .setCcdEnabled(true)
      .setCanSleep(false)
      .setAngularDamping(0.05),
  )
  world.createCollider(
    RAPIER.ColliderDesc.ball(BALL.radius)
      .setMass(BALL.mass)
      .setRestitution(BALL.restitution)
      .setFriction(BALL.friction),
    ball,
  )
  return { world, ball, netHandles, fenceHandles }
}
