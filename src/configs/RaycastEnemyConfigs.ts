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
  spritesheet: "assets/raycast/enemies/storm_trooper.json",
  dropWeapon: RaycastWeaponType.E11,
  dropAmmo: 20,
  dropChance: 1.0,
  painSounds: stormtrooperPainSounds,
  deathSounds: stormtrooperDeathSounds,
  attackSounds: stormtrooperAttackSounds,
  shoulderOffset: 0.35,
  coverClearanceOffset: 1.5,
  stepOutFrames: 30,
};

const viperDroidHoverSound: ISoundConfig = {
  src: "probe_droid_hovering",
  loop: true,
  volume: 0.55,
};

const viperDroidAttackSounds: ISoundConfig[] = [
  { src: "probe_droid_shot_1", loop: false, volume: 0.7 },
  { src: "probe_droid_shot_2", loop: false, volume: 0.7 },
  { src: "probe_droid_shot_3", loop: false, volume: 0.7 },
  { src: "probe_droid_shot_4", loop: false, volume: 0.7 },
  { src: "probe_droid_shot_5", loop: false, volume: 0.7 },
  { src: "probe_droid_shot_6", loop: false, volume: 0.7 },
];

const viperDroidDeathSounds: ISoundConfig[] = [
  {
    src: "explosion_sound",
    loop: false,
    volume: 0.8,
  },
];

const viperDroidPainSounds: ISoundConfig[] = [
  {
    src: "probe_droid_voice_3",
    loop: false,
    volume: 0.5,
  },
];

export const viperDroidRaycastConfig: IRaycastEnemyConfig = {
  type: RaycastEnemyType.VIPER_DROID,
  name: "Viper Probe Droid",
  maxHealth: 35,
  speed: 0.022,
  sightRange: 13,
  attackRange: 6.0,
  minDistance: 2.2,
  rateOfFire: 850,
  damage: 8,
  accuracy: 0.65,
  scale: 0.72,
  referenceHeight: 69,
  spritesheet: "assets/raycast/enemies/viper_droid.json",
  dropAmmo: 15,
  dropChance: 0.75,
  shootHeight: 0.6,
  vOffset: 0.12,
  floatingBob: true,
  shoulderOffset: 0.38,
  coverClearanceOffset: 1.8,
  stepOutFrames: 35,
  hoverSound: viperDroidHoverSound,
  idleSound: viperDroidHoverSound,
  attackSounds: viperDroidAttackSounds,
  deathSounds: viperDroidDeathSounds,
  painSounds: viperDroidPainSounds,
  voicelines: {
    spotted: [
      "probe_droid_voice_1",
      "probe_droid_voice_2",
      "probe_droid_voice_3",
      "probe_droid_voice_4",
      "probe_droid_voice_5",
      "probe_droid_voice_6",
      "probe_droid_voice_7",
      "probe_droid_voice_8",
    ],
    suspicious: [
      "probe_droid_voice_1",
      "probe_droid_voice_2",
      "probe_droid_voice_3",
    ],
  },
  animationConfig: {
    omniDirectional: true,
    defaultAnimation: {
      prefix: "viper_droid_default",
      count: 12,
      speed: 0.18,
      loop: true,
    },
    shootingAnimation: {
      prefix: "viper_droid_shoot",
      count: 2,
      speed: 0.16,
      loop: false,
    },
    deathAnimation: {
      prefix: "viper_droid_death",
      count: 5,
      speed: 0.14,
      loop: false,
    },
  },
};

const imperialOfficerPainSounds: ISoundConfig[] = [
  {
    src: "officer_commando_damage",
    loop: false,
    volume: 0.8,
  },
];

const imperialOfficerDeathSounds: ISoundConfig[] = [
  {
    src: "imperial_officer_death",
    loop: false,
    volume: 0.9,
  },
];

const imperialOfficerAttackSounds: ISoundConfig[] = [
  {
    src: "dh_17_blaster",
    loop: false,
    volume: 0.25,
  },
];

