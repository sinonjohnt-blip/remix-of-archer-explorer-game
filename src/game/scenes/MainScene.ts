import Phaser from "phaser";
import type {
  UnitData, ArrowProjectile, UnitType, UnitState, Team,
  GridCell, UnitAbilities,
} from "../types";
import {
  GRID_COLS, GRID_ROWS, CELL_W, CELL_H, GAME_W, GAME_H,
} from "../types";

// ── Gold costs ────────────────────────────────────────────────────────────────
const UNIT_COSTS: Record<UnitType, number> = { archer: 50, warrior: 80, lancer: 100 };

// ── Sprite sheet frame sizes ───────────────────────────────────────────────────
const ARCHER_FRAME  = 192;
const WARRIOR_FRAME = 192;
const LANCER_FRAME  = 192;

// ── Blue team occupies cols 0-4; Red team cols 5-9 ────────────────────────────
const BLUE_MAX_COL = 4;
const RED_MIN_COL  = 5;

// ─────────────────────────────────────────────────────────────────────────────
//  Modular ability definitions — add new units here without touching AI logic
// ─────────────────────────────────────────────────────────────────────────────

function archerAbilities(): UnitAbilities {
  return {
    resolveAttack: () => [],   // archer uses projectiles, not direct resolve
    cooldownAnim: () => "archer-idle",
    attackAnim:   () => "archer-shoot",
  };
}

function warriorAbilities(): UnitAbilities {
  return {
    resolveAttack: (_attacker, target) => [target],
    cooldownAnim: () => "warrior-guard",
    attackAnim:   () => Math.random() < 0.5 ? "warrior-attack1" : "warrior-attack2",
  };
}

