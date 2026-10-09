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
const CD = 0.55
const AREA = Math.PI * BALL.radius * BALL.radius
const K_AIR = 0.5 * RHO * AREA

/** Aerodynamic force (N) for velocity v (m/s) and spin w (rad/s). Writes into `out`. */
export function aeroForce(v: V3, w: V3, out: V3): V3 {
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

/** Impulse bounce on a horizontal surface: restitution + Coulomb friction on a solid sphere. */
function applyBounce(v: V3, w: V3) {
  const e = BALL.restitution
  const mu = BALL.friction
  const r = BALL.radius
  const vyIn = -v.y
  v.y = e * vyIn
  // Contact-point velocity u = v + w x (0,-r,0)
  const ux = v.x - w.z * r
  const uz = v.z + w.x * r
  const u = Math.hypot(ux, uz)
  if (u < 1e-6) return
  const dv = Math.min(mu * (1 + e) * vyIn, u * (2 / 7))
  const dx = (-ux / u) * dv
  const dz = (-uz / u) * dv
  v.x += dx
  v.z += dz
  // dw = (5 / 2r^2) * (r_c x dv) with r_c = (0,-r,0)
  const k = 5 / (2 * r)
  w.x += -k * dz
  w.z += k * dx
}

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
  const w = { x: a.x * req.spin, y: 0, z: a.z * req.spin }
  return { v, w, d }
}

function carry(req: ShotRequest, speed: number, pitch: number): { dist: number; flight: Flight } {
  const { v, w, d } = launch(req, speed, pitch)
  const flight = simulate(req.from, v, w, { maxBounces: 1, dt: 1 / 240, maxT: 5 })
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
 * lowering pace if needed to clear the net. Always returns a best effort.
 */
export function solveShot(req: ShotRequest): ShotSolution {
  const goal = Math.hypot(req.target.x - req.from.x, req.target.z - req.from.z)

  if (req.lobPitch !== undefined) {
    let lo = 4
    let hi = 45
    for (let i = 0; i < 30; i++) {
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
    for (let i = 0; i < 28; i++) {
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
  const flight = simulate(req.from, v, w, { maxBounces: 1, dt: 1 / 240, maxT: 5 })
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
