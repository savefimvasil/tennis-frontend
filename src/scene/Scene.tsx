import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { Physics, useBeforePhysicsStep } from '@react-three/rapier'
import { PHYSICS } from '../game/constants'
import { resetForServe, stepGame } from '../game/director'
import { useGame } from '../game/store'
import { Athlete, KITS } from './athlete/Athlete'
import { ROCKETBOX } from './athlete/Rocketbox'
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

export function Scene() {
  const quality = useGame((s) => s.quality)
  const setQuality = useGame((s) => s.setQuality)
  const screen = useGame((s) => s.screen)
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, 1.75))
  const shadowSize = quality === 'high' ? 2048 : quality === 'medium' ? 2048 : 1024

  return (
    <Canvas
      shadows="percentage"
      dpr={dpr}
      flat
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 46, near: 0.1, far: 1200, position: [0, 8, 30] }}
    >
      <PerformanceMonitor
        onDecline={() => {
          setDpr((d) => Math.max(0.75, d - 0.25))
          if (quality === 'high') setQuality('medium')
        }}
        onIncline={() => setDpr((d) => Math.min(window.devicePixelRatio || 1, 1.75, d + 0.25))}
        flipflops={3}
        onFallback={() => setQuality('low')}
      />
      <Lighting key={shadowSize} shadowSize={shadowSize} />
      <Suspense fallback={null}>
        <Physics gravity={[0, PHYSICS.gravity, 0]} timeStep={PHYSICS.timeStep} paused={screen !== 'playing'} interpolate>
          <GameLoop />
          <Court />
          <Net />
          <Ball />
        </Physics>
      </Suspense>
      <Athlete side={0} kit={KITS.home} model={ROCKETBOX.home} />
      <Athlete side={1} kit={KITS.away} model={ROCKETBOX.away} />
      <Surroundings detail={quality} />
      <Fx />
      <CameraRig />
      <Effects quality={quality} />
    </Canvas>
  )
}
