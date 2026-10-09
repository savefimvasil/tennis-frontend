import * as THREE from 'three'

// Procedural textures generated once at startup, so there are no image downloads.

const cache = new Map<string, THREE.Texture>()

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  return { c, g }
}

function finish(c: HTMLCanvasElement, opts: { color?: boolean; repeat?: [number, number]; aniso?: number } = {}) {
  const t = new THREE.CanvasTexture(c)
  if (opts.color !== false) t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1])
  t.anisotropy = opts.aniso ?? 8
  t.needsUpdate = true
  return t
}

function memo<T extends THREE.Texture>(key: string, make: () => T): T {
  let t = cache.get(key) as T | undefined
  if (!t) {
    t = make()
    cache.set(key, t)
  }
  return t
}

// Small deterministic PRNG so every load looks the same.
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function grassTexture() {
  return memo('grass', () => {
    const size = 512
    const { c, g } = canvas(size, size)
    g.fillStyle = '#4f6b34'
    g.fillRect(0, 0, size, size)
    const r = rng(42)
    for (let i = 0; i < 26000; i++) {
      const x = r() * size
      const y = r() * size
      const l = 30 + r() * 30
      g.fillStyle = `hsl(${80 + r() * 25}, ${35 + r() * 20}%, ${l}%)`
      g.fillRect(x, y, 1, 2 + r() * 3)
    }
    return finish(c, { repeat: [60, 60] })
  })
}

export function chainLinkTexture() {
  return memo('chain', () => {
    const s = 64
    const { c, g } = canvas(s, s)
    g.clearRect(0, 0, s, s)
    g.strokeStyle = '#ffffff'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(0, s / 2)
    g.lineTo(s / 2, 0)
    g.lineTo(s, s / 2)
    g.lineTo(s / 2, s)
    g.closePath()
    g.stroke()
    return finish(c, { color: false })
  })
}

export function netTexture() {
  return memo('net', () => {
    const s = 32
    const { c, g } = canvas(s, s)
    g.clearRect(0, 0, s, s)
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, s, 3)
    g.fillRect(0, 0, 3, s)
    return finish(c, { color: false })
  })
}

export function stringsTexture() {
  return memo('strings', () => {
    const s = 128
    const { c, g } = canvas(s, s)
    g.clearRect(0, 0, s, s)
    g.fillStyle = '#ffffff'
    for (let i = 0; i < 16; i++) {
      g.fillRect(i * 8, 0, 2, s)
      g.fillRect(0, i * 8, s, 2)
    }
    return finish(c, { color: false })
  })
}

