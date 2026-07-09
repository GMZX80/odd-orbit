# Odd Orbit Refactoring Audit

Date: 2026-05-26

## Current State

- The app builds cleanly with `npm run typecheck` and `npm run build`.
- The project is a Vite + Phaser TypeScript game with a fixed mobile-first 390x720 playfield.
- GitHub Pages is configured for the repository path `/odd-orbit/`.

## Refactors Completed

- Replaced result screen `innerHTML` string rendering with DOM node creation in `src/game/ui/domUi.ts`.
- Split `TravelScene.create` setup into state reset, object cleanup, and object creation helpers in `src/game/scenes/TravelScene.ts`.
- Tightened travel-scene cleanup so the player, wormhole, spawners, and parallax scene references are released before a new run setup.
- Made `ParallaxSpaceScene.destroy` release its backdrop rectangles as well as starfield layers and spawned objects.
- Added a Vite manual chunk for Phaser so the game shell and engine payload cache separately.
- Added a GitHub Pages workflow that builds with `npm ci` and deploys `dist`.

## Audit Findings

- `TravelScene` is still the largest file and owns spawning, movement, combat, collisions, scoring, escape flow, and input. The next useful extraction is a travel-combat coordinator for bullets, sidewinders, enemies, and brood cores.
- `GalaxyMapScene` owns input routing, animation sequencing, and strategic state calls. It would benefit from a small action controller once new strategic actions are added.
- `galaxyState` is intentionally framework-free, which is good, but it is a long module. Before adding save games or campaign variants, split turn progression, NPC decisions, and battle resolution into separate pure modules.
- The Phaser dependency dominates production bundle size. Manual chunking improves caching; deeper reduction would require lazy-loading the game runtime or splitting non-critical scenes.
- The repo has no automated browser smoke test yet. A minimal Playwright smoke test should verify that the title screen loads, the galaxy opens, and a canvas is visible.

## Recommended Next Steps

1. Extract travel combat logic from `TravelScene` after the next gameplay change, while behavior is fresh to verify.
2. Add a Playwright smoke test once Pages deployment is confirmed.
3. Add a small pure test suite around `galaxyState` before changing strategic rules.
4. Consider making `main` track the active game branch, or rename the current default branch to `main` once the initial scaffold branch is no longer useful.
