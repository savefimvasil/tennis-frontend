import { COURT } from '../game/constants'
import { sim, type Athlete } from '../game/sim'
import { PLAYER, SHOTS, type AiSpec, type Grade, type ShotType } from '../game/tuning'
import type { Flight } from '../physics/flight'

// The AI defends -z and faces +z, so its right hand is toward -x.
const STANCE = 0.8

export function pickGrade(spec: AiSpec, boost = 0): Grade {
  const g = spec.grades
  let r = Math.random() * (1 - boost)
  for (const k of ['perfect', 'good', 'early', 'late'] as Grade[]) {
    r -= g[k]
    if (r <= 0) return k
  }
  return 'good'
}

/**
 * Chooses where the AI should stand to meet the ball. Prefers a comfortable
 * contact height after the bounce, falling back to the most reachable point.
 */
export function planIntercept(ai: Athlete, flight: Flight, elapsed: number, spec: AiSpec, mustBounce: boolean) {
  const firstBounce = flight.bounces[0]
  const bounceT = firstBounce && firstBounce.z < 0 ? firstBounce.t : Infinity
  let best: { x: number; z: number; slack: number } | null = null
  let comfortable: { x: number; z: number } | null = null
  const reactLeft = Math.max(0, spec.reaction - elapsed)
  let apexPassed = false
  let prevY = Infinity

  for (const s of flight.samples) {
    if (s.t <= elapsed) continue
    const afterBounce = s.t > bounceT
    if (afterBounce) {
      if (s.y < prevY) apexPassed = true
      prevY = s.y
    }
    if (s.z > -0.8 || s.z < -COURT.fenceZ + 1.5) continue
    // Volleys are only allowed when already near the net.
    if (!afterBounce && (mustBounce || ai.z < -5)) continue
    if (s.y < PLAYER.minContactY + 0.15 || s.y > 2.2) continue
    const fh = s.x + STANCE
    const bh = s.x - STANCE
    const sx = Math.abs(fh - ai.x) <= Math.abs(bh - ai.x) ? fh : bh
    const sz = s.z - PLAYER.contactAhead
    const dist = Math.hypot(sx - ai.x, sz - ai.z)
    const need = reactLeft + dist / spec.speed + 0.08
    const slack = s.t - elapsed - need
    if (slack >= 0 && afterBounce && apexPassed && s.y >= 0.5 && s.y <= 1.35) {
      comfortable = { x: sx, z: sz }
      break
    }
    if (!best || (best.slack < 0 && slack > best.slack) || (slack >= 0 && best.slack < 0)) {
      best = { x: sx, z: sz, slack }
    }
  }
  const pick = comfortable ?? best
  if (!pick) return null
  return { x: pick.x, z: Math.max(-COURT.fenceZ + 1, Math.min(-0.8, pick.z)) }
}

export interface AiShot {
  shot: ShotType
  target: { x: number; z: number }
}

export function chooseShot(ai: Athlete, ballY: number, lateral: number, spec: AiSpec): AiShot {
  const human = sim.athletes[0]
  const margin = spec.aimMargin + Math.random() * 0.5
  const wide = COURT.singlesHalfWidth - margin
  const stretched = Math.abs(lateral) > 1.15 || ballY < 0.35
  const humanAtNet = human.z < 6
  let shot: ShotType = 'topspin'
  const r = Math.random()
  if (humanAtNet) shot = r < 0.35 ? 'lob' : r < 0.75 ? 'topspin' : 'flat'
  else if (stretched) shot = r < 0.45 ? 'slice' : r < 0.7 ? 'lob' : 'topspin'
  else if (ai.z > -8.5) shot = r < 0.6 ? 'flat' : 'topspin'
  else shot = r < 0.68 ? 'topspin' : r < 0.84 ? 'slice' : 'flat'

  // Aim away from the human, sometimes through the middle to stay unpredictable.
  let tx: number
  if (Math.random() < 0.28) tx = (Math.random() * 2 - 1) * 1.8
  else tx = human.x > 0.3 ? -wide : human.x < -0.3 ? wide : Math.random() < 0.5 ? -wide : wide
  const spec2 = SHOTS[shot]
  let depth = spec2.depth * (0.88 + Math.random() * 0.16)
  if (humanAtNet && shot !== 'lob') depth = 6 + Math.random() * 3
  depth = Math.min(depth, COURT.halfLength - margin * 0.6)
  return { shot, target: { x: tx, z: depth } }
}
