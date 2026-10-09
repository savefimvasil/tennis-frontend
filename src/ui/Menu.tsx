import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowsClockwise,
  CellSignalFull,
  CellSignalLow,
  CellSignalMedium,
  GameController,
  Gauge,
  House,
  Keyboard,
  Monitor,
  Play,
  Robot,
  SpeakerHigh,
  SpeakerSlash,
  TennisBall,
  Timer,
  Trophy,
  User,
  X,
} from '@phosphor-icons/react'
import { useGame } from '../game/store'
import { setsWon } from '../game/scoring'
import type { Difficulty, PaceId } from '../game/tuning'
import type { SurfaceId } from '../physics/flight'
import { SKINS } from '../scene/athlete/skins'
import type { FormatId } from '../game/scoring'
import { initAudio } from '../audio/sound'
import { flushInput } from '../input/input'
import { ArrowKeys, Key, overlayMotion, stagger, staggerItem } from './kit'

interface Option<T> {
  id: T
  label: string
  note: string
  badge?: ReactNode
}

const DIFFICULTIES: Option<Difficulty>[] = [
  { id: 'easy', label: 'Club', note: 'Slow feet, loose timing', badge: <CellSignalLow weight="fill" /> },
  { id: 'pro', label: 'Pro', note: 'Solid baseliner', badge: <CellSignalMedium weight="fill" /> },
  { id: 'ace', label: 'Champion', note: 'Fast, rarely misses', badge: <CellSignalFull weight="fill" /> },
]

const PACES: Option<PaceId>[] = [
  { id: 'club', label: 'Club', note: 'Slower, loopier rallies' },
  { id: 'tour', label: 'Tour', note: 'Pro ball speeds' },
]

const chip = (color: string) => <span className="surface-chip" style={{ background: color }} />

const SURFACE_OPTIONS: Option<SurfaceId>[] = [
  { id: 'hard', label: 'Hard', note: 'Medium pace, true bounce', badge: chip('#2b5c8e') },
  { id: 'clay', label: 'Clay', note: 'Slow, high, heavy spin', badge: chip('#c0603a') },
  { id: 'grass', label: 'Grass', note: 'Fast and low', badge: chip('#4b8638') },
]

const FORMATS: Option<FormatId>[] = [
  { id: 'quick', label: 'Quick', note: 'One set to 4 games' },
  { id: 'set', label: 'Set', note: 'One set to 6 games' },
  { id: 'match', label: 'Match', note: 'Best of 3 sets' },
]

const QUALITIES: Option<'high' | 'medium' | 'low'>[] = [
  { id: 'high', label: 'High', note: 'AO, bloom, full crowd' },
  { id: 'medium', label: 'Medium', note: 'Lighter effects' },
  { id: 'low', label: 'Low', note: 'Laptops, older GPUs' },
]

function Choice<T extends string>({
  name,
  icon,
  options,
  value,
  onChange,
}: {
  name: string
  icon: ReactNode
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <motion.fieldset className="choice" {...staggerItem}>
      <legend>
        {icon}
        {name}
      </legend>
      <div className="choice-row" style={{ '--cols': options.length } as React.CSSProperties}>
        {options.map((o) => (
          <label key={o.id} className={value === o.id ? 'on' : ''}>
            <input
              type="radio"
              id={`${name}-${o.id}`}
              name={name}
              checked={value === o.id}
              onChange={() => onChange(o.id)}
            />
            {/* The highlight slides between options instead of blinking. */}
            {value === o.id ? (
              <motion.span
                className="choice-sel"
                layoutId={`sel-${name}`}
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            ) : null}
            <span className="choice-label">
              {o.label}
              {o.badge ? <span className="choice-badge">{o.badge}</span> : null}
            </span>
            <span className="choice-note">{o.note}</span>
          </label>
        ))}
      </div>
    </motion.fieldset>
  )
}

function SoundToggle() {
  const muted = useGame((s) => s.muted)
  const toggleMute = useGame((s) => s.toggleMute)
  return (
    <button className="ghost" onClick={toggleMute}>
      {muted ? <SpeakerSlash weight="bold" /> : <SpeakerHigh weight="bold" />}
      {muted ? 'Sound off' : 'Sound on'}
    </button>
  )
}

