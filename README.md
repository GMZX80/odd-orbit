# Odd Orbit

Odd Orbit is currently focused on a small playable number-card runner slice.

## Current Vertical Slice

- Phaser + TypeScript + Vite browser runtime
- Mobile-first runner view with two meaningful channels
- Centre channel: ongoing enemy sphere stream
- Right channel: number cards
- Player starts each run with a small 5-unit swarm buffer
- Numbered cards spawn on the right side
- Automatic forward shooting
- Centre shots destroy enemy spheres
- Bullet hits increase card values by `+1`
- Card color updates immediately:
  - red for negative
  - grey for zero
  - blue for positive
- Touching a card applies `playerUnits += cardValue`
- Unit count at `0` or below causes game over
- Positive cards grow the visible player swarm
- More units increase firepower, capped for readability
- Minimal HUD: units and distance
- Travel HUD now shows selected lane, route charge, route stability, and the current objective
- In-world feedback calls out card gains/losses and when the wormhole escape route opens
- Result screen with distance, final units, and retry
- Smoke test support for the production preview via `npm run smoke`

## Commands

```sh
npm install
npm run dev
npm run build
npm run smoke
```

In this local environment, npm was bootstrapped under `.tools/`, so the verified
build command is:

```sh
node .tools/npm/bin/npm-cli.js run build
```
