import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { BALL, COURT } from '../game/constants'
import { onFenceTouch } from '../game/director'
import { courtRoughness, courtTexture, grassTexture } from './textures'

const L = COURT.halfLength
const DW = COURT.doublesHalfWidth
const SW = COURT.singlesHalfWidth

function linesGeometry() {
  const lw = COURT.lineWidth
  const bw = COURT.baselineWidth
  const h = 0.003
  const boxes: [number, number, number, number][] = [
    // [centerX, centerZ, sizeX, sizeZ]
    [0, L - bw / 2, DW * 2, bw],
    [0, -L + bw / 2, DW * 2, bw],
    [DW - lw / 2, 0, lw, L * 2],
    [-DW + lw / 2, 0, lw, L * 2],
    [SW - lw / 2, 0, lw, L * 2],
    [-SW + lw / 2, 0, lw, L * 2],
    [0, COURT.serviceLine - lw / 2, SW * 2, lw],
    [0, -COURT.serviceLine + lw / 2, SW * 2, lw],
    [0, 0, lw, COURT.serviceLine * 2],
    [0, L - bw - 0.05, lw, 0.1],
    [0, -L + bw + 0.05, lw, 0.1],
  ]
  const geos = boxes.map(([x, z, sx, sz]) => {
    const g = new THREE.BoxGeometry(sx, h, sz)
    g.translate(x, h / 2, z)
    return g
  })
  return mergeGeometries(geos)
}

export function Court() {
  const lines = useMemo(linesGeometry, [])
  const blue = useMemo(() => courtTexture('#2c5d8f', 'court-blue'), [])
  const green = useMemo(() => {
    const t = courtTexture('#3d7656', 'court-green').clone()
    t.repeat.set(10, 18)
    t.needsUpdate = true
    return t
  }, [])
  const rough = useMemo(() => courtRoughness(), [])
  const grass = useMemo(() => grassTexture(), [])

  return (
    <group>
      {/* Grass beyond the fence */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial map={grass} roughness={1} color="#a8b893" />
      </mesh>
      {/* Concrete apron around the venue */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
        <planeGeometry args={[COURT.fenceX * 2 + 12, COURT.fenceZ * 2 + 10]} />
        <meshStandardMaterial color="#b9b2a3" roughness={0.95} />
      </mesh>
      {/* Green run-off */}
      <mesh rotation-x={-Math.PI / 2} position-y={0} receiveShadow>
        <planeGeometry args={[COURT.fenceX * 2, COURT.fenceZ * 2]} />
        <meshStandardMaterial map={green} roughnessMap={rough} roughness={0.9} />
      </mesh>
      {/* Blue playing area */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.001} receiveShadow>
        <planeGeometry args={[DW * 2, L * 2]} />
        <meshStandardMaterial map={blue} roughnessMap={rough} roughness={0.82} />
      </mesh>
      <mesh geometry={lines} receiveShadow>
        <meshStandardMaterial color="#f3f4ef" roughness={0.55} polygonOffset polygonOffsetFactor={-2} />
      </mesh>

      {/* Physics: the playing surface and the fence */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[60, 0.5, 60]}
          position={[0, -0.5, 0]}
          restitution={BALL.restitution}
          friction={BALL.friction}
        />
      </RigidBody>
      <RigidBody type="fixed" colliders={false}>
        {(
          [
            [COURT.fenceX + 0.1, 0, 0.1, COURT.fenceZ],
            [-COURT.fenceX - 0.1, 0, 0.1, COURT.fenceZ],
            [0, COURT.fenceZ + 0.1, COURT.fenceX, 0.1],
            [0, -COURT.fenceZ - 0.1, COURT.fenceX, 0.1],
          ] as const
        ).map(([x, z, hx, hz], i) => (
          <CuboidCollider
            key={i}
            args={[hx, COURT.fenceHeight / 2, hz]}
            position={[x, COURT.fenceHeight / 2, z]}
            restitution={0.25}
            friction={0.8}
            onCollisionEnter={onFenceTouch}
          />
        ))}
      </RigidBody>
    </group>
  )
}
