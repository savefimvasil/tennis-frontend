# Maybe Tennis?

A browser tennis game inspired by GTA V's tennis minigame, built with React, Three.js
(@react-three/fiber), Rapier physics and post-processing.

Play it at https://maybe-tennis.com/ (with online play) or
https://savefimvasil.github.io/tennis-frontend/ (single player; both deployed from `main` by GitHub Actions).

SEO and sharing: `index.html` carries the description, Open Graph and Twitter cards and
schema.org `VideoGame` data, plus a static intro that crawlers see without JavaScript (React
replaces it on load). `public/` holds the favicon (`favicon.svg`, PNG sizes rendered from it),
`manifest.webmanifest`, `robots.txt`, `sitemap.xml` and `og-image.png` (the menu, 1200×630).

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

## Online

The game looks for a multiplayer server when it starts. The **Play online** button appears
only when a server answers. Without one, everything else works offline.

The online lobby offers quick match, open or private games (join by code), and a live list
of open games. The server is
[tennis-backend](https://github.com/savefimvasil/tennis-backend), and it referees every
shot:
- this client sends only key presses, the toss and its swings;
- the server checks each swing against its own simulation of the ball;
- it recomputes the shot with the same code (`src/game/shot.ts`, `src/physics/flight.ts`);
- it makes every call.

Where the game looks for the server, first match wins:

| Where | Example |
| --- | --- |
| `?server=` in the page URL | `http://localhost:5173/?server=http://192.168.1.5:3000` |
| `VITE_SERVER_URL` at build time | `VITE_SERVER_URL=https://play.example.com npm run build`; `none` disables online |
| Development | port 3000 on the same host |
| Production | the page's own origin (the Docker stack in tennis-backend/deploy) |

To play two copies of the game against each other headlessly (each in its own process,
against a running server):

```bash
LIVE_SERVER=http://localhost:3000 ROLE=host  npx vitest run src/net/online.live.test.ts &
LIVE_SERVER=http://localhost:3000 ROLE=guest npx vitest run src/net/online.live.test.ts
```

## Deploy

- **GitHub Pages** (`.github/workflows/deploy.yml`): the offline build. Set the repository
  variable `SERVER_URL` to an `https://` server to enable online play there.
- **Your own server** (`.github/workflows/server.yml`, `Dockerfile`, `nginx.conf`): the
  image is published to `ghcr.io/savefimvasil/tennis-frontend` and deployed by the stack
  in [tennis-backend/deploy](https://github.com/savefimvasil/tennis-backend/tree/main/deploy).

## Graphics settings

| Setting | Resolution cap | Shadows | Post-processing |
| --- | --- | --- | --- |
| High | 1.5x device pixels | 2048 px | ambient occlusion, bloom, SMAA, vignette |
| Medium (default) | 1.25x | 1024 px | SMAA, vignette |
| Low | 1x, fewer spectators | 1024 px | SMAA, vignette |

Rendering is capped at 60 fps in play and 30 fps in menus, at a fixed resolution per setting.

The crowd is made of sprite impostors of the players' own avatars, baked into an atlas at
load (one draw call per stand). The umpire and ball kids are posed avatars, bounces leave
ball marks, and the backdrop is a hillside town, a bay and a cloud layer.
`docs/GRAPHICS.md` covers the research behind these, their cost per quality preset and the
next steps.

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
© 2020 Microsoft; see `public/models/rocketbox/LICENSE.md`), driven by the game's procedural animation rig (see [docs/ANIMATION.md](docs/ANIMATION.md)).
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
