import { lazy, Suspense, useEffect } from 'react'
import { Scene } from './scene/Scene'
import { Hud } from './ui/Hud'
import { GameOver, MainMenu, PauseMenu } from './ui/Menu'
import { useGame } from './game/store'
import { installInput, flushInput } from './input/input'
import { setMuted } from './audio/sound'
import { LAB_ENABLED } from './lab/lab'

const LabPanel = LAB_ENABLED ? lazy(() => import('./lab/LabPanel')) : null

export default function App() {
  const screen = useGame((s) => s.screen)
  const muted = useGame((s) => s.muted)

  useEffect(() => {
    installInput()
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'KeyP') return
      const st = useGame.getState()
      if (st.screen === 'playing') st.pause()
      else if (st.screen === 'paused') {
        flushInput()
        st.resume()
      }
    }
    const onBlur = () => useGame.getState().pause()
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(() => setMuted(muted), [muted])

  return (
    <div className="app">
      <Scene />
      {screen === 'playing' || screen === 'paused' ? <Hud /> : null}
      {screen === 'menu' ? <MainMenu /> : null}
      {screen === 'paused' ? <PauseMenu /> : null}
      {screen === 'over' ? <GameOver /> : null}
      {LabPanel ? (
        <Suspense fallback={null}>
          <LabPanel />
        </Suspense>
      ) : null}
    </div>
  )
}
