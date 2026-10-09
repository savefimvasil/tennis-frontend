import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { COURT } from '../game/constants'
import {
  barkTexture,
  chainLinkTexture,
  facadeTexture,
  frondTexture,
  hedgeTexture,
  rng,
  windscreenTexture,
} from './textures'
import { PbrMaterial, WithFallback } from './PbrMaterial'
import { metreUvs } from './photoTextures'
import { Crowd, type Seat } from './Crowd'
import { Officials } from './Officials'
import { Backdrop } from './Backdrop'

const FX = COURT.fenceX
const FZ = COURT.fenceZ
const FH = COURT.fenceHeight
const WIND_H = 1.9

const dummy = new THREE.Object3D()

// ------------------------------------------------------------------ fence

function FenceSide({
  length,
  position,
  rotationY,
}: {
  length: number
  position: [number, number, number]
  rotationY: number
}) {
  const chain = useMemo(() => {
    const t = chainLinkTexture().clone()
    t.repeat.set(length / 0.07, FH / 0.07)
    t.needsUpdate = true
    return t
  }, [length])
  const wind = useMemo(() => {
    const t = windscreenTexture('VESPER BAY TENNIS CLUB').clone()
    t.repeat.set(Math.max(1, Math.round(length / 12)), 1)
    t.needsUpdate = true
    return t
  }, [length])
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh position-y={FH / 2}>
        <planeGeometry args={[length, FH]} />
        <meshStandardMaterial
          color="#26332d"
          alphaMap={chain}
          alphaTest={0.5}
          side={THREE.DoubleSide}
          metalness={0.4}
          roughness={0.6}
        />
      </mesh>
      <mesh position={[0, WIND_H / 2 + 0.05, 0.02]} receiveShadow>
        <planeGeometry args={[length, WIND_H]} />
        <meshStandardMaterial map={wind} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {/* Top rail */}
      <mesh position-y={FH} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.03, 0.03, length, 8]} />
        <meshStandardMaterial color="#2f3c35" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  )
}

function FencePosts() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const points = useMemo(() => {
    const pts: [number, number][] = []
    for (let x = -FX; x <= FX + 0.01; x += 3) {
      pts.push([x, FZ], [x, -FZ])
    }
    for (let z = -FZ + 3; z < FZ - 0.01; z += 3) {
      pts.push([FX, z], [-FX, z])
    }
    return pts
  }, [])
  useLayoutEffect(() => {
    points.forEach(([x, z], i) => {
      dummy.position.set(x, FH / 2, z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      ref.current.setMatrixAt(i, dummy.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [points])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, points.length]}>
      <cylinderGeometry args={[0.045, 0.045, FH, 8]} />
      <meshStandardMaterial color="#2f3c35" metalness={0.6} roughness={0.4} />
    </instancedMesh>
  )
}

// ------------------------------------------------------------------ stands + crowd

function Stand({ x, rows = 5, length = 22, facing }: { x: number; rows?: number; length?: number; facing: 1 | -1 }) {
  const seats = useMemo(() => {
    const r = rng(Math.abs(x) * 13)
    const list: Seat[] = []
    for (let row = 0; row < rows; row++) {
      for (let s = 0; s < Math.floor(length / 0.62); s++) {
        if (r() < 0.18) continue
        list.push({
          // Sat on the back half of the bench, toward the court.
          x: x + facing * -row * 0.85 + facing * 0.08,
          y: 0.42 * (row + 1) + 0.045,
          z: -length / 2 + s * 0.62 + 0.3 + (r() - 0.5) * 0.1,
        })
      }
    }
    return list
  }, [x, rows, length, facing])

  const tiers = useMemo(() => {
    const steps: THREE.BufferGeometry[] = []
    const seatsGeo: THREE.BufferGeometry[] = []
    const tint = [new THREE.Color('#d6d2c8'), new THREE.Color('#c9c5bb')]
    for (let row = 0; row < rows; row++) {
      const step = new THREE.BoxGeometry(0.85, 0.42 * (row + 1), length + 0.6)
      step.translate(x + facing * -row * 0.85, 0.21 * (row + 1), 0)
      metreUvs(step)
      const c = tint[row % 2]
      const colors = new Float32Array(step.attributes.position.count * 3)
      for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i)
      step.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      steps.push(step)
      const seat = new THREE.BoxGeometry(0.38, 0.05, length)
      seat.translate(x + facing * -row * 0.85 + facing * 0.15, 0.42 * (row + 1) + 0.02, 0)
      seatsGeo.push(seat)
    }
    return { steps: mergeGeometries(steps), seats: mergeGeometries(seatsGeo) }
  }, [x, rows, length, facing])

  return (
    <group>
      {/* Tiers and seat benches merged into two meshes per stand */}
      <mesh geometry={tiers.steps} receiveShadow>
        <WithFallback fallback={<meshStandardMaterial vertexColors roughness={0.9} />}>
          <PbrMaterial
            set="venue/concrete"
            repeat={[1 / 2.2, 1 / 2.2]}
            vertexColors
            roughness={1.7}
            normalScale={0.8}
          />
        </WithFallback>
      </mesh>
      <mesh geometry={tiers.seats} receiveShadow>
        <meshStandardMaterial color="#2a5b8c" roughness={0.6} />
      </mesh>
      {/* Spectators: sprite impostors of the real avatars, one draw call per stand. */}
      <Suspense fallback={null}>
        <Crowd seats={seats} seed={Math.abs(x)} />
      </Suspense>
    </group>
  )
}

