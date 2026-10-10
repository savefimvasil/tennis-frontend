// Bakes a handful of EZ-Tree trees (procedural, MIT) into one compact GLB for the venues:
// branches and leaf cards per variant, scaled to 1 m tall with the trunk base at the origin.
// The game instances them and applies the bark and leaf textures written next to it.
// Run via `node tools/trees/run.mjs` with the dev server up; see README.md.
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { Tree } from '@dgreenheck/ez-tree'
import oakBark from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/oak_color_1k.jpg?url'
import oakBarkN from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/oak_normal_1k.jpg?url'
import pineBark from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/pine_color_1k.jpg?url'
import pineBarkN from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/bark/pine_normal_1k.jpg?url'
import oakLeaves from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/leaves/oak_color.png?url'
import ashLeaves from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/leaves/ash_color.png?url'
import pineLeaves from '../../node_modules/@dgreenheck/ez-tree/src/lib/assets/leaves/pine_color.png?url'

declare global {
  interface Window {
    __done?: { glb?: string; textures?: Record<string, string>; report: unknown; error?: string }
  }
}

type Opts = Tree['options']
interface Variant {
  id: string
  preset: string
  seed: number
  edit?: (o: Opts) => void
}

/** Leaf cards cost the most: keep the counts low and the cards large. */
const VARIANTS: Variant[] = [
  {
    id: 'oak-a',
    preset: 'Oak Medium',
    seed: 35729,
    edit: (o) => {
      o.leaves.count = 4
      o.leaves.size = 5.4
    },
  },
  {
    id: 'oak-b',
    preset: 'Oak Medium',
    seed: 1207,
    edit: (o) => {
      o.leaves.count = 4
      o.leaves.size = 5.4
    },
  },
  {
    id: 'ash',
    preset: 'Ash Medium',
    seed: 4021,
    edit: (o) => {
      o.branch.children[2] = 2
      o.leaves.count = Math.round(o.leaves.count * 0.35)
      o.leaves.size *= 1.9
    },
  },
  {
    id: 'pine',
    preset: 'Pine Medium',
    seed: 13977,
    edit: (o) => {
      o.branch.children[0] = 50
      o.leaves.count = 9
      o.leaves.size *= 2.3
    },
  },
  {
    // Italian cypress: a tall trunk, short branches swept up hard, dense needles.
    id: 'cypress',
    preset: 'Pine Medium',
    seed: 771,
    edit: (o) => {
      o.branch.levels = 1
      o.branch.length[0] = 50
      o.branch.radius[0] = 0.8
      o.branch.children[0] = 70
      o.branch.angle[1] = 20
      o.branch.start[1] = 0.06
      o.branch.length[1] = 8
      o.branch.radius[1] = 0.3
      o.branch.taper[1] = 0.8
      o.leaves.count = 5
      o.leaves.size = 5.4
      o.leaves.angle = 14
      o.leaves.start = 0
    },
  },
  {
    // Stone pine: a bare leaning trunk with an umbrella crown on top.
    id: 'stonepine',
    preset: 'Oak Medium',
    seed: 9183,
    edit: (o) => {
      o.type = 'evergreen' as Opts['type']
      o.bark.type = 'pine' as Opts['bark']['type']
      o.branch.levels = 2
      o.branch.length[0] = 40
      o.branch.start[1] = 0.7
      o.branch.angle[1] = 72
      o.branch.children[0] = 7
      o.branch.children[1] = 5
      o.branch.length[1] = 24
      o.branch.length[2] = 10
      o.branch.angle[2] = 55
      o.branch.force.strength = 0.035
      o.leaves.type = 'pine' as Opts['leaves']['type']
      o.leaves.count = 14
      o.leaves.size = 3.4
      o.leaves.angle = 70
      o.leaves.start = 0.2
    },
  },
]

/** Fewer sides and rings on the thin branches: they are a few pixels wide at venue distance. */
function lean(o: Opts) {
  const seg = [7, 4, 3, 3]
  const sec = [8, 4, 2, 1]
  for (let l = 0; l < 4; l++) {
    o.branch.segments[l as 0] = Math.min(o.branch.segments[l as 0], seg[l])
    o.branch.sections[l as 0] = Math.min(o.branch.sections[l as 0], sec[l])
  }
}

const BARK: Record<string, string> = { oak: 'oak', ash: 'oak', pine: 'pine', willow: 'oak', birch: 'oak' }

async function texture(url: string, size: number, name: string, out: Record<string, string>) {
  const img = new Image()
  img.src = url
  await img.decode()
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.drawImage(img, 0, 0, size, size)
  out[name] = c.toDataURL('image/webp', 0.86).split(',')[1]
}

