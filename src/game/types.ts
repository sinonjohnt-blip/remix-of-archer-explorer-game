import Phaser from "phaser";

export type UnitType    = "archer" | "warrior" | "lancer" | "monk" | "pawn";
export type Team        = "blue" | "red";
export type UnitState   = "idle" | "moving" | "attacking" | "cooldown" | "dead" | "healing";
export type PawnWeapon  = "axe" | "knife" | "hammer" | "pickaxe";

// ── Grid ──────────────────────────────────────────────────────────────────────
export interface GridCell {
  col:      number;
  row:      number;
  worldX:   number;
  worldY:   number;
  occupant: UnitData | null;
}

// ── Unit ──────────────────────────────────────────────────────────────────────
export interface UnitData {
  sprite:          Phaser.GameObjects.Sprite;
  hp:              number;
  maxHp:           number;
  displayHp:       number;
  damage:          number;
  attackRange:     number;   // grid-cell distance for range check
  meleeRange:      number;   // pixel distance (derived from attackRange * cellW)
  state:           UnitState;
  cooldownTimer:   number;   // ms remaining
  attackDuration:  number;   // ms the attack anim takes
  direction:       number;   // 1 = facing right, -1 = facing left
  hpBar:           Phaser.GameObjects.Graphics;
  teamColor:       number;
  unitType:        UnitType;
  team:            Team;
  speed:           number;   // pixels per frame
  gridCell:        GridCell | null;
  abilities:       UnitAbilities;
  /** Armor value — reduces incoming damage; used by pickaxe pierce */
  armor:           number;
  /** Pawn-only: currently equipped weapon */
  weapon?:         PawnWeapon;
  /** Pawn-only: ms remaining before weapon can switch again */
  weaponSwitchCooldown?: number;
}

// ── Modular ability table (add to this for new units) ─────────────────────────
export interface UnitAbilities {
  /** Resolve attack against a target and surrounding cells — return targets hit */
  resolveAttack: (attacker: UnitData, primaryTarget: UnitData, grid: GridCell[][]) => UnitData[];
  /** Which animation key to play while in cooldown state */
  cooldownAnim:  (unit: UnitData) => string;
  /** Which attack anim key(s) to pick */
  attackAnim:    (unit: UnitData) => string;
}

export interface ArrowProjectile {
  sprite:     Phaser.GameObjects.Sprite;
  vx:         number;
  vy:         number;
  gravity:    number;
  damage:     number;
  targetUnit: UnitData;
}

// ── Grid constants (enlarged 25%+) ────────────────────────────────────────────
export const GRID_COLS   = 16;
export const GRID_ROWS   = 8;
export const GAME_W      = 960;
export const GAME_H      = 576;
export const CELL_W      = GAME_W / GRID_COLS;   // 60
export const CELL_H      = GAME_H / GRID_ROWS;   // 72
