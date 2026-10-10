import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { AI, HUMAN, halfSign, other } from '../game/constants'
import { serverXSign } from '../game/shot'
import { inServiceBox, inSinglesCourt } from '../physics/flight'
import { sim } from '../game/sim'
import { hudLive, useGame } from '../game/store'
import { playApplause, playBounce, playFence, playGroan, playHit, playNet } from '../audio/sound'
import { radialTexture } from './textures'

/** The player's own strikes buzz the pad (or the phone), harder for harder hits. */
function rumble(power: number) {
  const pads = navigator.getGamepads?.() ?? []
  for (const pad of pads) {
    const act = (
      pad as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } }) | null
    )?.vibrationActuator
    act
      ?.playEffect?.('dual-rumble', {
        duration: 40 + power * 50,
        strongMagnitude: 0.25 + power * 0.6,
        weakMagnitude: 0.5,
      })
      ?.catch(() => {})
  }
  if (matchMedia('(pointer: coarse)').matches) navigator.vibrate?.(Math.round(12 + power * 18))
}

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

/** Where the shot you have called will go, steered by the stick until contact. */
function AimMarker() {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame((state) => {
    const t = sim.phase === 'rally' ? hudLive.aimTarget : null
    ref.current.visible = !!t
    if (!t) return
    ref.current.position.set(t.x, 0.01, t.z)
    ref.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 8) * 0.06)
  })
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} renderOrder={3} visible={false}>
      <ringGeometry args={[0.34, 0.42, 40]} />
      <meshBasicMaterial color="#9be7ff" transparent opacity={0.8} toneMapped={false} depthWrite={false} />
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
    // Red when the ball is heading out (or out of the box on a serve): leave it, or learn the line.
    const hitter = sim.lastHitter
    const zSign = hitter ? halfSign(other(hitter)) : 1
    const out = !hitter
      ? false
      : sim.phase === 'serve'
        ? !inServiceBox(l.x, l.z, zSign, -serverXSign(hitter, sim.deuceCourt) as 1 | -1)
        : !inSinglesCourt(l.x, l.z, zSign)
    ring.current.color.set(out ? '#ff4d4d' : incoming ? '#ffe14d' : '#ffffff')
    dot.current.color.set(out ? '#ff4d4d' : '#ffe14d')
    ring.current.opacity = incoming || out ? 0.95 : 0.45
    dot.current.opacity = incoming || out ? 0.9 : 0.35
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
      if (e.kind === 'hit') {
        playHit(e.power, e.x, e.z)
        if (sim.lastHitter === HUMAN) rumble(e.power)
      }
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
        <mesh
          key={i}
          ref={(m) => void (meshes.current[i] = m)}
          rotation-x={-Math.PI / 2}
          visible={false}
          renderOrder={2}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={tex} color="#e6dcc8" transparent depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

const MARKS = 40
const markDummy = new THREE.Object3D()

/** How bounce marks look and last on each surface: clay keeps them, hard courts barely. */
const MARK_STYLE = {
  clay: { color: '#5a2614', strength: 0.85, life: 40 },
  grass: { color: '#2c4419', strength: 0.55, life: 12 },
  hard: { color: '#dfe6ee', strength: 0.3, life: 4 },
} as const

const markVertex = /* glsl */ `
  attribute float aLife;
  varying vec2 vUv;
  varying float vLife;
  void main() {
    vUv = uv;
    vLife = aLife;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  }
`
const markFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec2 vUv;
  varying float vLife;
  void main() {
    // A soft oval, a little denser at the leading end where the ball skidded out.
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p);
    float m = smoothstep(1.0, 0.25, d) * (0.75 + 0.25 * smoothstep(-1.0, 1.0, p.y));
    float a = m * clamp(vLife, 0.0, 1.0) * uStrength;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`

/** Marks where the ball bounced, stretched along its path; they fade at a surface-dependent rate. */
function BallMarks() {
  const surface = useGame((s) => s.venue)
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const state = useMemo(() => ({ next: 0, seen: 0, life: new Float32Array(MARKS) }), [])
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1)
    g.rotateX(-Math.PI / 2)
    g.setAttribute('aLife', new THREE.InstancedBufferAttribute(state.life, 1))
    return g
  }, [state])
  const style = MARK_STYLE[surface]
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: markVertex,
        fragmentShader: markFragment,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        uniforms: { uColor: { value: new THREE.Color(style.color) }, uStrength: { value: style.strength } },
      }),
    [style],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => geometry.dispose(), [geometry])
  // A new court starts clean.
  useEffect(() => void state.life.fill(0), [surface, state])

  useFrame((_, dt) => {
    const m = mesh.current
    if (!m) return
    const dummy = markDummy
    for (const e of sim.events) {
      if (e.id <= state.seen) continue
      state.seen = e.id
      if (e.kind !== 'bounce') continue
      const v = sim.ball?.linvel()
      const dir = v ? Math.atan2(v.x, v.z) : 0
      const i = state.next++ % MARKS
      // Faster, flatter bounces leave longer skids (a real clay mark is 15-30 cm long).
      dummy.position.set(e.x, 0.004, e.z)
      dummy.rotation.set(0, dir, 0)
      dummy.scale.set(0.1, 1, 0.16 + e.power * 0.2)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      state.life[i] = 1
      m.instanceMatrix.needsUpdate = true
    }
    let alive = false
    for (let i = 0; i < MARKS; i++) {
      if (state.life[i] <= 0) continue
      state.life[i] = Math.max(0, state.life[i] - dt / style.life)
      alive = true
    }
    if (alive) (m.geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[geometry, material, MARKS]} frustumCulled={false} renderOrder={1} />
}

export function Fx() {
  return (
    <>
      <BallMarks />
      <BallBlob />
      <LandingMarker />
      <AimMarker />
      <EventFx />
    </>
  )
}