export function MainMenu() {
  const {
    difficulty,
    format,
    quality,
    pace,
    surface,
    skin,
    setDifficulty,
    setFormat,
    setQuality,
    setPace,
    setSurface,
    setSkin,
    start,
  } = useGame()
  const [help, setHelp] = useState(false)
  return (
    <motion.div className="overlay menu" {...overlayMotion}>
      <motion.div className="menu-grid" {...stagger}>
        <div className="menu-col">
          <motion.div className="eyebrow" {...staggerItem}>
            <TennisBall weight="fill" /> Vesper Bay Tennis Club · Late session
          </motion.div>
          <motion.h1 className="logo" {...staggerItem}>
            Baseline<span>Tennis</span>
          </motion.h1>
          <motion.p className="lede" {...staggerItem}>
            Hold the baseline, time your swing, and find the lines.
          </motion.p>
          <motion.fieldset className="choice" {...staggerItem}>
            <legend>
              <User weight="bold" />
              Player
            </legend>
            <div className="swatches">
              {SKINS.map((s) => (
                <label key={s.id} className={skin === s.id ? 'on' : ''} title={s.label}>
                  <input
                    type="radio"
                    id={`skin-${s.id}`}
                    name="skin"
                    checked={skin === s.id}
                    onChange={() => setSkin(s.id)}
                  />
                  {skin === s.id ? (
                    <motion.span
                      className="choice-sel"
                      layoutId="sel-skin"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    />
                  ) : null}
                  <span className="swatch" style={{ background: s.swatch }} />
                  <span className="swatch-label">{s.id === 'female' ? 'Her' : s.label}</span>
                </label>
              ))}
            </div>
          </motion.fieldset>
          <motion.div className="menu-actions" {...staggerItem}>
            <PlayButton onPlay={start} />
            <div className="menu-secondary">
              <button className="ghost" onClick={() => setHelp(true)}>
                <Keyboard weight="bold" /> Controls
              </button>
              <SoundToggle />
            </div>
          </motion.div>
        </div>
        <motion.div className="menu-col settings" {...staggerItem}>
          <motion.div className="settings-inner" {...stagger}>
            <Choice
              name="Opponent"
              icon={<Robot weight="bold" />}
              options={DIFFICULTIES}
              value={difficulty}
              onChange={setDifficulty}
            />
            <Choice
              name="Court"
              icon={<TennisBall weight="bold" />}
              options={SURFACE_OPTIONS}
              value={surface}
              onChange={setSurface}
            />
            <Choice name="Pace" icon={<Gauge weight="bold" />} options={PACES} value={pace} onChange={setPace} />
            <Choice
              name="Format"
              icon={<Timer weight="bold" />}
              options={FORMATS}
              value={format}
              onChange={setFormat}
            />
            <Choice
              name="Graphics"
              icon={<Monitor weight="bold" />}
              options={QUALITIES}
              value={quality}
              onChange={setQuality}
            />
          </motion.div>
        </motion.div>
      </motion.div>
      <AnimatePresence>{help ? <ControlsSheet onClose={() => setHelp(false)} /> : null}</AnimatePresence>
    </motion.div>
  )
}

function PlayButton({ onPlay, label = 'Play match' }: { onPlay: () => void; label?: string }) {
  return (
    <motion.button
      className="primary"
      autoFocus
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => {
        initAudio()
        flushInput()
        onPlay()
      }}
    >
      <Play weight="fill" />
      <span>{label}</span>
      <Key k="Enter" />
    </motion.button>
  )
}

/** Key bindings as keycaps, shared by the menu sheet and the pause screen. */
export function ControlsGrid() {
  return (
    <div className="controls-grid">
      <section>
        <h3>
          <Keyboard weight="bold" /> Rally
        </h3>
        <dl>
          <dt>
            <ArrowKeys />
          </dt>
          <dd>Move · hold to aim, ↑ deeper, ↓ shorter</dd>
          <dt>
            <Key k="Q" />
          </dt>
          <dd>Topspin</dd>
          <dt>
            <Key k="W" />
          </dt>
          <dd>Flat</dd>
          <dt>
            <Key k="E" />
          </dt>
          <dd>Slice</dd>
          <dt>
            <Key k="R" />
          </dt>
          <dd>Lob</dd>
          <dt>
            <Key k="Esc" />
          </dt>
          <dd>Pause</dd>
        </dl>
        <p>Press a shot key as the ball comes in. The earlier the press, the earlier the swing.</p>
      </section>
      <section>
        <h3>
          <TennisBall weight="bold" /> Serve
        </h3>
        <dl>
          <dt>
            <Key k="left" />
            <Key k="right" />
          </dt>
          <dd>Step along the baseline</dd>
          <dt>
            <Key k="W" />
            <Key k="E" />
            <Key k="Q" />
            <Key k="R" />
          </dt>
          <dd>Hold to toss: flat, slice, kick, safe</dd>
          <dt>release</dt>
          <dd>In the zone; hold ← or → to angle it</dd>
        </dl>
      </section>
      <section>
        <h3>
          <GameController weight="bold" /> Gamepad
        </h3>
        <dl>
          <dt>
            <Key k="L" />
          </dt>
          <dd>Move / aim</dd>
          <dt>
            <Key k="A" />
          </dt>
          <dd>Topspin</dd>
          <dt>
            <Key k="X" />
          </dt>
          <dd>Flat</dd>
          <dt>
            <Key k="B" />
          </dt>
          <dd>Slice</dd>
          <dt>
            <Key k="Y" />
          </dt>
          <dd>Lob</dd>
        </dl>
      </section>
    </div>
  )
}

