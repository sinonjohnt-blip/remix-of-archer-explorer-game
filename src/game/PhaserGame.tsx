import { useEffect, useRef, useState, useCallback } from "react";
import Phaser from "phaser";
import MedievalButton from "./MedievalButton";
import UnitSelector, { type UnitType } from "./UnitSelector";

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
  unitType: UnitType;
}

class MainScene extends Phaser.Scene {
  private teamBlue: ArcherData[] = [];
  private teamRed: ArcherData[] = [];
  private arrows: ArrowProjectile[] = [];
  private battleStarted = false;
  public selectedUnitType: UnitType = "archer";
  private dividerLine!: Phaser.GameObjects.Graphics;
  private placementText!: Phaser.GameObjects.Text;

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

    this.battleStarted = false;

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

    // Draw divider line
    this.dividerLine = this.add.graphics();
    this.dividerLine.lineStyle(2, 0xffffff, 0.3);
    this.dividerLine.lineBetween(400, 0, 400, 600);

    // Placement hint text
    this.placementText = this.add.text(400, 30, "Click to place archers. Left = Blue, Right = Red", {
      fontSize: "14px",
      color: "#ffffff",
      backgroundColor: "#00000088",
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5);

    // Click to place units
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.battleStarted) return;
      const x = pointer.x;
      const y = pointer.y;
      const unitType = this.selectedUnitType;
      const isKnight = unitType === "knight";
      const hp = isKnight ? 180 : 100;
      const damage = isKnight ? 8 : 15;
      const range = isKnight ? 120 : 500;
      const scale = isKnight ? 0.9 : 0.85;

      if (x < 400) {
        const unit = this.createArcher(x, y, 1, false, 0x3399ff, damage, unitType, hp, range, scale);
        this.teamBlue.push(unit);
      } else {
        const unit = this.createArcher(x, y, -1, true, 0xff4455, damage, unitType, hp, range, scale);
        this.teamRed.push(unit);
      }
    });
  }

  startBattle() {
    if (this.battleStarted) return;
    if (this.teamBlue.length === 0 || this.teamRed.length === 0) return;
    this.battleStarted = true;
    this.dividerLine.clear();
    this.placementText.setVisible(false);
  }

  clearAll() {
    for (const unit of [...this.teamBlue, ...this.teamRed]) {
      unit.sprite.destroy();
      unit.hpBar.destroy();
    }
    for (const arrow of this.arrows) {
      arrow.sprite.destroy();
    }
    this.teamBlue = [];
    this.teamRed = [];
    this.arrows = [];
    this.battleStarted = false;
    this.dividerLine.clear();
    this.dividerLine.lineStyle(2, 0xffffff, 0.3);
    this.dividerLine.lineBetween(400, 0, 400, 600);
    this.placementText.setVisible(true);
  }

  createArcher(x: number, y: number, direction: number, flipX: boolean, teamColor: number, damage: number, unitType: UnitType = "archer", hp: number = 100, attackRange: number = 500, scale: number = 0.85): ArcherData {
    const sprite = this.add.sprite(x, y, "idle");
    sprite.setScale(scale);
    sprite.setFlipX(flipX);
    sprite.play("archer-idle");

    // Tint knights slightly to distinguish them
    if (unitType === "knight") {
      sprite.setTint(teamColor === 0x3399ff ? 0xaaccff : 0xffaaaa);
    }

    const archer: ArcherData = {
      sprite,
      hp,
      maxHp: hp,
      displayHp: hp,
      damage,
      attackRange,
      dead: false,
      attacking: false,
      direction,
      hpBar: this.add.graphics(),
      teamColor,
      unitType,
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
    arrowSprite.setScale(0.55);

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
    const barWidth = 40;
    const barHeight = 4;
    const x = archer.sprite.x - barWidth / 2;
    const y = archer.sprite.y - 65;

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
    if (!this.battleStarted) return;

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
  const [selectedUnit, setSelectedUnit] = useState<UnitType>("archer");

  useEffect(() => {
    if (gameRef.current || !containerRef.current) return;

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: containerRef.current,
      backgroundColor: "#4a6741",
      scene: MainScene,
      pixelArt: true,
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  const getScene = useCallback((): MainScene | null => {
    return gameRef.current?.scene.getScene("MainScene") as MainScene | null;
  }, []);

  const handleStart = useCallback(() => getScene()?.startBattle(), [getScene]);
  const handleClear = useCallback(() => getScene()?.clearAll(), [getScene]);

  const handleUnitSelect = useCallback((type: UnitType) => {
    setSelectedUnit(type);
    const scene = getScene();
    if (scene) scene.selectedUnitType = type;
  }, [getScene]);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-0"
      style={{ background: "linear-gradient(180deg, hsl(30 20% 15%) 0%, hsl(25 25% 10%) 100%)" }}
    >
      <div
        className="rounded-t-lg overflow-hidden border-x-4 border-t-4"
        style={{ borderColor: "hsl(30 30% 22%)" }}
      >
        <div ref={containerRef} />
      </div>
      <div
        className="flex items-center justify-center gap-4 px-6 py-3 rounded-b-lg border-x-4 border-b-4"
        style={{
          background: "linear-gradient(180deg, hsl(30 20% 18%) 0%, hsl(25 18% 12%) 100%)",
          borderColor: "hsl(30 30% 22%)",
        }}
      >
        <UnitSelector selected={selectedUnit} onSelect={handleUnitSelect} />
        <div
          className="w-px self-stretch mx-1"
          style={{ background: "hsl(30 15% 28%)" }}
        />
        <MedievalButton variant="blue" onClick={handleStart}>
          ⚔ Start Battle
        </MedievalButton>
        <MedievalButton variant="red" onClick={handleClear}>
          ✕ Clear
        </MedievalButton>
      </div>
    </div>
  );
};

export default PhaserGame;
