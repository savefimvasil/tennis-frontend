import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Trail } from '@react-three/drei'
import * as THREE from 'three'
import { BALL } from '../game/constants'
import { sim } from '../game/sim'
import { BallBody } from '../physics/ballBody'
import { ballTexture } from './textures'

export function Ball() {
  const body = useMemo(() => new BallBody(), [])
  const root = useRef<THREE.Group>(null!)
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
    const b = body
    root.current.position.set(b.p.x, b.p.y, b.p.z)
    root.current.quaternion.set(b.q.x, b.q.y, b.q.z, b.q.w)
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
    const squashing = f.t < 0.07
    const v = b.linvel()
    const speed = Math.hypot(v.x, v.y, v.z)
    // Between impacts the ball is stretched along its path by how far it travels in a frame,
    // the way a camera's shutter smears it on a broadcast: a fast serve reads as a streak.
    if (!squashing && speed > 1) f.axis.set(v.x / speed, v.y / speed, v.z / speed)
    A.setFromUnitVectors(up, f.axis)
    const k = squashing ? Math.sin((f.t / 0.07) * Math.PI) * f.amount : 0
    const smear = squashing ? 0 : Math.min(4, (speed * Math.min(dt, 1 / 30)) / (2 * BALL.radius) - 0.6)
    const stretch = 1 + Math.max(0, smear) * 0.55
    // Squash group: world rotation A (y along the impact or travel axis) => local R^-1 * A.
    const g = squashGroup.current
    g.quaternion.multiplyQuaternions(Rinv, A)
    if (k > 0) g.scale.set(1 + k * 0.5, 1 - k, 1 + k * 0.5)
    else g.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch))
    // Mesh keeps the body's world rotation R => local A^-1 * R.
    spinMesh.current.quaternion.copy(A).invert().multiply(R)
  })
  useEffect(() => {
    sim.ball = body
    return () => {
      sim.ball = null
    }
  }, [body])
  return (
    <group ref={root}>
      <Trail width={0.24} length={4} decay={1.2} color="#f6ffbf" attenuation={(t) => t * t * t}>
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
    </group>
  )
}
