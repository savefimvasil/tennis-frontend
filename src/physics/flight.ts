import { BALL, COURT, PHYSICS, netHeightAt } from '../game/constants'

// Rapier handles gravity, bounces, friction and collisions for the real ball.
// No physics engine models air, so drag and Magnus lift are added here as forces.
// The same model also powers a lightweight predictor (landing marker, AI, shot solver).

export interface V3 {
  x: number
  y: number
  z: number
}

const RHO = 1.21
/** Free-flight drag of new balls (~0.51); wind-tunnel values run 15-20% higher. */
const CD = 0.51
const AREA = Math.PI * BALL.radius * BALL.radius
const K_AIR = 0.5 * RHO * AREA

/** Horizontal wind (m/s). Shared by the live ball and the predictor so aiming accounts for it. */
export const wind: V3 = { x: 0, y: 0, z: 0 }

export function setWind(x: number, z: number) {
  wind.x = x
  wind.z = z
}

const rel: V3 = { x: 0, y: 0, z: 0 }

/** Aerodynamic force (N) for velocity v (m/s) and spin w (rad/s), relative to the wind. Writes into `out`. */
export function aeroForce(vGround: V3, w: V3, out: V3): V3 {
  rel.x = vGround.x - wind.x
  rel.y = vGround.y
  rel.z = vGround.z - wind.z
  const v = rel
  const speed = Math.hypot(v.x, v.y, v.z)
  if (speed < 1e-4) {
    out.x = out.y = out.z = 0
    return out
  }
  const drag = -K_AIR * CD * speed
  out.x = drag * v.x
  out.y = drag * v.y
  out.z = drag * v.z

  const spin = Math.hypot(w.x, w.y, w.z)
  if (spin > 1e-3) {
    // Magnus: direction of w x v, lift coefficient from Stepanek (1988).
    const cx = w.y * v.z - w.z * v.y
    const cy = w.z * v.x - w.x * v.z
    const cz = w.x * v.y - w.y * v.x
    const cl = 1 / (2 + speed / (BALL.radius * spin))
    const mag = Math.hypot(cx, cy, cz)
    if (mag > 1e-6) {
      const f = (K_AIR * cl * speed * speed) / mag
      out.x += f * cx
      out.y += f * cy
      out.z += f * cz
    }
  }
  return out
}

export interface Bounce {
  t: number
  x: number
  z: number
  /** Speed into the ground, used for effects. */
  vy: number
}

