# Rocketbox avatar conversion

Players use [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) avatars (MIT license,
copy in `public/models/rocketbox/LICENSE.md`). The game currently ships `Sports_Male_04`.

## Adding another avatar

1. Copy `Assets/Avatars/<Group>/<Name>/Export/<Name>.fbx` from the Rocketbox repo to `tools/rocketbox/input/`.
2. Convert its `Textures/*_color.tga` and `*_normal.tga` to 1024px JPEGs in `public/models/rocketbox/`.
3. With `npm run dev` running, convert the FBX to a GLB (needs Playwright, `npm i -D playwright`):

   ```bash
   node tools/rocketbox/run.mjs <Name>
   ```

   This writes `public/models/rocketbox/<Name>.glb` (metres, feet on the ground, plain materials) and prints
   the skeleton for checking.
4. Add an entry to `ROCKETBOX` in `src/scene/athlete/Rocketbox.tsx`.

All Rocketbox adults share the same 3ds Max Biped skeleton, so the bone mapping in `Rocketbox.tsx` works for any of them.
