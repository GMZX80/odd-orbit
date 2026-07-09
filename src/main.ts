import Phaser from "phaser";
import "./styles.css";
import { BootScene } from "./game/scenes/BootScene";
import { GalaxyMapScene } from "./game/scenes/GalaxyMapScene";
import { TravelScene } from "./game/scenes/TravelScene";
import { createDomUi } from "./game/ui/domUi";
import { gameEvents } from "./game/events";
import { installOddOrbitTestHooks } from "./game/testHooks";
import { applyWormholeRunResult } from "./game/systems/galaxyState";
import type { WormholeRunInput } from "./game/systems/galaxyTypes";
import type { RunResult, RunStateSnapshot } from "./game/systems/runTypes";

const ui = createDomUi();
let pendingRunInput: WormholeRunInput | undefined;
let latestRunSnapshot: RunStateSnapshot | undefined;
let lastRunResult: RunResult | undefined;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-root",
  backgroundColor: "#07131d",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 390,
    height: 720
  },
  physics: {
    default: "arcade",
    arcade: {
      debug: false
    }
  },
  scene: [BootScene, GalaxyMapScene, TravelScene]
});

function startRun(startingUnits = 1, runInput?: WormholeRunInput) {
  if (runInput) {
    pendingRunInput = runInput;
  }
  ui.showHud();
  game.scene.stop("GalaxyMapScene");
  game.scene.stop("TravelScene");
  game.scene.start("TravelScene", { idle: false, startingUnits, runInput });
}

function showGalaxyMap() {
  ui.showGalaxy();
  game.scene.stop("TravelScene");
  game.scene.start("GalaxyMapScene");
}

ui.onStart(showGalaxyMap);
ui.onRetry(() => {
  startRun();
});

ui.showGalaxy();

if (
  (import.meta.env.MODE === "development" || new URLSearchParams(window.location.search).get("testHooks") === "1") &&
  new URLSearchParams(window.location.search).get("travel") === "1"
) {
  window.setTimeout(() => startRun(1), 1000);
}

gameEvents.on<WormholeRunInput>("galaxy:start-run", (runInput) => {
  startRun(runInput.startingUnits, runInput);
});

gameEvents.on("run:update", (snapshot: RunStateSnapshot) => {
  latestRunSnapshot = snapshot;
  ui.renderHud(snapshot);
});

gameEvents.on("run:damage", () => {
  ui.flashUnitDamage();
});

gameEvents.on("run:end", (result: RunResult) => {
  lastRunResult = result;
  if (pendingRunInput) {
    const runInput = pendingRunInput;
    pendingRunInput = undefined;
    applyWormholeRunResult(runInput, result);
    window.setTimeout(showGalaxyMap, 0);
    return;
  }

  ui.showResult(result, "Fly Again");
});

installOddOrbitTestHooks({
  game,
  startRun,
  showGalaxyMap,
  getRunSnapshot: () => latestRunSnapshot,
  getLastRunResult: () => lastRunResult
});

window.addEventListener("beforeunload", () => {
  game.destroy(true);
});
