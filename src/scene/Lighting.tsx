import { Suspense, useLayoutEffect, useRef } from 'react'
import { suspend } from 'suspend-react'
import { Environment, Lightformer, Sky, useEnvironment, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { FallbackOnError } from './PbrMaterial'

// Late-afternoon light: a low warm sun from behind the camera's right, a cool sky fill, and
// a real sky as background and environment: Poly Haven "Lonely Road Afternoon (Pure Sky)",
// CC0, 2K, stored as an SDR WebP plus a gain map (tools/textures/fetch.mjs). While it loads,
// a procedural sky and light cards stand in; if it fails, the "park" HDRI from @pmndrs/assets.

/** Sun in the HDRI as printed by tools/textures/fetch.mjs (three.js equirect convention). */
const HDRI_SUN = new THREE.Vector3(0.7985, 0.1578, 0.5809)
/** Turn the sky about the vertical so its sun sits behind the camera's right, as the court is staged. */
const SKY_ROTATION = Math.atan2(HDRI_SUN.z, HDRI_SUN.x) - Math.atan2(0.68, 0.62)
export const SUN_DIR = HDRI_SUN.clone()
  .applyAxisAngle(new THREE.Vector3(0, 1, 0), SKY_ROTATION)
  .normalize()

const SKY_FILES = ['sky.webp', 'sky-gain.webp', 'sky.json'].map((f) => `${import.meta.env.BASE_URL}textures/sky/${f}`)

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
      <fog attach="fog" args={[FOG, 70, 460]} />
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
      <FallbackOnError
        fallback={
          <>
            <ProceduralSky />
            <Suspense fallback={<SceneEnvironment />}>
              <HdriEnvironment />
            </Suspense>
          </>
        }
      >
        <Suspense
          fallback={
            <>
              <ProceduralSky />
              <SceneEnvironment />
            </>
          }
        >
          <PhotoSky />
        </Suspense>
      </FallbackOnError>
    </>
  )
}

/** Haze at the horizon of the HDRI, so distant hills fade into the sky. */
const FOG = '#a3afb6'

// The sky files are stored at 0.2256 x the HDRI's exposure (see sky.json); intensities set by eye.
function PhotoSky() {
  // Mipmapped, so the 2K sky is cheap to sample where it is minified on screen.
  const hdr = useEnvironment({ files: SKY_FILES, extensions: mipmappedSky })
  // Ambient light and reflections use the SDR layer: the same sky with the sun clipped. The
  // directional light is the sun; keeping it in the environment too would light every
  // surface a second time and wash out the shadows.
  const sdr = useTexture(SKY_FILES[0])
  useLayoutEffect(() => {
    sdr.mapping = THREE.EquirectangularReflectionMapping
    sdr.colorSpace = THREE.SRGBColorSpace
    sdr.needsUpdate = true
  }, [sdr])
  const rotation: [number, number, number] = [0, SKY_ROTATION, 0]
  return (
    <>
      <Environment map={hdr} background="only" backgroundIntensity={3.4} backgroundRotation={rotation} />
      <Environment map={sdr} environmentIntensity={1.5} environmentRotation={rotation} />
    </>
  )
}

const mipmappedSky = (loader: THREE.Loader) =>
  (loader as unknown as { setRenderTargetOptions(o: object): void }).setRenderTargetOptions({
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  })

function ProceduralSky() {
  return (
    <Sky
      distance={4500}
      sunPosition={SUN_DIR.clone().multiplyScalar(100).toArray()}
      turbidity={8}
      rayleigh={2.1}
      mieCoefficient={0.007}
      mieDirectionalG={0.82}
    />
  )
}

const loadHdri = () => import('@pmndrs/assets/hdri/park.exr').then((m) => m.default)

function HdriEnvironment() {
  const url = suspend(loadHdri, ['hdri-park'])
  return <SceneEnvironment files={url} />
}

function SceneEnvironment({ files }: { files?: string }) {
  return (
    <Environment resolution={256} frames={1} environmentIntensity={0.55} files={files}>
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
  )
}
