import { LookupTexture } from 'postprocessing'
import type { SurfaceId } from '../physics/flight'

// Colour grading per venue as a 3D lookup table, built here instead of shipping .cube files.
// It runs after AgX tone mapping (one texture lookup per pixel) and does what a colourist's
// LUT would: give back the saturation AgX takes away, a gentle S-curve, and split toning:
// a tint in the shadows and another in the highlights.

interface Grade {
  /** Saturation around the pixel's luma (1 = unchanged). */
  saturation: number
  /** Contrast around mid-grey. */
  contrast: number
  /** Added to the shadows / highlights (sRGB 0..1), weighted by how dark / bright a pixel is. */
  shadows: [number, number, number]
  highlights: [number, number, number]
  /** Extra saturation for one hue band: [centre hue 0..1, width, gain]. */
  hueBoost?: [number, number, number]
}

export const GRADES: Record<SurfaceId, Grade> = {
  // Evening hall: warm lamp-lit highlights against cool blue-hour shadows.
  hard: {
    saturation: 1.14,
    contrast: 1.1,
    shadows: [-0.018, 0.0, 0.045],
    highlights: [0.05, 0.022, -0.028],
  },
  // Garden: lush, clean greens and a soft warm sun.
  grass: {
    saturation: 1.15,
    contrast: 1.07,
    shadows: [-0.014, 0.008, 0.022],
    highlights: [0.03, 0.016, -0.016],
    hueBoost: [0.28, 0.1, 0.18],
  },
  // Courtyard: hot terracotta and ochre, warm all through.
  clay: {
    saturation: 1.16,
    contrast: 1.08,
    shadows: [0.0, -0.006, 0.026],
    highlights: [0.045, 0.017, -0.03],
    hueBoost: [0.04, 0.07, 0.14],
  },
}

function hue(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  if (d < 1e-5) return 0
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  h /= 6
  return h < 0 ? h + 1 : h
}

/** Applies the grade to one sRGB colour (components 0..1, in place). */
export function grade(c: [number, number, number], gr: Grade) {
  let [r, g, b] = c
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
  let sat = gr.saturation
  if (gr.hueBoost) {
    const [centre, width, gain] = gr.hueBoost
    let dh = Math.abs(hue(r, g, b) - centre)
    dh = Math.min(dh, 1 - dh)
    sat += gain * Math.max(0, 1 - dh / width)
  }
  r = luma + (r - luma) * sat
  g = luma + (g - luma) * sat
  b = luma + (b - luma) * sat
  const ws = (1 - luma) * (1 - luma)
  const wh = luma * luma
  r += gr.shadows[0] * ws + gr.highlights[0] * wh
  g += gr.shadows[1] * ws + gr.highlights[1] * wh
  b += gr.shadows[2] * ws + gr.highlights[2] * wh
  // S-curve: contrast about mid-grey, rolled off so it never clips harder at the ends.
  const curve = (x: number) => {
    const y = 0.5 + (x - 0.5) * gr.contrast
    const k = Math.min(1, Math.max(0, x))
    return y * (1 - 0.35 * Math.abs(2 * k - 1) ** 3) + k * 0.35 * Math.abs(2 * k - 1) ** 3
  }
  c[0] = Math.min(1, Math.max(0, curve(r)))
  c[1] = Math.min(1, Math.max(0, curve(g)))
  c[2] = Math.min(1, Math.max(0, curve(b)))
}

const cache = new Map<SurfaceId, LookupTexture>()

/** The venue's grade as a 32^3 lookup table (built once per venue). */
export function gradeLut(surface: SurfaceId): LookupTexture {
  let lut = cache.get(surface)
  if (lut) return lut
  lut = LookupTexture.createNeutral(32)
  const data = lut.image.data as Float32Array | Uint8Array
  const scale = data instanceof Uint8Array ? 255 : 1
  const c: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < data.length; i += 4) {
    c[0] = data[i] / scale
    c[1] = data[i + 1] / scale
    c[2] = data[i + 2] / scale
    grade(c, GRADES[surface])
    data[i] = c[0] * scale
    data[i + 1] = c[1] * scale
    data[i + 2] = c[2] * scale
  }
  lut.needsUpdate = true
  cache.set(surface, lut)
  return lut
}
