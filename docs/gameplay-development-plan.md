# Odd Orbit Gameplay Development Plan

Date: 2026-05-26

## Goal

Make the travel mini game immediately readable and more satisfying without changing its core loop:

- Left lane charges the wormhole and creates the escape route.
- Centre lane fights the hostile stream and protects the swarm.
- Right lane modifies the swarm through number gates.

The player should understand those three lane jobs from repeated visual behaviour, not from a permanent tutorial overlay.

## Design Pillars

- Lane identity is always visible.
- Wormhole charging feels like an active objective, not a hidden meter.
- The centre lane is the pressure lane: enemies make it risky to ignore.
- The right lane is the economy lane: cards create meaningful growth and danger choices.
- Escape timing should be a strategic decision: charge too slowly and enemies overwhelm; chase cards too much and the wormhole remains dormant.

## Development Phases

### Phase 1: Lane Readability

Purpose: make each lane communicate its role before adding more balance complexity.

Implementation work:

- Add a lightweight travel-lane visual layer behind the current objects.
- Left lane: blue-green energy conduit, subtle pull lines toward the wormhole, soft glow when selected.
- Centre lane: hostile warning channel, darker threat tint, weapon alignment cue when selected.
- Right lane: numeric gate shimmer, plus/minus particle accents, stronger card-lane boundary.
- Add a short first-run cue near the left lane: `Charge the wormhole`.
- Fade or suppress the text cue after a few seconds, while leaving the lane visuals permanent.

Acceptance checks:

- In a screenshot, the three lane purposes are visually distinct.
- With no explanation, the left lane reads as connected to the wormhole.
- The lane layer does not cover enemies, cards, bullets, or player swarm feedback.

### Phase 2: Wormhole Feedback Upgrade

Purpose: connect the existing integrated charge meter to player action more explicitly.

Implementation work:

- When left lane is selected, show a faint energy tether between the player swarm and wormhole.
- On bullet impact, pulse the left-lane conduit as well as the wormhole ring.
- At 50% charge, make the left lane more unstable and urgent.
- At full charge, have the wormhole visibly pull toward the player and briefly dim other lane cues.
- Add a small escape-ready callout in-world, not in the HUD.

Acceptance checks:

- Shooting the wormhole produces feedback in three places: bullet impact, wormhole ring, lane conduit.
- The player can tell when the wormhole is close to ready without reading numbers.
- Full charge feels like an event.

### Phase 3: Refactor For Gameplay Iteration

Purpose: make the next balancing passes cheaper and less risky.

Implementation work:

- Extract travel lane visuals into a new class, likely `TravelLaneGuide`.
- Extract wormhole targeting/feedback coordination from `TravelScene` once the lane guide exists.
- Keep lane role constants in `travelConfig.ts` so tuning is visible and low-risk.
- Add a browser smoke test that loads the game, opens the galaxy, and verifies a non-empty canvas.

Acceptance checks:

- `TravelScene` shrinks or at least stops accumulating visual-only responsibilities.
- `npm run typecheck` and `npm run build` stay clean.
- The smoke test catches blank-canvas or broken-route failures before deploy.

### Phase 4: Game Balance Pass

Purpose: tune the three-lane decision loop so the game has a readable rhythm.

Initial balance targets:

- Early run: player can safely learn all three lanes.
- Mid run: staying in one lane too long should become risky.
- Late run: the player should choose between charging escape, clearing threats, or gambling on cards.
- Average successful run should open the wormhole before the player feels trapped by unavoidable enemy pressure.

Values to inspect first:

- Wormhole energy cap and decay in `src/game/entities/Wormhole.ts`.
- Bullet absorption cap in `src/game/systems/firepower.ts`.
- Enemy spawn cadence in `src/game/entities/EnemySwarmSpawner.ts`.
- Card spawn cadence and expected value in `src/game/systems/cardBalancing.ts`.
- Run distance target in `src/game/travel/travelConfig.ts`.

Balance metrics to capture manually or with debug counters:

- Time to 25%, 50%, 75%, and 100% wormhole charge.
- Number of lane switches per successful run.
- Average units gained or lost from right-lane cards.
- Damage taken from centre-lane breakthroughs.
- Number of failed runs caused by low units versus missed escape.

First tuning recommendation:

- Do not reduce challenge first. Improve clarity first, then tune numbers after the player understands why they failed.
- If the wormhole still feels too unclear after Phase 2, increase wormhole-hit feedback before changing charge rates.
- If runs feel too punishing, soften enemy pressure in the first third rather than making all cards more generous.

## Integration Plan

1. Implement Phase 1 on a feature branch.
2. Run typecheck, build, and browser smoke test.
3. Push and deploy to GitHub Pages.
4. Play the live page on desktop and phone.
5. Capture one short balance note after each play session: what killed the player, what felt unclear, and whether escape felt earned.
6. Implement Phase 2 only after Phase 1 reads clearly in screenshots and live play.

## Immediate Next PR

Recommended branch: `codex/travel-lane-clarity`

Scope:

- Add travel lane guide visuals.
- Add first-run left-lane cue.
- Add selected-lane pulse feedback.
- Do not change wormhole charge rates or enemy/card balance yet.

Verification:

- `npm run typecheck`
- `npm run build`
- Browser smoke check against local Vite server
- Deploy check against `https://gmzx80.github.io/odd-orbit/`
