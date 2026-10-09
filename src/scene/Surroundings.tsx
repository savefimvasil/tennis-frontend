import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { COURT } from '../game/constants'
import {
  barkTexture,
  chainLinkTexture,
  frondTexture,
  hedgeTexture,
  rng,
  windowsTexture,
  windscreenTexture,
} from './textures'

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
    <instancedMesh ref={ref} args={[undefined, undefined, points.length]} castShadow>
      <cylinderGeometry args={[0.045, 0.045, FH, 8]} />
      <meshStandardMaterial color="#2f3c35" metalness={0.6} roughness={0.4} />
    </instancedMesh>
  )
}

// ------------------------------------------------------------------ stands + crowd

const SHIRTS = [
  '#e8e4dc',
  '#2b4f7e',
  '#c6463f',
  '#f0c24b',
  '#3b7a57',
  '#1e1e24',
  '#d97a3a',
  '#7aa6d9',
  '#ffffff',
  '#9a5ba8',
]
const SKINS = ['#f1c9a5', '#d9a77f', '#b07c57', '#8d5a3b', '#5e3b25']

function Stand({ x, rows = 5, length = 22, facing }: { x: number; rows?: number; length?: number; facing: 1 | -1 }) {
  const bodies = useRef<THREE.InstancedMesh>(null!)
  const heads = useRef<THREE.InstancedMesh>(null!)
  const seats = useMemo(() => {
    const r = rng(Math.abs(x) * 13)
    const list: { x: number; y: number; z: number; phase: number; shirt: string; skin: string }[] = []
    for (let row = 0; row < rows; row++) {
      for (let s = 0; s < Math.floor(length / 0.62); s++) {
        if (r() < 0.22) continue
        list.push({
          x: x + facing * -row * 0.85,
          y: 0.42 * (row + 1),
          z: -length / 2 + s * 0.62 + 0.3 + (r() - 0.5) * 0.08,
          phase: r() * Math.PI * 2,
          shirt: SHIRTS[Math.floor(r() * SHIRTS.length)],
          skin: SKINS[Math.floor(r() * SKINS.length)],
        })
      }
    }
    return list
  }, [x, rows, length, facing])

  useLayoutEffect(() => {
    const c = new THREE.Color()
    seats.forEach((s, i) => {
      bodies.current.setColorAt(i, c.set(s.shirt))
      heads.current.setColorAt(i, c.set(s.skin))
    })
    bodies.current.instanceColor!.needsUpdate = true
    heads.current.instanceColor!.needsUpdate = true
  }, [seats])

  const frame = useRef(0)
  useFrame((state) => {
    // Update every other frame: cheap idle sway, bigger bounce on applause.
    if (frame.current++ % 2) return
    const t = state.clock.elapsedTime
    seats.forEach((s, i) => {
      const bob = Math.sin(t * 1.3 + s.phase) * 0.015
      dummy.position.set(s.x - facing * 0.1, s.y + 0.3 + bob, s.z)
      dummy.rotation.set(0, facing > 0 ? Math.PI / 2 : -Math.PI / 2, Math.sin(t * 0.7 + s.phase) * 0.05)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      bodies.current.setMatrixAt(i, dummy.matrix)
      dummy.position.y += 0.33
      dummy.updateMatrix()
      heads.current.setMatrixAt(i, dummy.matrix)
    })
    bodies.current.instanceMatrix.needsUpdate = true
    heads.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      {Array.from({ length: rows }, (_, row) => (
        <group key={row}>
          <mesh position={[x + facing * -row * 0.85, 0.21 * (row + 1), 0]} castShadow receiveShadow>
            <boxGeometry args={[0.85, 0.42 * (row + 1), length + 0.6]} />
            <meshStandardMaterial color={row % 2 ? '#c9c5bb' : '#d6d2c8'} roughness={0.9} />
          </mesh>
          <mesh position={[x + facing * -row * 0.85 + facing * 0.15, 0.42 * (row + 1) + 0.02, 0]} receiveShadow>
            <boxGeometry args={[0.38, 0.05, length]} />
            <meshStandardMaterial color="#2a5b8c" roughness={0.6} />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={bodies} args={[undefined, undefined, seats.length]} castShadow>
        <capsuleGeometry args={[0.17, 0.32, 4, 10]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, seats.length]} castShadow>
        <sphereGeometry args={[0.11, 12, 10]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
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
        <meshStandardMaterial map={bark} roughness={0.95} />
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
      <mesh position-y={6} castShadow>
        <cylinderGeometry args={[0.09, 0.14, 12, 10]} />
        <meshStandardMaterial color="#8a9096" metalness={0.7} roughness={0.35} />
      </mesh>
      <group position={[0, 12, 0.3]} rotation-x={0.5}>
        <mesh castShadow>
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
      {/* Umpire */}
      <mesh position={[0, 2.45, -0.05]} castShadow>
        <capsuleGeometry args={[0.18, 0.35, 4, 12]} />
        <meshStandardMaterial color="#26385a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.95, -0.05]} castShadow>
        <sphereGeometry args={[0.11, 16, 12]} />
        <meshStandardMaterial color="#c99a75" roughness={0.6} />
      </mesh>
      <mesh position={[0, 3.04, -0.05]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, 0.06, 16]} />
        <meshStandardMaterial color="#f2f2f2" roughness={0.6} />
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
          <meshPhysicalMaterial color="#9fd3ff" transmission={0.6} roughness={0.1} thickness={0.05} />
        </mesh>
      ))}
    </group>
  )
}

