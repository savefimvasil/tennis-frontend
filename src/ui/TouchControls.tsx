import { useEffect, useRef, useState } from 'react'
import { virtualInput } from '../input/input'
import type { ShotType } from '../game/tuning'

// On-screen controls for phones and tablets: a floating stick on the left half of the screen
// (it appears where the thumb lands) and the four shot buttons on the right. Shown only on
// touch screens; they feed the same input state as the keyboard and gamepad.

/** `serve`: what the button does on a serve, shown under the label. */
const SHOTS: { shot: ShotType; label: string; serve: string }[] = [
  { shot: 'lob', label: 'Lob', serve: 'safe' },
  { shot: 'slice', label: 'Slice', serve: 'slice' },
  { shot: 'flat', label: 'Flat', serve: 'flat' },
  { shot: 'topspin', label: 'Topspin', serve: 'kick' },
]

const RADIUS = 56

export function useTouchDevice() {
  const [touch, setTouch] = useState(() => matchMedia('(pointer: coarse)').matches)
  useEffect(() => {
    const m = matchMedia('(pointer: coarse)')
    const on = () => setTouch(m.matches)
    m.addEventListener('change', on)
    document.documentElement.classList.toggle('touch', touch)
    return () => m.removeEventListener('change', on)
  }, [touch])
  return touch
}

function Stick() {
  const zone = useRef<HTMLDivElement>(null!)
  const [base, setBase] = useState<{ x: number; y: number } | null>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const pointer = useRef<number | null>(null)

  const move = (e: React.PointerEvent, b: { x: number; y: number }) => {
    let dx = e.clientX - b.x
    let dy = e.clientY - b.y
    const d = Math.hypot(dx, dy)
    if (d > RADIUS) {
      dx *= RADIUS / d
      dy *= RADIUS / d
    }
    setKnob({ x: dx, y: dy })
    // Screen up is toward the net (+moveY).
    virtualInput.move.x = dx / RADIUS
    virtualInput.move.y = -dy / RADIUS
  }
  const end = () => {
    pointer.current = null
    setBase(null)
    setKnob({ x: 0, y: 0 })
    virtualInput.move.x = 0
    virtualInput.move.y = 0
  }
  useEffect(() => end, [])

  return (
    <div
      ref={zone}
      className="touch-stick-zone"
      onPointerDown={(e) => {
        if (pointer.current !== null) return
        pointer.current = e.pointerId
        zone.current.setPointerCapture(e.pointerId)
        const b = { x: e.clientX, y: e.clientY }
        setBase(b)
        move(e, b)
      }}
      onPointerMove={(e) => e.pointerId === pointer.current && base && move(e, base)}
      onPointerUp={(e) => e.pointerId === pointer.current && end()}
      onPointerCancel={(e) => e.pointerId === pointer.current && end()}
    >
      {base ? (
        <div className="touch-stick" style={{ left: base.x - RADIUS, top: base.y - RADIUS }}>
          <div className="touch-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
      ) : (
        <div className="touch-stick-hint">Drag to move · aim</div>
      )}
    </div>
  )
}

function ShotButton({ shot, label, serve }: { shot: ShotType; label: string; serve: string }) {
  const [down, setDown] = useState(false)
  return (
    <button
      className={`touch-shot touch-${shot}${down ? ' down' : ''}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setDown(true)
        virtualInput.press(shot)
        navigator.vibrate?.(8)
      }}
      onPointerUp={() => {
        setDown(false)
        virtualInput.release(shot)
      }}
      onPointerCancel={() => {
        setDown(false)
        virtualInput.release(shot)
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
      <small>serve: {serve}</small>
    </button>
  )
}

export function TouchControls() {
  return (
    <div className="touch-controls">
      <Stick />
      <div className="touch-shots">
        {SHOTS.map((s) => (
          <ShotButton key={s.shot} {...s} />
        ))}
      </div>
    </div>
  )
}
