import Phaser from "phaser";

const cardColors = {
  negative: 0xd84b5b,
  zero: 0x9ba0ac,
  positive: 0x39b8e8
};

export class NumberCard {
  readonly container: Phaser.GameObjects.Container;
  readonly lane: number;
  value: number;
  y: number;

  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly shine: Phaser.GameObjects.Rectangle;
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, lane: number, y: number, value: number) {
    this.lane = lane;
    this.y = y;
    this.value = value;
    this.container = scene.add.container(0, y);
    this.panel = scene.add.rectangle(0, 0, 92, 62, 0xffffff, 1);
    this.shine = scene.add.rectangle(0, -18, 82, 13, 0xffffff, 0.22);
    this.text = scene.add
      .text(0, 2, "", {
        color: "#ffffff",
        fontFamily: "Inter, sans-serif",
        fontSize: "28px",
        fontStyle: "900"
      })
      .setOrigin(0.5);

    this.container.add([this.panel, this.shine, this.text]);
    this.container.setSize(92, 62);
    this.updateVisuals();
  }

  hit() {
    this.value += 1;
    this.updateVisuals();
  }

  destroy() {
    this.container.destroy();
  }

  private updateVisuals() {
    const color = this.value < 0 ? cardColors.negative : this.value === 0 ? cardColors.zero : cardColors.positive;
    this.panel.setFillStyle(color, 1);
    this.panel.setStrokeStyle(5, this.value > 0 ? 0x8affc5 : this.value < 0 ? 0xffa093 : 0xd8dde8, 1);
    this.text.setText(this.value > 0 ? `+${this.value}` : String(this.value));
  }
}
