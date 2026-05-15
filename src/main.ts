import Phaser from "phaser";
import "./styles.css";
import { BootScene } from "./game/scenes/BootScene";
import { GalaxyMapScene } from "./game/scenes/GalaxyMapScene";
import { TravelScene } from "./game/scenes/TravelScene";
import { createDomUi } from "./game/ui/domUi";
import { gameEvents } from "./game/events";
import { applyWormholeRunResult } from "./game/systems/galaxyState";
import type { WormholeRunInput } from "./game/systems/galaxyTypes";
import type { RunResult, RunStateSnapshot } from "./game/systems/runTypes";

const ui = createDomUi();
let pendingRunInput: WormholeRunInput | undefined;

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
  ui.showHud();
  game.scene.stop("GalaxyMapScene");
  const travelScene = game.scene.getScene("TravelScene");
  if (travelScene.scene.isActive()) {
    travelScene.scene.restart({ idle: false, startingUnits, runInput });
    return;
  }
  game.scene.start("TravelScene", { idle: false, startingUnits, runInput });
}

function showGalaxyMap() {
  ui.showGalaxy();
  if (game.scene.isActive("TravelScene")) {
    game.scene.stop("TravelScene");
  }
  game.scene.start("GalaxyMapScene");
}

ui.onStart(showGalaxyMap);
ui.onRetry(() => {
  startRun();
});

ui.showGalaxy();

gameEvents.on<WormholeRunInput>("galaxy:start-run", (runInput) => {
  pendingRunInput = runInput;
  startRun(runInput.startingUnits, runInput);
});

gameEvents.on("run:update", (snapshot: RunStateSnapshot) => {
  ui.renderHud(snapshot);
});

gameEvents.on("run:damage", () => {
  ui.flashUnitDamage();
});

gameEvents.on("run:end", (result: RunResult) => {
  if (pendingRunInput) {
    const runInput = pendingRunInput;
    pendingRunInput = undefined;
    applyWormholeRunResult(runInput, result);
    window.setTimeout(showGalaxyMap, 0);
    return;
  }

  ui.showResult(result, "Fly Again");
});

window.addEventListener("beforeunload", () => {
  game.destroy(true);
});
