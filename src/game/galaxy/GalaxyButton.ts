import Phaser from "phaser";

export type GalaxyButtonVariant = "primary" | "secondary" | "ghost";

export function drawBottomSheet(scene: Phaser.Scene, height: number, accent: number) {
  const top = 720 - height;
  const isRedeployPanel = height <= 220;
  const centerX = isRedeployPanel ? 235 : 195;
  const width = isRedeployPanel ? 298 : 366;
  scene.add.rectangle(centerX, top + height / 2, width, height - 10, 0x07131d, 0.92).setStrokeStyle(2.5, accent, 0.62).setDepth(58);
  scene.add.rectangle(centerX, top + 4, width - 42, 2, accent, 0.28).setDepth(59);
}

export function drawGalaxyButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  onClick: () => void,
  variant: GalaxyButtonVariant = "primary"
) {
  const fill = variant === "primary" ? 0x66f2a8 : variant === "secondary" ? 0x0a2031 : 0x111c26;
  const stroke = variant === "primary" ? 0x23945e : variant === "secondary" ? 0x315a77 : 0x6f7f8c;
  const textColor = variant === "primary" ? "#06111e" : variant === "secondary" ? "#7ee4ff" : "#d9edf5";
  const button = scene.add.rectangle(x + width / 2, y + height / 2, width, height, fill, variant === "primary" ? 0.95 : 0.82).setDepth(64);
  button.setStrokeStyle(2, stroke, 0.9).setInteractive({ useHandCursor: true });
  button.on("pointerdown", onClick);
  scene.add
    .text(x + width / 2, y + height / 2, label, {
      color: textColor,
      fontFamily: "Inter, sans-serif",
      fontSize: height > 36 ? "16px" : "14px",
      fontStyle: "900"
    })
    .setOrigin(0.5)
    .setDepth(65);
}