export const imperialOfficerConfig: IRaycastEnemyConfig = {
  type: RaycastEnemyType.IMPERIAL_OFFICER,
  name: "Imperial Officer",
  maxHealth: 40,
  speed: 0.02,
  sightRange: 12,
  attackRange: 6.0,
  minDistance: 2.2,
  rateOfFire: 750,
  damage: 10,
  accuracy: 0.7,
  scale: 0.7,
  referenceHeight: 69,
  spritesheet: "assets/raycast/enemies/implerial_officer.json",
  dropWeapon: RaycastWeaponType.DH17,
  dropAmmo: 20,
  dropChance: 1.0,
  painSounds: imperialOfficerPainSounds,
  deathSounds: imperialOfficerDeathSounds,
  attackSounds: imperialOfficerAttackSounds,
  shoulderOffset: 0.35,
  coverClearanceOffset: 1.5,
  stepOutFrames: 30,
  voicelines: {
    spotted: [
      "officer_commando_fall_back",
      "office_commando_stop_now",
      "officer_commando_throw_down_your_weapons",
    ],
    suspicious: [
      "officer_commando_he_must_be_here",
      "officer_commando_no_use_hiding",
      "officer_commando_show_yourself",
    ],
    grenade: ["officer_commando_fall_back"],
  },
  animationConfig: {
    walkingPrefix: "walking",
    standingPrefix: "standing",
    shootingPrefix: "shooting",
    deathPrefix: "death_1",
    shootingAnimation: {
      prefix: "shooting",
      count: 2,
      speed: 0.16,
      loop: false,
    },
    deathAnimation: {
      prefix: "death_1",
      count: 7,
      speed: 0.14,
      loop: false,
    },
  },
};

const imperialCommandoPainSounds: ISoundConfig[] = [
  {
    src: "officer_commando_damage",
    loop: false,
    volume: 0.8,
  },
];

const imperialCommandoDeathSounds: ISoundConfig[] = [
  {
    src: "imperial_officer_death",
    loop: false,
    volume: 0.9,
  },
];

const imperialCommandoAttackSounds: ISoundConfig[] = [
  {
    src: "dh_17_blaster",
    loop: false,
    volume: 0.25,
  },
];

const phase1DarkTrooperPainSounds: ISoundConfig[] = [
  {
    src: "phase1_dark_trooper_damage_1",
    loop: false,
    volume: 0.85,
  },
];

const phase1DarkTrooperDeathSounds: ISoundConfig[] = [
  {
    src: "phase1_dark_trooper_death",
    loop: false,
    volume: 0.95,
  },
];

const phase1DarkTrooperAttackSounds: ISoundConfig[] = [
  {
    src: "phase1_dark_trooper_slashing_1",
    loop: false,
    volume: 0.85,
  },
  {
    src: "phase1_dark_trooper_slashing_2",
    loop: false,
    volume: 0.85,
  },
];

const phase1DarkTrooperStepSounds: ISoundConfig[] = [
  {
    src: "phase1_dark_trooper_step_1",
    loop: false,
    volume: 0.5,
  },
  {
    src: "phase1_dark_trooper_step_2",
    loop: false,
    volume: 0.5,
  },
];