export interface Sample {
  t: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

export interface Flight {
  samples: Sample[]
  bounces: Bounce[]
  /** Height of the ball as it crosses the net plane, if it does before the first bounce. */
  netCrossY: number | null
  netCrossX: number | null
}

export interface SimOptions {
  dt?: number
  maxT?: number
  maxBounces?: number
  /** Store every n-th step as a sample. */
  sampleEvery?: number
}

const tmpF: V3 = { x: 0, y: 0, z: 0 }

/**
 * Integrates the flight the same way Rapier does (semi-implicit Euler), with an
 * approximate impulse-based bounce matching the collider materials.
 */
export function simulate(p0: V3, v0: V3, w0: V3, opts: SimOptions = {}): Flight {
  const dt = opts.dt ?? PHYSICS.timeStep
  const maxT = opts.maxT ?? 4
  const maxBounces = opts.maxBounces ?? 2
  const every = opts.sampleEvery ?? 1
  const p = { ...p0 }
  const v = { ...v0 }
  const w = { ...w0 }
  const samples: Sample[] = []
  const bounces: Bounce[] = []
  let netCrossY: number | null = null
  let netCrossX: number | null = null
  const r = BALL.radius
  const invM = 1 / BALL.mass
  let step = 0

  for (let t = 0; t <= maxT; t += dt) {
    if (step++ % every === 0) samples.push({ t, x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z })
    aeroForce(v, w, tmpF)
    const damp = 1 / (1 + dt * SPIN_DAMPING)
    w.x *= damp
    w.y *= damp
    w.z *= damp
    v.x += tmpF.x * invM * dt
    v.y += (tmpF.y * invM + PHYSICS.gravity) * dt
    v.z += tmpF.z * invM * dt
    const pz = p.z
    p.x += v.x * dt
    p.y += v.y * dt
    p.z += v.z * dt

    if (netCrossY === null && bounces.length === 0 && Math.sign(pz) !== Math.sign(p.z) && pz !== 0) {
      const f = pz / (pz - p.z)
      netCrossY = p.y - v.y * dt * (1 - f)
      netCrossX = p.x - v.x * dt * (1 - f)
    }

    if (p.y <= r && v.y < 0) {
      bounces.push({ t, x: p.x, z: p.z, vy: v.y })
      if (bounces.length >= maxBounces) break
      p.y = r
      applyBounce(v, w)
    }
  }
  return { samples, bounces, netCrossY, netCrossX }
}

/**
 * Tennis ball bounce on a hard court (after Cross 2005, "Bounce of a spinning ball near normal incidence",
 * and Brody's sliding/gripping model). Mutates v and w.
 * - Vertical restitution falls slightly with impact speed.
 * - Friction acts on the contact point; if it is strong enough the ball grips (rolls) instead of sliding.
 * - A tennis ball is a thick hollow shell: I = 0.55 m r^2.
 */
export function applyBounce(v: V3, w: V3, surface: Surface = currentSurface) {
  const r = BALL.radius
  const vyIn = Math.max(0, -v.y)
  const e = Math.min(surface.eMax, Math.max(surface.eMin, surface.eMax - surface.eSlope * vyIn))
  v.y = e * vyIn
  // Contact-point velocity u = v + w x (0, -r, 0)
  const ux = v.x + w.z * r
  const uz = v.z - w.x * r
  const u = Math.hypot(ux, uz)
  if (u < 1e-6) return
  // Change in tangential speed needed to stop the contact point (grip), vs. what friction can supply (slide).
  const gripDv = u * (ALPHA / (1 + ALPHA))
  const slideDv = surface.mu * (1 + e) * vyIn
  const dv = Math.min(gripDv, slideDv)
  const dx = (-ux / u) * dv
  const dz = (-uz / u) * dv
  v.x += dx
  v.z += dz
  // dw = (r_c x m dv) / I with r_c = (0, -r, 0)
  const k = 1 / (ALPHA * r)
  w.x += -k * dz
  w.z += k * dx
}

export interface Surface {
  eMax: number
  eMin: number
  eSlope: number
  mu: number
}

/** Vertical speed of the ITF Court Pace Rating test: 30 m/s at 16 degrees. */
const ITF_VY = 30 * Math.sin((16 * Math.PI) / 180)

/** Builds a surface whose restitution equals `e` at the ITF test impact speed. */
function surface(mu: number, e: number): Surface {
  const eSlope = 0.006
  return { mu, eSlope, eMax: e + eSlope * ITF_VY, eMin: e - 0.12 }
}

/** ITF Court Pace Rating: 100(1 - mu) + 150(0.81 - e). Slow <= 29, medium 35-39, fast >= 45. */
export function courtPaceRating(s: Surface): number {
  const e = Math.min(s.eMax, Math.max(s.eMin, s.eMax - s.eSlope * ITF_VY))
  return 100 * (1 - s.mu) + 150 * (0.81 - e)
}

export type SurfaceId = 'hard' | 'clay' | 'grass'

export const SURFACES: Record<SurfaceId, Surface> = {
  /** Slow (CPR ~21): high friction, high bounce. */
  clay: surface(0.75, 0.84),
  /** Medium-fast acrylic (CPR ~41). */
  hard: surface(0.6, 0.8),
  /** Fast (CPR ~50): skids low. */
  grass: surface(0.55, 0.78),
}

export const HARD_COURT = SURFACES.hard
let currentSurface: Surface = SURFACES.hard

export function setSurface(id: SurfaceId) {
  currentSurface = SURFACES[id]
}

/** Moment of inertia factor of a tennis ball (I = ALPHA m r^2). */
export const ALPHA = 0.55

/** Rapier's angular damping on the ball, mirrored by the predictor (spin decays ~5%/s). */
export const SPIN_DAMPING = 0.05

/** Unit spin axis that produces topspin for a ball travelling along horizontal direction (dx, dz). */
export function topspinAxis(dx: number, dz: number): V3 {
  return { x: dz, y: 0, z: -dx }
}

export interface ShotRequest {
  from: V3
  target: { x: number; z: number }
  /** Launch speed (m/s), the starting guess for drive-type shots. */
  speed: number
  /** Signed spin magnitude: positive topspin, negative backspin (rad/s). */
  spin: number
  /** Minimum clearance over the net tape (m). */
  netClearance: number
  /** Lob mode: fixes the launch angle and solves for speed instead. */
  lobPitch?: number
  /** Spin about the vertical axis (rad/s): positive curves the ball to its left. */
  sidespin?: number
}

export interface ShotSolution {
  v: V3
  w: V3
  landing: { x: number; z: number }
  flight: Flight
}

function launch(req: ShotRequest, speed: number, pitch: number): { v: V3; w: V3; d: { x: number; z: number } } {
  const dx = req.target.x - req.from.x
  const dz = req.target.z - req.from.z
  const len = Math.hypot(dx, dz) || 1
  const d = { x: dx / len, z: dz / len }
  const c = Math.cos(pitch)
  const v = { x: d.x * c * speed, y: Math.sin(pitch) * speed, z: d.z * c * speed }
  const a = topspinAxis(d.x, d.z)
  const w = { x: a.x * req.spin, y: req.sidespin ?? 0, z: a.z * req.spin }
  return { v, w, d }
}

// The solver runs many trial flights per shot; it uses the physics step (1/120 s), which
// also matches what Rapier integrates, and stops sampling (only the bounce matters).
const SOLVER_OPTS: SimOptions = { maxBounces: 1, maxT: 5, sampleEvery: 1_000_000 }

function carry(req: ShotRequest, speed: number, pitch: number): { dist: number; flight: Flight } {
  const { v, w, d } = launch(req, speed, pitch)
  const flight = simulate(req.from, v, w, SOLVER_OPTS)
  const b = flight.bounces[0]
  if (!b) return { dist: Infinity, flight }
  return { dist: (b.x - req.from.x) * d.x + (b.z - req.from.z) * d.z, flight }
}

function clearsNet(req: ShotRequest, flight: Flight): boolean {
  if (flight.netCrossY === null) return true
  return flight.netCrossY >= netHeightAt(flight.netCrossX ?? 0) + BALL.radius + req.netClearance
}

/**
 * Finds a launch velocity that lands the ball on `target` with the requested spin,
 * lowering pace if needed to clear the net. Sidespin and crosswind push the ball off
 * line, so the aim point is corrected a few times until the landing matches.
 */
export function solveShot(req: ShotRequest): ShotSolution {
  let aim = { ...req.target }
  let sol = solveOnce(req)
  for (let i = 0; i < 4; i++) {
    const ex = req.target.x - sol.landing.x
    const ez = req.target.z - sol.landing.z
    if (Math.hypot(ex, ez) < 0.06) break
    aim = { x: aim.x + ex, z: aim.z + ez }
    sol = solveOnce({ ...req, target: aim })
  }
  return sol
}

function solveOnce(req: ShotRequest): ShotSolution {
  const goal = Math.hypot(req.target.x - req.from.x, req.target.z - req.from.z)

  if (req.lobPitch !== undefined) {
    let lo = 4
    let hi = 45
    for (let i = 0; i < 24 && hi - lo > 0.01; i++) {
      const mid = (lo + hi) / 2
      if (carry(req, mid, req.lobPitch).dist < goal) lo = mid
      else hi = mid
    }
    return finish(req, (lo + hi) / 2, req.lobPitch)
  }

  let speed = req.speed
  let best: { speed: number; pitch: number } = { speed, pitch: 0.1 }
  for (let attempt = 0; attempt < 14; attempt++) {
    let lo = -0.45
    let hi = 0.7
    if (carry(req, speed, hi).dist < goal) {
      // Cannot reach even at max angle: hit harder.
      speed *= 1.12
      continue
    }
    if (carry(req, speed, lo).dist > goal) {
      speed *= 0.9
      continue
    }
    // ~0.0005 rad is far below what changes the landing spot by a centimetre.
    for (let i = 0; i < 22 && hi - lo > 0.0005; i++) {
      const mid = (lo + hi) / 2
      if (carry(req, speed, mid).dist < goal) lo = mid
      else hi = mid
    }
    const pitch = (lo + hi) / 2
    best = { speed, pitch }
    if (clearsNet(req, carry(req, speed, pitch).flight)) break
    speed *= 0.93
  }
  return finish(req, best.speed, best.pitch)
}

function finish(req: ShotRequest, speed: number, pitch: number): ShotSolution {
  const { v, w } = launch(req, speed, pitch)
  const flight = simulate(req.from, v, w, { maxBounces: 1, maxT: 5 })
  const b = flight.bounces[0]
  return { v, w, flight, landing: b ? { x: b.x, z: b.z } : { x: req.target.x, z: req.target.z } }
}

/** True if (x, z) is inside the singles court half/box given (line counts as in). */
export function inSinglesCourt(x: number, z: number, zSign: 1 | -1): boolean {
  const r = BALL.radius
  return Math.abs(x) <= COURT.singlesHalfWidth + r && z * zSign >= -r && z * zSign <= COURT.halfLength + r
}

export function inServiceBox(x: number, z: number, zSign: 1 | -1, xSign: 1 | -1): boolean {
  const r = BALL.radius
  return (
    x * xSign >= -r &&
    Math.abs(x) <= COURT.singlesHalfWidth + r &&
    z * zSign >= -r &&
    z * zSign <= COURT.serviceLine + r
  )
}
