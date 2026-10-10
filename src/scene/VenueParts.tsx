import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { COURT } from '../game/constants'
import { chainLinkTexture, rng, windscreenTexture } from './textures'
import { Spectators, type SeatSpot } from './Spectators'
import { planks, repeated } from './proceduralMaterials'

// Pieces shared by the venues: the club fence, the players' benches and a bench of
// spectators along the side, and clumps of trees seen over the enclosure.

const FX = COURT.fenceX
const FZ = COURT.fenceZ
const dummy = new THREE.Object3D()

// ------------------------------------------------------------------ fence

function FenceSide({
  length,
  position,
  rotationY,
  height,
  screen,
  label,
}: {
  length: number
  position: [number, number, number]
  rotationY: number
  height: number
  screen: number
  label: string
}) {
  const chain = useMemo(() => {
    const t = chainLinkTexture().clone()
    t.repeat.set(length / 0.07, height / 0.07)
    t.needsUpdate = true
    return t
  }, [length, height])
  const wind = useMemo(() => {
    const t = windscreenTexture(label).clone()
    t.repeat.set(Math.max(1, Math.round(length / 12)), 1)
    t.needsUpdate = true
    return t
  }, [length, label])
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh position-y={height / 2}>
        <planeGeometry args={[length, height]} />
        <meshStandardMaterial
          color="#26332d"
          alphaMap={chain}
          alphaTest={0.5}
          alphaToCoverage
          side={THREE.DoubleSide}
          metalness={0.4}
          roughness={0.6}
        />
      </mesh>
      <mesh position={[0, screen / 2 + 0.05, 0.02]} receiveShadow>
        <planeGeometry args={[length, screen]} />
        <meshStandardMaterial map={wind} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh position-y={height} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.03, 0.03, length, 8]} />
        <meshStandardMaterial color="#2f3c35" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  )
}

/**
 * A club court's chain-link enclosure with a windscreen most of the way up: the court feels
 * like a room, and only the sky and tree tops show above it.
 */
export function ClubFence({ height = 3.8, screen = 3.0, label }: { height?: number; screen?: number; label: string }) {
  const posts = useRef<THREE.InstancedMesh>(null!)
  const points = useMemo(() => {
    const pts: [number, number][] = []
    for (let x = -FX; x <= FX + 0.01; x += 3) pts.push([x, FZ], [x, -FZ])
    for (let z = -FZ + 3; z < FZ - 0.01; z += 3) pts.push([FX, z], [-FX, z])
    return pts
  }, [])
  useLayoutEffect(() => {
    points.forEach(([x, z], i) => {
      dummy.position.set(x, height / 2, z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, height, 1)
      dummy.updateMatrix()
      posts.current.setMatrixAt(i, dummy.matrix)
    })
    posts.current.instanceMatrix.needsUpdate = true
    posts.current.computeBoundingSphere()
  }, [points, height])
  const side = { height, screen, label }
  return (
    <group>
      <FenceSide length={FX * 2} position={[0, 0, -FZ]} rotationY={0} {...side} />
      <FenceSide length={FX * 2} position={[0, 0, FZ]} rotationY={Math.PI} {...side} />
      <FenceSide length={FZ * 2} position={[FX, 0, 0]} rotationY={-Math.PI / 2} {...side} />
      <FenceSide length={FZ * 2} position={[-FX, 0, 0]} rotationY={Math.PI / 2} {...side} />
      <instancedMesh ref={posts} args={[undefined, undefined, points.length]}>
        <cylinderGeometry args={[0.045, 0.045, 1, 8]} />
        <meshStandardMaterial color="#2f3c35" metalness={0.6} roughness={0.4} />
      </instancedMesh>
    </group>
  )
}

// ------------------------------------------------------------------ benches and people

