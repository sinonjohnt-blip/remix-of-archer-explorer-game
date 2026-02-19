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
  private archerA!: ArcherData;
  private archerB!: ArcherData;
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

    // Archer A (left side)
    const spriteA = this.add.sprite(80, 400, "idle");
    spriteA.setScale(1.2);
    spriteA.setFlipX(false);
    spriteA.play("archer-run");

    // Archer B (right side)
    const spriteB = this.add.sprite(720, 400, "idle");
    spriteB.setScale(1.2);
    spriteB.setFlipX(true);
    spriteB.play("archer-run");

    this.archerA = {
      sprite: spriteA,
      hp: 100,
      maxHp: 100,
      displayHp: 100,
      damage: 15,
      attackRange: 500,
      dead: false,
      attacking: false,
      direction: 1,
      hpBar: this.add.graphics(),
      teamColor: 0x3399ff,
    };

    this.archerB = {
      sprite: spriteB,
      hp: 100,
      maxHp: 100,
      displayHp: 100,
      damage: 12,
      attackRange: 500,
      dead: false,
      attacking: false,
      direction: -1,
      hpBar: this.add.graphics(),
      teamColor: 0xff4455,
    };

    // On shoot complete, spawn arrow and loop
    spriteA.on("animationcomplete-archer-shoot", () => {
      if (!this.archerA.dead && !this.archerB.dead) {
        this.spawnArrow(this.archerA, this.archerB);
        if (this.inRange()) {
          spriteA.play("archer-shoot");
        }
      }
    });

    spriteB.on("animationcomplete-archer-shoot", () => {
      if (!this.archerB.dead && !this.archerA.dead) {
        this.spawnArrow(this.archerB, this.archerA);
        if (this.inRange()) {
          spriteB.play("archer-shoot");
        }
      }
    });

    this.drawHpBar(this.archerA);
    this.drawHpBar(this.archerB);
  }

  spawnArrow(attacker: ArcherData, target: ArcherData) {
    const arrowSprite = this.add.sprite(attacker.sprite.x, attacker.sprite.y - 50, "arrow");
    arrowSprite.setScale(0.8);

    // Capture target position once
    const targetX = target.sprite.x;
    const dx = targetX - arrowSprite.x;
    const dist = Math.abs(dx);
    const gravity = 400;
    const flightTime = dist / 250; // estimated time to reach target
    const vx = dx / flightTime;
    const vy = -(gravity * flightTime) / 2; // launch upward so arc peaks mid-flight

    // Rotate arrow to initial direction
    arrowSprite.setRotation(Math.atan2(vy, vx));
    if (dx < 0) {
      arrowSprite.setFlipY(true);
    }

    this.arrows.push({
      sprite: arrowSprite,
      vx,
      vy,
      gravity,
      damage: attacker.damage,
      targetArcher: target,
    });
  }

  inRange(): boolean {
    const dist = Math.abs(this.archerA.sprite.x - this.archerB.sprite.x);
    return dist < this.archerA.attackRange;
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

    // Dark border
    g.fillStyle(0x1a1a2e, 0.9);
    g.fillRoundedRect(x - 1, y - 1, barWidth + 2, barHeight + 2, 2);

    // Background track
    g.fillStyle(0x333344, 1);
    g.fillRoundedRect(x, y, barWidth, barHeight, 2);

    // Damage ghost bar
    const displayRatio = archer.displayHp / archer.maxHp;
    const actualRatio = archer.hp / archer.maxHp;
    if (displayRatio > actualRatio) {
      g.fillStyle(0x994444, 0.6);
      g.fillRoundedRect(x, y, barWidth * displayRatio, barHeight, 2);
    }

    // Team-colored HP fill
    g.fillStyle(archer.teamColor, 1);
    g.fillRoundedRect(x, y, barWidth * actualRatio, barHeight, 2);

    // Subtle highlight
    g.fillStyle(0xffffff, 0.15);
    g.fillRect(x + 1, y, Math.max(0, barWidth * actualRatio - 2), barHeight / 2);
  }

  update(_time: number, delta: number) {
    if (this.archerA.dead && this.archerB.dead) return;

    const speed = 0.8;
    const dist = Math.abs(this.archerA.sprite.x - this.archerB.sprite.x);

    // Movement phase
    if (dist >= this.archerA.attackRange) {
      if (!this.archerA.dead) {
        this.archerA.sprite.x += speed * this.archerA.direction;
        this.archerA.attacking = false;
        if (this.archerA.sprite.anims.currentAnim?.key !== "archer-run") {
          this.archerA.sprite.play("archer-run");
        }
      }
      if (!this.archerB.dead) {
        this.archerB.sprite.x += speed * this.archerB.direction;
        this.archerB.attacking = false;
        if (this.archerB.sprite.anims.currentAnim?.key !== "archer-run") {
          this.archerB.sprite.play("archer-run");
        }
      }
    } else {
      if (!this.archerA.dead && !this.archerA.attacking) {
        this.archerA.attacking = true;
        this.archerA.sprite.play("archer-shoot");
      }
      if (!this.archerB.dead && !this.archerB.attacking) {
        this.archerB.attacking = true;
        this.archerB.sprite.play("archer-shoot");
      }
    }

    // Update arrows
    const dt = delta / 1000;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i];
      arrow.vy += arrow.gravity * dt; // apply gravity
      arrow.sprite.x += arrow.vx * dt;
      arrow.sprite.y += arrow.vy * dt;

      // Rotate arrow to match current velocity
      arrow.sprite.setRotation(Math.atan2(arrow.vy, arrow.vx));

      // Tighter hitbox centered on body
      const target = arrow.targetArcher;
      const adx = arrow.sprite.x - target.sprite.x;
      const ady = arrow.sprite.y - (target.sprite.y - 20);
      const adist = Math.sqrt(adx * adx + ady * ady);
      const hitRadius = 25;

      if (adist < hitRadius || arrow.sprite.x < -50 || arrow.sprite.x > 850 || arrow.sprite.y > 600) {
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

    // Update HP bar positions
    if (!this.archerA.dead) this.drawHpBar(this.archerA);
    if (!this.archerB.dead) this.drawHpBar(this.archerB);
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
