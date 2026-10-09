import { useEffect, useMemo, useRef } from 'react'
import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { Trail } from '@react-three/drei'
import * as THREE from 'three'
import { BALL } from '../game/constants'
import { sim } from '../game/sim'
import { ballTexture } from './textures'

export function Ball() {
  const body = useRef<RapierRigidBody>(null!)
  const tex = useMemo(() => ballTexture(), [])
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
        <mesh castShadow>
          <sphereGeometry args={[BALL.radius, 32, 20]} />
          <meshStandardMaterial
            map={tex}
            roughness={0.92}
            emissive={new THREE.Color('#c9ef2a')}
            emissiveIntensity={0.18}
          />
        </mesh>
      </Trail>
    </RigidBody>
  )
}