export const phase1DarkTrooperConfig: IRaycastEnemyConfig = {
  type: RaycastEnemyType.PHASE1_DARK_TROOPER,
  name: "Phase 1 Dark Trooper",
  maxHealth: 500,
  speed: 0.024,
  sightRange: 14,
  attackRange: 1.25,
  minDistance: 0.75,
  rateOfFire: 850,
  damage: 20,
  accuracy: 0.85,
  scale: 0.85,
  referenceHeight: 98,
  spritesheet: "assets/raycast/enemies/phase1_dark_trooper.json",
  deathAnchorY: 0.65,
  isMelee: true,
  shieldDuration: 120, // ~2 seconds at 60fps
  shieldInterval: 180, // ~4 seconds between shielding
  shoulderOffset: 0.35,
  coverClearanceOffset: 1.5,
  stepOutFrames: 25,
  painSounds: phase1DarkTrooperPainSounds,
  deathSounds: phase1DarkTrooperDeathSounds,
  attackSounds: phase1DarkTrooperAttackSounds,
  meleeHitSound: {
    src: "phase1_dark_trooper_hit_flesh",
    loop: false,
    volume: 0.9,
  },
  stepSounds: phase1DarkTrooperStepSounds,
  voicelines: {
    spotted: ["phase1_dark_trooper_spoted_enemy"],
  },
  animationConfig: {
    walkingPrefix: "walking",
    standingPrefix: "standing",
    deathPrefix: "death_1",
    deathAnimation: {
      prefix: "death_1",
      count: 5,
      speed: 0.14,
      loop: false,
    },
    meleePrefix: "melee_attack",
    meleeAnimation: {
      prefix: "melee_attack",
      count: 5,
      speed: 0.18,
      loop: false,
    },
    shieldFrame: "shield",
    damagePrefix: "damage",
  },
};

export const imperialCommandoConfig: IRaycastEnemyConfig = {
  type: RaycastEnemyType.IMPERIAL_COMMANDO,
  name: "Imperial Commando",
  maxHealth: 45,
  speed: 0.02,
  sightRange: 12,
  attackRange: 6.0,
  minDistance: 2.2,
  rateOfFire: 750,
  damage: 10,
  accuracy: 0.7,
  scale: 0.7,
  referenceHeight: 73,
  spritesheet: "assets/raycast/enemies/imperial_commando.json",
  dropWeapon: RaycastWeaponType.DH17,
  dropAmmo: 20,
  dropChance: 1.0,
  painSounds: imperialCommandoPainSounds,
  deathSounds: imperialCommandoDeathSounds,
  attackSounds: imperialCommandoAttackSounds,
  shoulderOffset: 0.35,
  coverClearanceOffset: 1.5,
  stepOutFrames: 30,
  voicelines: {
    spotted: [
      "office_commando_stop_now",
      "officer_commando_throw_down_your_weapons",
    ],
    suspicious: [
      "officer_commando_he_must_be_here",
      "officer_commando_no_use_hiding",
      "officer_commando_show_yourself",
    ],
    grenade: ["officer_commando_fall_back"],
  },
  animationConfig: {
    walkingPrefix: "walking",
    standingPrefix: "standing",
    shootingPrefix: "shoot",
    deathPrefix: "death_1",
    shootingAnimation: {
      prefix: "shoot",
      count: 2,
      speed: 0.16,
      loop: false,
    },
    deathAnimation: {
      prefix: "death_1",
      count: 7,
      speed: 0.14,
      loop: false,
    },
  },
};

/**
 * Global registry of Raycast enemy configs indexed by RaycastEnemyType.
 * Additional enemy types can easily be added here with their custom stats,
 * sounds, spritesheets, and loot drops.
 */
export const raycastEnemyConfigs: Record<RaycastEnemyType, IRaycastEnemyConfig> = {
  [RaycastEnemyType.STORMTROOPER]: stormtrooperConfig,
  [RaycastEnemyType.VIPER_DROID]: viperDroidRaycastConfig,
  [RaycastEnemyType.IMPERIAL_OFFICER]: imperialOfficerConfig,
  [RaycastEnemyType.IMPERIAL_COMMANDO]: imperialCommandoConfig,
  [RaycastEnemyType.PHASE1_DARK_TROOPER]: phase1DarkTrooperConfig,
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
    if (
      typeStr === normalized ||
      nameStr.includes(normalized) ||
      normalized.includes(typeStr) ||
      (normalized.includes("darktrooper") && typeStr.includes("dark_trooper")) ||
      (normalized.includes("phase1") && typeStr.includes("phase1")) ||
      (normalized.includes("officer") && typeStr.includes("officer")) ||
      (normalized.includes("commando") && typeStr.includes("commando"))
    ) {
      return cfg;
    }
  }

  return stormtrooperConfig;
}

