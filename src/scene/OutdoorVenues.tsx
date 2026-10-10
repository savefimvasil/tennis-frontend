import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { COURT } from '../game/constants'
import { canvasTexture, facadeTexture, hedgeTexture, rng } from './textures'
import { ClubFence, PlayerBenches, SpectatorBench, treeBand } from './VenueParts'
import { Trees } from './Trees'
import { PbrMaterial, WithFallback } from './PbrMaterial'
import { planks, repeated } from './proceduralMaterials'

// Two small outdoor venues, each closed in so there is no wide world to draw: the club fence
// and windscreen around the court, then a hedge or a wall a few metres out, and only the sky
// and tree tops beyond.

const FX = COURT.fenceX
const FZ = COURT.fenceZ
const LABEL = 'VESPER BAY TENNIS CLUB'
const dummy = new THREE.Object3D()

type Detail = 'high' | 'medium' | 'low'

/** Ground between the fence and the enclosure, photo-scanned and tinted. */
function Ground({ set, color, tile }: { set: 'court/grass' | 'venue/paving'; color: string; tile: number }) {
  const w = (FX + 12) * 2
  const d = (FZ + 12) * 2
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
      <planeGeometry args={[w, d]} />
      <WithFallback fallback={<meshStandardMaterial color={color} roughness={1} />}>
        <PbrMaterial set={set} repeat={[w / tile, d / tile]} color={color} roughness={1} />
      </WithFallback>
    </mesh>
  )
}

/** Four straight runs around the court, `gap` outside the fence. */
function Ring({
  gap,
  height,
  thickness,
  children,
}: {
  gap: number
  height: number
  thickness: number
  children: (len: number) => React.ReactNode
}) {
  const ax = FX + gap
  const az = FZ + gap
  const runs: { pos: [number, number, number]; rot: number; len: number }[] = [
    { pos: [0, height / 2, -az], rot: 0, len: ax * 2 + thickness },
    { pos: [0, height / 2, az], rot: Math.PI, len: ax * 2 + thickness },
    { pos: [ax, height / 2, 0], rot: -Math.PI / 2, len: az * 2 + thickness },
    { pos: [-ax, height / 2, 0], rot: Math.PI / 2, len: az * 2 + thickness },
  ]
  return (
    <>
      {runs.map((r, i) => (
        <group key={i} position={r.pos} rotation-y={r.rot}>
          {children(r.len)}
        </group>
      ))}
    </>
  )
}

// ------------------------------------------------------------------ grass: the garden court

const HEDGE_H = 4.4

/** A white weatherboard pavilion behind the far baseline: its roof and gable show over the screen. */
function Pavilion() {
  const z = -(FZ + 2.6)
  const boards = useMemo(() => repeated(planks(10, [0.95, 0.94, 0.9]), 6, 2), [])
  // Gable roof: a triangle across the depth, extruded along the width (overhanging a little).
  const gable = useMemo(() => {
    const t = new THREE.Shape()
    t.moveTo(-2.0, -0.05)
    t.lineTo(2.0, -0.05)
    t.lineTo(0, 1.7)
    t.closePath()
    return new THREE.ExtrudeGeometry(t, { depth: 9.6, bevelEnabled: false }).translate(0, 0, -0.1)
  }, [])
  useEffect(() => () => gable.dispose(), [gable])
  return (
    <group position={[0, 0, z]}>
      <mesh position-y={1.8} castShadow receiveShadow>
        <boxGeometry args={[9, 3.6, 3.4]} />
        <meshStandardMaterial {...boards} />
      </mesh>
      {/* Gable roof, dark green */}
      <mesh position={[-4.8, 3.6, 0]} rotation-y={Math.PI / 2} geometry={gable} castShadow>
        <meshStandardMaterial color="#2f4d3a" roughness={0.7} />
      </mesh>
      {/* Clock over the door, facing the court */}
      <mesh position={[0, 2.85, 1.72]}>
        <circleGeometry args={[0.45, 32]} />
        <meshStandardMaterial color="#f8f6f0" roughness={0.5} />
      </mesh>
      <mesh position={[0, 2.85, 1.71]}>
        <ringGeometry args={[0.45, 0.52, 32]} />
        <meshStandardMaterial color="#2f4d3a" roughness={0.5} />
      </mesh>
      {/* Cupola */}
      <mesh position-y={5.55} castShadow>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.8} />
      </mesh>
      <mesh position-y={6.3} rotation-y={Math.PI / 4} castShadow>
        <coneGeometry args={[0.7, 0.7, 4]} />
        <meshStandardMaterial color="#2f4d3a" roughness={0.7} flatShading />
      </mesh>
    </group>
  )
}

