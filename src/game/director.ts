import { AI, BALL, COURT, HUMAN, halfSign, other, type Side } from './constants'
import { isDeuceCourt } from './scoring'
import { hudLive, useGame } from './store'
import { pushEvent, sim, type Athlete } from './sim'
import {
  AI_LEVELS,
  GRADE_EFFECT,
  PACE,
  PLAYER,
  RACKET_EA,
  RALLY_BALL_SPEED,
  SERVE,
  SERVES,
  SHOTS,
  TIMING,
  type Grade,
  type ShotType,
} from './tuning'
import {
  aeroForce,
  applyBounce,
  setWind,
  wind,
  inServiceBox,
  inSinglesCourt,
  simulate,
  solveShot,
  type V3,
} from '../physics/flight'
import { pollInput, type InputState } from '../input/input'
import { chooseShot, pickGrade, planIntercept } from '../ai/opponent'

// The match director runs once per physics step (120 Hz): input, movement,
// hitting, AI and refereeing. Rapier does the actual ball physics.

const force: V3 = { x: 0, y: 0, z: 0 }
let serveClock = 0
let pendingAfterDead: 'serve' | 'none' = 'serve'
let aiLetGo = false

function forward(a: Athlete) {
  return { x: Math.sin(a.yaw), z: Math.cos(a.yaw) }
}
function right(a: Athlete) {
  const f = forward(a)
  return { x: -f.z, z: f.x }
}

/** Standard normal sample (Box-Muller), clipped to +-2.5 sigma. */
function gauss() {
  const u = 1 - Math.random()
  const v = Math.random()
  const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return Math.max(-2.5, Math.min(2.5, n))
}

/** Sideways sign (+1 right of centre mark) the server stands on, in world x. */
function serverXSign(server: Side, deuce: boolean): 1 | -1 {
  const s = server === HUMAN ? 1 : -1
  return (deuce ? s : -s) as 1 | -1
}

export function tossPoint(a: Athlete) {
  const f = forward(a)
  const r = right(a)
  return { x: a.x + f.x * 0.42 + r.x * 0.18, y: SERVE.handHeight, z: a.z + f.z * 0.42 + r.z * 0.18 }
}

export function resetForServe() {
  const st = useGame.getState()
  const m = st.match
  sim.server = m.server
  sim.serveNumber = st.serveNumber
  sim.deuceCourt = isDeuceCourt(m)
  sim.phase = 'serve'
  sim.held = true
  sim.lastHitter = null
  sim.hits = 0
  sim.bounces = 0
  sim.firstBounce = null
  sim.netTouched = false
  sim.receiverTouched = false
  sim.landing = null
  sim.prediction = null
  aiLetGo = false
  serveClock = 0
  hudLive.tossMeter = null
  // Coastal breeze: drifts a little between points, occasionally gusting.
  const angle = Math.atan2(wind.z, wind.x) + (Math.random() - 0.5) * 0.9
  const base = Math.hypot(wind.x, wind.z) * 0.6 + Math.random() * 1.4 + (Math.random() < 0.15 ? 1.5 : 0)
  const speed = Math.min(3.5, base)
  setWind(Math.cos(angle) * speed, Math.sin(angle) * speed)
  hudLive.wind = { x: wind.x, z: wind.z }

  const server = sim.server
  const receiver = other(server)
  const xs = serverXSign(server, sim.deuceCourt)
  for (const side of [HUMAN, AI] as Side[]) {
    const a = sim.athletes[side]
    a.vx = a.vz = 0
    a.swing = 'none'
    a.swingT = 0
    a.tossing = false
    a.queued = null
    a.target = null
    a.yaw = side === HUMAN ? Math.PI : 0
  }
  const s = sim.athletes[server]
  s.x = xs * 0.75
  s.z = halfSign(server) * (COURT.halfLength + SERVE.baselineGap)
  const r = sim.athletes[receiver]
  r.x = -xs * 2.85
  r.z = halfSign(receiver) * (COURT.halfLength + 0.9)

  const ball = sim.ball
  if (ball) {
    const p = tossPoint(s)
    ball.setTranslation(p, true)
    ball.setLinvel({ x: 0, y: 0, z: 0 }, true)
    ball.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }
  sim.prevVy = 0
}

