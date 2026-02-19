import { useEffect, useRef } from "react";
import Phaser from "phaser";

interface ArcherData {
  sprite: Phaser.GameObjects.Sprite;
  hp: number;
  maxHp: number;
  damage: number;
  attackRange: number;
  dead: boolean;
  attacking: boolean;
  direction: number; // 1 = moving right, -1 = moving left
  hpBar: Phaser.GameObjects.Graphics;
}

class MainScene extends Phaser.Scene {
  private archerA!: ArcherData;
  private archerB!: ArcherData;

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
  }

  create() {
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
      repeat: 0, // play once per attack
    });

    // Archer A (left side, walks right)
    const spriteA = this.add.sprite(100, 350, "idle");
    spriteA.setScale(2);
    spriteA.setFlipX(false);
    spriteA.play("archer-run");

    // Archer B (right side, walks left)
    const spriteB = this.add.sprite(700, 350, "idle");
    spriteB.setScale(2);
    spriteB.setFlipX(true);
    spriteB.play("archer-run");

    this.archerA = {
      sprite: spriteA,
      hp: 100,
      maxHp: 100,
      damage: 15,
      attackRange: 180,
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
      attackRange: 180,
      dead: false,
      attacking: false,
      direction: -1,
      hpBar: this.add.graphics(),
    };

    // When shoot animation completes, deal damage and loop
    spriteA.on("animationcomplete-archer-shoot", () => {
      if (!this.archerA.dead && !this.archerB.dead) {
        this.dealDamage(this.archerA, this.archerB);
        // Play shoot again if still in range
        if (this.inRange()) {
          spriteA.play("archer-shoot");
        }
      }
    });

    spriteB.on("animationcomplete-archer-shoot", () => {
      if (!this.archerB.dead && !this.archerA.dead) {
        this.dealDamage(this.archerB, this.archerA);
        if (this.inRange()) {
          spriteB.play("archer-shoot");
        }
      }
    });

    this.drawHpBar(this.archerA);
    this.drawHpBar(this.archerB);
  }

  inRange(): boolean {
    const dist = Math.abs(this.archerA.sprite.x - this.archerB.sprite.x);
    return dist < this.archerA.attackRange;
  }

  dealDamage(attacker: ArcherData, target: ArcherData) {
    target.hp -= attacker.damage;
    if (target.hp <= 0) {
      target.hp = 0;
      target.dead = true;
      target.sprite.stop();
      target.sprite.setTint(0x555555);
    }
    this.drawHpBar(target);
  }

  drawHpBar(archer: ArcherData) {
    const g = archer.hpBar;
    g.clear();
    const barWidth = 60;
    const barHeight = 6;
    const x = archer.sprite.x - barWidth / 2;
    const y = archer.sprite.y - 100;

    // Background
    g.fillStyle(0x333333);
    g.fillRect(x, y, barWidth, barHeight);
    // Health
    const ratio = archer.hp / archer.maxHp;
    const color = ratio > 0.5 ? 0x00cc00 : ratio > 0.25 ? 0xcccc00 : 0xcc0000;
    g.fillStyle(color);
    g.fillRect(x, y, barWidth * ratio, barHeight);
  }

  update() {
    if (this.archerA.dead && this.archerB.dead) return;

    const speed = 1.5;
    const dist = Math.abs(this.archerA.sprite.x - this.archerB.sprite.x);

    // Movement phase
    if (dist >= this.archerA.attackRange) {
      // Move toward each other
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
      // In range — start attacking
      if (!this.archerA.dead && !this.archerA.attacking) {
        this.archerA.attacking = true;
        this.archerA.sprite.play("archer-shoot");
      }
      if (!this.archerB.dead && !this.archerB.attacking) {
        this.archerB.attacking = true;
        this.archerB.sprite.play("archer-shoot");
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
