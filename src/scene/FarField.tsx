import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Quality } from '../game/store'

// The far field (hills, groves, town, ridges, the bay, the lawn beyond ~100 m) never moves,
// and the camera only drifts a few metres around the court. Like a game's skybox or HLOD,
// it is rendered once into a panorama around the camera and then drawn every frame as one
// textured sphere, instead of re-rendering hundreds of thousands of vertices 60 times a
// second. The panorama is re-baked one sector per frame when the camera has moved far
// enough for parallax to show, and slowly refreshed otherwise (late-loading textures).

/** Objects on this layer are only seen by the bake camera. */
export const FAR_LAYER = 1

/** Panorama: 8 sectors of 45 degrees, from 15 degrees below the horizon to 20 above. */
const SECTORS = 8
const T_HALF = Math.tan(Math.PI / SECTORS)
const T_TOP = Math.tan((20 * Math.PI) / 180)
const T_BOTTOM = Math.tan((15 * Math.PI) / 180)
/** Re-bake when the camera has moved this far from the bake centre (m). */
const REBAKE_DISTANCE = 6
/** Background refresh: one sector every this many frames. */
const REFRESH_EVERY = 45

/** The near lawn ends at this radius (m); beyond it the baked lawn and hills take over. */
export const NEAR_RADIUS = 100

