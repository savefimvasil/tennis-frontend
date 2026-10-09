import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Fire, Gauge, Pause, SpeakerHigh, SpeakerSlash, TennisBall, Wind } from '@phosphor-icons/react'
import { useGame, hudLive } from '../game/store'
import { pointLabel, pressureLabel, scoreCall, setsWon } from '../game/scoring'
import { SERVE } from '../game/tuning'
import type { Side } from '../game/constants'
import { ArrowKeys, Key, Rolling } from './kit'

const GRADE_LABEL = { perfect: 'Perfect', good: 'Good', early: 'Early', late: 'Late' } as const

function Scoreboard() {
  const match = useGame((s) => s.match)
  const serveNumber = useGame((s) => s.serveNumber)
  const opponent = useGame((s) => s.opponentName)
  const names: Record<Side, string> = { 0: 'You', 1: opponent }
  const pressure = pressureLabel(match)
  const call = scoreCall(match)
  return (
    <div className="scoreboard" aria-label="Scoreboard">
      {([0, 1] as Side[]).map((side) => (
        <div className={`sb-row ${side === 0 ? 'home' : 'away'}`} key={side}>
          <span className="sb-serve">
            <AnimatePresence>
              {match.server === side ? (
                <motion.span
                  key="ball"
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                >
                  <TennisBall weight="fill" />
                </motion.span>
              ) : null}
            </AnimatePresence>
          </span>
          <span className="sb-name">{names[side]}</span>
          {match.sets.map((set, i) => (
            <span className={`sb-set ${set[side] > set[side === 0 ? 1 : 0] ? 'won' : ''}`} key={i}>
              {set[side]}
            </span>
          ))}
          <Rolling className="sb-games" value={match.games[side]} />
          <Rolling className="sb-points" value={pointLabel(match, side)} />
        </div>
      ))}
      <div className="sb-foot">
        <span>{match.tiebreak ? 'Tiebreak' : call || 'Love all'}</span>
        <span>
          <AnimatePresence>
            {pressure ? (
              <motion.b
                key={pressure}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
              >
                {pressure}
              </motion.b>
            ) : null}
            {serveNumber === 2 ? (
              <motion.b
                key="second"
                className="second"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
              >
                2nd serve
              </motion.b>
            ) : null}
          </AnimatePresence>
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
  // A call stays up ~2 s; the next point's call replaces it.
  const [hiddenId, setHiddenId] = useState(-1)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setHiddenId(toast.id), 1900)
    return () => clearTimeout(t)
  }, [toast])
  return (
    <div className="toast-anchor" role="status">
      <AnimatePresence>
        {toast && toast.id !== hiddenId ? <ToastCard key={toast.id} {...toast} /> : null}
      </AnimatePresence>
    </div>
  )
}

/** Point call: a skewed colour band sweeps in and the title punches in over it. */
function ToastCard({ title, detail, tone }: { title: string; detail?: string; tone: string }) {
  return (
    <motion.div className={`toast ${tone}`} exit={{ opacity: 0, y: -14, transition: { duration: 0.25 } }}>
      <motion.div
        className="toast-band"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      />
      <motion.div
        className="toast-title"
        initial={{ opacity: 0, scale: 1.6, x: -30 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 22, delay: 0.06 }}
      >
        {title}
      </motion.div>
      {detail ? (
        <motion.div
          className="toast-detail"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
        >
          {detail}
        </motion.div>
      ) : null}
    </motion.div>
  )
}

