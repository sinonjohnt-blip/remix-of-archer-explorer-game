import Phaser from "phaser";
import type {
  UnitData, ArrowProjectile, UnitType, UnitState, Team,
  GridCell, UnitAbilities, PawnWeapon,
} from "../types";
import {
  GRID_COLS, GRID_ROWS, CELL_W, CELL_H, GAME_W, GAME_H,
} from "../types";

// ── Gold costs ────────────────────────────────────────────────────────────────
const UNIT_COSTS: Record<UnitType, number> = { archer: 50, warrior: 80, lancer: 100, monk: 60, pawn: 70 };

// ── Sprite sheet frame sizes ───────────────────────────────────────────────────
const ARCHER_FRAME  = 192;
const WARRIOR_FRAME = 192;
const MONK_FRAME    = 192;
const PAWN_FRAME    = 192;
const LANCER_IDLE_FRAME = 160;
const LANCER_FRAME = 320;

// ── Blue team occupies cols 0–half; Red team occupies rest ────────────────────
const BLUE_MAX_COL = Math.floor(GRID_COLS / 2) - 1;
const RED_MIN_COL  = Math.floor(GRID_COLS / 2);

// ── Sprite scales (reduced for compact grid) ─────────────────────────────────
const SPRITE_SCALE: Record<UnitType, number> = {
  archer: 0.5, warrior: 0.55, lancer: 0.95, monk: 0.5, pawn: 0.5,
};
const LANCER_IDLE_SCALE   = 0.95;
const LANCER_ACTION_SCALE = 0.45;

// ── Pawn weapon stats ────────────────────────────────────────────────────────
interface PawnWeaponStats {
  damage: number;
  cooldown: number;
  armorPierce: number;
}
const PAWN_WEAPONS: Record<PawnWeapon, PawnWeaponStats> = {
  axe:     { damage: 15, cooldown: 1000, armorPierce: 0 },
  knife:   { damage: 8,  cooldown: 400,  armorPierce: 0 },
  hammer:  { damage: 25, cooldown: 1500, armorPierce: 0 },
  pickaxe: { damage: 18, cooldown: 1000, armorPierce: 0.4 },
};
const WEAPON_SWITCH_COOLDOWN = 750;

// ── Terrain decoration count ─────────────────────────────────────────────────
const NUM_BUSHES = 6;
const NUM_ROCKS  = 8;

// ─────────────────────────────────────────────────────────────────────────────
//  Modular ability definitions
// ─────────────────────────────────────────────────────────────────────────────

