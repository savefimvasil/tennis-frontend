import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { BALL, COURT } from '../game/constants'
import { onFenceTouch } from '../game/director'
import { grassTexture, radialTexture } from './textures'
import { DETAIL, detailSurfaceMaterial, macroMap, surfaceMaps, surfaceMaterial } from './surfaceTextures'
import { PbrMaterial, WithFallback } from './PbrMaterial'
import { preloadPbr, usePbr } from './photoTextures'
import { useGame } from '../game/store'
import type { SurfaceId as Surface } from '../physics/flight'

const L = COURT.halfLength
const DW = COURT.doublesHalfWidth
const SW = COURT.singlesHalfWidth

function linesGeometry() {
  const lw = COURT.lineWidth
  const bw = COURT.baselineWidth
  const h = 0.003
  const boxes: [number, number, number, number][] = [
    // [centerX, centerZ, sizeX, sizeZ]
    [0, L - bw / 2, DW * 2, bw],
    [0, -L + bw / 2, DW * 2, bw],
    [DW - lw / 2, 0, lw, L * 2],
    [-DW + lw / 2, 0, lw, L * 2],
    [SW - lw / 2, 0, lw, L * 2],
    [-SW + lw / 2, 0, lw, L * 2],
    [0, COURT.serviceLine - lw / 2, SW * 2, lw],
    [0, -COURT.serviceLine + lw / 2, SW * 2, lw],
    [0, 0, lw, COURT.serviceLine * 2],
    [0, L - bw - 0.05, lw, 0.1],
    [0, -L + bw + 0.05, lw, 0.1],
  ]
  const geos = boxes.map(([x, z, sx, sz]) => {
    const g = new THREE.BoxGeometry(sx, h, sz)
    g.translate(x, h / 2, z)
    return g
  })
  const merged = mergeGeometries(geos)
  // Same UVs as the playing-area plane, so its tiled normal map lines up under the paint.
  const pos = merged.attributes.position
  const uv = merged.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + DW) / (DW * 2), (L - pos.getZ(i)) / (L * 2))
  return merged
}

const COURT_SETS = { hard: 'court/hard', clay: 'court/clay', grass: 'court/grass' } as const
// All three courts download up front, so changing the surface never falls back.
preloadPbr('court/hard', 'court/clay', 'court/grass')

interface SurfaceMaterials {
  surface: Surface
  inner: THREE.MeshStandardMaterial
  outer: THREE.MeshStandardMaterial
  lines: THREE.MeshStandardMaterial
}

