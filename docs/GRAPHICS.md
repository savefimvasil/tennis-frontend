# Graphics: where the detail comes from, and what is next

## Audit (before this pass)

Screenshots from the gameplay camera, the net, the stands and a wide orbit.

| Area | State | Impact |
| --- | --- | --- |
| Crowd | Coloured capsules with sphere heads | High: fills both sides of the gameplay view |
| Background | Grey box towers with a window texture, flat ridge, clear sky | High: centre of every gameplay frame |
| Officials | A capsule umpire, no ball kids | Medium |
| Court | Photo PBR surfaces (ambientCG / Poly Haven), but bounces leave no trace | Medium on clay |
| Players | Rocketbox avatars, IK arms | Fine |
| Clubhouse | Photo stucco and tiles on box walls, no depth | Medium |
| Palms | Card fronds | Low to medium |

## Techniques researched

**Crowds.** Sports games render big crowds as impostors: pre-rendered sprites of real
characters on camera-facing quads, all in one instanced draw call, with per-instance frame
and colour data and random animation offsets so nobody moves in sync. Close rows sometimes use
real instanced skinned meshes, through vertex-animation or bone textures sampled per
instance (NVIDIA GPU Gems 3 ch. 2; `InstancedMesh2` for three.js); distant rows use
billboards or octahedral impostors. Instancing saves CPU (draw calls) but not vertex work,
so the triangle count per spectator still matters.

**Sky and background.** Volumetric clouds (`@takram/three-clouds`, drei `<Clouds>`) look
great but cost a lot of fill rate. A single dome with an fbm cloud shader costs one draw
call and is enough behind a court. Distant scenery is cheapest as instanced primitives,
faded by the scene fog.