function ControlsSheet({ onClose }: { onClose: () => void }) {
  return (
    <motion.div className="sheet-backdrop" {...overlayMotion} onClick={onClose}>
      <motion.div
        className="sheet"
        role="dialog"
        aria-label="Controls"
        initial={{ y: 30, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="sheet-head">
          <h2>Controls</h2>
          <button className="round" onClick={onClose} aria-label="Close" autoFocus>
            <X weight="bold" />
          </button>
        </div>
        <ControlsGrid />
      </motion.div>
    </motion.div>
  )
}

export function PauseMenu() {
  const { resume, quit } = useGame()
  return (
    <motion.div className="overlay dim" {...overlayMotion}>
      <motion.div className="card pause" {...stagger}>
        <motion.div className="eyebrow" {...staggerItem}>
          <TennisBall weight="fill" /> Match paused
        </motion.div>
        <motion.h2 {...staggerItem}>Paused</motion.h2>
        <motion.div className="card-actions" {...staggerItem}>
          <PlayButton
            label="Resume"
            onPlay={() => {
              flushInput()
              resume()
            }}
          />
          <div className="menu-secondary">
            <SoundToggle />
            <button className="ghost" onClick={quit}>
              <House weight="bold" /> Quit to menu
            </button>
          </div>
        </motion.div>
        <motion.div {...staggerItem}>
          <ControlsGrid />
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

function StatBar({ label, you, opp }: { label: string; you: number; opp: number }) {
  const total = Math.max(1, you + opp)
  return (
    <motion.div className="stat" {...staggerItem}>
      <span className="stat-you">{you}</span>
      <span className="stat-label">{label}</span>
      <span className="stat-opp">{opp}</span>
      <div className="stat-bar">
        <motion.i
          className="you"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: you / total }}
          transition={{ delay: 0.35, type: 'spring', stiffness: 120, damping: 20 }}
        />
        <motion.i
          className="opp"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: opp / total }}
          transition={{ delay: 0.35, type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
    </motion.div>
  )
}

export function GameOver() {
  const { match, stats, start, quit } = useGame()
  const won = match.winner === 0
  return (
    <motion.div className="overlay dim" {...overlayMotion}>
      <motion.div className={`card over ${won ? 'won' : 'lost'}`} {...stagger}>
        <motion.div
          className="over-icon"
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
        >
          {won ? <Trophy weight="fill" /> : <TennisBall weight="fill" />}
        </motion.div>
        <motion.div className="eyebrow" {...staggerItem}>
          {won ? 'Match won' : 'Match lost'}
        </motion.div>
        <motion.h2 {...staggerItem}>{won ? 'Game, set and match' : 'Better luck next time'}</motion.h2>
        <motion.div className="final" {...staggerItem}>
          {match.sets.map((s, i) => (
            <span key={i} className={s[0] > s[1] ? 'won' : 'lost'}>
              <b>{s[0]}</b>
              <b>{s[1]}</b>
            </span>
          ))}
        </motion.div>
        <div className="stat-head">
          <span>You</span>
          <span>Opponent</span>
        </div>
        <StatBar label="Sets" you={setsWon(match, 0)} opp={setsWon(match, 1)} />
        <StatBar label="Aces" you={stats.aces[0]} opp={stats.aces[1]} />
        <StatBar label="Winners" you={stats.winners[0]} opp={stats.winners[1]} />
        <StatBar label="Errors" you={stats.errors[0]} opp={stats.errors[1]} />
        <motion.div className="note" {...staggerItem}>
          Longest rally: <b>{stats.longest}</b> shots
        </motion.div>
        <motion.div className="card-actions" {...staggerItem}>
          <PlayButton
            label="Rematch"
            onPlay={() => {
              flushInput()
              start()
            }}
          />
          <button className="ghost" onClick={quit}>
            <ArrowsClockwise weight="bold" /> Main menu
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
