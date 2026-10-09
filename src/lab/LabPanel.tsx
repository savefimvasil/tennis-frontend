import { Leva, folder, useControls } from 'leva'
import { AI_LEVELS, PACE, PLAYER_HELP, SHOTS, type Difficulty, type ShotType } from '../game/tuning'
import { AERO, setWind, tuneSurface, wind, type SurfaceId } from '../physics/flight'
import { useLab } from './lab'

// Live tuning panel (leva). Every control writes straight into the tuning tables the game
// reads each step, so changes apply to the next shot without a reload.

const SURFACE_BASE: Record<SurfaceId, { mu: number; e: number }> = {
  hard: { mu: 0.6, e: 0.8 },
  clay: { mu: 0.75, e: 0.84 },
  grass: { mu: 0.55, e: 0.78 },
}

function shotFolder(shot: ShotType) {
  const s = SHOTS[shot]
  return folder(
    {
      [`${shot} speed`]: { value: s.speed, min: 0, max: 50, step: 0.5, onChange: (v: number) => (s.speed = v) },
      [`${shot} spin`]: { value: s.spin, min: -400, max: 400, step: 5, onChange: (v: number) => (s.spin = v) },
      [`${shot} net clearance`]: {
        value: s.netClearance,
        min: -0.2,
        max: 3,
        step: 0.05,
        onChange: (v: number) => (s.netClearance = v),
      },
      [`${shot} depth`]: { value: s.depth, min: 4, max: 11.5, step: 0.1, onChange: (v: number) => (s.depth = v) },
    },
    { collapsed: shot !== 'topspin' },
  )
}

function levelFolder(d: Difficulty) {
  const a = AI_LEVELS[d]
  const h = PLAYER_HELP[d]
  return folder(
    {
      [`${d} AI speed`]: { value: a.speed, min: 2, max: 8, step: 0.1, onChange: (v: number) => (a.speed = v) },
      [`${d} AI reaction`]: {
        value: a.reaction,
        min: 0,
        max: 1,
        step: 0.01,
        onChange: (v: number) => (a.reaction = v),
      },
      [`${d} AI pace`]: { value: a.pace, min: 0.5, max: 1.3, step: 0.01, onChange: (v: number) => (a.pace = v) },
      [`${d} AI unforced`]: {
        value: a.unforced,
        min: 0,
        max: 0.4,
        step: 0.005,
        onChange: (v: number) => (a.unforced = v),
      },
      [`${d} AI margin`]: {
        value: a.aimMargin,
        min: 0.4,
        max: 3.5,
        step: 0.05,
        onChange: (v: number) => (a.aimMargin = v),
      },
      [`${d} AI centre`]: { value: a.centre, min: 0, max: 1, step: 0.01, onChange: (v: number) => (a.centre = v) },
      [`${d} help track`]: { value: h.track, min: 0, max: 1, step: 0.05, onChange: (v: number) => (h.track = v) },
      [`${d} help assist`]: { value: h.assist, min: 0, max: 1.5, step: 0.05, onChange: (v: number) => (h.assist = v) },
      [`${d} help timing`]: { value: h.timing, min: 1, max: 2.5, step: 0.05, onChange: (v: number) => (h.timing = v) },
      [`${d} help reach`]: { value: h.reach, min: 1.2, max: 2.4, step: 0.05, onChange: (v: number) => (h.reach = v) },
    },
    { collapsed: d !== 'easy' },
  )
}

function surfaceFolder(id: SurfaceId) {
  const b = SURFACE_BASE[id]
  const set = (k: 'mu' | 'e') => (v: number) => {
    b[k] = v
    tuneSurface(id, b.mu, b.e)
  }
  return folder(
    {
      [`${id} friction μ`]: { value: b.mu, min: 0.3, max: 0.95, step: 0.01, onChange: set('mu') },
      [`${id} restitution e`]: { value: b.e, min: 0.6, max: 0.95, step: 0.005, onChange: set('e') },
    },
    { collapsed: id !== 'hard' },
  )
}

export default function LabPanel() {
  useControls('View', {
    trajectory: { value: useLab.getState().trajectory, onChange: (v: boolean) => useLab.setState({ trajectory: v }) },
    forces: { value: useLab.getState().forces, onChange: (v: boolean) => useLab.setState({ forces: v }) },
    colliders: { value: useLab.getState().colliders, onChange: (v: boolean) => useLab.setState({ colliders: v }) },
    perf: { value: useLab.getState().perf, onChange: (v: boolean) => useLab.setState({ perf: v }) },
    'time scale': {
      value: 1,
      min: 0.1,
      max: 1,
      step: 0.05,
      onChange: (v: number) => useLab.setState({ timeScale: v }),
    },
  })
  useControls('Air', {
    'drag Cd': { value: AERO.cd, min: 0, max: 1, step: 0.01, onChange: (v: number) => (AERO.cd = v) },
    'Magnus ×': { value: AERO.magnus, min: 0, max: 3, step: 0.05, onChange: (v: number) => (AERO.magnus = v) },
    'wind x': {
      value: 0,
      min: -8,
      max: 8,
      step: 0.1,
      onChange: (v: number) => setWind(v, wind.z),
    },
    'wind z': {
      value: 0,
      min: -8,
      max: 8,
      step: 0.1,
      onChange: (v: number) => setWind(wind.x, v),
    },
  })
  useControls(
    'Shots',
    {
      'club pace': { value: PACE.club, min: 0.5, max: 1.2, step: 0.01, onChange: (v: number) => (PACE.club = v) },
      topspin: shotFolder('topspin'),
      flat: shotFolder('flat'),
      slice: shotFolder('slice'),
      lob: shotFolder('lob'),
    },
    { collapsed: true },
  )
  useControls(
    'Surfaces',
    { hard: surfaceFolder('hard'), clay: surfaceFolder('clay'), grass: surfaceFolder('grass') },
    { collapsed: true },
  )
  useControls(
    'Difficulty',
    { easy: levelFolder('easy'), pro: levelFolder('pro'), ace: levelFolder('ace') },
    { collapsed: true },
  )
  return <Leva collapsed={false} titleBar={{ title: 'Physics Lab' }} />
}