**Water.** A full planar reflection (three's `Water`) renders the scene twice. A
Fresnel blend between deep water and sky colour, with procedural wave normals and a sun
glint, reads as sea from a court-side camera at almost no cost.

**Grass, foliage.** Instanced blade grass (millions of blades in chunked
`InstancedBufferGeometry` with wind in the vertex shader) is the standard for close-up
lawns. Here the lawn is only seen beyond the fence, so a photo texture is enough for now.

Sources:
[three.js forum – One Draw Call, Massive Crowd](https://discourse.threejs.org/t/one-draw-call-massive-crowd-performance-engineering-in-three-js/89928),
[three.js forum – Animated Instanced Skinned Meshes](https://discourse.threejs.org/t/animated-instanced-skinned-meshes-gltf/41958),
[NVIDIA GPU Gems 3, ch. 2 – Animated Crowd Rendering](https://developer.nvidia.com/gpugems/GPUGems3/gpugems3_ch02.html),
[Geopostors: geometry/impostor crowds](https://www.tara.tcd.ie/items/2376b715-5122-45f5-8cfe-0438f64f1c7b),
[three.js forum – dynamic impostors](https://discourse.threejs.org/t/about-dynamic-imposters/27330/5),
[Unigine forum – stadium crowd](https://developer.unigine.com/forum/topic/5960-stadium-crowd),
[@takram/three-clouds](https://cdn.jsdelivr.net/npm/@takram/three-clouds@0.7.4/README.md),
[Codrops – stylised water in R3F](https://tympanus.net/codrops/?p=88608),
[Codrops – three.js instances](https://tympanus.net/codrops/?p=96795),
[Meadow FPS – 2M instanced grass blades](https://learnwithhasan.com/prototypes/meadow-fps/).

## Implemented in this pass

| Feature | How | Where |
| --- | --- | --- |
| **Crowd impostors** | At load, the players' own Rocketbox avatars are posed (sitting, two clap frames, cheering) and rendered into a 1008×704 atlas: 8 shirt colours plus the female avatar. Each seat is a cylindrical billboard in one instanced draw call per stand, with a random variant, mirroring, shade and clap rate. The crowd claps or jumps up to cheer after points, harder for aces, winners and games. | `src/scene/Crowd.tsx`, `src/scene/athlete/posed.ts` |
| **Officials** | A chair umpire, ball kids kneeling at the net posts and ball kids standing behind the far baseline. They are real avatars with bones aimed in world space (static poses), and shirts recoloured to a kit. Low quality: umpire only. Medium: plus the net ball kids. High: all. | `src/scene/Officials.tsx` |
| **Ball marks** | An oval skid mark at every bounce, along the ball's path, longer for faster balls. Clay keeps them (40 s), grass fades (12 s), hard courts show a faint scuff (4 s). One instanced draw call. | `src/scene/Fx.tsx` |
| **Hillside town** | A terraced hillside behind the club with about 250 whitewashed houses with terracotta roofs, two instanced draw calls, seated on their lowest corner so none float. Replaces the grey towers. | `src/scene/Backdrop.tsx` |
| **The bay** | The lawn now ends at a beach 120 m east of the court. The sea uses a Fresnel and sun-glint shader with travelling wave normals. | `src/scene/Backdrop.tsx`, `src/scene/Court.tsx` |
| **Clouds** | A dome with an fbm cloud deck that drifts and is lit from the sun side (medium and high). | `src/scene/Backdrop.tsx` |

**Cost**, measured from the gameplay camera, per frame, shadows and post-processing
included:

| Quality | Draw calls (before → after) | Triangles (before → after) |
| --- | --- | --- |
| Low | 157 → 159 | 85k → 93k |
| Medium | 161 → 173 | 125k → 128k |
| High | 196 → 220 | 125k → 162k |

The crowd sprites cost less than the capsules they replace. The extra cost on high is mostly
the four ball kids and their shadows.

## Landscape pass

- **Vegetation** (`Nature.tsx`): about 2,400 trees on High (1,400 Medium, 500 Low) on the
  hills: cypresses on the lower ground, umbrella pines on the ridges, olives on the open
  terraces. They are scattered in groves by a noise field (`woodland` in `terrain.ts`) from
  95 m out, so the club grounds stay open. Low-poly and instanced: three draw calls.
- **Hillside colours** follow the same field: golden dry grass on open slopes, maquis scrub,
  dark green under the groves, pale rock higher up, instead of one olive tone.
- **Mountain ridges** in three layers with smooth massifs, pre-blended toward the haze (blue
  and lighter with distance) and drawn without fog, so they read as layered distance instead
  of one grey band.
- **Town**: walls in whitewash, sand, ochre and faded terracotta.
- **Grade**: a little saturation after the AgX tone mapping, which washes colours out.

## Performance pass

Measured in a rally (dev build, per frame): all the game logic (physics at 120 Hz, the
director, the AI and both athletes' animation with IK) takes well under a millisecond of
CPU. The cost is the GPU: the render passes and the vertices and pixels they push. So:

- **Trees** were most of the scene's vertices (648k of 796k). They are now indexed and
  ~25-30 vertices each, with a few hundred fewer: 160k, the whole scene 358k.
- **Frame-rate setting** (menu, saved): 60 fps, or 30 fps for quiet fans and battery.
  Physics still steps at 120 Hz either way.
- **Menus** render the backdrop at 20 fps instead of 30.
- **Far field baked like a skybox** (`FarField.tsx`): everything beyond ~100 m (hills, groves,
  town, ridges, the bay, the outer lawn) is rendered into a panorama around the camera (8
  sectors of 45 degrees, linear HDR, fog and lighting included) and drawn every frame as one
  textured sphere. It is re-baked one sector per frame only when the camera has moved more
  than 6 m (parallax), plus a slow background refresh for late-loading textures. The near
  lawn is clipped to an octagon so it never covers the baked hills. Clouds stay live.
- Rewriting game code in Rust/WebAssembly would not help: it is not where the time goes.

## Next steps, by value

1. **Clubhouse depth.** Recessed windows and arches, a balcony rail, shutters and a terrace
   with tables, as real geometry with the photo stucco. Today it is the flattest object in
   the centre of the frame.
2. **Palm fronds.** Curved, segmented fronds with leaflet cards and a little wind sway in
   the vertex shader, instead of flat cards.
3. **Crowd, close rows.** Instanced skinned avatars (bone texture per instance) for the
   first two rows, to be seen from the side cameras; impostors stay for the rest. More
   avatar variety: more Rocketbox characters through `tools/rocketbox/`.
4. **Animated ball kids.** Run to collect balls after a point, using the players' rig.
5. **Instanced grass** in a band just outside the fence, for the menu orbit and replays.
6. **Cascaded shadow maps** (soft contact blobs under the players are done) (three `CSM`) for crisp shadows near the camera and wide coverage.
7. **Replay camera with depth of field** after big points, using the existing slow motion.
