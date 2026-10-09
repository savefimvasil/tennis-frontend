import type { ShotType } from '../game/tuning'

// Keyboard + Gamepad input merged into one polled state.

export interface InputState {
  moveX: number
  moveY: number
  /** Which shot buttons are held right now. */
  held: Record<ShotType, boolean>
  /** Shot buttons pressed since the last poll. */
  pressed: ShotType[]
  /** Shot buttons released since the last poll. */
  released: ShotType[]
  pause: boolean
}

const KEY_SHOTS: Record<string, ShotType> = {
  KeyJ: 'topspin',
  KeyK: 'slice',
  KeyL: 'lob',
  KeyI: 'flat',
  Space: 'topspin',
}

// Standard mapping: 0 A/Cross, 1 B/Circle, 2 X/Square, 3 Y/Triangle
const PAD_SHOTS: [number, ShotType][] = [
  [0, 'topspin'],
  [1, 'slice'],
  [3, 'lob'],
  [2, 'flat'],
]

const keys = new Set<string>()
const pressedQ: ShotType[] = []
const releasedQ: ShotType[] = []
let pauseQ = false
const padHeld: Record<ShotType, boolean> = { topspin: false, slice: false, lob: false, flat: false }
let padStartHeld = false

function onKeyDown(e: KeyboardEvent) {
  if (e.repeat) return
  keys.add(e.code)
  const shot = KEY_SHOTS[e.code]
  if (shot) {
    pressedQ.push(shot)
    e.preventDefault()
  }
  if (e.code === 'Escape' || e.code === 'KeyP') pauseQ = true
}

function onKeyUp(e: KeyboardEvent) {
  keys.delete(e.code)
  const shot = KEY_SHOTS[e.code]
  if (shot) releasedQ.push(shot)
}

let installed = false
export function installInput() {
  if (installed) return
  installed = true
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', () => keys.clear())
}

const state: InputState = {
  moveX: 0,
  moveY: 0,
  held: { topspin: false, slice: false, lob: false, flat: false },
  pressed: [],
  released: [],
  pause: false,
}

function dead(v: number) {
  return Math.abs(v) < 0.18 ? 0 : v
}

/** Poll once per physics step. moveX: +1 right, moveY: +1 forward (toward the net). */
export function pollInput(): InputState {
  let mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
  let my = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)

  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
  const pad = pads && Array.from(pads).find((p) => p && p.connected)
  if (pad) {
    const ax = dead(pad.axes[0] ?? 0)
    const ay = dead(pad.axes[1] ?? 0)
    if (ax || ay) {
      mx = ax
      my = -ay
    }
    for (const [btn, shot] of PAD_SHOTS) {
      const down = !!pad.buttons[btn]?.pressed
      if (down && !padHeld[shot]) pressedQ.push(shot)
      if (!down && padHeld[shot]) releasedQ.push(shot)
      padHeld[shot] = down
    }
    const start = !!pad.buttons[9]?.pressed
    if (start && !padStartHeld) pauseQ = true
    padStartHeld = start
  }

  if (virtualInput.move.x || virtualInput.move.y) {
    mx = virtualInput.move.x
    my = virtualInput.move.y
  }
  const len = Math.hypot(mx, my)
  if (len > 1) {
    mx /= len
    my /= len
  }
  state.moveX = mx
  state.moveY = my
  for (const shot of Object.values(KEY_SHOTS)) state.held[shot] = false
  for (const [code, shot] of Object.entries(KEY_SHOTS)) if (keys.has(code)) state.held[shot] = true
  for (const shot of Object.keys(padHeld) as ShotType[]) if (padHeld[shot] || virtualHeld[shot]) state.held[shot] = true
  state.pressed = pressedQ.splice(0)
  state.released = releasedQ.splice(0)
  state.pause = pauseQ
  pauseQ = false
  return state
}

/** Drops anything queued (e.g. when the game resumes from a menu). */
export function flushInput() {
  pressedQ.length = 0
  releasedQ.length = 0
  pauseQ = false
}

/** Pause is polled outside the physics loop so it still works while paused. */
export function consumePause(): boolean {
  const p = pauseQ
  pauseQ = false
  return p
}

/** Test/automation hooks: feed presses and stick input without a keyboard. */
export const virtualInput = {
  press(shot: ShotType) {
    pressedQ.push(shot)
    virtualHeld[shot] = true
  },
  release(shot: ShotType) {
    releasedQ.push(shot)
    virtualHeld[shot] = false
  },
  move: { x: 0, y: 0 },
}
const virtualHeld: Record<ShotType, boolean> = { topspin: false, slice: false, lob: false, flat: false }
