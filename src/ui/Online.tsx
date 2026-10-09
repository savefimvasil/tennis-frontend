import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  ArrowLeft,
  CheckCircle,
  Circle,
  Copy,
  Globe,
  Lightning,
  LockSimple,
  Plus,
  SignIn,
  SpinnerGap,
  Users,
  WifiHigh,
} from '@phosphor-icons/react'
import { useGame } from '../game/store'
import { cancelQuick, createRoom, joinRoom, leaveRoom, quickMatch, setReady, useNet, watchLobby } from '../net/net'
import type { RoomSettings, RoomSnapshot } from '../net/protocol'
import { overlayMotion, stagger, staggerItem } from './kit'

const SURFACE_LABEL = { hard: 'Hard', clay: 'Clay', grass: 'Grass' } as const
const FORMAT_LABEL = { quick: 'Quick (4 games)', set: 'One set', match: 'Best of 3' } as const

function settingsLine(s: RoomSettings) {
  return `${SURFACE_LABEL[s.surface]} · ${s.pace === 'club' ? 'Club' : 'Tour'} pace · ${FORMAT_LABEL[s.format]}`
}

/** Online play: quick match, create or join a game, the open-games list and the ready check. */
export function OnlineLobby() {
  const { name, setName, room, queued, error, rtt, status } = useNet()
  const quit = useGame((s) => s.quit)
  useEffect(() => {
    void watchLobby(true)
    return () => void watchLobby(false)
  }, [])

  return (
    <motion.div className="overlay menu" {...overlayMotion}>
      <motion.div className="menu-grid" {...stagger}>
        <div className="menu-col">
          <motion.div className="eyebrow" {...staggerItem}>
            <Globe weight="fill" /> Online · {status === 'up' ? `${rtt ?? '–'} ms` : 'reconnecting…'}
          </motion.div>
          <motion.h1 className="logo" {...staggerItem}>
            Play<span>Online</span>
          </motion.h1>
          <motion.p className="lede" {...staggerItem}>
            The server referees every shot: same rules, same help, for both players.
          </motion.p>
          <motion.label className="field" {...staggerItem}>
            <span>Your name</span>
            <input value={name} maxLength={20} placeholder="Player" onChange={(e) => setName(e.target.value)} />
          </motion.label>
          {room ? null : <Actions queued={queued} />}
          {error ? <div className="net-error">{error}</div> : null}
          <motion.div className="menu-secondary" {...staggerItem}>
            <button
              className="ghost"
              onClick={() => {
                if (room) void leaveRoom()
                if (queued) void cancelQuick()
                quit()
              }}
            >
              <ArrowLeft weight="bold" /> Main menu
            </button>
          </motion.div>
        </div>
        <motion.div className="menu-col settings" {...staggerItem}>
          {room ? <RoomView room={room} /> : <OpenGames />}
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

function Actions({ queued }: { queued: boolean }) {
  const [code, setCode] = useState('')
  const g = useGame()
  return (
    <motion.div className="menu-actions" {...staggerItem}>
      {queued ? (
        <button className="primary" onClick={() => void cancelQuick()}>
          <SpinnerGap weight="bold" className="spin" />
          <span>Finding a player…</span>
          <kbd className="key wide">Cancel</kbd>
        </button>
      ) : (
        <button className="primary" autoFocus onClick={() => void quickMatch()}>
          <Lightning weight="fill" />
          <span>Quick match</span>
        </button>
      )}
      <div className="menu-secondary">
        <button className="ghost" onClick={() => void createRoom(true)} disabled={queued}>
          <Plus weight="bold" /> Open game
        </button>
        <button className="ghost" onClick={() => void createRoom(false)} disabled={queued}>
          <LockSimple weight="bold" /> Private game
        </button>
      </div>
      <form
        className="join-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim()) void joinRoom(code.trim())
        }}
      >
        <input
          value={code}
          placeholder="Room code"
          maxLength={8}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          aria-label="Room code"
        />
        <button className="ghost" type="submit" disabled={!code.trim() || queued}>
          <SignIn weight="bold" /> Join
        </button>
      </form>
      <div className="note">New games use your menu settings: {settingsLine(g)}</div>
    </motion.div>
  )
}

function OpenGames() {
  const rooms = useNet((s) => s.openRooms)
  return (
    <div className="settings-inner">
      <h3>
        <Users weight="bold" /> Open games
      </h3>
      {rooms.length === 0 ? (
        <p className="note">No one is waiting right now. Open a game, or try a quick match.</p>
      ) : (
        <ul className="room-list">
          {rooms.map((r) => (
            <li key={r.code}>
              <div>
                <b>{r.host}</b>
                <span className="note">{settingsLine(r.settings)}</span>
              </div>
              <button className="ghost" onClick={() => void joinRoom(r.code)}>
                <SignIn weight="bold" /> Join
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RoomView({ room }: { room: RoomSnapshot }) {
  const seat = useNet((s) => s.seat)
  const me = seat !== null ? room.seats[seat] : null
  const full = room.seats.every((s) => s !== null)
  return (
    <div className="settings-inner">
      <h3>
        <WifiHigh weight="bold" /> {room.quick ? 'Quick match' : room.isPublic ? 'Open game' : 'Private game'}
      </h3>
      {room.quick ? null : (
        <button
          className="room-code"
          title="Copy the code"
          onClick={() => void navigator.clipboard?.writeText(room.code)}
        >
          <span>Room code</span>
          <b>{room.code}</b>
          <Copy weight="bold" />
        </button>
      )}
      <div className="note">{settingsLine(room.settings)}</div>
      <ul className="room-list">
        {room.seats.map((s, i) => (
          <li key={i} className={s ? '' : 'empty'}>
            <div>
              <b>{s ? s.name : 'Waiting for a player…'}</b>
              {s ? (
                <span className="note">
                  {i === seat ? 'You' : 'Opponent'}
                  {s.rtt !== null ? ` · ${s.rtt} ms` : ''}
                  {s.connected ? '' : ' · offline'}
                </span>
              ) : null}
            </div>
            {s ? (
              s.ready ? (
                <CheckCircle weight="fill" className="ready on" />
              ) : (
                <Circle weight="bold" className="ready" />
              )
            ) : (
              <SpinnerGap weight="bold" className="spin" />
            )}
          </li>
        ))}
      </ul>
      <button className="primary" disabled={!full} onClick={() => void setReady(!me?.ready)}>
        <CheckCircle weight="fill" />
        <span>{me?.ready ? 'Ready! Waiting…' : full ? "I'm ready" : 'Waiting for opponent'}</span>
      </button>
      <button className="ghost" onClick={() => void leaveRoom()}>
        <ArrowLeft weight="bold" /> Leave room
      </button>
    </div>
  )
}
