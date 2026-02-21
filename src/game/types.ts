import Phaser from "phaser";

export type UnitType  = "archer" | "warrior" | "lancer" | "monk";
export type Team      = "blue" | "red";
export type UnitState = "idle" | "moving" | "attacking" | "cooldown" | "dead" | "healing";

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

// ── Grid constants ─────────────────────────────────────────────────────────────
export const GRID_COLS   = 10;
export const GRID_ROWS   = 6;
export const GAME_W      = 720;
export const GAME_H      = 480;
// Grid occupies the full canvas; HUD is rendered in React overlay
export const CELL_W      = GAME_W / GRID_COLS;   // 72
export const CELL_H      = GAME_H / GRID_ROWS;   // 80
