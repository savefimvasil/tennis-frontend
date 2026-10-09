# Athlete animation

The players are Microsoft Rocketbox avatars driven every frame by a procedural rig
(`src/scene/athlete/Athlete.tsx`). The rig is a function of the simulation state only
(position, velocity, swing, swing time, split step, celebrate), so the remote player online is
animated from the same replicated fields as the local one. Pure helpers live in `anim.ts`
(unit-tested in `anim.test.ts`); the shot keyframes are in `poses.ts`.

## Layers, in order

1. **Locomotion.** Local velocity is split by `gaitFor` into a forward/backward run and a side
   shuffle. Slow sideways moves are shuffles facing the net (lead leg out, trail leg closes);
   above ~3.5 m/s the hips turn into a crossover run. The hip target is continuous in the
   direction of travel (no flip when moving straight sideways). Stride length grows with speed
   (`strideLength`), so slow steps are short and quick instead of slow-motion strides.
2. **Lean.** A smoothed acceleration leans the trunk forward when speeding up, back when
   braking and into lateral changes of direction; hard braking also sits into the legs.
3. **Split step and receiving bounce** before the serve.
4. **Early preparation.** As soon as the opponent's shot is predicted, the shoulders turn and
   the racket goes back on the side the ball will be met (`predictedLateral`, the director's
   own forehand/backhand rule). When the swing starts, `preparedSwingTime` joins the stroke
   track from that take-back instead of snapping back to the ready stance.
5. **Strokes.** The keyframe tracks are sampled with a monotone cubic spline
   (`monotoneCubic`): the racket keeps moving through contact and only stops at real turning
   points, without overshooting a key. The hips lead the shoulders (part of the trunk turn
   comes from the pelvis), the legs load in the take-back and drive up through contact.
6. **Reactions.** Fist pump on a won point; the loser's shoulders and head drop.
7. **Head tracking.** The neck turns and tilts toward the ball, relative to the chest.
8. **Blend.** Per-joint rates: limbs react fast, the head and trunk softer.
9. **Feet.** Ankle joints keep the soles flat on the court whatever the thigh and shin do;
   in the air (serve) the toes point.
10. **IK.** The racket arm still aims the strings at the planned contact (unchanged contract:
    `a.sweet` feeds `snapBallToRacket`). The free hand now cradles the racket throat in the
    ready stance and holds the grip through the two-handed backhand, letting go for running and
    the follow-through.

A soft contact shadow under each player seats the feet on the court (the venue-wide sun
shadow map is too coarse for that).

## What stays fixed

Gameplay timing is shared with the director, the AI, the server referee and the tests: the
groundstroke contact at swing time 0.2 s, the serve contact at 1.0 s, the swing lengths, and the
`a.sweet` contract. Animation changes must not move them.

## Next: clips instead of hand keys

The procedural rig is now the fallback layer. The next quality step needs motion data:

- **Locomotion clips** (run, side shuffle, crossover, backpedal) from a CC0 library such as
  Quaternius Universal Animation Library, retargeted onto the Rocketbox `Bip01` skeleton in
  Blender, exported in place, and blended in a 2D blend space by local velocity.
- **Stroke clips** from your own recorded footage through an AI mocap service (DeepMotion,
  QuickMagic, Rokoko Vision), 3-5 variants per stroke, each with its contact frame stored in
  the clip metadata and time-warped so that frame lands on the director's contact time; the IK
  above stays as the final correction.

Keep licensed (non-CC0/MIT) clips out of the public repository.