// ------------------------------------------------------------------ palms

function palmGeometries() {
  // Trunk: a gently curved, tapering tube.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.25, 3, 0.1),
    new THREE.Vector3(0.7, 6.5, 0.2),
    new THREE.Vector3(0.9, 9.5, 0.25),
  ])
  const trunk = new THREE.TubeGeometry(curve, 24, 0.2, 10, false)
  const pos = trunk.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    // Taper: pull vertices toward the curve as height increases.
    const y = pos.getY(i)
    const p = curve.getPointAt(Math.max(0, Math.min(1, y / 9.5)))
    const k = 1.25 - (y / 9.6) * 0.55
    pos.setX(i, p.x + (pos.getX(i) - p.x) * k)
    pos.setZ(i, p.z + (pos.getZ(i) - p.z) * k)
  }
  trunk.computeVertexNormals()
  // Tube UVs run (along, around); the bark photo runs (around, along). One tile wraps the
  // trunk once; along the trunk it keeps the photo's aspect.
  const uv = trunk.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i) * 7.5)

  const top = curve.getPointAt(1)
  const fronds: THREE.BufferGeometry[] = []
  const count = 11
  for (let i = 0; i < count; i++) {
    const g = new THREE.PlaneGeometry(1.3, 4.4, 1, 10)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let v = 0; v < p.count; v++) {
      // Lay the frond out along +z and droop it downward with distance.
      const along = (p.getY(v) + 2.2) / 4.4
      const across = p.getX(v)
      p.setXYZ(v, across, -along * along * 2.2 + along * 0.9 - Math.abs(across) * 0.25, along * 4.4)
    }
    g.computeVertexNormals()
    g.rotateY((i / count) * Math.PI * 2 + (i % 2) * 0.2)
    g.translate(top.x, top.y, top.z)
    fronds.push(g)
  }
  return { trunk, fronds: mergeGeometries(fronds) }
}

