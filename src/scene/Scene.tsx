import { Suspense, useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { Physics, useBeforePhysicsStep } from '@react-three/rapier'
import { PHYSICS } from '../game/constants'
import { resetForServe, stepGame } from '../game/director'
import { useGame } from '../game/store'
import { Athlete, KITS } from './athlete/Athlete'
import { opponentSkin, skinById } from './athlete/skins'
import { Ball } from './Ball'
import { CameraRig } from './CameraRig'
import { Court } from './Court'
import { Effects } from './Effects'
import { Fx } from './Fx'
import { Lighting } from './Lighting'
import { Net } from './Net'
import { Surroundings } from './Surroundings'

function GameLoop() {
  useBeforePhysicsStep(() => stepGame(PHYSICS.timeStep))
  useEffect(() => {
    resetForServe()
    return useGame.subscribe((s, prev) => {
      if (s.screen === 'playing' && (prev.screen === 'menu' || prev.screen === 'over')) resetForServe()
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
      // Small tolerance so a 60 Hz display does not drop to 30.
      if (now - last >= interval - 2) {
        last = now
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
  const setQuality = useGame((s) => s.setQuality)
  const screen = useGame((s) => s.screen)
  const skin = useGame((s) => s.skin)
  const preset = PRESETS[quality]
  const deviceDpr = window.devicePixelRatio || 1
  const [dpr, setDpr] = useState(() => Math.min(deviceDpr, preset.dprMax))
  useEffect(() => setDpr(Math.min(deviceDpr, preset.dprMax)), [deviceDpr, preset.dprMax])
  const shadowSize = preset.shadow

  return (
    <Canvas
      shadows="percentage"
      dpr={dpr}
      flat
      frameloop="demand"
      gl={{ antialias: false, powerPreference: 'default', stencil: false }}
      camera={{ fov: 50, near: 0.1, far: 1200, position: [0, 8, 30] }}
      onCreated={(state) => {
        // Dev-only handle for automated inspection.
        if (import.meta.env.DEV) Object.assign(window, { __r3f: state })
      }}
    >
      <FrameLimiter fps={screen === 'playing' ? 60 : 30} />
      {/* Only judge performance during play: menus are deliberately capped at 30 fps. */}
      {screen === 'playing' ? (
        <PerformanceMonitor
          onDecline={() => {
            setDpr((d) => Math.max(0.7, d - 0.15))
            if (quality === 'high') setQuality('medium')
          }}
          onIncline={() => setDpr((d) => Math.min(deviceDpr, preset.dprMax, d + 0.15))}
          flipflops={3}
          onFallback={() => setQuality('low')}
        />
      ) : null}
      <Lighting key={shadowSize} shadowSize={shadowSize} />
      <Suspense fallback={null}>
        <Physics
          gravity={[0, PHYSICS.gravity, 0]}
          timeStep={PHYSICS.timeStep}
          paused={screen !== 'playing'}
          interpolate
        >
          <GameLoop />
          <Court />
          <Net />
          <Ball />
        </Physics>
      </Suspense>
      <Athlete side={0} kit={KITS.home} skin={skinById(skin)} />
      <Athlete side={1} kit={KITS.away} skin={opponentSkin(skin)} />
      <Surroundings detail={quality} />
      <Fx />
      <CameraRig />
      <Effects quality={quality} />
    </Canvas>
  )
}
