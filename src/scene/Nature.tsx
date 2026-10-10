import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { rng } from './textures'
import { COAST_X } from './Court'
import { hillHeight, woodland } from './terrain'

// Mediterranean vegetation on the hills around the club: cypresses, umbrella pines and olive
// trees, scattered in groves by a noise field. Low-poly and instanced: one draw call per kind.

// ------------------------------------------------------------------ tree shapes

function paint(g: THREE.BufferGeometry, hex: string) {
  const c = new THREE.Color(hex)
  const n = g.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

/** Shared-vertex copy without uv/normal, so thousands of instances stay cheap to transform. */
function indexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.clone()
  g.dispose()
  out.deleteAttribute('uv')
  out.deleteAttribute('normal')
  const merged = mergeVertices(out)
  out.dispose()
  return merged
}

/**
 * Unit-height shapes (y up from the ground); instances scale them. Kept very low-poly
 * (25-30 vertices) and indexed: a couple of thousand of them are seen at once, mostly a few
 * pixels tall, and they used to be most of the vertices in the whole scene.
 */
function treeGeometries() {
  // Cypress: a tall flame-shaped column (its trunk is hidden in the skirt anyway).
  const cypress = indexed(new THREE.ConeGeometry(0.16, 1, 6, 2))
  {
    const p = cypress.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + 0.5
      // Bulge the lower third so it reads as a flame, not a cone.
      const k = 1 + Math.sin(Math.min(1, y) * Math.PI) * 0.35
      p.setXYZ(i, p.getX(i) * k, p.getY(i) + 0.5, p.getZ(i) * k)
    }
    paint(cypress, '#ffffff')
  }

  // Umbrella (stone) pine: a bare trunk and a wide flat crown.
  const pineCrown = paint(
    indexed(new THREE.IcosahedronGeometry(0.5, 0)).scale(1, 0.32, 1).translate(0, 0.86, 0),
    '#ffffff',
  )
  const pineTrunk = paint(
    indexed(new THREE.CylinderGeometry(0.035, 0.05, 0.8, 4, 1, true)).translate(0, 0.4, 0),
    '#6a4c34',
  )
  const pine = mergeGeometries([pineCrown, pineTrunk])!

  // Olive: a short trunk and a lumpy round crown.
  const oliveCrown = indexed(new THREE.IcosahedronGeometry(0.42, 0))
  {
    const p = oliveCrown.attributes.position as THREE.BufferAttribute
    const r = rng(31)
    for (let i = 0; i < p.count; i++) {
      const k = 0.85 + r() * 0.3
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8 + 0.62, p.getZ(i) * k)
    }
    paint(oliveCrown, '#ffffff')
  }
  const oliveTrunk = paint(
    indexed(new THREE.CylinderGeometry(0.04, 0.06, 0.35, 4, 1, true)).translate(0, 0.17, 0),
    '#5b4a3a',
  )
  const olive = mergeGeometries([oliveCrown, oliveTrunk])!
  for (const g of [cypress, pine, olive]) g.computeVertexNormals()
  for (const g of [pineCrown, pineTrunk, oliveCrown, oliveTrunk]) g.dispose()
  return { cypress, pine, olive }
}

type Kind = 'cypress' | 'pine' | 'olive'

interface Tree {
  kind: Kind
  x: number
  y: number
  z: number
  /** Height (m) and crown width factor. */
  h: number
  w: number
  rot: number
  /** 0..1 colour variation. */
  tint: number
}

/** Foliage colours per kind: dark cypress, deep pine green, silvery olive. */
const FOLIAGE: Record<Kind, [string, string]> = {
  cypress: ['#22361f', '#33492a'],
  pine: ['#2f4a26', '#4a6431'],
  olive: ['#56633f', '#6e7a52'],
}

function scatter(count: number): Tree[] {
  const r = rng(4242)
  const trees: Tree[] = []
  for (let tries = 0; trees.length < count && tries < count * 30; tries++) {
    // From the edge of the club grounds out to the far hills, all round except the bay.
    const ang = -0.6 - r() * 4.0
    const dist = 95 + Math.pow(r(), 0.8) * 340
    const x = Math.cos(ang) * dist
    const z = Math.sin(ang) * dist
    if (x > COAST_X - 18) continue
    const wood = woodland(x, z)
    if (r() > Math.pow(wood, 1.6) * 2.2) continue
    const y = hillHeight(x, z)
    const steep = Math.min(1, y / 40)
    const pick = r()
    // Cypresses line the lower ground, pines take the ridges, olives the open terraces.
    const kind: Kind = pick < 0.28 + 0.1 * (1 - steep) ? 'cypress' : pick < 0.62 + 0.15 * steep ? 'pine' : 'olive'
    const h = kind === 'cypress' ? 7 + r() * 5 : kind === 'pine' ? 6.5 + r() * 4 : 3.5 + r() * 2
    trees.push({ kind, x, y: y - 0.3, z, h, w: 0.85 + r() * 0.4, rot: r() * Math.PI * 2, tint: r() })
  }
  return trees
}

function TreeKind({ geometry, trees, kind }: { geometry: THREE.BufferGeometry; trees: Tree[]; kind: Kind }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = new THREE.Object3D()
    const c = new THREE.Color()
    const [dark, light] = FOLIAGE[kind].map((h) => new THREE.Color(h))
    trees.forEach((t, i) => {
      m.position.set(t.x, t.y, t.z)
      m.rotation.set(0, t.rot, 0)
      m.scale.set(t.h * t.w, t.h, t.h * t.w)
      m.updateMatrix()
      mesh.current.setMatrixAt(i, m.matrix)
      // Trunks are painted in the vertex colours; the instance colour tints the crown.
      mesh.current.setColorAt(i, c.copy(dark).lerp(light, t.tint))
    })
    mesh.current.instanceMatrix.needsUpdate = true
    mesh.current.instanceColor!.needsUpdate = true
    mesh.current.computeBoundingSphere()
  }, [trees, kind])
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, trees.length]} frustumCulled={false}>
      <meshStandardMaterial vertexColors roughness={0.95} flatShading />
    </instancedMesh>
  )
}

/** Trees on the hills; `count` scales with the graphics quality. */
export function Vegetation({ count }: { count: number }) {
  const geos = useMemo(() => treeGeometries(), [])
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos])
  const trees = useMemo(() => scatter(count), [count])
  const byKind = useMemo(() => {
    const out: Record<Kind, Tree[]> = { cypress: [], pine: [], olive: [] }
    for (const t of trees) out[t.kind].push(t)
    return out
  }, [trees])
  return (
    <group>
      {(['cypress', 'pine', 'olive'] as Kind[]).map((k) =>
        byKind[k].length ? <TreeKind key={k} kind={k} geometry={geos[k]} trees={byKind[k]} /> : null,
      )}
    </group>
  )
}
