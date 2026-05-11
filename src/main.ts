import Phaser from "phaser";
import "./styles.css";
import { BootScene } from "./game/scenes/BootScene";
import { TravelScene } from "./game/scenes/TravelScene";
import { createGameDataService } from "./game/services/gameDataService";
import { createLocalStorageAdapter } from "./game/services/localStorageAdapter";
import { createMockAuthService } from "./game/services/authService";
import { createUserDataService } from "./game/services/userDataService";
import { createDomUi } from "./game/ui/domUi";
import { gameEvents } from "./game/events";
import type { RunResult, RunStateSnapshot } from "./game/systems/runTypes";

const storage = createLocalStorageAdapter("odd-orbit");
const authService = createMockAuthService();
const userDataService = createUserDataService(storage);
const gameDataService = createGameDataService(storage);
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

async function refreshProfile() {
  const player = await authService.getCurrentUser();
  const profile = await userDataService.getProfile(player.id);
  ui.renderProfile(profile);
}

function startRun() {
  ui.showHud();
  game.scene.stop("TravelScene");
  game.scene.start("TravelScene", {
    destination: "Cheese Minor",
    seed: Date.now()
  });
}

ui.onStart(startRun);
ui.onRetry(startRun);

gameEvents.on("run:update", (snapshot: RunStateSnapshot) => {
  ui.renderHud(snapshot);
});

gameEvents.on("run:event", (message: string) => {
  ui.flashEvent(message);
});

gameEvents.on("run:end", async (result: RunResult) => {
  const player = await authService.getCurrentUser();
  await userDataService.applyRunResult(player.id, result);
  await gameDataService.recordRun(player.id, result);
  ui.showResult(result);
  await refreshProfile();
});

refreshProfile();

window.addEventListener("beforeunload", () => {
  game.destroy(true);
});
