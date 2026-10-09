// All units are metres / seconds / kilograms. ITF court dimensions.
// Axes: x = across the court, y = up, z = along the court.
// The human player defends +z, the AI opponent defends -z, the net is at z = 0.

export const COURT = {
  halfLength: 11.885,
  singlesHalfWidth: 4.115,
  doublesHalfWidth: 5.485,
  serviceLine: 6.4,
  netHeightCenter: 0.914,
  netHeightPost: 1.07,
  netPostX: 6.4,
  singlesStickX: 5.029,
  lineWidth: 0.05,
  baselineWidth: 0.08,
  // Run-off area enclosed by the fence.
  fenceX: 10.5,
  fenceZ: 19,
  fenceHeight: 3.6,
} as const

export const BALL = {
  radius: 0.0335,
  mass: 0.057,
  restitution: 0.76,
  friction: 0.55,
} as const

export const PHYSICS = {
  gravity: -9.81,
  timeStep: 1 / 120,
} as const

/** Net height (top of tape) at a given x, approximating the cord sag. */
export function netHeightAt(x: number): number {
  const t = Math.min(1, Math.abs(x) / COURT.netPostX)
  return COURT.netHeightCenter + (COURT.netHeightPost - COURT.netHeightCenter) * t * t
}

export type Side = 0 | 1
export const HUMAN: Side = 0
export const AI: Side = 1

/** +1 for the human's half of the court, -1 for the AI's. */
export function halfSign(side: Side): 1 | -1 {
  return side === HUMAN ? 1 : -1
}

export function other(side: Side): Side {
  return side === HUMAN ? AI : HUMAN
}
