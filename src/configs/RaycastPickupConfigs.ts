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
  texture: "assets/raycast/pickups/e_11_item.png",
  weaponType: RaycastWeaponType.E11,
  pickUpSound: {
    src: "reload_sound",
    loop: false,
    volume: 1,
  },
  scale: 0.2,
  anchor: "floor",
};

export const raycastDh17PickupConfig: IRaycastPickupConfig = {
  type: RaycastPickupType.WEAPON,
  name: "DH-17 Blaster",
  amount: 30,
  texture: "assets/raycast/weapons/dh_17.png",
  weaponType: RaycastWeaponType.DH17,
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

export const raycastBlueKeycardConfig: IRaycastPickupConfig = {
  type: RaycastPickupType.BLUE_KEYCARD,
  name: "Blue Keycard",
  amount: 1,
  texture: "keycard/key_card_blue_1.png",
  keyColor: "blue",
  spritesheet: "assets/keycards.json",
  pickUpSound: {
    src: "reload_sound",
    loop: false,
    volume: 1,
  },
  scale: 0.22,
  anchor: "center",
  pickupRadius: 0.9,
};

export const raycastGreenKeycardConfig: IRaycastPickupConfig = {
  type: RaycastPickupType.GREEN_KEYCARD,
  name: "Green Keycard",
  amount: 1,
  texture: "keycard/key_card_green_1.png",
  keyColor: "green",
  spritesheet: "assets/keycards.json",
  pickUpSound: {
    src: "reload_sound",
    loop: false,
    volume: 1,
  },
  scale: 0.22,
  anchor: "center",
  pickupRadius: 0.9,
};

export const raycastRedKeycardConfig: IRaycastPickupConfig = {
  type: RaycastPickupType.RED_KEYCARD,
  name: "Red Keycard",
  amount: 1,
  texture: "keycard/key_card_red_1.png",
  keyColor: "red",
  spritesheet: "assets/keycards.json",
  pickUpSound: {
    src: "reload_sound",
    loop: false,
    volume: 1,
  },
  scale: 0.22,
  anchor: "center",
  pickupRadius: 0.9,
};

export const raycastThermalDetonatorPickupConfig: IRaycastPickupConfig = {
  type: RaycastPickupType.THERMAL_DETONATOR_SINGLE,
  name: "Thermal Detonator",
  amount: 1,
  texture: "assets/raycast/pickups/thermal_detonator_pickup.png",
  weaponType: RaycastWeaponType.THERMAL_DETONATOR,
  pickUpSound: {
    src: "reload_sound",
    loop: false,
    volume: 1,
  },
  scale: 0.2,
  anchor: "floor",
};

export const raycastThermalDetonatorBeltConfig: IRaycastPickupConfig = {
  type: RaycastPickupType.THERMAL_DETONATOR_BELT,
  name: "Thermal Detonator Belt",
  amount: 5,
  texture: "assets/raycast/pickups/thermal_detonator_belt.png",
  weaponType: RaycastWeaponType.THERMAL_DETONATOR,
  pickUpSound: {
    src: "reload_sound",
    loop: false,
    volume: 1,
  },
  scale: 0.22,
  anchor: "floor",
};

/**
 * Global registry of Raycast pickup items indexed by numeric RaycastPickupType enum.
 */
export const raycastPickupConfigs: Record<RaycastPickupType, IRaycastPickupConfig> = {
  [RaycastPickupType.HEALTH]: raycastHealthPickupConfig,
  [RaycastPickupType.WEAPON]: raycastE11PickupConfig,
  [RaycastPickupType.AMMO]: raycastAmmoPickupConfig,
  [RaycastPickupType.BLUE_KEYCARD]: raycastBlueKeycardConfig,
  [RaycastPickupType.GREEN_KEYCARD]: raycastGreenKeycardConfig,
  [RaycastPickupType.RED_KEYCARD]: raycastRedKeycardConfig,
  [RaycastPickupType.KEYCARD]: raycastBlueKeycardConfig,
  [RaycastPickupType.THERMAL_DETONATOR_SINGLE]: raycastThermalDetonatorPickupConfig,
  [RaycastPickupType.THERMAL_DETONATOR_BELT]: raycastThermalDetonatorBeltConfig,
};

/**
 * Retrieves a pickup config by enum type, numeric ID, or string alias ("health", "weapon", "ammo", "blue_keycard").
 */
export function getRaycastPickupConfig(
  type: RaycastPickupType | string | number
): IRaycastPickupConfig | undefined {
  if (typeof type === "number" && raycastPickupConfigs[type as RaycastPickupType]) {
    return raycastPickupConfigs[type as RaycastPickupType];
  }

  const normalized = String(type).toLowerCase().replace(/[-_ ]/g, "");

  if (normalized.includes("belt") || normalized.includes("detonatorbelt")) {
    return raycastThermalDetonatorBeltConfig;
  }
  if (normalized.includes("detonator") || normalized.includes("grenade") || normalized.includes("bomb")) {
    return raycastThermalDetonatorPickupConfig;
  }

  if (normalized.includes("green") && (normalized.includes("key") || normalized.includes("card"))) {
    return raycastGreenKeycardConfig;
  }
  if (normalized.includes("red") && (normalized.includes("key") || normalized.includes("card"))) {
    return raycastRedKeycardConfig;
  }
  if (
    (normalized.includes("blue") && (normalized.includes("key") || normalized.includes("card"))) ||
    normalized.includes("keycard") ||
    normalized.includes("key_card")
  ) {
    return raycastBlueKeycardConfig;
  }

  if (normalized.includes("health") || normalized.includes("heal") || normalized.includes("med")) {
    return raycastHealthPickupConfig;
  }
  if (
    normalized.includes("dh17") ||
    normalized.includes("dh_17") ||
    normalized.includes("pistol")
  ) {
    return raycastDh17PickupConfig;
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
