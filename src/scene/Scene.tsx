import { lazy, Suspense, useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { Canvas } from '@react-three/fiber'
import { Preload } from '@react-three/drei'
import { Physics, useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import { LAB_ENABLED, useLab } from '../lab/lab'
import * as THREE from 'three'
import { HUMAN, PHYSICS } from '../game/constants'
import { resetForServe, stepGame } from '../game/director'
import { sim } from '../game/sim'
import { hudLive, useGame } from '../game/store'
import { Athlete, KITS } from './athlete/Athlete'
import { opponentSkin, seatSkins, skinById } from './athlete/skins'
import { useNet } from '../net/net'
import { Ball } from './Ball'
import { CameraRig } from './CameraRig'
import { Court } from './Court'
import { Effects } from './Effects'
import { Fx } from './Fx'
import { Lighting } from './Lighting'
import { Net } from './Net'
import { Surroundings } from './Surroundings'

// Physics Lab overlays (?lab): loaded only when the lab is open.
const LabScene = LAB_ENABLED ? lazy(() => import('../lab/LabScene')) : null

/** Slow motion for the lab: Physics is paused and stepped here with scaled time. */
function SlowStepper({ scale }: { scale: number }) {
  const { step } = useRapier()
  useFrame((_, dt) => step(dt * scale))
  return null
}

/** The near player is always this client. Online, each player keeps the outfit they chose. */
function Players({ skin }: { skin: string }) {
  const online = useGame((s) => s.mode === 'online')
  const seat = useNet((s) => s.seat)
  const kit0 = useNet((s) => s.room?.seats[0]?.kit)
  const kit1 = useNet((s) => s.room?.seats[1]?.kit)
  if (online && seat !== null) {
    const skins = seatSkins([kit0, kit1])
    const kits = [KITS.home, KITS.away]
    const opp = seat === 0 ? 1 : 0
    return (
      <>
        <Athlete side={0} kit={kits[seat]} skin={skins[seat]} />
        <Athlete side={1} kit={kits[opp]} skin={skins[opp]} />
      </>
    )
  }
  return (
    <>
      <Athlete side={0} kit={KITS.home} skin={skinById(skin)} />
      <Athlete side={1} kit={KITS.away} skin={opponentSkin(skin)} />
    </>
  )
}

const anchorPoint = new THREE.Vector3()

/** Projects my player to the screen while I serve, for the serve meter that floats beside them. */
function ServeAnchor() {
  useFrame(({ camera, size }) => {
    const a = hudLive.serveAnchor
    if (!hudLive.serveStage) {
      a.ok = false
      return
    }
    const me = sim.athletes[HUMAN]
    anchorPoint.set(me.x, 1.3, me.z).project(camera)
    a.x = ((anchorPoint.x + 1) / 2) * size.width
    a.y = ((1 - anchorPoint.y) / 2) * size.height
    a.ok = anchorPoint.z < 1
  })
  return null
}

function GameLoop() {
  useBeforePhysicsStep(() => stepGame(PHYSICS.timeStep))
  useEffect(() => {
    resetForServe()
    return useGame.subscribe((s, prev) => {
      // Online matches are set up by the server's point:start instead.
      if (s.mode === 'solo' && s.screen === 'playing' && (prev.screen === 'menu' || prev.screen === 'over'))
        resetForServe()
    })
  }, [])
  return null
}

/** Per-quality render budget. Pixel count dominates the cost on laptops (retina screens especially). */
const PRESETS = {
  high: { dprMax: 1.5, shadow: 2048 },
  medium: { dprMax: 1.25, shadow: 1024 },
  low: { dprMax: 1, shadow: 1024 },
} as const

/**
 * Caps the frame rate: 60 fps in play (120 Hz screens would otherwise render twice as much),
 * 30 fps behind menus. Rendering runs on demand and this loop requests frames.
 */
function FrameLimiter({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    let raf = 0
    let last = 0
    const interval = 1000 / fps
    const loop = (now: number) => {
      // Step the schedule by whole intervals for even pacing on 60/120/144 Hz displays;
      // the 1 ms tolerance keeps a 60 Hz display from dropping to 30.
      if (now - last >= interval - 1) {
        last = Math.max(last + interval, now - interval)
        invalidate()
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [fps, invalidate])
  return null
}

export function Scene() {
  const quality = useGame((s) => s.quality)
  const screen = useGame((s) => s.screen)
  const skin = useGame((s) => s.skin)
  const preset = PRESETS[quality]
  // A fixed pixel ratio per quality. Changing it on the fly (as an automatic performance
  // monitor did) reallocates every render target and recompiles shaders: that was the freezing.
  const dpr = Math.min(window.devicePixelRatio || 1, preset.dprMax)
  const shadowSize = preset.shadow
  const timeScale = useLab((s) => (LAB_ENABLED ? s.timeScale : 1))
  const colliders = useLab((s) => LAB_ENABLED && s.colliders)
  const mode = useGame((s) => s.mode)
  // An online match keeps running behind the pause menu: the opponent does not stop.
  const running = screen === 'playing' || (mode === 'online' && screen === 'paused')
  const slow = running && timeScale < 1

  return (
    <Canvas
      shadows="percentage"
      dpr={dpr}
      flat
      frameloop="demand"
      gl={{ antialias: false, powerPreference: 'default', stencil: false }}
      camera={{ fov: 50, near: 0.1, far: 1200, position: [0, 8, 30] }}
      onCreated={(state) => {
        // three.js checks every new shader synchronously, stalling the GPU pipeline; dev only.
        state.gl.debug.checkShaderErrors = import.meta.env.DEV
        // Dev-only handle for automated inspection.
        if (import.meta.env.DEV) Object.assign(window, { __r3f: state })
      }}
    >
      <FrameLimiter fps={running ? 60 : 30} />
      <Lighting key={shadowSize} shadowSize={shadowSize} />
      <Suspense fallback={null}>
        <Physics
          gravity={[0, PHYSICS.gravity, 0]}
          timeStep={PHYSICS.timeStep}
          paused={!running || slow}
          interpolate={false}
          debug={colliders}
        >
          {slow ? <SlowStepper scale={timeScale} /> : null}
          <GameLoop />
          <ServeAnchor />
          <Court />
          <Net />
          <Ball />
        </Physics>
      </Suspense>
      <Players skin={skin} />
      <Surroundings detail={quality} />
      <Fx />
      <CameraRig />
      <Effects quality={quality} />
      {LabScene ? (
        <Suspense fallback={null}>
          <LabScene />
        </Suspense>
      ) : null}
      {/* Compile every shader up front so nothing compiles mid-rally. */}
      <Preload all />
    </Canvas>
  )
}
