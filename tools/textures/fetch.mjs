// Downloads the CC0 photo-scanned textures and the sky HDRI, converts them to WebP and writes
// public/textures/ plus public/textures/LICENSE.md. Re-running it reproduces the same files.
// Usage: node tools/textures/fetch.mjs   (needs ImageMagick 7 with WebP: `magick -list format | grep WEBP`)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'public', 'textures')
const CACHE = join(ROOT, 'tools', 'textures', '.cache')

/**
 * Material sets. Every set gets color.webp, normal.webp (OpenGL convention) and rough.webp.
 *  - size: output size of the colour and normal maps; rough: size of the roughness map.
 *    Courts are 1K too: at their 1.4-2.4 m tiling 2K looked the same in game and cost more.
 *  - detail: the colour map is divided by its mean colour so the game tints it (court surfaces);
 *    the value scales the remaining contrast. Stored so that linear 0.5 is the mean.
 *  - ao: multiply the ambient occlusion map into the colour map (deep relief only).
 */
const MATERIALS = [
  { out: 'court/hard', site: 'polyhaven', id: 'clean_asphalt', size: 1024, rough: 1024, detail: 0.55 },
  { out: 'court/clay', site: 'polyhaven', id: 'red_sand', size: 1024, rough: 1024, detail: 0.9 },
  { out: 'court/grass', site: 'ambientcg', id: 'Grass005', size: 1024, rough: 1024, detail: 0.85 },
  { out: 'venue/concrete', site: 'ambientcg', id: 'Concrete034', size: 1024, rough: 512 },
  { out: 'venue/stucco', site: 'polyhaven', id: 'white_stucco', size: 1024, rough: 512 },
  { out: 'venue/roof', site: 'polyhaven', id: 'clay_roof_tiles_02', size: 1024, rough: 512, ao: true },
  { out: 'venue/paving', site: 'polyhaven', id: 'floor_pavement', size: 1024, rough: 512, ao: true },
  { out: 'venue/bark', site: 'polyhaven', id: 'palm_bark', size: 1024, rough: 512 },
]

/** Sky: a 2K HDRI stored as an SDR WebP plus a gain map (drei/gainmap-js "separate files" form). */
const SKY = { out: 'sky', id: 'lonely_road_afternoon_puresky', res: '2k' }

const sources = []

async function json(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'tennis-texture-fetch' } })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.json()
}

async function download(url, file) {
  if (existsSync(file)) return file
  mkdirSync(dirname(file), { recursive: true })
  const r = await fetch(url, { headers: { 'User-Agent': 'tennis-texture-fetch' } })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  writeFileSync(file, Buffer.from(await r.arrayBuffer()))
  console.log('  downloaded', url)
  return file
}

/** Source images {color, normal, rough, ao?} for a set, at a resolution of at least `size`. */
async function polyhaven(id, size) {
  const res = size > 1024 ? '2k' : '1k'
  const [files, info] = await Promise.all([
    json(`https://api.polyhaven.com/files/${id}`),
    json(`https://api.polyhaven.com/info/${id}`),
  ])
  const get = (key) => files[key]?.[res]?.jpg?.url
  const pick = async (key, name) => {
    const url = get(key)
    return url ? download(url, join(CACHE, id, `${name}.jpg`)) : undefined
  }
  sources.push({
    name: info.name,
    id,
    url: `https://polyhaven.com/a/${id}`,
    authors: Object.keys(info.authors ?? {}).join(', '),
    site: 'Poly Haven',
  })
  return {
    color: await pick('Diffuse', 'color'),
    normal: await pick('nor_gl', 'normal'),
    rough: await pick('Rough', 'rough'),
    ao: await pick('AO', 'ao'),
  }
}

async function ambientcg(id, size) {
  const attr = size > 1024 ? '2K-JPG' : '1K-JPG'
  const data = await json(`https://ambientcg.com/api/v2/full_json?id=${id}&include=downloadData`)
  const asset = data.foundAssets[0]
  const zips = asset.downloadFolders.default.downloadFiletypeCategories.zip.downloads
  const zip = zips.find((d) => d.attribute === attr)
  if (!zip) throw new Error(`${id}: no ${attr} download`)
  const dir = join(CACHE, id)
  const file = await download(zip.downloadLink ?? zip.fullDownloadPath, join(dir, `${attr}.zip`))
  execFileSync('unzip', ['-oq', file, '-d', dir])
  const find = (suffix) => {
    const f = readdirSync(dir).find((n) => n.endsWith(`_${suffix}.jpg`))
    return f ? join(dir, f) : undefined
  }
  sources.push({
    name: asset.displayName ?? id,
    id,
    url: `https://ambientcg.com/view?id=${id}`,
    authors: 'ambientCG (Lennart Demes)',
    site: 'ambientCG',
  })
  return {
    color: find('Color'),
    normal: find('NormalGL'),
    rough: find('Roughness'),
    ao: find('AmbientOcclusion'),
  }
}

