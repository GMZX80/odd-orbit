import Phaser from "phaser";

const visibleUnitCap = 60;
const visibleShooterCap = 20;
const extraVisualDotCap = 160;
const maxDistanceFromCenter = 64;

interface SwarmUnit {
  sprite: Phaser.GameObjects.Arc;
  formation: Phaser.Math.Vector2;
  position: Phaser.Math.Vector2;
  seed: number;
  baseAngle: number;
  phaseOffset: number;
  orbitSpeed: number;
  orbitRadiusX: number;
  orbitRadiusY: number;
  followStrength: number;
  direction: 1 | -1;
  nextDirectionChangeAt: number;
  nextFireAt: number;
}

export interface ShooterPosition {
  x: number;
  y: number;
}

export class PlayerSwarm {
  readonly container: Phaser.GameObjects.Container;
  units = 1;

  private readonly scene: Phaser.Scene;
  private readonly swarmUnits: SwarmUnit[];
  private readonly extraSwarmGraphics: Phaser.GameObjects.Graphics;
  private lastCenterX: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.container = scene.add.container(x, y);
    this.swarmUnits = [];
    this.extraSwarmGraphics = scene.add.graphics();
    this.container.add(this.extraSwarmGraphics);
    this.lastCenterX = x;
    this.setUnits(1);
  }

  setUnits(units: number) {
    this.units = units;
    this.syncVisibleUnits();
  }

  update(timeMs: number) {
    const centerDeltaX = this.container.x - this.lastCenterX;
    this.lastCenterX = this.container.x;
    const densityScale = this.densityScale();

    for (let index = 0; index < this.swarmUnits.length; index += 1) {
      const unit = this.swarmUnits[index];
      if (timeMs >= unit.nextDirectionChangeAt) {
        unit.direction = unit.direction === 1 ? -1 : 1;
        unit.nextDirectionChangeAt = timeMs + 1800 + ((unit.seed * 1309) % 3600);
      }

      const time = timeMs / 1000;
      const angle = unit.baseAngle + time * unit.orbitSpeed * unit.direction + unit.phaseOffset;
      const orbit = new Phaser.Math.Vector2(Math.cos(angle) * unit.orbitRadiusX, Math.sin(angle) * unit.orbitRadiusY);
      const target = unit.formation.clone().scale(densityScale).add(orbit);
      target.limit(maxDistanceFromCenter);

      unit.position.x -= centerDeltaX * 0.22;
      unit.position.x += (target.x - unit.position.x) * unit.followStrength;
      unit.position.y += (target.y - unit.position.y) * unit.followStrength;
      unit.position.limit(maxDistanceFromCenter);

      unit.sprite.setPosition(unit.position.x, unit.position.y);
      unit.sprite.setDepth(index);
    }

    this.renderExtraSwarmLayer(timeMs);
  }

  readyShooters(timeMs: number): ShooterPosition[] {
    const shooters = this.swarmUnits.slice(0, Math.min(this.units, visibleShooterCap));
    const ready: ShooterPosition[] = [];

    for (const unit of shooters) {
      if (timeMs < unit.nextFireAt) {
        continue;
      }

      ready.push({
        x: this.container.x + unit.position.x,
        y: this.container.y + unit.position.y - 10
      });

      const cadenceBonus = Math.min(this.units, visibleShooterCap) * 3;
      unit.nextFireAt = timeMs + 420 - cadenceBonus + ((unit.seed * 97) % 90);
    }

    return ready;
  }

  visibleUnits() {
    return Math.min(Math.max(this.units, 0), visibleUnitCap);
  }

  private syncVisibleUnits() {
    const count = this.visibleUnits();
    const formations = this.layoutOffsets(count);

    while (this.swarmUnits.length < count) {
      const index = this.swarmUnits.length;
      const sprite = this.scene.add.circle(0, 0, 5.6, 0xe7fbff, 0.94);
      sprite.setStrokeStyle(1.6, 0x43c7ff, 1);
      this.container.add(sprite);

      const formation = formations[index] ?? new Phaser.Math.Vector2(0, 0);
      const seed = index * 2.173 + 0.41;
      const radiusVariance = (index * 37) % 100;
      this.swarmUnits.push({
        sprite,
        formation: formation.clone(),
        position: formation.clone().scale(0.62),
        seed,
        baseAngle: index * 2.399963,
        phaseOffset: seed * 1.31,
        orbitSpeed: 0.8 + (radiusVariance / 100) * 1,
        orbitRadiusX: 3 + ((index * 11) % 16),
        orbitRadiusY: 3 + ((index * 7) % 12),
        followStrength: 0.08 + (((index * 13) % 100) / 100) * 0.1,
        direction: index % 2 === 0 ? 1 : -1,
        nextDirectionChangeAt: this.scene.time.now + 1600 + ((seed * 997) % 4200),
        nextFireAt: this.scene.time.now + 120 + index * 44
      });
    }

    while (this.swarmUnits.length > count) {
      this.swarmUnits.pop()?.sprite.destroy();
    }

    for (let index = 0; index < this.swarmUnits.length; index += 1) {
      this.swarmUnits[index].formation = formations[index];
      this.swarmUnits[index].sprite.setScale(Phaser.Math.Linear(0.92, 0.72, Math.min(1, count / visibleUnitCap)));
    }
  }

  private densityScale() {
    return Phaser.Math.Linear(0.82, 1.24, Math.min(1, this.visibleUnits() / visibleUnitCap));
  }

  private renderExtraSwarmLayer(timeMs: number) {
    const extraUnits = Math.max(0, this.units - visibleUnitCap);
    this.extraSwarmGraphics.clear();

    if (extraUnits <= 0) {
      return;
    }

    const time = timeMs / 1000;
    const visualDots = Math.min(extraVisualDotCap, Math.ceil(extraUnits * 0.45));
    const massProgress = Math.min(1, extraUnits / 260);
    const radiusX = Phaser.Math.Linear(42, 82, massProgress);
    const radiusY = Phaser.Math.Linear(28, 54, massProgress);

    this.extraSwarmGraphics.fillStyle(0x3aa8ff, Phaser.Math.Linear(0.1, 0.18, massProgress));
    this.extraSwarmGraphics.fillEllipse(0, -16, radiusX * 2.1, radiusY * 1.7);

    for (let index = 0; index < visualDots; index += 1) {
      const seed = index * 12.9898;
      const angle = index * 2.399963 + Math.sin(time * 0.32 + seed) * 0.18;
      const ring = Math.sqrt((index + 1) / visualDots);
      const wobble = Math.sin(time * (0.55 + (index % 7) * 0.05) + seed) * 4;
      const x = Math.cos(angle + time * 0.18 * (index % 2 === 0 ? 1 : -1)) * (radiusX * ring + wobble);
      const y = -12 + Math.sin(angle) * (radiusY * ring) + Math.cos(time * 0.7 + seed) * 3;
      const alpha = 0.22 + ((index * 17) % 40) / 100;
      const size = 1.6 + ((index * 11) % 15) / 10;

      this.extraSwarmGraphics.fillStyle(0x9fe8ff, alpha);
      this.extraSwarmGraphics.fillCircle(x, y, size);
    }
  }

  private layoutOffsets(count: number) {
    const offsets: Phaser.Math.Vector2[] = [];
    const spacing = Phaser.Math.Linear(12, 9, Math.min(1, count / visibleUnitCap));

    for (let index = 0; index < count; index += 1) {
      if (index === 0) {
        offsets.push(new Phaser.Math.Vector2(0, 0));
        continue;
      }

      const angle = index * 2.399963;
      const radius = Math.min(42, Math.sqrt(index) * spacing);
      offsets.push(new Phaser.Math.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.82));
    }

    return offsets;
  }
}
