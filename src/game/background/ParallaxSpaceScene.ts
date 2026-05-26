import Phaser from "phaser";
import { SpaceObjectSpawner } from "./SpaceObjectSpawner";
import { StarfieldLayer } from "./StarfieldLayer";

export class ParallaxSpaceScene {
  private readonly scene: Phaser.Scene;
  private readonly backdrops: Phaser.GameObjects.Rectangle[];
  private readonly layers: StarfieldLayer[];
  private readonly objects: SpaceObjectSpawner;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.backdrops = [
      this.scene.add.rectangle(195, 360, 390, 720, 0x081426).setDepth(-10),
      this.scene.add.rectangle(195, 420, 390, 600, 0x142349, 0.54).setDepth(-9)
    ];
    this.layers = [
      new StarfieldLayer(scene, { count: 72, color: 0xc9ddff, alphaRange: [0.12, 0.38], radiusRange: [0.7, 1.4], speedRange: [8, 18], streak: false }, -8),
      new StarfieldLayer(scene, { count: 52, color: 0xe8f7ff, alphaRange: [0.2, 0.58], radiusRange: [1, 2.1], speedRange: [28, 58], streak: false }, -6),
      new StarfieldLayer(scene, { count: 36, color: 0x9fe8ff, alphaRange: [0.24, 0.72], radiusRange: [1.2, 2.4], speedRange: [96, 170], streak: true }, -5)
    ];
    this.objects = new SpaceObjectSpawner(scene);
  }

  update(deltaSeconds: number) {
    for (const layer of this.layers) {
      layer.update(deltaSeconds);
    }
    this.objects.update(deltaSeconds);
  }

  destroy() {
    for (const backdrop of this.backdrops) {
      backdrop.destroy();
    }
    for (const layer of this.layers) {
      layer.destroy();
    }
    this.objects.destroy();
  }
}