/** Tile-aware resize to n x n, as raw 8-bit RGB. Tile wrapping keeps the edges seamless. */
function readRgb(file, n) {
  return execFileSync(
    'magick',
    [file, '-virtual-pixel', 'tile', '-filter', 'Lanczos', '-distort', 'Resize', `${n}x${n}!`, '-depth', '8', 'rgb:-'],
    { maxBuffer: 1 << 28 },
  )
}

function writeWebp(raw, w, h, file, args) {
  mkdirSync(dirname(file), { recursive: true })
  execFileSync('magick', ['-size', `${w}x${h}`, '-depth', '8', 'rgb:-', ...args, file], { input: raw })
}

const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)
const LIN = Float32Array.from({ length: 256 }, (_, i) => toLin(i / 255))
const byte = (lin) => Math.round(toSrgb(Math.max(0, Math.min(1, lin))) * 255)

async function material(m) {
  console.log(m.out)
  const src = m.site === 'polyhaven' ? await polyhaven(m.id, m.size) : await ambientcg(m.id, m.size)
  const n = m.size
  const color = readRgb(src.color, n)
  if (m.ao && src.ao) {
    const ao = readRgb(src.ao, n)
    for (let i = 0; i < color.length; i++) color[i] = byte(LIN[color[i]] * (0.25 + 0.75 * LIN[ao[i]] ** 0.6))
  }
  if (m.detail !== undefined) {
    // Divide out the mean colour; the shader multiplies by 2 x the game's surface colour.
    const mean = [0, 0, 0]
    for (let i = 0; i < color.length; i++) mean[i % 3] += LIN[color[i]]
    for (let c = 0; c < 3; c++) mean[c] /= color.length / 3
    for (let i = 0; i < color.length; i++) {
      color[i] = byte(0.5 * (1 + m.detail * (LIN[color[i]] / mean[i % 3] - 1)))
    }
  }
  const dir = join(OUT, m.out)
  writeWebp(color, n, n, join(dir, 'color.webp'), ['-quality', '82', '-define', 'webp:method=6'])
  writeWebp(readRgb(src.normal, n), n, n, join(dir, 'normal.webp'), ['-quality', '88', '-define', 'webp:method=6'])
  writeWebp(readRgb(src.rough, m.rough), m.rough, m.rough, join(dir, 'rough.webp'), [
    '-colorspace',
    'gray',
    '-quality',
    '80',
    '-define',
    'webp:method=6',
  ])
}

/** Radiance .hdr (RGBE, new-style RLE) to linear float RGB. */
function readHdr(buf) {
  let p = 0
  const line = () => {
    const s = p
    while (buf[p] !== 0x0a) p++
    return buf.toString('latin1', s, p++)
  }
  if (!line().startsWith('#?')) throw new Error('not a Radiance file')
  while (line() !== '');
  const [, h, , w] = line().split(' ')
  const W = +w
  const H = +h
  const out = new Float32Array(W * H * 3)
  const scan = new Uint8Array(W * 4)
  for (let y = 0; y < H; y++) {
    if (buf[p] !== 2 || buf[p + 1] !== 2) throw new Error('only RLE scanlines are supported')
    p += 4
    for (let c = 0; c < 4; c++) {
      for (let x = 0; x < W;) {
        let count = buf[p++]
        if (count > 128) {
          count -= 128
          const v = buf[p++]
          while (count--) scan[x++ * 4 + c] = v
        } else {
          while (count--) scan[x++ * 4 + c] = buf[p++]
        }
      }
    }
    for (let x = 0; x < W; x++) {
      const e = scan[x * 4 + 3]
      const f = e ? 2 ** (e - 136) : 0
      for (let c = 0; c < 3; c++) out[(y * W + x) * 3 + c] = scan[x * 4 + c] * f
    }
  }
  return { w: W, h: H, data: out }
}

