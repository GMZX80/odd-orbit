import Phaser from "phaser";

export type GalaxyCommandVariant = "primary" | "secondary" | "neutral" | "disabled";

export interface DrawGalaxyCommandNodeOptions {
  scene: Phaser.Scene;
  x: number;
  y: number;
  radius: number;
  label: string;
  subLabel?: string;
  variant?: GalaxyCommandVariant;
  enabled?: boolean;
  depth?: number;
  onActivate: () => void;
}

export interface DrawGalaxyCommandPadOptions {
  scene: Phaser.Scene;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  variant?: GalaxyCommandVariant;
  enabled?: boolean;
  depth?: number;
  onActivate: () => void;
}

export interface DrawGalaxyCommandTrayOptions {
  scene: Phaser.Scene;
  x: number;
  y: number;
  width: number;
  height: number;
  accent: number;
  depth?: number;
}

export const GALAXY_COMMAND_TRAY_DEPTH = 58;
export const GALAXY_COMMAND_NODE_DEPTH = 88;
export const GALAXY_COMMAND_MAP_LEFT = 78;
export const GALAXY_COMMAND_MAP_RIGHT = 390;
export const GALAXY_COMMAND_MAP_CENTER_X = GALAXY_COMMAND_MAP_LEFT + (GALAXY_COMMAND_MAP_RIGHT - GALAXY_COMMAND_MAP_LEFT) / 2;
export const GALAXY_COMMAND_BOTTOM_Y = 654;
export const GALAXY_COMMAND_PHASE_RADIUS = 44;

const COMMAND_BOTTOM_MARGIN = 22;
const TRAY_FILL = 0x07131d;
const TRAY_ALPHA = 0.76;

export function drawGalaxyCommandTray(options: DrawGalaxyCommandTrayOptions) {
  const depth = options.depth ?? GALAXY_COMMAND_TRAY_DEPTH;
  const tray = options.scene.add.graphics().setDepth(depth);
  tray.fillStyle(TRAY_FILL, TRAY_ALPHA);
  tray.fillRoundedRect(options.x, options.y, options.width, options.height, 8);
  tray.lineStyle(2, options.accent, 0.24);
  tray.strokeRoundedRect(options.x, options.y, options.width, options.height, 8);
  tray.lineStyle(2, options.accent, 0.16);
  tray.beginPath();
  tray.moveTo(options.x + 26, options.y + 7);
  tray.lineTo(options.x + options.width - 26, options.y + 7);
  tray.strokePath();
  return [tray];
}

