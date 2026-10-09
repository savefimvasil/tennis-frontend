import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { rng } from './textures'
import { SUN_DIR } from './Lighting'
import { COAST_X } from './Court'

// Everything far away: a hillside town behind the club, a bay on the sun side and a layer
// of drifting clouds. All procedural and instanced: a handful of draw calls in total.

// ------------------------------------------------------------------ terrain

/** Height of the hillside rising behind the club (metres), zero within ~95 m. */
function hillHeight(x: number, z: number) {
  const r = Math.hypot(x, z)
  const ang = Math.atan2(z, x)
  // Strongest behind the club (-z), fading toward the bay (+x).
  const behind = Math.max(0, -Math.sin(ang)) * 0.75 + Math.max(0, -Math.cos(ang)) * 0.45
  const rise = Math.max(0, r - 95) * 0.16 * Math.min(1, behind)
  const ripple = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 6 + Math.sin(x * 0.05 + z * 0.03) * 2.5
  return rise > 0 ? rise + ripple * Math.min(1, rise / 12) : 0
}

function Hillside() {
  const geo = useMemo(() => {
    const rings = 28
    const segs = 96
    const pos: number[] = []
    const col: number[] = []
    const idx: number[] = []
    const dry = new THREE.Color('#9a9258')
    const scrub = new THREE.Color('#5f6b3c')
    const r = rng(9)
    for (let i = 0; i <= rings; i++) {
      const radius = 90 + Math.pow(i / rings, 1.4) * 360
      for (let j = 0; j <= segs; j++) {
        // From the headland south of the bay, round behind the club, to the far side.
        const ang = -0.75 - (j / segs) * 3.75
        const x = Math.cos(ang) * radius
        const z = Math.sin(ang) * radius
        const y = hillHeight(x, z) - 0.05
        pos.push(x, y, z)
        const c = scrub.clone().lerp(dry, 0.35 + r() * 0.4 + Math.min(0.3, y / 120))
        col.push(c.r, c.g, c.b)
      }
    }
    for (let i = 0; i < rings; i++)
      for (let j = 0; j < segs; j++) {
        const a = i * (segs + 1) + j
        const b = a + segs + 1
        idx.push(a, b, a + 1, b, b + 1, a + 1)
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }, [])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh geometry={geo} receiveShadow={false}>
      <meshStandardMaterial vertexColors roughness={1} side={THREE.DoubleSide} />
    </mesh>
  )
}

// ------------------------------------------------------------------ town

/** Whitewashed facade with shuttered windows and a door, tiled per house. */
function facadeTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#f2ece0'
  g.fillRect(0, 0, 128, 128)
  const r = rng(5)
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `rgba(120,100,80,${r() * 0.06})`
    g.fillRect(r() * 128, r() * 128, 2, 2)
  }
  for (const [x, y, w, h] of [
    [18, 22, 22, 30],
    [88, 22, 22, 30],
    [18, 74, 22, 30],
    [56, 70, 18, 58],
    [88, 74, 22, 30],
  ]) {
    g.fillStyle = '#3a4048'
    g.fillRect(x, y, w, h)
    g.fillStyle = x === 56 ? '#6b4a30' : '#4f7a8c'
    if (x !== 56) {
      g.fillRect(x - 6, y, 6, h)
      g.fillRect(x + w, y, 6, h)
    } else g.fillRect(x, y, w, h)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

interface House {
  x: number
  y: number
  z: number
  w: number
  d: number
  h: number
  rot: number
  tint: number
}

function Town() {
  const walls = useRef<THREE.InstancedMesh>(null!)
  const roofs = useRef<THREE.InstancedMesh>(null!)
  const houses = useMemo(() => {
    const r = rng(2024)
    const list: House[] = []
    for (let tries = 0; list.length < 260 && tries < 4000; tries++) {
      const ang = -Math.PI / 2 + (r() - 0.5) * 2.2
      const dist = 165 + Math.pow(r(), 0.8) * 220
      const x = Math.cos(ang) * dist
      const z = Math.sin(ang) * dist
      // Villages cluster: thin out between them.
      // Nothing on the beach or in the bay, except up on the headland.
      if (x > COAST_X - 20 && hillHeight(x, z) < 4) continue
      const cluster = Math.sin(ang * 5.3) * 0.5 + Math.sin(dist * 0.03) * 0.5
      if (cluster < -0.2 && r() < 0.8) continue
      const w = 5 + r() * 6
      // Sit on the lowest corner, so the downhill side never floats.
      const reach = w * 0.7
      const y = Math.min(
        hillHeight(x - reach, z - reach),
        hillHeight(x + reach, z - reach),
        hillHeight(x - reach, z + reach),
        hillHeight(x + reach, z + reach),
      )
      list.push({
        x,
        y,
        z,
        w,
        d: 4.5 + r() * 5,
        h: 4.5 + r() * (r() < 0.2 ? 6 : 3),
        // Streets follow the contours: houses face the bay-ish.
        rot: ang + Math.PI / 2 + (r() - 0.5) * 0.4,
        tint: r(),
      })
    }
    return list
  }, [])
  const tex = useMemo(() => facadeTexture(), [])
  useEffect(() => () => tex.dispose(), [tex])
  const geos = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1)
    box.translate(0, 0.5, 0)
    // Hip roof: a four-sided pyramid squared to the walls.
    const roof = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1)
    roof.rotateY(Math.PI / 4)
    roof.translate(0, 0.5, 0)
    return { box, roof }
  }, [])
  useEffect(() => () => (geos.box.dispose(), geos.roof.dispose()), [geos])

  useLayoutEffect(() => {
    const m = new THREE.Object3D()
    const c = new THREE.Color()
    houses.forEach((h, i) => {
      // Walls run 4 m into the slope.
      m.position.set(h.x, h.y - 4, h.z)
      m.rotation.set(0, h.rot, 0)
      m.scale.set(h.w, h.h + 4, h.d)
      m.updateMatrix()
      walls.current.setMatrixAt(i, m.matrix)
      walls.current.setColorAt(i, c.setHSL(0.09 + h.tint * 0.03, 0.22 + h.tint * 0.3, 0.74 - h.tint * 0.12))
      m.position.y = h.y + h.h
      m.scale.set(h.w * 1.08, 1.6 + h.tint * 1.2, h.d * 1.08)
      m.updateMatrix()
      roofs.current.setMatrixAt(i, m.matrix)
      roofs.current.setColorAt(i, c.setHSL(0.03 + h.tint * 0.02, 0.55, 0.38 + h.tint * 0.08))
    })
    for (const im of [walls.current, roofs.current]) {
      im.instanceMatrix.needsUpdate = true
      im.instanceColor!.needsUpdate = true
      im.computeBoundingSphere()
    }
  }, [houses])

  return (
    <group>
      <instancedMesh ref={walls} args={[geos.box, undefined, houses.length]}>
        <meshStandardMaterial map={tex} roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={roofs} args={[geos.roof, undefined, houses.length]}>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </group>
  )
}

