import Phaser from "phaser";

export type UnitType = "archer" | "warrior";
export type Team = "blue" | "red";
export type UnitState = "idle" | "moving" | "attacking" | "cooldown" | "dead";

export interface UnitData {
  sprite: Phaser.GameObjects.Sprite;
  hp: number;
  maxHp: number;
  displayHp: number;
  damage: number;
  attackRange: number;
  meleeRange: number;       // distance at which a melee unit considers itself "in range"
  state: UnitState;
  cooldownTimer: number;    // ms remaining in cooldown before next attack
  attackDuration: number;   // ms the attack animation takes (for cooldown calc)
  direction: number;        // 1 = right, -1 = left
  hpBar: Phaser.GameObjects.Graphics;
  teamColor: number;
  unitType: UnitType;
  team: Team;
  speed: number;
}

export interface ArrowProjectile {
  sprite: Phaser.GameObjects.Sprite;
  vx: number;
  vy: number;
  gravity: number;
  damage: number;
  targetUnit: UnitData;
}
