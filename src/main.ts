import Phaser from "phaser";
import "./styles.css";
import { BootScene } from "./game/scenes/BootScene";
import { TravelScene } from "./game/scenes/TravelScene";
import { createDomUi } from "./game/ui/domUi";
import { gameEvents } from "./game/events";
import type { RunResult, RunStateSnapshot } from "./game/systems/runTypes";

const ui = createDomUi();

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
  scene: [BootScene, TravelScene]
});

function startRun() {
  ui.showHud();
  const travelScene = game.scene.getScene("TravelScene");
  if (travelScene.scene.isActive()) {
    travelScene.scene.restart({ idle: false });
    return;
  }
  game.scene.start("TravelScene", { idle: false });
}

ui.onStart(startRun);
ui.onRetry(startRun);

gameEvents.on("run:update", (snapshot: RunStateSnapshot) => {
  ui.renderHud(snapshot);
});

gameEvents.on("run:end", (result: RunResult) => {
  ui.showResult(result);
});

window.addEventListener("beforeunload", () => {
  game.destroy(true);
});
