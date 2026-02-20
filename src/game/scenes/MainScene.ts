import Phaser from "phaser";
import type { UnitData, ArrowProjectile, UnitType, UnitState, Team } from "../types";

const UNIT_COSTS: Record<UnitType, number> = { archer: 50, warrior: 80 };

// ─── Frame dimensions (pixels) ───────────────────────────────────────────────
const ARCHER_FRAME   = 192;
const WARRIOR_FRAME  = 192;

export class MainScene extends Phaser.Scene {
  teamBlue: UnitData[]      = [];
  teamRed:  UnitData[]      = [];
  arrows:   ArrowProjectile[] = [];
  battleStarted = false;
  selectedUnitType: UnitType = "archer";
  goldRef: { blue: number; red: number } = { blue: 500, red: 500 };

  private dividerLine!: Phaser.GameObjects.Graphics;
  private placementText!: Phaser.GameObjects.Text;

  constructor() { super("MainScene"); }

  // ── Preload ──────────────────────────────────────────────────────────────
  preload() {
    // Archer sheets
    this.load.spritesheet("idle",  "/assets/Archer_Idle.png",  { frameWidth: ARCHER_FRAME,  frameHeight: ARCHER_FRAME });
    this.load.spritesheet("run",   "/assets/Archer_Run.png",   { frameWidth: ARCHER_FRAME,  frameHeight: ARCHER_FRAME });
    this.load.spritesheet("shoot", "/assets/Archer_Shoot.png", { frameWidth: ARCHER_FRAME,  frameHeight: ARCHER_FRAME });
    this.load.image("arrow", "/assets/Arrow.png");

    // Warrior sheets (192×192 frames based on sprite pack standard)
    this.load.spritesheet("w-idle",    "/assets/Warrior_Idle.png",    { frameWidth: WARRIOR_FRAME, frameHeight: WARRIOR_FRAME });
    this.load.spritesheet("w-run",     "/assets/Warrior_Run.png",     { frameWidth: WARRIOR_FRAME, frameHeight: WARRIOR_FRAME });
    this.load.spritesheet("w-attack1", "/assets/Warrior_Attack1.png", { frameWidth: WARRIOR_FRAME, frameHeight: WARRIOR_FRAME });
    this.load.spritesheet("w-attack2", "/assets/Warrior_Attack2.png", { frameWidth: WARRIOR_FRAME, frameHeight: WARRIOR_FRAME });
    this.load.spritesheet("w-guard",   "/assets/Warrior_Guard.png",   { frameWidth: WARRIOR_FRAME, frameHeight: WARRIOR_FRAME });
  }

  // ── Create ───────────────────────────────────────────────────────────────
  create() {
    this.arrows = [];
    this.teamBlue = [];
    this.teamRed  = [];
    this.battleStarted = false;

    this.createAnims();

    // Divider
    this.dividerLine = this.add.graphics();
    this.drawDivider();

    // Hint text
    this.placementText = this.add.text(400, 30,
      "Click to place units.  Left = Blue  |  Right = Red", {
        fontSize: "13px",
        color: "#e8d5a3",
        backgroundColor: "#1a150e99",
        padding: { x: 10, y: 5 },
      }).setOrigin(0.5);

    // Click → place unit
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.battleStarted) return;
      const x = pointer.x;
      const y = pointer.y;
      const unitType = this.selectedUnitType;
      const cost  = UNIT_COSTS[unitType];
      const team: Team = x < 400 ? "blue" : "red";
      const currentGold = team === "blue" ? this.goldRef.blue : this.goldRef.red;
      if (currentGold < cost) return;

      const unit = this.spawnUnit(x, y, team, unitType);
      if (team === "blue") this.teamBlue.push(unit);
      else                  this.teamRed.push(unit);

