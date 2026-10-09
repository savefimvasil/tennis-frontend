import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { buildPosed, FEMALE_SKIN, MALE_SKIN, useAvatarAssets, type StillPose } from './athlete/posed'
import { useGame } from '../game/store'

// Spectators as impostors: the players' own Rocketbox avatars are rendered once, at load,
// into a sprite atlas (shirt colours x poses), and every seat is a camera-facing quad in a
// single instanced draw call. Seated people idle, clap or jump up to cheer after points.

const POSES: StillPose[] = ['sit', 'clapA', 'clapB', 'cheer']
/** Shirt colours for the male avatar (null = its own navy); the female avatar adds one more. */
const SHIRTS: (string | null)[] = [null, '#c6463f', '#f0c24b', '#3b7a57', '#e8e4dc', '#1e1e24', '#d97a3a', '#9a5ba8']
const VARIANTS = SHIRTS.length + 1

const CELL_W = 112
const CELL_H = 176
/** Metres covered by one sprite cell, and where the hips sit within it (from the bottom). */
const FRAME_H = 1.75
const FRAME_W = (FRAME_H * CELL_W) / CELL_H
const HIP_FROM_BOTTOM = 0.62

export interface CrowdAtlas {
  texture: THREE.Texture
  variants: number
  poses: number
}

/** Renders every variant in every pose into one texture. */
function bakeAtlas(
  gl: THREE.WebGLRenderer,
  male: ReturnType<typeof useAvatarAssets>,
  female: ReturnType<typeof useAvatarAssets>,
) {
  const W = CELL_W * VARIANTS
  const H = CELL_H * POSES.length
  const rt = new THREE.WebGLRenderTarget(W, H, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    colorSpace: THREE.SRGBColorSpace,
  })
  const scene = new THREE.Scene()
  // Late-afternoon light from over the camera's shoulder, like the court's sun.
  scene.add(new THREE.HemisphereLight('#dfe9f5', '#6b5c42', 1.6))
  const sun = new THREE.DirectionalLight('#ffe0b8', 2.4)
  sun.position.set(1.5, 3, 4)
  scene.add(sun)
  const cam = new THREE.OrthographicCamera(-FRAME_W / 2, FRAME_W / 2, FRAME_H, 0, 0.1, 20)

  const avatars = [buildPosed(male), buildPosed(female)]
  const prevTarget = gl.getRenderTarget()
  const prevClear = gl.getClearColor(new THREE.Color())
  const prevAlpha = gl.getClearAlpha()
  gl.setRenderTarget(rt)
  gl.setClearColor(0x000000, 0)
  gl.clear()
  for (let v = 0; v < VARIANTS; v++) {
    const isFemale = v === VARIANTS - 1
    const a = avatars[isFemale ? 1 : 0]
    a.shirt(isFemale ? null : SHIRTS[v])
    scene.add(a.scene)
    POSES.forEach((pose, row) => {
      a.pose(pose)
      // Frame the hips at a fixed height in every cell.
      const hip = a.scene.getObjectByName('Bip01_Pelvis')!.getWorldPosition(new THREE.Vector3())
      cam.position.set(hip.x, hip.y - HIP_FROM_BOTTOM, 6)
      cam.lookAt(hip.x, hip.y - HIP_FROM_BOTTOM, 0)
      cam.updateMatrixWorld()
      rt.viewport.set(v * CELL_W, row * CELL_H, CELL_W, CELL_H)
      rt.scissor.copy(rt.viewport)
      rt.scissorTest = true
      gl.setRenderTarget(rt)
      gl.render(scene, cam)
    })
    scene.remove(a.scene)
  }
  rt.scissorTest = false
  rt.viewport.set(0, 0, W, H)
  gl.setRenderTarget(prevTarget)
  gl.setClearColor(prevClear, prevAlpha)
  for (const a of avatars) a.dispose()
  return rt
}

// Both stands share one atlas, baked once per renderer.
const atlases = new WeakMap<THREE.WebGLRenderer, THREE.WebGLRenderTarget>()
function sharedAtlas(
  gl: THREE.WebGLRenderer,
  male: ReturnType<typeof useAvatarAssets>,
  female: ReturnType<typeof useAvatarAssets>,
) {
  let rt = atlases.get(gl)
  if (!rt) {
    rt = bakeAtlas(gl, male, female)
    atlases.set(gl, rt)
    if (import.meta.env.DEV) Object.assign(window, { __crowdAtlas: rt })
  }
  return rt
}

/** Crowd excitement, 0..1: jumps after a point and decays. */
const excite = { value: 0, lastToast: 0, t: -1 }