function Hedge({ len }: { len: number }) {
  const map = useMemo(() => {
    const t = hedgeTexture().clone()
    t.repeat.set(len / 3, HEDGE_H / 3)
    t.needsUpdate = true
    return t
  }, [len])
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[len, HEDGE_H, 1.4]} />
      <meshStandardMaterial map={map} color="#9fbf8a" roughness={1} />
    </mesh>
  )
}

/** Grass: a garden court. Fence and windscreen, a lawn, a tall clipped hedge, a pavilion, trees. */
export function GardenCourt({ detail }: { detail: Detail }) {
  const trees = useMemo(() => treeBand(31, detail === 'low' ? 18 : 32, 10, 24, [9, 13]), [detail])
  const pines = useMemo(() => treeBand(32, detail === 'low' ? 5 : 9, 14, 26, [11, 14]), [detail])
  return (
    <group>
      <ClubFence label={LABEL} />
      <Ground set="court/grass" color="#7aa357" tile={2.2} />
      <Ring gap={5} height={HEDGE_H} thickness={1.4}>
        {(len) => <Hedge len={len} />}
      </Ring>
      <Pavilion />
      <Trees kind="round" spots={trees} />
      <Trees kind="conifer" spots={pines} seed={8} />
      <PlayerBenches color="#2f4d3a" />
      <SpectatorBench count={detail === 'low' ? 6 : 10} wood="#e9e4d8" />
    </group>
  )
}

// ------------------------------------------------------------------ clay: the courtyard

const WALL_H = 5.6

function StuccoWall({ len }: { len: number }) {
  const facade = useMemo(() => {
    const t = facadeTexture(Math.max(3, Math.round(len / 4.5))).clone()
    t.needsUpdate = true
    return t
  }, [len])
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[len, WALL_H, 0.6]} />
        <WithFallback fallback={<meshStandardMaterial color="#e2b77c" roughness={0.95} />}>
          <PbrMaterial set="venue/stucco" repeat={[len / 2.5, WALL_H / 2.5]} color="#f0c48a" roughness={1} />
        </WithFallback>
      </mesh>
      {/* Arched doors and windows on the courtyard side */}
      <mesh position={[0, -0.4, 0.31]}>
        <planeGeometry args={[len - 1, WALL_H - 0.8]} />
        <meshStandardMaterial map={facade} transparent alphaTest={0.05} roughness={0.9} />
      </mesh>
      {/* Terracotta coping */}
      <mesh position-y={WALL_H / 2 + 0.08} castShadow>
        <boxGeometry args={[len + 0.2, 0.16, 0.8]} />
        <WithFallback fallback={<meshStandardMaterial color="#b4583a" roughness={0.8} />}>
          <PbrMaterial set="venue/roof" repeat={[len / 1.5, 1]} roughness={0.9} />
        </WithFallback>
      </mesh>
    </group>
  )
}

/**
 * A bougainvillea spray on a transparent card: a wiry stem, green leaves along it and
 * papery magenta bracts in clusters of three toward the tips.
 */
function sprayTexture() {
  return canvasTexture(256, 256, (g) => {
    const r = rng(91)
    g.clearRect(0, 0, 256, 256)
    const stems: [number, number][][] = []
    for (let k = 0; k < 5; k++) {
      // Stems droop from the top edge (the card hangs from the coping).
      const pts: [number, number][] = []
      let x = 60 + r() * 136
      let y = 0
      let dx = (r() - 0.5) * 2
      for (let i = 0; i < 12; i++) {
        pts.push([x, y])
        dx += (r() - 0.5) * 1.2
        x += dx * 6
        y += 16 + r() * 6
      }
      stems.push(pts)
      g.strokeStyle = '#4a3a22'
      g.lineWidth = 2
      g.beginPath()
      pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)))
      g.stroke()
    }
    const blob = (x: number, y: number, rx: number, ry: number, a: number, col: string) => {
      g.fillStyle = col
      g.beginPath()
      g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2)
      g.fill()
    }
    for (const pts of stems)
      pts.forEach(([x, y], i) => {
        // Leaves all along, bracts thicker toward the lower (outer) end.
        for (let k = 0; k < 2; k++) {
          const a = r() * Math.PI * 2
          const l = 0.6 + r() * 0.5
          blob(
            x + Math.cos(a) * 12,
            y + Math.sin(a) * 12,
            11 * l,
            6 * l,
            a,
            `hsl(${95 + r() * 25}, ${35 + r() * 20}%, ${22 + r() * 14}%)`,
          )
        }
        if (i > 2 && r() < 0.35 + i * 0.06)
          for (let c = 0; c < 2 + Math.floor(r() * 3); c++) {
            const cx = x + (r() - 0.5) * 40
            const cy = y + (r() - 0.5) * 30
            const hue = 318 + r() * 18
            for (let p = 0; p < 3; p++) {
              const a = (p / 3) * Math.PI * 2 + r()
              blob(
                cx + Math.cos(a) * 5,
                cy + Math.sin(a) * 5,
                7,
                5,
                a,
                `hsl(${hue}, ${70 + r() * 15}%, ${42 + r() * 16}%)`,
              )
            }
            blob(cx, cy, 2, 2, 0, '#f4ecc8')
          }
      })
  })
}

