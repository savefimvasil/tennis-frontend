# Mixamo motion capture

The forward run and the fast crossover run sideways come from Mixamo clips (free for use in
games; the raw FBX files themselves may not be redistributed). `convert.ts` reads them from
`input/` and writes only the derived joint rotations the game uses, in the rig's own joint space,
to `src/scene/athlete/mocap.json`:

| Cycle | Clip | Notes |
| --- | --- | --- |
| `run` | Run Forward | one cycle, ~2.9 m in 0.6 s |
| `strafeRight` | Right Strafe | a run with the hips turned ~75 degrees into it |
| `strafeLeft` | Right Strafe, mirrored | |

Only the legs, the spine and the pelvis height and heading are taken: the arms hold the racket
and stay procedural, as do the strokes, the slow side shuffle and backpedalling.

```bash
npm run dev                 # in another terminal
node tools/mixamo/run.mjs   # needs playwright
```

`inspect.html` lists what is in each FBX (duration, bones, root motion).
