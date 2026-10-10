import { AnimatePresence, motion } from 'motion/react'
import { useGame } from '../game/store'

// Behind the menus: a still of each venue (public/menu/*.jpg, shot by tools/menu/shoot.mjs)
// instead of the live 3D scene. Switching the court in the menu is then just a cross-fade; the
// venue is built in 3D once, when a match starts.

const BASE = `${import.meta.env.BASE_URL}menu/`

export function MenuBackdrop() {
  const surface = useGame((s) => s.surface)
  return (
    <div className="menu-backdrop" aria-hidden>
      <AnimatePresence initial={false}>
        <motion.img
          key={surface}
          src={`${BASE}${surface}.jpg`}
          alt=""
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
        />
      </AnimatePresence>
    </div>
  )
}