function endPoint(winner: Side, title: string, kind?: 'winner' | 'ace' | 'error' | 'double') {
  if (sim.phase === 'dead' || sim.phase === 'idle') return
  sim.phase = 'dead'
  sim.deadTimer = 2.4
  sim.landing = null
  hudLive.tossMeter = null
  sim.athletes[winner].celebrate = 1.4
  const outcome = useGame.getState().point(winner, title, undefined, kind)
  pendingAfterDead = outcome === 'match' ? 'none' : 'serve'
}

function fault(title: string) {
  if (sim.phase !== 'serve') return
  const st = useGame.getState()
  if (st.serveNumber === 2) {
    endPoint(other(sim.server), 'Double fault', 'double')
    return
  }
  st.setServeNumber(2)
  st.showToast(title, 'neutral', 'Second serve')
  sim.phase = 'dead'
  sim.deadTimer = 1.5
  sim.landing = null
  pendingAfterDead = 'serve'
}

function predictFromBall() {
  const b = sim.ball
  if (!b) return
  const p = b.translation()
  const v = b.linvel()
  const w = b.angvel()
  sim.prediction = simulate(p, v, w, { maxBounces: 2, maxT: 3.5, sampleEvery: 2 })
  sim.predictionStart = sim.time
}

type Miss = 'net' | 'long' | 'wide' | null

function strike(
  side: Side,
  shot: ShotType,
  grade: Grade,
  target: { x: number; z: number },
  serve: boolean,
  miss: Miss = null,
  lateral = 0,
) {
  const ball = sim.ball
  if (!ball) return
  const a = sim.athletes[side]
  const from = ball.translation()
  const eff = GRADE_EFFECT[grade]
  const running = Math.hypot(a.vx, a.vz) > 3.2 ? 0.35 : 0
  // Harder contacts are less accurate: incoming pace, awkward height, reaching wide.
  const vin = ball.linvel()
  const pace = Math.hypot(vin.x, vin.y, vin.z)
  const height = from.y < 0.45 ? (0.45 - from.y) * 2.5 : from.y > 1.8 ? (from.y - 1.8) * 1.2 : 0
  const reach = Math.max(0, Math.abs(lateral) - 0.9) * 1.2
  const difficulty = serve ? 1 : 1 + Math.max(0, pace - 24) / 22 + height + reach
  const errScale = (serve ? 0.5 : 1) * (eff.error + running) * difficulty
  // Depth scatters more than direction for real groundstrokes.
  let tx = target.x + gauss() * errScale * 0.75
  let tz = target.z + gauss() * errScale
  // Early contact pulls the ball across the body, late contact pushes it the other way.
  if (!serve && (grade === 'early' || grade === 'late')) {
    const r = right(a)
    const hand = a.swing === 'backhand' ? -1 : 1
    const bias = (grade === 'early' ? -1 : 1) * hand * (0.8 + Math.random() * 0.7)
    tx += r.x * bias
  }
  if (miss === 'long') tz += Math.sign(tz) * (COURT.halfLength - Math.abs(tz) + 0.4 + Math.random() * 1.2)
  if (miss === 'wide') tx = Math.sign(tx || 1) * (COURT.singlesHalfWidth + 0.3 + Math.random() * 1)
  const spec = serve ? SERVES[shot] : SHOTS[shot]
  let netClearance = spec.netClearance
  // Mistimed shots sometimes find the tape.
  if ((grade === 'early' || grade === 'late') && Math.random() < 0.3) netClearance -= 0.25 + Math.random() * 0.3
  if (miss === 'net') netClearance = -0.35 - Math.random() * 0.3
  const lowBall = from.y < 0.45 && !serve ? 0.85 : 1
  const st = useGame.getState()
  const swing = PACE[st.pace] * (side === AI ? AI_LEVELS[st.difficulty].pace : 1)
  // Racket impact: part of the incoming ball's speed comes back (v_out = eA v_in + (1 + eA) V_racket).
  const rebound = serve || shot === 'lob' ? 0 : Math.max(-3, Math.min(8, RACKET_EA * (pace - RALLY_BALL_SPEED)))
  const sol = solveShot({
    from,
    target: { x: tx, z: tz },
    speed: spec.speed * eff.pace * lowBall * swing + rebound,
    spin: spec.spin * (grade === 'perfect' ? 1.1 : 1),
    sidespin: serve ? SERVES[shot].sidespin : 0,
    netClearance,
    lobPitch: serve ? undefined : SHOTS[shot].lobPitch,
  })
  ball.setLinvel(sol.v, true)
  ball.setAngvel(sol.w, true)
  sim.lastHitter = side
  sim.hits += 1
  sim.bounces = 0
  sim.firstBounce = null
  sim.netTouched = false
  if (side !== sim.server) sim.receiverTouched = true
  sim.landing = { x: sol.landing.x, z: sol.landing.z, t: sim.time }
  predictFromBall()
  const speed = Math.hypot(sol.v.x, sol.v.y, sol.v.z)
  hudLive.lastShotKmh = speed * 3.6
  pushEvent({ kind: 'hit', x: from.x, y: from.y, z: from.z, power: Math.min(1, speed / 50) })
  if (side === HUMAN) sim.shake = Math.min(1, 0.25 + speed / 80)
  a.queued = null
  // The opponent split-steps as the ball is struck.
  sim.athletes[other(side)].split = 0.32
  if (!serve) useGame.getState().setRally(sim.hits)
  else useGame.getState().setRally(1)
  aiLetGo = false
  if (side === HUMAN) {
    const ai = sim.athletes[AI]
    ai.target = null
  }
}