      this.events.emit("unit-placed", { team, cost });
    });
  }

  // ── Animations ───────────────────────────────────────────────────────────
  private createAnims() {
    const def = (key: string, texture: string, start: number, end: number, rate = 8, repeat = -1) => {
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(texture, { start, end }),
          frameRate: rate,
          repeat,
        });
      }
    };

    // Archer
    def("archer-idle",  "idle",  0, 5);
    def("archer-run",   "run",   0, 3);
    def("archer-shoot", "shoot", 0, 7, 8, 0);

    // Warrior
    def("warrior-idle",    "w-idle",    0, 7);
    def("warrior-run",     "w-run",     0, 5);
    def("warrior-attack1", "w-attack1", 0, 3, 10, 0);
    def("warrior-attack2", "w-attack2", 0, 3, 10, 0);
    def("warrior-guard",   "w-guard",   0, 5);
  }

  // ── Spawn a unit ─────────────────────────────────────────────────────────
  private spawnUnit(x: number, y: number, team: Team, unitType: UnitType): UnitData {
    const isBlue = team === "blue";
    const teamColor  = isBlue ? 0x3399ff : 0xff4455;
    const direction  = isBlue ? 1 : -1;
    const flipX      = !isBlue;

    let hp: number, damage: number, attackRange: number, meleeRange: number,
        speed: number, scale: number;

    if (unitType === "archer") {
      hp = 100; damage = 15; attackRange = 500; meleeRange = 500; speed = 0.8; scale = 0.85;
    } else {
      // warrior
      hp = 200; damage = 22; attackRange = 68; meleeRange = 68; speed = 1.0; scale = 0.9;
    }

    const sprite = this.add.sprite(x, y, unitType === "archer" ? "idle" : "w-idle");
    sprite.setScale(scale);
    sprite.setFlipX(flipX);
    sprite.play(unitType === "archer" ? "archer-idle" : "warrior-idle");

    const unit: UnitData = {
      sprite,
      hp, maxHp: hp, displayHp: hp,
      damage,
      attackRange, meleeRange,
      state: "idle",
      cooldownTimer: 0,
      attackDuration: unitType === "warrior" ? 500 : 700,
      direction,
      hpBar: this.add.graphics(),
      teamColor,
      unitType,
      team,
      speed,
    };

    this.hookUnitEvents(unit);
    this.drawHpBar(unit);
    return unit;
  }

  // ── Per-unit animation event hooks ───────────────────────────────────────
  private hookUnitEvents(unit: UnitData) {
    if (unit.unitType === "archer") {
      unit.sprite.on("animationcomplete-archer-shoot", () => {
        if (unit.state === "dead") return;
        const enemies = this.enemiesOf(unit);
        const target  = this.nearestAlive(unit, enemies);
        if (target) {
          this.spawnArrow(unit, target);
          const dist = Phaser.Math.Distance.Between(
            unit.sprite.x, unit.sprite.y,
            target.sprite.x, target.sprite.y
          );
          if (dist <= unit.attackRange) {
            // continue shooting
            unit.sprite.play("archer-shoot");
          } else {
            this.setState(unit, "cooldown");
            unit.cooldownTimer = 300;
          }
        } else {
          this.setState(unit, "idle");
        }
      });
    }

    if (unit.unitType === "warrior") {
      // triggered on either attack anim
      const onMeleeComplete = () => {
        if (unit.state === "dead") return;
        const enemies = this.enemiesOf(unit);
        const target  = this.nearestAlive(unit, enemies);
        if (target) {
          const dist = Phaser.Math.Distance.Between(
            unit.sprite.x, unit.sprite.y,
            target.sprite.x, target.sprite.y
          );
          if (dist <= unit.meleeRange + 10) {
            // deal damage
            this.applyMeleeDamage(unit, target);
          }
        }
        // enter cooldown
        this.setState(unit, "cooldown");
        unit.cooldownTimer = unit.attackDuration + 200;
      };

      unit.sprite.on("animationcomplete-warrior-attack1", onMeleeComplete);
      unit.sprite.on("animationcomplete-warrior-attack2", onMeleeComplete);
    }
  }

  // ── State machine transition ──────────────────────────────────────────────
  setState(unit: UnitData, next: UnitState) {
    if (unit.state === "dead") return;
    unit.state = next;

    switch (next) {
      case "idle":
        unit.sprite.play(unit.unitType === "archer" ? "archer-idle" : "warrior-idle", true);
        break;
      case "moving":
        unit.sprite.play(unit.unitType === "archer" ? "archer-run" : "warrior-run", true);
        break;
      case "attacking":
        if (unit.unitType === "archer") {
          unit.sprite.play("archer-shoot", true);
        } else {
          // alternate attack anims for variety
          const anim = Math.random() < 0.5 ? "warrior-attack1" : "warrior-attack2";
          unit.sprite.play(anim, true);
        }
        break;
      case "cooldown":
        if (unit.unitType === "warrior") {
          unit.sprite.play("warrior-guard", true);
        } else {
          unit.sprite.play("archer-idle", true);
        }
        break;
      case "dead":
        this.applyDeath(unit);
        break;
    }
  }

  // ── Melee damage + lunge + knockback ─────────────────────────────────────
  private applyMeleeDamage(attacker: UnitData, target: UnitData) {
    if (target.state === "dead") return;
    target.hp -= attacker.damage;

    // lunge attacker forward briefly
    const lungeX = attacker.sprite.x + attacker.direction * 14;
    this.tweens.add({
      targets: attacker.sprite,
      x: lungeX,
      duration: 80,
      yoyo: true,
      ease: "Power2",
    });

    // knockback target
    const knockDir = attacker.direction;
    const knockX   = target.sprite.x + knockDir * 18;
    this.tweens.add({
      targets: target.sprite,
      x: knockX,
      duration: 120,
      yoyo: true,
      ease: "Power1",
    });

    // flash white
    target.sprite.setTint(0xffffff);
    this.time.delayedCall(120, () => {
      if (target.state !== "dead") target.sprite.clearTint();
    });

    if (target.hp <= 0) {
      target.hp = 0;
      this.setState(target, "dead");
    }
  }

  // ── Arrow ─────────────────────────────────────────────────────────────────
  spawnArrow(attacker: UnitData, target: UnitData) {
    const arrowSprite = this.add.sprite(attacker.sprite.x, attacker.sprite.y - 50, "arrow");
    arrowSprite.setScale(0.55);

    const dx = (target.sprite.x) - arrowSprite.x;
    const dy = (target.sprite.y - 20) - arrowSprite.y;
    const dist  = Math.sqrt(dx * dx + dy * dy);
    const grav  = 400;
    const flightTime = Math.max(dist / 250, 0.3);
    const vx = dx / flightTime;
    const vy = dy / flightTime - (grav * flightTime) / 2;

    arrowSprite.setRotation(Math.atan2(vy, vx));
    if (dx < 0) arrowSprite.setFlipY(true);

    this.arrows.push({ sprite: arrowSprite, vx, vy, gravity: grav, damage: attacker.damage, targetUnit: target });
  }

  // ── Death ─────────────────────────────────────────────────────────────────
  private applyDeath(unit: UnitData) {
    unit.sprite.stop();
    unit.sprite.setTint(0xff4444);
    this.tweens.add({
      targets: unit.sprite,
      alpha: 0,
      duration: 600,
      onComplete: () => {
        unit.sprite.setVisible(false);
        unit.hpBar.clear();
      },
    });
  }

  // ── HP Bar ────────────────────────────────────────────────────────────────
  drawHpBar(unit: UnitData) {
    unit.displayHp += (unit.hp - unit.displayHp) * 0.08;
    if (Math.abs(unit.displayHp - unit.hp) < 0.5) unit.displayHp = unit.hp;

    const g = unit.hpBar;
    g.clear();
    const W = 44, H = 4;
    const bx = unit.sprite.x - W / 2;
    const by = unit.sprite.y - (unit.unitType === "warrior" ? 72 : 65);

    g.fillStyle(0x1a1a2e, 0.9);
    g.fillRoundedRect(bx - 1, by - 1, W + 2, H + 2, 2);
    g.fillStyle(0x333344, 1);
    g.fillRoundedRect(bx, by, W, H, 2);

    const dispRatio   = unit.displayHp / unit.maxHp;
    const actualRatio = unit.hp / unit.maxHp;
    if (dispRatio > actualRatio) {
      g.fillStyle(0x994444, 0.6);
      g.fillRoundedRect(bx, by, W * dispRatio, H, 2);
    }
    g.fillStyle(unit.teamColor, 1);
    g.fillRoundedRect(bx, by, W * actualRatio, H, 2);
    g.fillStyle(0xffffff, 0.15);
    g.fillRect(bx + 1, by, Math.max(0, W * actualRatio - 2), H / 2);
  }

  // ── Per-frame unit update ─────────────────────────────────────────────────
  private updateUnit(unit: UnitData, delta: number) {
    if (unit.state === "dead") return;

    // Tick cooldown
    if (unit.state === "cooldown") {
      unit.cooldownTimer -= delta;
      if (unit.cooldownTimer <= 0) {
        this.setState(unit, "idle");
      }
      return;
    }

    const enemies = this.enemiesOf(unit);
    const target  = this.nearestAlive(unit, enemies);

    if (!target) {
      if (unit.state !== "idle") this.setState(unit, "idle");
      return;
    }

    const dist = Phaser.Math.Distance.Between(
      unit.sprite.x, unit.sprite.y,
      target.sprite.x, target.sprite.y
    );

    if (unit.unitType === "archer") {
      this.updateArcher(unit, target, dist);
    } else {
      this.updateWarrior(unit, target, dist, delta);
    }
  }

  // ── Archer AI ─────────────────────────────────────────────────────────────
  private updateArcher(unit: UnitData, target: UnitData, dist: number) {
    // Archer stops and shoots when within range, moves forward otherwise
    if (dist > unit.attackRange) {
      if (unit.state !== "moving") this.setState(unit, "moving");
      const dx = target.sprite.x - unit.sprite.x;
      const dy = target.sprite.y - unit.sprite.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      unit.sprite.x += (dx / len) * unit.speed;
      unit.sprite.y += (dy / len) * unit.speed * 0.3;
    } else {
      if (unit.state === "idle" || unit.state === "moving") {
        this.setState(unit, "attacking");
      }
    }
  }

  // ── Warrior AI ────────────────────────────────────────────────────────────
  private updateWarrior(unit: UnitData, target: UnitData, dist: number, _delta: number) {
    if (dist > unit.meleeRange) {
      // Charge toward enemy
      if (unit.state !== "moving") this.setState(unit, "moving");
      const dx = target.sprite.x - unit.sprite.x;
      const dy = target.sprite.y - unit.sprite.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      unit.sprite.x += (dx / len) * unit.speed;
      unit.sprite.y += (dy / len) * unit.speed * 0.35;
    } else {
      // In melee range — attack if idle/moving
      if (unit.state === "idle" || unit.state === "moving") {
        this.setState(unit, "attacking");
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  enemiesOf(unit: UnitData): UnitData[] {
    return unit.team === "blue" ? this.teamRed : this.teamBlue;
  }

  nearestAlive(unit: UnitData, enemies: UnitData[]): UnitData | null {
    let nearest: UnitData | null = null;
    let minDist = Infinity;
    for (const e of enemies) {
      if (e.state === "dead") continue;
      const d = Phaser.Math.Distance.Between(unit.sprite.x, unit.sprite.y, e.sprite.x, e.sprite.y);
      if (d < minDist) { minDist = d; nearest = e; }
    }
    return nearest;
  }

  private drawDivider() {
    this.dividerLine.lineStyle(2, 0xffffff, 0.3);
    this.dividerLine.lineBetween(400, 0, 400, 600);
  }

  // ── Public commands ───────────────────────────────────────────────────────
  startBattle() {
    if (this.battleStarted) return;
    if (this.teamBlue.length === 0 || this.teamRed.length === 0) return;
    this.battleStarted = true;
    this.dividerLine.clear();
    this.placementText.setVisible(false);
  }

  clearAll() {
    for (const u of [...this.teamBlue, ...this.teamRed]) {
      u.sprite.destroy();
      u.hpBar.destroy();
    }
    for (const a of this.arrows) a.sprite.destroy();
    this.teamBlue = [];
    this.teamRed  = [];
    this.arrows   = [];
    this.battleStarted = false;
    this.dividerLine.clear();
    this.drawDivider();
    this.placementText.setVisible(true);
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  update(_time: number, delta: number) {
    if (!this.battleStarted) return;

    const blueAlive = this.teamBlue.some(u => u.state !== "dead");
    const redAlive  = this.teamRed.some(u => u.state !== "dead");
    if (!blueAlive && !redAlive) return;

    for (const u of this.teamBlue) this.updateUnit(u, delta);
    for (const u of this.teamRed)  this.updateUnit(u, delta);

    // Arrows
    const dt = delta / 1000;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i];
      arrow.vy += arrow.gravity * dt;
      arrow.sprite.x += arrow.vx * dt;
      arrow.sprite.y += arrow.vy * dt;
      arrow.sprite.setRotation(Math.atan2(arrow.vy, arrow.vx));

      const target = arrow.targetUnit;
      const adx   = arrow.sprite.x - target.sprite.x;
      const ady   = arrow.sprite.y - (target.sprite.y - 20);
      const adist = Math.sqrt(adx * adx + ady * ady);

      if (adist < 28 || arrow.sprite.x < -50 || arrow.sprite.x > 850 || arrow.sprite.y > 650) {
        if (adist < 28 && target.state !== "dead") {
          target.hp -= arrow.damage;
          // white flash + micro-knockback
          target.sprite.setTint(0xffffff);
          this.time.delayedCall(100, () => {
            if (target.state !== "dead") target.sprite.clearTint();
          });
          const kDir = arrow.vx > 0 ? 1 : -1;
          this.tweens.add({ targets: target.sprite, x: target.sprite.x + kDir * 6, duration: 50, yoyo: true });
          if (target.hp <= 0) { target.hp = 0; this.setState(target, "dead"); }
        }
        arrow.sprite.destroy();
        this.arrows.splice(i, 1);
      }
    }

    // HP bars
    for (const u of [...this.teamBlue, ...this.teamRed]) {
      if (u.state !== "dead") this.drawHpBar(u);
    }
  }
}
