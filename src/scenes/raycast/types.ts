import { RaycastPickupType } from "../../enums/RaycastPickupType";
import { RaycastWeaponType } from "../../enums/RaycastWeaponType";
import { IRaycastWeaponConfig } from "../../configs/interfaces/IRaycastWeaponConfig";
import { IRaycastPickupConfig } from "../../configs/interfaces/IRaycastPickupConfig";
import {
  raycastWeaponConfigs,
  getRaycastWeaponConfig,
} from "../../configs/RaycastWeaponConfigs";
import {
  raycastPickupConfigs,
  getRaycastPickupConfig,
} from "../../configs/RaycastPickupConfigs";

export { RaycastPickupType, RaycastWeaponType };
export { IRaycastWeaponConfig, IRaycastPickupConfig };
export {
  raycastWeaponConfigs,
  getRaycastWeaponConfig,
  raycastPickupConfigs,
  getRaycastPickupConfig,
};

export interface RaycastPickupItem {
  id: number;
  x: number;
  y: number;
  texture: number; // tile ID
  type: RaycastPickupType;
  weaponType?: RaycastWeaponType;
  amount: number;
  collected: boolean;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  vOffset?: number;
  z?: number;
  anchor?: string;
  config?: IRaycastPickupConfig;
}

export interface RaycastPlayerState {
  health: number;
  maxHealth: number;
  equippedWeapon: RaycastWeaponType | null;
  weaponConfig: IRaycastWeaponConfig | null;
  ammo: number;
  maxAmmo: number;
}

export interface MapObject {
  x: number;
  y: number;
  texture: number;
  distance?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  vOffset?: number;
  z?: number;
  anchor?: string;
  pickupRef?: RaycastPickupItem;
}

export interface TileMeta {
  type?: string;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  vOffset?: number;
  z?: number;
  anchor?: string;
  imageWidth?: number;
  imageHeight?: number;
  amount?: number;
  weaponType?: string;
  tileClass?: string;
}
