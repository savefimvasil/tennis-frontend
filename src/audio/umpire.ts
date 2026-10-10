import { useEffect } from 'react'
import { useGame } from '../game/store'
import { scoreCall } from '../game/scoring'

// The chair umpire and line judges, voiced by the browser's speech synthesis (no sample files):
// "Out!" / "Fault" / "Let" as the ball lands, then the score, "Deuce", "Advantage", "Game".
// Silent when the game is muted or the browser has no voices.

let voice: SpeechSynthesisVoice | null = null

function pickVoice() {
  const voices = window.speechSynthesis?.getVoices() ?? []
  voice =
    voices.find((v) => v.lang === 'en-GB' && /male|daniel|george|arthur/i.test(v.name)) ??
    voices.find((v) => v.lang === 'en-GB') ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null
}

function say(text: string, opts: { rate?: number; pitch?: number; delay?: number } = {}) {
  const synth = window.speechSynthesis
  if (!synth || !text || useGame.getState().muted) return
  window.setTimeout(() => {
    if (useGame.getState().muted) return
    const u = new SpeechSynthesisUtterance(text)
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? 'en-GB'
    u.rate = opts.rate ?? 1.02
    u.pitch = opts.pitch ?? 0.9
    u.volume = 0.9
    synth.speak(u)
  }, opts.delay ?? 0)
}

/** Line calls the judges shout (the toast titles the director raises). */
const LINE_CALLS: Record<string, string> = {
  Out: 'Out!',
  Fault: 'Fault!',
  'Double fault': 'Fault!',
  Let: 'Let.',
  Net: 'Net.',
}

/** Mount once: listens to point results and score changes and calls them out. */
export function useUmpire() {
  useEffect(() => {
    if (!window.speechSynthesis) return
    pickVoice()
    window.speechSynthesis.onvoiceschanged = pickVoice
    let lastToast = 0
    let calledLine = false
    const unsub = useGame.subscribe((s, prev) => {
      if (s.toast && s.toast.id !== lastToast) {
        lastToast = s.toast.id
        const line = LINE_CALLS[s.toast.title]
        calledLine = !!line
        if (line) say(line, { rate: 1.1, pitch: 1.05 })
      }
      if (s.screen !== 'playing' || s.match === prev.match) return
      const m = s.match
      const p = prev.match
      const delay = calledLine ? 900 : 350
      calledLine = false
      if (m.winner !== null) return say('Game, set and match.', { delay })
      const games = (x: typeof m) => x.games[0] + x.games[1]
      const sets = (x: typeof m) => x.sets.length
      if (sets(m) > sets(p)) return say('Game and set.', { delay })
      if (games(m) !== games(p) || (m.points[0] + m.points[1] === 0 && p.points[0] + p.points[1] > 0))
        return say('Game.', { delay })
      say(scoreCall(m).replace('-', ' ').replace(/\b0\b/g, 'love'), { delay })
    })
    return () => {
      unsub()
      window.speechSynthesis.cancel()
    }
  }, [])
}