function PlayerBench({ z, color }: { z: number; color: string }) {
  const x = -(COURT.netPostX + 2.6)
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={0.45} castShadow receiveShadow>
        <boxGeometry args={[0.55, 0.08, 1.8]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[-0.25, 0.8, 0]} castShadow>
        <boxGeometry args={[0.06, 0.6, 1.8]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {[-0.75, 0.75].map((dz) => (
        <mesh key={dz} position={[0, 0.22, dz]} castShadow>
          <boxGeometry args={[0.5, 0.44, 0.05]} />
          <meshStandardMaterial color="#b7bcc2" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0.05, 0.5, -0.4]} castShadow>
        <boxGeometry args={[0.35, 0.03, 0.5]} />
        <meshStandardMaterial color="#f5f5f0" roughness={1} />
      </mesh>
      {[0.2, 0.32].map((dz) => (
        <mesh key={dz} position={[0.1, 0.6, dz]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.22, 10]} />
          <meshStandardMaterial color="#9fd3ff" transparent opacity={0.6} roughness={0.15} />
        </mesh>
      ))}
    </group>
  )
}

/** The two players' benches by the net post, on the left side of the court. */
export function PlayerBenches({ color = '#2a5b8c' }: { color?: string }) {
  return (
    <>
      <PlayerBench z={-1.6} color={color} />
      <PlayerBench z={1.6} color={color} />
    </>
  )
}

const SEAT_Y = 0.45
const BENCH_LEN = 11

