import { Bloom, EffectComposer, HueSaturation, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { Quality } from '../game/store'

/**
 * Post-processing by quality. High and Medium render into a multisampled target: MSAA keeps
 * the thin things (net mesh, fence wire, strings, court lines, cables) solid where SMAA
 * shimmers, and alpha-tested materials use alpha-to-coverage for soft cut-outs. Low keeps SMAA.
 */
export function Effects({ quality }: { quality: Quality }) {
  if (quality === 'high') {
    return (
      <EffectComposer multisampling={4}>
        <N8AO halfRes quality="performance" aoRadius={1.1} distanceFalloff={0.5} intensity={2.2} color="#1d2630" />
        <Bloom mipmapBlur luminanceThreshold={0.92} luminanceSmoothing={0.2} intensity={0.4} />
        <ToneMapping mode={ToneMappingMode.AGX} />
        {/* AgX desaturates bright colours; give the foliage, sky and court some of it back. */}
        <HueSaturation saturation={0.14} />
        <Vignette offset={0.28} darkness={0.45} />
      </EffectComposer>
    )
  }
  if (quality === 'medium') {
    // Ambient occlusion seats things in the small venues (benches, wall feet, the lattice).
    return (
      <EffectComposer multisampling={4}>
        <N8AO halfRes quality="performance" aoRadius={0.9} distanceFalloff={0.5} intensity={1.8} color="#1d2630" />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <HueSaturation saturation={0.14} />
        <Vignette offset={0.28} darkness={0.4} />
      </EffectComposer>
    )
  }
  return (
    <EffectComposer multisampling={0}>
      <ToneMapping mode={ToneMappingMode.AGX} />
      <HueSaturation saturation={0.14} />
      <SMAA />
      <Vignette offset={0.28} darkness={0.4} />
    </EffectComposer>
  )
}
