import { AI, BALL, COURT, HUMAN, PHYSICS, halfSign, other, type Side } from './constants'
import { isDeuceCourt } from './scoring'
import { hudLive, useGame } from './store'
import { pushEvent, sim, type Athlete } from './sim'
import { AI_LEVELS, PACE, PLAYER, ONLINE_HELP, PLAYER_HELP, SERVE, TIMING, type Grade, type ShotType } from './tuning'
import {
  aeroForce,
  applyBounce,
  setWind,
  wind,
  inServiceBox,
  inSinglesCourt,
  simulate,
  type V3,
  advance,
  type BallState,
} from '../physics/flight'
import { pollInput, type InputState } from '../input/input'
import type { AthleteState, PointStart, PressMsg, StrikeIntent, StrikeResolved, TossMsg } from '../net/protocol'
import {
  gradeFor,
  rallyTarget,
  resolveShot,
  serveGrade,
  serverXSign,
  serveTarget,
  shotRng,
  type Miss,
  type Rng,
} from './shot'
import { chooseShot, pickGrade, planIntercept } from '../ai/opponent'

// The match director runs once per physics step (120 Hz): input, movement,
// hitting, AI and refereeing. Rapier does the actual ball physics.

const force: V3 = { x: 0, y: 0, z: 0 }
let serveClock = 0
/** The player's serve aim, swept during the toss (see SERVE.aimRate). */
let serveAim = 0
let pendingAfterDead: 'serve' | 'none' = 'serve'
let aiLetGo = false

/** Random source for a side's next shot: Math.random offline, the rally seed online. */
let shotRandom: (side: Side) => Rng = () => Math.random
export function setShotRandom(fn: (side: Side) => Rng) {
  shotRandom = fn
}

function forward(a: Athlete) {
  return { x: Math.sin(a.yaw), z: Math.cos(a.yaw) }
}
function right(a: Athlete) {
  const f = forward(a)
  return { x: -f.z, z: f.x }
}

export function tossPoint(a: Athlete) {
  const f = forward(a)
  const r = right(a)
  return { x: a.x + f.x * 0.42 + r.x * 0.18, y: SERVE.handHeight, z: a.z + f.z * 0.42 + r.z * 0.18 }
}

export function resetForServe() {
  const st = useGame.getState()
  const m = st.match
  const op = online?.point
  sim.server = op ? op.server : m.server
  sim.serveNumber = op ? op.serveNumber : st.serveNumber
  sim.deuceCourt = op ? op.deuceCourt : isDeuceCourt(m)
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
  if (op) setWind(op.wind.x, op.wind.z)
  else {
    // Coastal breeze: drifts a little between points, occasionally gusting.
    const angle = Math.atan2(wind.z, wind.x) + (Math.random() - 0.5) * 0.9
    const base = Math.hypot(wind.x, wind.z) * 0.6 + Math.random() * 1.4 + (Math.random() < 0.15 ? 1.5 : 0)
    const speed = Math.min(3.5, base)
    setWind(Math.cos(angle) * speed, Math.sin(angle) * speed)
  }
  if (online) {
    online.auth = null
    online.toss = null
    online.remote.lockUntil = 0
  }
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
    a.pendingServe = null
    a.aim = null
    a.yaw = side === HUMAN ? Math.PI : 0
  }
  const s = sim.athletes[server]
  s.x = xs * 0.75
  s.z = halfSign(server) * (COURT.halfLength + SERVE.baselineGap)
  const r = sim.athletes[receiver]
  // Returners stand deeper for first serves: more time to read and reach a fast, wide one.
  const aiReceives = receiver === AI && !online
  r.x = -xs * (aiReceives ? 2.6 : 2.85)
  r.z = halfSign(receiver) * (COURT.halfLength + (aiReceives ? (sim.serveNumber === 1 ? 1.8 : 1.2) : 0.9))

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
  if (online) {
    awaitCall()
    return
  }
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
  if (online) {
    awaitCall()
    return
  }
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