export function drawGalaxyCommandNode(options: DrawGalaxyCommandNodeOptions) {
  const enabled = options.enabled ?? true;
  const variant = enabled ? options.variant ?? "primary" : "disabled";
  const style = commandStyle(variant);
  const depth = options.depth ?? GALAXY_COMMAND_NODE_DEPTH;
  const hitRadius = options.radius + 8;
  const objects: Phaser.GameObjects.GameObject[] = [];

  const glow = options.scene.add.circle(options.x, options.y, options.radius + 10, style.ring, enabled ? 0.14 : 0.05).setDepth(depth);
  const outerRing = options.scene.add
    .circle(options.x, options.y, options.radius + 4, 0x07131d, 0.82)
    .setStrokeStyle(3, style.ring, enabled ? 0.58 : 0.24)
    .setDepth(depth + 1);
  const body = options.scene.add
    .circle(options.x, options.y, options.radius, style.fill, style.alpha)
    .setStrokeStyle(3, style.stroke, enabled ? 0.95 : 0.36)
    .setDepth(depth + 2);
  const innerRing = options.scene.add
    .circle(options.x, options.y, Math.max(12, options.radius - 9), 0xffffff, 0)
    .setStrokeStyle(1.5, style.highlight, enabled ? 0.42 : 0.14)
    .setDepth(depth + 3);
  const textY = options.subLabel ? options.y - 5 : options.y;
  const label = options.scene.add
    .text(options.x, textY, options.label, {
      color: style.text,
      fontFamily: "Inter, sans-serif",
      fontSize: `${options.subLabel ? 13 : 15}px`,
      fontStyle: "900",
      align: "center"
    })
    .setOrigin(0.5)
    .setDepth(depth + 5);
  objects.push(glow, outerRing, body, innerRing, label);

  if (options.subLabel) {
    objects.push(
      options.scene.add
        .text(options.x, options.y + 12, options.subLabel, {
          color: style.subText,
          fontFamily: "Inter, sans-serif",
          fontSize: "11px",
          fontStyle: "900",
          align: "center"
        })
        .setOrigin(0.5)
        .setDepth(depth + 5)
    );
  }

  for (const side of [-1, 1]) {
    objects.push(options.scene.add.circle(options.x + side * (options.radius + 7), options.y - 2, 3.2, style.ring, enabled ? 0.92 : 0.22).setDepth(depth + 4));
  }

  if (!enabled) {
    return objects;
  }

  let pressed = false;
  let fired = false;
  const feedbackObjects = [...objects];
  const hitTarget = options.scene.add.circle(options.x, options.y, hitRadius, 0xffffff, 0.001).setDepth(depth + 6);
  hitTarget.setInteractive({ useHandCursor: true });
  hitTarget.on("pointerdown", () => {
    pressed = true;
    fired = false;
    setNodePressed(feedbackObjects, body, outerRing, true, style);
  });
  hitTarget.on("pointerout", () => setNodePressed(feedbackObjects, body, outerRing, false, style));
  hitTarget.on("pointerover", () => {
    if (pressed) {
      setNodePressed(feedbackObjects, body, outerRing, true, style);
    }
  });
  hitTarget.on("pointerupoutside", () => {
    pressed = false;
    setNodePressed(feedbackObjects, body, outerRing, false, style);
  });
  hitTarget.on("pointerup", () => {
    if (!pressed || fired) {
      pressed = false;
      setNodePressed(feedbackObjects, body, outerRing, false, style);
      return;
    }
    fired = true;
    pressed = false;
    setNodePressed(feedbackObjects, body, outerRing, false, style);
    options.onActivate();
  });
  objects.push(hitTarget);

  return objects;
}

export function drawGalaxyCommandPad(options: DrawGalaxyCommandPadOptions) {
  const enabled = options.enabled ?? true;
  const variant = enabled ? options.variant ?? "primary" : "disabled";
  const style = commandStyle(variant);
  const depth = options.depth ?? GALAXY_COMMAND_NODE_DEPTH;
  const radius = Math.min(10, options.height / 2);
  const hitPad = 6;
  const body = options.scene.add.graphics().setDepth(depth);
  const label = options.scene.add
    .text(options.x, options.y, options.label, {
      color: style.text,
      fontFamily: "Inter, sans-serif",
      fontSize: `${options.label.length <= 2 ? 20 : 14}px`,
      fontStyle: "900",
      align: "center"
    })
    .setOrigin(0.5)
    .setStroke(variant === "primary" ? "#dfffee" : "#06111e", variant === "primary" ? 0 : 2)
    .setDepth(depth + 2);
  const objects: Phaser.GameObjects.GameObject[] = [body, label];

  drawPadBody(body, options.x, options.y, options.width, options.height, radius, style, enabled, false);

  if (!enabled) {
    return objects;
  }

  let pressed = false;
  let fired = false;
  const hitTarget = options.scene.add
    .rectangle(options.x, options.y, options.width + hitPad * 2, options.height + hitPad * 2, 0xffffff, 0.001)
    .setDepth(depth + 3);
  hitTarget.setInteractive({ useHandCursor: true });
  hitTarget.on("pointerdown", () => {
    pressed = true;
    fired = false;
    label.setScale(0.98);
    drawPadBody(body, options.x, options.y, options.width, options.height, radius, style, enabled, true);
  });
  hitTarget.on("pointerout", () => {
    label.setScale(1);
    drawPadBody(body, options.x, options.y, options.width, options.height, radius, style, enabled, false);
  });
  hitTarget.on("pointerover", () => {
    if (pressed) {
      label.setScale(0.98);
      drawPadBody(body, options.x, options.y, options.width, options.height, radius, style, enabled, true);
    }
  });
  hitTarget.on("pointerupoutside", () => {
    pressed = false;
    label.setScale(1);
    drawPadBody(body, options.x, options.y, options.width, options.height, radius, style, enabled, false);
  });
  hitTarget.on("pointerup", () => {
    if (!pressed || fired) {
      pressed = false;
      label.setScale(1);
      drawPadBody(body, options.x, options.y, options.width, options.height, radius, style, enabled, false);
      return;
    }
    fired = true;
    pressed = false;
    label.setScale(1);
    drawPadBody(body, options.x, options.y, options.width, options.height, radius, style, enabled, false);
    options.onActivate();
  });
  objects.push(hitTarget);

  return objects;
}

