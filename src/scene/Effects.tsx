import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { Quality } from '../game/store'

export function Effects({ quality }: { quality: Quality }) {
  if (quality === 'low') {
    return (
      <EffectComposer multisampling={0}>
        <ToneMapping mode={ToneMappingMode.AGX} />
        <SMAA />
      </EffectComposer>
    )
  }
  return (
    <EffectComposer multisampling={0}>
      <N8AO
        halfRes
        quality={quality === 'high' ? 'medium' : 'performance'}
        aoRadius={1.1}
        distanceFalloff={0.5}
        intensity={2.4}
        color="#1d2630"
      />
      <Bloom mipmapBlur luminanceThreshold={0.92} luminanceSmoothing={0.2} intensity={0.45} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <SMAA />
      <Vignette offset={0.28} darkness={0.45} />
    </EffectComposer>
  )
}
