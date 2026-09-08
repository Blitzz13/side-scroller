import { ISoundConfig } from "./ISoundConfig";
import { RaycastEnemyType } from "../../enums/RaycastEnemyType";
import { RaycastWeaponType } from "../../enums/RaycastWeaponType";
import { IEnemyVoicePool } from "./IStormtrooperVoicelineConfig";

export interface IRaycastEnemyAnimationSequence {
  prefix: string;
  count: number;
  speed?: number;
  loop?: boolean;
}

export interface IRaycastEnemyAnimationConfig {
  omniDirectional?: boolean;
  defaultAnimation?: IRaycastEnemyAnimationSequence;
  shootingAnimation?: IRaycastEnemyAnimationSequence;
  deathAnimation?: IRaycastEnemyAnimationSequence;
  walkingPrefix?: string;
  standingPrefix?: string;
  shootingPrefix?: string;
  deathPrefix?: string;
}

export interface IRaycastEnemyConfig {
  type: RaycastEnemyType;
  name: string;
  maxHealth: number;
  speed: number; // Base movement speed per delta (e.g. 0.018)
  sightRange: number; // Maximum detection distance in tiles (e.g. 12)
  attackRange: number; // Range at which enemy stops chasing and fires (e.g. 5.5)
  minDistance: number; // Minimum distance to maintain from player (e.g. 2.0)
  rateOfFire: number; // Attack cooldown in ms between blaster shots (e.g. 900)
  damage: number; // Damage dealt to player per shot (e.g. 10)
  accuracy: number; // Hit chance 0..1 (e.g. 0.65)
  scale: number; // Height scale relative to standard wall (e.g. 0.9)
  scaleX?: number;
  scaleY?: number;
  referenceHeight?: number; // Base pixel height of standing frame in spritesheet (e.g. 67)
  spritesheet: string; // Asset path to spritesheet json (e.g. "assets/storm_trooper.json")
  dropWeapon?: RaycastWeaponType; // Weapon type dropped on death
  dropAmmo?: number; // Ammo amount provided by drop
  dropChance?: number; // Probability of dropping item 0..1 (default: 1.0)
  painSounds?: ISoundConfig[];
  deathSounds?: ISoundConfig[];
  attackSounds?: ISoundConfig[];
  idleSound?: ISoundConfig; // Looping idle/hover sound
  hoverSound?: ISoundConfig; // Looping hover sound
  voicelines?: IEnemyVoicePool;
  shootHeight?: number; // Vertical height offset for firing laser (default: 0.55)
  vOffset?: number; // Normalized vertical offset above floor (e.g. 0.12 for floating)
  floatingBob?: boolean; // Organic floating bobbing motion while hovering
  shoulderOffset?: number; // Distance in tiles from center to left/right shoulders for cover clearance checks (default: 0.35)
  coverClearanceOffset?: number; // Extra offset distance to step out past cover edges into open space (default: 1.5)
  stepOutFrames?: number; // Duration in ticks/frames the enemy continues moving out into the open upon spotting player (default: 30)
  animationConfig?: IRaycastEnemyAnimationConfig;
}