/** Bougainvillea spilling over the tops of the walls: hanging spray cards, one instanced mesh. */
function Bougainvillea({ count }: { count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const spots = useMemo(() => {
    const r = rng(77)
    const ax = FX + 4
    const az = FZ + 4
    const out: { x: number; y: number; z: number; s: number; alongZ: boolean }[] = []
    // Climbers in clumps: overlapping sprays hanging from the coping, longer in the middle.
    const clumps = Math.max(6, Math.round(count / 22))
    for (let c = 0; c < clumps && out.length < count; c++) {
      const side = Math.floor(r() * 4)
      const along = (r() * 2 - 1) * (side < 2 ? ax - 2 : az - 2)
      const width = 1.6 + r() * 1.6
      for (let k = 0; k < 22 && out.length < count; k++) {
        const t = r() * 2 - 1
        const a = along + t * width
        const s = (1.0 + r() * 0.8) * (1.3 - Math.abs(t) * 0.6)
        const y = WALL_H + 0.1 - s / 2 - r() * 0.5 * (1 - Math.abs(t))
        const inward = 0.32 + r() * 0.08
        const x = side < 2 ? a : side === 2 ? ax - inward : -ax + inward
        const z = side < 2 ? (side === 0 ? -az + inward : az - inward) : a
        out.push({ x, y, z, s, alongZ: side >= 2 })
      }
    }
    return out
  }, [count])
  useLayoutEffect(() => {
    const c = new THREE.Color()
    const r = rng(78)
    spots.forEach(({ x, y, z, s, alongZ }, i) => {
      dummy.position.set(x, y, z)
      // Nearly flat against the wall face, leaning out a little at the bottom.
      dummy.rotation.set(0, alongZ ? Math.PI / 2 : 0, 0)
      dummy.rotateZ((r() - 0.5) * 0.5)
      dummy.rotateX((r() - 0.5) * 0.3)
      dummy.scale.set(s * (r() < 0.5 ? -1 : 1), s, s)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
      mesh.current.setColorAt(i, c.setScalar(0.85 + r() * 0.2))
    })
    mesh.current.instanceMatrix.needsUpdate = true
    mesh.current.instanceColor!.needsUpdate = true
    mesh.current.computeBoundingSphere()
  }, [spots])
  const map = useMemo(() => sprayTexture(), [])
  useEffect(() => () => map.dispose(), [map])
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, spots.length]}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial map={map} alphaTest={0.5} side={THREE.DoubleSide} roughness={0.8} />
    </instancedMesh>
  )
}

/** Clay: a Mediterranean courtyard. Fence and windscreen, ochre walls with arches, cypresses. */
export function CourtyardCourt({ detail }: { detail: Detail }) {
  const cypresses = useMemo(() => treeBand(41, detail === 'low' ? 14 : 26, 7, 16, [10, 14]), [detail])
  const pines = useMemo(() => treeBand(42, detail === 'low' ? 5 : 9, 12, 24, [11, 14]), [detail])
  return (
    <group>
      <ClubFence label={LABEL} />
      <Ground set="venue/paving" color="#e0b48a" tile={2.8} />
      <Ring gap={4} height={WALL_H} thickness={0.6}>
        {(len) => <StuccoWall len={len} />}
      </Ring>
      <Bougainvillea count={detail === 'low' ? 200 : 440} />
      <Trees kind="cypress" spots={cypresses} />
      <Trees kind="pine" spots={pines} seed={9} />
      <PlayerBenches color="#8a3b2a" />
      <SpectatorBench count={detail === 'low' ? 6 : 10} wood="#b98a5c" />
    </group>
  )
}