/** Moves with bounded acceleration: speeding up is slower than braking, so changing direction costs time. */
function moveAthlete(a: Athlete, wantX: number, wantZ: number, maxSpeed: number, dt: number) {
  const dvx = wantX - a.vx
  const dvz = wantZ - a.vz
  const dv = Math.hypot(dvx, dvz)
  if (dv > 1e-4) {
    // Braking when the wanted velocity points against the current one.
    const braking = wantX * a.vx + wantZ * a.vz < 0 || Math.hypot(wantX, wantZ) < Math.hypot(a.vx, a.vz)
    const step = Math.min(dv, (braking ? PLAYER.brake : PLAYER.accel) * dt)
    a.vx += (dvx / dv) * step
    a.vz += (dvz / dv) * step
  }
  const sp = Math.hypot(a.vx, a.vz)
  if (sp > maxSpeed && sp > 0) {
    a.vx *= maxSpeed / sp
    a.vz *= maxSpeed / sp
  }
  a.x += a.vx * dt
  a.z += a.vz * dt
}

function clampArea(a: Athlete, side: Side) {
  const zs = halfSign(side)
  const lim = COURT.fenceX - 0.8
  a.x = Math.max(-lim, Math.min(lim, a.x))
  const zMin = 0.7
  const zMax = COURT.fenceZ - 1.2
  const zAbs = Math.max(zMin, Math.min(zMax, a.z * zs))
  a.z = zAbs * zs
}

/** Seconds until the ball reaches the athlete's hitting plane, or Infinity. */
function timeToPlane(a: Athlete, p: V3, v: V3) {
  const f = forward(a)
  // Distance from ball to plane, measured along the athlete's forward axis.
  const plane = (p.x - a.x) * f.x + (p.z - a.z) * f.z - PLAYER.contactAhead
  const closing = -(v.x * f.x + v.z * f.z)
  if (closing <= 0.5) return Infinity
  return plane / closing
}

function inContactWindow(a: Athlete, p: V3) {
  const f = forward(a)
  const r = right(a)
  const along = (p.x - a.x) * f.x + (p.z - a.z) * f.z
  const lateral = (p.x - a.x) * r.x + (p.z - a.z) * r.z
  const ok =
    along <= PLAYER.contactAhead &&
    along >= -PLAYER.contactBehind &&
    Math.abs(lateral) <= PLAYER.reach &&
    p.y >= PLAYER.minContactY &&
    p.y <= PLAYER.maxContactY
  return { ok, passed: along < -PLAYER.contactBehind, lateral }
}

function startSwing(a: Athlete, lateral: number, shot: ShotType, ballY = 1) {
  if (a.swing !== 'none') return
  a.contactY = ballY
  a.swing = lateral >= 0 ? 'forehand' : 'backhand'
  a.swingT = 0
  a.swingShot = shot
}

