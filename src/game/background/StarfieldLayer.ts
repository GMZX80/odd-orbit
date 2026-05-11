import Phaser from "phaser";

interface StarfieldLayerOptions {
  count: number;
  color: number;
  alphaRange: [number, number];
  radiusRange: [number, number];
  speedRange: [number, number];
  streak: boolean;
}

interface Star {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  speed: number;
  drift: number;
}

export class StarfieldLayer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly stars: Star[];
  private readonly options: StarfieldLayerOptions;

  constructor(scene: Phaser.Scene, options: StarfieldLayerOptions, depth: number) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(depth);
    this.options = options;
    this.stars = Array.from({ length: options.count }, () => this.createStar(true));
  }

  update(deltaSeconds: number) {
    this.graphics.clear();

    for (const star of this.stars) {
      star.y += star.speed * deltaSeconds;
      star.x += star.drift * deltaSeconds;
      if (star.y > 744 || star.x < -30 || star.x > 420) {
        Object.assign(star, this.createStar(false));
      }

      this.graphics.fillStyle(this.options.color, star.alpha);
      if (this.options.streak) {
        this.graphics.fillRect(star.x, star.y, star.radius, star.radius * 8);
      } else {
        this.graphics.fillCircle(star.x, star.y, star.radius);
      }
    }
  }

  destroy() {
    this.graphics.destroy();
  }

  private createStar(anyY: boolean): Star {
    return {
      x: Phaser.Math.FloatBetween(0, 390),
      y: anyY ? Phaser.Math.FloatBetween(0, 720) : Phaser.Math.FloatBetween(-80, -8),
      radius: Phaser.Math.FloatBetween(this.options.radiusRange[0], this.options.radiusRange[1]),
      alpha: Phaser.Math.FloatBetween(this.options.alphaRange[0], this.options.alphaRange[1]),
      speed: Phaser.Math.FloatBetween(this.options.speedRange[0], this.options.speedRange[1]),
      drift: Phaser.Math.FloatBetween(-5, 5)
    };
  }
}
