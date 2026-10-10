// Compacts converted avatars in place: one compact vertex set per primitive (the FBX export
// gives every primitive the whole shared buffer, and every triangle its own vertices) and no
// unused vertex colours. Materials and UVs stay: the game assigns textures by material name.
// Usage: node tools/rocketbox/optimize.mjs public/models/rocketbox/Sports_Male_04.glb [...]
import { NodeIO, PropertyType } from '@gltf-transform/core'
import { prune, weld } from '@gltf-transform/functions'

const io = new NodeIO()

for (const file of process.argv.slice(2)) {
  const doc = await io.read(file)
  const verts = () =>
    doc
      .getRoot()
      .listMeshes()
      .flatMap((m) => m.listPrimitives())
      .reduce((s, p) => s + p.getAttribute('POSITION').getCount(), 0)
  const before = verts()
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) prim.setAttribute('COLOR_0', null)
  await doc.transform(weld(), prune({ propertyTypes: [PropertyType.ACCESSOR], keepAttributes: true }))
  await io.write(file, doc)
  console.log(file, 'vertices', before, '->', verts())
}
