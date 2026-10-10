# Physics and gameplay research

## 1. Physics libraries

| Library | What it gives | Fit for this game |
| --- | --- | --- |
| **Rapier** (`@react-three/rapier`, Rust→WASM, in use) | Rigid bodies, CCD, contact events, a debug renderer, determinism option | Keep. The ball/court/net/fence contacts and CCD are exactly what we need. `<Physics debug>` is now wired to the lab's "colliders" toggle. |
| Jolt (`jolt-physics`, C++→WASM) | Fast, maintained by the engine author, soft bodies/cloth | Only worth it for a cloth net. Not a reason to switch engines. |
| Havok (`@babylonjs/havok`) | Battle-tested, first-class only in Babylon.js | Thin Three.js docs, no R3F bindings. No gain here. |
| cannon-es | Pure JS, simple | No CCD, which a 50 m/s ball needs. Slower than Rapier. |

**No general physics engine models air.** Drag, Magnus lift and the tennis bounce (slide→roll friction
with spin, speed-dependent restitution) are tennis-specific and stay as our own small model in
`src/physics/flight.ts`. That is what every engine-based tennis game does. The code is ~150 lines,
covered by tests, and checked against Rapier in `rapier-agreement.test.ts`.

What the libraries do add, so effects can be **seen and tuned rather than hand-coded**:

| Need | Library | Where |
| --- | --- | --- |
| Live sliders for every physics/gameplay number | **leva** | `src/lab/LabPanel.tsx` (`?lab`) |
| FPS, GPU/CPU time, draw calls | **r3f-perf** | lab "perf" toggle |
| Collider wireframes | **Rapier debug renderer** | lab "colliders" toggle |
| Thick trajectory lines | **drei `<Line>`** (Line2) | lab "trajectory" |
| Force/spin arrows | three `ArrowHelper` | lab "forces" |
| Slow motion | `useRapier().step()` | lab "time scale" |
| Ball trail (in game) | drei `<Trail>` | `Ball.tsx` |

Further candidates, not added yet:

- **theatre.js:** keyframe editor for the swing animations, an alternative to `poses.ts` arrays.
- **maath:** damping/easing helpers for camera and animation smoothing.
- **three-mesh-bvh:** fast raycasts, only if racket–ball contact moves to mesh collision.
- **Mixamo/Rokoko mocap clips:** real tennis motions retargeted onto the Rocketbox skeleton
  (needs a licensed tennis clip pack).

## 2. Physics reference values

- **Ball:** 57 g, r = 3.35 cm. Free-flight drag Cd ≈ 0.51. Magnus lift
  CL = 1/(2 + v/(rω)) (Stepanek 1988).
- **Pro forehand:** ~30 m/s launch, 2,500–3,300 rpm (260–350 rad/s), net crossing ~0.9–1.5 m above the
  tape. [Cross, *Ball trajectories*](https://www.physics.usyd.edu.au/~cross/TRAJECTORIES/42.%20Ball%20Trajectories.pdf):
  - at 30 m/s from 1 m, a flat ball needs a 4° launch angle to clear the net;
  - with 20 rev/s topspin, 5.5°.
- **Surfaces:** ITF Court Pace Rating CPR = 100(1−μ) + 150(0.81−e). Clay ≈ 21, hard ≈ 41, grass ≈ 50
  (tested in `flight.test.ts`).

## 3. Why topspin balls flew so high

The shot solver picks the launch angle that lands the ball at the target depth for a given speed. At
club pace (×0.78) a topspin left the racket at 22.6 m/s. That is too slow to reach 9 m past the net on
a flat line, so the solver lofted it: it crossed the net at **2.86 m** with a 2.9 m apex. Real club
topspin crosses at 1.8–2.2 m.

Spin barely mattered. Launch speed dominates:

| club topspin launch | apex | post-bounce apex |
| --- | --- | --- |
| 22.6 m/s (old) | 2.93 m | 1.56 m |
| 25.5 m/s | 2.22 m | 1.18 m |
| 26.4 m/s (new: 30 × 0.88) | ~2.2 m | ~1.2 m |
| 30 m/s (tour) | 1.95 m | 1.07 m |

Fix:

- club pace raised to ×0.88;
- topspin is now 30 m/s, 230 rad/s, net clearance 0.4 m;
- spin scales with pace, like racket-head speed does.

A test (`flight.test.ts`) keeps the club net crossing under 2.35 m and the tour crossing under 2.0 m.

## 4. Gameplay: why "easy" was hard, and what changed

A human loses to a weak AI for reasons outside the AI's skill:

1. **Positioning.** Lining up 1.1 m beside a 22 m/s ball by hand is hard. The assist only kicked in
   after a shot key was pressed.
2. **Timing.** The ±0.07 s perfect window and 0.05–0.48 s good window are tight at 60 fps.
3. **Reach.** Balls more than 1.55 m to the side were simply missed.
4. **The AI's direction.** It aimed away from the player 72% of the time, even on easy.

Changes (all per difficulty, tunable in the lab):

| | easy | pro | ace |
| --- | --- | --- | --- |
| auto-positioning before a key press (`track`) | 0.55 | 0.2 | 0 |
| assist after a key press | 1.0 | 0.75 | 0.6 |
| timing window stretch | ×1.6 | ×1.15 | ×1 |
| reach | 1.9 m | 1.65 m | 1.55 m |
| player shot scatter | ×0.6 | ×0.85 | ×1 |
| AI speed / reaction | 3.8 m/s / 0.55 s | 5.6 / 0.22 | 6.6 / 0.1 |
| AI unforced error base | 16% | 5% | 1.5% |
| AI aims through the middle | 60% | 28% | 15% |

Headless match simulations (`npm test`) with a scripted player:

| Opponent | Before | After |
| --- | --- | --- |
| easy | ~5–3, close | 4–0 |
| pro | AI won | 2–4 |
| ace | AI won | 0–4 |

## 5. Further gameplay ideas, in order of value

1. **Shot charge.** Holding the key longer adds power at the cost of accuracy, as in many arcade tennis games.
2. **Contact-zone ring.** A ground ring where the player should stand for the incoming ball, shown on
   easy only (the predictor already knows the point).
3. **Stamina/momentum.** Long sprints reduce the next shot's pace, which rewards positioning.
4. **AI personalities.** Baseliner, net rusher and pusher variants of `chooseShot`.
5. **Replays.** Keep the last point's ball and athlete states (~6 s × 120 Hz) and replay them with a
   free camera and slow motion (the lab's slow-motion stepper already does the time scaling).
6. **Mocap swings.** Replace the procedural swing keys with retargeted clips.
