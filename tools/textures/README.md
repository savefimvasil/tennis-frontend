# Photo-scanned textures and sky

The courts, the venue and the sky use CC0 photo-scanned assets from [ambientCG](https://ambientcg.com) and
[Poly Haven](https://polyhaven.com). `fetch.mjs` downloads them through the libraries' APIs, converts them to WebP
and writes `public/textures/` plus `public/textures/LICENSE.md` (asset, author, URL, licence).

```bash
node tools/textures/fetch.mjs
```

Needs Node 18+ and ImageMagick 7 with WebP support (`magick -list format | grep WEBP`). Downloads are cached in
`tools/textures/.cache/` (git-ignored), so re-running only re-encodes. The script fails if `public/textures/` grows
past the 10 MB budget.

## What it produces

| Folder | Source | Used for |
| --- | --- | --- |
| `court/hard` | Poly Haven `clean_asphalt` | hard court and its run-off (tinted blue / green) |
| `court/clay` | Poly Haven `red_sand` | clay court |
| `court/grass` | ambientCG `Grass005` | grass court and the lawn beyond the fence |
| `venue/concrete` | ambientCG `Concrete034` | stands |
| `venue/stucco` | Poly Haven `white_stucco` | clubhouse walls |
| `venue/roof` | Poly Haven `clay_roof_tiles_02` | clubhouse roof (terracotta tiles) |
| `venue/paving` | Poly Haven `floor_pavement` | apron around the venue, clubhouse terrace |
| `venue/bark` | Poly Haven `palm_bark` | palm trunks |
| `sky` | Poly Haven `lonely_road_afternoon_puresky` (2K HDRI) | background and environment |

Every material set is `color.webp` (sRGB), `normal.webp` (OpenGL convention) and `rough.webp`, all 1024 px
(roughness 512 px for the venue). No displacement. Ambient occlusion is multiplied into the colour of the roof
and the paving, the only sets with deep enough relief to need it; no separate AO maps are shipped.

**Court colour maps are detail maps.** The script divides them by their mean colour (linear 0.5 = mean, with the
contrast scaled by `detail`). In game, `detailSurfaceMaterial` (`src/scene/surfaceTextures.ts`) multiplies them by
a procedural macro colour map laid once over the whole area, which sets the colour (#2b5c8e blue, green run-off,
clay, grass stripes) and hides the tiling.

**The sky is a gain-map HDR.** The 2K Radiance file becomes `sky.webp` (SDR, sRGB), `sky-gain.webp` (log2 gain
for the pixels brighter than SDR, i.e. the sun) and `sky.json` (gain-map metadata). drei's `useEnvironment`
decodes the three files with `@monogrid/gainmap-js` into a half-float texture. That is ~25 KB in place of the
~5 MB `.hdr`. The script exposes the HDRI so everything but the sun fits in the SDR layer (`exposure` in
`sky.json`) and prints the sun direction. `HDRI_SUN` in `src/scene/Lighting.tsx` holds that value. Update it
if you change the sky.

## Changing an asset

Edit `MATERIALS` or `SKY` in `fetch.mjs` (any Poly Haven texture id or ambientCG material id), re-run it, then
check the in-game tile sizes: `DETAIL` in `surfaceTextures.ts` for the courts, the `repeat` props in `Court.tsx`
and `Surroundings.tsx` for the rest.

Until a set has loaded, and for good if it fails to load, the game renders the old procedural materials in its
place (`WithFallback` in `src/scene/PbrMaterial.tsx`).