function gradeFor(tt: number): Grade {
  if (tt >= TIMING.perfect[0] && tt <= TIMING.perfect[1]) return 'perfect'
  if (tt >= TIMING.good[0] && tt <= TIMING.good[1]) return 'good'
  return tt > TIMING.good[1] ? 'early' : 'late'
}

function updateSwing(a: Athlete, dt: number) {
  if (a.swing !== 'none') {
    a.swingT += dt
    const end = a.swing === 'serve' ? 1.75 : 0.72
    if (a.swingT > end) {
      a.swing = 'none'
      a.swingT = 0
    }
  }
  if (a.celebrate > 0) a.celebrate = Math.max(0, a.celebrate - dt)
  if (a.split > 0) a.split = Math.max(0, a.split - dt)
}

// ---------------------------------------------------------------- serve

function serveTarget(server: Side, aimX: number, safe: boolean) {
  const receiver = other(server)
  const boxSign = -serverXSign(server, sim.deuceCourt)
  const centre = boxSign * 2.05
  const span = safe ? 1.1 : 1.7
  const x = Math.max(-3.75, Math.min(3.75, centre + aimX * span))
  const xClamped = boxSign > 0 ? Math.max(0.3, x) : Math.min(-0.3, x)
  const depth = COURT.serviceLine - (safe ? 1.25 : 0.75)
  return { x: xClamped, z: halfSign(receiver) * depth }
}

function hitServe(side: Side, shot: ShotType, grade: Grade, aimX: number) {
  const a = sim.athletes[side]
  const second = sim.serveNumber === 2
  const t = serveTarget(side, aimX, second)
  a.swing = 'serve'
  a.swingT = 1
  a.tossing = false
  hudLive.tossMeter = null
  hudLive.serveStage = null
  strike(side, second && shot === 'flat' ? 'topspin' : shot, grade, t, true)
}

function tossBall(a: Athlete, shot: ShotType) {
  const ball = sim.ball
  if (!ball) return
  sim.held = false
  a.tossing = true
  a.swing = 'serve'
  a.swingT = 0
  a.swingShot = shot
  const p = tossPoint(a)
  ball.setTranslation(p, true)
  ball.setLinvel({ x: 0, y: SERVE.tossSpeed, z: 0 }, true)
  ball.setAngvel({ x: 0, y: 0, z: 0 }, true)
}

function serveGrade(y: number, vy: number): Grade {
  if (y >= SERVE.perfectY[0] && y <= SERVE.perfectY[1]) return 'perfect'
  if (y >= SERVE.goodY[0] && y <= SERVE.goodY[1]) return 'good'
  return vy > 0 ? 'early' : 'late'
}

function retoss(a: Athlete) {
  sim.held = true
  a.tossing = false
  a.swing = 'none'
  serveClock = 0
  hudLive.tossMeter = null
}

// ---------------------------------------------------------------- human

