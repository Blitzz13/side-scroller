import { RaycastEnemyType } from "../enums/RaycastEnemyType";
import { RaycastWeaponType } from "../enums/RaycastWeaponType";
import { IRaycastEnemyConfig } from "./interfaces/IRaycastEnemyConfig";
import { ISoundConfig } from "./interfaces/ISoundConfig";

const stormtrooperPainSounds: ISoundConfig[] = [
  {
    src: "stormtrooper_pain_1",
    loop: false,
    volume: 0.8,
  },
];

const stormtrooperDeathSounds: ISoundConfig[] = [
  {
    src: "stormtrooper_death_1",
    loop: false,
    volume: 0.9,
  },
];

const stormtrooperAttackSounds: ISoundConfig[] = [
  {
    src: "e_11_blaster",
    loop: false,
    volume: 0.25,
  },
];

export const stormtrooperConfig: IRaycastEnemyConfig = {
  type: RaycastEnemyType.STORMTROOPER,
  name: "Imperial Stormtrooper",
  maxHealth: 50,
  speed: 0.018,
  sightRange: 12,
  attackRange: 5.5,
  minDistance: 2.0,
  rateOfFire: 900,
  damage: 10,
  accuracy: 0.65,
  scale: 0.7,
  referenceHeight: 67,
  spritesheet: "assets/storm_trooper.json",
  dropWeapon: RaycastWeaponType.E11,
  dropAmmo: 20,
  dropChance: 1.0,
  painSounds: stormtrooperPainSounds,
  deathSounds: stormtrooperDeathSounds,
  attackSounds: stormtrooperAttackSounds,
};

/**
 * Global registry of Raycast enemy configs indexed by RaycastEnemyType.
 * Additional enemy types can easily be added here with their custom stats,
 * sounds, spritesheets, and loot drops.
 */
export const raycastEnemyConfigs: Record<RaycastEnemyType, IRaycastEnemyConfig> = {
  [RaycastEnemyType.STORMTROOPER]: stormtrooperConfig,
};

export function getRaycastEnemyConfig(
  identifier: RaycastEnemyType | string
): IRaycastEnemyConfig | undefined {
  if (raycastEnemyConfigs[identifier as RaycastEnemyType]) {
    return raycastEnemyConfigs[identifier as RaycastEnemyType];
  }

  const normalized = String(identifier).toLowerCase().replace(/[-_ ]/g, "");
  for (const cfg of Object.values(raycastEnemyConfigs)) {
    const typeStr = cfg.type.toLowerCase().replace(/[-_ ]/g, "");
    const nameStr = cfg.name.toLowerCase().replace(/[-_ ]/g, "");
    if (typeStr === normalized || nameStr.includes(normalized) || normalized.includes(typeStr)) {
      return cfg;
    }
  }

  return stormtrooperConfig;
}
