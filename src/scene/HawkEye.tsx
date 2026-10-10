import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { BALL } from '../game/constants'
import { sim } from '../game/sim'

// Court graphics for a reviewed line call, the way the broadcast replay draws it: the ball's
// path down to the bounce, and its contact patch as a bright ellipse beside the line.

type Review = NonNullable<typeof sim.review>

export function HawkEye() {
  const [review, setReview] = useState<Review | null>(null)
  const fill = useRef<THREE.MeshBasicMaterial>(null)
  useFrame((state) => {
    if (sim.review !== review) setReview(sim.review)
    if (fill.current) fill.current.opacity = 0.6 + Math.sin(state.clock.elapsedTime * 6) * 0.15
  })
  if (!review) return null
  const points = review.path.map((p) => new THREE.Vector3(p.x, Math.max(p.y, 0.02), p.z))
  // Fade the path in from its start, so the eye follows it down to the mark.
  const colors = points.map((_, i) => new THREE.Color('#ffffff').lerp(new THREE.Color('#ff4d4d'), i / points.length))
  const shadow = points.map((p) => new THREE.Vector3(p.x, 0.012, p.z))
  const ghosts = points.filter((_, i) => i < points.length - 1 && (points.length - 1 - i) % 6 === 0).slice(-5)
  // The patch is stretched along the direction the ball came in.
  const last = review.path[review.path.length - 2] ?? review.path[0]
  const yaw = Math.atan2(review.x - last.x, review.z - last.z)
  return (
    <group renderOrder={4}>
      {points.length > 1 ? (
        <>
          <Line points={points} vertexColors={colors} lineWidth={3} transparent opacity={0.95} depthWrite={false} />
          {/* Its shadow on the court, so the height of the arc reads. */}
          <Line points={shadow} color="#000000" lineWidth={2} transparent opacity={0.3} depthWrite={false} />
        </>
      ) : null}
      {/* Ghost balls along the last of the flight. */}
      {ghosts.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[BALL.radius * 1.3, 12, 8]} />
          <meshBasicMaterial
            color="#e8ff6a"
            toneMapped={false}
            transparent
            opacity={0.25 + (0.6 * i) / ghosts.length}
          />
        </mesh>
      ))}
      <group position={[review.x, 0.014, review.z]} rotation-y={yaw}>
        <mesh rotation-x={-Math.PI / 2} scale={[1, 1.9, 1]}>
          <circleGeometry args={[BALL.radius * 1.15, 32]} />
          <meshBasicMaterial ref={fill} color="#ff4d4d" toneMapped={false} transparent depthWrite={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} scale={[1, 1.9, 1]}>
          <ringGeometry args={[BALL.radius * 1.15, BALL.radius * 1.4, 32]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} transparent opacity={0.95} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}
