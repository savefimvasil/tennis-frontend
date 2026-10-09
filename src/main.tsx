import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.DEV) {
  // Debug handle for automated playtesting in development builds.
  void Promise.all([import('./game/sim'), import('./game/store')]).then(([s, g]) => {
    Object.assign(window, { __sim: s.sim, __game: g.useGame })
  })
}
