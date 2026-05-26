# Odd Orbit Gameplay Balance Notes

Date: 2026-05-26

## Current Travel Tuning

The travel mini game is tuned around normal lane-switch reaction timing of roughly 350-500 ms.

Wormhole tuning now targets:

- A learning run that mostly stays left can open the wormhole in about 8 seconds.
- A cautious run that spends about half its time charging can open in about 13 seconds before card growth.
- A growing swarm with 4 units and half-time charging can open in about 7 seconds.
- A busy 8-unit run spending about one third of time charging can open in about 9 seconds.

These numbers are estimates from the current fire cadence and wormhole absorption cap. They are deliberately not frame-perfect; they are sanity checks for human-feeling play.

## Balancing Decision

The previous wormhole scale made escape take minutes under normal play. That was too slow for the runner loop and made the left lane feel unrewarding even when the player understood it.

The updated target is that the wormhole becomes achievable within a normal run rhythm, but still asks the player to give up time in the fight and growth lanes.

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