function strike(
  side: Side,
  shot: ShotType,
  grade: Grade,
  target: { x: number; z: number },
  serve: boolean,
  miss: Miss = null,
  lateral = 0,
  aim = { x: 0, y: 0 },
  pressT?: number,
) {
  const ball = sim.ball
  if (!ball) return
  const a = sim.athletes[side]
  const from = ball.translation()
  const st = useGame.getState()
  const r = right(a)
  const vin = ball.linvel()
  const sol = resolveShot(
    {
      from: { x: from.x, y: from.y, z: from.z },
      vin: { x: vin.x, y: vin.y, z: vin.z },
      serve,
      shot,
      grade,
      target,
      running: Math.hypot(a.vx, a.vz) > 3.2,
      lateral,
      rightX: r.x,
      hand: a.swing === 'backhand' ? -1 : 1,
      swingMul: PACE[st.pace] * (side === AI ? AI_LEVELS[st.difficulty].pace : 1),
      miss,
    },
    shotRandom(side),
  )
  if (online && side === HUMAN) {
    // Tell the server what was swung at; it re-runs this same computation to check it.
    const intent: StrikeIntent = {
      rallyId: online.rallyId,
      hit: sim.hits + 1,
      kind: serve ? 'serve' : 'shot',
      shot,
      t: online.contactT,
      p: wire({ x: from.x, y: from.y, z: from.z }),
      vin: wire({ x: vin.x, y: vin.y, z: vin.z }),
      aim,
      pressT,
      lateral,
      rightX: r.x,
      hand: a.swing === 'backhand' ? -1 : 1,
      running: Math.hypot(a.vx, a.vz) > 3.2,
    }
    online.mine.set(intent.hit, { v: sol.v, w: sol.w })
    online.send.strike(intent)
  }
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
  const speed = sol.speed
  hudLive.lastShotKmh = speed * 3.6
  pushEvent({ kind: 'hit', x: from.x, y: from.y, z: from.z, power: Math.min(1, speed / 50) })
  if (side === HUMAN) sim.shake = Math.min(1, 0.25 + speed / 80)
  a.queued = null
  // The opponent split-steps as the ball is struck.
  sim.athletes[other(side)].split = 0.32
  if (!serve) useGame.getState().setRally(sim.hits)
  else {
    useGame.getState().setRally(1)
    useGame.getState().showServeSpeed(Math.round(speed * 3.6))
  }
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

function help() {
  return online ? ONLINE_HELP : PLAYER_HELP[useGame.getState().difficulty]
}

function inContactWindow(a: Athlete, p: V3, reach = PLAYER.reach) {
  const f = forward(a)
  const r = right(a)
  const along = (p.x - a.x) * f.x + (p.z - a.z) * f.z
  const lateral = (p.x - a.x) * r.x + (p.z - a.z) * r.z
  const ok =
    along <= PLAYER.contactAhead &&
    along >= -PLAYER.contactBehind &&
    Math.abs(lateral) <= reach &&
    p.y >= PLAYER.minContactY &&
    p.y <= PLAYER.maxContactY
  return { ok, passed: along < -PLAYER.contactBehind, lateral }
}

interface Contact {
  t: number
  x: number
  y: number
  z: number
  lateral: number
}

/**
 * Where and when the incoming ball crosses this athlete's hitting plane, from the predictor.
 * The swing is timed to it and the racket arm aims at it, so racket and ball actually meet.
 */
function predictContact(a: Athlete): Contact | null {
  const pred = sim.prediction
  if (!pred) return null
  const f = forward(a)
  const r = right(a)
  const elapsed = sim.time - sim.predictionStart
  let prev: (typeof pred.samples)[number] | null = null
  let prevAlong = 0
  for (const s of pred.samples) {
    const along = (s.x - a.x) * f.x + (s.z - a.z) * f.z - PLAYER.contactAhead
    if (s.t >= elapsed && prev && prevAlong > 0 && along <= 0) {
      const k = prevAlong / (prevAlong - along)
      const x = prev.x + (s.x - prev.x) * k
      const z = prev.z + (s.z - prev.z) * k
      return {
        t: sim.predictionStart + prev.t + (s.t - prev.t) * k,
        x,
        y: prev.y + (s.y - prev.y) * k,
        z,
        lateral: (x - a.x) * r.x + (z - a.z) * r.z,
      }
    }
    prev = s
    prevAlong = along
  }
  return null
}

/** Starts a groundstroke so its contact key lands exactly on the planned contact. */
function startSwing(a: Athlete, lateral: number, shot: ShotType, ballY = 1, contact: Contact | null = null) {
  if (a.swing !== 'none') return
  a.contactY = ballY
  a.swing = lateral >= 0 ? 'forehand' : 'backhand'
  a.swingT = contact ? Math.max(0, TIMING.swingLead - (contact.t - sim.time)) : 0
  a.swingShot = shot
  a.aim = contact ? { x: contact.x, y: contact.y, z: contact.z } : null
  a.contactAt = contact ? contact.t : sim.time + TIMING.swingLead
}

/** Meets the ball with the racket: struck from the sweet spot when the renderer reports one nearby. */
function snapBallToRacket(a: Athlete) {
  const ball = sim.ball
  const s = a.sweet
  if (!ball || !s) return
  const p = ball.translation()
  if (Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z) < 0.7) ball.setTranslation(s, true)
}