const vertexShader = /* glsl */ `
  attribute vec4 aSeat;      // seat world position (xyz), random seed (w)
  attribute vec4 aLook;      // variant, flip (0/1), shade, clap rate
  uniform float uTime;
  uniform float uExcite;
  uniform vec2 uFrame;       // metres per cell
  uniform float uHip;        // hip height inside the cell (m)
  uniform vec2 uGrid;        // variants, poses
  varying vec2 vUv;
  varying float vShade;

  float hash(float n) { return fract(sin(n * 91.345) * 43758.5453); }

  void main() {
    float seed = aSeat.w;
    // Pose: 0 sit, 1-2 clap, 3 cheer. Each spectator joins in above its own threshold.
    float pose = 0.0;
    float joins = hash(seed);
    if (uExcite > joins * 0.9) {
      bool cheer = uExcite > 0.55 && hash(seed + 3.1) < 0.4;
      pose = cheer ? 3.0 : (fract(uTime * aLook.w + seed) < 0.5 ? 1.0 : 2.0);
    }
    // Breathing bob, and a little hop when cheering.
    float bob = sin(uTime * 1.3 + seed * 6.28) * 0.012;
    if (pose > 2.5) bob += abs(sin(uTime * 5.0 + seed * 6.28)) * 0.07;

    // Cylindrical billboard: turn about the vertical axis to face the camera.
    vec3 centre = aSeat.xyz;
    vec3 toCam = cameraPosition - centre;
    toCam.y = 0.0;
    toCam = normalize(toCam);
    vec3 right = vec3(toCam.z, 0.0, -toCam.x);
    vec3 world = centre + right * (position.x * uFrame.x) + vec3(0.0, position.y * uFrame.y - uHip + bob, 0.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);

    float u = mix(uv.x, 1.0 - uv.x, aLook.y);
    vUv = vec2((aLook.x + u) / uGrid.x, (pose + uv.y) / uGrid.y);
    vShade = aLook.z;
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    vec4 c = texture2D(uAtlas, vUv);
    if (c.a < 0.5) discard;
    gl_FragColor = vec4(c.rgb * vShade, 1.0);
  }
`

export interface Seat {
  x: number
  /** Height of the bench top. */
  y: number
  z: number
}

/** One draw call of sprite spectators for a list of seats. */
export function Crowd({ seats, seed = 1 }: { seats: Seat[]; seed?: number }) {
  const gl = useThree((s) => s.gl)
  const male = useAvatarAssets(MALE_SKIN)
  const female = useAvatarAssets(FEMALE_SKIN)
  const atlas = useMemo(() => sharedAtlas(gl, male, female), [gl, male, female])

  const geometry = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry()
    const quad = new THREE.PlaneGeometry(1, 1)
    quad.translate(0, 0.5, 0)
    g.index = quad.index
    g.setAttribute('position', quad.attributes.position)
    g.setAttribute('uv', quad.attributes.uv)
    const seat = new Float32Array(seats.length * 4)
    const look = new Float32Array(seats.length * 4)
    let s = seed * 9301 + 49297
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280
    seats.forEach((p, i) => {
      seat.set([p.x, p.y + 0.02, p.z, rnd() * 100], i * 4)
      look.set([Math.floor(rnd() * VARIANTS), rnd() < 0.5 ? 0 : 1, 0.82 + rnd() * 0.22, 1.6 + rnd() * 1.4], i * 4)
    })
    g.setAttribute('aSeat', new THREE.InstancedBufferAttribute(seat, 4))
    g.setAttribute('aLook', new THREE.InstancedBufferAttribute(look, 4))
    g.instanceCount = seats.length
    // Bounds of the whole crowd, so the batch is culled only when the stand is off screen.
    g.boundingSphere = new THREE.Sphere()
    g.boundingSphere.setFromPoints(seats.map((p) => new THREE.Vector3(p.x, p.y + 0.6, p.z)))
    g.boundingSphere.radius += 2
    quad.dispose()
    return g
  }, [seats, seed])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uAtlas: { value: atlas.texture },
          uTime: { value: 0 },
          uExcite: { value: 0 },
          uFrame: { value: new THREE.Vector2(FRAME_W, FRAME_H) },
          uHip: { value: HIP_FROM_BOTTOM },
          uGrid: { value: new THREE.Vector2(VARIANTS, POSES.length) },
        },
      }),
    [atlas],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame((state, dt) => {
    // Shared by every stand: update once per frame.
    if (excite.t !== state.clock.elapsedTime) {
      excite.t = state.clock.elapsedTime
      updateExcitement(dt)
    }
    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uExcite.value = excite.value
  })

  return <mesh geometry={geometry} material={material} />
}

/** Points make the crowd react: bigger for aces, winners and games. */
function updateExcitement(dt: number) {
  {
    const toast = useGame.getState().toast
    if (toast && toast.id !== excite.lastToast) {
      excite.lastToast = toast.id
      const big = /ace|winner|game|set|match/i.test(`${toast.title} ${toast.detail ?? ''}`)
      excite.value = Math.max(excite.value, big ? 1 : 0.6)
    }
    excite.value = Math.max(0, excite.value - dt * 0.28)
  }
}
