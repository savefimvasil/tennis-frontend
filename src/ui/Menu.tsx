import { useGame } from '../game/store'
import { setsWon } from '../game/scoring'
import type { Difficulty } from '../game/tuning'
import type { FormatId } from '../game/scoring'
import { initAudio } from '../audio/sound'
import { flushInput } from '../input/input'

const DIFFICULTIES: { id: Difficulty; label: string; note: string }[] = [
  { id: 'easy', label: 'Club', note: 'Slow feet, loose timing' },
  { id: 'pro', label: 'Pro', note: 'Solid baseliner' },
  { id: 'ace', label: 'Champion', note: 'Fast, rarely misses' },
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
      <div className="choice-row">
        {options.map((o) => (
          <label key={o.id} className={value === o.id ? 'on' : ''}>
            <input type="radio" id={`${name}-${o.id}`} name={name} checked={value === o.id} onChange={() => onChange(o.id)} />
            <span className="choice-label">{o.label}</span>
            <span className="choice-note">{o.note}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function MainMenu() {
  const { difficulty, format, quality, setDifficulty, setFormat, setQuality, start } = useGame()
  return (
    <div className="overlay menu">
      <div className="panel">
        <div className="eyebrow">Vesper Bay Tennis Club · Late session</div>
        <h1 className="logo">
          Baseline<span>Tennis</span>
        </h1>
        <p className="lede">Hold the baseline, time your swing, and find the lines.</p>
        <Choice name="Opponent" options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} />
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
        <button
          className="primary"
          autoFocus
          onClick={() => {
            initAudio()
            flushInput()
            start()
          }}
        >
          Play match
        </button>
        <div className="howto">
          <div>
            <b>Shots</b> <kbd>Q</kbd> topspin, <kbd>W</kbd> flat, <kbd>E</kbd> slice, <kbd>R</kbd> lob. Arrow keys move and aim.
          </div>
          <div>
            <b>Serve</b> Hold a shot key to toss, release when the meter is in the zone. <kbd>←</kbd>/<kbd>→</kbd> aims.
          </div>
          <div>
            <b>Rally</b> Press a shot key as the ball comes in. Hold an arrow to aim; <kbd>↑</kbd> hits deeper, <kbd>↓</kbd> shorter.
          </div>
          <div>
            <b>Gamepad</b> Left stick moves, A topspin, B slice, Y lob, X flat.
          </div>
        </div>
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