function updateSwing(a: Athlete, dt: number) {
  if (a.swing !== 'none') {
    a.swingT += dt
    const end = a.swing === 'serve' ? 1.75 : 0.72
    if (a.swingT > end) {
      a.swing = 'none'
      a.swingT = 0
      a.aim = null
    }
  }
  if (a.celebrate > 0) a.celebrate = Math.max(0, a.celebrate - dt)
  if (a.split > 0) a.split = Math.max(0, a.split - dt)
}

// ---------------------------------------------------------------- serve

/** Release: the racket swings up from the trophy position and meets the ball SERVE.swingTime later. */
function releaseServe(side: Side, shot: ShotType, grade: Grade, aimX: number) {
  const a = sim.athletes[side]
  const ball = sim.ball
  if (!ball) return
  const p = ball.translation()
  const v = ball.linvel()
  const t = SERVE.swingTime
  a.pendingServe = { shot, grade, aimX }
  a.swing = 'serve'
  a.swingT = 1 - t
  a.contactAt = sim.time + t
  a.aim = { x: p.x + v.x * t, y: p.y + v.y * t + 0.5 * PHYSICS.gravity * t * t, z: p.z + v.z * t }
  hudLive.tossMeter = null
  hudLive.serveStage = null
}

/** Called every step while a serve is pending; strikes once the racket reaches the ball. */
function updatePendingServe(side: Side) {
  const a = sim.athletes[side]
  const ps = a.pendingServe
  if (!ps || sim.time < a.contactAt - 1e-6) return
  a.pendingServe = null
  a.tossing = false
  const second = sim.serveNumber === 2
  snapBallToRacket(a)
  let grade = ps.grade
  if (online && side === HUMAN) {
    online.contactT = online.now()
    // Grade the toss the way the server does: its deterministic flight at the release.
    if (online.toss) {
      const b = advance(
        online.toss.p,
        { x: 0, y: SERVE.tossSpeed, z: 0 },
        { x: 0, y: 0, z: 0 },
        (online.contactT - SERVE.swingTime * 1000 - online.toss.t) / 1000,
      )
      grade = serveGrade(b.p.y, b.v.y)
    }
  }
  strike(
    side,
    second && ps.shot === 'flat' ? 'topspin' : ps.shot,
    grade,
    serveTarget(side, sim.deuceCourt, ps.aimX, second),
    true,
    null,
    0.3,
    { x: Math.max(-SERVE.aimMax, Math.min(SERVE.aimMax, ps.aimX)), y: 0 },
  )
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
  if (online && a === sim.athletes[HUMAN]) {
    const t = online.now()
    online.toss = { t, p: { ...p } }
    online.send.toss({ rallyId: online.rallyId, t, shot, p: wire(p) })
  }
}

