import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
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

/**
 * The evening hall: the key light is the floodlight rows straight overhead (one near-vertical
 * directional light standing in for them), so player shadows are short and faint.
 */
const LAMPS_DIR = new THREE.Vector3(0.06, 1, 0.1).normalize()

export function Lighting({ shadowSize, indoor = false }: { shadowSize: number; indoor?: boolean }) {
  return indoor ? <EveningHall shadowSize={shadowSize} /> : <Daylight shadowSize={shadowSize} />
}

function useShadowFrustum() {
  const light = useRef<THREE.DirectionalLight>(null!)
  useLayoutEffect(() => {
    const cam = light.current.shadow.camera
    cam.left = -24
    cam.right = 24
    cam.top = 27
    cam.bottom = -27
    cam.near = 20
    cam.far = 140
    cam.updateProjectionMatrix()
  }, [])
  return light
}

/** Dusk outside, floodlights inside: soft even light, faint short shadows, a blue-hour sky. */
function EveningHall({ shadowSize }: { shadowSize: number }) {
  const lamps = useShadowFrustum()
  return (
    <>
      <color attach="background" args={['#101a33']} />
      <fog attach="fog" args={['#18233f', 40, 110]} />
      <DuskSky />
      {/* Floodlight bounce: warm from above, the court's own colour back from below. */}
      <hemisphereLight args={['#fff1dc', '#3a3633', 1.5]} />
      <directionalLight
        ref={lamps}
        position={LAMPS_DIR.clone().multiplyScalar(70).toArray()}
        intensity={1.5}
        color="#fff3e2"
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.03}
        shadow-radius={4}
      />
      {/* Reflections: the rows of fittings overhead, a dark room around them. */}
      <Environment resolution={128} frames={1} environmentIntensity={0.5}>
        <color attach="background" args={['#1a1f2b']} />
        {[-5.2, 5.2].map((x) => (
          <Lightformer
            key={x}
            form="rect"
            intensity={5}
            color="#fff0d8"
            scale={[1.2, 32, 1]}
            position={[x, 9, 0]}
            rotation-x={Math.PI / 2}
          />
        ))}
        <Lightformer form="rect" intensity={0.5} color="#c99a63" scale={[60, 3, 1]} position={[0, 1.5, -20]} />
      </Environment>
    </>
  )
}

/** Blue hour: deep blue overhead, a last warm band on the horizon, a few early stars. */
function DuskSky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `varying vec3 vDir;
          float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
          void main() {
            float h = max(vDir.y, 0.0);
            vec3 zenith = vec3(0.035, 0.06, 0.15);
            vec3 horizon = vec3(0.16, 0.22, 0.4);
            vec3 col = mix(horizon, zenith, pow(h, 0.55));
            // The afterglow, strongest toward the west (-x).
            float glow = exp(-h * 9.0) * (0.55 + 0.45 * max(-vDir.x, 0.0));
            col += vec3(0.5, 0.26, 0.16) * glow * 0.55;
            vec3 cell = floor(vDir * 260.0);
            float star = step(0.9985, hash(cell)) * smoothstep(0.15, 0.5, h);
            col += star * 0.8;
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  return (
    <mesh material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[150, 32, 16]} />
    </mesh>
  )
}

function Daylight({ shadowSize }: { shadowSize: number }) {
  const sun = useShadowFrustum()
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