function Palms() {
  const trunkRef = useRef<THREE.InstancedMesh>(null!)
  const frondRef = useRef<THREE.InstancedMesh>(null!)
  const geo = useMemo(palmGeometries, [])
  const spots = useMemo(() => {
    const r = rng(99)
    const list: { x: number; z: number; s: number; ry: number }[] = []
    const ring = [
      [-16, -23.6],
      [-6, -23.8],
      [7, -23.6],
      [17, -23.7],
      [-24, -14],
      [-23, 2],
      [-24, 16],
      [24, -12],
      [25, 4],
      [23, 18],
      [-14, 27],
      [0, 28],
      [13, 27.5],
      [-34, -30],
      [34, -32],
      [-40, 8],
      [42, 12],
      [-30, 34],
      [30, 36],
    ]
    for (const [x, z] of ring)
      list.push({ x: x + (r() - 0.5) * 3, z: z + (r() - 0.5) * 3, s: 0.85 + r() * 0.5, ry: r() * Math.PI * 2 })
    return list
  }, [])
  useLayoutEffect(() => {
    spots.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z)
      dummy.rotation.set(0, p.ry, 0)
      dummy.scale.setScalar(p.s)
      dummy.updateMatrix()
      trunkRef.current.setMatrixAt(i, dummy.matrix)
      frondRef.current.setMatrixAt(i, dummy.matrix)
    })
    trunkRef.current.instanceMatrix.needsUpdate = true
    frondRef.current.instanceMatrix.needsUpdate = true
  }, [spots])
  const bark = useMemo(() => barkTexture(), [])
  const frond = useMemo(() => frondTexture(), [])
  return (
    <group>
      <instancedMesh ref={trunkRef} args={[geo.trunk, undefined, spots.length]} castShadow>
        <WithFallback fallback={<meshStandardMaterial map={bark} roughness={0.95} />}>
          <PbrMaterial set="venue/bark" repeat={[1, 1]} color="#d8cbb8" />
        </WithFallback>
      </instancedMesh>
      <instancedMesh ref={frondRef} args={[geo.fronds, undefined, spots.length]} castShadow>
        <meshStandardMaterial map={frond} alphaTest={0.45} side={THREE.DoubleSide} roughness={0.8} />
      </instancedMesh>
    </group>
  )
}

// ------------------------------------------------------------------ light poles, chair, benches

function LightPole({ x, z }: { x: number; z: number }) {
  const facing = Math.atan2(-x, -z)
  return (
    <group position={[x, 0, z]} rotation-y={facing}>
      <mesh position-y={6}>
        <cylinderGeometry args={[0.09, 0.14, 12, 10]} />
        <meshStandardMaterial color="#8a9096" metalness={0.7} roughness={0.35} />
      </mesh>
      <group position={[0, 12, 0.3]} rotation-x={0.5}>
        <mesh>
          <boxGeometry args={[1.6, 0.6, 0.25]} />
          <meshStandardMaterial color="#5d646b" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position-z={0.13}>
          <planeGeometry args={[1.45, 0.48]} />
          <meshStandardMaterial color="#fff6e0" emissive="#fff1cc" emissiveIntensity={0.6} />
        </mesh>
      </group>
    </group>
  )
}

