# Odd Orbit Gameplay Balance Notes

Date: 2026-05-26

## Current Travel Tuning

The travel mini game is tuned around normal lane-switch reaction timing of roughly 350-500 ms.

Wormhole tuning has been restored to the original slower charge values after playtesting showed the first clarity pass made escape too easy.

## Balancing Decision

The target is that the wormhole remains a significant objective. The lane guide should explain the job of the left lane, but it should not make escape automatic.

Runs now start with a 5-unit swarm buffer. The strategic layer can still commit a single seed unit, but the runner needs a little survivability so early breakthroughs or one poor card do not erase the learning loop.

Number cards can reduce the swarm, but they are non-lethal before the route reaches full pressure. This keeps the right lane risky without letting one pre-escape card spike cancel a run that is otherwise close to opening the wormhole.

## What To Watch In Playtests

- If new players still ignore the left lane, improve visual feedback before changing numbers again.
- If escape feels automatic after collecting a few cards, reduce the absorption cap slightly before increasing decay.
- If players die while trying to learn, soften early enemy pressure before making positive cards more common.
- If players camp left and win without caring about cards, increase centre-lane pressure in the mid run.

## Manual Test Pattern

Use these rough lane timings when playtesting:

- Learning pattern: left for 1.2 s, centre/right for 0.4 s.
- Normal pattern: left for 0.9 s, other lanes for 0.9 s.
- Busy pattern: left for 0.7 s, other lanes for 1.4 s.

The game should remain readable with these patterns and should not require twitch-perfect lane changes.
