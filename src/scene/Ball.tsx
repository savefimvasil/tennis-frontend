import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { Trail } from '@react-three/drei'
import * as THREE from 'three'
import { BALL } from '../game/constants'
import { sim } from '../game/sim'
import { ballTexture } from './textures'

export function Ball() {
  const body = useRef<RapierRigidBody>(null!)
  const tex = useMemo(() => ballTexture(), [])
  const squashGroup = useRef<THREE.Group>(null!)
  const spinMesh = useRef<THREE.Mesh>(null!)
  const fx = useRef({ seen: 0, t: 1, axis: new THREE.Vector3(0, 1, 0), amount: 0 })
  const tmp = useMemo(
    () => ({
      R: new THREE.Quaternion(),
      Rinv: new THREE.Quaternion(),
      A: new THREE.Quaternion(),
      up: new THREE.Vector3(0, 1, 0),
    }),
    [],
  )

  // Squash on impact. The squash group is kept world-aligned (it cancels the body's
  // rotation) while the inner mesh re-applies it, so the felt still visibly spins.
  useFrame((_, dt) => {
    const b = body.current
    if (!b) return
    const f = fx.current
    for (const e of sim.events) {
      if (e.id <= f.seen) continue
      f.seen = e.id
      if (e.kind === 'bounce' || e.kind === 'hit') {
        f.t = 0
        f.amount = Math.min(0.32, 0.1 + e.power * 0.28)
        if (e.kind === 'bounce') f.axis.set(0, 1, 0)
        else {
          const v = b.linvel()
          f.axis.set(v.x, v.y, v.z).normalize()
        }
      }
    }
    f.t += dt
    const r = b.rotation()
    const { R, Rinv, A, up } = tmp
    R.set(r.x, r.y, r.z, r.w)
    Rinv.copy(R).invert()
    A.setFromUnitVectors(up, f.axis)
    const k = f.t < 0.07 ? Math.sin((f.t / 0.07) * Math.PI) * f.amount : 0
    // Squash group: world rotation A (y along the impact axis) => local R^-1 * A.
    const g = squashGroup.current
    g.quaternion.multiplyQuaternions(Rinv, A)
    g.scale.set(1 + k * 0.5, 1 - k, 1 + k * 0.5)
    // Mesh keeps the body's world rotation R => local A^-1 * R.
    spinMesh.current.quaternion.copy(A).invert().multiply(R)
  })
  useEffect(() => {
    sim.ball = body.current
    return () => {
      sim.ball = null
    }
  }, [])
  return (
    <RigidBody
      ref={body}
      colliders={false}
      ccd
      canSleep={false}
      position={[0, 1.4, 12]}
      linearDamping={0}
      angularDamping={0.05}
    >
      <BallCollider args={[BALL.radius]} mass={BALL.mass} restitution={BALL.restitution} friction={BALL.friction} />
      <Trail width={0.42} length={4.5} decay={1.2} color="#f6ffbf" attenuation={(t) => t * t * t}>
        <group ref={squashGroup}>
          <mesh ref={spinMesh} castShadow>
            <sphereGeometry args={[BALL.radius, 32, 20]} />
            <meshStandardMaterial
              map={tex}
              roughness={0.92}
              emissive={new THREE.Color('#c9ef2a')}
              emissiveIntensity={0.18}
            />
          </mesh>
        </group>
      </Trail>
    </RigidBody>
  )
}
