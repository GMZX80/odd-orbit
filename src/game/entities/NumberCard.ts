import Phaser from "phaser";

type ValueState = "negative" | "zero" | "positive";

interface GatePalette {
  glow: number;
  ring: number;
  core: number;
  accent: number;
  text: string;
  auraAlpha: number;
  coreAlpha: number;
}

interface NumberCardOptions {
  xOffset?: number;
  visualScale?: number;
  rotation?: number;
  ringThickness?: number;
  glowAlphaScale?: number;
  nodeScale?: number;
  important?: boolean;
}

const gatePalettes: Record<ValueState, GatePalette> = {
  negative: {
    glow: 0xff3f64,
    ring: 0xff795f,
    core: 0x7b1735,
    accent: 0xffb066,
    text: "#fff0ec",
    auraAlpha: 0.2,
    coreAlpha: 0.34
  },
  zero: {
    glow: 0xb8c4d6,
    ring: 0xd7dee8,
    core: 0x5f6b7a,
    accent: 0xf3f6ff,
    text: "#f5f8ff",
    auraAlpha: 0.12,
    coreAlpha: 0.24
  },
  positive: {
    glow: 0x30e5ff,
    ring: 0x7dffc4,
    core: 0x0f7a8d,
    accent: 0xb9ffe1,
    text: "#ecfffb",
    auraAlpha: 0.18,
    coreAlpha: 0.32
  }
};

export class NumberCard {
  readonly container: Phaser.GameObjects.Container;
  readonly lane: number;
  readonly xOffset: number;
  value: number;
  y: number;

