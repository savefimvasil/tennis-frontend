import { useEffect, useRef, useState } from 'react'
import { useGame, hudLive } from '../game/store'
import { pointLabel, pressureLabel, scoreCall, setsWon } from '../game/scoring'
import { SERVE } from '../game/tuning'
import type { Side } from '../game/constants'

const NAMES: Record<Side, string> = { 0: 'You', 1: 'R. Okafor' }
const GRADE_LABEL = { perfect: 'Perfect', good: 'Good', early: 'Early', late: 'Late' } as const

function Scoreboard() {
  const match = useGame((s) => s.match)
  const serveNumber = useGame((s) => s.serveNumber)
  const pressure = pressureLabel(match)
  const call = scoreCall(match)
  return (
    <div className="scoreboard" aria-label="Scoreboard">
      {([0, 1] as Side[]).map((side) => (
        <div className={`sb-row ${side === 0 ? 'home' : 'away'}`} key={side}>
          <span className="sb-serve">{match.server === side ? <i /> : null}</span>
          <span className="sb-name">{NAMES[side]}</span>
          {match.sets.map((set, i) => (
            <span className={`sb-set ${set[side] > set[side === 0 ? 1 : 0] ? 'won' : ''}`} key={i}>
              {set[side]}
            </span>
          ))}
          <span className="sb-games">{match.games[side]}</span>
          <span className="sb-points">{pointLabel(match, side)}</span>
        </div>
      ))}
      <div className="sb-foot">
        <span>{match.tiebreak ? 'Tiebreak' : call || 'Love all'}</span>
        <span>
          {pressure ? <b>{pressure}</b> : null}
          {serveNumber === 2 ? <b className="second">2nd serve</b> : null}
        </span>
      </div>
      <div className="sb-sets" aria-hidden>
        Sets {setsWon(match, 0)}–{setsWon(match, 1)}
      </div>
    </div>
  )
}

function Toast() {
  const toast = useGame((s) => s.toast)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!toast) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 1900)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast) return null
  return (
    <div key={toast.id} className={`toast ${toast.tone} ${visible ? 'show' : ''}`} role="status">
      <div className="toast-title">{toast.title}</div>
      {toast.detail ? <div className="toast-detail">{toast.detail}</div> : null}
    </div>
  )
}

function TimingGrade() {
  const timing = useGame((s) => s.timing)
  if (!timing) return null
  return (
    <div key={timing.id} className={`grade grade-${timing.grade}`}>
      {GRADE_LABEL[timing.grade]}
    </div>
  )
}

/** Toss meter and shot speed are written straight to the DOM every frame. */
function LiveReadouts() {
  const meter = useRef<HTMLDivElement>(null)
  const fill = useRef<HTMLDivElement>(null)
  const call = useRef<HTMLDivElement>(null)
  const speed = useRef<HTMLSpanElement>(null)
  const windArrow = useRef<HTMLSpanElement>(null)
  const windText = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    let lastKmh = -1
    const tick = () => {
      const m = hudLive.tossMeter
      const stage = hudLive.serveStage
      if (meter.current && fill.current && call.current) {
        meter.current.dataset.stage = stage ?? 'off'
        fill.current.style.left = `${(m ?? 0) * 100}%`
        let text = 'Hold a shot key to toss'
        let state = 'idle'
        if (stage === 'toss' && m !== null) {
          const y = SERVE.handHeight + m * (SERVE.apex - SERVE.handHeight)
          if (y >= SERVE.perfectY[0]) [text, state] = ['Now!', 'perfect']
          else if (y >= SERVE.goodY[0]) [text, state] = [hudLive.tossFalling ? 'Hit it!' : 'Almost…', 'good']
          else
            [text, state] = [
              hudLive.tossFalling ? 'Too late — let it drop to re-toss' : 'Wait for the top…',
              hudLive.tossFalling ? 'late' : 'idle',
            ]
        }
        if (call.current.textContent !== text) call.current.textContent = text
        call.current.dataset.state = state
      }
      const kmh = Math.round(hudLive.lastShotKmh)
      if (speed.current && kmh !== lastKmh) {
        speed.current.textContent = kmh ? String(kmh) : '–'
        lastKmh = kmh
      }
      const w = hudLive.wind
      if (windArrow.current && windText.current) {
        // The camera looks down -z, so screen-up is -z and screen-right is +x.
        windArrow.current.style.transform = `rotate(${Math.atan2(w.x, -w.z)}rad)`
        windText.current.textContent = `${Math.round(Math.hypot(w.x, w.z) * 3.6)} km/h`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  const span = SERVE.apex - SERVE.handHeight
  const lo = (SERVE.perfectY[0] - SERVE.handHeight) / span
  const hi = Math.min(1, (SERVE.perfectY[1] - SERVE.handHeight) / span)
  const goodLo = (SERVE.goodY[0] - SERVE.handHeight) / span
  return (
    <>
      <div className="serve-panel" ref={meter} data-stage="off" aria-live="polite">
        <div className="serve-steps">
          <span className="step aim">
            <kbd>←</kbd>
            <kbd>→</kbd> aim
          </span>
          <span className="step toss">hold a shot key to toss</span>
          <span className="step hit">release in the zone</span>
        </div>
        <div className="serve-meter" aria-hidden>
          <div className="serve-good" style={{ left: `${goodLo * 100}%`, width: `${(lo - goodLo) * 100}%` }} />
          <div className="serve-perfect" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
          <div className="serve-ball" ref={fill} />
        </div>
        <div className="serve-call" ref={call}>
          Hold a shot key to toss
        </div>
        <div className="serve-keys">
          <span>
            <kbd>W</kbd> flat
          </span>
          <span>
            <kbd>E</kbd> slice
          </span>
          <span>
            <kbd>Q</kbd> kick
          </span>
          <span>
            <kbd>R</kbd> safe
          </span>
        </div>
      </div>
      <div className="speed">
        <span ref={speed}>–</span>
        <small>km/h last shot</small>
      </div>
      <div className="wind" aria-label="Wind">
        <span className="wind-arrow" ref={windArrow}>
          ↑
        </span>
        <span>
          <small>Wind</small>
          <span ref={windText}>0 km/h</span>
        </span>
      </div>
    </>
  )
}

function Controls() {
  return (
    <div className="controls" aria-label="Controls">
      <span>
        <kbd>←↑↓→</kbd> move / aim
      </span>
      <span>
        <kbd>Q</kbd> topspin
      </span>
      <span>
        <kbd>W</kbd> flat
      </span>
      <span>
        <kbd>E</kbd> slice
      </span>
      <span>
        <kbd>R</kbd> lob
      </span>
      <span>
        <kbd>Esc</kbd> pause
      </span>
    </div>
  )
}

export function Hud() {
  const rally = useGame((s) => s.stats.rally)
  const muted = useGame((s) => s.muted)
  const toggleMute = useGame((s) => s.toggleMute)
  const pause = useGame((s) => s.pause)
  return (
    <div className="hud">
      <Scoreboard />
      <div className="hud-right">
        <button className="icon-btn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? 'Sound off' : 'Sound on'}
        </button>
        <button className="icon-btn" onClick={pause} aria-label="Pause">
          Pause
        </button>
      </div>
      <Toast />
      <TimingGrade />
      <LiveReadouts />
      {rally > 2 ? <div className="rally">Rally {rally}</div> : null}
      <Controls />
    </div>
  )
}
