# Odd Orbit Production Pass

Date: 2026-07-09

## Skill Route Applied

Applied the reusable game-production pipeline to the current Phaser/Vite Odd Orbit slice. The original skill collection is Babylon-focused, so this pass used the production principles rather than changing engine:

- preserve the proven browser-first loop
- improve readability before changing balance
- clarify player feedback for lane choice, route charge, card outcomes, and escape readiness
- keep mobile constraints visible
- add repeatable browser smoke evidence

## Changes Made

- Expanded the run snapshot with selected lane, lane label, objective text, route charge percentage, and stability percentage.
- Upgraded the travel HUD to show units, distance, lane, route charge, stability, and current objective.
- Added card collection feedback so positive, negative, held, and neutral card outcomes are visible in-world.
- Added an escape-ready callout when the wormhole opens.
- Allowed `?testHooks=1&travel=1` to start a travel run in preview builds for smoke testing.
- Added `npm run smoke`, which opens the built preview with Playwright and verifies the travel scene, HUD, canvas, and run state.

## Verification

- `npm run typecheck` passed.
- `npm run build` passed.
- `npm run smoke` passed against `http://127.0.0.1:4173/odd-orbit/?testHooks=1&travel=1`.
- Mobile-sized screenshot checked at `output/playwright/odd-orbit-production-pass-mobile.png`.

## Remaining Risks

- No real phone test was run in this pass.
- HUD density is now intentionally information-rich; future playtests should confirm it does not feel too dominant during fast play.
- The core balance numbers were left unchanged. Tuning should follow after a playtest confirms the clearer feedback changes are understood.

## Recommended Next Pass

- Run the live GitHub Pages build on desktop and phone.
- Capture a short playtest note: what killed the player, whether the left lane route objective was obvious, and whether card outcomes felt fair.
- Tune early enemy pressure only if players still fail before understanding the lane roles.
