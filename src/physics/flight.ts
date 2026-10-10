import { BALL, COURT, PHYSICS, netHeightAt } from '../game/constants'

// The whole ball, analytically: air (drag and Magnus lift), gravity, the tennis bounce, the net
// (body and tape) and the fence, in one step (stepBall). The live ball (ballBody.ts), the
// predictor (landing marker, AI, shot solver) and the multiplayer server all run it, so they
// agree exactly. No physics engine: a tennis ball needs none of a rigid-body solver.

export interface V3 {
  x: number
  y: number
  z: number
}

const RHO = 1.21
/**
 * Aerodynamic coefficients. Mutable so the Physics Lab (?lab) can tune them live.
 * cd: free-flight drag of a new ball without spin (~0.51); spin adds to it (see spinDrag).
 * magnus: multiplier on the Stepanek lift coefficient.
 */
export const AERO = { cd: 0.51, magnus: 1 }
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
  const spin = Math.hypot(w.x, w.y, w.z)
  const drag = -K_AIR * (AERO.cd + spinDrag((BALL.radius * spin) / speed)) * speed
  out.x = drag * v.x
  out.y = drag * v.y
  out.z = drag * v.z

  if (spin > 1e-3) {
    // Magnus: direction of w x v, lift coefficient from Stepanek (1988).
    const cx = w.y * v.z - w.z * v.y
    const cy = w.z * v.x - w.x * v.z
    const cz = w.x * v.y - w.y * v.x
    const cl = AERO.magnus / (2 + speed / (BALL.radius * spin))
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

/**
 * Extra drag from spin, from Stepanek's (1988) fit Cd = 0.508 + (22.503 + 4.196 S^-2.5)^-0.4
 * with spin ratio S = r w / v: heavy topspin (S ~ 0.3) drags ~30% more than a flat ball,
 * so it slows and drops sooner.
 */
export function spinDrag(S: number): number {
  if (S < 1e-3) return 0
  return Math.pow(22.503 + 4.196 * Math.pow(S, -2.5), -0.4)
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
  /** The ball meets the body of the net (below the tape) before its first bounce. */
  intoNet: boolean
  /** Time of the first contact with the net, body or tape (null: it never touched). */
  netT: number | null
  /** The ball clipped the tape (a net cord) before its first bounce. */
  cord: boolean
}

export interface SimOptions {
  dt?: number
  maxT?: number
  maxBounces?: number
  /** Store every n-th step as a sample. */
  sampleEvery?: number
  /**
   * false: pure flight through the net plane, stopping at the net body (the shot solver's
   * trials). Default: the full ball, net cords and the fence included, as the live ball plays.
   */
  collide?: boolean
}

const tmpF: V3 = { x: 0, y: 0, z: 0 }

/** What happened to the ball during one step. */
export interface StepEvents {
  /** Bounced off the court: where, and its speed into the ground. */
  bounce: { x: number; z: number; vy: number } | null
  net: 'tape' | 'body' | null
  fence: boolean
  /** Crossed the net plane (inside the posts) this step, at this height and x. */
  cross: { x: number; y: number } | null
}

export function newEvents(): StepEvents {
  return { bounce: null, net: null, fence: false, cross: null }
}

export function resetEvents(ev: StepEvents) {
  ev.bounce = null
  ev.net = null
  ev.fence = false
  ev.cross = null
}

/** Restitution off the net tape (a taut cable inside the cloth band): a cord ball keeps little. */
const TAPE_E = 0.3
/** Radius of the tape's rounded top, for the contact normal. */
const TAPE_R = 0.006

/**
 * One physics step of the ball: drag, Magnus lift and gravity (semi-implicit Euler), then the
 * court, the net and the fence. The live ball, the predictor and the server all step through
 * this, so they agree exactly. Mutates p, v, w; reports contacts in `ev` (reset by the caller).
 */
export function stepBall(p: V3, v: V3, w: V3, dt: number, ev: StepEvents, collide = true) {
  const r = BALL.radius
  aeroForce(v, w, tmpF)
  const damp = 1 / (1 + dt * SPIN_DAMPING)
  w.x *= damp
  w.y *= damp
  w.z *= damp
  const invM = 1 / BALL.mass
  v.x += tmpF.x * invM * dt
  v.y += (tmpF.y * invM + PHYSICS.gravity) * dt
  v.z += tmpF.z * invM * dt
  const px = p.x
  const py = p.y
  const pz = p.z
  p.x += v.x * dt
  p.y += v.y * dt
  p.z += v.z * dt

  // The net: crossing its plane inside the posts.
  if (pz !== 0 && Math.sign(pz) !== Math.sign(p.z)) {
    const f = pz / (pz - p.z)
    const xc = px + (p.x - px) * f
    const yc = py + (p.y - py) * f
    if (Math.abs(xc) < COURT.netPostX) {
      ev.cross = { x: xc, y: yc }
      const h = netHeightAt(xc)
      if (yc - r < h) {
        const side = Math.sign(pz)
        if (!collide || yc + r * 0.3 < h) {
          // Into the body of the net: it swallows the pace and the ball drops on this side.
          ev.net = 'body'
          if (collide) {
            p.x = xc
            p.y = yc
            p.z = side * (r + 0.005)
            v.z = -v.z * 0.1
            v.x *= 0.3
            v.y *= 0.3
            w.x *= 0.3
            w.y *= 0.3
            w.z *= 0.3
          }
        } else {
          // The tape: it rolls over or falls back, by where on the rounded top it struck.
          ev.net = 'tape'
          const dy = yc - h
          const reach = r + TAPE_R
          const dz = side * Math.sqrt(Math.max(0, reach * reach - dy * dy))
          const len = Math.hypot(dy, dz) || 1
          const ny = dy / len
          const nz = dz / len
          const vn = v.y * ny + v.z * nz
          if (vn < 0) {
            v.y -= (1 + TAPE_E) * vn * ny
            v.z -= (1 + TAPE_E) * vn * nz
          }
          v.x *= 0.85
          v.y *= 0.85
          v.z *= 0.85
          w.x *= 0.6
          w.y *= 0.6
          w.z *= 0.6
          p.x = xc
          p.y = h + ny * reach
          p.z = nz * reach
        }
      }
    }
  }

  if (p.y <= r && v.y < 0) {
    ev.bounce = { x: p.x, z: p.z, vy: v.y }
    p.y = r
    applyBounce(v, w)
  }

  // The fence (its inside faces), up to its top; above it the ball leaves the venue.
  if (collide && p.y < COURT.fenceHeight) {
    if (Math.abs(p.x) > COURT.fenceX - r && v.x * p.x > 0) {
      p.x = Math.sign(p.x) * (COURT.fenceX - r)
      v.x *= -0.25
      v.y *= 0.7
      v.z *= 0.7
      ev.fence = true
    }
    if (Math.abs(p.z) > COURT.fenceZ - r && v.z * p.z > 0) {
      p.z = Math.sign(p.z) * (COURT.fenceZ - r)
      v.z *= -0.25
      v.y *= 0.7
      v.x *= 0.7
      ev.fence = true
    }
  }
}

const simEv = newEvents()

/** Flies the ball from (p0, v0, w0): samples, bounces, and how it met the net. */
export function simulate(p0: V3, v0: V3, w0: V3, opts: SimOptions = {}): Flight {
  const dt = opts.dt ?? PHYSICS.timeStep
  const maxT = opts.maxT ?? 4
  const maxBounces = opts.maxBounces ?? 2
  const every = opts.sampleEvery ?? 1
  const collide = opts.collide ?? true
  const p = { ...p0 }
  const v = { ...v0 }
  const w = { ...w0 }
  const samples: Sample[] = []
  const bounces: Bounce[] = []
  let netCrossY: number | null = null
  let netCrossX: number | null = null
  let intoNet = false
  let cord = false
  let netT: number | null = null
  let step = 0

  for (let t = 0; t <= maxT; t += dt) {
    if (step++ % every === 0) samples.push({ t, x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z })
    resetEvents(simEv)
    stepBall(p, v, w, dt, simEv, collide)
    if (simEv.cross && netCrossY === null && bounces.length === 0) {
      netCrossY = simEv.cross.y
      netCrossX = simEv.cross.x
    }
    if (simEv.net && netT === null) netT = t
    if (simEv.net && bounces.length === 0) {
      if (simEv.net === 'body') intoNet = true
      else cord = true
    }
    // Without collisions the flight ends at the net body (nothing to say past it).
    if (!collide && intoNet) {
      samples.push({ t, x: p.x, y: p.y, z: 0, vx: 0, vy: 0, vz: 0 })
      break
    }
    if (simEv.bounce) {
      bounces.push({ t, x: simEv.bounce.x, z: simEv.bounce.z, vy: simEv.bounce.vy })
      if (bounces.length >= maxBounces) break
    }
  }
  return { samples, bounces, netCrossY, netCrossX, intoNet, netT, cord }
}

export interface BallState {
  p: V3
  v: V3
  w: V3
}

const advEv = newEvents()

/**
 * Ball state `duration` seconds after (p0, v0, w0): the same steps as `simulate`, contacts
 * included. Used to fast-forward a networked ball to the present.
 */
export function advance(p0: V3, v0: V3, w0: V3, duration: number, dt: number = PHYSICS.timeStep): BallState {
  const p = { ...p0 }
  const v = { ...v0 }
  const w = { ...w0 }
  const steps = Math.max(0, Math.round(duration / dt))
  for (let i = 0; i < steps; i++) stepBall(p, v, w, dt, advEv)
  return { p, v, w }
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
  // Change in tangential speed that grips the court (Cross 2005): not just stopping the contact
  // point but reversing it a little (tangential restitution), so a gripping ball leaves with a
  // touch of overspin and a livelier kick; vs. what friction can supply (slide).
  const gripDv = u * (ALPHA / (1 + ALPHA)) * (1 + TANGENTIAL_E)
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
  /** Fast (CPR ~50): skids, and the soft turf takes more out of the bounce (stays low). */
  grass: surface(0.6, 0.74),
}

export const HARD_COURT = SURFACES.hard
let currentSurface: Surface = SURFACES.hard

export function setSurface(id: SurfaceId) {
  currentSurface = SURFACES[id]
}

/** Retunes a surface in place (Physics Lab). */
export function tuneSurface(id: SurfaceId, mu: number, e: number) {
  Object.assign(SURFACES[id], surface(mu, e))
}

/** Tangential coefficient of restitution of a gripping bounce (Cross 2005 measures ~0.1-0.2). */
export const TANGENTIAL_E = 0.12

/** Moment of inertia factor of a tennis ball (I = ALPHA m r^2). */
export const ALPHA = 0.55

/** Spin decay of the ball in flight (~5%/s). */
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
  /** Fixed launch angle (lob, slice): solves for speed instead, raised only to clear the net. */
  lobPitch?: number
  /** Spin about the vertical axis (rad/s): positive curves the ball to its left. */
  sidespin?: number
  /**
   * Spin about the direction of travel (rad/s), as on a kick serve's tilted axis. It does
   * nothing in the air but grips at the bounce and kicks the ball sideways: positive to the
   * ball's right.
   */
  gyro?: number
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
  const g = req.gyro ?? 0
  const w = { x: a.x * req.spin + d.x * g, y: req.sidespin ?? 0, z: a.z * req.spin + d.z * g }
  return { v, w, d }
}

