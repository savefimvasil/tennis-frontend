import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowsClockwise,
  CellSignalFull,
  CellSignalLow,
  CellSignalMedium,
  GameController,
  Globe,
  Gauge,
  House,
  GraduationCap,
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
import { leaveRoom, refreshLobby, useNet } from '../net/net'
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

const FPS_OPTIONS: Option<'60' | '30'>[] = [
  { id: '60', label: '60 fps', note: 'Smoothest' },
  { id: '30', label: '30 fps', note: 'Quiet fans, battery' },
]

const QUALITIES: Option<'high' | 'medium' | 'low'>[] = [
  { id: 'high', label: 'High', note: 'AO, bloom, sharper shadows' },
  { id: 'medium', label: 'Medium', note: 'AO, lighter effects' },
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
    fps,
    pace,
    surface,
    skin,
    setDifficulty,
    setFormat,
    setQuality,
    setFps,
    setPace,
    setSurface,
    setSkin,
    start,
  } = useGame()
  const [help, setHelp] = useState(false)
  const startPractice = useGame((s) => s.startPractice)
  // New players get the practice button highlighted until they have tried it once.
  const firstVisit = useMemo(() => {
    try {
      return !localStorage.getItem('tennis.practiced')
    } catch {
      return false
    }
  }, [])
  return (
    <motion.div className="overlay menu" {...overlayMotion}>
      <motion.div className="menu-grid" {...stagger}>
        <div className="menu-col hero">
          <motion.div className="eyebrow" {...staggerItem}>
            <TennisBall weight="fill" /> Vesper Bay Tennis Club · Late session
          </motion.div>
          <motion.h1 className="logo" {...staggerItem}>
            Maybe<span>Tennis?</span>
          </motion.h1>
          <motion.p className="lede" {...staggerItem}>
            Time your swing, find the lines, beat the CPU or a friend.
          </motion.p>
          <motion.fieldset className="choice" {...staggerItem}>
            <legend>
              <User weight="bold" />
              Your player
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
          <motion.div className="modes" {...staggerItem}>
            <CpuCard onPlay={start} />
            <OnlineCard />
          </motion.div>
          <motion.div className="menu-secondary" {...staggerItem}>
            <button className="ghost" onClick={() => setHelp(true)}>
              <Keyboard weight="bold" /> Controls
            </button>
            <button
              className={`ghost${firstVisit ? ' attention' : ''}`}
              onClick={() => {
                initAudio()
                flushInput()
                startPractice()
              }}
            >
              <GraduationCap weight="bold" /> Practice
            </button>
            <SoundToggle />
          </motion.div>
        </div>
        <motion.div className="menu-col settings" {...staggerItem}>
          <motion.div className="settings-inner" {...stagger}>
            <div className="settings-head">
              <h3>
                <Trophy weight="bold" /> Match settings
              </h3>
              <span className="note">Also used for online games you create</span>
            </div>
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
            <div className="settings-rule" />
            <Choice
              name="Graphics"
              icon={<Monitor weight="bold" />}
              options={QUALITIES}
              value={quality}
              onChange={setQuality}
            />
            <Choice
              name="Frame rate"
              icon={<Monitor weight="bold" />}
              options={FPS_OPTIONS}
              value={fps}
              onChange={setFps}
            />
          </motion.div>
        </motion.div>
      </motion.div>
      <AnimatePresence>{help ? <ControlsSheet onClose={() => setHelp(false)} /> : null}</AnimatePresence>
    </motion.div>
  )
}

const label = <T extends string>(options: Option<T>[], id: T) => options.find((o) => o.id === id)?.label ?? id

/** Single player against the CPU, with the chosen settings as its subtitle. */
function CpuCard({ onPlay }: { onPlay: () => void }) {
  const { difficulty, surface, format } = useGame()
  return (
    <motion.button
      className="mode cpu"
      autoFocus
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => {
        initAudio()
        flushInput()
        onPlay()
      }}
    >
      <span className="mode-icon">
        <Robot weight="fill" />
      </span>
      <span className="mode-text">
        <span className="mode-title">Play vs CPU</span>
        <span className="mode-sub">
          {label(DIFFICULTIES, difficulty)} · {label(SURFACE_OPTIONS, surface)} · {label(FORMATS, format)}
        </span>
      </span>
      <Key k="Enter" />
    </motion.button>
  )
}

/**
 * Online play, as prominent as the CPU match. Shown only while a multiplayer server answers:
 * the public build also runs with no server, and then plays offline only.
 */
function OnlineCard() {
  const status = useNet((s) => s.status)
  const lobby = useNet((s) => s.lobby)
  const openOnline = useGame((s) => s.openOnline)
  useEffect(() => {
    if (status !== 'up') return
    refreshLobby()
    const t = setInterval(refreshLobby, 15_000)
    return () => clearInterval(t)
  }, [status])
  const others = lobby ? Math.max(0, lobby.online - 1) : 0
  const sub =
    lobby && lobby.open > 0
      ? `${lobby.open} open ${lobby.open === 1 ? 'game' : 'games'} waiting`
      : others > 0
        ? `${others} ${others === 1 ? 'player' : 'players'} online now`
        : 'Quick match or invite a friend'
  return (
    <AnimatePresence>
      {status === 'up' ? (
        <motion.button
          className="mode online"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            initAudio()
            openOnline()
          }}
        >
          <span className="mode-icon">
            <Globe weight="fill" />
          </span>
          <span className="mode-text">
            <span className="mode-title">Play online</span>
            <span className="mode-sub">
              <i className="live-dot" /> {sub}
            </span>
          </span>
        </motion.button>
      ) : null}
    </AnimatePresence>
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
          <dd>Lob, over a player at the net</dd>
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
          <dd>Lob, over a player at the net</dd>
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
  const { resume, quit, mode } = useGame()
  const online = mode === 'online'
  return (
    <motion.div className="overlay dim" {...overlayMotion}>
      <motion.div className="card pause" {...stagger}>
        <motion.div className="eyebrow" {...staggerItem}>
          <TennisBall weight="fill" /> Match paused
        </motion.div>
        <motion.h2 {...staggerItem}>{online ? 'Menu' : 'Paused'}</motion.h2>
        {online ? (
          <motion.p className="note" {...staggerItem}>
            The online match keeps running while this menu is open.
          </motion.p>
        ) : null}
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
            <button
              className="ghost"
              onClick={() => {
                if (online) void leaveRoom()
                quit()
              }}
            >
              <House weight="bold" /> {online ? 'Leave (forfeit)' : 'Quit to menu'}
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
  const { match, stats, start, quit, mode, openOnline } = useGame()
  const online = mode === 'online'
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
            label={online ? 'Play online again' : 'Rematch'}
            onPlay={() => {
              flushInput()
              if (online) openOnline()
              else start()
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
