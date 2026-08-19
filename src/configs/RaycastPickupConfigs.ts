import { RaycastPickupType } from "../enums/RaycastPickupType";
import { RaycastWeaponType } from "../enums/RaycastWeaponType";
import { IRaycastPickupConfig } from "./interfaces/IRaycastPickupConfig";

export const raycastHealthPickupConfig: IRaycastPickupConfig = {
  type: RaycastPickupType.HEALTH,
  name: "Health Pack",
  amount: 20,
  texture: "assets/health.png",
  pickUpSound: {
    src: "repair_sound",
    loop: false,
    volume: 1,
  },
  scale: 0.25,
  anchor: "floor",
};

export const raycastE11PickupConfig: IRaycastPickupConfig = {
  type: RaycastPickupType.WEAPON,
  name: "E-11 Blaster",
  amount: 20,
  texture: "assets/E-11-item.png",
  weaponType: RaycastWeaponType.E11,
  pickUpSound: {
    src: "reload_sound",
    loop: false,
    volume: 1,
  },
  scale: 0.2,
  anchor: "floor",
};

export const raycastAmmoPickupConfig: IRaycastPickupConfig = {
  type: RaycastPickupType.AMMO,
  name: "Blaster Ammo",
  amount: 20,
  texture: "assets/ammo.png",
  pickUpSound: {
    src: "reload_sound",
    loop: false,
    volume: 1,
  },
  scale: 0.2,
  anchor: "floor",
};

/**
 * Global registry of Raycast pickup items indexed by numeric RaycastPickupType enum.
 */
export const raycastPickupConfigs: Record<RaycastPickupType, IRaycastPickupConfig> = {
  [RaycastPickupType.HEALTH]: raycastHealthPickupConfig,
  [RaycastPickupType.WEAPON]: raycastE11PickupConfig,
  [RaycastPickupType.AMMO]: raycastAmmoPickupConfig,
};

/**
 * Retrieves a pickup config by enum type, numeric ID, or string alias ("health", "weapon", "ammo").
 */
export function getRaycastPickupConfig(
  type: RaycastPickupType | string | number
): IRaycastPickupConfig | undefined {
  if (typeof type === "number" && raycastPickupConfigs[type as RaycastPickupType]) {
    return raycastPickupConfigs[type as RaycastPickupType];
  }

  const normalized = String(type).toLowerCase().replace(/[-_ ]/g, "");

  if (normalized.includes("health") || normalized.includes("heal") || normalized.includes("med")) {
    return raycastHealthPickupConfig;
  }
  if (
    normalized.includes("weapon") ||
    normalized.includes("gun") ||
    normalized.includes("blaster") ||
    normalized.includes("e11")
  ) {
    return raycastE11PickupConfig;
  }
  if (normalized.includes("ammo")) {
    return raycastAmmoPickupConfig;
  }

  return undefined;
}
