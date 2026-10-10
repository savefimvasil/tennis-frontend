import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { COURT } from '../game/constants'
import { PlayerBenches, SpectatorBench, treeBand } from './VenueParts'
import { Trees } from './Trees'
import { PbrMaterial, WithFallback } from './PbrMaterial'
import { glulam, membrane, planks as plankSet, repeated } from './proceduralMaterials'

// An indoor court under a timber gridshell: glulam lattice over a white membrane that lets
// the daylight through, a low wall of wood panels with a band of open windows onto a lawn and real trees, and
// arched end walls of translucent panels between timber mullions. Everything the camera can
// see is inside: no outdoor world to draw.

/** Inner wall faces sit just outside the ball's fence colliders. */
const WX = COURT.fenceX + 0.1
const WZ = COURT.fenceZ + 0.1
const PANEL_H = 1.1
const WINDOW_TOP = 3.0
/** The vault springs from the ring beam at this height. */
const SPRING = 3.5
/** Height of the vault's crown above the spring line. */
const RISE = 8.5
const R = (WX * WX + RISE * RISE) / (2 * RISE)
const CY = SPRING + RISE - R
const THETA = Math.asin(WX / R)
/** Arc length across the vault. */
const ARC = 2 * R * THETA

/** Point on the vault surface at arc length `s` (0 at the crown) and depth `z`. */
function vaultPoint(s: number, z: number, inset = 0, out = new THREE.Vector3()) {
  const phi = s / R
  const r = R - inset
  return out.set(r * Math.sin(phi), CY + r * Math.cos(phi), z)
}

// ------------------------------------------------------------------ vault

function vaultGeometry() {
  const nx = 64
  const nz = 24
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const p = new THREE.Vector3()
  for (let j = 0; j <= nz; j++) {
    const z = -WZ + (2 * WZ * j) / nz
    for (let i = 0; i <= nx; i++) {
      const s = -ARC / 2 + (ARC * i) / nx
      vaultPoint(s, z, 0, p)
      pos.push(p.x, p.y, p.z)
      uv.push(i / nx, j / nz)
    }
  }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i
      const b = a + nx + 1
      idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Straight timber members between points on the vault, as one instanced mesh. */
function latticeMembers() {
  const segs: [THREE.Vector3, THREE.Vector3, number][] = []
  const depth = 0.24
  const add = (s0: number, z0: number, s1: number, z1: number, w: number) => {
    const a = vaultPoint(s0, z0, depth / 2)
    const b = vaultPoint(s1, z1, depth / 2)
    segs.push([a, b, w])
  }
  const step = 2.3
  const dz = 1.15
  // Two diagonal families crossing at right angles in (arc, length): the diamond grid.
  for (const dir of [1, -1]) {
    for (let c = -ARC / 2 - 2 * WZ; c <= ARC / 2 + 2 * WZ; c += step) {
      for (let z = -WZ; z < WZ - 1e-6; z += dz) {
        const z1 = Math.min(WZ, z + dz)
        const s0 = c + dir * z
        const s1 = c + dir * z1
        if (Math.max(s0, s1) < -ARC / 2 || Math.min(s0, s1) > ARC / 2) continue
        const cl = (s: number) => Math.max(-ARC / 2, Math.min(ARC / 2, s))
        if (cl(s0) === cl(s1)) continue
        add(cl(s0), z, cl(s1), z1, 0.13)
      }
    }
  }
  // Purlins running the length of the hall.
  for (let s = -ARC / 2 + step; s < ARC / 2 - 0.5; s += step * 1.5)
    for (let z = -WZ; z < WZ - 1e-6; z += 2.4) add(s, z, s, Math.min(WZ, z + 2.4), 0.11)
  // Edge arches over both end walls, deeper than the lattice.
  for (const z of [-WZ + 0.12, WZ - 0.12]) {
    const n = 40
    for (let i = 0; i < n; i++) add(-ARC / 2 + (ARC * i) / n, z, -ARC / 2 + (ARC * (i + 1)) / n, z, 0.32)
  }
  return segs
}

function Vault() {
  const wood = useMemo(() => glulam(5), [])
  const cloth = useMemo(() => repeated(membrane(), 18, 22), [])
  const geo = useMemo(() => vaultGeometry(), [])
  useEffect(() => () => geo.dispose(), [geo])
  const members = useMemo(() => latticeMembers(), [])
  const lattice = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    const dir = new THREE.Vector3()
    const mid = new THREE.Vector3()
    const radial = new THREE.Vector3()
    const side = new THREE.Vector3()
    const m = new THREE.Matrix4()
    members.forEach(([a, b, w], i) => {
      dir.subVectors(b, a)
      const len = dir.length()
      dir.normalize()
      mid.addVectors(a, b).multiplyScalar(0.5)
      // Member axes: along the segment, across it on the surface, and radial (depth).
      radial.set(mid.x, mid.y - CY, 0).normalize()
      // A right-handed frame (a mirrored one would twist the members).
      side.crossVectors(dir, radial).normalize()
      radial.crossVectors(side, dir).normalize()
      m.makeBasis(dir, radial, side)
      o.quaternion.setFromRotationMatrix(m)
      o.position.copy(mid)
      o.scale.set(len + 0.02, w > 0.3 ? 0.42 : 0.24, w)
      o.updateMatrix()
      lattice.current.setMatrixAt(i, o.matrix)
    })
    lattice.current.instanceMatrix.needsUpdate = true
    lattice.current.computeBoundingSphere()
  }, [members])
  return (
    <group>
      {/* Daylight through the membrane: the ceiling glows softly. */}
      <mesh geometry={geo}>
        <meshStandardMaterial
          {...cloth}
          color="#f6f3ec"
          emissive="#fffaf0"
          emissiveIntensity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* The lattice casts its diamond shadow pattern onto the court. */}
      <instancedMesh ref={lattice} args={[undefined, undefined, members.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial {...wood} />
      </instancedMesh>
    </group>
  )
}