async function sky() {
  console.log(SKY.out)
  const [files, info] = await Promise.all([
    json(`https://api.polyhaven.com/files/${SKY.id}`),
    json(`https://api.polyhaven.com/info/${SKY.id}`),
  ])
  const file = await download(files.hdri[SKY.res].hdr.url, join(CACHE, SKY.id, `${SKY.res}.hdr`))
  sources.push({
    name: info.name,
    id: SKY.id,
    url: `https://polyhaven.com/a/${SKY.id}`,
    authors: Object.keys(info.authors ?? {}).join(', '),
    site: 'Poly Haven',
    note: `${SKY.res} HDRI`,
  })
  const { w, h, data } = readHdr(readFileSync(file))

  // Expose so the sky (all but the sun) fits in the 8-bit SDR image; the gain map then only
  // holds the sun and its glow, which keeps it small. The game sets the intensities by eye.
  const lums = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) lums[i] = Math.max(data[i * 3], data[i * 3 + 1], data[i * 3 + 2])
  lums.sort()
  const exposure = 0.98 / lums[Math.floor(lums.length * 0.995)]
  for (let i = 0; i < data.length; i++) data[i] *= exposure

  // Gain map (Adobe/ISO gain-map maths as decoded by @monogrid/gainmap-js):
  // hdr = (sdr + offset) * 2^(gain^gamma * maxLog2) - offset, with sdr = min(hdr, 1).
  // The gamma spends more of the 8 bits on small gains, so the glow around the sun stays smooth.
  const offset = 1 / 64
  const gamma = 2.5
  let maxLog2 = 0
  for (let i = 0; i < data.length; i++) maxLog2 = Math.max(maxLog2, Math.log2((data[i] + offset) / (1 + offset)))
  const sdr = Buffer.alloc(w * h * 3)
  const gain = Buffer.alloc(w * h * 3)
  for (let i = 0; i < data.length; i++) {
    const s = Math.min(data[i], 1)
    sdr[i] = byte(s)
    // Only clipped pixels need a gain; elsewhere it would just encode 8-bit rounding noise.
    const g = data[i] > 1 ? Math.log2((data[i] + offset) / (LIN[sdr[i]] + offset)) / maxLog2 : 0
    gain[i] = Math.round(Math.max(0, Math.min(1, g)) ** (1 / gamma) * 255)
  }
  const dir = join(OUT, SKY.out)
  writeWebp(sdr, w, h, join(dir, 'sky.webp'), ['-quality', '86', '-define', 'webp:method=6'])
  writeWebp(gain, w, h, join(dir, 'sky-gain.webp'), ['-define', 'webp:lossless=true', '-define', 'webp:method=6'])
  const meta = {
    gainMapMin: [0, 0, 0],
    gainMapMax: [maxLog2, maxLog2, maxLog2],
    gamma: [gamma, gamma, gamma],
    offsetSdr: [offset, offset, offset],
    offsetHdr: [offset, offset, offset],
    hdrCapacityMin: 0,
    hdrCapacityMax: maxLog2,
    // Not read by the loader: the factor the source HDRI was scaled by.
    exposure: +exposure.toFixed(5),
  }
  writeFileSync(join(dir, 'sky.json'), JSON.stringify(meta, null, 2) + '\n')

  // Sun direction: luminance-weighted centroid of the brightest pixels, in three.js
  // equirectangular convention (u = atan2(z, x) / 2pi + 0.5, v = asin(y) / pi + 0.5, v up).
  const lum = (i) => 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2]
  let peak = 0
  for (let i = 0; i < w * h; i++) peak = Math.max(peak, lum(i))
  const sum = [0, 0, 0]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = lum(y * w + x)
      if (l < peak * 0.25) continue
      const phi = ((x + 0.5) / w - 0.5) * 2 * Math.PI
      const theta = (0.5 - (y + 0.5) / h) * Math.PI
      sum[0] += Math.cos(theta) * Math.cos(phi) * l
      sum[1] += Math.sin(theta) * l
      sum[2] += Math.cos(theta) * Math.sin(phi) * l
    }
  }
  const len = Math.hypot(...sum)
  const sun = sum.map((v) => +(v / len).toFixed(4))
  const deg = (r) => +((r * 180) / Math.PI).toFixed(2)
  console.log(
    `  sun direction ${JSON.stringify(sun)}: azimuth atan2(z, x) = ${deg(Math.atan2(sun[2], sun[0]))} deg,`,
    `elevation ${deg(Math.asin(sun[1]))} deg; exposure ${exposure.toFixed(4)}, peak ${peak.toFixed(0)}, gain range 2^${maxLog2.toFixed(2)}`,
  )
}

function licence() {
  const rows = sources.map(
    (s) => `| ${s.name}${s.note ? ` (${s.note})` : ''} | ${s.site} | ${s.authors} | <${s.url}> | CC0 1.0 |`,
  )
  const text = `# Texture sources

All textures and the sky in this folder are photo-scanned assets released under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) (public domain).
No attribution is required; it is given here anyway. They were downloaded and converted to
WebP by \`tools/textures/fetch.mjs\` (see \`tools/textures/README.md\`).

| Asset | Library | Author | Source | Licence |
| --- | --- | --- | --- | --- |
${rows.join('\n')}

Licence pages: <https://polyhaven.com/license>, <https://docs.ambientcg.com/license/>.
`
  writeFileSync(join(OUT, 'LICENSE.md'), text)
}

function report() {
  let total = 0
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const f = join(d, n)
      if (statSync(f).isDirectory()) walk(f)
      else total += statSync(f).size
    }
  }
  walk(OUT)
  console.log(`public/textures: ${(total / 1024 / 1024).toFixed(2)} MB`)
  if (total > 10 * 1024 * 1024) {
    console.error('Over the 10 MB budget')
    process.exitCode = 1
  }
}

for (const m of MATERIALS) await material(m)
await sky()
licence()
report()
