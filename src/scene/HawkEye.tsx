import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BALL, COURT } from '../game/constants'
import { sim } from '../game/sim'

// Court graphics for a reviewed line call: the line it was judged against lit up, and the
// ball's contact patch as a bright ellipse, the way the broadcast replay draws it.

export function HawkEye() {
  const group = useRef<THREE.Group>(null!)
  const line = useRef<THREE.Mesh>(null!)
  const mark = useRef<THREE.Mesh>(null!)
  const ring = useRef<THREE.MeshBasicMaterial>(null!)
  const fill = useRef<THREE.MeshBasicMaterial>(null!)
  const red = useMemo(() => new THREE.Color('#ff4d4d'), [])
  useFrame((state) => {
    const r = sim.review
    group.current.visible = !!r
    if (!r) return
    // The line: a lit strip along it, centred on the mark.
    // Lines are painted inside the court's edge: centre the strip on the paint.
    const width = r.axis === 'z' && Math.abs(r.value) === COURT.halfLength ? COURT.baselineWidth : COURT.lineWidth
    const inset = (width / 2) * Math.sign(r.value)
    if (r.axis === 'x') {
      line.current.position.set(r.value - (r.value === 0 ? 0 : inset), 0.012, r.z)
      line.current.scale.set(width, 1, 6)
    } else {
      line.current.position.set(r.x, 0.012, r.value - inset)
      line.current.scale.set(6, 1, width)
    }
    // The contact patch: a ball skids a few centimetres, so the mark is an ellipse along the flight.
    mark.current.position.set(r.x, 0.014, r.z)
    const pulse = 0.85 + Math.sin(state.clock.elapsedTime * 6) * 0.15
    ring.current.color.copy(red)
    fill.current.opacity = 0.55 * pulse
  })
  return (
    <group ref={group} visible={false} renderOrder={4}>
      <mesh ref={line} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <group ref={mark} rotation-x={-Math.PI / 2} scale={[1, 1.9, 1]}>
        <mesh>
          <circleGeometry args={[BALL.radius * 1.15, 32]} />
          <meshBasicMaterial ref={fill} color="#ff4d4d" toneMapped={false} transparent depthWrite={false} />
        </mesh>
        <mesh>
          <ringGeometry args={[BALL.radius * 1.15, BALL.radius * 1.4, 32]} />
          <meshBasicMaterial ref={ring} toneMapped={false} transparent opacity={0.95} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}