// ------------------------------------------------------------------ walls

/** One wall run: wood panels, a band of windows with mullions, and the ring beam over it. */
function WallRun({
  length,
  position,
  rotationY,
}: {
  length: number
  position: [number, number, number]
  rotationY: number
}) {
  const oak = useMemo(() => repeated(plankSet(8), length / 1.1, 1), [length])
  const beam = useMemo(() => repeated(glulam(4), length / 3, 1), [length])
  const mullions = useRef<THREE.InstancedMesh>(null!)
  const count = Math.floor(length / 1.8) + 1
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      o.position.set(-length / 2 + (i * length) / (count - 1), (PANEL_H + WINDOW_TOP) / 2, 0.06)
      o.updateMatrix()
      mullions.current.setMatrixAt(i, o.matrix)
    }
    mullions.current.instanceMatrix.needsUpdate = true
    mullions.current.computeBoundingSphere()
  }, [count, length])
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh position-y={PANEL_H / 2} receiveShadow>
        <planeGeometry args={[length, PANEL_H]} />
        <meshStandardMaterial {...oak} />
      </mesh>
      {/* Window sill */}
      <mesh position={[0, PANEL_H, 0.08]}>
        <boxGeometry args={[length, 0.06, 0.18]} />
        <meshStandardMaterial color="#c9c9c4" metalness={0.5} roughness={0.4} />
      </mesh>
      <instancedMesh ref={mullions} args={[undefined, undefined, count]}>
        <boxGeometry args={[0.08, WINDOW_TOP - PANEL_H, 0.1]} />
        <meshStandardMaterial color="#b9bcbe" metalness={0.6} roughness={0.35} />
      </instancedMesh>
      {/* Ring beam the vault springs from */}
      <mesh position={[0, (WINDOW_TOP + SPRING) / 2, 0.05]}>
        <boxGeometry args={[length, SPRING - WINDOW_TOP, 0.2]} />
        <meshStandardMaterial {...beam} />
      </mesh>
    </group>
  )
}