/** A long bench along the right side with a few people watching (real posed avatars). */
export function SpectatorBench({
  x = FX - 0.9,
  wood = '#ffffff',
  count,
  seed = 11,
}: {
  x?: number
  wood?: string
  count: number
  seed?: number
}) {
  // Shoulder to shoulder in one group near the net, with a couple of seats left free.
  const seats = useMemo<SeatSpot[]>(() => {
    const pitch = 0.62
    const n = count + 2
    return Array.from({ length: n }, (_, i) => ({ x: x - 0.05, y: SEAT_Y, z: (i - (n - 1) / 2) * pitch }))
  }, [x, count])
  const top = useMemo(() => repeated(planks(4), 1, BENCH_LEN / 2.4), [])
  return (
    <group>
      <group position={[x, 0, 0]}>
        <mesh position-y={SEAT_Y - 0.03} castShadow receiveShadow>
          <boxGeometry args={[0.5, 0.06, BENCH_LEN]} />
          <meshStandardMaterial {...top} color={wood} />
        </mesh>
        {[-1, -0.5, 0, 0.5, 1].map((k) => (
          <mesh key={k} position={[0, (SEAT_Y - 0.06) / 2, (k * (BENCH_LEN - 0.4)) / 2]} castShadow>
            <boxGeometry args={[0.42, SEAT_Y - 0.06, 0.06]} />
            <meshStandardMaterial color="#6b6f73" metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
      </group>
      <Suspense fallback={null}>
        <Spectators spots={seats} count={count} yaw={-Math.PI / 2} seed={seed} gap={0} />
      </Suspense>
    </group>
  )
}

// ------------------------------------------------------------------ trees

export type TreeKind = 'round' | 'cypress' | 'pine'

export interface TreeSpot {
  x: number
  z: number
  /** Height (m). */
  h: number
}

/** Crown shapes (unit height, y up from the ground), smooth-shaded with a little irregularity. */
function crownGeometry(kind: TreeKind) {
  let g: THREE.BufferGeometry
  if (kind === 'cypress') {
    // A slim flame: widest a third of the way up, tapering to a soft point.
    g = new THREE.LatheGeometry(
      Array.from({ length: 12 }, (_, i) => {
        const t = i / 11
        const r = 0.17 * (t < 0.3 ? 0.78 + (t / 0.3) * 0.22 : Math.pow(1 - (t - 0.3) / 0.7, 0.75))
        return new THREE.Vector2(Math.max(0.001, r), 0.08 + t * 0.94)
      }),
      14,
    )
  } else if (kind === 'pine') {
    // Umbrella pine: a broad flat canopy.
    g = new THREE.SphereGeometry(0.5, 20, 10).scale(1, 0.32, 1).translate(0, 0.84, 0)
  } else {
    g = new THREE.SphereGeometry(0.42, 20, 14).translate(0, 0.66, 0)
  }
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g)
  const p = g.attributes.position as THREE.BufferAttribute
  const cy = kind === 'pine' ? 0.84 : kind === 'round' ? 0.66 : 0
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    // Low-frequency lumps so silhouettes read as foliage, not as a primitive.
    const n = Math.sin(x * 9 + y * 5) * Math.cos(z * 8 - y * 3) * (kind === 'cypress' ? 0.06 : 0.12)
    const k = 1 + n
    p.setXYZ(i, x * k, cy + (y - cy) * (kind === 'cypress' ? 1 : k), z * k)
  }
  g.computeVertexNormals()
  return g
}

const TREE_COLOURS: Record<TreeKind, [string, string]> = {
  round: ['#3f6b35', '#5d8a47'],
  cypress: ['#2b4526', '#3c5c32'],
  pine: ['#34512b', '#4b6b36'],
}

/** Where the crown starts (fraction of the height): the trunk shows below it. */
const CROWN_BASE: Record<TreeKind, number> = { round: 0.3, cypress: 0.08, pine: 0.7 }

/** Trees around the enclosure: crowns and trunks, one instanced mesh each. */
export function TreeClump({ kind, spots, seed = 3 }: { kind: TreeKind; spots: TreeSpot[]; seed?: number }) {
  const geo = useMemo(() => crownGeometry(kind), [kind])
  useEffect(() => () => geo.dispose(), [geo])
  const crowns = useRef<THREE.InstancedMesh>(null!)
  const trunks = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const r = rng(seed)
    const c = new THREE.Color()
    const [dark, light] = TREE_COLOURS[kind].map((h) => new THREE.Color(h))
    spots.forEach((s, i) => {
      const w = kind === 'cypress' ? 0.9 + r() * 0.2 : 0.8 + r() * 0.4
      const yaw = r() * Math.PI * 2
      dummy.position.set(s.x, 0, s.z)
      dummy.rotation.set(0, yaw, 0)
      dummy.scale.set(s.h * w, s.h, s.h * w)
      dummy.updateMatrix()
      crowns.current.setMatrixAt(i, dummy.matrix)
      crowns.current.setColorAt(i, c.copy(dark).lerp(light, r()))
      const trunkH = s.h * (CROWN_BASE[kind] + 0.05)
      dummy.position.set(s.x, trunkH / 2, s.z)
      dummy.rotation.set((r() - 0.5) * 0.1, yaw, (r() - 0.5) * 0.1)
      dummy.scale.set(s.h * 0.022, trunkH, s.h * 0.022)
      dummy.updateMatrix()
      trunks.current.setMatrixAt(i, dummy.matrix)
    })
    for (const m of [crowns.current, trunks.current]) {
      m.instanceMatrix.needsUpdate = true
      m.computeBoundingSphere()
    }
    crowns.current.instanceColor!.needsUpdate = true
  }, [spots, kind, seed])
  return (
    <group>
      <instancedMesh ref={crowns} args={[geo, undefined, spots.length]}>
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={trunks} args={[undefined, undefined, spots.length]}>
        <cylinderGeometry args={[0.7, 1, 1, 7]} />
        <meshStandardMaterial color="#5a4634" roughness={1} />
      </instancedMesh>
    </group>
  )
}

/** Tree positions in a band around the enclosure, `inner` to `outer` metres out from the court. */
export function treeBand(seed: number, count: number, inner: number, outer: number, h: [number, number]): TreeSpot[] {
  const r = rng(seed)
  const out: TreeSpot[] = []
  while (out.length < count) {
    const a = r() * Math.PI * 2
    const d = inner + r() * (outer - inner)
    // An ellipse following the court's long axis.
    const x = Math.cos(a) * (FX + d)
    const z = Math.sin(a) * (FZ + d)
    out.push({ x, z, h: h[0] + r() * (h[1] - h[0]) })
  }
  return out
}