function UmpireChair() {
  const x = -(COURT.netPostX + 1.1)
  return (
    <group position={[x, 0, 0]} rotation-y={Math.PI / 2}>
      {[
        [-0.35, -0.35],
        [0.35, -0.35],
        [-0.35, 0.35],
        [0.35, 0.35],
      ].map(([a, b], i) => (
        <mesh key={i} position={[a, 1, b]} castShadow>
          <cylinderGeometry args={[0.03, 0.04, 2, 8]} />
          <meshStandardMaterial color="#e9e9e4" roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 2.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.06, 0.9]} />
        <meshStandardMaterial color="#1f4a3a" roughness={0.6} />
      </mesh>
      <mesh position={[0, 2.35, -0.3]} castShadow>
        <boxGeometry args={[0.6, 0.6, 0.06]} />
        <meshStandardMaterial color="#1f4a3a" roughness={0.6} />
      </mesh>
      <mesh position={[0, 2.3, 0.42]} castShadow>
        <boxGeometry args={[0.9, 0.5, 0.04]} />
        <meshStandardMaterial color="#1f4a3a" roughness={0.6} />
      </mesh>
    </group>
  )
}

function Bench({ z }: { z: number }) {
  const x = -(COURT.netPostX + 2.6)
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={0.45} castShadow receiveShadow>
        <boxGeometry args={[0.55, 0.08, 1.8]} />
        <meshStandardMaterial color="#2a5b8c" roughness={0.6} />
      </mesh>
      <mesh position={[-0.25, 0.8, 0]} castShadow>
        <boxGeometry args={[0.06, 0.6, 1.8]} />
        <meshStandardMaterial color="#2a5b8c" roughness={0.6} />
      </mesh>
      {[-0.75, 0.75].map((dz) => (
        <mesh key={dz} position={[0, 0.22, dz]} castShadow>
          <boxGeometry args={[0.5, 0.44, 0.05]} />
          <meshStandardMaterial color="#b7bcc2" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {/* Towel and drinks */}
      <mesh position={[0.05, 0.5, -0.4]} castShadow>
        <boxGeometry args={[0.35, 0.03, 0.5]} />
        <meshStandardMaterial color="#f5f5f0" roughness={1} />
      </mesh>
      {[0.2, 0.32].map((dz) => (
        <mesh key={dz} position={[0.1, 0.6, dz]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.22, 10]} />
          {/* Plain translucency: a transmission material would re-render the whole scene every frame */}
          <meshStandardMaterial color="#9fd3ff" transparent opacity={0.6} roughness={0.15} />
        </mesh>
      ))}
    </group>
  )
}

// ------------------------------------------------------------------ skyline + hills

/** Distant chaparral ridgeline: a jagged strip that the fog turns into layered haze. */
function Hills() {
  const geo = useMemo(() => {
    const r = rng(77)
    const layers: THREE.BufferGeometry[] = []
    for (let layer = 0; layer < 2; layer++) {
      const dist = 420 + layer * 110
      const segs = 90
      const g = new THREE.PlaneGeometry(1, 1, segs, 1)
      const pos = g.attributes.position as THREE.BufferAttribute
      let h = 30
      const heights: number[] = []
      for (let i = 0; i <= segs; i++) {
        h = Math.max(12, Math.min(75 + layer * 25, h + (r() - 0.48) * 14))
        heights.push(h)
      }
      for (let i = 0; i < pos.count; i++) {
        const col = Math.round((pos.getX(i) + 0.5) * segs)
        const ang = -Math.PI / 2 + (col / segs - 0.5) * Math.PI * 1.5
        const top = pos.getY(i) > 0
        pos.setXYZ(i, Math.cos(ang) * dist, top ? heights[col] : -5, Math.sin(ang) * dist)
      }
      g.computeVertexNormals()
      layers.push(g)
    }
    return mergeGeometries(layers)
  }, [])
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#56603f" roughness={1} side={THREE.DoubleSide} />
    </mesh>
  )
}

/**
 * Hip roof over a `width` x `depth` block, apex `height` above the eaves. UVs in metres:
 * across along the eave, down the slope, so the tile rows stay level on every face.
 */
function roofGeometry(width: number, depth: number, height: number) {
  // A four-sided cone turned 45 degrees and scaled: the pyramid stays square to the walls.
  const g = new THREE.ConeGeometry(1, height, 4, 1, true).toNonIndexed()
  g.rotateY(Math.PI / 4)
  g.scale(width * 0.74, 1, depth * 0.74)
  g.computeVertexNormals()
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const nx = nor.getX(i)
    const nz = nor.getZ(i)
    // Distance down the slope from the apex: height drop over the sine of the pitch.
    const slope = Math.hypot(nx, nz) || 1
    uv.setXY(i, Math.abs(nz) > Math.abs(nx) ? pos.getX(i) : pos.getZ(i), (height / 2 - pos.getY(i)) / slope)
  }
  return g
}

const ROOF_TILE = 3
const STUCCO_TILE = 2.5