function TimingGrade() {
  const timing = useGame((s) => s.timing)
  return (
    <div className="grade-anchor">
      <AnimatePresence>
        {timing ? (
          <motion.div
            key={timing.id}
            className={`grade grade-${timing.grade}`}
            initial={{ opacity: 0, y: 14, scale: 0.7 }}
            animate={{ opacity: [0, 1, 1, 0], y: [14, 0, -6, -18], scale: [0.7, 1.12, 1, 1] }}
            transition={{ duration: 0.95, times: [0, 0.15, 0.7, 1] }}
          >
            {GRADE_LABEL[timing.grade]}
          </motion.div>
        ) : null}
      </AnimatePresence>
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
        // Only touch the DOM when something changed: writes every frame force style work.
        const stageAttr = stage ?? 'off'
        if (meter.current.dataset.stage !== stageAttr) meter.current.dataset.stage = stageAttr
        const left = `${Math.round((m ?? 0) * 1000) / 10}%`
        if (fill.current.style.left !== left) fill.current.style.left = left
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
        if (call.current.dataset.state !== state) call.current.dataset.state = state
      }
      const kmh = Math.round(hudLive.lastShotKmh)
      if (speed.current && kmh !== lastKmh) {
        speed.current.textContent = kmh ? String(kmh) : '–'
        lastKmh = kmh
      }
      const w = hudLive.wind
      if (windArrow.current && windText.current) {
        // The camera looks down -z, so screen-up is -z and screen-right is +x.
        const rot = `rotate(${Math.atan2(w.x, -w.z).toFixed(2)}rad)`
        if (windArrow.current.style.transform !== rot) windArrow.current.style.transform = rot
        const wt = `${Math.round(Math.hypot(w.x, w.z) * 3.6)} km/h`
        if (windText.current.textContent !== wt) windText.current.textContent = wt
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
            <Key k="left" />
            <Key k="right" /> step
          </span>
          <span className="step toss">hold a shot key to toss</span>
          <span className="step hit">release in the zone · ←/→ angles it</span>
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
            <Key k="W" /> flat
          </span>
          <span>
            <Key k="E" /> slice
          </span>
          <span>
            <Key k="Q" /> kick
          </span>
          <span>
            <Key k="R" /> safe
          </span>
        </div>
      </div>
      <div className="telemetry">
        <div className="tele-row" aria-label="Wind">
          <Wind weight="bold" className="tele-icon" />
          <span className="tele-text">
            <small>Wind</small>
            <span ref={windText}>0 km/h</span>
          </span>
          <span className="wind-arrow" ref={windArrow}>
            ↑
          </span>
        </div>
        <div className="tele-row" aria-label="Last shot speed">
          <Gauge weight="bold" className="tele-icon" />
          <span className="tele-text">
            <small>Last shot</small>
            <span>
              <b ref={speed}>–</b> km/h
            </span>
          </span>
        </div>
      </div>
    </>
  )
}

function Controls() {
  return (
    <div className="controls" aria-label="Controls">
      <span>
        <ArrowKeys /> move / aim
      </span>
      <span>
        <Key k="Q" /> topspin
      </span>
      <span>
        <Key k="W" /> flat
      </span>
      <span>
        <Key k="E" /> slice
      </span>
      <span>
        <Key k="R" /> lob
      </span>
      <span>
        <Key k="Esc" /> pause
      </span>
    </div>
  )
}

function Rally() {
  const rally = useGame((s) => s.stats.rally)
  return (
    <AnimatePresence>
      {rally > 2 ? (
        <motion.div
          className={`rally ${rally >= 10 ? 'hot' : ''}`}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
        >
          {rally >= 10 ? <Fire weight="fill" /> : null}
          Rally <Rolling value={rally} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export function Hud() {
  const muted = useGame((s) => s.muted)
  const toggleMute = useGame((s) => s.toggleMute)
  const pause = useGame((s) => s.pause)
  return (
    <div className="hud">
      <Scoreboard />
      <div className="hud-right">
        <button className="round" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} title="Sound">
          {muted ? <SpeakerSlash weight="bold" /> : <SpeakerHigh weight="bold" />}
        </button>
        <button className="round" onClick={pause} aria-label="Pause" title="Pause (Esc)">
          <Pause weight="fill" />
        </button>
      </div>
      <Toast />
      <TimingGrade />
      <LiveReadouts />
      <Rally />
      <Controls />
    </div>
  )
}
