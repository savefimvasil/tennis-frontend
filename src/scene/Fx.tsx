import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { AI } from '../game/constants'
import { sim } from '../game/sim'
import { useGame } from '../game/store'
import { playApplause, playBounce, playFence, playGroan, playHit, playNet } from '../audio/sound'
import { radialTexture } from './textures'

/** Soft contact shadow under the ball: the low sun casts the real one far away. */
function BallBlob() {
  const ref = useRef<THREE.Mesh>(null!)
  const mat = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame(() => {
    const b = sim.ball
    if (!b) return
    const p = b.translation()
    const h = Math.max(0, p.y)
    ref.current.position.set(p.x, 0.006, p.z)
    const s = 0.09 + h * 0.06
    ref.current.scale.set(s, s, s)
    mat.current.opacity = Math.max(0, 0.55 - h * 0.12)
  })
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} renderOrder={2}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial ref={mat} map={radialTexture()} color="#000000" transparent depthWrite={false} />
    </mesh>
  )
}

/** Pulsing ring where the current shot will land, like GTA's bounce indicator. */
function LandingMarker() {
  const group = useRef<THREE.Group>(null!)
  const ring = useRef<THREE.MeshBasicMaterial>(null!)
  const dot = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame((state) => {
    const l = sim.landing
    const show = !!l && sim.bounces === 0 && (sim.phase === 'rally' || sim.phase === 'serve')
    group.current.visible = show
    if (!show || !l) return
    const age = sim.time - l.t
    group.current.position.set(l.x, 0.008, l.z)
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 10) * 0.08
    const grow = Math.min(1, age * 4)
    group.current.scale.setScalar(pulse * (0.4 + grow * 0.6))
    const incoming = sim.lastHitter === AI
    ring.current.color.set(incoming ? '#ffe14d' : '#ffffff')
    ring.current.opacity = incoming ? 0.95 : 0.45
    dot.current.opacity = incoming ? 0.9 : 0.35
  })
  return (
    <group ref={group} rotation-x={-Math.PI / 2} renderOrder={3}>
      <mesh>
        <ringGeometry args={[0.24, 0.31, 48]} />
        <meshBasicMaterial ref={ring} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.06, 24]} />
        <meshBasicMaterial ref={dot} color="#ffe14d" transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  )
}

const POOL = 8

/** Expanding dust rings at bounces, plus all event-driven audio. */
function EventFx() {
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const life = useMemo(() => new Float32Array(POOL), [])
  const next = useRef(0)
  const seen = useRef(0)
  const lastToast = useRef(0)
  const tex = useMemo(() => radialTexture(), [])

  useFrame((_, dt) => {
    for (const e of sim.events) {
      if (e.id <= seen.current) continue
      seen.current = e.id
      if (e.kind === 'hit') playHit(e.power, e.x, e.z)
      if (e.kind === 'net') playNet()
      if (e.kind === 'fence') playFence()
      if (e.kind === 'bounce') {
        playBounce(e.power, e.x, e.z)
        const i = next.current++ % POOL
        const m = meshes.current[i]
        if (m) {
          m.position.set(e.x, 0.01, e.z)
          life[i] = 1
        }
      }
    }
    for (let i = 0; i < POOL; i++) {
      const m = meshes.current[i]
      if (!m) continue
      life[i] = Math.max(0, life[i] - dt * 2.2)
      m.visible = life[i] > 0
      const t = 1 - life[i]
      m.scale.setScalar(0.12 + t * 0.55)
      ;(m.material as THREE.MeshBasicMaterial).opacity = life[i] * 0.5
    }
    // Crowd reacts to finished points.
    const toast = useGame.getState().toast
    if (toast && toast.id !== lastToast.current) {
      lastToast.current = toast.id
      if (toast.tone === 'win') playApplause(toast.title === 'Ace' || toast.title === 'Winner' ? 1 : 0.7)
      else if (toast.tone === 'lose') playApplause(0.45)
      else playGroan()
    }
  })

  return (
    <group>
      {Array.from({ length: POOL }, (_, i) => (
        <mesh key={i} ref={(m) => void (meshes.current[i] = m)} rotation-x={-Math.PI / 2} visible={false} renderOrder={2}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={tex} color="#e6dcc8" transparent depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

export function Fx() {
  return (
    <>
      <BallBlob />
      <LandingMarker />
      <EventFx />
    </>
  )
}
