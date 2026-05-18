import Phaser from "phaser";
import type { getGalaxySnapshot } from "../systems/galaxyState";

type GalaxySnapshot = ReturnType<typeof getGalaxySnapshot>;
type PhaseStepState = "complete" | "active" | "upcoming";

export function drawPhaseHud(scene: Phaser.Scene, snapshot: GalaxySnapshot) {
  scene.add.rectangle(39, 360, 78, 720, 0x03101b, 0.66).setStrokeStyle(1.2, 0x315a77, 0.58).setDepth(45);
  scene.add
    .text(39, 34, `TURN ${snapshot.turnNumber}`, {
      color: "#7ee4ff",
      fontFamily: "Inter, sans-serif",
      fontSize: "10px",
      fontStyle: "900"
    })
    .setOrigin(0.5)
    .setDepth(51);

  scene.add.line(0, 0, 39, 126, 39, 544, 0x5da8ff, 0.32).setOrigin(0, 0).setLineWidth(2).setDepth(46);
  drawPhaseStep(scene, 1, 39, 118, "Add", "Bonus", phaseStepState(snapshot, 1));
  drawPhaseStep(scene, 2, 39, 252, "Redeploy", "", phaseStepState(snapshot, 2));
  drawPhaseStep(scene, 3, 39, 386, "Attack", "", phaseStepState(snapshot, 3));
  drawPhaseStep(scene, 4, 39, 520, "Enemy", "Moves", phaseStepState(snapshot, 4));
}

function phaseStepState(snapshot: GalaxySnapshot, step: number): PhaseStepState {
  switch (snapshot.turnPhase) {
    case "deploy":
      return step === 1 ? "active" : "upcoming";
    case "fortify":
      return step === 1 ? "complete" : step === 2 ? "active" : "upcoming";
    case "command":
      return step < 3 ? "complete" : step === 3 ? "active" : "upcoming";
    case "npcTurn":
      return step < 4 ? "complete" : step === 4 ? "active" : "upcoming";
    case "gameOver":
      return "complete";
  }
}

function drawPhaseStep(scene: Phaser.Scene, step: number, x: number, y: number, line1: string, line2: string, state: PhaseStepState) {
  const color = state === "complete" ? 0x66f2a8 : state === "active" ? 0xffd45f : 0x8da2b5;
  const alpha = state === "upcoming" ? 0.42 : 0.92;
  const radius = state === "active" ? 25 : 19;
  scene.add.circle(x, y, radius + 8, color, state === "active" ? 0.13 : 0.07).setStrokeStyle(state === "active" ? 3 : 2, color, alpha * 0.45).setDepth(48);
  scene.add.circle(x, y, radius, 0x07131d, 0.9).setStrokeStyle(state === "active" ? 4 : 2.4, color, alpha).setDepth(49);
  scene.add
    .text(x, y, state === "complete" ? "✓" : String(step), {
      color: state === "upcoming" ? "#9fb7c7" : "#f7fbff",
      fontFamily: "Inter, sans-serif",
      fontSize: state === "active" ? "22px" : "16px",
      fontStyle: "900"
    })
    .setOrigin(0.5)
    .setDepth(50);
  scene.add
    .text(x, y + radius + 17, line2 ? `${line1}\n${line2}` : line1, {
      color: state === "active" ? "#ffe66f" : state === "complete" ? "#c7f7dd" : "#9fb7c7",
      fontFamily: "Inter, sans-serif",
      fontSize: state === "active" ? "16px" : "9px",
      fontStyle: "900",
      align: "center",
      lineSpacing: 1
    })
    .setOrigin(0.5, 0)
    .setDepth(50);
}
