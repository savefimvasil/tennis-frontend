import { useMemo } from 'react'
import * as THREE from 'three'
import { stringsTexture } from '../textures'

/** Racket modelled from the grip (origin) down along -y; string bed in the local xy plane. */
export function Racket({ frame }: { frame: string }) {
  const mats = useMemo(
    () => ({
      frame: new THREE.MeshPhysicalMaterial({
        color: frame,
        roughness: 0.25,
        clearcoat: 1,
        clearcoatRoughness: 0.15,
        metalness: 0.1,
      }),
      grip: new THREE.MeshStandardMaterial({ color: '#1c1c1e', roughness: 0.85 }),
      strings: new THREE.MeshStandardMaterial({
        color: '#f1f1e6',
        alphaMap: stringsTexture(),
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        roughness: 0.6,
      }),
      cap: new THREE.MeshStandardMaterial({ color: '#e9e9e9', roughness: 0.4, metalness: 0.3 }),
    }),
    [frame],
  )
  const headY = -0.47
  const rx = 0.118
  const ry = 0.152
  return (
    <group position={[0, 0.06, 0]}>
      <mesh position-y={-0.08} material={mats.grip} castShadow>
        <cylinderGeometry args={[0.017, 0.016, 0.2, 8]} />
      </mesh>
      <mesh position-y={0.025} material={mats.cap}>
        <cylinderGeometry args={[0.019, 0.019, 0.012, 8]} />
      </mesh>
      {/* Throat: two beams opening into the head */}
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * 0.03, -0.235, 0]} rotation-z={s * 0.24} material={mats.frame} castShadow>
          <boxGeometry args={[0.014, 0.17, 0.02]} />
        </mesh>
      ))}
      <group position-y={headY}>
        <mesh scale={[rx / 0.13, ry / 0.13, 1]} material={mats.frame} castShadow>
          <torusGeometry args={[0.13, 0.009, 8, 40]} />
        </mesh>
        <mesh scale={[rx / 0.13, ry / 0.13, 1]} material={mats.strings} castShadow>
          <circleGeometry args={[0.128, 32]} />
        </mesh>
      </group>
    </group>
  )
}
