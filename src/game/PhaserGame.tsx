import { useEffect, useRef } from "react";
import Phaser from "phaser";

interface ArrowProjectile {
  sprite: Phaser.GameObjects.Sprite;
  vx: number;
  vy: number;
  targetX: number;
  damage: number;
  targetArcher: ArcherData;
}

interface ArcherData {
  sprite: Phaser.GameObjects.Sprite;
  hp: number;
  maxHp: number;
  damage: number;
  attackRange: number;
  dead: boolean;
  attacking: boolean;
  direction: number;
  hpBar: Phaser.GameObjects.Graphics;
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
    const spriteA = this.add.sprite(80, 350, "idle");
    spriteA.setScale(2);
    spriteA.setFlipX(false);
    spriteA.play("archer-run");

    // Archer B (right side)
    const spriteB = this.add.sprite(720, 350, "idle");
    spriteB.setScale(2);
    spriteB.setFlipX(true);
    spriteB.play("archer-run");

    this.archerA = {
      sprite: spriteA,
      hp: 100,
      maxHp: 100,
      damage: 15,
      attackRange: 350,
      dead: false,
      attacking: false,
      direction: 1,
      hpBar: this.add.graphics(),
    };

    this.archerB = {
      sprite: spriteB,
      hp: 100,
      maxHp: 100,
      damage: 12,
      attackRange: 350,
      dead: false,
      attacking: false,
      direction: -1,
      hpBar: this.add.graphics(),
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
    const arrowSprite = this.add.sprite(attacker.sprite.x, attacker.sprite.y - 40, "arrow");
    arrowSprite.setScale(1.5);

    // Capture target position once
    const targetX = target.sprite.x;
    const targetY = target.sprite.y - 40;
    const dx = targetX - arrowSprite.x;
    const dy = targetY - arrowSprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = 300;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;

    // Rotate arrow to face direction
    arrowSprite.setRotation(Math.atan2(dy, dx));

    // Flip arrow sprite if going left
    if (dx < 0) {
      arrowSprite.setFlipY(true);
    }

    this.arrows.push({
      sprite: arrowSprite,
      vx,
      vy,
      targetX,
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

  drawHpBar(archer: ArcherData) {
    const g = archer.hpBar;
    g.clear();
    const barWidth = 60;
    const barHeight = 6;
    const x = archer.sprite.x - barWidth / 2;
    const y = archer.sprite.y - 100;

    g.fillStyle(0x333333);
    g.fillRect(x, y, barWidth, barHeight);
    const ratio = archer.hp / archer.maxHp;
    const color = ratio > 0.5 ? 0x00cc00 : ratio > 0.25 ? 0xcccc00 : 0xcc0000;
    g.fillStyle(color);
    g.fillRect(x, y, barWidth * ratio, barHeight);
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
      arrow.sprite.x += arrow.vx * dt;
      arrow.sprite.y += arrow.vy * dt;

      // Check collision with target (within 30px)
      const target = arrow.targetArcher;
      const adx = arrow.sprite.x - target.sprite.x;
      const ady = arrow.sprite.y - (target.sprite.y - 40);
      const adist = Math.sqrt(adx * adx + ady * ady);

      // Hit or out of bounds
      if (adist < 30 || arrow.sprite.x < -50 || arrow.sprite.x > 850) {
        if (adist < 30 && !target.dead) {
          target.hp -= arrow.damage;
          if (target.hp <= 0) {
            target.hp = 0;
            this.applyDeath(target);
          }
          this.drawHpBar(target);
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

  return <div ref={containerRef} className="flex items-center justify-center min-h-screen bg-background" />;
};

export default PhaserGame;
