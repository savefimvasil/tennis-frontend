import { useMemo } from 'react'
import * as THREE from 'three'
import { COURT, netHeightAt } from '../game/constants'
import { netTexture } from './textures'

const PX = COURT.netPostX

/** A strip that follows the sagging net cord, from `bottom(x)` to `top(x)`. */
function stripGeometry(top: (x: number) => number, bottom: (x: number) => number, segs = 64) {
  const g = new THREE.PlaneGeometry(PX * 2, 1, segs, 1)
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const isTop = pos.getY(i) > 0
    pos.setY(i, isTop ? top(x) : bottom(x))
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  return g
}

export function Net() {
  const mesh = useMemo(
    () =>
      stripGeometry(
        (x) => netHeightAt(x) - 0.03,
        () => 0.03,
      ),
    [],
  )
  const tape = useMemo(
    () =>
      stripGeometry(
        (x) => netHeightAt(x) + 0.005,
        (x) => netHeightAt(x) - 0.06,
      ),
    [],
  )
  const alpha = useMemo(() => {
    const t = netTexture().clone()
    t.repeat.set((PX * 2) / 0.045, 1 / 0.045)
    t.needsUpdate = true
    return t
  }, [])

  const posts = [-PX, PX]
  const sticks = [-COURT.singlesStickX, COURT.singlesStickX]

  return (
    <group>
      <mesh geometry={mesh} castShadow receiveShadow>
        <meshStandardMaterial
          color="#1b1f23"
          alphaMap={alpha}
          alphaTest={0.35}
          alphaToCoverage
          transparent={false}
          side={THREE.DoubleSide}
          roughness={0.9}
        />
      </mesh>
      <mesh geometry={tape} castShadow>
        <meshStandardMaterial color="#f5f5f2" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      {/* Centre strap */}
      <mesh position={[0, COURT.netHeightCenter / 2, 0]} castShadow>
        <boxGeometry args={[0.05, COURT.netHeightCenter, 0.012]} />
        <meshStandardMaterial color="#f5f5f2" roughness={0.6} />
      </mesh>
      {posts.map((x) => (
        <group key={x} position={[x + Math.sign(x) * 0.04, 0, 0]}>
          <mesh position-y={0.56} castShadow>
            <cylinderGeometry args={[0.045, 0.05, 1.12, 20]} />
            <meshStandardMaterial color="#1f4a3a" metalness={0.6} roughness={0.35} />
          </mesh>
          <mesh position-y={1.13}>
            <sphereGeometry args={[0.05, 16, 12]} />
            <meshStandardMaterial color="#c9ccd0" metalness={0.9} roughness={0.2} />
          </mesh>
        </group>
      ))}
      {sticks.map((x) => (
        <mesh key={x} position={[x, netHeightAt(x) / 2, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.012, netHeightAt(x), 8]} />
          <meshStandardMaterial color="#f2f2ee" roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}
