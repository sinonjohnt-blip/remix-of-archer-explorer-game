import { useEffect, useRef } from "react";
import Phaser from "phaser";

interface ArrowProjectile {
  sprite: Phaser.GameObjects.Sprite;
  vx: number;
  vy: number;
  gravity: number;
  damage: number;
  targetArcher: ArcherData;
}

interface ArcherData {
  sprite: Phaser.GameObjects.Sprite;
  hp: number;
  maxHp: number;
  displayHp: number;
  damage: number;
  attackRange: number;
  dead: boolean;
  attacking: boolean;
  direction: number;
  hpBar: Phaser.GameObjects.Graphics;
  teamColor: number;
}

class MainScene extends Phaser.Scene {
  private teamBlue: ArcherData[] = [];
  private teamRed: ArcherData[] = [];
  private arrows: ArrowProjectile[] = [];

  constructor() {
    super("MainScene");
  }

  preload() {
    this.load.spritesheet("idle", "/assets/Archer_Idle.png", {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet("run", "/assets/Archer_Run.png", {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet("shoot", "/assets/Archer_Shoot.png", {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.image("arrow", "/assets/Arrow.png");
  }

  create() {
    this.arrows = [];
    this.teamBlue = [];
    this.teamRed = [];

    if (!this.anims.exists("archer-idle")) {
      this.anims.create({
        key: "archer-idle",
        frames: this.anims.generateFrameNumbers("idle", { start: 0, end: 5 }),
        frameRate: 8,
        repeat: -1,
      });
      this.anims.create({
        key: "archer-run",
        frames: this.anims.generateFrameNumbers("run", { start: 0, end: 3 }),
        frameRate: 8,
        repeat: -1,
      });
      this.anims.create({
        key: "archer-shoot",
        frames: this.anims.generateFrameNumbers("shoot", { start: 0, end: 7 }),
        frameRate: 8,
        repeat: 0,
      });
    }

    const unitCount = 4;
    const startYBase = 300;
    const ySpacing = 70;

    // Spawn blue team (left)
    for (let i = 0; i < unitCount; i++) {
      const y = startYBase + i * ySpacing;
      const archer = this.createArcher(60 + Math.random() * 30, y, 1, false, 0x3399ff, 15);
      this.teamBlue.push(archer);
    }

    // Spawn red team (right)
    for (let i = 0; i < unitCount; i++) {
      const y = startYBase + i * ySpacing;
      const archer = this.createArcher(700 + Math.random() * 30, y, -1, true, 0xff4455, 12);
      this.teamRed.push(archer);
    }
  }

  createArcher(x: number, y: number, direction: number, flipX: boolean, teamColor: number, damage: number): ArcherData {
    const sprite = this.add.sprite(x, y, "idle");
    sprite.setScale(1.2);
    sprite.setFlipX(flipX);
    sprite.play("archer-run");

    const archer: ArcherData = {
      sprite,
      hp: 100,
      maxHp: 100,
      displayHp: 100,
      damage,
      attackRange: 500,
      dead: false,
      attacking: false,
      direction,
      hpBar: this.add.graphics(),
      teamColor,
    };

    // On shoot complete, fire arrow and continue if target alive
    sprite.on("animationcomplete-archer-shoot", () => {
      if (archer.dead) return;
      const enemies = direction === 1 ? this.teamRed : this.teamBlue;
      const target = this.findNearestAlive(archer, enemies);
      if (target) {
        this.spawnArrow(archer, target);
        const dist = Phaser.Math.Distance.Between(archer.sprite.x, archer.sprite.y, target.sprite.x, target.sprite.y);
        if (dist < archer.attackRange) {
          sprite.play("archer-shoot");
        } else {
          archer.attacking = false;
        }
      } else {
        archer.attacking = false;
      }
    });

    this.drawHpBar(archer);
    return archer;
  }

  findNearestAlive(unit: ArcherData, enemies: ArcherData[]): ArcherData | null {
    let nearest: ArcherData | null = null;
    let minDist = Infinity;
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const d = Phaser.Math.Distance.Between(unit.sprite.x, unit.sprite.y, enemy.sprite.x, enemy.sprite.y);
      if (d < minDist) {
        minDist = d;
        nearest = enemy;
      }
    }
    return nearest;
  }

  spawnArrow(attacker: ArcherData, target: ArcherData) {
    const arrowSprite = this.add.sprite(attacker.sprite.x, attacker.sprite.y - 50, "arrow");
    arrowSprite.setScale(0.8);

    const targetX = target.sprite.x;
    const targetY = target.sprite.y - 20;
    const dx = targetX - arrowSprite.x;
    const dy = targetY - arrowSprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const gravity = 400;
    const flightTime = Math.max(dist / 250, 0.3);
    const vx = dx / flightTime;
    const vy = dy / flightTime - (gravity * flightTime) / 2;

    arrowSprite.setRotation(Math.atan2(vy, vx));
    if (dx < 0) arrowSprite.setFlipY(true);

    this.arrows.push({
      sprite: arrowSprite,
      vx,
      vy,
      gravity,
      damage: attacker.damage,
      targetArcher: target,
    });
  }

  applyDeath(archer: ArcherData) {
    archer.dead = true;
    archer.sprite.stop();
    archer.sprite.setTint(0xff4444);
    this.tweens.add({
      targets: archer.sprite,
      alpha: 0,
      duration: 600,
      onComplete: () => {
        archer.sprite.setVisible(false);
        archer.hpBar.clear();
      },
    });
  }

  applyHitFeedback(archer: ArcherData, arrowVx: number) {
    archer.sprite.setTint(0xffffff);
    this.time.delayedCall(120, () => {
      if (!archer.dead) archer.sprite.clearTint();
    });

    const knockbackDir = arrowVx > 0 ? 1 : -1;
    const originalX = archer.sprite.x;
    this.tweens.add({
      targets: archer.sprite,
      x: originalX + knockbackDir * 8,
      duration: 60,
      yoyo: true,
      ease: "Power1",
    });

    const originalY = archer.sprite.y;
    this.tweens.add({
      targets: archer.sprite,
      y: originalY - 3,
      duration: 40,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
  }

  drawHpBar(archer: ArcherData) {
    archer.displayHp += (archer.hp - archer.displayHp) * 0.08;
    if (Math.abs(archer.displayHp - archer.hp) < 0.5) archer.displayHp = archer.hp;

    const g = archer.hpBar;
    g.clear();
    const barWidth = 50;
    const barHeight = 5;
    const x = archer.sprite.x - barWidth / 2;
    const y = archer.sprite.y - 90;

    g.fillStyle(0x1a1a2e, 0.9);
    g.fillRoundedRect(x - 1, y - 1, barWidth + 2, barHeight + 2, 2);

    g.fillStyle(0x333344, 1);
    g.fillRoundedRect(x, y, barWidth, barHeight, 2);

    const displayRatio = archer.displayHp / archer.maxHp;
    const actualRatio = archer.hp / archer.maxHp;
    if (displayRatio > actualRatio) {
      g.fillStyle(0x994444, 0.6);
      g.fillRoundedRect(x, y, barWidth * displayRatio, barHeight, 2);
    }

    g.fillStyle(archer.teamColor, 1);
    g.fillRoundedRect(x, y, barWidth * actualRatio, barHeight, 2);

    g.fillStyle(0xffffff, 0.15);
    g.fillRect(x + 1, y, Math.max(0, barWidth * actualRatio - 2), barHeight / 2);
  }

  updateUnit(archer: ArcherData, enemies: ArcherData[], speed: number) {
    if (archer.dead) return;

    const target = this.findNearestAlive(archer, enemies);
    if (!target) {
      // No enemies left — idle
      if (archer.sprite.anims.currentAnim?.key !== "archer-idle") {
        archer.sprite.play("archer-idle");
      }
      archer.attacking = false;
      return;
    }

    const dist = Phaser.Math.Distance.Between(archer.sprite.x, archer.sprite.y, target.sprite.x, target.sprite.y);

    if (dist >= archer.attackRange) {
      // Move toward target
      archer.attacking = false;
      const dx = target.sprite.x - archer.sprite.x;
      const dy = target.sprite.y - archer.sprite.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      archer.sprite.x += (dx / len) * speed;
      archer.sprite.y += (dy / len) * speed * 0.3; // slight vertical tracking
      if (archer.sprite.anims.currentAnim?.key !== "archer-run") {
        archer.sprite.play("archer-run");
      }
    } else {
      // In range — attack
      if (!archer.attacking) {
        archer.attacking = true;
        archer.sprite.play("archer-shoot");
      }
    }
  }

  update(_time: number, delta: number) {
    const blueAlive = this.teamBlue.some(a => !a.dead);
    const redAlive = this.teamRed.some(a => !a.dead);
    if (!blueAlive && !redAlive) return;

    const speed = 0.8;

    // Update all units
    for (const unit of this.teamBlue) {
      this.updateUnit(unit, this.teamRed, speed);
    }
    for (const unit of this.teamRed) {
      this.updateUnit(unit, this.teamBlue, speed);
    }

    // Update arrows
    const dt = delta / 1000;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i];
      arrow.vy += arrow.gravity * dt;
      arrow.sprite.x += arrow.vx * dt;
      arrow.sprite.y += arrow.vy * dt;

      arrow.sprite.setRotation(Math.atan2(arrow.vy, arrow.vx));

      const target = arrow.targetArcher;
      const adx = arrow.sprite.x - target.sprite.x;
      const ady = arrow.sprite.y - (target.sprite.y - 20);
      const adist = Math.sqrt(adx * adx + ady * ady);
      const hitRadius = 25;

      if (adist < hitRadius || arrow.sprite.x < -50 || arrow.sprite.x > 850 || arrow.sprite.y > 650) {
        if (adist < hitRadius && !target.dead) {
          target.hp -= arrow.damage;
          this.applyHitFeedback(target, arrow.vx);
          if (target.hp <= 0) {
            target.hp = 0;
            this.applyDeath(target);
          }
        }
        arrow.sprite.destroy();
        this.arrows.splice(i, 1);
      }
    }

    // Update HP bars
    for (const unit of [...this.teamBlue, ...this.teamRed]) {
      if (!unit.dead) this.drawHpBar(unit);
    }
  }
}

const PhaserGame = () => {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gameRef.current || !containerRef.current) return;

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: containerRef.current,
      backgroundColor: "#8fbc8f",
      scene: MainScene,
      pixelArt: true,
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  const handleRestart = () => {
    if (gameRef.current) {
      gameRef.current.scene.getScene("MainScene")?.scene.restart();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
      <div ref={containerRef} />
      <button
        onClick={handleRestart}
        className="px-6 py-2 bg-primary text-primary-foreground rounded-md font-semibold hover:opacity-90 transition-opacity"
      >
        Restart Battle
      </button>
    </div>
  );
};

export default PhaserGame;
