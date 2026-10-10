// Lists what is in each Mixamo FBX: duration, bones, root motion. Dev aid for convert.ts.
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

declare global {
  interface Window {
    __done?: unknown
  }
}

const FILES = [
  'Baseball Hit',
  'Goalkeeper Idle',
  'Right Strafe',
  'Run Forward',
  'Running',
  'Standing Melee Attack Horizontal',
  'Throw',
  'Walk Strafe Left',
]

async function main() {
  const out: Record<string, unknown> = {}
  for (const f of FILES) {
    const fbx = await new FBXLoader().loadAsync(`./input/${encodeURIComponent(f)}.fbx`)
    const clip = fbx.animations[0]
    const bones: string[] = []
    fbx.traverse((o) => (o as THREE.Bone).isBone && bones.push(o.name))
    const hips = clip.tracks.find((t) => t.name.endsWith('Hips.position'))
    const v = hips?.values
    out[f] = {
      clips: fbx.animations.length,
      duration: +clip.duration.toFixed(2),
      frames: hips ? hips.times.length : 0,
      tracks: clip.tracks.length,
      bones: bones.length,
      firstBones: bones.slice(0, 8),
      hipsStart: v ? [v[0], v[1], v[2]].map((x) => +x.toFixed(1)) : null,
      hipsEnd: v ? [v[v.length - 3], v[v.length - 2], v[v.length - 1]].map((x) => +x.toFixed(1)) : null,
      scale: fbx.scale.toArray(),
    }
  }
  window.__done = out
}
main().catch((e) => (window.__done = { error: String(e?.stack ?? e) }))