function archerAbilities(): UnitAbilities {
  return {
    resolveAttack: () => [],
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

function lancerDirectionalAnim(unit: UnitData, prefix: "attack" | "guard"): string {
  const dir = (unit as any)._atkDir as string | undefined;
  if (dir && prefix === "attack") return `lancer-${dir}-attack`;
  if (dir && prefix === "guard")  return `lancer-${dir}-guard`;
  return unit.direction === 1 ? `lancer-right-${prefix}` : `lancer-right-${prefix}`;
}

function lancerAbilities(): UnitAbilities {
  return {
    resolveAttack: (attacker, primary, grid) => {
      const cell = attacker.gridCell;
      if (!cell) return [primary];
      const stepCol = attacker.direction;
      const targets: UnitData[] = [];
      for (let i = 1; i <= 2; i++) {
        const c = cell.col + stepCol * i;
        const r = cell.row;
        if (c < 0 || c >= GRID_COLS || r < 0 || r >= GRID_ROWS) break;
        const occ = grid[r][c].occupant;
        if (occ && occ.state !== "dead" && occ.team !== attacker.team) targets.push(occ);
      }
      return targets.length ? targets : (primary.state !== "dead" ? [primary] : []);
    },
    cooldownAnim: (unit) => lancerDirectionalAnim(unit, "guard"),
    attackAnim:   (unit) => lancerDirectionalAnim(unit, "attack"),
  };
}

const MONK_HEAL_RANGE_CELLS = 3;
const MONK_HEAL_AMOUNT      = 30;
const MONK_HEAL_COOLDOWN    = 1800;
const MONK_CAST_DELAY       = 400;

function monkAbilities(): UnitAbilities {
  return {
    resolveAttack: () => [],
    cooldownAnim:  () => "monk-idle",
    attackAnim:    () => "monk-heal",
  };
}

function pawnAbilities(): UnitAbilities {
  return {
    resolveAttack: (_attacker, target) => [target],
    cooldownAnim:  (unit) => `pawn-idle-${unit.weapon ?? "axe"}`,
    attackAnim:    (unit) => `pawn-attack-${unit.weapon ?? "axe"}`,
  };
}

function evaluatePawnWeapon(target: UnitData): PawnWeapon {
  const hpPct = target.hp / target.maxHp;
  if (target.armor > 5)    return "pickaxe";
  if (hpPct > 0.7)         return "hammer";
  if (hpPct < 0.3)         return "knife";
  return "axe";
}

// ─────────────────────────────────────────────────────────────────────────────
export class MainScene extends Phaser.Scene {
  teamBlue: UnitData[]        = [];
  teamRed:  UnitData[]        = [];
  arrows:   ArrowProjectile[] = [];
  battleStarted = false;
  selectedUnitType: UnitType = "archer";
  goldRef: { blue: number; red: number } = { blue: 500, red: 500 };

  private grid: GridCell[][] = [];
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private hoverGraphics!: Phaser.GameObjects.Graphics;
  private placementText!: Phaser.GameObjects.Text;
  private terrainSprites: Phaser.GameObjects.Image[] = [];

  constructor() { super("MainScene"); }

  // ── Preload ────────────────────────────────────────────────────────────────
  preload() {
    // Archer
    this.load.spritesheet("idle",  "/assets/Archer_Idle.png",  { frameWidth: ARCHER_FRAME, frameHeight: ARCHER_FRAME });
    this.load.spritesheet("run",   "/assets/Archer_Run.png",   { frameWidth: ARCHER_FRAME, frameHeight: ARCHER_FRAME });
    this.load.spritesheet("shoot", "/assets/Archer_Shoot.png", { frameWidth: ARCHER_FRAME, frameHeight: ARCHER_FRAME });
    this.load.image("arrow", "/assets/Arrow.png");

    // Warrior
    this.load.spritesheet("w-idle",    "/assets/Warrior_Idle.png",    { frameWidth: WARRIOR_FRAME, frameHeight: WARRIOR_FRAME });
    this.load.spritesheet("w-run",     "/assets/Warrior_Run.png",     { frameWidth: WARRIOR_FRAME, frameHeight: WARRIOR_FRAME });
    this.load.spritesheet("w-attack1", "/assets/Warrior_Attack1.png", { frameWidth: WARRIOR_FRAME, frameHeight: WARRIOR_FRAME });
    this.load.spritesheet("w-attack2", "/assets/Warrior_Attack2.png", { frameWidth: WARRIOR_FRAME, frameHeight: WARRIOR_FRAME });
    this.load.spritesheet("w-guard",   "/assets/Warrior_Guard.png",   { frameWidth: WARRIOR_FRAME, frameHeight: WARRIOR_FRAME });

    // Monk
    this.load.spritesheet("m-idle", "/assets/Monk_Idle.png", { frameWidth: MONK_FRAME, frameHeight: MONK_FRAME });
    this.load.spritesheet("m-run",  "/assets/Monk_Run.png",  { frameWidth: MONK_FRAME, frameHeight: MONK_FRAME });
    this.load.image("m-heal-img",        "/assets/Monk_Heal.png");
    this.load.image("m-heal-effect-img", "/assets/Monk_Heal_Effect.png");

    // Lancer
    this.load.spritesheet("l-idle",             "/assets/Lancer_Idle.png",             { frameWidth: LANCER_IDLE_FRAME, frameHeight: LANCER_IDLE_FRAME });
    this.load.spritesheet("l-run",              "/assets/Lancer_Run.png",              { frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });
    this.load.spritesheet("l-right-attack",     "/assets/Lancer_Right_Attack.png",     { frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });
    this.load.spritesheet("l-right-guard",      "/assets/Lancer_Right_Defence.png",    { frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });
    this.load.spritesheet("l-up-attack",        "/assets/Lancer_Up_Attack.png",        { frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });
    this.load.spritesheet("l-up-guard",         "/assets/Lancer_Up_Defence.png",       { frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });
    this.load.spritesheet("l-down-attack",      "/assets/Lancer_Down_Attack.png",      { frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });
    this.load.spritesheet("l-down-guard",       "/assets/Lancer_Down_Defence.png",     { frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });
    this.load.spritesheet("l-upright-attack",   "/assets/Lancer_UpRight_Attack.png",   { frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });
    this.load.spritesheet("l-upright-guard",    "/assets/Lancer_UpRight_Defence.png",  { frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });
    this.load.spritesheet("l-downright-attack", "/assets/Lancer_DownRight_Attack.png", { frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });
    this.load.spritesheet("l-downright-guard",  "/assets/Lancer_DownRight_Defence.png",{ frameWidth: LANCER_FRAME, frameHeight: LANCER_FRAME });

    // Pawn — idle + run for each weapon + base
    this.load.spritesheet("p-idle",         "/assets/Pawn_Idle.png",         { frameWidth: PAWN_FRAME, frameHeight: PAWN_FRAME });
    this.load.spritesheet("p-idle-axe",     "/assets/Pawn_Idle_Axe.png",     { frameWidth: PAWN_FRAME, frameHeight: PAWN_FRAME });
    this.load.spritesheet("p-idle-hammer",  "/assets/Pawn_Idle_Hammer.png",  { frameWidth: PAWN_FRAME, frameHeight: PAWN_FRAME });
    this.load.spritesheet("p-idle-knife",   "/assets/Pawn_Idle_Knife.png",   { frameWidth: PAWN_FRAME, frameHeight: PAWN_FRAME });
    this.load.spritesheet("p-idle-pickaxe", "/assets/Pawn_Idle_Pickaxe.png", { frameWidth: PAWN_FRAME, frameHeight: PAWN_FRAME });
    this.load.spritesheet("p-run",          "/assets/Pawn_Run.png",          { frameWidth: PAWN_FRAME, frameHeight: PAWN_FRAME });
    this.load.spritesheet("p-run-axe",      "/assets/Pawn_Run_Axe.png",      { frameWidth: PAWN_FRAME, frameHeight: PAWN_FRAME });
    this.load.spritesheet("p-run-hammer",   "/assets/Pawn_Run_Hammer.png",   { frameWidth: PAWN_FRAME, frameHeight: PAWN_FRAME });
    this.load.spritesheet("p-run-knife",    "/assets/Pawn_Run_Knife.png",    { frameWidth: PAWN_FRAME, frameHeight: PAWN_FRAME });
    this.load.spritesheet("p-run-pickaxe",  "/assets/Pawn_Run_Pickaxe.png",  { frameWidth: PAWN_FRAME, frameHeight: PAWN_FRAME });

    // Pawn — attack (interact) sprites loaded as images for dynamic spritesheet
    this.load.image("p-atk-axe-img",     "/assets/Pawn_Interact_Axe.png");
    this.load.image("p-atk-hammer-img",  "/assets/Pawn_Interact_Hammer.png");
    this.load.image("p-atk-knife-img",   "/assets/Pawn_Interact_Knife.png");
    this.load.image("p-atk-pickaxe-img", "/assets/Pawn_Interact_Pickaxe.png");

    // Terrain
    this.load.image("bush1", "/assets/Bushe1.png");
    this.load.image("rock1", "/assets/Rock1.png");
    this.load.image("rock2", "/assets/Rock2.png");
    this.load.image("rock3", "/assets/Rock3.png");
    this.load.image("rock4", "/assets/Rock4.png");

    // Dust effect
    this.load.image("dust-img", "/assets/Dust_01.png");
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  create() {
    this.arrows        = [];
    this.teamBlue      = [];
    this.teamRed       = [];
    this.battleStarted = false;

    this.buildGrid();
    this.createAnims();
    this.spawnTerrain();

    this.gridGraphics  = this.add.graphics();
    this.hoverGraphics = this.add.graphics();
    this.drawGrid();

    this.placementText = this.add.text(GAME_W / 2, 14,
      "Left-click = Place  ·  Right-click = Remove  ·  Left half = Blue  |  Right half = Red", {
        fontSize: "10px",
        color: "#e8d5a3",
        backgroundColor: "#1a150eaa",
        padding: { x: 8, y: 3 },
      }).setOrigin(0.5).setDepth(20);

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.battleStarted) { this.hoverGraphics.clear(); return; }
      this.drawHoverCell(p.x, p.y);
    });

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) {
        this.tryRemoveUnit(p.x, p.y);
      } else {
        this.tryPlaceUnit(p.x, p.y);
      }
    });

    this.game.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    if (import.meta.env.DEV) {
      this.time.delayedCall(500, () => this.runDevTests());
    }
  }

  // ── Build grid ────────────────────────────────────────────────────────────
  private buildGrid() {
    this.grid = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      const row: GridCell[] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        row.push({
          col: c, row: r,
          worldX: c * CELL_W + CELL_W / 2,
          worldY: r * CELL_H + CELL_H / 2,
          occupant: null,
        });
      }
      this.grid.push(row);
    }
  }

  // ── Spawn terrain decorations ─────────────────────────────────────────────
  private spawnTerrain() {
    for (const s of this.terrainSprites) s.destroy();
    this.terrainSprites = [];

    // Bush spritesheet: use first frame only (it's a strip)
    const bushSrc = this.textures.get("bush1").getSourceImage() as HTMLImageElement;
    const bushFrameW = bushSrc.height; // assume square frames
    const bushNumFrames = Math.max(1, Math.floor(bushSrc.width / bushFrameW));
    if (!this.textures.exists("bush1-ss")) {
      this.textures.addSpriteSheet("bush1-ss", bushSrc, { frameWidth: bushFrameW, frameHeight: bushFrameW });
    }

    // Dust spritesheet
    const dustSrc = this.textures.get("dust-img").getSourceImage() as HTMLImageElement;
    const dustFrameW = dustSrc.height;
    const dustNumFrames = Math.max(1, Math.floor(dustSrc.width / dustFrameW));
    if (!this.textures.exists("dust-ss")) {
      this.textures.addSpriteSheet("dust-ss", dustSrc, { frameWidth: dustFrameW, frameHeight: dustFrameW });
    }
    if (!this.anims.exists("dust-poof")) {
      this.anims.create({
        key: "dust-poof",
        frames: this.anims.generateFrameNumbers("dust-ss", { start: 0, end: Math.max(0, dustNumFrames - 1) }),
        frameRate: 12, repeat: 0,
      });
    }

    // Place bushes (random positions, low depth)
    for (let i = 0; i < NUM_BUSHES; i++) {
      const frame = Phaser.Math.Between(0, bushNumFrames - 1);
      const x = Phaser.Math.Between(40, GAME_W - 40);
      const y = Phaser.Math.Between(40, GAME_H - 40);
      const s = this.add.image(x, y, "bush1-ss", frame).setScale(0.5 + Math.random() * 0.3).setDepth(1).setAlpha(0.6);
      this.terrainSprites.push(s);
    }

    // Place rocks
    const rockKeys = ["rock1", "rock2", "rock3", "rock4"];
    for (let i = 0; i < NUM_ROCKS; i++) {
      const key = rockKeys[Phaser.Math.Between(0, 3)];
      const x = Phaser.Math.Between(30, GAME_W - 30);
      const y = Phaser.Math.Between(30, GAME_H - 30);
      const s = this.add.image(x, y, key).setScale(0.4 + Math.random() * 0.3).setDepth(1).setAlpha(0.5);
      this.terrainSprites.push(s);
    }
  }

  // ── Spawn dust effect at position ─────────────────────────────────────────
  private spawnDust(x: number, y: number) {
    try {
      const dust = this.add.sprite(x, y + 10, "dust-ss").setScale(0.4).setDepth(5).setAlpha(0.7);
      dust.play("dust-poof");
      dust.once("animationcomplete", () => dust.destroy());
      this.time.delayedCall(1000, () => { if (dust?.active) dust.destroy(); });
    } catch (_) { /* skip if texture issue */ }
  }

  // ── Draw grid ─────────────────────────────────────────────────────────────
  private drawGrid() {
    const g = this.gridGraphics;
    g.clear();
    const divX = RED_MIN_COL * CELL_W;
    g.lineStyle(2, 0xffffff, 0.25);
    g.lineBetween(divX, 0, divX, GAME_H);
    g.fillStyle(0x3399ff, 0.04);
    g.fillRect(0, 0, divX, GAME_H);
    g.fillStyle(0xff4455, 0.04);
    g.fillRect(divX, 0, GAME_W - divX, GAME_H);
    g.lineStyle(1, 0xffffff, 0.08);
    for (let c = 0; c <= GRID_COLS; c++) g.lineBetween(c * CELL_W, 0, c * CELL_W, GAME_H);
    for (let r = 0; r <= GRID_ROWS; r++) g.lineBetween(0, r * CELL_H, GAME_W, r * CELL_H);
  }

  // ── Hover ─────────────────────────────────────────────────────────────────
  private drawHoverCell(px: number, py: number) {
    const cell = this.worldToCell(px, py);
    const h    = this.hoverGraphics;
    h.clear();
    if (!cell) return;
    const occupied = !!cell.occupant;
    let canPlace: boolean;
    if (!this.battleStarted) {
      canPlace = !occupied;
    } else {
      const team: Team = cell.col < RED_MIN_COL ? "blue" : "red";
      const cost = UNIT_COSTS[this.selectedUnitType];
      const hasGold = (team === "blue" ? this.goldRef.blue : this.goldRef.red) >= cost;
      canPlace = hasGold && !occupied;
    }
    const color = canPlace ? 0x88ffaa : 0xff4444;
    const alpha = canPlace ? 0.18 : 0.25;
    h.fillStyle(color, alpha);
    h.fillRect(cell.col * CELL_W + 1, cell.row * CELL_H + 1, CELL_W - 2, CELL_H - 2);
    h.lineStyle(2, color, canPlace ? 0.5 : 0.9);
    h.strokeRect(cell.col * CELL_W + 1, cell.row * CELL_H + 1, CELL_W - 2, CELL_H - 2);
  }

  // ── Place unit ────────────────────────────────────────────────────────────
  private tryPlaceUnit(px: number, py: number) {
    const cell = this.worldToCell(px, py);
    if (!cell) return;
    const team: Team = cell.col < RED_MIN_COL ? "blue" : "red";
    const cost       = UNIT_COSTS[this.selectedUnitType];
    if (this.battleStarted) {
      const currentGold = team === "blue" ? this.goldRef.blue : this.goldRef.red;
      if (currentGold < cost) { this.flashCell(cell, 0xff4444); return; }
    }
    if (cell.occupant) { this.flashCell(cell, 0xff4444); return; }
    const unit    = this.spawnUnit(cell, team, this.selectedUnitType);
    cell.occupant = unit;
    unit.gridCell = cell;
    if (team === "blue") this.teamBlue.push(unit);
    else                  this.teamRed.push(unit);
    if (this.battleStarted) {
      this.events.emit("unit-placed", { team, cost });
    }
  }

  // ── Remove unit (right-click, pre-battle only) ────────────────────────────
  private tryRemoveUnit(px: number, py: number) {
    if (this.battleStarted) return;
    const cell = this.worldToCell(px, py);
    if (!cell || !cell.occupant) return;
    const unit = cell.occupant;
    const cost = UNIT_COSTS[unit.unitType];
    this.events.emit("unit-removed", { team: unit.team, cost });
    cell.occupant = null;
    unit.gridCell = null;
    unit.sprite.destroy();
    unit.hpBar.destroy();
    if (unit.team === "blue") this.teamBlue = this.teamBlue.filter(u => u !== unit);
    else                       this.teamRed  = this.teamRed.filter(u => u !== unit);
    this.flashCell(cell, 0xffcc00);
  }

  // ── Flash cell ────────────────────────────────────────────────────────────
  private flashCell(cell: GridCell, color: number) {
    const g = this.add.graphics().setDepth(30);
    g.fillStyle(color, 0.45);
    g.fillRect(cell.col * CELL_W + 1, cell.row * CELL_H + 1, CELL_W - 2, CELL_H - 2);
    this.time.delayedCall(300, () => g.destroy());
  }

  // ── World → Cell ──────────────────────────────────────────────────────────
  worldToCell(px: number, py: number): GridCell | null {
    const col = Math.floor(px / CELL_W);
    const row = Math.floor(py / CELL_H);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;
    return this.grid[row][col];
  }

  // ── Animations ────────────────────────────────────────────────────────────
  private createAnims() {
    const def = (key: string, tex: string, start: number, end: number, rate = 8, repeat = -1) => {
      if (this.anims.exists(key)) this.anims.remove(key);
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
    def("lancer-idle",             "l-idle",             0, 11, 8);
    def("lancer-run",              "l-run",              0, 5,  8);
    def("lancer-right-attack",     "l-right-attack",     0, 2,  10, 0);
    def("lancer-right-guard",      "l-right-guard",      0, 5,  8);
    def("lancer-up-attack",        "l-up-attack",        0, 2,  10, 0);
    def("lancer-up-guard",         "l-up-guard",         0, 5,  8);
    def("lancer-down-attack",      "l-down-attack",      0, 2,  10, 0);
    def("lancer-down-guard",       "l-down-guard",       0, 5,  8);
    def("lancer-upright-attack",   "l-upright-attack",   0, 2,  10, 0);
    def("lancer-upright-guard",    "l-upright-guard",    0, 5,  8);
    def("lancer-downright-attack", "l-downright-attack", 0, 2,  10, 0);
    def("lancer-downright-guard",  "l-downright-guard",  0, 5,  8);

    // Monk — heal spritesheets created dynamically
    const miFrames = Math.max(1, this.textures.get("m-idle").frameTotal - 1);
    const mrFrames = Math.max(1, this.textures.get("m-run").frameTotal - 1);
    def("monk-idle", "m-idle", 0, miFrames - 1);
    def("monk-run",  "m-run",  0, mrFrames - 1);

    const healKeys = [
      { imgKey: "m-heal-img", ssKey: "m-heal", animKey: "monk-heal" },
      { imgKey: "m-heal-effect-img", ssKey: "m-heal-effect", animKey: "monk-heal-effect" },
    ];
    for (const { imgKey, ssKey, animKey } of healKeys) {
      const src = this.textures.get(imgKey).getSourceImage() as HTMLImageElement;
      const h = src.height;
      const w = src.width;
      const frameSize = h;
      const numFrames = Math.floor(w / frameSize);
      if (!this.textures.exists(ssKey)) {
        this.textures.addSpriteSheet(ssKey, src, { frameWidth: frameSize, frameHeight: frameSize });
      }
      if (this.anims.exists(animKey)) this.anims.remove(animKey);
      this.anims.create({
        key: animKey,
        frames: this.anims.generateFrameNumbers(ssKey, { start: 0, end: Math.max(0, numFrames - 1) }),
        frameRate: 8, repeat: 0,
      });
    }

    // Pawn — idle and run for each weapon + base
    const pawnIdleFrames = Math.max(1, this.textures.get("p-idle").frameTotal - 1);
    const pawnRunFrames  = Math.max(1, this.textures.get("p-run").frameTotal - 1);
    def("pawn-idle",  "p-idle",  0, pawnIdleFrames - 1);
    def("pawn-run",   "p-run",   0, pawnRunFrames - 1);

    const weapons: PawnWeapon[] = ["axe", "hammer", "knife", "pickaxe"];
    for (const w of weapons) {
      const idleTex = `p-idle-${w}`;
      const runTex  = `p-run-${w}`;
      const idleF = Math.max(1, this.textures.get(idleTex).frameTotal - 1);
      const runF  = Math.max(1, this.textures.get(runTex).frameTotal - 1);
      def(`pawn-idle-${w}`, idleTex, 0, idleF - 1);
      def(`pawn-run-${w}`,  runTex,  0, runF - 1);
    }

    // Pawn — attack anims from Interact spritesheets (dynamic)
    const atkKeys: { weapon: PawnWeapon; imgKey: string; ssKey: string }[] = [
      { weapon: "axe",     imgKey: "p-atk-axe-img",     ssKey: "p-atk-axe" },
      { weapon: "hammer",  imgKey: "p-atk-hammer-img",  ssKey: "p-atk-hammer" },
      { weapon: "knife",   imgKey: "p-atk-knife-img",   ssKey: "p-atk-knife" },
      { weapon: "pickaxe", imgKey: "p-atk-pickaxe-img", ssKey: "p-atk-pickaxe" },
    ];
    for (const { weapon, imgKey, ssKey } of atkKeys) {
      const src = this.textures.get(imgKey).getSourceImage() as HTMLImageElement;
      const frameSize = src.height;
      const numFrames = Math.max(1, Math.floor(src.width / frameSize));
      if (!this.textures.exists(ssKey)) {
        this.textures.addSpriteSheet(ssKey, src, { frameWidth: frameSize, frameHeight: frameSize });
      }
      const animKey = `pawn-attack-${weapon}`;
      if (this.anims.exists(animKey)) this.anims.remove(animKey);
      this.anims.create({
        key: animKey,
        frames: this.anims.generateFrameNumbers(ssKey, { start: 0, end: Math.max(0, numFrames - 1) }),
        frameRate: 12, repeat: 0,
      });
    }
  }

  // ── Spawn unit ────────────────────────────────────────────────────────────
  private spawnUnit(cell: GridCell, team: Team, unitType: UnitType): UnitData {
    const isBlue    = team === "blue";
    const teamColor = isBlue ? 0x3399ff : 0xff4455;
    const direction = isBlue ? 1 : -1;
    const flipX     = !isBlue;

    let hp: number, damage: number, attackRangeCells: number, speed: number, attackDuration: number;
    let idleAnim: string;
    let abilities: UnitAbilities;
    let armor = 0;
    const scale = SPRITE_SCALE[unitType];

    switch (unitType) {
      case "archer":
        hp = 100; damage = 15; attackRangeCells = 5; speed = 0.8; attackDuration = 700;
        idleAnim = "archer-idle"; abilities = archerAbilities(); break;
      case "warrior":
        hp = 200; damage = 22; attackRangeCells = 1; speed = 1.2; attackDuration = 500;
        armor = 8; idleAnim = "warrior-idle"; abilities = warriorAbilities(); break;
      case "lancer":
        hp = 160; damage = 18; attackRangeCells = 1; speed = 1.0; attackDuration = 700;
        armor = 4; idleAnim = "lancer-idle"; abilities = lancerAbilities(); break;
      case "monk":
        hp = 80; damage = 0; attackRangeCells = 0; speed = 0.8; attackDuration = 800;
        idleAnim = "monk-idle"; abilities = monkAbilities(); break;
      case "pawn":
        hp = 160; damage = 15; attackRangeCells = 1; speed = 1.32; attackDuration = 600;
        armor = 3; idleAnim = "pawn-idle-axe"; abilities = pawnAbilities(); break;
    }

    const texKey = unitType === "archer" ? "idle"
      : unitType === "warrior" ? "w-idle"
      : unitType === "monk" ? "m-idle"
      : unitType === "lancer" ? "l-idle"
      : "p-idle-axe";
    const sprite = this.add.sprite(cell.worldX, cell.worldY, texKey);
    sprite.setScale(scale);
    sprite.setFlipX(flipX);
    sprite.play(idleAnim);
    sprite.setDepth(10 + cell.row);

    const meleeRange = attackRangeCells * CELL_W + CELL_W * 0.4;

    const unit: UnitData = {
      sprite, hp, maxHp: hp, displayHp: hp, damage,
      attackRange: meleeRange, meleeRange,
      state: "idle", cooldownTimer: 0, attackDuration,
      direction, hpBar: this.add.graphics().setDepth(50),
      teamColor, unitType, team, speed,
      gridCell: cell, abilities, armor,
    };

    if (unitType === "pawn") {
      unit.weapon = "axe";
      unit.weaponSwitchCooldown = 0;
    }

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
      unit.sprite.on("animationcomplete", (anim: Phaser.Animations.Animation) => {
        if (unit.state === "dead") return;
        if (!anim.key.includes("lancer-") || !anim.key.includes("-attack")) return;
        const enemies = this.enemiesOf(unit);
        const primary = this.nearestAlive(unit, enemies);
        if (primary) {
          const hits = unit.abilities.resolveAttack(unit, primary, this.grid);
          for (const target of hits) this.applyMeleeDamage(unit, target);
        }
        this.setState(unit, "cooldown");
        unit.cooldownTimer = unit.attackDuration + 400;
      });
    }

    if (unit.unitType === "pawn") {
      unit.sprite.on("animationcomplete", (anim: Phaser.Animations.Animation) => {
        if (unit.state === "dead") return;
        if (!anim.key.startsWith("pawn-attack-")) return;
        const target = this.nearestAlive(unit, this.enemiesOf(unit));
        if (target) {
          const dist = Phaser.Math.Distance.Between(unit.sprite.x, unit.sprite.y, target.sprite.x, target.sprite.y);
          if (dist <= unit.meleeRange + 10) this.applyPawnDamage(unit, target);
        }
        this.setState(unit, "cooldown");
        const w = unit.weapon ?? "axe";
        unit.cooldownTimer = PAWN_WEAPONS[w].cooldown;
      });
    }
  }

  // ── Compute lancer facing direction ───────────────────────────────────────
  private computeLancerDirection(unit: UnitData, target: UnitData): string {
    const dx = target.sprite.x - unit.sprite.x;
    const dy = target.sprite.y - unit.sprite.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDy < absDx * 0.3) return "right";
    if (absDx < absDy * 0.3) return dy < 0 ? "up" : "down";
    return dy < 0 ? "upright" : "downright";
  }

  // ── State machine ─────────────────────────────────────────────────────────
  setState(unit: UnitData, next: UnitState) {
    if (unit.state === "dead") return;
    unit.state = next;

    const setLancerScale = (isIdle: boolean) => {
      if (unit.unitType === "lancer") {
        unit.sprite.setScale(isIdle ? LANCER_IDLE_SCALE : LANCER_ACTION_SCALE);
      }
    };

    switch (next) {
      case "idle":
        setLancerScale(true);
        if (unit.unitType === "pawn") {
          unit.sprite.play(`pawn-idle-${unit.weapon ?? "axe"}`, true);
        } else {
          unit.sprite.play(
            unit.unitType === "monk" ? "monk-idle" :
            unit.unitType === "archer" ? "archer-idle" :
            unit.unitType === "warrior" ? "warrior-idle" : "lancer-idle", true);
        }
        break;
      case "moving":
        setLancerScale(false);
        if (unit.unitType === "pawn") {
          unit.sprite.play(`pawn-run-${unit.weapon ?? "axe"}`, true);
        } else {
          unit.sprite.play(
            unit.unitType === "monk" ? "monk-run" :
            unit.unitType === "archer" ? "archer-run" :
            unit.unitType === "warrior" ? "warrior-run" : "lancer-run", true);
        }
        break;
      case "attacking":
        setLancerScale(false);
        if (unit.unitType === "pawn") {
          unit.sprite.play(`pawn-attack-${unit.weapon ?? "axe"}`, true);
        } else {
          unit.sprite.play(unit.abilities.attackAnim(unit), true);
        }
        break;
      case "healing": {
        const healAnim = this.anims.get("monk-heal");
        if (healAnim && healAnim.frames.length > 0) {
          unit.sprite.play("monk-heal", true);
        } else {
          unit.state = "cooldown";
          unit.cooldownTimer = MONK_HEAL_COOLDOWN;
        }
        break;
      }
      case "cooldown":
        setLancerScale(false);
        if (unit.unitType === "pawn") {
          unit.sprite.play(`pawn-idle-${unit.weapon ?? "axe"}`, true);
        } else {
          unit.sprite.play(unit.abilities.cooldownAnim(unit), true);
        }
        break;
      case "dead":
        this.applyDeath(unit);
        break;
    }
  }

  // ── Pawn damage (applies weapon stats + armor pierce) ─────────────────────
  private applyPawnDamage(attacker: UnitData, target: UnitData) {
    if (target.state === "dead") return;
    const w = attacker.weapon ?? "axe";
    const stats = PAWN_WEAPONS[w];
    const armorReduction = target.armor * (1 - stats.armorPierce);
    const dmg = Math.max(1, stats.damage - armorReduction);
    target.hp -= dmg;
    // Dust on hit
    this.spawnDust(target.sprite.x, target.sprite.y);
    // Lunge & knockback
    const lungeX = attacker.sprite.x + attacker.direction * 8;
    this.tweens.add({ targets: attacker.sprite, x: lungeX, duration: 80, yoyo: true, ease: "Power2" });
    this.tweens.add({ targets: target.sprite, x: target.sprite.x + attacker.direction * 10, duration: 120, yoyo: true, ease: "Power1" });
    target.sprite.setTint(0xffffff);
    this.time.delayedCall(120, () => { if (target.state !== "dead") target.sprite.clearTint(); });
    if (target.hp <= 0) { target.hp = 0; this.setState(target, "dead"); }
  }

  // ── Melee damage (standard) ───────────────────────────────────────────────
  private applyMeleeDamage(attacker: UnitData, target: UnitData) {
    if (target.state === "dead") return;
    const armorReduction = target.armor;
    const dmg = Math.max(1, attacker.damage - armorReduction);
    target.hp -= dmg;
    // Dust on hit
    this.spawnDust(target.sprite.x, target.sprite.y);
    const lungeX = attacker.sprite.x + attacker.direction * 10;
    this.tweens.add({ targets: attacker.sprite, x: lungeX, duration: 80, yoyo: true, ease: "Power2" });
    this.tweens.add({ targets: target.sprite, x: target.sprite.x + attacker.direction * 14, duration: 120, yoyo: true, ease: "Power1" });
    target.sprite.setTint(0xffffff);
    this.time.delayedCall(120, () => { if (target.state !== "dead") target.sprite.clearTint(); });
    if (target.hp <= 0) { target.hp = 0; this.setState(target, "dead"); }
  }

  // ── Arrow ─────────────────────────────────────────────────────────────────
  spawnArrow(attacker: UnitData, target: UnitData) {
    const arrowSprite = this.add.sprite(attacker.sprite.x, attacker.sprite.y - 35, "arrow").setDepth(25);
    arrowSprite.setScale(0.45);
    const dx = target.sprite.x - arrowSprite.x;
    const dy = (target.sprite.y - 15) - arrowSprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const grav = 400;
    const ft   = Math.max(dist / 250, 0.3);
    const vx   = dx / ft;
    const vy   = dy / ft - (grav * ft) / 2;
    arrowSprite.setRotation(Math.atan2(vy, vx));
    if (dx < 0) arrowSprite.setFlipY(true);
    this.arrows.push({ sprite: arrowSprite, vx, vy, gravity: grav, damage: attacker.damage, targetUnit: target });
  }

  // ── Death — awards gold to opposing team ──────────────────────────────────
  private applyDeath(unit: UnitData) {
    if (unit.gridCell && unit.gridCell.occupant === unit) unit.gridCell.occupant = null;
    unit.gridCell = null;
    unit.sprite.stop();
    unit.sprite.setTint(0xff4444);

    // Award gold to opposing team based on unit cost
    const cost = UNIT_COSTS[unit.unitType];
    const opposingTeam: Team = unit.team === "blue" ? "red" : "blue";
    this.events.emit("unit-killed", { team: opposingTeam, gold: cost });

    // Dust on death
    this.spawnDust(unit.sprite.x, unit.sprite.y);

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
    const W = 30, H = 3;
    const bx = unit.sprite.x - W / 2;
    const by = unit.sprite.y - 38;
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

    if (unit.unitType === "monk") { this.updateMonk(unit, delta); return; }
    if (unit.unitType === "pawn") { this.updatePawn(unit, delta); return; }

    if (unit.state === "cooldown") {
      unit.cooldownTimer -= delta;
      if (unit.cooldownTimer <= 0) this.setState(unit, "idle");
      return;
    }
    if (unit.state === "healing") { this.setState(unit, "idle"); return; }

    const enemies = this.enemiesOf(unit);
    const target  = this.nearestAlive(unit, enemies);
    if (!target) { if (unit.state !== "idle") this.setState(unit, "idle"); return; }

    const dist = Phaser.Math.Distance.Between(unit.sprite.x, unit.sprite.y, target.sprite.x, target.sprite.y);

    switch (unit.unitType) {
      case "archer":  this.updateArcher(unit, target, dist);  break;
      case "warrior": this.updateWarrior(unit, target, dist); break;
      case "lancer":  this.updateLancer(unit, target, dist);  break;
    }
  }

  private updateArcher(unit: UnitData, target: UnitData, dist: number) {
    if (dist > unit.attackRange) {
      if (unit.state !== "moving") this.setState(unit, "moving");
      this.moveUnitToward(unit, target.sprite.x, target.sprite.y);
    } else {
      if (unit.state === "idle" || unit.state === "moving") this.setState(unit, "attacking");
    }
  }

  private updateWarrior(unit: UnitData, target: UnitData, dist: number) {
    if (dist > unit.meleeRange) {
      if (unit.state !== "moving") this.setState(unit, "moving");
      this.moveUnitToward(unit, target.sprite.x, target.sprite.y);
    } else {
      if (unit.state === "idle" || unit.state === "moving") this.setState(unit, "attacking");
    }
  }

  private updateLancer(unit: UnitData, target: UnitData, dist: number) {
    if (target.sprite.x > unit.sprite.x) { unit.direction = 1; unit.sprite.setFlipX(false); }
    else { unit.direction = -1; unit.sprite.setFlipX(true); }
    if (dist > unit.attackRange) {
      if (unit.state !== "moving") this.setState(unit, "moving");
      this.moveUnitToward(unit, target.sprite.x, target.sprite.y);
    } else {
      if (unit.state === "idle" || unit.state === "moving") {
        (unit as any)._atkDir = this.computeLancerDirection(unit, target);
        this.setState(unit, "attacking");
      }
    }
  }

  // ── Pawn AI (weapon-switching melee) ──────────────────────────────────────
  private updatePawn(unit: UnitData, delta: number) {
    if (unit.state === "dead") return;

    if (unit.weaponSwitchCooldown && unit.weaponSwitchCooldown > 0) {
      unit.weaponSwitchCooldown -= delta;
    }

    if (unit.state === "cooldown") {
      unit.cooldownTimer -= delta;
      if (unit.cooldownTimer <= 0) this.setState(unit, "idle");
      return;
    }
    if (unit.state === "attacking") return;

    const enemies = this.enemiesOf(unit);
    const target  = this.nearestAlive(unit, enemies);
    if (!target) { if (unit.state !== "idle") this.setState(unit, "idle"); return; }

    if (target.sprite.x > unit.sprite.x) { unit.direction = 1; unit.sprite.setFlipX(false); }
    else { unit.direction = -1; unit.sprite.setFlipX(true); }

    const dist = Phaser.Math.Distance.Between(unit.sprite.x, unit.sprite.y, target.sprite.x, target.sprite.y);

    if (dist > unit.meleeRange) {
      if (unit.state !== "moving") this.setState(unit, "moving");
      this.moveUnitToward(unit, target.sprite.x, target.sprite.y);
    } else {
      const desiredWeapon = evaluatePawnWeapon(target);
      if (desiredWeapon !== unit.weapon && (!unit.weaponSwitchCooldown || unit.weaponSwitchCooldown <= 0)) {
        unit.weapon = desiredWeapon;
        unit.weaponSwitchCooldown = WEAPON_SWITCH_COOLDOWN;
      }
      if (unit.state === "idle" || unit.state === "moving") {
        this.setState(unit, "attacking");
      }
    }
  }

  // ── Movement — FREE during battle (no grid occupancy check), grid-locked for placement ──
  private moveUnitToward(unit: UnitData, targetX: number, targetY: number) {
    const dx  = targetX - unit.sprite.x;
    const dy  = targetY - unit.sprite.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const nx = (dx / len) * unit.speed;
    const ny = (dy / len) * unit.speed * 0.35;

    let newX = unit.sprite.x + nx;
    let newY = unit.sprite.y + ny;

    // Clamp to world bounds
    newX = Phaser.Math.Clamp(newX, 10, GAME_W - 10);
    newY = Phaser.Math.Clamp(newY, 10, GAME_H - 10);

    // During battle: free movement, units can overlap — just update grid cell tracking
    if (this.battleStarted) {
      unit.sprite.x = newX;
      unit.sprite.y = newY;
      // Update grid cell for reference (targeting, etc.) but don't block
      const newCell = this.worldToCell(newX, newY);
      if (newCell && newCell !== unit.gridCell) {
        // Clear old cell if we were occupant
        if (unit.gridCell && unit.gridCell.occupant === unit) unit.gridCell.occupant = null;
        // Only claim cell if empty (soft tracking)
        if (!newCell.occupant) newCell.occupant = unit;
        unit.gridCell = newCell;
      }
      unit.sprite.setDepth(10 + Math.floor(unit.sprite.y / CELL_H));
      return;
    }

    // Pre-battle: strict grid occupancy (shouldn't happen since units don't move pre-battle)
    const newCell = this.worldToCell(newX, newY);
    if (newCell && newCell !== unit.gridCell) {
      if (!newCell.occupant || newCell.occupant === unit) {
        if (unit.gridCell && unit.gridCell.occupant === unit) unit.gridCell.occupant = null;
        newCell.occupant = unit;
        unit.gridCell    = newCell;
      } else {
        return;
      }
    }

    unit.sprite.x = newX;
    unit.sprite.y = newY;
    unit.sprite.setDepth(10 + Math.floor(unit.sprite.y / CELL_H));
  }

  // ── Monk AI (healer) ──────────────────────────────────────────────────────
  private updateMonk(unit: UnitData, delta: number) {
    if (unit.state === "dead") return;
    if (unit.state === "cooldown") {
      unit.cooldownTimer -= delta;
      if (unit.cooldownTimer <= 0) this.setState(unit, "idle");
      return;
    }
    if (unit.state === "healing") return;

    const allies = unit.team === "blue" ? this.teamBlue : this.teamRed;
    let bestTarget: UnitData | null = null;
    let lowestPct = 1.0;
    for (const ally of allies) {
      if (ally === unit || ally.state === "dead" || ally.hp >= ally.maxHp) continue;
      const pct = ally.hp / ally.maxHp;
      const dist = this.gridDistance(unit, ally);
      if (dist <= MONK_HEAL_RANGE_CELLS && pct < lowestPct) {
        lowestPct = pct;
        bestTarget = ally;
      }
    }

    if (bestTarget) {
      if (bestTarget.sprite.x > unit.sprite.x) { unit.direction = 1; unit.sprite.setFlipX(false); }
      else { unit.direction = -1; unit.sprite.setFlipX(true); }
      this.setState(unit, "healing");
      this.time.delayedCall(MONK_CAST_DELAY, () => {
        if (unit.state === "dead") return;
        if (!bestTarget || bestTarget.state === "dead") { this.setState(unit, "idle"); return; }
        bestTarget.hp = Math.min(bestTarget.maxHp, bestTarget.hp + MONK_HEAL_AMOUNT);
        try {
          const fx = this.add.sprite(bestTarget.sprite.x, bestTarget.sprite.y, "m-heal-effect")
            .setScale(SPRITE_SCALE["monk"]).setDepth(55);
          if (this.anims.exists("monk-heal-effect")) {
            fx.play("monk-heal-effect");
            fx.once("animationcomplete", () => fx.destroy());
          }
          this.time.delayedCall(1200, () => { if (fx && fx.active) fx.destroy(); });
        } catch (_) { /* heal still applies */ }
        this.setState(unit, "cooldown");
        unit.cooldownTimer = MONK_HEAL_COOLDOWN;
      });
    } else {
      let nearestInjured: UnitData | null = null;
      let minDist = Infinity;
      for (const ally of allies) {
        if (ally === unit || ally.state === "dead" || ally.hp >= ally.maxHp) continue;
        const d = this.gridDistance(unit, ally);
        if (d < minDist) { minDist = d; nearestInjured = ally; }
      }
      if (nearestInjured && minDist > MONK_HEAL_RANGE_CELLS) {
        if (unit.state !== "moving") this.setState(unit, "moving");
        this.moveUnitToward(unit, nearestInjured.sprite.x, nearestInjured.sprite.y);
      } else {
        if (unit.state !== "idle") this.setState(unit, "idle");
      }
    }
  }

  private gridDistance(a: UnitData, b: UnitData): number {
    if (!a.gridCell || !b.gridCell) {
      return Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, b.sprite.x, b.sprite.y) / CELL_W;
    }
    const dc = Math.abs(a.gridCell.col - b.gridCell.col);
    const dr = Math.abs(a.gridCell.row - b.gridCell.row);
    return Math.max(dc, dr);
  }

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
    for (const row of this.grid) for (const cell of row) cell.occupant = null;
    this.drawGrid();
    this.placementText.setVisible(true);
  }


  // ── Dev-mode automated tests ──────────────────────────────────────────────
  private runDevTests() {
    console.log("%c[DEV TEST] Starting Pawn weapon-switching & pathing tests…", "color: #ffcc00; font-weight: bold;");
    let passed = 0;
    let failed = 0;

    const mockUnit = (hp: number, maxHp: number, armor: number): UnitData => ({
      hp, maxHp, armor, displayHp: hp, damage: 10, attackRange: 60, meleeRange: 60,
      state: "idle", cooldownTimer: 0, attackDuration: 500, direction: 1,
      teamColor: 0xff0000, unitType: "warrior", team: "red", speed: 1,
      gridCell: null, abilities: warriorAbilities(),
      sprite: null as any, hpBar: null as any,
    });

    // High HP → hammer
    const t1 = mockUnit(90, 100, 0);
    if (evaluatePawnWeapon(t1) === "hammer") passed++; else { failed++; console.error("[FAIL] High HP: expected hammer"); }

    // Low HP → knife
    const t2 = mockUnit(20, 100, 0);
    if (evaluatePawnWeapon(t2) === "knife") passed++; else { failed++; console.error("[FAIL] Low HP: expected knife"); }

    // High armor → pickaxe
    const t3 = mockUnit(50, 100, 10);
    if (evaluatePawnWeapon(t3) === "pickaxe") passed++; else { failed++; console.error("[FAIL] High armor: expected pickaxe"); }

    // Default → axe
    const t4 = mockUnit(50, 100, 0);
    if (evaluatePawnWeapon(t4) === "axe") passed++; else { failed++; console.error("[FAIL] Default: expected axe"); }

    // Grid occupancy test
    const testCell = this.grid[0][0];
    const origOcc = testCell.occupant;
    testCell.occupant = mockUnit(100, 100, 0);
    if (!!testCell.occupant) passed++; else { failed++; console.error("[FAIL] Occupied cell check"); }
    testCell.occupant = origOcc;

    // Armor pierce math
    const pierceResult = Math.max(1, PAWN_WEAPONS.pickaxe.damage - (10 * (1 - PAWN_WEAPONS.pickaxe.armorPierce)));
    const noPierceResult = Math.max(1, PAWN_WEAPONS.axe.damage - 10);
    if (pierceResult > noPierceResult) passed++; else { failed++; console.error("[FAIL] Pickaxe should beat axe vs armor"); }

    // Verify attack anims exist
    const atkAnims = ["pawn-attack-axe", "pawn-attack-hammer", "pawn-attack-knife", "pawn-attack-pickaxe"];
    for (const a of atkAnims) {
      if (this.anims.exists(a)) passed++; else { failed++; console.error(`[FAIL] Missing anim: ${a}`); }
    }

    if (failed === 0) {
      console.log(`%c[DEV TEST] All ${passed} tests PASSED ✓`, "color: #88ff88; font-weight: bold;");
    } else {
      console.error(`[DEV TEST] ${failed} FAILED, ${passed} passed`);
    }
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
      const ady  = arrow.sprite.y - (t.sprite.y - 15);
      const adist = Math.sqrt(adx * adx + ady * ady);
      if (adist < 22 || arrow.sprite.x < -50 || arrow.sprite.x > GAME_W + 50 || arrow.sprite.y > GAME_H + 50) {
        if (adist < 22 && t.state !== "dead") {
          const armorReduction = t.armor;
          const dmg = Math.max(1, arrow.damage - armorReduction);
          t.hp -= dmg;
          t.sprite.setTint(0xffffff);
          this.time.delayedCall(100, () => { if (t.state !== "dead") t.sprite.clearTint(); });
          this.tweens.add({ targets: t.sprite, x: t.sprite.x + (arrow.vx > 0 ? 1 : -1) * 5, duration: 50, yoyo: true });
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
