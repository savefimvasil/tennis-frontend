# Baseline Tennis

A browser tennis game inspired by GTA V's tennis minigame, built with React, Three.js
(@react-three/fiber), Rapier physics and post-processing.

Play it at https://savefimvasil.github.io/tennis-frontend/ (deployed from `main` by GitHub Actions).

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # scoring, flight model, Rapier agreement and full headless match simulations
npm run build
npm run format   # Prettier
```

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move / aim | Arrow keys | Left stick |
| Topspin | Q (or Space) | A / Cross |
| Flat | W | X / Square |
| Slice | E | B / Circle |
| Lob | R | Y / Triangle |
| Pause | Esc / P | Start |

**Serve:** Left/Right steps along the baseline. Hold a shot key to toss and release while the meter is
in the zone; hold Left/Right as you release to angle the serve wide or down the T. Timing sets the power.
Serve keys: W flat, E slice, Q kick, R safe.

**Rally:** press a shot key as the ball comes in. Hold an arrow to aim; Up hits deeper, Down shorter.

## Options

- **Player:** five shirt colours on the male avatar, or the female avatar.
- **Opponent:** Club, Pro, Champion (speed, reaction, pace, errors and how close to the lines it aims).
  Lower levels also help you: auto-positioning toward the ball, wider timing windows, longer reach and
  tighter shot scatter (`PLAYER_HELP` in `src/game/tuning.ts`).
- **Court:** hard, clay, grass, tuned to the ITF Court Pace Rating bands.
- **Pace:** Club (slower, GTA-like rallies) or Tour (pro ball speeds).

## Graphics settings

| Setting | Resolution cap | Shadows | Post-processing |
| --- | --- | --- | --- |
| High | 1.5x device pixels | 2048 px | ambient occlusion, bloom, SMAA, vignette |
| Medium (default) | 1.25x | 1024 px | SMAA, vignette |
| Low | 1x, fewer spectators | 1024 px | SMAA, vignette |

Rendering is capped at 60 fps in play and 30 fps in menus, at a fixed resolution per setting.

## Physics Lab

Open the game with `?lab` (e.g. `http://localhost:5173/?lab`) to get a live tuning panel
([leva](https://github.com/pmndrs/leva)) and on-court visualisation:

- **View:** predicted flight (yellow, orange after the bounce), arrows on the ball for velocity (white),
  spin axis (magenta), drag (red) and Magnus force (cyan), Rapier collider wireframes, the
  [r3f-perf](https://github.com/utsuboco/r3f-perf) panel, and slow motion.
- **Air:** drag coefficient, Magnus multiplier, wind.
- **Shots:** club pace and speed/spin/net clearance/depth of every shot.
- **Surfaces:** friction and restitution of hard, clay and grass.
- **Difficulty:** every AI and player-help number per level.

Changes apply to the next shot. The lab is code-split and not downloaded in normal play.
`docs/RESEARCH.md` has the background: physics references, libraries considered and gameplay notes.

## Characters

Players are [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) avatars (MIT license,
© 2020 Microsoft; see `public/models/rocketbox/LICENSE.md`), driven by the game's procedural animation rig.
`tools/rocketbox/README.md` explains how to add more avatars.

## Layout

- `src/game` – constants (ITF metres), scoring rules, match director (serve/rally/referee), tuning, store
- `src/physics` – aerodynamic forces (drag + Magnus), court surfaces and bounce, trajectory predictor and shot solver
- `src/ai` – opponent movement and shot selection
- `src/scene` – court, net, venue, lighting, post-processing, ball, effects, camera, athletes
- `src/ui` – HUD and menus

Rapier detects contacts and handles the net, fence and rolling. Air drag and Magnus lift are added as
forces each physics step, and bounces on the court use a tennis-specific model (speed-dependent
restitution, sliding or gripping friction, hollow-ball inertia) shared with the predictor.
