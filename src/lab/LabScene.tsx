import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { Perf } from 'r3f-perf'
import type { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import * as THREE from 'three'
import { sim } from '../game/sim'
import { aeroForce, type V3 } from '../physics/flight'
import { useLab } from './lab'

/** Force arrows: metres of arrow per newton (gravity on the ball, 0.56 N, is ~0.5 m). */
const N_SCALE = 0.9

const BEFORE = new THREE.Color('#ffe14d')
const AFTER = new THREE.Color('#ff7a2e')

/**
 * Predicted flight (the same model the AI and the shot solver use) as a thick line
 * that turns from yellow to orange after the bounce. Rebuilt only when a new prediction starts.
 */
function Trajectory() {
  const ref = useRef<Line2>(null!)
  const shown = useRef<unknown>(null)
  useFrame(() => {
    const f = sim.prediction
    const line = ref.current
    if (!line) return
    line.visible = !!f && f.samples.length > 1
    if (!f || f === shown.current || f.samples.length < 2) return
    shown.current = f
    const bounceT = f.bounces[0]?.t ?? Infinity
    const pos: number[] = []
    const col: number[] = []
    for (const p of f.samples) {
      pos.push(p.x, p.y, p.z)
      const c = p.t > bounceT ? AFTER : BEFORE
      col.push(c.r, c.g, c.b)
    }
    // A fresh geometry per prediction: LineGeometry can't shrink its instance count in place.
    const g = new LineGeometry()
    g.setPositions(pos)
    g.setColors(col)
    line.geometry.dispose()
    line.geometry = g
    line.computeLineDistances()
  })
  return (
    <Line
      ref={ref}
      points={[
        [0, 0, 0],
        [0, 0, 0],
      ]}
      vertexColors={[
        [1, 1, 1],
        [1, 1, 1],
      ]}
      lineWidth={3}
      depthTest={false}
      renderOrder={10}
      frustumCulled={false}
    />
  )
}

/** Arrows on the ball: velocity (white), spin axis (magenta), drag (red), Magnus (cyan). */
function Forces() {
  const arrows = useMemo(() => {
    const make = (c: string) => {
      const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, c, 0.08, 0.05)
      a.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined
        if (m) m.depthTest = false
        o.renderOrder = 11
      })
      return a
    }
    return { vel: make('#ffffff'), spin: make('#ff4fd8'), drag: make('#ff4040'), magnus: make('#38e8ff') }
  }, [])
  const tmp = useMemo(
    () => ({
      dir: new THREE.Vector3(),
      o: new THREE.Vector3(),
      f: { x: 0, y: 0, z: 0 } as V3,
      d: { x: 0, y: 0, z: 0 } as V3,
    }),
    [],
  )
  useFrame(() => {
    const b = sim.ball
    const group = [arrows.vel, arrows.spin, arrows.drag, arrows.magnus]
    if (!b) {
      for (const a of group) a.visible = false
      return
    }
    const p = b.translation()
    const v = b.linvel()
    const w = b.angvel()
    tmp.o.set(p.x, p.y, p.z)
    const set = (a: THREE.ArrowHelper, x: number, y: number, z: number, len: number) => {
      a.visible = len > 0.02
      if (!a.visible) return
      a.position.copy(tmp.o)
      a.setDirection(tmp.dir.set(x, y, z).normalize())
      a.setLength(len, Math.min(0.12, len * 0.3), Math.min(0.07, len * 0.2))
    }
    const speed = Math.hypot(v.x, v.y, v.z)
    set(arrows.vel, v.x, v.y, v.z, speed * 0.05)
    const spin = Math.hypot(w.x, w.y, w.z)
    set(arrows.spin, w.x, w.y, w.z, spin * 0.0025)
    // Total aero force, then split off drag (along -v) to show Magnus on its own.
    aeroForce(v, w, tmp.f)
    const along = speed > 1e-3 ? (tmp.f.x * v.x + tmp.f.y * v.y + tmp.f.z * v.z) / speed : 0
    tmp.d.x = speed > 1e-3 ? (along * v.x) / speed : 0
    tmp.d.y = speed > 1e-3 ? (along * v.y) / speed : 0
    tmp.d.z = speed > 1e-3 ? (along * v.z) / speed : 0
    set(arrows.drag, tmp.d.x, tmp.d.y, tmp.d.z, Math.abs(along) * N_SCALE)
    const mx = tmp.f.x - tmp.d.x
    const my = tmp.f.y - tmp.d.y
    const mz = tmp.f.z - tmp.d.z
    set(arrows.magnus, mx, my, mz, Math.hypot(mx, my, mz) * N_SCALE)
  })
  return (
    <group>
      <primitive object={arrows.vel} />
      <primitive object={arrows.spin} />
      <primitive object={arrows.drag} />
      <primitive object={arrows.magnus} />
    </group>
  )
}

export default function LabScene() {
  const view = useLab()
  return (
    <>
      {view.trajectory ? <Trajectory /> : null}
      {view.forces ? <Forces /> : null}
      {view.perf ? <Perf position="bottom-left" /> : null}
    </>
  )
}