// The solver runs many trial flights per shot; it uses the physics step (1/120 s), which
// also matches the live ball's step, and stops sampling (only the bounce matters).
const SOLVER_OPTS: SimOptions = { maxBounces: 1, maxT: 5, sampleEvery: 1_000_000, collide: false }

function carry(req: ShotRequest, speed: number, pitch: number): { dist: number; flight: Flight } {
  const { v, w, d } = launch(req, speed, pitch)
  const flight = simulate(req.from, v, w, SOLVER_OPTS)
  // Into the net is short of any target past it: the search raises the trajectory.
  if (flight.intoNet) return { dist: 0, flight }
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
    // Fixed launch angle (lob, slice): solve the speed for the distance, raising the angle
    // a little at a time if that line would not clear the net.
    let pitch = req.lobPitch
    let speed = 4
    for (let attempt = 0; attempt < 12; attempt++) {
      let lo = 4
      let hi = 45
      for (let i = 0; i < 24 && hi - lo > 0.01; i++) {
        const mid = (lo + hi) / 2
        if (carry(req, mid, pitch).dist < goal) lo = mid
        else hi = mid
      }
      speed = (lo + hi) / 2
      if (clearsNet(req, carry(req, speed, pitch).flight)) break
      pitch += 0.025
    }
    return finish(req, speed, pitch)
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
