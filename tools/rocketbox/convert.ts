// Converts a Rocketbox FBX (3ds Max Biped rig) into a compact GLB for the game.
// Run via `node tools/rocketbox/run.mjs <Name>` with the dev server up; see README.md.
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

declare global {
  interface Window {
    __done?: { glb?: string; report: unknown; error?: string }
  }
}

async function main() {
  const name = new URLSearchParams(location.search).get('avatar') ?? 'Sports_Male_04'
  const manager = new THREE.LoadingManager()
  // Textures are converted separately (JPEG) and assigned at runtime; skip the TGAs referenced by the FBX.
  manager.setURLModifier((url) => (/\.(tga|png|jpg)$/i.test(url) ? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' : url))
  const fbx = await new FBXLoader(manager).loadAsync(`./input/${name}.fbx`)
  fbx.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(fbx)
  const size = box.getSize(new THREE.Vector3())
  const meshes: unknown[] = []
  const bones: string[] = []
  fbx.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh || (o as THREE.Mesh).isMesh) {
      const m = o as THREE.SkinnedMesh
      const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => x.name)
      meshes.push({ name: m.name, skinned: !!m.isSkinnedMesh, tris: (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3, mats, groups: m.geometry.groups.length })
      // Plain materials; the game assigns textures by material name.
      const make = (src: THREE.Material) => {
        const mat = new THREE.MeshStandardMaterial({ name: src.name })
        return mat
      }
      m.material = Array.isArray(m.material) ? m.material.map(make) : make(m.material)
    }
    if ((o as THREE.Bone).isBone) bones.push(o.name)
  })
  fbx.animations = []

  // Normalise to metres with feet on the ground.
  const height = size.y
  const s = 1 / (height > 10 ? 100 : 1)
  const wrapper = new THREE.Group()
  wrapper.name = name
  fbx.scale.multiplyScalar(s)
  fbx.position.y -= box.min.y * s
  wrapper.add(fbx)
  wrapper.updateMatrixWorld(true)

  const world = (n: string) => {
    const o = wrapper.getObjectByName(n)
    return o ? o.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3)) : null
  }
  const report = {
    size: size.toArray().map((v) => +v.toFixed(2)),
    meshes,
    bones,
    joints: Object.fromEntries(
      ['Bip01 Head', 'Bip01 R UpperArm', 'Bip01 R Forearm', 'Bip01 R Hand', 'Bip01 L UpperArm', 'Bip01 R Thigh', 'Bip01 R Calf', 'Bip01 R Foot', 'Bip01 R Toe0', 'Bip01 Pelvis'].map((n) => [n, world(n)]),
    ),
  }

  const glb = (await new GLTFExporter().parseAsync(wrapper, { binary: true, onlyVisible: false })) as ArrayBuffer
  let bin = ''
  const bytes = new Uint8Array(glb)
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  window.__done = { glb: btoa(bin), report }
}

main().catch((e) => {
  window.__done = { report: null, error: String(e?.stack ?? e) }
})