/** Arched end wall above the ring beam: translucent panels between timber mullions. */
function EndWall({ z }: { z: number }) {
  const facing = z < 0 ? 0 : Math.PI
  const panel = useMemo(() => repeated(membrane(), 0.5, 0.5), [])
  const geo = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-WX, SPRING)
    for (let i = 0; i <= 48; i++) {
      const p = vaultPoint(-ARC / 2 + (ARC * i) / 48, 0)
      shape.lineTo(p.x, p.y)
    }
    shape.lineTo(-WX, SPRING)
    return new THREE.ShapeGeometry(shape, 24)
  }, [])
  useEffect(() => () => geo.dispose(), [geo])
  const posts = useRef<THREE.InstancedMesh>(null!)
  const xs = useMemo(() => {
    const list: number[] = []
    for (let x = -WX + 2.6; x < WX - 1; x += 2.6) list.push(x)
    return list
  }, [])
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    xs.forEach((x, i) => {
      // Up to the arch at this x.
      const top = CY + Math.sqrt(R * R - x * x)
      o.position.set(x, (SPRING + top) / 2, 0.08)
      o.scale.set(1, top - SPRING, 1)
      o.updateMatrix()
      posts.current.setMatrixAt(i, o.matrix)
    })
    // Transom across the panels.
    const tx = Math.sqrt(R * R - (SPRING + 3.2 - CY) ** 2)
    o.position.set(0, SPRING + 3.2, 0.08)
    o.scale.set((tx * 2) / 0.16, 0.16 / 1, 1)
    o.updateMatrix()
    posts.current.setMatrixAt(xs.length, o.matrix)
    posts.current.instanceMatrix.needsUpdate = true
    posts.current.computeBoundingSphere()
  }, [xs])
  return (
    <group position-z={z} rotation-y={facing}>
      <mesh geometry={geo}>
        <meshStandardMaterial {...panel} color="#f8f6f0" emissive="#fffbf2" emissiveIntensity={0.7} />
      </mesh>
      <instancedMesh ref={posts} args={[undefined, undefined, xs.length + 1]} castShadow>
        <boxGeometry args={[0.16, 1, 0.16]} />
        <meshStandardMaterial {...glulam(3)} />
      </instancedMesh>
    </group>
  )
}

// ------------------------------------------------------------------ hall

export function Hall({ detail }: { detail: 'high' | 'medium' | 'low' }) {
  const trees = useMemo(() => treeBand(51, detail === 'low' ? 10 : 14, 2.5, 12, [6, 9]), [detail])
  const conifers = useMemo(() => treeBand(52, detail === 'low' ? 3 : 4, 10, 20, [11, 15]), [detail])
  return (
    <group>
      <Vault />
      <WallRun length={WZ * 2} position={[WX, 0, 0]} rotationY={-Math.PI / 2} />
      <WallRun length={WZ * 2} position={[-WX, 0, 0]} rotationY={Math.PI / 2} />
      <WallRun length={WX * 2} position={[0, 0, -WZ]} rotationY={0} />
      <WallRun length={WX * 2} position={[0, 0, WZ]} rotationY={Math.PI} />
      {/* Outside the windows: a lawn and a ring of trees under the real sky. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.03}>
        <planeGeometry args={[(WX + 24) * 2, (WZ + 24) * 2]} />
        <WithFallback fallback={<meshStandardMaterial color="#6f9a4c" roughness={1} />}>
          <PbrMaterial set="court/grass" repeat={[(WX + 24) / 1.1, (WZ + 24) / 1.1]} color="#7aa357" roughness={1} />
        </WithFallback>
      </mesh>
      <Trees kind="round" spots={trees} seed={5} />
      <Trees kind="conifer" spots={conifers} seed={6} />
      <EndWall z={-WZ} />
      <EndWall z={WZ} />
      <PlayerBenches />
      <SpectatorBench x={WX - 1.0} count={detail === 'low' ? 6 : 10} />
    </group>
  )
}
