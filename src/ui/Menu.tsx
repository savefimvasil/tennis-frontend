import { useGame } from '../game/store'
import { setsWon } from '../game/scoring'
import type { Difficulty, PaceId } from '../game/tuning'
import type { SurfaceId } from '../physics/flight'
import { SKINS } from '../scene/athlete/skins'
import type { FormatId } from '../game/scoring'
import { initAudio } from '../audio/sound'
import { flushInput } from '../input/input'

const DIFFICULTIES: { id: Difficulty; label: string; note: string }[] = [
  { id: 'easy', label: 'Club', note: 'Slow feet, loose timing' },
  { id: 'pro', label: 'Pro', note: 'Solid baseliner' },
  { id: 'ace', label: 'Champion', note: 'Fast, rarely misses' },
]

const PACES: { id: PaceId; label: string; note: string }[] = [
  { id: 'club', label: 'Club', note: 'Slower, loopier rallies' },
  { id: 'tour', label: 'Tour', note: 'Pro ball speeds' },
]

const SURFACE_OPTIONS: { id: SurfaceId; label: string; note: string }[] = [
  { id: 'hard', label: 'Hard', note: 'Medium pace, true bounce' },
  { id: 'clay', label: 'Clay', note: 'Slow, high, heavy spin' },
  { id: 'grass', label: 'Grass', note: 'Fast and low' },
]

const FORMATS: { id: FormatId; label: string; note: string }[] = [
  { id: 'quick', label: 'Quick', note: 'One set to 4 games' },
  { id: 'set', label: 'Set', note: 'One set to 6 games' },
  { id: 'match', label: 'Match', note: 'Best of 3 sets' },
]

function Choice<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string
  options: { id: T; label: string; note: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <fieldset className="choice">
      <legend>{name}</legend>
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
            <span className="choice-label">{o.label}</span>
            <span className="choice-note">{o.note}</span>
          </label>
        ))}
      </div>
    </fieldset>
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
  return (
    <div className="overlay menu">
      <div className="panel menu-grid">
        <div className="menu-col">
          <div className="eyebrow">Vesper Bay Tennis Club · Late session</div>
          <h1 className="logo">
            Baseline<span>Tennis</span>
          </h1>
          <p className="lede">Hold the baseline, time your swing, and find the lines.</p>
          <fieldset className="choice">
            <legend>Player</legend>
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
                  <span className="swatch" style={{ background: s.swatch }} />
                  <span className="swatch-label">{s.id === 'female' ? 'Her' : s.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <PlayButton onPlay={start} />
          <HowTo />
        </div>
        <div className="menu-col">
          <Choice name="Opponent" options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} />
          <Choice name="Court" options={SURFACE_OPTIONS} value={surface} onChange={setSurface} />
          <Choice name="Pace" options={PACES} value={pace} onChange={setPace} />
          <Choice name="Format" options={FORMATS} value={format} onChange={setFormat} />
          <Choice
            name="Graphics"
            options={[
              { id: 'high', label: 'High', note: 'AO, bloom, full crowd' },
              { id: 'medium', label: 'Medium', note: 'Lighter effects' },
              { id: 'low', label: 'Low', note: 'Laptops and older GPUs' },
            ]}
            value={quality}
            onChange={setQuality}
          />
        </div>
      </div>
    </div>
  )
}

function PlayButton({ onPlay }: { onPlay: () => void }) {
  return (
    <button
      className="primary"
      autoFocus
      onClick={() => {
        initAudio()
        flushInput()
        onPlay()
      }}
    >
      Play match
    </button>
  )
}

function HowTo() {
  return (
    <div className="howto">
      <div>
        <b>Shots</b> <kbd>Q</kbd> topspin, <kbd>W</kbd> flat, <kbd>E</kbd> slice, <kbd>R</kbd> lob. Arrow keys move and
        aim.
      </div>
      <div>
        <b>Serve</b> <kbd>←</kbd>/<kbd>→</kbd> moves the target, hold a shot key to toss, release in the zone.
      </div>
      <div>
        <b>Rally</b> Press a shot key as the ball comes in. Hold an arrow to aim; <kbd>↑</kbd> hits deeper, <kbd>↓</kbd>{' '}
        shorter.
      </div>
      <div>
        <b>Gamepad</b> Left stick moves, A topspin, B slice, Y lob, X flat.
      </div>
    </div>
  )
}

export function PauseMenu() {
  const { resume, quit } = useGame()
  return (
    <div className="overlay">
      <div className="panel small">
        <h2>Paused</h2>
        <button
          className="primary"
          autoFocus
          onClick={() => {
            flushInput()
            resume()
          }}
        >
          Resume
        </button>
        <button className="ghost" onClick={quit}>
          Quit to menu
        </button>
      </div>
    </div>
  )
}

export function GameOver() {
  const { match, stats, start, quit } = useGame()
  const won = match.winner === 0
  return (
    <div className="overlay">
      <div className="panel small">
        <div className="eyebrow">{won ? 'Match won' : 'Match lost'}</div>
        <h2>{won ? 'Game, set and match' : 'Better luck next time'}</h2>
        <div className="final">
          {match.sets.map((s, i) => (
            <span key={i}>
              {s[0]}–{s[1]}
            </span>
          ))}
        </div>
        <table className="stats">
          <thead>
            <tr>
              <th />
              <th>You</th>
              <th>Opp.</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Sets</td>
              <td>{setsWon(match, 0)}</td>
              <td>{setsWon(match, 1)}</td>
            </tr>
            <tr>
              <td>Aces</td>
              <td>{stats.aces[0]}</td>
              <td>{stats.aces[1]}</td>
            </tr>
            <tr>
              <td>Winners</td>
              <td>{stats.winners[0]}</td>
              <td>{stats.winners[1]}</td>
            </tr>
            <tr>
              <td>Errors</td>
              <td>{stats.errors[0]}</td>
              <td>{stats.errors[1]}</td>
            </tr>
          </tbody>
        </table>
        <div className="note">Longest rally: {stats.longest} shots</div>
        <button
          className="primary"
          autoFocus
          onClick={() => {
            flushInput()
            start()
          }}
        >
          Rematch
        </button>
        <button className="ghost" onClick={quit}>
          Main menu
        </button>
      </div>
    </div>
  )
}
