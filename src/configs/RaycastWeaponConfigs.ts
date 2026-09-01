import { RaycastWeaponType } from "../enums/RaycastWeaponType";
import { IRaycastWeaponConfig } from "./interfaces/IRaycastWeaponConfig";
import { ISoundConfig } from "./interfaces/ISoundConfig";

const e11ShootSounds: ISoundConfig[] = [
  {
    src: "e_11_blaster",
    loop: false,
    volume: 0.2,
  },
];

export const e11Config: IRaycastWeaponConfig = {
  type: RaycastWeaponType.E11,
  name: "E-11 Blaster Rifle",
  damage: 25,
  maxAmmo: 99,
  defaultAmmo: 20,
  rateOfFire: 200,
  equippedTexture: "assets/raycast/weapons/e_11_equiped.png",
  itemTexture: "assets/raycast/pickups/e_11_item.png",
  shootSounds: e11ShootSounds,
  reloadSound: {
    src: "reload_sound",
    loop: false,
    volume: 1,
  },
  viewPosX: 800,
  viewPosY: 700,
  muzzleFlash: {
    enabled: true,
    offsetX: -50,
    offsetY: -184,
    followRotation: true,
    duration: 5,
    scale: 1.0,
    outerColor: 0xff3300,
    outerRadius: 32,
    outerAlpha: 0.4,
    innerColor: 0xff8800,
    innerRadius: 18,
    innerAlpha: 0.85,
    coreColor: 0xffffff,
    coreRadius: 8,
  },
};

export const thermalDetonatorConfig: IRaycastWeaponConfig = {
  type: RaycastWeaponType.THERMAL_DETONATOR,
  name: "Thermal Detonator",
  damage: 150,
  maxAmmo: 99,
  defaultAmmo: 1,
  rateOfFire: 800,
  equippedTexture: "assets/raycast/weapons/thermal_detonator.png",
  itemTexture: "assets/raycast/pickups/thermal_detonator_pickup.png",
  shootSounds: [],
  reloadSound: {
    src: "reload_sound",
    loop: false,
    volume: 1,
  },
  // Configurable first-person view positioning and scale
  viewPosX: 990,
  viewPosY: 870,
  viewScale: 0.85,
  anchorX: 0.5,
  anchorY: 0.8,
  // Configurable throwable & explosion properties
  isThrowable: true,
  fuseTime: 2.0, // Configurable timer to explode in seconds
  explosionRadius: 3.5, // Blast radius in world units
  throwSpeed: 8.5, // Initial throw velocity in world units/sec
  bounciness: 0.28, // Floor bounce elasticity (0.0 = dead thud/no bounce, 0.28 = low realistic hop, 1.0 = rubber ball)
  wallBounciness: 0.3, // Wall bounce elasticity (0.0 = stops dead on walls, 0.30 = slight deflection)
  friction: 0.8, // Floor roll drag (lower = stops rolling sooner, e.g. 0.70 = quick stop, 0.95 = ice)
  maxBounces: 2, // Maximum bounces before settling flat on the ground
  muzzleFlash: {
    enabled: false,
  },
};

const dh17ShootSounds: ISoundConfig[] = [
  {
    src: "dh_17_blaster",
    loop: false,
    volume: 0.25,
  },
];

export const dh17Config: IRaycastWeaponConfig = {
  type: RaycastWeaponType.DH17,
  name: "DH-17 Blaster Pistol",
  damage: 20,
  maxAmmo: 99,
  defaultAmmo: 30,
  rateOfFire: 220,
  equippedTexture: "assets/raycast/weapons/dh_17.png",
  itemTexture: "assets/raycast/weapons/dh_17.png",
  shootSounds: dh17ShootSounds,
  reloadSound: {
    src: "reload_sound",
    loop: false,
    volume: 1,
  },
  // Configurable first-person view positioning and scale
  viewPosX: 960,
  viewPosY: 720,
  viewScale: 0.40,
  anchorX: 0.5,
  anchorY: 0.85,
  muzzleFlash: {
    enabled: true,
    offsetX: 0,
    offsetY: -220,
    followRotation: true,
    duration: 5,
    scale: 0.9,
    outerColor: 0xff3300,
    outerRadius: 28,
    outerAlpha: 0.4,
    innerColor: 0xff8800,
    innerRadius: 16,
    innerAlpha: 0.85,
    coreColor: 0xffffff,
    coreRadius: 7,
  },
};

/**
 * Global registry of Raycast weapons indexed by numeric RaycastWeaponType enum.
 * To add a new weapon, add its enum value and config entry here.
 */
export const raycastWeaponConfigs: Record<
  RaycastWeaponType,
  IRaycastWeaponConfig
> = {
  [RaycastWeaponType.DH17]: dh17Config,
  [RaycastWeaponType.E11]: e11Config,
  [RaycastWeaponType.THERMAL_DETONATOR]: thermalDetonatorConfig,
};

/**
 * Retrieves a weapon config by enum ID, numeric ID, or string alias (e.g. "e_11", "e11", "E11", "0").
 */
export function getRaycastWeaponConfig(
  identifier: RaycastWeaponType | string | number,
): IRaycastWeaponConfig | undefined {
  if (
    typeof identifier === "number" &&
    raycastWeaponConfigs[identifier as RaycastWeaponType]
  ) {
    return raycastWeaponConfigs[identifier as RaycastWeaponType];
  }

  const normalized = String(identifier).toLowerCase().replace(/[-_ ]/g, "");

  for (const config of Object.values(raycastWeaponConfigs)) {
    const configName = config.name.toLowerCase().replace(/[-_ ]/g, "");
    const enumKey = RaycastWeaponType[config.type]?.toLowerCase() ?? "";

    if (
      String(config.type) === normalized ||
      enumKey === normalized ||
      configName.includes(normalized) ||
      normalized.includes(enumKey)
    ) {
      return config;
    }
  }

  if (normalized.includes("dh") || normalized.includes("pistol")) {
    return raycastWeaponConfigs[RaycastWeaponType.DH17];
  }

  return raycastWeaponConfigs[RaycastWeaponType.DH17];
}