/** Octagon around the venue: the near lawn is clipped to it in the main view. */
export const NEAR_CLIP = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2
  return new THREE.Plane(new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a)), NEAR_RADIUS)
})

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    // The sphere follows the camera: object space is the view direction.
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uHalf;
  uniform float uTop;
  uniform float uBottom;
  uniform float uSectors;
  varying vec3 vDir;
  #include <common>
  void main() {
    vec3 d = normalize(vDir);
    float az = atan(d.x, d.z);
    if (az < 0.0) az += PI2;
    float sector = PI2 / uSectors;
    float k = floor(az / sector + 0.5);
    float local = az - k * sector;
    if (k >= uSectors) k -= uSectors;
    float horiz = max(length(d.xz), 1e-4);
    // Where this direction lands in the sector's perspective image.
    float x = tan(local) / uHalf;
    float y = (d.y / horiz) / cos(local);
    float v = (y + uBottom) / (uTop + uBottom);
    if (v < 0.0 || v > 1.0) discard;
    vec4 c = texture2D(uTex, vec2((k + x * 0.5 + 0.5) / uSectors, v));
    if (c.a < 0.004) discard;
    gl_FragColor = c;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const sectorWidth: Record<Quality, number> = { high: 1024, medium: 768, low: 512 }

/**
 * Wraps the far-field scenery. Its children are moved to FAR_LAYER, baked into the panorama
 * and shown through it. Near objects must not be children (they would freeze into the bake).
 */
export function FarField({ quality, children }: { quality: Quality; children: ReactNode }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const group = useRef<THREE.Group>(null!)
  const sphere = useRef<THREE.Mesh>(null!)

  const sw = sectorWidth[quality]
  const sh = Math.round((sw * (T_TOP + T_BOTTOM)) / (2 * T_HALF))
  const rt = useMemo(
    () =>
      new THREE.WebGLRenderTarget(sw * SECTORS, sh, {
        // Linear HDR, like the composer's buffers: tone mapping happens once, at the end.
        type: THREE.HalfFloatType,
        samples: quality === 'high' ? 4 : 0,
        generateMipmaps: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      }),
    [sw, sh, quality],
  )
  useEffect(() => () => rt.dispose(), [rt])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTex: { value: rt.texture },
          uHalf: { value: T_HALF },
          uTop: { value: T_TOP },
          uBottom: { value: T_BOTTOM },
          uSectors: { value: SECTORS },
        },
        side: THREE.BackSide,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        // Behind everything near (it sits at 1 km), so depth testing keeps it there.
        depthTest: true,
      }),
    [rt],
  )
  useEffect(() => () => material.dispose(), [material])

  const bakeCam = useMemo(() => {
    const c = new THREE.PerspectiveCamera()
    c.layers.set(FAR_LAYER)
    const near = 1
    const far = 1300
    // An off-centre frustum: more room above the horizon than below. Never call
    // updateProjectionMatrix on this camera, it would replace this.
    c.projectionMatrix.makePerspective(-T_HALF * near, T_HALF * near, T_TOP * near, -T_BOTTOM * near, near, far)
    c.projectionMatrixInverse.copy(c.projectionMatrix).invert()
    return c
  }, [])

  const state = useRef({
    center: new THREE.Vector3(Infinity, 0, 0),
    pending: [] as number[],
    frame: 0,
    next: 0,
    signature: '',
  })

  useEffect(() => {
    gl.localClippingEnabled = true
    // A new target starts empty: bake everything.
    state.current.center.set(Infinity, 0, 0)
  }, [gl, rt])

  const bake = (sector: number) => {
    const s = state.current
    // Late-mounted scenery (Suspense) joins the far layer here.
    group.current.traverse((o) => o.layers.set(FAR_LAYER))
    scene.traverse((o) => {
      if ((o as THREE.Light).isLight) o.layers.enable(FAR_LAYER)
      // The lawn spans both: clipped near the venue in the main view, whole in the bake.
      if (o.name === 'lawn') {
        o.layers.enable(FAR_LAYER)
        const m = (o as THREE.Mesh).material as THREE.Material
        if (m && m.clippingPlanes !== NEAR_CLIP) {
          m.clippingPlanes = NEAR_CLIP
          m.needsUpdate = true
        }
      }
    })
    const a = (sector / SECTORS) * Math.PI * 2
    bakeCam.position.copy(s.center)
    bakeCam.rotation.set(0, a + Math.PI, 0)
    bakeCam.updateMatrixWorld()

    const prev = {
      target: gl.getRenderTarget(),
      background: scene.background,
      shadows: gl.shadowMap.autoUpdate,
      clipping: gl.localClippingEnabled,
      clear: gl.getClearColor(new THREE.Color()),
      alpha: gl.getClearAlpha(),
    }
    scene.background = null
    gl.shadowMap.autoUpdate = false
    gl.localClippingEnabled = false
    rt.viewport.set(sector * sw, 0, sw, sh)
    rt.scissor.copy(rt.viewport)
    rt.scissorTest = true
    gl.setRenderTarget(rt)
    gl.setClearColor(0x000000, 0)
    gl.clear()
    gl.render(scene, bakeCam)
    rt.scissorTest = false
    gl.setRenderTarget(prev.target)
    gl.setClearColor(prev.clear, prev.alpha)
    scene.background = prev.background
    gl.shadowMap.autoUpdate = prev.shadows
    gl.localClippingEnabled = prev.clipping
  }

  useFrame(() => {
    const s = state.current
    sphere.current.position.copy(camera.position)
    s.frame++
    // Scenery that mounted or changed (quality switch, textures arriving) needs a full bake.
    if (s.frame % 30 === 0) {
      let n = 0
      group.current.traverse(() => n++)
      const sig = `${n}`
      if (sig !== s.signature) {
        s.signature = sig
        s.pending = [...Array(SECTORS).keys()]
      }
    }
    if (s.pending.length === 0) {
      if (camera.position.distanceTo(s.center) > REBAKE_DISTANCE) {
        s.center.copy(camera.position)
        // Start with the sector the camera faces.
        const dir = camera.getWorldDirection(new THREE.Vector3())
        const az = Math.atan2(dir.x, dir.z)
        const first = Math.round((((az + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * SECTORS) % SECTORS
        s.pending = [...Array(SECTORS).keys()].map((i) => (first + i) % SECTORS)
      } else if (s.frame % REFRESH_EVERY === 0) {
        s.pending = [s.next]
        s.next = (s.next + 1) % SECTORS
      }
    }
    if (s.pending.length) bake(s.pending.shift()!)
  })

  return (
    <>
      <group ref={group}>{children}</group>
      <mesh ref={sphere} material={material} renderOrder={-2} frustumCulled={false}>
        <sphereGeometry args={[1000, 48, 24]} />
      </mesh>
    </>
  )
}