  private readonly scene: Phaser.Scene;
  private readonly visualScale: number;
  private readonly decorativeAngle: number;
  private readonly ringThickness: number;
  private readonly glowAlphaScale: number;
  private readonly nodeScale: number;
  private readonly aura: Phaser.GameObjects.Arc;
  private readonly outerRing: Phaser.GameObjects.Arc;
  private readonly innerRing: Phaser.GameObjects.Arc;
  private readonly core: Phaser.GameObjects.Arc;
  private readonly leftPylon: Phaser.GameObjects.Polygon;
  private readonly rightPylon: Phaser.GameObjects.Polygon;
  private readonly topNode: Phaser.GameObjects.Arc;
  private readonly bottomNode: Phaser.GameObjects.Arc;
  private readonly hitFlash: Phaser.GameObjects.Arc;
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, lane: number, y: number, value: number, options: NumberCardOptions = {}) {
    this.scene = scene;
    this.lane = lane;
    this.xOffset = options.xOffset ?? 0;
    this.y = y;
    this.value = value;
    this.visualScale = options.visualScale ?? 1;
    this.decorativeAngle = options.rotation ?? 0;
    this.ringThickness = options.ringThickness ?? 4;
    this.glowAlphaScale = options.glowAlphaScale ?? 1;
    this.nodeScale = options.nodeScale ?? 1;
    this.container = scene.add.container(0, y);
    this.aura = scene.add.circle(0, 0, 48 * this.visualScale, 0xffffff, 0.1);
    this.outerRing = scene.add.circle(0, 0, 39 * this.visualScale, 0xffffff, 0.08);
    this.innerRing = scene.add.circle(0, 0, 28 * this.visualScale, 0xffffff, 0.05);
    this.core = scene.add.circle(0, 0, 18 * this.visualScale, 0xffffff, 0.25);
    this.leftPylon = scene.add.polygon(-43 * this.visualScale, 0, "-6 -17 8 -10 11 10 -5 17 -13 5 -13 -5", 0xffffff, 0.72);
    this.rightPylon = scene.add.polygon(43 * this.visualScale, 0, "6 -17 -8 -10 -11 10 5 17 13 5 13 -5", 0xffffff, 0.72);
    this.topNode = scene.add.circle(0, -39 * this.visualScale, 5 * this.nodeScale, 0xffffff, 0.72);
    this.bottomNode = scene.add.circle(0, 39 * this.visualScale, 5 * this.nodeScale, 0xffffff, 0.72);
    this.hitFlash = scene.add.circle(0, 0, 34 * this.visualScale, 0xffffff, 0);
    this.text = scene.add
      .text(0, 1, "", {
        color: "#ffffff",
        fontFamily: "Inter, sans-serif",
        fontSize: options.important ? "32px" : "30px",
        fontStyle: "900"
      })
      .setOrigin(0.5)
      .setStroke("#06111c", 7)
      .setShadow(0, 0, "#ffffff", 8, true, true);

    this.container.add([
      this.aura,
      this.leftPylon,
      this.rightPylon,
      this.outerRing,
      this.innerRing,
      this.core,
      this.topNode,
      this.bottomNode,
      this.hitFlash,
      this.text
    ]);
    this.container.setSize(96 * this.visualScale, 96 * this.visualScale);
    this.updateVisuals();
  }

  hit() {
    const previousState = this.stateForValue();
    this.value += 1;
    this.updateVisuals();
    this.playHitPulse(previousState !== this.stateForValue());
  }

  destroy() {
    this.container.destroy();
  }

  private stateForValue(): ValueState {
    if (this.value < 0) {
      return "negative";
    }
    if (this.value === 0) {
      return "zero";
    }
    return "positive";
  }

  private updateVisuals() {
    const state = this.stateForValue();
    const palette = gatePalettes[state];
    const unstableTilt = state === "negative" ? 5 : 0;

    this.aura.setFillStyle(palette.glow, palette.auraAlpha * this.glowAlphaScale);
    this.outerRing.setFillStyle(palette.glow, 0.08);
    this.outerRing.setStrokeStyle(this.ringThickness, palette.ring, state === "zero" ? 0.68 : 0.92);
    this.innerRing.setFillStyle(palette.core, palette.coreAlpha);
    this.innerRing.setStrokeStyle(2, palette.accent, state === "zero" ? 0.42 : 0.72);
    this.core.setFillStyle(palette.core, palette.coreAlpha + 0.1);
    this.core.setStrokeStyle(2, palette.accent, state === "negative" ? 0.54 : 0.8);
    this.leftPylon.setFillStyle(palette.core, 0.58);
    this.leftPylon.setStrokeStyle(2, palette.accent, 0.86);
    this.rightPylon.setFillStyle(palette.core, 0.58);
    this.rightPylon.setStrokeStyle(2, palette.accent, 0.86);
    this.topNode.setFillStyle(palette.accent, state === "zero" ? 0.46 : 0.76);
    this.bottomNode.setFillStyle(palette.accent, state === "zero" ? 0.46 : 0.76);
    this.hitFlash.setFillStyle(palette.accent, 1);

    this.outerRing.setAngle(this.decorativeAngle + (state === "negative" ? -unstableTilt : 0));
    this.innerRing.setAngle(-this.decorativeAngle + (state === "negative" ? unstableTilt : 0));
    this.leftPylon.setAngle(this.decorativeAngle * 0.4 + (state === "negative" ? -7 : -2));
    this.rightPylon.setAngle(this.decorativeAngle * 0.4 + (state === "negative" ? 7 : 2));
    this.topNode.setScale((state === "positive" ? 1.14 : 1) * this.nodeScale);
    this.bottomNode.setScale((state === "positive" ? 1.14 : 1) * this.nodeScale);

    this.text.setText(this.value > 0 ? `+${this.value}` : String(this.value));
    this.text.setColor(palette.text);
    this.text.setShadow(0, 0, palette.text, state === "negative" ? 5 : 9, true, true);
  }

  private playHitPulse(changedState: boolean) {
    this.scene.tweens.killTweensOf([this.aura, this.outerRing, this.innerRing, this.core, this.hitFlash]);
    this.hitFlash.setAlpha(changedState ? 0.68 : 0.42);
    this.hitFlash.setScale(0.46);
    this.outerRing.setScale(changedState ? 1.16 : 1.08);
    this.innerRing.setScale(changedState ? 1.12 : 1.06);
    this.core.setScale(1.12);

    this.scene.tweens.add({
      targets: this.hitFlash,
      alpha: 0,
      scale: changedState ? 1.55 : 1.25,
      duration: changedState ? 180 : 110,
      ease: "Quad.easeOut"
    });

    this.scene.tweens.add({
      targets: [this.aura, this.outerRing, this.innerRing, this.core],
      scale: 1,
      duration: changedState ? 150 : 95,
      ease: "Back.easeOut"
    });
  }
}
