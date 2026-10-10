// Turns Mixamo locomotion clips into leg and spine poses for the procedural rig
// (src/scene/athlete/mocap.json): Euler XYZ joint rotations relative to the rig's rest
// (limbs hanging), one entry per frame of one gait cycle, plus the pelvis height change.
// Only the legs and spine are taken: the arms carry the racket and stay procedural.
// Run via `node tools/mixamo/run.mjs` with the dev server up; see README.md.
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

declare global {
  interface Window {
    __done?: { json?: string; report: unknown; error?: string }
  }
}

/** Rig joint <- [parent Mixamo bone, child Mixamo bone]: local = D(parent)^-1 D(child). */
const JOINTS: Record<string, [string, string]> = {
  spine: ['Hips', 'Spine2'],
  lHip: ['Hips', 'LeftUpLeg'],
  lKnee: ['LeftUpLeg', 'LeftLeg'],
  lAnk: ['LeftLeg', 'LeftFoot'],
  rHip: ['Hips', 'RightUpLeg'],
  rKnee: ['RightUpLeg', 'RightLeg'],
  rAnk: ['RightLeg', 'RightFoot'],
}

interface Cycle {
  /** Seconds per cycle (two steps) and metres covered in it, as captured. */
  duration: number
  distance: number
  frames: { j: Record<string, [number, number, number]>; lift: number; yaw: number }[]
}

async function load(name: string) {
  const fbx = await new FBXLoader().loadAsync(`./input/${encodeURIComponent(name)}.fbx`)
  const bone = (n: string) => fbx.getObjectByName(`mixamorig${n}`)!
  fbx.updateMatrixWorld(true)
  // The file's bind pose (T-pose, legs straight down) is the rest every rotation is measured from.
  const rest = new Map<string, THREE.Quaternion>()
  const names = new Set(Object.values(JOINTS).flat())
  for (const n of names) rest.set(n, bone(n).getWorldQuaternion(new THREE.Quaternion()))
  const restHipsY = bone('Hips').getWorldPosition(new THREE.Vector3()).y
  return { fbx, bone, rest, restHipsY, clip: fbx.animations[0], names }
}

async function cycle(name: string, mirror: boolean): Promise<Cycle> {
  const { fbx, bone, rest, restHipsY, clip, names } = await load(name)
  const mixer = new THREE.AnimationMixer(fbx)
  mixer.clipAction(clip).play()
  const fps = 30
  const n = Math.round(clip.duration * fps)
  const frames: Cycle['frames'] = []
  const d = new Map<string, THREE.Quaternion>()
  let start: THREE.Vector3 | null = null
  let end = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    mixer.setTime(i / fps)
    fbx.updateMatrixWorld(true)
    for (const nm of names) {
      // World rotation since rest: Q = D R.
      const q = bone(nm).getWorldQuaternion(new THREE.Quaternion())
      d.set(nm, q.multiply(rest.get(nm)!.clone().invert()))
    }
    const hips = bone('Hips').getWorldPosition(new THREE.Vector3())
    if (!start) start = hips.clone()
    end = hips
    const j: Record<string, [number, number, number]> = {}
    // Our pelvis stays level (it only yaws), so the hips' pitch and roll go into the thighs
    // and the spine: measure those from a frame that follows the hips' heading only.
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(d.get('Hips')!)
    const heading = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(fwd.x, fwd.z))
    for (const [joint, [p, c]] of Object.entries(JOINTS)) {
      const parent = p === 'Hips' ? heading : d.get(p)!
      const local = parent.clone().invert().multiply(d.get(c)!)
      // Mirror across the body's midplane (x -> -x): q -> (x, -y, -z, w), sides swapped.
      if (mirror) local.set(local.x, -local.y, -local.z, local.w)
      const e = new THREE.Euler().setFromQuaternion(local, 'XYZ')
      const key = mirror ? joint.replace(/^l/, 'R').replace(/^r/, 'l').replace(/^R/, 'r') : joint
      j[key] = [e.x, e.y, e.z].map((v) => +v.toFixed(3)) as [number, number, number]
    }
    // Hips heading (radians, + toward the athlete's left): the rig turns its pelvis by this.
    const yaw = (mirror ? -1 : 1) * Math.atan2(fwd.x, fwd.z)
    frames.push({ j, lift: +((hips.y - restHipsY) / 100).toFixed(3), yaw: +yaw.toFixed(3) })
  }
  const distance = Math.hypot(end.x - start!.x, end.z - start!.z) / 100
  return { duration: +clip.duration.toFixed(3), distance: +distance.toFixed(3), frames }
}

async function main() {
  const out = {
    run: await cycle('Run Forward', false),
    strafeRight: await cycle('Right Strafe', false),
    strafeLeft: await cycle('Right Strafe', true),
  }
  const report = Object.fromEntries(
    Object.entries(out).map(([k, c]) => [
      k,
      { frames: c.frames.length, duration: c.duration, distance: c.distance, f0: c.frames[0] },
    ]),
  )
  window.__done = { json: JSON.stringify(out), report }
}

main().catch((e) => (window.__done = { report: null, error: String(e?.stack ?? e) }))