function updateHuman(dt: number, input: InputState, p: V3, v: V3) {
  const a = sim.athletes[HUMAN]
  updateSwing(a, dt)
  const serving = sim.phase === 'serve' && sim.server === HUMAN && sim.lastHitter === null

  if (serving) {
    // GTA-style serve: walk along the baseline before the toss. There is no target marker:
    // the arrow held at the hit angles the serve and the toss timing sets its power.
    if (sim.held) {
      hudLive.serveStage = 'aim'
      const xs = serverXSign(HUMAN, sim.deuceCourt)
      a.vz = 0
      a.vx += (input.moveX * 2.4 - a.vx) * Math.min(1, dt * 12)
      a.x += a.vx * dt
      const lo = xs > 0 ? 0.25 : -3.8
      const hi = xs > 0 ? 3.8 : -0.25
      if (a.x < lo || a.x > hi) {
        a.x = Math.max(lo, Math.min(hi, a.x))
        a.vx = 0
      }
      if (input.pressed.length) {
        a.vx = 0
        tossBall(a, input.pressed[input.pressed.length - 1])
      }
      return
    }
    a.vx = a.vz = 0
    // Tossing: release the button (or press again) to hit, ideally near the top of the toss.
    hudLive.serveStage = 'toss'
    hudLive.tossMeter = Math.max(0, Math.min(1, (p.y - SERVE.handHeight) / (SERVE.apex - SERVE.handHeight)))
    hudLive.tossFalling = v.y < 0
    if (input.released.includes(a.swingShot) || input.pressed.length) {
      const grade = serveGrade(p.y, v.y)
      useGame.getState().showTiming(grade)
      hitServe(HUMAN, a.swingShot, grade, input.moveX)
      return
    }
    if (v.y < 0 && p.y < 1.25) retoss(a)
    return
  }
  hudLive.serveStage = null

  if (sim.phase === 'dead' || sim.phase === 'idle') {
    moveAthlete(a, 0, 0, PLAYER.speed, dt)
    return
  }

  const canHit = sim.phase === 'rally' && sim.lastHitter === AI
  const incoming = sim.lastHitter === AI
  const tt = canHit ? timeToPlane(a, p, v) : Infinity

  if (input.pressed.length && (incoming || sim.phase === 'rally')) {
    const shot = input.pressed[input.pressed.length - 1]
    if (incoming) {
      const grade = tt === Infinity ? null : gradeFor(tt)
      a.queued = { shot, grade, pressedAt: sim.time }
    }
  }

  // Movement with a light assist toward the ball when a swing is queued.
  const speedCap = PLAYER.speed * (a.swing !== 'none' ? PLAYER.swingSlow : 1)
  let wantX = input.moveX * speedCap
  const wantZ = -input.moveY * speedCap
  if (a.queued && incoming && sim.prediction) {
    const f = forward(a)
    const plane = a.z + f.z * PLAYER.contactAhead
    const elapsed = sim.time - sim.predictionStart
    const s = sim.prediction.samples.find((q) => q.t > elapsed && q.z >= plane)
    if (s) {
      const fh = s.x - 0.75
      const bh = s.x + 0.75
      const stand = Math.abs(fh - a.x) < Math.abs(bh - a.x) ? fh : bh
      const dx = stand - a.x
      if (Math.abs(dx) < 3.2) wantX += Math.max(-1, Math.min(1, dx * 2)) * PLAYER.speed * PLAYER.assist
    }
  }
  moveAthlete(a, wantX, wantZ, speedCap, dt)
  clampArea(a, HUMAN)

  if (!a.queued || !canHit) return
  const win = inContactWindow(a, p)
  if (tt <= TIMING.swingLead) startSwing(a, win.lateral, a.queued.shot, p.y + v.y * tt)
  if (win.ok) {
    const grade = a.queued.grade ?? 'late'
    startSwing(a, win.lateral, a.queued.shot, p.y)
    useGame.getState().showTiming(grade)
    const spec = SHOTS[a.queued.shot]
    const tx = Math.max(-3.7, Math.min(3.7, input.moveX * 3.1))
    const depth = Math.max(4.8, Math.min(11.1, spec.depth + input.moveY * 1.7))
    strike(HUMAN, a.queued.shot, grade, { x: tx, z: -depth }, false, null, win.lateral)
  } else if (win.passed) {
    startSwing(a, win.lateral, a.queued.shot)
    a.queued = null
  }
}

// ---------------------------------------------------------------- AI

