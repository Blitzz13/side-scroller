import { ISoundConfig } from "./ISoundConfig";
import { RaycastEnemyType } from "../../enums/RaycastEnemyType";
import { RaycastWeaponType } from "../../enums/RaycastWeaponType";
import { IEnemyVoicePool } from "./IStormtrooperVoicelineConfig";

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
  voicelines?: IEnemyVoicePool;
}