export function drawGalaxyPhaseCommand(scene: Phaser.Scene, label: string, onActivate: () => void) {
  const { line1, line2 } = splitCommandLabel(label);
  return drawGalaxyCommandNode({
    scene,
    x: GALAXY_COMMAND_MAP_CENTER_X,
    y: Math.min(GALAXY_COMMAND_BOTTOM_Y, 720 - COMMAND_BOTTOM_MARGIN - GALAXY_COMMAND_PHASE_RADIUS),
    radius: GALAXY_COMMAND_PHASE_RADIUS,
    label: line1,
    subLabel: line2,
    variant: "primary",
    depth: GALAXY_COMMAND_NODE_DEPTH,
    onActivate
  });
}

function splitCommandLabel(label: string) {
  const words = label.split(" ");
  if (words.length <= 1) {
    return { line1: label };
  }
  return {
    line1: words[0],
    line2: words.slice(1).join(" ")
  };
}

function setNodePressed(
  objects: Phaser.GameObjects.GameObject[],
  body: Phaser.GameObjects.Arc,
  outerRing: Phaser.GameObjects.Arc,
  isPressed: boolean,
  style: ReturnType<typeof commandStyle>
) {
  const scale = isPressed ? 0.95 : 1;
  for (const object of objects) {
    (object as Phaser.GameObjects.GameObject & { setScale: (scale: number) => void }).setScale(scale);
  }
  body.setFillStyle(isPressed ? style.pressedFill : style.fill, style.alpha);
  outerRing.setStrokeStyle(isPressed ? 4 : 3, style.ring, isPressed ? 0.86 : 0.58);
}

function drawPadBody(
  body: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  style: ReturnType<typeof commandStyle>,
  enabled: boolean,
  isPressed: boolean
) {
  body.clear();
  body.fillStyle(style.ring, enabled ? (isPressed ? 0.2 : 0.1) : 0.04);
  body.fillRoundedRect(x - width / 2 - 4, y - height / 2 - 4, width + 8, height + 8, radius + 3);
  body.fillStyle(isPressed ? style.pressedFill : style.fill, style.alpha);
  body.fillRoundedRect(x - width / 2, y - height / 2, width, height, radius);
  body.lineStyle(isPressed ? 3 : 2, style.stroke, enabled ? 0.92 : 0.34);
  body.strokeRoundedRect(x - width / 2, y - height / 2, width, height, radius);
  body.lineStyle(1, style.highlight, enabled ? 0.3 : 0.1);
  body.beginPath();
  body.moveTo(x - width / 2 + 12, y - height / 2 + 6);
  body.lineTo(x + width / 2 - 12, y - height / 2 + 6);
  body.strokePath();
}

function commandStyle(variant: GalaxyCommandVariant) {
  switch (variant) {
    case "primary":
      return {
        fill: 0x66f2a8,
        pressedFill: 0x43d489,
        stroke: 0x23945e,
        ring: 0x66f2a8,
        highlight: 0xe7fff2,
        text: "#06111e",
        subText: "#123423",
        alpha: 0.96
      };
    case "secondary":
      return {
        fill: 0x0a2031,
        pressedFill: 0x0f344f,
        stroke: 0x45a6d8,
        ring: 0x7ee4ff,
        highlight: 0xcdf7ff,
        text: "#d9f7ff",
        subText: "#7ee4ff",
        alpha: 0.9
      };
    case "neutral":
      return {
        fill: 0x111c26,
        pressedFill: 0x192a36,
        stroke: 0x6f7f8c,
        ring: 0x9fb7c7,
        highlight: 0xe5f2ff,
        text: "#f7fbff",
        subText: "#b8ccd8",
        alpha: 0.88
      };
    case "disabled":
    default:
      return {
        fill: 0x17212b,
        pressedFill: 0x17212b,
        stroke: 0x3d5362,
        ring: 0x5d7280,
        highlight: 0x8da2b5,
        text: "#8da2b5",
        subText: "#718697",
        alpha: 0.48
      };
  }
}