/** Optic-yellow felt with the curved white seam (equirectangular). */
export function ballTexture() {
  return memo('ball', () => {
    const w = 512
    const h = 256
    const { c, g } = canvas(w, h)
    g.fillStyle = '#d6ef3c'
    g.fillRect(0, 0, w, h)
    const img = g.getImageData(0, 0, w, h)
    const r = rng(3)
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * 30
      img.data[i] += n
      img.data[i + 1] += n
      img.data[i + 2] += n * 0.5
    }
    g.putImageData(img, 0, 0)
    g.strokeStyle = '#f4f7e8'
    g.lineWidth = 7
    g.lineCap = 'round'
    g.beginPath()
    for (let x = 0; x <= w; x += 2) {
      const lon = (x / w) * Math.PI * 2
      const lat = 0.62 * Math.sin(2 * lon)
      const y = h / 2 - (lat / (Math.PI / 2)) * (h / 2)
      if (x === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
    return finish(c, { aniso: 4 })
  })
}

/** Dark green windscreen with club branding. Redrawn once the web font has loaded. */
export function windscreenTexture(text: string) {
  return memo('wind-' + text, () => {
    const w = 2048
    const h = 128
    const { c, g } = canvas(w, h)
    const draw = () => {
      g.fillStyle = '#183528'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#1d4031'
      for (let i = 0; i < w; i += 8) g.fillRect(i, 0, 3, h)
      const n = 2
      const slot = w / n
      let size = 70
      g.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`
      const width = g.measureText(text).width
      if (width > slot * 0.78) size = Math.floor((size * slot * 0.78) / width)
      g.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`
      g.textBaseline = 'middle'
      g.textAlign = 'center'
      for (let i = 0; i < n; i++) {
        g.fillStyle = '#e8efe9'
        g.fillText(text, slot * (i + 0.5), h / 2 + 2)
        g.fillStyle = '#c9e23a'
        g.beginPath()
        g.arc(slot * i + 14, h / 2, 10, 0, Math.PI * 2)
        g.fill()
      }
    }
    draw()
    const t = finish(c)
    // Load the face explicitly: a canvas never triggers a lazy @font-face load on its own.
    document.fonts?.load('700 70px "Barlow Condensed"').then(() => {
      draw()
      t.needsUpdate = true
    })
    return t
  })
}

/** A palm frond: central rib with leaflets, on transparent background. */
export function frondTexture() {
  return memo('frond', () => {
    const w = 128
    const h = 512
    const { c, g } = canvas(w, h)
    g.clearRect(0, 0, w, h)
    const r = rng(11)
    for (let y = 10; y < h - 6; y += 5) {
      const t = y / h
      const len = Math.sin(t * Math.PI) * 58 + 6
      const droop = 22 + r() * 10
      for (const s of [-1, 1]) {
        g.strokeStyle = `hsl(${92 + r() * 22}, ${42 + r() * 12}%, ${24 + r() * 14}%)`
        g.lineWidth = 3
        g.beginPath()
        g.moveTo(w / 2, y)
        g.quadraticCurveTo(w / 2 + s * len * 0.6, y + droop * 0.3, w / 2 + s * len, y + droop)
        g.stroke()
      }
    }
    g.strokeStyle = '#6b6a2e'
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(w / 2, 0)
    g.lineTo(w / 2, h)
    g.stroke()
    return finish(c, { aniso: 4 })
  })
}

export function barkTexture() {
  return memo('bark', () => {
    const w = 128
    const h = 256
    const { c, g } = canvas(w, h)
    g.fillStyle = '#7a6448'
    g.fillRect(0, 0, w, h)
    const r = rng(5)
    for (let y = 0; y < h; y += 10) {
      g.fillStyle = `rgba(40,28,16,${0.35 + r() * 0.3})`
      g.fillRect(0, y, w, 3 + r() * 2)
      g.fillStyle = `rgba(190,170,130,${0.15 + r() * 0.15})`
      g.fillRect(0, y + 4, w, 2)
    }
    return finish(c, { repeat: [2, 6] })
  })
}

/** Office windows for the distant skyline, some of them lit. */
export function windowsTexture() {
  return memo('windows', () => {
    const w = 128
    const h = 256
    const { c, g } = canvas(w, h)
    g.fillStyle = '#5d6e80'
    g.fillRect(0, 0, w, h)
    const r = rng(19)
    for (let y = 4; y < h; y += 10) {
      for (let x = 4; x < w; x += 8) {
        const lit = r()
        g.fillStyle = lit > 0.93 ? '#ffe2a8' : lit > 0.5 ? '#3e4d5e' : '#8fa6bb'
        g.fillRect(x, y, 5, 6)
      }
    }
    return finish(c, { aniso: 2 })
  })
}

/** Soft radial gradient used for blob shadows and dust puffs. */
export function radialTexture() {
  return memo('radial', () => {
    const s = 128
    const { c, g } = canvas(s, s)
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.45)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, s, s)
    const t = new THREE.CanvasTexture(c)
    t.needsUpdate = true
    return t
  })
}

/** Hedge foliage with pink bougainvillea flowers. */
export function hedgeTexture() {
  return memo('hedge', () => {
    const size = 256
    const { c, g } = canvas(size, size)
    g.fillStyle = '#2f5a2a'
    g.fillRect(0, 0, size, size)
    const r = rng(23)
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `hsl(${95 + r() * 30}, ${35 + r() * 25}%, ${18 + r() * 22}%)`
      g.beginPath()
      g.ellipse(r() * size, r() * size, 2 + r() * 4, 1 + r() * 3, r() * Math.PI, 0, Math.PI * 2)
      g.fill()
    }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `hsl(${318 + r() * 20}, ${70 + r() * 20}%, ${50 + r() * 15}%)`
      g.beginPath()
      g.arc(r() * size, r() * size, 1.5 + r() * 2.5, 0, Math.PI * 2)
      g.fill()
    }
    return finish(c, { repeat: [4, 1] })
  })
}

/** Clubhouse front: arched doors below and windows above, on a transparent wall. */
export function facadeTexture(arches: number) {
  return memo('facade-' + arches, () => {
    const w = 1024
    const h = 220
    const { c, g } = canvas(w, h)
    g.clearRect(0, 0, w, h)
    const step = (w - 120) / (arches - 1)
    for (let i = 0; i < arches; i++) {
      const x = 60 + i * step
      // Door arch (lower half of the wall)
      g.fillStyle = '#2b3238'
      g.fillRect(x - 27, h - 98, 54, 98)
      g.beginPath()
      g.arc(x, h - 98, 27, Math.PI, 0)
      g.fill()
      g.strokeStyle = 'rgba(255,255,255,0.18)'
      g.lineWidth = 2
      g.strokeRect(x - 1, h - 120, 2, 120)
      // Upper window
      g.fillStyle = '#3a4652'
      g.fillRect(x - 21, 30, 42, 36)
      g.fillStyle = '#d9d0c1'
      g.fillRect(x - 25, 66, 50, 5)
    }
    return finish(c, { aniso: 4 })
  })
}