// ------------------------------------------------------------------ sea

const seaVertex = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`
const seaFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSun;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  // Cheap wave normal from a few travelling sines.
  vec3 waves(vec2 p) {
    float t = uTime;
    vec2 d = vec2(0.0);
    d += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.35 + t * 1.1) * 0.06;
    d += vec2(-0.5, 0.85) * cos(dot(p, vec2(-0.5, 0.85)) * 0.9 + t * 1.7) * 0.03;
    d += vec2(0.2, -0.98) * cos(dot(p, vec2(0.2, -0.98)) * 2.3 + t * 2.4) * 0.015;
    return normalize(vec3(-d.x, 1.0, -d.y));
  }
  void main() {
    vec3 n = waves(vWorld.xz);
    vec3 v = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - max(dot(n, v), 0.0), 5.0) * 0.9 + 0.04;
    vec3 r = reflect(-v, n);
    float glint = pow(max(dot(r, normalize(uSun)), 0.0), 220.0) * 6.0;
    vec3 col = mix(uDeep, uSky, fresnel) + vec3(1.0, 0.85, 0.65) * glint;
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`

function Sea() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: seaVertex,
        fragmentShader: seaFragment,
        fog: true,
        uniforms: {
          ...THREE.UniformsLib.fog,
          uTime: { value: 0 },
          uSun: { value: SUN_DIR.clone() },
          uDeep: { value: new THREE.Color('#1d4a5e') },
          uSky: { value: new THREE.Color('#b9cfe0') },
        },
      }),
    [],
  )
  useEffect(() => () => mat.dispose(), [mat])
  useFrame((s) => {
    mat.uniforms.uTime.value = s.clock.elapsedTime
  })
  // The bay opens on the sun side of the venue, beyond the stand and a strip of beach.
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[COAST_X + 360, -0.6, 140]} material={mat}>
        <planeGeometry args={[720, 1000]} />
      </mesh>
      <mesh position={[COAST_X + 7, -0.32, 140]} rotation={[-Math.PI / 2, -0.04, 0]}>
        <planeGeometry args={[16, 1000]} />
        <meshStandardMaterial color="#d8c7a2" roughness={1} />
      </mesh>
    </group>
  )
}

// ------------------------------------------------------------------ clouds

const cloudVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const cloudFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSun;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; }
    return s;
  }
  void main() {
    if (vDir.y < 0.015) discard;
    // Project the view direction onto a cloud deck, so clouds flatten toward the horizon.
    vec2 p = vDir.xz / (vDir.y + 0.08) * 1.4 + vec2(uTime * 0.004, uTime * 0.0015);
    float d = fbm(p);
    float cover = smoothstep(0.52, 0.78, d);
    if (cover < 0.01) discard;
    // Lit from the sun side, darker bellies.
    float lit = 0.75 + 0.25 * clamp(dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(uSun.x, 0.0, uSun.z))), -1.0, 1.0);
    vec3 col = mix(vec3(0.72, 0.75, 0.8), vec3(1.0, 0.97, 0.92), smoothstep(0.55, 0.9, d)) * lit;
    float horizon = smoothstep(0.015, 0.12, vDir.y);
    gl_FragColor = vec4(col * 1.6, cover * horizon * 0.85);
  }
`

function CloudDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: cloudVertex,
        fragmentShader: cloudFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        uniforms: { uTime: { value: 0 }, uSun: { value: SUN_DIR.clone() } },
      }),
    [],
  )
  useEffect(() => () => mat.dispose(), [mat])
  useFrame((s) => {
    mat.uniforms.uTime.value = s.clock.elapsedTime
  })
  return (
    <mesh material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[950, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
    </mesh>
  )
}

export function Backdrop({ detail }: { detail: 'high' | 'medium' | 'low' }) {
  return (
    <group>
      <Hillside />
      <Town />
      <Sea />
      {detail !== 'low' && <CloudDome />}
    </group>
  )
}
