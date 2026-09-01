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
  equippedTexture: "assets/E_11-equiped.png",
  itemTexture: "assets/E-11-item.png",
  shootSounds: e11ShootSounds,
  reloadSound: {
    src: "reload_sound",
    loop: false,
    volume: 1,
  },
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
    coreAlpha: 0.95,
  },
};

/**
 * Global registry of Raycast weapons indexed by numeric RaycastWeaponType enum.
 * To add a new weapon, add its enum value and config entry here.
 */
export const raycastWeaponConfigs: Record<RaycastWeaponType, IRaycastWeaponConfig> = {
  [RaycastWeaponType.E11]: e11Config,
};

/**
 * Retrieves a weapon config by enum ID, numeric ID, or string alias (e.g. "e_11", "e11", "E11", "0").
 */
export function getRaycastWeaponConfig(
  identifier: RaycastWeaponType | string | number
): IRaycastWeaponConfig | undefined {
  if (typeof identifier === "number" && raycastWeaponConfigs[identifier as RaycastWeaponType]) {
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

  return raycastWeaponConfigs[RaycastWeaponType.E11];
}
