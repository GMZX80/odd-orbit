# Odd Orbit

Odd Orbit is a mobile-first 2D comedy space exploration game. The player captains
a tiny unreliable spaceship through short arcade travel runs, collecting coins,
fuel, artefacts, NPC trouble, and status across a ridiculous universe.

## Vertical slice

- Phaser + TypeScript + Vite browser runtime
- Title screen, HUD, travel run, result screen, and retry loop
- Lane runner movement with hazards, coins, fuel, NPC ships, artefacts, and gates
- Procedural run spawning with a deterministic seed
- Local mock profile/save data through service boundaries designed for Firebase

## Commands

This environment did not have `npm` on PATH, so a temporary local npm CLI was
bootstrapped under `.tools/` during setup. In a normal developer environment:

```sh
npm install
npm run dev
npm run build
```

## Backend boundary

Firebase is intentionally not integrated in the first slice. The code already
keeps backend-facing concerns behind these service contracts:

- `authService`: future login/auth identity
- `userDataService`: profile, inventory, ship, and settings
- `gameDataService`: run history, progress, destinations, and artefact records

The current implementations use local storage so gameplay can evolve before the
backend becomes a dependency.
