import { Component, type ReactNode, Suspense, useEffect, useMemo } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import { type PbrSet, tiled, usePbr } from './photoTextures'

type Props = Omit<ThreeElements['meshStandardMaterial'], 'map' | 'normalMap' | 'roughnessMap' | 'normalScale'> & {
  set: PbrSet
  /** Repeats across the geometry's UV range (for UVs in metres: 1 / tile size). */
  repeat: [number, number]
  normalScale?: number
}

/** Standard material with a photo-scanned set. Suspends while loading: wrap it with a fallback material. */
export function PbrMaterial({ set, repeat: [rx, ry], normalScale = 1, ...props }: Props) {
  const t = usePbr(set)
  const maps = useMemo(
    () => ({
      map: tiled(t.map, rx, ry),
      normalMap: tiled(t.normalMap, rx, ry),
      roughnessMap: tiled(t.roughnessMap, rx, ry),
    }),
    [t, rx, ry],
  )
  useEffect(() => () => Object.values(maps).forEach((m) => m.dispose()), [maps])
  const scale = useMemo(() => new THREE.Vector2(normalScale, normalScale), [normalScale])
  return <meshStandardMaterial {...props} {...maps} normalScale={scale} />
}

/** Renders `fallback` instead of children that threw (e.g. a texture that failed to load). */
export class FallbackOnError extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Shows `fallback` while the children load and for good if they fail to (e.g. a missing texture). */
export function WithFallback({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <FallbackOnError fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </FallbackOnError>
  )
}