/** Painted lines: matte, with the same grain showing through. */
function linesMaterial(normalMap: THREE.Texture | null) {
  return new THREE.MeshStandardMaterial({
    color: '#f3f4ef',
    roughness: 0.82,
    normalMap,
    normalScale: new THREE.Vector2(0.4, 0.4),
    envMapIntensity: 0.3,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
}

/** The run-off on clay and grass is the same surface, a touch lighter and more worn. */
function runOffTint(surface: Surface, outer: THREE.MeshStandardMaterial) {
  if (surface !== 'hard') outer.color.set(surface === 'clay' ? '#f1e2d8' : '#e2ecd6')
}

function useDisposeMaterials(mats: SurfaceMaterials) {
  useEffect(
    () => () => {
      mats.inner.dispose()
      mats.outer.dispose()
      mats.lines.dispose()
    },
    [mats],
  )
}

/** Photo-scanned surface: tiled detail tinted by a non-repeating macro colour map. Suspends while loading. */
function usePhotoMaterials(): SurfaceMaterials {
  const surface = useGame((s) => s.surface)
  const detail = usePbr(COURT_SETS[surface])
  const mats = useMemo(() => {
    const d = DETAIL[surface]
    const inner = detailSurfaceMaterial(detail, macroMap(surface, L * 2), DW * 2, L * 2, d)
    const outerKind = surface === 'hard' ? 'hardOuter' : surface
    const outer = detailSurfaceMaterial(
      detail,
      macroMap(outerKind, COURT.fenceZ * 2),
      COURT.fenceX * 2,
      COURT.fenceZ * 2,
      d,
    )
    runOffTint(surface, outer)
    return { surface, inner, outer, lines: linesMaterial(inner.normalMap) }
  }, [surface, detail])
  useDisposeMaterials(mats)
  return mats
}

/** Procedural stand-in shown until the photo textures have loaded. */
function useProceduralMaterials(): SurfaceMaterials {
  const surface = useGame((s) => s.surface)
  const mats = useMemo(() => {
    const innerKind = surface
    const outerKind = surface === 'hard' ? 'hardOuter' : surface
    const inner = surfaceMaterial(surfaceMaps(innerKind, L * 2), DW * 2, L * 2)
    const outer = surfaceMaterial(surfaceMaps(outerKind, COURT.fenceZ * 2), COURT.fenceX * 2, COURT.fenceZ * 2)
    runOffTint(surface, outer)
    return { surface, inner, outer, lines: linesMaterial(inner.normalMap) }
  }, [surface])
  useDisposeMaterials(mats)
  return mats
}

/** Worn patches where players stand most: behind the baseline centre and at the service line. */
function Wear({ color, opacity }: { color: string; opacity: number }) {
  const tex = useMemo(() => radialTexture(), [])
  const spots: [number, number, number, number][] = [
    [0, L + 0.7, 4.2, 1.4],
    [0, -L - 0.7, 4.2, 1.4],
    [0.4, L - 0.6, 2.4, 0.9],
    [-0.4, -L + 0.6, 2.4, 0.9],
    [1.8, L + 0.3, 1.8, 0.8],
    [-1.8, -L - 0.3, 1.8, 0.8],
  ]
  return (
    <group>
      {spots.map(([x, z, w, d], i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[x, 0.0025, z]} renderOrder={1}>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial
            map={tex}
            color={color}
            transparent
            opacity={opacity}
            depthWrite={false}
            roughness={1}
          />
        </mesh>
      ))}
    </group>
  )
}

function Surfaces({ m }: { m: SurfaceMaterials }) {
  const lines = useMemo(linesGeometry, [])
  return (
    <>
      {/* Run-off */}
      <mesh rotation-x={-Math.PI / 2} position-y={0} receiveShadow>
        <planeGeometry args={[COURT.fenceX * 2, COURT.fenceZ * 2]} />
        <primitive object={m.outer} attach="material" />
      </mesh>
      {/* Playing area */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.001} receiveShadow>
        <planeGeometry args={[DW * 2, L * 2]} />
        <primitive object={m.inner} attach="material" />
      </mesh>
      {m.surface === 'grass' ? <Wear color="#b49a6a" opacity={0.42} /> : null}
      {m.surface === 'clay' ? <Wear color="#8f3f1f" opacity={0.25} /> : null}
      <mesh geometry={lines} receiveShadow>
        <primitive object={m.lines} attach="material" />
      </mesh>
    </>
  )
}

function PhotoSurfaces() {
  return <Surfaces m={usePhotoMaterials()} />
}

function ProceduralSurfaces() {
  return <Surfaces m={useProceduralMaterials()} />
}

const LAWN = 600

/** Grass beyond the fence: the grass court's detail under a duller, larger macro map. */
function LawnMaterial() {
  const detail = usePbr('court/grass')
  const mat = useMemo(() => {
    const m = detailSurfaceMaterial(detail, macroMap('lawn', LAWN), LAWN, LAWN, {
      grainTile: 1.7,
      roughTile: 2.6,
      normalScale: 0,
      roughness: 1.3,
    })
    // Seen from 15 m and further: blade relief is invisible there, so skip the normal lookup.
    m.normalMap?.dispose()
    m.normalMap = null
    return m
  }, [detail])
  useEffect(() => () => mat.dispose(), [mat])
  return <primitive object={mat} attach="material" />
}

const APRON: [number, number] = [COURT.fenceX * 2 + 16, COURT.fenceZ * 2 + 14]
const PAVING_TILE = 2.8

export function Court() {
  const grass = useMemo(() => grassTexture(), [])

  return (
    <group>
      {/* Grass beyond the fence */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <planeGeometry args={[LAWN, LAWN]} />
        <WithFallback fallback={<meshStandardMaterial map={grass} roughness={1} color="#a8b893" />}>
          <LawnMaterial />
        </WithFallback>
      </mesh>
      {/* Paved apron around the venue */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
        <planeGeometry args={APRON} />
        <WithFallback fallback={<meshStandardMaterial color="#c9bfae" roughness={0.95} />}>
          <PbrMaterial
            set="venue/paving"
            repeat={[APRON[0] / PAVING_TILE, APRON[1] / PAVING_TILE]}
            roughness={1.1}
            envMapIntensity={0.4}
          />
        </WithFallback>
      </mesh>
      <WithFallback fallback={<ProceduralSurfaces />}>
        <PhotoSurfaces />
      </WithFallback>

      {/* Physics: the playing surface and the fence */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[60, 0.5, 60]}
          position={[0, -0.5, 0]}
          restitution={BALL.restitution}
          friction={BALL.friction}
        />
      </RigidBody>
      <RigidBody type="fixed" colliders={false}>
        {(
          [
            [COURT.fenceX + 0.1, 0, 0.1, COURT.fenceZ],
            [-COURT.fenceX - 0.1, 0, 0.1, COURT.fenceZ],
            [0, COURT.fenceZ + 0.1, COURT.fenceX, 0.1],
            [0, -COURT.fenceZ - 0.1, COURT.fenceX, 0.1],
          ] as const
        ).map(([x, z, hx, hz], i) => (
          <CuboidCollider
            key={i}
            args={[hx, COURT.fenceHeight / 2, hz]}
            position={[x, COURT.fenceHeight / 2, z]}
            restitution={0.25}
            friction={0.8}
            onCollisionEnter={onFenceTouch}
          />
        ))}
      </RigidBody>
    </group>
  )
}