function retoss(a: Athlete) {
  a.pendingServe = null
  a.aim = null
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
        serveAim = 0
        hudLive.serveAim = 0
      }
      return
    }
    a.vx = a.vz = 0
    // Tossing: release the button (or press again) to hit, ideally near the top of the toss.
    hudLive.serveStage = 'toss'
    // Direction is a skill like power: the held arrow sweeps the aim, which keeps going.
    serveAim = Math.max(-SERVE.aimMax, Math.min(SERVE.aimMax, serveAim + input.moveX * SERVE.aimRate * dt))
    hudLive.serveAim = serveAim
    hudLive.tossMeter = Math.max(0, Math.min(1, (p.y - SERVE.handHeight) / (SERVE.apex - SERVE.handHeight)))
    hudLive.tossFalling = v.y < 0
    if (a.pendingServe) {
      updatePendingServe(HUMAN)
      return
    }
    if (input.released.includes(a.swingShot) || input.pressed.length) {
      const grade = serveGrade(p.y, v.y)
      useGame.getState().showTiming(grade)
      releaseServe(HUMAN, a.swingShot, grade, serveAim)
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
  const contact = incoming ? predictContact(a) : null
  const tt = canHit ? (contact ? contact.t - sim.time : timeToPlane(a, p, v)) : Infinity

  if (input.pressed.length && (incoming || sim.phase === 'rally')) {
    const shot = input.pressed[input.pressed.length - 1]
    if (incoming) {
      const grade = tt === Infinity ? null : gradeFor(tt, help().timing)
      a.queued = { shot, grade, pressedAt: sim.time }
      if (online) {
        const t = online.now()
        online.pressT = t
        online.send.press({ rallyId: online.rallyId, hit: sim.hits + 1, shot, t })
      }
    }
  }

  // Movement with an assist toward the ball: strong once a swing is queued, lighter before
  // (GTA-style auto-positioning; how much depends on the difficulty).
  const h = help()
  const speedCap = PLAYER.speed * (a.swing !== 'none' ? PLAYER.swingSlow : 1)
  let wantX = input.moveX * speedCap
  const wantZ = -input.moveY * speedCap
  const pull = a.queued ? h.assist : sim.phase === 'rally' ? h.track : 0
  if (pull > 0 && incoming && contact && a.swing === 'none') {
    // Line up so the ball arrives a comfortable arm-and-racket length to the side.
    const fh = contact.x - PLAYER.stance
    const bh = contact.x + PLAYER.stanceBackhand
    const stand = Math.abs(fh - a.x) < Math.abs(bh - a.x) ? fh : bh
    const dx = stand - a.x
    if (Math.abs(dx) < 3.2) wantX += Math.max(-1, Math.min(1, dx * 2)) * PLAYER.speed * pull
  }
  moveAthlete(a, wantX, wantZ, speedCap, dt)
  clampArea(a, HUMAN)

  if (!a.queued || !canHit) return
  const win = inContactWindow(a, p, h.reach)
  // Start the swing so its contact key coincides with the ball reaching the hitting plane.
  if (a.swing === 'none' && contact && contact.t - sim.time <= TIMING.swingLead)
    startSwing(a, contact.lateral, a.queued.shot, contact.y, contact)
  const due = a.swing !== 'none' ? sim.time >= a.contactAt - PHYSICS.timeStep / 2 : false
  if (win.ok && (due || !contact)) {
    let grade = a.queued.grade ?? 'late'
    let pressT: number | undefined
    if (online) {
      // Online, the grade comes from the press and contact times the server also sees.
      online.contactT = online.now()
      pressT = online.pressT ?? online.contactT
      grade = gradeFor((online.contactT - pressT) / 1000, ONLINE_HELP.timing)
    }
    startSwing(a, win.lateral, a.queued.shot, p.y)
    useGame.getState().showTiming(grade)
    snapBallToRacket(a)
    const aim = { x: Math.max(-1, Math.min(1, input.moveX)), y: Math.max(-1, Math.min(1, input.moveY)) }
    strike(
      HUMAN,
      a.queued.shot,
      grade,
      rallyTarget(a.queued.shot, aim.x, aim.y),
      false,
      null,
      online ? Math.max(-ONLINE_HELP.reach, Math.min(ONLINE_HELP.reach, win.lateral)) : win.lateral,
      aim,
      pressT,
    )
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
    } else if (a.pendingServe) {
      updatePendingServe(AI)
    } else if (!sim.held && v.y < 0.4 && p.y > SERVE.apex - 0.3) {
      const second = sim.serveNumber === 2
      // First serves are aimed close to the lines; second serves are safe.
      let grade = pickGrade(spec, second ? 0.4 : 0)
      if (second && grade !== 'perfect') grade = 'good'
      if (!second && Math.random() > spec.serveFirst && grade === 'good') grade = 'early'
      // Corners or the body, a little inside the lines (+-1 is on the line).
      const aim = [-0.8, 0, 0.8][Math.floor(Math.random() * 3)] + (Math.random() - 0.5) * 0.3
      releaseServe(AI, a.swingShot, grade, aim)
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
      const serveReturn = sim.phase === 'serve'
      const plan = planIntercept(
        a,
        sim.prediction,
        elapsed,
        serveReturn ? { ...spec, reaction: spec.reaction * 0.4 } : spec,
        serveReturn,
      )
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
  // A returner reads the serve from the toss and the swing, so reacts much sooner to it.
  const returning = incoming && sim.phase === 'serve'
  const reacting = !incoming || elapsed > spec.reaction * (returning ? 0.4 : 1)
  let wantX = 0
  let wantZ = 0
  const cap = spec.speed * (a.swing !== 'none' ? PLAYER.swingSlow : 1) * (returning ? 1.1 : 1)
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
  const contact = predictContact(a)
  // On the return of serve the AI stretches further: a lunge or a blocked return.
  const win = inContactWindow(a, p, PLAYER.reach + (sim.hits === 1 ? spec.returnReach : 0))
  if (a.swing === 'none' && contact && contact.t - sim.time <= TIMING.swingLead)
    startSwing(a, contact.lateral, 'topspin', contact.y, contact)
  const due = a.swing !== 'none' ? sim.time >= a.contactAt - PHYSICS.timeStep / 2 : false
  if (win.ok && (due || !contact)) {
    const choice = chooseShot(a, p.y, win.lateral, spec, sim.hits)
    const grade = pickGrade(spec)
    // Pace and awkward height make errors more likely.
    const pace = Math.hypot(v.x, v.y, v.z)
    const pressure =
      1 +
      Math.max(0, pace - 22) / 25 +
      (p.y < 0.4 || p.y > 1.9 ? 0.5 : 0) +
      Math.max(0, Math.abs(win.lateral) - 0.9) / 2
    let missChance = spec.unforced * pressure
    if (sim.hits === 1) {
      // Returning a serve: pace and being pulled wide force errors, even from the best.
      const serveSpeed = Math.hypot(sim.prevV.x, sim.prevV.y, sim.prevV.z)
      const quality =
        Math.max(0, Math.min(1.2, (serveSpeed - 20) / 20)) + Math.min(0.5, Math.max(0, Math.abs(win.lateral) - 1) * 0.5)
      missChance += spec.returnError * quality
    }
    let miss: Miss = null
    if (Math.random() < missChance) {
      const r = Math.random()
      miss = r < 0.4 ? 'net' : r < 0.75 ? 'long' : 'wide'
    }
    a.swingShot = choice.shot
    startSwing(a, win.lateral, choice.shot, p.y)
    snapBallToRacket(a)
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
  // Online the server rules on its own model of the flight. Rapier's bounce point can sit a few
  // centimetres away from it, so a line ball could be "out" here and "in" on the server: this
  // client then froze while the server waited for the return and gave the hitter a winner.
  // Judge the first bounce where the server's model puts it; with no server flight, never freeze.
  if (online && sim.bounces === 1) {
    const at = serverBounce()
    if (!at) {
      sim.firstBounce = { x: p.x, z: p.z }
      if (sim.phase === 'serve') sim.phase = 'rally'
      sim.landing = null
      predictFromBall()
      return
    }
    p = { x: at.x, y: p.y, z: at.z }
  }
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
  if (online) updateRemote(dt)
  else updateAI(dt, p, v)

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

// ---------------------------------------------------------------- online

// Online, the opponent is another player and the server is the referee. This client still
// runs its own physics so play feels instant, but it only reports inputs (key presses,
// the toss, swings with their contact point); the server answers with the resolved shots
// and every call. Everything on the wire is in the canonical court frame (seat 0 defends +z);
// this client always plays at +z, so seat 1 turns vectors by 180 degrees on the way.

interface RemoteSample {
  t: number
  x: number
  z: number
  vx: number
  vz: number
  yaw: number
}

export interface OnlineLink {
  seat: Side
  /** Estimated server clock, ms. */
  now: () => number
  send: {
    state(msg: AthleteState): void
    toss(msg: TossMsg): void
    press(msg: PressMsg): void
    strike(msg: StrikeIntent): void
  }
}

interface Online extends OnlineLink {
  rallyId: number
  seed: number
  point: { server: Side; serveNumber: 1 | 2; deuceCourt: boolean; wind: { x: number; z: number } } | null
  /** The ball as the server last defined it (local frame): the toss or the last strike. */
  auth: { t0: number; ball: BallState; hit: number; from: Side } | null
  /** My last toss (local frame). */
  toss: { t: number; p: V3 } | null
  pressT: number | null
  contactT: number
  /** My strikes as I applied them, to compare with the server's. */
  mine: Map<number, { v: V3; w: V3 }>
  remote: { buf: RemoteSample[]; swing: AthleteState | null; lockUntil: number }
  seq: number
  sendClock: number
  /** Simulation time <-> server clock: online events are stamped with the sim's own time. */
  anchor: { sim: number; server: number }
  /** Wall-clock estimate of the server clock (from the network layer). */
  wall: () => number
}

let online: Online | null = null

/** Switches the director to an online match (or back to single player with null). */
/** How far the simulation clock may stray from the synced server clock before re-anchoring. */
const ANCHOR_SLACK_MS = 150

export function setOnline(link: OnlineLink | null) {
  if (!link) {
    online = null
    setShotRandom(() => Math.random)
    return
  }
  online = {
    ...link,
    wall: link.now,
    // Stamped from the simulation, so a contact carries the time the ball was really there
    // even when several physics steps run in one rendered frame.
    now: () => {
      // Kept within reach of the synced clock: a slow frame, a hidden tab or a machine that
      // cannot keep up puts the simulation behind (or a burst of catch-up steps ahead).
      const o = online!
      const t = o.anchor.server + (sim.time - o.anchor.sim) * 1000
      const w = o.wall()
      // Not between my toss and its contact: the toss flies on the local simulation, so its
      // contact time must count from the toss on the same clock.
      if (Math.abs(t - w) <= ANCHOR_SLACK_MS || (o.toss && sim.hits === 0)) return t
      o.anchor = { sim: sim.time, server: w }
      return w
    },
    anchor: { sim: sim.time, server: link.now() },
    rallyId: 0,
    seed: 0,
    point: null,
    auth: null,
    toss: null,
    pressT: null,
    contactT: 0,
    mine: new Map(),
    remote: { buf: [], swing: null, lockUntil: 0 },
    seq: 0,
    sendClock: 0,
  }
  // Shot scatter comes from the rally seed, so the server can reproduce it exactly.
  setShotRandom(() => shotRng(online!.seed, sim.hits + 1))
  sim.phase = 'idle'
  pendingAfterDead = 'none'
}

export function isOnline() {
  return online !== null
}

/** Canonical <-> local frame for this client (a half turn for seat 1). */
function wire<T extends { x: number; z: number }>(v: T): T {
  return !online || online.seat === 0 ? { ...v } : { ...v, x: -v.x, z: -v.z }
}
function wireYaw(yaw: number) {
  return !online || online.seat === 0 ? yaw : yaw + Math.PI
}

/** The local call is only a guess online: freeze the rally until the server's call arrives. */
function awaitCall() {
  sim.phase = 'dead'
  sim.deadTimer = Infinity
  sim.landing = null
  hudLive.tossMeter = null
  pendingAfterDead = 'none'
}

function setBall(b: BallState) {
  const ball = sim.ball
  if (!ball) return
  ball.setTranslation(b.p, true)
  ball.setLinvel(b.v, true)
  ball.setAngvel(b.w, true)
  sim.prevV = { ...b.v }
  sim.prevW = { ...b.w }
  sim.prevVy = b.v.y
}

/**
 * First bounce of the current flight as the server simulates it (same flight code, same start
 * state, wind and surface), in this client's frame. Null when the flight is not known yet.
 */
function serverBounce(): { x: number; z: number } | null {
  const auth = online?.auth
  if (!auth || auth.hit !== sim.hits) return null
  const b = simulate(auth.ball.p, auth.ball.v, auth.ball.w, { maxBounces: 1, maxT: 6 }).bounces[0]
  return b ? { x: b.x, z: b.z } : null
}

/** The server's ball state, fast-forwarded to now. */
function authNow(): BallState | null {
  if (!online?.auth) return null
  return advance(online.auth.ball.p, online.auth.ball.v, online.auth.ball.w, (online.now() - online.auth.t0) / 1000)
}

/** A new point from the server: play out the gap, then set up the serve. */
export function onlinePointStart(ps: PointStart) {
  if (!online) return
  online.rallyId = ps.rallyId
  online.seed = ps.seed
  online.point = {
    server: (ps.server === online.seat ? HUMAN : AI) as Side,
    serveNumber: ps.serveNumber,
    deuceCourt: ps.deuceCourt,
    wind: wire({ x: ps.wind.x, z: ps.wind.z }),
  }
  online.mine.clear()
  online.pressT = null
  online.anchor = { sim: sim.time, server: online.wall() }
  sim.phase = 'dead'
  sim.deadTimer = Math.max(0, (ps.startsAt - online.now()) / 1000)
  pendingAfterDead = 'serve'
}

/** The server's verdict on the point (score and toasts are handled by the net layer). */
export function onlineRallyOver() {
  if (!online) return
  if (sim.phase !== 'dead') awaitCall()
}

export function onlineToss(msg: TossMsg) {
  if (!online || msg.rallyId !== online.rallyId) return
  const p = wire(msg.p)
  online.auth = {
    t0: msg.t,
    ball: { p, v: { x: 0, y: SERVE.tossSpeed, z: 0 }, w: { x: 0, y: 0, z: 0 } },
    hit: 0,
    from: AI,
  }
  sim.held = false
  const a = sim.athletes[AI]
  a.tossing = true
  a.swing = 'serve'
  a.swingT = 0
  a.swingShot = msg.shot
  online.remote.lockUntil = sim.time + 1.8
  const b = authNow()
  if (b) setBall(b)
}

/** A strike resolved by the server: the opponent's, or the echo of mine. */
export function onlineStrike(s: StrikeResolved) {
  if (!online || s.rallyId !== online.rallyId) return
  const ball: BallState = { p: wire(s.ball.p), v: wire(s.ball.v), w: wire(s.ball.w) }
  const mineSide = s.from === online.seat
  online.auth = { t0: s.t, ball, hit: s.hit, from: mineSide ? HUMAN : AI }
  if (mineSide) {
    // Usually identical to what this client already applied; correct it if not.
    const applied = online.mine.get(s.hit)
    const off = applied
      ? Math.hypot(applied.v.x - ball.v.x, applied.v.y - ball.v.y, applied.v.z - ball.v.z) +
        Math.hypot(applied.w.x - ball.w.x, applied.w.y - ball.w.y, applied.w.z - ball.w.z) * 0.01
      : Infinity
    if (off > 0.05) {
      const b = authNow()
      if (b) setBall(b)
      sim.landing = { x: wire(s.landing).x, z: wire(s.landing).z, t: sim.time }
      predictFromBall()
    }
    return
  }
  // The opponent hit it.
  const b = authNow()
  if (!b) return
  setBall(b)
  sim.held = false
  sim.lastHitter = AI
  sim.hits = s.hit
  sim.bounces = 0
  sim.firstBounce = null
  sim.netTouched = false
  if (AI !== sim.server) sim.receiverTouched = true
  const landing = wire(s.landing)
  sim.landing = { x: landing.x, z: landing.z, t: sim.time }
  predictFromBall()
  hudLive.lastShotKmh = s.speed * 3.6
  // The first strike of a point is the serve.
  if (s.hit === 1) useGame.getState().showServeSpeed(Math.round(s.speed * 3.6))
  pushEvent({ kind: 'hit', x: ball.p.x, y: ball.p.y, z: ball.p.z, power: Math.min(1, s.speed / 50) })
  const a = sim.athletes[AI]
  const elapsed = Math.max(0, (online.now() - s.t) / 1000)
  if (s.kind === 'serve') {
    a.swing = 'serve'
    a.swingT = 1 + elapsed
    a.tossing = false
  } else {
    // Forehand if the ball was on the opponent's right (they face +z, so their right is -x).
    a.swing = ball.p.x < a.x ? 'forehand' : 'backhand'
    a.swingT = TIMING.swingLead + elapsed
    a.swingShot = s.shot
  }
  online.remote.lockUntil = sim.time + 0.6
  sim.athletes[HUMAN].split = 0.32
  useGame.getState().setRally(s.kind === 'serve' ? 1 : s.hit)
}

/** The server refused my swing: the ball carries on as the server has it. */
export function onlineStrikeRefused(hit: number) {
  if (!online) return
  online.mine.delete(hit)
  const b = authNow()
  if (!b || !online.auth) return
  setBall(b)
  sim.lastHitter = online.auth.from
  sim.hits = online.auth.hit
  sim.held = false
  predictFromBall()
}

/** The server pulled me back: I moved faster than the game allows. */
export function onlineCorrect(pos: { x: number; z: number }) {
  if (!online) return
  const p = wire(pos)
  const a = sim.athletes[HUMAN]
  a.x = p.x
  a.z = p.z
}

export function onlineRemoteState(st: AthleteState) {
  if (!online) return
  const r = online.remote
  const p = wire({ x: st.x, z: st.z })
  const v = wire({ x: st.vx, z: st.vz })
  r.buf.push({ t: st.t, x: p.x, z: p.z, vx: v.x, vz: v.z, yaw: wireYaw(st.yaw) })
  if (r.buf.length > 40) r.buf.shift()
  r.swing = st
}

/** Moves the opponent along their reported path, ~100 ms behind, and sends my own state. */
function updateRemote(dt: number) {
  if (!online) return
  const a = sim.athletes[AI]
  updateSwing(a, dt)
  const r = online.remote
  const t = online.now() - 100
  const buf = r.buf
  if (buf.length) {
    let i = buf.length - 1
    while (i > 0 && buf[i - 1].t > t) i--
    const b = buf[i]
    const prev = i > 0 ? buf[i - 1] : b
    const k = b.t > prev.t ? Math.max(0, Math.min(1, (t - prev.t) / (b.t - prev.t))) : 1
    a.x = prev.x + (b.x - prev.x) * k
    a.z = prev.z + (b.z - prev.z) * k
    // Interpolate the velocity too: the animation reads it (gait, lean), and stepping it per
    // packet made the remote player's legs and body twitch.
    a.vx = prev.vx + (b.vx - prev.vx) * k
    a.vz = prev.vz + (b.vz - prev.vz) * k
    a.yaw = b.yaw
  }
  // Swing animation from the opponent's own updates, unless a strike or toss just set it.
  if (r.swing && sim.time > r.lockUntil) {
    a.swing = r.swing.swing
    a.swingT = r.swing.swingT
    a.swingShot = r.swing.swingShot
    a.tossing = r.swing.tossing
  }

  // My state, about 20 times a second.
  online.sendClock += dt
  if (online.sendClock >= 0.05) {
    online.sendClock = 0
    const me = sim.athletes[HUMAN]
    const p = wire({ x: me.x, z: me.z })
    const v = wire({ x: me.vx, z: me.vz })
    online.send.state({
      rallyId: online.rallyId,
      seq: ++online.seq,
      t: online.now(),
      x: p.x,
      z: p.z,
      vx: v.x,
      vz: v.z,
      yaw: wireYaw(me.yaw),
      swing: me.swing,
      swingT: me.swingT,
      swingShot: me.swingShot,
      tossing: me.tossing,
    })
  }
}
