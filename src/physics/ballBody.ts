import { newEvents, resetEvents, stepBall, type StepEvents, type V3 } from './flight'

// The live ball: the same step as the predictor and the server (flight.ts stepBall), so the ball
// you see, the landing marker, the AI's read and the server's line calls all follow one path.
// It keeps the small part of a rigid body's interface the game uses, plus a spin orientation
// for the felt to turn by.

export class BallBody {
  readonly p: V3 = { x: 0, y: 1.4, z: 12 }
  readonly v: V3 = { x: 0, y: 0, z: 0 }
  readonly w: V3 = { x: 0, y: 0, z: 0 }
  /** Orientation (quaternion x, y, z, w) integrated from the spin, for rendering. */
  readonly q = { x: 0, y: 0, z: 0, w: 1 }
  /** Contacts during the last step. */
  readonly events: StepEvents = newEvents()

  translation(): V3 {
    return { x: this.p.x, y: this.p.y, z: this.p.z }
  }
  linvel(): V3 {
    return { x: this.v.x, y: this.v.y, z: this.v.z }
  }
  angvel(): V3 {
    return { x: this.w.x, y: this.w.y, z: this.w.z }
  }
  rotation() {
    return { ...this.q }
  }
  setTranslation(p: V3, _wake?: boolean) {
    this.p.x = p.x
    this.p.y = p.y
    this.p.z = p.z
  }
  setLinvel(v: V3, _wake?: boolean) {
    this.v.x = v.x
    this.v.y = v.y
    this.v.z = v.z
  }
  setAngvel(w: V3, _wake?: boolean) {
    this.w.x = w.x
    this.w.y = w.y
    this.w.z = w.z
  }

  /** Advances one physics step; `events` then tells what it touched. */
  step(dt: number) {
    resetEvents(this.events)
    stepBall(this.p, this.v, this.w, dt, this.events)
    // Turn the felt with the spin: q += 0.5 * (w, 0) * q * dt, renormalised.
    const { x, y, z, w } = this.q
    const wx = this.w.x * dt * 0.5
    const wy = this.w.y * dt * 0.5
    const wz = this.w.z * dt * 0.5
    const nx = x + wx * w + wy * z - wz * y
    const ny = y + wy * w + wz * x - wx * z
    const nz = z + wz * w + wx * y - wy * x
    const nw = w - wx * x - wy * y - wz * z
    const len = Math.hypot(nx, ny, nz, nw) || 1
    this.q.x = nx / len
    this.q.y = ny / len
    this.q.z = nz / len
    this.q.w = nw / len
  }
}
