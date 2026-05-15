import Phaser from "phaser";

interface WarpEffectOptions {
  scene: Phaser.Scene;
  playerContainer: Phaser.GameObjects.Container;
  target: Phaser.Math.Vector2;
  onComplete: () => void;
}

export function playWarpEffect(options: WarpEffectOptions) {
  const { scene, playerContainer, target, onComplete } = options;
  const streaks = scene.add.graphics();
  const flash = scene.add.circle(target.x, target.y, 22, 0xb9ffff, 0.28);
  const pullRing = scene.add.circle(target.x, target.y, 36, 0x6af6ff, 0);

  streaks.setDepth(930);
  flash.setDepth(925);
  pullRing.setDepth(924);
  pullRing.setStrokeStyle(3, 0xb9ffff, 0.68);

  scene.tweens.add({
    targets: playerContainer,
    x: target.x,
    y: target.y,
    scaleX: 0.06,
    scaleY: 0.06,
    alpha: 0,
    angle: playerContainer.angle + 160,
    duration: 920,
    ease: "Cubic.easeIn"
  });

  scene.tweens.add({
    targets: flash,
    scale: 5.8,
    alpha: 0,
    duration: 1220,
    ease: "Cubic.easeOut"
  });

  scene.tweens.add({
    targets: pullRing,
    scale: 3.2,
    alpha: 0,
    duration: 900,
    ease: "Sine.easeOut",
    onComplete: () => pullRing.destroy()
  });

  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 1320,
    ease: "Sine.easeInOut",
    onUpdate: (tween) => {
      const value = tween.getValue() ?? 0;
      drawStreaks(streaks, target, value);
    },
    onComplete: () => {
      streaks.destroy();
      flash.destroy();
    }
  });

  scene.time.delayedCall(700, () => {
    scene.cameras.main.flash(170, 126, 242, 255, false);
    scene.cameras.main.shake(150, 0.004);
  });

  scene.time.delayedCall(1380, onComplete);
}

function drawStreaks(graphics: Phaser.GameObjects.Graphics, target: Phaser.Math.Vector2, progress: number) {
  graphics.clear();
  const alpha = Math.sin(progress * Math.PI) * 0.72;
  const length = Phaser.Math.Linear(24, 240, progress);
  graphics.lineStyle(2, 0x9ef7ff, alpha);

  for (let index = 0; index < 34; index += 1) {
    const angle = index * 2.399963 + progress * 1.8;
    const inner = 14 + ((index * 19) % 52);
    const x1 = target.x + Math.cos(angle) * inner;
    const y1 = target.y + Math.sin(angle) * inner;
    const x2 = target.x + Math.cos(angle) * (inner + length);
    const y2 = target.y + Math.sin(angle) * (inner + length);
    graphics.lineBetween(x1, y1, x2, y2);
  }
}