function bake(tree: Tree, id: string) {
  tree.updateMatrixWorld(true)
  const bark = tree.branchesMesh.geometry.clone()
  const leaves = tree.leavesMesh.geometry.clone()
  const box = new THREE.Box3().setFromObject(tree)
  const s = 1 / (box.max.y - box.min.y)
  for (const g of [bark, leaves]) g.scale(s, s, s)
  // Bark UVs: bake the preset's texture repeat in.
  const ts = tree.options.bark.textureScale
  const uv = bark.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ts.x, uv.getY(i) / ts.y)
  bark.deleteAttribute('normal')
  bark.computeVertexNormals()
  // Leaf normals: bend them out from the crown centre so the crown shades as one volume
  // (lit side bright, far side dark) instead of a speckle of randomly facing cards.
  leaves.computeBoundingBox()
  const c = leaves.boundingBox!.getCenter(new THREE.Vector3())
  const half = leaves.boundingBox!.getSize(new THREE.Vector3()).multiplyScalar(0.5)
  const p = leaves.attributes.position as THREE.BufferAttribute
  const n = leaves.attributes.normal as THREE.BufferAttribute
  const v = new THREE.Vector3()
  const own = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(c).divide(half).normalize()
    own.fromBufferAttribute(n, i)
    if (own.dot(v) < 0) own.negate()
    v.multiplyScalar(0.8).addScaledVector(own, 0.2).normalize()
    n.setXYZ(i, v.x, v.y, v.z)
  }
  const barkMesh = new THREE.Mesh(
    bark,
    new THREE.MeshStandardMaterial({ name: `bark-${BARK[tree.options.bark.type]}` }),
  )
  barkMesh.name = `${id}:bark`
  const leafMesh = new THREE.Mesh(
    leaves,
    new THREE.MeshStandardMaterial({ name: `leaves-${tree.options.leaves.type}` }),
  )
  leafMesh.name = `${id}:leaves`
  return {
    meshes: [barkMesh, leafMesh],
    report: {
      id,
      barkTris: (bark.index?.count ?? 0) / 3,
      leafCards: p.count / 4,
      verts: bark.attributes.position.count + p.count,
      aspect: +((box.max.x - box.min.x) * s).toFixed(2),
    },
  }
}

async function main() {
  const scene = new THREE.Scene()
  const preview = new THREE.Scene()
  const report: unknown[] = []
  VARIANTS.forEach((variant, i) => {
    const tree = new Tree()
    tree.loadPreset(variant.preset)
    tree.options.seed = variant.seed
    variant.edit?.(tree.options)
    lean(tree.options)
    tree.generate()
    const baked = bake(tree, variant.id)
    scene.add(...baked.meshes)
    report.push(baked.report)
    const box = new THREE.Box3().setFromObject(tree)
    tree.scale.setScalar(1 / (box.max.y - box.min.y))
    tree.position.x = (i - (VARIANTS.length - 1) / 2) * 1.1
    preview.add(tree)
  })

  const textures: Record<string, string> = {}
  await Promise.all([
    texture(oakBark, 512, 'bark-oak.webp', textures),
    texture(oakBarkN, 512, 'bark-oak-normal.webp', textures),
    texture(pineBark, 512, 'bark-pine.webp', textures),
    texture(pineBarkN, 512, 'bark-pine-normal.webp', textures),
    texture(oakLeaves, 512, 'leaves-oak.webp', textures),
    texture(ashLeaves, 512, 'leaves-ash.webp', textures),
    texture(pineLeaves, 512, 'leaves-pine.webp', textures),
  ])

  const glb = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer
  const bytes = new Uint8Array(glb)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))

  // A preview row with EZ-Tree's own materials, for the screenshot.
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(innerWidth, innerHeight)
  document.body.appendChild(renderer.domElement)
  preview.background = new THREE.Color('#bcd4e6')
  preview.add(new THREE.HemisphereLight('#ffffff', '#556644', 1.5))
  const sun = new THREE.DirectionalLight('#fff4e0', 2.5)
  sun.position.set(2, 4, 3)
  preview.add(sun)
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 50)
  cam.position.set(0, 0.6, 4.2)
  cam.lookAt(0, 0.5, 0)
  await new Promise((r) => setTimeout(r, 1500))
  renderer.render(preview, cam)

  window.__done = { glb: btoa(bin), textures, report: { bytes: bytes.length, trees: report } }
}

main().catch((e) => (window.__done = { report: null, error: String(e?.stack ?? e) }))