// ------------------------------------------------------------------ skyline + hills

function Skyline() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const buildings = useMemo(() => {
    const r = rng(1234)
    const list: { x: number; z: number; w: number; d: number; h: number }[] = []
    for (let i = 0; i < 70; i++) {
      const ang = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.15
      const dist = 240 + r() * 140
      list.push({
        x: Math.cos(ang) * dist,
        z: Math.sin(ang) * dist,
        w: 10 + r() * 18,
        d: 10 + r() * 18,
        h: 10 + Math.pow(r(), 3) * 55,
      })
    }
    return list
  }, [])
  useLayoutEffect(() => {
    const c = new THREE.Color()
    buildings.forEach((b, i) => {
      dummy.position.set(b.x, b.h / 2, b.z)
      dummy.rotation.set(0, (i * 0.37) % Math.PI, 0)
      dummy.scale.set(b.w, b.h, b.d)
      dummy.updateMatrix()
      ref.current.setMatrixAt(i, dummy.matrix)
      ref.current.setColorAt(i, c.setHSL(0.07 + (i % 5) * 0.015, 0.16, 0.5 + (i % 3) * 0.06))
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.instanceColor!.needsUpdate = true
  }, [buildings])
  const tex = useMemo(() => windowsTexture(), [])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, buildings.length]}>
      <boxGeometry />
      <meshStandardMaterial map={tex} roughness={0.5} metalness={0.2} />
    </instancedMesh>
  )
}

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

/** Clubhouse behind the far court: white stucco, terracotta roof, arched openings and a terrace. */
function Clubhouse() {
  const z = -FZ - 12
  const width = 34
  const arches = Array.from({ length: 9 }, (_, i) => -width / 2 + 3 + i * ((width - 6) / 8))
  const umbrellas = [-12, -6, 0, 6, 12]
  return (
    <group position={[0, 0, z]}>
      {/* Main block */}
      <mesh position={[0, 3.6, -2]} castShadow receiveShadow>
        <boxGeometry args={[width, 7.2, 8]} />
        <meshStandardMaterial color="#efe8dc" roughness={0.9} />
      </mesh>
      {/* Hip roof */}
      {/* Scale after the 45 degree turn so the pyramid stays square to the walls */}
      <group position={[0, 8.4, -2]} scale={[width * 0.74, 1, 8 * 0.74]}>
        <mesh rotation-y={Math.PI / 4} castShadow>
          <coneGeometry args={[1, 2.4, 4, 1]} />
          <meshStandardMaterial color="#b4582f" roughness={0.75} />
        </mesh>
      </group>
      {/* Arched openings facing the courts */}
      {arches.map((x) => (
        <group key={x} position={[x, 0, 2.02]}>
          <mesh position-y={1.6}>
            <planeGeometry args={[1.8, 3.2]} />
            <meshStandardMaterial color="#2b3238" roughness={0.3} metalness={0.4} />
          </mesh>
          <mesh position-y={3.2}>
            <circleGeometry args={[0.9, 20, 0, Math.PI]} />
            <meshStandardMaterial color="#2b3238" roughness={0.3} metalness={0.4} />
          </mesh>
          <mesh position-y={5.6}>
            <planeGeometry args={[1.4, 1.2]} />
            <meshStandardMaterial color="#3a4652" roughness={0.25} metalness={0.5} />
          </mesh>
        </group>
      ))}
      {/* Terrace with sun umbrellas */}
      <mesh position={[0, 0.2, 5]} receiveShadow castShadow>
        <boxGeometry args={[width, 0.4, 6]} />
        <meshStandardMaterial color="#d9cdb8" roughness={0.95} />
      </mesh>
      {umbrellas.map((x, i) => (
        <group key={x} position={[x, 0.4, 5]}>
          <mesh position-y={1.2} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 2.4, 6]} />
            <meshStandardMaterial color="#e9e4d8" />
          </mesh>
          <mesh position-y={2.45} castShadow>
            <coneGeometry args={[1.5, 0.6, 12, 1, true]} />
            <meshStandardMaterial color={i % 2 ? '#f3efe6' : '#2c5d8f'} side={THREE.DoubleSide} roughness={0.8} />
          </mesh>
          <mesh position-y={0.55} castShadow>
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
        <mesh key={i} position={[x, 0.7, z]} rotation-y={ry} castShadow receiveShadow>
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
      <Skyline />
      <Hills />
    </group>
  )
}
