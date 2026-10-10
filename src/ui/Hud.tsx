import { useEffect, useRef, useState } from 'react'
import { sim } from '../game/sim'
import { AnimatePresence, motion } from 'motion/react'
import { Fire, Gauge, Pause, SpeakerHigh, SpeakerSlash, TennisBall, Wind } from '@phosphor-icons/react'
import { useGame, hudLive, PRACTICE_GOALS } from '../game/store'
import { pointLabel, pressureLabel, scoreCall, setsWon } from '../game/scoring'
import { SERVE } from '../game/tuning'
import type { Side } from '../game/constants'
import { ArrowKeys, Key, Rolling } from './kit'

/** Aim beyond which a first serve lands out (see serveTarget). */
const AIM_IN = 1.14

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

const COACH = [
  {
    title: 'Serve it in',
    text: 'Hold a shot key to toss, let go near the top of the toss. Steer left/right during the toss to aim.',
  },
  {
    title: 'Time your returns',
    text: 'Press a shot key as the ball comes to you: Perfect or Good timing, and keep it in the court.',
  },
  {
    title: 'Aim it',
    text: 'After pressing, the stick aims: hold left for one shot, right for another. Land one each way.',
  },
]

/** The practice coach: the current step, its progress, and the way out when it is done. */
function Coach() {
  const practice = useGame((s) => s.practice)
  const start = useGame((s) => s.start)
  if (!practice) return null
  const done = practice.step === 3
  const step = COACH[Math.min(practice.step, 2)]
  return (
    <motion.div className="coach" key={practice.step} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
      <small>Practice · {done ? 'done' : `step ${practice.step + 1} of 3`}</small>
      {done ? (
        <>
          <b>Ready for a match</b>
          <p>Serve, timing and aim: that is the game. The CPU levels go up from here.</p>
          <button className="coach-go" onClick={start}>
            Play a match
          </button>
        </>
      ) : (
        <>
          <b>{step.title}</b>
          <p>{step.text}</p>
          <div className="coach-dots">
            {Array.from({ length: PRACTICE_GOALS[practice.step as 0 | 1 | 2] }, (_, i) => (
              <span key={i} className={i < practice.count ? 'on' : ''} />
            ))}
          </div>
        </>
      )}
    </motion.div>
  )
}

/** Banner over a reviewed line call (the camera is down at the mark meanwhile). */
function Review() {
  const [review, setReview] = useState<{ cm: number } | null>(null)
  useEffect(() => {
    let raf = 0
    let last: unknown = null
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (sim.review !== last) {
        last = sim.review
        setReview(sim.review ? { cm: sim.review.cm } : null)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <AnimatePresence>
      {review ? (
        <motion.div
          className="review"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, delay: 0.5 }}
        >
          <small>Hawk-Eye</small>
          <b>Out</b>
          <span>{review.cm} cm</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/** The serve's speed, big and brief, the way a broadcast shows it. */
function ServeSpeed() {
  const flash = useGame((s) => s.serveFlash)
  return (
    <div className="serve-speed-anchor">
      <AnimatePresence>
        {flash ? (
          <motion.div
            key={flash.id}
            className="serve-speed"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: [0, 1, 1, 0], y: [-8, 0, 0, -4] }}
            transition={{ duration: 2.2, times: [0, 0.08, 0.8, 1] }}
          >
            <b>{flash.kmh}</b> km/h
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
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

const PANEL_GAP = 60
const PANEL_MARGIN = 16
/** Keeps clear of the scoreboard at the top left. */
const PANEL_TOP = 140

/** Puts the serve panel beside my player (right of them, or left near the screen edge). */
function placeBesidePlayer(panel: HTMLDivElement) {
  const a = hudLive.serveAnchor
  if (!a.ok || panel.dataset.stage === 'off') return
  const w = panel.offsetWidth
  const h = panel.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight
  // On touch screens the shot buttons own the bottom-right corner.
  const right = vw - PANEL_MARGIN - (document.documentElement.classList.contains('touch') ? 190 : 0)
  let x = a.x + PANEL_GAP
  if (x + w > right) x = a.x - PANEL_GAP - w
  x = Math.max(PANEL_MARGIN, Math.min(right - w, x))
  const y = Math.max(PANEL_TOP, Math.min(vh - PANEL_MARGIN - h, a.y - h / 2))
  const t = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
  if (panel.style.transform !== t) panel.style.transform = t
}

/** Toss meter and shot speed are written straight to the DOM every frame. */
function LiveReadouts() {
  const meter = useRef<HTMLDivElement>(null)
  const fill = useRef<HTMLDivElement>(null)
  const aimNeedle = useRef<HTMLDivElement>(null)
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
        if (aimNeedle.current) {
          const a = hudLive.serveAim
          const aimLeft = `${Math.round(((a + SERVE.aimMax) / (2 * SERVE.aimMax)) * 1000) / 10}%`
          if (aimNeedle.current.style.left !== aimLeft) aimNeedle.current.style.left = aimLeft
          const out = Math.abs(a) > AIM_IN ? 'out' : Math.abs(a) > 0.8 ? 'line' : 'in'
          if (aimNeedle.current.dataset.state !== out) aimNeedle.current.dataset.state = out
        }
        let text = 'Hold a shot to toss'
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
        placeBesidePlayer(meter.current)
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
  // Share of the aim meter beyond each line (where the serve lands out).
  const outPct = ((SERVE.aimMax - AIM_IN) / (2 * SERVE.aimMax)) * 100
  const lo = (SERVE.perfectY[0] - SERVE.handHeight) / span
  const hi = Math.min(1, (SERVE.perfectY[1] - SERVE.handHeight) / span)
  const goodLo = (SERVE.goodY[0] - SERVE.handHeight) / span
  return (
    <>
      {/* Floats beside my player while I serve, where the eyes already are. */}
      <div className="serve-panel" ref={meter} data-stage="off" aria-live="polite">
        <div className="serve-head">
          <div className="serve-call" ref={call}>
            Hold a shot key to toss
          </div>
          <div className="serve-hint">
            <span className="hint aim">
              <Key k="left" />
              <Key k="right" /> step along the line
            </span>
            <span className="hint toss">
              <Key k="left" />
              <Key k="right" /> sweep the aim · release in the yellow
            </span>
          </div>
        </div>
        <div className="serve-bars">
          <span className="bar-label">Toss</span>
          <div className="serve-meter" aria-hidden>
            <div className="serve-good" style={{ left: `${goodLo * 100}%`, width: `${(lo - goodLo) * 100}%` }} />
            <div className="serve-perfect" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
            <div className="serve-ball" ref={fill} />
          </div>
          <span className="bar-label">Aim</span>
          <div className="serve-aim" aria-hidden title="Aim: hold ← or → to sweep it; past the lines is out">
            <div className="aim-out left" style={{ width: `${outPct}%` }} />
            <div className="aim-out right" style={{ width: `${outPct}%` }} />
            <div className="aim-line" style={{ left: `${outPct}%` }} />
            <div className="aim-line" style={{ right: `${outPct}%` }} />
            <div className="aim-needle" ref={aimNeedle} />
          </div>
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
      <div className="dock">
        <Controls />
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
        <Key k="R" /> lob <small>(vs net)</small>
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
      <ServeSpeed />
      <Review />
      <Coach />
      <LiveReadouts />
      <Rally />
    </div>
  )
}
