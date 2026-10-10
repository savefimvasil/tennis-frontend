# Trees

The venues' trees are generated with [EZ-Tree](https://github.com/dgreenheck/ez-tree) by Daniel
Greenheck (MIT): procedural branches plus photo leaf cards. `bake.ts` builds six variants (two oaks,
an ash, a spruce-like pine, an Italian cypress, a stone pine) with fewer leaf cards and thinner
branch geometry than the presets, scales each to 1 m tall and writes them into one GLB. The game
instances them (`src/scene/Trees.tsx`), two draw calls per variant.

```bash
npm run dev            # in another terminal
node tools/trees/run.mjs [preview.png]
```

Writes `public/models/trees/trees.glb` and the bark and leaf textures (512 px WebP) in
`public/textures/trees/`, and prints the triangle counts. Needs `playwright` (or change the import
to `playwright-core` with Chromium's path).

## Sources and licences

| Asset | Source | Licence |
| --- | --- | --- |
| Tree generator, leaf textures (oak, ash, pine) | EZ-Tree 1.1.0, `@dgreenheck/ez-tree` | MIT |
| Oak bark | Poly Haven `bark_brown_02` (via EZ-Tree) | CC0 1.0 |
| Pine bark | TextureCan #588 (via EZ-Tree) | CC0 1.0 |
