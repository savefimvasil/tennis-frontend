import { useLayoutEffect, useMemo, useRef } from 'react'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { rng } from './textures'
import { TreeClump, type TreeKind, type TreeSpot } from './VenueParts'
import { WithFallback } from './PbrMaterial'
import { useGame } from '../game/store'

// Real trees around the venues: EZ-Tree trees (MIT, procedural) baked by tools/trees into one
// GLB, 1 m tall, branches plus photo leaf cards. Each variant is two instanced meshes (bark and
// leaves), so a band of thirty trees is a handful of draw calls. The primitive crowns stand in
// while the GLB and textures load, and for good if they fail.

export type RealTreeKind = 'round' | 'conifer' | 'cypress' | 'pine'

const VARIANTS: Record<RealTreeKind, string[]> = {
  round: ['oak-a', 'oak-b', 'ash'],
  conifer: ['pine'],
  cypress: ['cypress'],
  pine: ['stonepine'],
}
/** Crown widths vary a little more than heights. */
const WIDTH_JITTER: Record<RealTreeKind, number> = { round: 0.35, conifer: 0.2, cypress: 0.15, pine: 0.3 }
/** Leaf brightness: the pine-needle photo is light; cypresses and stone pines read dark. */
const LEAF_TONE: Record<RealTreeKind, number> = { round: 1, conifer: 0.85, cypress: 0.55, pine: 0.7 }
const FALLBACK: Record<RealTreeKind, TreeKind> = { round: 'round', conifer: 'pine', cypress: 'cypress', pine: 'pine' }

const MODEL = `${import.meta.env.BASE_URL}models/trees/trees.glb`
const TEX = `${import.meta.env.BASE_URL}textures/trees/`
const TEXTURES = {
  'bark-oak': `${TEX}bark-oak.webp`,
  'bark-oak-normal': `${TEX}bark-oak-normal.webp`,
  'bark-pine': `${TEX}bark-pine.webp`,
  'bark-pine-normal': `${TEX}bark-pine-normal.webp`,
  'leaves-oak': `${TEX}leaves-oak.webp`,
  'leaves-ash': `${TEX}leaves-ash.webp`,
  'leaves-pine': `${TEX}leaves-pine.webp`,
}

/** Starts the download early, so a venue never waits on its trees. */
export function preloadTrees() {
  useGLTF.preload(MODEL)
  useTexture.preload(Object.values(TEXTURES))
}

preloadTrees()

type Tex = Record<keyof typeof TEXTURES, THREE.Texture>

const materials = new Map<string, THREE.Material>()
/** One material per bark or leaf type, shared by every venue. */
function material(name: string, tex: Tex) {
  let m = materials.get(name)
  if (m) return m
  const [part, type] = name.split('-') as ['bark' | 'leaves', string]
  if (part === 'bark') {
    const map = tex[`bark-${type}` as keyof Tex]
    const normalMap = tex[`bark-${type}-normal` as keyof Tex]
    for (const t of [map, normalMap]) t.wrapS = t.wrapT = THREE.RepeatWrapping
    map.colorSpace = THREE.SRGBColorSpace
    m = new THREE.MeshStandardMaterial({ map, normalMap, roughness: 0.95 })
  } else {
    const map = tex[`leaves-${type}` as keyof Tex]
    map.colorSpace = THREE.SRGBColorSpace
    m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 })
  }
  materials.set(name, m)
  return m
}

const dummy = new THREE.Object3D()

function Variant({
  geometry,
  mat,
  spots,
  seed,
  tone,
}: {
  geometry: THREE.BufferGeometry
  mat: THREE.Material
  spots: (TreeSpot & { w: number; yaw: number; tint: number })[]
  seed: number
  tone: number
}) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const leafy = (mat as THREE.MeshStandardMaterial).alphaTest > 0
  useLayoutEffect(() => {
    const c = new THREE.Color()
    const r = rng(seed)
    spots.forEach((s, i) => {
      dummy.position.set(s.x, 0, s.z)
      dummy.rotation.set((r() - 0.5) * 0.06, s.yaw, (r() - 0.5) * 0.06)
      dummy.scale.set(s.h * s.w, s.h, s.h * s.w)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
      // Leaves: each tree a slightly different green, some warmer, some darker.
      if (leafy)
        mesh.current.setColorAt(i, c.setHSL(0.02 * (s.tint - 0.5), 0.12 * s.tint, (0.82 + s.tint * 0.22) * tone))
    })
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
    mesh.current.computeBoundingSphere()
  }, [spots, seed, leafy, tone])
  return <instancedMesh ref={mesh} args={[geometry, mat, spots.length]} frustumCulled />
}

function RealTrees({ kind, spots, seed }: { kind: RealTreeKind; spots: TreeSpot[]; seed: number }) {
  const { nodes } = useGLTF(MODEL) as unknown as { nodes: Record<string, THREE.Mesh> }
  const tex = useTexture(TEXTURES) as Tex
  const groups = useMemo(() => {
    const r = rng(seed)
    const names = VARIANTS[kind]
    const by = new Map<string, (TreeSpot & { w: number; yaw: number; tint: number })[]>()
    for (const s of spots) {
      const v = names[Math.floor(r() * names.length)]
      if (!by.has(v)) by.set(v, [])
      by.get(v)!.push({ ...s, w: 1 + (r() - 0.5) * WIDTH_JITTER[kind], yaw: r() * Math.PI * 2, tint: r() })
    }
    return [...by]
  }, [kind, spots, seed])
  return (
    <group>
      {groups.flatMap(([v, list], i) =>
        (['bark', 'leaves'] as const).map((part) => {
          const node = nodes[`${v}:${part}`.replace(/[:]/g, '')] ?? nodes[`${v}:${part}`]
          return (
            <Variant
              key={`${v}-${part}`}
              geometry={node.geometry}
              mat={material((node.material as THREE.Material).name, tex)}
              spots={list}
              seed={seed + i}
              tone={LEAF_TONE[kind]}
            />
          )
        }),
      )}
    </group>
  )
}

/** A band of real trees, with primitive crowns while they load (and on Low quality). */
export function Trees({ kind, spots, seed = 3 }: { kind: RealTreeKind; spots: TreeSpot[]; seed?: number }) {
  const low = useGame((s) => s.quality === 'low')
  if (low) return <TreeClump kind={FALLBACK[kind]} spots={spots} seed={seed} />
  return (
    <WithFallback fallback={<TreeClump kind={FALLBACK[kind]} spots={spots} seed={seed} />}>
      <RealTrees kind={kind} spots={spots} seed={seed} />
    </WithFallback>
  )
}
