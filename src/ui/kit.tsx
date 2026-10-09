import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

const GLYPHS: Record<string, string> = {
  left: '←',
  right: '→',
  up: '↑',
  down: '↓',
}

/** A keyboard keycap. `k` is the label; arrow names render as arrows. */
export function Key({ k, wide }: { k: string; wide?: boolean }) {
  return <kbd className={`key${wide || k.length > 2 ? ' wide' : ''}`}>{GLYPHS[k] ?? k}</kbd>
}

/** Arrow cluster: ↑ above ← ↓ →. */
export function ArrowKeys() {
  return (
    <span className="arrow-keys" aria-label="Arrow keys">
      <Key k="up" />
      <span>
        <Key k="left" />
        <Key k="down" />
        <Key k="right" />
      </span>
    </span>
  )
}

/** A value that rolls up into place when it changes (scoreboard digits, counters). */
export function Rolling({ value, className }: { value: ReactNode; className?: string }) {
  return (
    <span className={`rolling ${className ?? ''}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(value)}
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

/** Shared enter/exit for full-screen overlays. */
export const overlayMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.25 },
}

/** Card that rises in; children can use `staggerItem`. */
export const stagger = {
  initial: 'hidden',
  animate: 'show',
  exit: 'hidden',
  variants: {
    hidden: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
    show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
  },
}

export const staggerItem = {
  variants: {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 26 } },
  },
}