/** Clubhouse behind the far court: white stucco, terracotta roof, arched openings and a terrace. */
function Clubhouse() {
  const z = -FZ - 12
  const width = 34
  const facade = useMemo(() => facadeTexture(9), [])
  const geo = useMemo(
    () => ({
      walls: metreUvs(new THREE.BoxGeometry(width, 7.2, 8).translate(0, 3.6, -2)),
      roof: roofGeometry(width, 8, 2.4).translate(0, 8.4, -2),
      terrace: metreUvs(new THREE.BoxGeometry(width, 0.4, 6).translate(0, 0.2, 5)),
    }),
    [],
  )
  const umbrellas = [-12, -6, 0, 6, 12]
  return (
    <group position={[0, 0, z]}>
      {/* Main block */}
      <mesh geometry={geo.walls} receiveShadow>
        <WithFallback fallback={<meshStandardMaterial color="#efe8dc" roughness={0.9} />}>
          <PbrMaterial set="venue/stucco" repeat={[1 / STUCCO_TILE, 1 / STUCCO_TILE]} color="#f4ece0" />
        </WithFallback>
      </mesh>
      {/* Hip roof */}
      <mesh geometry={geo.roof}>
        <WithFallback fallback={<meshStandardMaterial color="#b4582f" roughness={0.75} />}>
          <PbrMaterial set="venue/roof" repeat={[1 / ROOF_TILE, 1 / ROOF_TILE]} />
        </WithFallback>
      </mesh>
      {/* Arched openings painted on one facade texture: one draw call instead of 27. The wall
          between them is transparent, so the stucco of the block shows through. */}
      <mesh position={[0, 3.6, 2.01]}>
        <planeGeometry args={[width, 7.2]} />
        <meshStandardMaterial map={facade} alphaTest={0.5} roughness={0.85} />
      </mesh>
      {/* Terrace with sun umbrellas */}
      <mesh geometry={geo.terrace} receiveShadow>
        <WithFallback fallback={<meshStandardMaterial color="#d9cdb8" roughness={0.95} />}>
          <PbrMaterial set="venue/paving" repeat={[1 / 2.8, 1 / 2.8]} roughness={1.1} />
        </WithFallback>
      </mesh>
      {umbrellas.map((x, i) => (
        <group key={x} position={[x, 0.4, 5]}>
          <mesh position-y={1.2}>
            <cylinderGeometry args={[0.04, 0.04, 2.4, 6]} />
            <meshStandardMaterial color="#e9e4d8" />
          </mesh>
          <mesh position-y={2.45}>
            <coneGeometry args={[1.5, 0.6, 12, 1, true]} />
            <meshStandardMaterial color={i % 2 ? '#f3efe6' : '#2c5d8f'} side={THREE.DoubleSide} roughness={0.8} />
          </mesh>
          <mesh position-y={0.55}>
            <cylinderGeometry args={[0.5, 0.5, 0.05, 16]} />
            <meshStandardMaterial color="#f5f2ea" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Flowering hedges just outside the fence. */
function Hedges() {
  const tex = useMemo(() => hedgeTexture(), [])
  const rows: [number, number, number, number][] = [
    // x, z, length, rotationY
    [0, -FZ - 1.4, FX * 2 + 2, 0],
    [0, FZ + 1.4, FX * 2 + 2, 0],
  ]
  return (
    <group>
      {rows.map(([x, z, len, ry], i) => (
        <mesh key={i} position={[x, 0.7, z]} rotation-y={ry} receiveShadow>
          <boxGeometry args={[len, 1.4, 1.2]} />
          <meshStandardMaterial map={tex} roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

export function Surroundings({ detail }: { detail: 'high' | 'medium' | 'low' }) {
  return (
    <group>
      <FenceSide length={FX * 2} position={[0, 0, -FZ]} rotationY={0} />
      <FenceSide length={FX * 2} position={[0, 0, FZ]} rotationY={Math.PI} />
      <FenceSide length={FZ * 2} position={[FX, 0, 0]} rotationY={-Math.PI / 2} />
      <FenceSide length={FZ * 2} position={[-FX, 0, 0]} rotationY={Math.PI / 2} />
      <FencePosts />
      <UmpireChair />
      <Suspense fallback={null}>
        <Officials detail={detail} />
      </Suspense>
      <Bench z={-1.6} />
      <Bench z={1.6} />
      {[
        [-FX - 1.5, -FZ - 1.5],
        [FX + 1.5, -FZ - 1.5],
        [-FX - 1.5, FZ + 1.5],
        [FX + 1.5, FZ + 1.5],
      ].map(([x, z]) => (
        <LightPole key={`${x}${z}`} x={x} z={z} />
      ))}
      <Stand x={FX + 1.6} facing={-1} rows={detail === 'low' ? 3 : 7} length={32} />
      {detail !== 'low' && <Stand x={-FX - 1.6} facing={1} rows={5} length={26} />}
      <Palms />
      <Hedges />
      <Clubhouse />
      <Backdrop detail={detail} />
      <Hills />
    </group>
  )
}
