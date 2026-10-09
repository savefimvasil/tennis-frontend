import { useLayoutEffect, useRef } from 'react'
import { Environment, Lightformer, Sky } from '@react-three/drei'
import * as THREE from 'three'

// Late-afternoon coastal light: a low warm sun from behind the camera's right,
// a cool sky fill, and a procedural environment map for reflections.
export const SUN_DIR = new THREE.Vector3(0.62, 0.4, 0.68).normalize()

export function Lighting({ shadowSize }: { shadowSize: number }) {
  const sun = useRef<THREE.DirectionalLight>(null!)
  useLayoutEffect(() => {
    const cam = sun.current.shadow.camera
    cam.left = -24
    cam.right = 24
    cam.top = 27
    cam.bottom = -27
    cam.near = 20
    cam.far = 140
    cam.updateProjectionMatrix()
  }, [])

  const sunPos = SUN_DIR.clone().multiplyScalar(70)
  return (
    <>
      <color attach="background" args={['#e6d9c6']} />
      <fog attach="fog" args={['#e4d6c2', 70, 460]} />
      <Sky
        distance={4500}
        sunPosition={SUN_DIR.clone().multiplyScalar(100).toArray()}
        turbidity={8}
        rayleigh={2.1}
        mieCoefficient={0.007}
        mieDirectionalG={0.82}
      />
      <hemisphereLight args={['#b9cde6', '#6b5c42', 0.8]} />
      <directionalLight
        ref={sun}
        position={sunPos.toArray()}
        intensity={3.6}
        color="#ffd2a0"
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.03}
      />
      <Environment resolution={256} frames={1} environmentIntensity={0.55}>
        {/* Sky dome tint and a warm sun card for glossy reflections */}
        <Lightformer
          form="rect"
          intensity={1.2}
          color="#bcd4ef"
          scale={[60, 30, 1]}
          position={[0, 18, 0]}
          rotation-x={Math.PI / 2}
        />
        <Lightformer
          form="circle"
          intensity={6}
          color="#ffd9a8"
          scale={8}
          position={SUN_DIR.clone().multiplyScalar(30).toArray()}
          target={[0, 0, 0]}
        />
        <Lightformer form="rect" intensity={0.6} color="#7d9a6a" scale={[60, 6, 1]} position={[0, -2, -30]} />
        <Lightformer
          form="rect"
          intensity={0.8}
          color="#f1e3cf"
          scale={[40, 8, 1]}
          position={[-30, 4, 0]}
          rotation-y={Math.PI / 2}
        />
      </Environment>
    </>
  )
}