function updateAI(dt: number, p: V3, v: V3) {
  const a = sim.athletes[AI]
  const spec = AI_LEVELS[useGame.getState().difficulty]
  updateSwing(a, dt)

  const serving = sim.phase === 'serve' && sim.server === AI && sim.lastHitter === null
  if (serving) {
    a.vx = a.vz = 0
    serveClock += dt
    if (sim.held && serveClock > 1.3) {
      const second = sim.serveNumber === 2
      const shot: ShotType = second ? 'topspin' : Math.random() < 0.6 ? 'flat' : 'slice'
      tossBall(a, shot)
    } else if (!sim.held && v.y < 0.2 && p.y > 2.3) {
      const second = sim.serveNumber === 2
      // First serves are aimed close to the lines; second serves are safe.
      let grade = pickGrade(spec, second ? 0.4 : 0)
      if (second && grade !== 'perfect') grade = 'good'
      if (!second && Math.random() > spec.serveFirst && grade === 'good') grade = 'early'
      const aim = [-1, 0, 1][Math.floor(Math.random() * 3)]
      hitServe(AI, a.swingShot, grade, aim)
    }
    return
  }

  if (sim.phase === 'dead' || sim.phase === 'idle') {
    moveAthlete(a, 0, 0, spec.speed, dt)
    return
  }

  const incoming = sim.lastHitter === HUMAN
  if (incoming && sim.prediction) {
    const elapsed = sim.time - sim.predictionStart
    if (!a.target || Math.floor(elapsed * 10) !== Math.floor((elapsed - dt) * 10)) {
      const plan = planIntercept(a, sim.prediction, elapsed, spec, sim.phase === 'serve')
      if (plan) a.target = plan
    }
    // Decide once whether to leave a ball that is going out.
    if (sim.landing && sim.bounces === 0 && !aiLetGo) {
      const out = !inSinglesCourt(sim.landing.x, sim.landing.z, -1)
      const serveOut =
        sim.phase === 'serve' &&
        !inServiceBox(sim.landing.x, sim.landing.z, -1, -serverXSign(HUMAN, sim.deuceCourt) as 1 | -1)
      if ((out || serveOut) && Math.random() < spec.readsOut) aiLetGo = true
    }
  } else if (sim.lastHitter === AI) {
    // Recover toward the centre of the baseline, shading to the ball side.
    const land = sim.landing
    a.target = { x: land ? land.x * 0.3 : 0, z: -(COURT.halfLength + 0.8) }
  }

  const elapsed = sim.time - sim.predictionStart
  const reacting = !incoming || elapsed > spec.reaction
  let wantX = 0
  let wantZ = 0
  const cap = spec.speed * (a.swing !== 'none' ? PLAYER.swingSlow : 1)
  if (a.target && reacting && !(incoming && aiLetGo)) {
    const dx = a.target.x - a.x
    const dz = a.target.z - a.z
    const d = Math.hypot(dx, dz)
    if (d > 0.05) {
      const sp = Math.min(cap, d * 5)
      wantX = (dx / d) * sp
      wantZ = (dz / d) * sp
    }
  }
  moveAthlete(a, wantX, wantZ, cap, dt)
  clampArea(a, AI)

  if (!(sim.phase === 'rally' && incoming) || aiLetGo) return
  const tt = timeToPlane(a, p, v)
  const win = inContactWindow(a, p)
  if (tt <= TIMING.swingLead) startSwing(a, win.lateral, 'topspin', p.y + v.y * tt)
  if (win.ok) {
    const choice = chooseShot(a, p.y, win.lateral, spec, sim.hits)
    const grade = pickGrade(spec)
    // Pace and awkward height make errors more likely.
    const pace = Math.hypot(v.x, v.y, v.z)
    const pressure =
      1 +
      Math.max(0, pace - 22) / 25 +
      (p.y < 0.4 || p.y > 1.9 ? 0.5 : 0) +
      Math.max(0, Math.abs(win.lateral) - 0.9) / 2
    let miss: Miss = null
    if (Math.random() < spec.unforced * pressure) {
      const r = Math.random()
      miss = r < 0.4 ? 'net' : r < 0.75 ? 'long' : 'wide'
    }
    a.swingShot = choice.shot
    startSwing(a, win.lateral, choice.shot, p.y)
    strike(AI, choice.shot, grade, choice.target, false, miss, win.lateral)
  }
}

// ---------------------------------------------------------------- referee

