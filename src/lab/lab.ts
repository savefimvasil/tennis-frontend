import { create } from 'zustand'

/** The Physics Lab is opened with ?lab in the URL. It is code-split out of the normal game. */
export const LAB_ENABLED = typeof location !== 'undefined' && new URLSearchParams(location.search).has('lab')

export interface LabView {
  /** Predicted flight of the ball (the same model the AI and the shot solver use). */
  trajectory: boolean
  /** Velocity, spin axis, drag and Magnus force on the ball. */
  forces: boolean
  /** r3f-perf panel: fps, GPU/CPU time, draw calls. */
  perf: boolean
  /** Time scale of the simulation, for watching spin and bounces. */
  timeScale: number
}

export const useLab = create<LabView>(() => ({
  trajectory: true,
  forces: true,
  perf: false,
  timeScale: 1,
}))