function lancerAbilities(): UnitAbilities {
  return {
    /** Pierce up to 3 enemies in a straight horizontal line ahead of the lancer */
    resolveAttack: (attacker, primary, grid) => {
      const cell = attacker.gridCell;
      if (!cell) return [primary];
      const stepCol = attacker.direction; // +1 right, -1 left
      const targets: UnitData[] = [];
      for (let i = 1; i <= 3; i++) {
        const c = cell.col + stepCol * i;
        const r = cell.row;
        if (c < 0 || c >= GRID_COLS || r < 0 || r >= GRID_ROWS) break;
        const occ = grid[r][c].occupant;
        if (occ && occ.state !== "dead" && occ.team !== attacker.team) {
          targets.push(occ);
        }
      }
      return targets.length ? targets : (primary.state !== "dead" ? [primary] : []);
    },
    cooldownAnim: (unit) => unit.direction === 1 ? "lancer-right-guard" : "lancer-right-guard",
    attackAnim:   (unit) => unit.direction === 1 ? "lancer-right-attack" : "lancer-right-attack",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
export class MainScene extends Phaser.Scene {
  teamBlue: UnitData[]       = [];
  teamRed:  UnitData[]       = [];
  arrows:   ArrowProjectile[] = [];
  battleStarted = false;
  selectedUnitType: UnitType = "archer";
  goldRef: { blue: number; red: number } = { blue: 500, red: 500 };

  // Grid
  private grid: GridCell[][] = [];           // grid[row][col]
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private hoverGraphics!: Phaser.GameObjects.Graphics;

  private placementText!: Phaser.GameObjects.Text;

  constructor() { super("MainScene"); }

  // ── Preload ────────────────────────────────────────────────────────────────
  preload() {
    this.load.spritesheet("idle",  "/assets/Archer_Idle.png",  { frameWidth: ARCHER_FRAME,  frameHeight: ARCHER_FRAME });
    this.load.spritesheet("run",   "/assets/Archer_Run.png",   { frameWidth: ARCHER_FRAME,  frameHeight: ARCHER_FRAME });
    this.load.spritesheet("shoot", "/assets/Archer_Shoot.png", { frameWidth: ARCHER_FRAME,  frameHeight: ARCHER_FRAME });
    this.load.image("arrow", "/assets/Arrow.png");

    this.load.spritesheet("w-idle",    "/assets/Warrior_Idle.png",    { frameWidth: WARRIOR_FRAME, frameHeight: WARRIOR_FRAME });
    this.load.spritesheet("w-run",     "/assets/Warrior_Run.png",     { frameWidth: WARRIOR_FRAME, frameHeight: WARRIOR_FRAME });
    this.load.spritesheet("w-attack1", "/assets/Warrior_Attack1.png", { frameWidth: WARRIOR_FRAME, frameHeight: WARRIOR_FRAME });
    this.load.spritesheet("w-attack2", "/assets/Warrior_Attack2.png", { frameWidth: WARRIOR_FRAME, frameHeight: WARRIOR_FRAME });
    this.load.spritesheet("w-guard",   "/assets/Warrior_Guard.png",   { frameWidth: WARRIOR_FRAME, frameHeight: WARRIOR_FRAME });

    this.load.spritesheet("l-idle",         "/assets/Lancer_Idle.png",          { frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });
    this.load.spritesheet("l-run",          "/assets/Lancer_Run.png",           { frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });
    this.load.spritesheet("l-right-attack", "/assets/Lancer_Right_Attack.png",  { frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });
    this.load.spritesheet("l-right-guard",  "/assets/Lancer_Right_Defence.png", { frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });
    this.load.spritesheet("l-up-attack",    "/assets/Lancer_Up_Attack.png",     { frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });
    this.load.spritesheet("l-up-guard",     "/assets/Lancer_Up_Defence.png",    { frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  create() {
    this.arrows       = [];
    this.teamBlue     = [];
    this.teamRed      = [];
    this.battleStarted = false;

    this.buildGrid();
    this.createAnims();

    this.gridGraphics  = this.add.graphics();
    this.hoverGraphics = this.add.graphics();
    this.drawGrid();

    this.placementText = this.add.text(GAME_W / 2, 18,
      "Click a cell to place a unit  ·  Left = Blue  |  Right = Red", {
        fontSize: "11px",
        color: "#e8d5a3",
        backgroundColor: "#1a150eaa",
        padding: { x: 8, y: 4 },
      }).setOrigin(0.5).setDepth(20);

    // Hover highlight
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.battleStarted) { this.hoverGraphics.clear(); return; }
      this.drawHoverCell(p.x, p.y);
    });

    // Click → place
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.battleStarted) return;
      this.tryPlaceUnit(p.x, p.y);
    });
  }

  // ── Build the 2-D cell array ───────────────────────────────────────────────
  private buildGrid() {
    this.grid = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      const row: GridCell[] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        row.push({
          col:      c,
          row:      r,
          worldX:   c * CELL_W + CELL_W / 2,
          worldY:   r * CELL_H + CELL_H / 2,
          occupant: null,
        });
      }
      this.grid.push(row);
    }
  }

  // ── Draw the grid overlay ─────────────────────────────────────────────────
  private drawGrid() {
    const g = this.gridGraphics;
    g.clear();

    // Divider between blue/red halves (between col 4 and 5)
    g.lineStyle(2, 0xffffff, 0.25);
    const divX = RED_MIN_COL * CELL_W;
    g.lineBetween(divX, 0, divX, GAME_H);

    // Blue half tint
    g.fillStyle(0x3399ff, 0.04);
    g.fillRect(0, 0, divX, GAME_H);
    // Red half tint
    g.fillStyle(0xff4455, 0.04);
    g.fillRect(divX, 0, GAME_W - divX, GAME_H);

    // Cell lines
    g.lineStyle(1, 0xffffff, 0.08);
    for (let c = 0; c <= GRID_COLS; c++) {
      g.lineBetween(c * CELL_W, 0, c * CELL_W, GAME_H);
    }
    for (let r = 0; r <= GRID_ROWS; r++) {
      g.lineBetween(0, r * CELL_H, GAME_W, r * CELL_H);
    }
  }

  // ── Hover highlight ───────────────────────────────────────────────────────
  private drawHoverCell(px: number, py: number) {
    const cell = this.worldToCell(px, py);
    const h    = this.hoverGraphics;
    h.clear();
    if (!cell) return;

    const team: Team = cell.col < RED_MIN_COL ? "blue" : "red";
    const cost       = UNIT_COSTS[this.selectedUnitType];
    const hasGold    = (team === "blue" ? this.goldRef.blue : this.goldRef.red) >= cost;
    const occupied   = !!cell.occupant;
    const canPlace   = hasGold && !occupied;

    const color = canPlace ? 0x88ffaa : 0xff4444;
    const alpha = canPlace ? 0.18 : 0.25;
    h.fillStyle(color, alpha);
    h.fillRect(cell.col * CELL_W + 1, cell.row * CELL_H + 1, CELL_W - 2, CELL_H - 2);
    h.lineStyle(2, color, canPlace ? 0.5 : 0.9);
    h.strokeRect(cell.col * CELL_W + 1, cell.row * CELL_H + 1, CELL_W - 2, CELL_H - 2);
  }

  // ── Try to place a unit ───────────────────────────────────────────────────
  private tryPlaceUnit(px: number, py: number) {
    const cell = this.worldToCell(px, py);
    if (!cell) return;

    const team: Team = cell.col < RED_MIN_COL ? "blue" : "red";
    const cost       = UNIT_COSTS[this.selectedUnitType];
    const currentGold = team === "blue" ? this.goldRef.blue : this.goldRef.red;
    if (currentGold < cost) {
      this.flashCell(cell, 0xff4444);
      return;
    }
    if (cell.occupant) {
      this.flashCell(cell, 0xff4444);
      return;
    }

    const unit = this.spawnUnit(cell, team, this.selectedUnitType);
    cell.occupant = unit;
    unit.gridCell = cell;

    if (team === "blue") this.teamBlue.push(unit);
    else                  this.teamRed.push(unit);

    this.events.emit("unit-placed", { team, cost });
  }

  // ── Flash a cell red/green briefly ───────────────────────────────────────
  private flashCell(cell: GridCell, color: number) {
    const g = this.add.graphics().setDepth(30);
    g.fillStyle(color, 0.45);
    g.fillRect(cell.col * CELL_W + 1, cell.row * CELL_H + 1, CELL_W - 2, CELL_H - 2);
    this.time.delayedCall(300, () => g.destroy());
  }

  // ── World → grid cell ──────────────────────────────────────────────────────
  worldToCell(px: number, py: number): GridCell | null {
    const col = Math.floor(px / CELL_W);
    const row = Math.floor(py / CELL_H);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;
    return this.grid[row][col];
  }

  // ── Animations ─────────────────────────────────────────────────────────────
  private createAnims() {
    const def = (key: string, tex: string, start: number, end: number, rate = 8, repeat = -1) => {
      if (!this.anims.exists(key))
        this.anims.create({ key, frames: this.anims.generateFrameNumbers(tex, { start, end }), frameRate: rate, repeat });
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

    // Lancer
    def("lancer-idle",         "l-idle",         0, 11, 8);
    def("lancer-run",          "l-run",          0, 5,  8);
    def("lancer-right-attack", "l-right-attack", 0, 2,  10, 0);
    def("lancer-right-guard",  "l-right-guard",  0, 5,  8);
    def("lancer-up-attack",    "l-up-attack",    0, 2,  10, 0);
    def("lancer-up-guard",     "l-up-guard",     0, 5,  8);
  }

  // ── Spawn unit onto a grid cell ────────────────────────────────────────────
  private spawnUnit(cell: GridCell, team: Team, unitType: UnitType): UnitData {
    const isBlue     = team === "blue";
    const teamColor  = isBlue ? 0x3399ff : 0xff4455;
    const direction  = isBlue ? 1 : -1;
    const flipX      = !isBlue;

    let hp: number, damage: number, attackRangeCells: number, speed: number, scale: number, attackDuration: number;
    let idleAnim: string;
    let abilities: UnitAbilities;

    switch (unitType) {
      case "archer":
        hp = 100; damage = 15; attackRangeCells = 5; speed = 0.8; scale = 0.85; attackDuration = 700;
        idleAnim = "archer-idle"; abilities = archerAbilities(); break;
      case "warrior":
        hp = 200; damage = 22; attackRangeCells = 1; speed = 1.2; scale = 0.9; attackDuration = 500;
        idleAnim = "warrior-idle"; abilities = warriorAbilities(); break;
      case "lancer":
        hp = 160; damage = 18; attackRangeCells = 2; speed = 1.0; scale = 0.9; attackDuration = 700;
        idleAnim = "lancer-idle"; abilities = lancerAbilities(); break;
    }

    const worldX = cell.worldX;
    const worldY = cell.worldY;

    const sprite = this.add.sprite(worldX, worldY, unitType === "archer" ? "idle" : unitType === "warrior" ? "w-idle" : "l-idle");
    sprite.setScale(scale);
    sprite.setFlipX(flipX);
    sprite.play(idleAnim);
    sprite.setDepth(10 + cell.row);

    const meleeRange = attackRangeCells * CELL_W + CELL_W * 0.5;

    const unit: UnitData = {
      sprite,
      hp, maxHp: hp, displayHp: hp,
      damage,
      attackRange: meleeRange,
      meleeRange,
      state: "idle",
      cooldownTimer: 0,
      attackDuration,
      direction,
      hpBar: this.add.graphics().setDepth(50),
      teamColor,
      unitType,
      team,
      speed,
      gridCell: cell,
      abilities,
    };

    this.hookUnitEvents(unit);
    this.drawHpBar(unit);
    return unit;
  }

  // ── Animation event hooks ─────────────────────────────────────────────────
  private hookUnitEvents(unit: UnitData) {
    if (unit.unitType === "archer") {
      unit.sprite.on("animationcomplete-archer-shoot", () => {
        if (unit.state === "dead") return;
        const target = this.nearestAlive(unit, this.enemiesOf(unit));
        if (target) {
          this.spawnArrow(unit, target);
          const dist = Phaser.Math.Distance.Between(unit.sprite.x, unit.sprite.y, target.sprite.x, target.sprite.y);
          if (dist <= unit.attackRange) {
            unit.sprite.play("archer-shoot", true);
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
      const onComplete = () => {
        if (unit.state === "dead") return;
        const target = this.nearestAlive(unit, this.enemiesOf(unit));
        if (target) {
          const dist = Phaser.Math.Distance.Between(unit.sprite.x, unit.sprite.y, target.sprite.x, target.sprite.y);
          if (dist <= unit.meleeRange + 10) this.applyMeleeDamage(unit, target);
        }
        this.setState(unit, "cooldown");
        unit.cooldownTimer = unit.attackDuration + 200;
      };
      unit.sprite.on("animationcomplete-warrior-attack1", onComplete);
      unit.sprite.on("animationcomplete-warrior-attack2", onComplete);
    }

    if (unit.unitType === "lancer") {
      const onLancerComplete = () => {
        if (unit.state === "dead") return;
        const enemies = this.enemiesOf(unit);
        const primary = this.nearestAlive(unit, enemies);
        if (primary) {
          const hits = unit.abilities.resolveAttack(unit, primary, this.grid);
          for (const target of hits) {
            this.applyMeleeDamage(unit, target);
          }
        }
        this.setState(unit, "cooldown");
        unit.cooldownTimer = unit.attackDuration + 400; // slower attack cycle
      };
      unit.sprite.on("animationcomplete-lancer-right-attack", onLancerComplete);
      unit.sprite.on("animationcomplete-lancer-up-attack",    onLancerComplete);
    }
  }

  // ── State machine ─────────────────────────────────────────────────────────
  setState(unit: UnitData, next: UnitState) {
    if (unit.state === "dead") return;
    unit.state = next;

    switch (next) {
      case "idle":
        unit.sprite.play(
          unit.unitType === "archer" ? "archer-idle" :
          unit.unitType === "warrior" ? "warrior-idle" : "lancer-idle", true);
        break;
      case "moving":
        unit.sprite.play(
          unit.unitType === "archer" ? "archer-run" :
          unit.unitType === "warrior" ? "warrior-run" : "lancer-run", true);
        break;
      case "attacking":
        unit.sprite.play(unit.abilities.attackAnim(unit), true);
        break;
      case "cooldown":
        unit.sprite.play(unit.abilities.cooldownAnim(unit), true);
        break;
      case "dead":
        this.applyDeath(unit);
        break;
    }
  }

  // ── Melee damage (shared) ─────────────────────────────────────────────────
  private applyMeleeDamage(attacker: UnitData, target: UnitData) {
    if (target.state === "dead") return;
    target.hp -= attacker.damage;

    // Lunge forward
    const lungeX = attacker.sprite.x + attacker.direction * 14;
    this.tweens.add({ targets: attacker.sprite, x: lungeX, duration: 80, yoyo: true, ease: "Power2" });

    // Knockback target
    this.tweens.add({ targets: target.sprite, x: target.sprite.x + attacker.direction * 18, duration: 120, yoyo: true, ease: "Power1" });

    // Flash
    target.sprite.setTint(0xffffff);
    this.time.delayedCall(120, () => { if (target.state !== "dead") target.sprite.clearTint(); });

    if (target.hp <= 0) { target.hp = 0; this.setState(target, "dead"); }
  }

  // ── Arrow ─────────────────────────────────────────────────────────────────
  spawnArrow(attacker: UnitData, target: UnitData) {
    const arrowSprite = this.add.sprite(attacker.sprite.x, attacker.sprite.y - 50, "arrow").setDepth(25);
    arrowSprite.setScale(0.55);
    const dx = target.sprite.x - arrowSprite.x;
    const dy = (target.sprite.y - 20) - arrowSprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const grav = 400;
    const ft   = Math.max(dist / 250, 0.3);
    const vx   = dx / ft;
    const vy   = dy / ft - (grav * ft) / 2;
    arrowSprite.setRotation(Math.atan2(vy, vx));
    if (dx < 0) arrowSprite.setFlipY(true);
    this.arrows.push({ sprite: arrowSprite, vx, vy, gravity: grav, damage: attacker.damage, targetUnit: target });
  }

  // ── Death ─────────────────────────────────────────────────────────────────
  private applyDeath(unit: UnitData) {
    // Free the grid cell
    if (unit.gridCell && unit.gridCell.occupant === unit) unit.gridCell.occupant = null;
    unit.gridCell = null;

    unit.sprite.stop();
    unit.sprite.setTint(0xff4444);
    this.tweens.add({
      targets: unit.sprite, alpha: 0, duration: 600,
      onComplete: () => { unit.sprite.setVisible(false); unit.hpBar.clear(); },
    });
  }

  // ── HP Bar ────────────────────────────────────────────────────────────────
  drawHpBar(unit: UnitData) {
    unit.displayHp += (unit.hp - unit.displayHp) * 0.08;
    if (Math.abs(unit.displayHp - unit.hp) < 0.5) unit.displayHp = unit.hp;

    const g  = unit.hpBar;
    g.clear();
    const W  = 44, H = 4;
    const bx = unit.sprite.x - W / 2;
    const by = unit.sprite.y - (unit.unitType === "warrior" ? 72 : unit.unitType === "lancer" ? 68 : 65);

    g.fillStyle(0x1a1a2e, 0.9);  g.fillRoundedRect(bx - 1, by - 1, W + 2, H + 2, 2);
    g.fillStyle(0x333344, 1);    g.fillRoundedRect(bx, by, W, H, 2);

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

    if (unit.state === "cooldown") {
      unit.cooldownTimer -= delta;
      if (unit.cooldownTimer <= 0) this.setState(unit, "idle");
      return;
    }

    const enemies = this.enemiesOf(unit);
    const target  = this.nearestAlive(unit, enemies);

    if (!target) {
      if (unit.state !== "idle") this.setState(unit, "idle");
      return;
    }

    const dist = Phaser.Math.Distance.Between(unit.sprite.x, unit.sprite.y, target.sprite.x, target.sprite.y);

    switch (unit.unitType) {
      case "archer":  this.updateArcher(unit, target, dist);          break;
      case "warrior": this.updateWarrior(unit, target, dist);         break;
      case "lancer":  this.updateLancer(unit, target, dist);          break;
    }
  }

  // ── Archer AI ─────────────────────────────────────────────────────────────
  private updateArcher(unit: UnitData, target: UnitData, dist: number) {
    if (dist > unit.attackRange) {
      if (unit.state !== "moving") this.setState(unit, "moving");
      this.moveUnitToward(unit, target.sprite.x, target.sprite.y);
    } else {
      if (unit.state === "idle" || unit.state === "moving") this.setState(unit, "attacking");
    }
  }

  // ── Warrior AI ────────────────────────────────────────────────────────────
  private updateWarrior(unit: UnitData, target: UnitData, dist: number) {
    if (dist > unit.meleeRange) {
      if (unit.state !== "moving") this.setState(unit, "moving");
      this.moveUnitToward(unit, target.sprite.x, target.sprite.y);
    } else {
      if (unit.state === "idle" || unit.state === "moving") this.setState(unit, "attacking");
    }
  }

  // ── Lancer AI ─────────────────────────────────────────────────────────────
  private updateLancer(unit: UnitData, target: UnitData, dist: number) {
    if (dist > unit.attackRange) {
      if (unit.state !== "moving") this.setState(unit, "moving");
      this.moveUnitToward(unit, target.sprite.x, target.sprite.y);
    } else {
      if (unit.state === "idle" || unit.state === "moving") this.setState(unit, "attacking");
    }
  }

  // ── Grid-aware movement ────────────────────────────────────────────────────
  private moveUnitToward(unit: UnitData, targetX: number, targetY: number) {
    const dx  = targetX - unit.sprite.x;
    const dy  = targetY - unit.sprite.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const nx = (dx / len) * unit.speed;
    const ny = (dy / len) * unit.speed * 0.35;

    const newX = unit.sprite.x + nx;
    const newY = unit.sprite.y + ny;

    // Update grid occupancy when crossing cell boundary
    const newCell = this.worldToCell(newX, newY);
    if (newCell && newCell !== unit.gridCell) {
      if (!newCell.occupant || newCell.occupant === unit) {
        // Vacate old cell
        if (unit.gridCell && unit.gridCell.occupant === unit) unit.gridCell.occupant = null;
        newCell.occupant = unit;
        unit.gridCell    = newCell;
      }
      // else: cell occupied — don't move into it
      else return;
    }

    unit.sprite.x = newX;
    unit.sprite.y = newY;
    unit.sprite.setDepth(10 + Math.floor(unit.sprite.y / CELL_H));
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

  // ── Public commands ───────────────────────────────────────────────────────
  startBattle() {
    if (this.battleStarted) return;
    if (this.teamBlue.length === 0 || this.teamRed.length === 0) return;
    this.battleStarted = true;
    this.gridGraphics.clear();
    this.hoverGraphics.clear();
    this.placementText.setVisible(false);
  }

  clearAll() {
    for (const u of [...this.teamBlue, ...this.teamRed]) {
      if (u.gridCell) u.gridCell.occupant = null;
      u.sprite.destroy();
      u.hpBar.destroy();
    }
    for (const a of this.arrows) a.sprite.destroy();
    this.teamBlue  = [];
    this.teamRed   = [];
    this.arrows    = [];
    this.battleStarted = false;
    // Reset grid occupancy
    for (const row of this.grid) for (const cell of row) cell.occupant = null;
    this.drawGrid();
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

    // Arrow physics
    const dt = delta / 1000;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i];
      arrow.vy += arrow.gravity * dt;
      arrow.sprite.x += arrow.vx * dt;
      arrow.sprite.y += arrow.vy * dt;
      arrow.sprite.setRotation(Math.atan2(arrow.vy, arrow.vx));

      const t    = arrow.targetUnit;
      const adx  = arrow.sprite.x - t.sprite.x;
      const ady  = arrow.sprite.y - (t.sprite.y - 20);
      const adist = Math.sqrt(adx * adx + ady * ady);

      if (adist < 28 || arrow.sprite.x < -50 || arrow.sprite.x > GAME_W + 50 || arrow.sprite.y > GAME_H + 50) {
        if (adist < 28 && t.state !== "dead") {
          t.hp -= arrow.damage;
          t.sprite.setTint(0xffffff);
          this.time.delayedCall(100, () => { if (t.state !== "dead") t.sprite.clearTint(); });
          this.tweens.add({ targets: t.sprite, x: t.sprite.x + (arrow.vx > 0 ? 1 : -1) * 6, duration: 50, yoyo: true });
          if (t.hp <= 0) { t.hp = 0; this.setState(t, "dead"); }
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