function onBounce(p: V3, vy: number) {
  sim.bounces += 1
  pushEvent({ kind: 'bounce', x: p.x, y: BALL.radius, z: p.z, power: Math.min(1, Math.abs(vy) / 14) })
  const hitter = sim.lastHitter
  if (hitter === null || sim.phase === 'dead' || sim.phase === 'idle') return
  const receiver = other(hitter)
  const half: Side = p.z >= 0 ? HUMAN : AI

  if (sim.phase === 'serve') {
    const boxX = -serverXSign(hitter, sim.deuceCourt) as 1 | -1
    if (!inServiceBox(p.x, p.z, halfSign(receiver), boxX)) {
      fault(sim.netTouched && half === hitter ? 'Net' : 'Fault')
      return
    }
    if (sim.netTouched) {
      useGame.getState().showToast('Let', 'neutral', 'Replay the serve')
      sim.phase = 'dead'
      sim.deadTimer = 1.3
      sim.landing = null
      pendingAfterDead = 'serve'
      return
    }
    sim.phase = 'rally'
    sim.firstBounce = { x: p.x, z: p.z }
    sim.landing = null
    predictFromBall()
    return
  }

  if (sim.bounces === 1) {
    if (half === hitter) {
      endPoint(receiver, 'Net', 'error')
      return
    }
    if (!inSinglesCourt(p.x, p.z, halfSign(receiver))) {
      endPoint(receiver, 'Out', 'error')
      return
    }
    sim.firstBounce = { x: p.x, z: p.z }
    sim.landing = null
    predictFromBall()
    return
  }
  if (sim.bounces >= 2) {
    const ace = sim.hits === 1 && !sim.receiverTouched
    endPoint(hitter, ace ? 'Ace' : 'Winner', ace ? 'ace' : 'winner')
  }
}

export function onNetTouch() {
  if (sim.phase === 'serve' || sim.phase === 'rally') {
    sim.netTouched = true
    const b = sim.ball?.translation()
    if (b) pushEvent({ kind: 'net', x: b.x, y: b.y, z: b.z, power: 0.5 })
  }
}

export function onFenceTouch() {
  const b = sim.ball?.translation()
  if (b) pushEvent({ kind: 'fence', x: b.x, y: b.y, z: b.z, power: 0.6 })
  const hitter = sim.lastHitter
  if (hitter === null) return
  if (sim.phase === 'serve') fault('Fault')
  else if (sim.phase === 'rally') {
    if (sim.bounces === 0) endPoint(other(hitter), 'Out', 'error')
    else endPoint(hitter, 'Winner', 'winner')
  }
}

// ---------------------------------------------------------------- loop

export function stepGame(dt: number) {
  sim.time += dt
  const input = pollInput()
  if (input.pause) useGame.getState().pause()
  const ball = sim.ball
  if (!ball) return

  const p = ball.translation()
  const v = ball.linvel()

  if (sim.held) {
    const s = sim.athletes[sim.server]
    const tp = tossPoint(s)
    ball.setTranslation(tp, true)
    ball.setLinvel({ x: 0, y: 0, z: 0 }, true)
    ball.setAngvel({ x: 0, y: 0, z: 0 }, true)
    ball.resetForces(true)
  } else {
    aeroForce(v, ball.angvel(), force)
    ball.resetForces(true)
    ball.addForce(force, true)
  }

  const hitsBefore = sim.hits
  updateHuman(dt, input, p, v)
  updateAI(dt, p, v)

  const vNow = ball.linvel()
  const pNow = ball.translation()
  if (!sim.held && sim.hits === hitsBefore && sim.prevVy < -0.4 && vNow.y > 0.05 && pNow.y < 0.25) {
    // Rapier found the contact; replace its generic response with the tennis bounce model
    // (the same one the predictor uses), starting from the pre-impact state.
    const v2 = { ...sim.prevV }
    const w2 = { ...sim.prevW }
    applyBounce(v2, w2)
    ball.setLinvel(v2, true)
    ball.setAngvel(w2, true)
    onBounce(pNow, sim.prevVy)
  }
  const vEnd = ball.linvel()
  const wEnd = ball.angvel()
  sim.prevVy = vEnd.y
  sim.prevV = { x: vEnd.x, y: vEnd.y, z: vEnd.z }
  sim.prevW = { x: wEnd.x, y: wEnd.y, z: wEnd.z }
  hudLive.ballSpeedKmh = Math.hypot(vNow.x, vNow.y, vNow.z) * 3.6

  // Balls that leave the venue count as hitting the fence.
  if (!sim.held && (Math.abs(pNow.z) > COURT.fenceZ + 0.5 || Math.abs(pNow.x) > COURT.fenceX + 0.5)) {
    if (sim.phase === 'rally' || sim.phase === 'serve') onFenceTouch()
  }

  if (sim.phase === 'dead') {
    sim.deadTimer -= dt
    if (sim.deadTimer <= 0) {
      if (pendingAfterDead === 'serve') resetForServe()
      else sim.phase = 'idle'
    }
  }
}
