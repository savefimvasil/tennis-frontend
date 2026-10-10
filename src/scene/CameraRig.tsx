import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { COURT } from '../game/constants'
import { sim } from '../game/sim'
import { useGame } from '../game/store'

const pos = new THREE.Vector3()
const look = new THREE.Vector3()

/**
 * Broadcast-style chase camera behind the human player. In menus it slowly
 * orbits the court instead.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera)
  const current = useRef({ look: new THREE.Vector3(0, 1, -8), init: false })

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const screen = useGame.getState().screen
    const c = current.current
    if (screen === 'menu' || screen === 'online' || screen === 'over') {
      const t = state.clock.elapsedTime * 0.05
      // A slow orbit inside the venue (the hall's walls are just outside the fence).
      pos.set(Math.sin(t) * 9.5, 5 + Math.sin(t * 2) * 0.8, Math.cos(t) * 17)
      look.set(0, 0.5, 0)
    } else if (sim.review) {
      // Hawk-Eye: low over the mark, looking along the line it was judged against.
      const r = sim.review
      const along = r.axis === 'x' ? new THREE.Vector3(0, 0, -Math.sign(r.z) || -1) : new THREE.Vector3(1, 0, 0)
      const out =
        r.axis === 'x' ? new THREE.Vector3(Math.sign(r.value) || 1, 0, 0) : new THREE.Vector3(0, 0, Math.sign(r.value))
      pos.set(r.x, 0, r.z).addScaledVector(along, -1.6).addScaledVector(out, -0.9)
      pos.y = 1.25
      look.set(r.x, 0.02, r.z)
    } else {
      const a = sim.athletes[0]
      // Trail behind and above the player, leaning toward the ball side.
      const ball = sim.ball?.translation()
      const bx = ball ? ball.x : 0
      pos.set(a.x * 0.55 + bx * 0.08, 3.25, Math.min(a.z + 7.2, COURT.fenceZ - 0.6))
      look.set(a.x * 0.3 + bx * 0.12, 0.7, a.z - 12)
    }
    // Dev-only: fixed camera for automated close-up screenshots.
    const override = import.meta.env.DEV && (window as { __camOverride?: [number[], number[]] }).__camOverride
    if (override) {
      pos.fromArray(override[0])
      look.fromArray(override[1])
    }
    const k = 1 - Math.exp(-dt * (sim.review ? 3 : screen === 'playing' ? 4.5 : 1.2))
    // Dev-only hook so automated screenshots don't wait on camera easing.
    const snap = import.meta.env.DEV && (window as { __snapCamera?: boolean }).__snapCamera
    if (!c.init || snap) {
      camera.position.copy(pos)
      c.look.copy(look)
      c.init = true
    }
    camera.position.lerp(pos, k)
    c.look.lerp(look, k)

    // Hit shake, decaying quickly.
    if (sim.shake > 0.001) {
      const s = sim.shake * 0.05
      camera.position.x += (Math.random() - 0.5) * s
      camera.position.y += (Math.random() - 0.5) * s
      sim.shake *= Math.exp(-dt * 9)
    }
    camera.lookAt(c.look)
  })
  return null
}
