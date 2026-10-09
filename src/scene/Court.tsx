import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { BALL, COURT } from '../game/constants'
import { onFenceTouch } from '../game/director'
import { clayTexture, courtRoughness, courtTexture, grassTexture, lawnTexture, radialTexture } from './textures'
import { useGame } from '../game/store'

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

/** Surface look per court type: playing area, run-off and how the material reads. */
function useSurfaceMaterials() {
  const surface = useGame((s) => s.surface)
  return useMemo(() => {
    const rough = courtRoughness()
    if (surface === 'clay') {
      const inner = clayTexture()
      const outer = inner.clone()
      outer.repeat.set(12, 22)
      outer.needsUpdate = true
      return { surface, inner, outer, innerRough: 0.97, outerRough: 0.97, outerTint: '#e9ded6', rough }
    }
    if (surface === 'grass') {
      // 2 m stripes across the court, continuing into the run-off.
      const inner = lawnTexture().clone()
      inner.repeat.set(1, (L * 2) / 4)
      inner.needsUpdate = true
      const outer = lawnTexture().clone()
      outer.repeat.set(1, (COURT.fenceZ * 2) / 4)
      outer.needsUpdate = true
      return { surface, inner, outer, innerRough: 0.9, outerRough: 0.92, outerTint: '#d9e6cf', rough }
    }
    const inner = courtTexture('#2c5d8f', 'court-blue')
    const outer = courtTexture('#3d7656', 'court-green').clone()
    outer.repeat.set(10, 18)
    outer.needsUpdate = true
    return { surface, inner, outer, innerRough: 0.82, outerRough: 0.9, outerTint: '#ffffff', rough }
  }, [surface])
}

/** Worn patches where players stand most: behind the baseline centre and at the service line. */
function Wear({ color, opacity }: { color: string; opacity: number }) {
  const tex = useMemo(() => radialTexture(), [])
  const spots: [number, number, number, number][] = [
    [0, L + 0.7, 4.2, 1.4],
    [0, -L - 0.7, 4.2, 1.4],
    [0.4, L - 0.6, 2.4, 0.9],
    [-0.4, -L + 0.6, 2.4, 0.9],
    [1.8, L + 0.3, 1.8, 0.8],
    [-1.8, -L - 0.3, 1.8, 0.8],
  ]
  return (
    <group>
      {spots.map(([x, z, w, d], i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[x, 0.0025, z]} renderOrder={1}>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial
            map={tex}
            color={color}
            transparent
            opacity={opacity}
            depthWrite={false}
            roughness={1}
          />
        </mesh>
      ))}
    </group>
  )
}

export function Court() {
  const lines = useMemo(linesGeometry, [])
  const m = useSurfaceMaterials()
  const grass = useMemo(() => grassTexture(), [])

  return (
    <group>
      {/* Grass beyond the fence */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial map={grass} roughness={1} color="#a8b893" />
      </mesh>
      {/* Paved apron around the venue */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
        <planeGeometry args={[COURT.fenceX * 2 + 16, COURT.fenceZ * 2 + 14]} />
        <meshStandardMaterial color="#c9bfae" roughness={0.95} />
      </mesh>
      {/* Run-off */}
      <mesh rotation-x={-Math.PI / 2} position-y={0} receiveShadow>
        <planeGeometry args={[COURT.fenceX * 2, COURT.fenceZ * 2]} />
        <meshStandardMaterial map={m.outer} roughnessMap={m.rough} roughness={m.outerRough} color={m.outerTint} />
      </mesh>
      {/* Playing area */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.001} receiveShadow>
        <planeGeometry args={[DW * 2, L * 2]} />
        <meshStandardMaterial map={m.inner} roughnessMap={m.rough} roughness={m.innerRough} />
      </mesh>
      {m.surface === 'grass' ? <Wear color="#b49a6a" opacity={0.42} /> : null}
      {m.surface === 'clay' ? <Wear color="#8f3f1f" opacity={0.25} /> : null}
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
