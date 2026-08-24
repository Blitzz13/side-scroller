import { AnimatedSprite, Graphics, Texture } from "pixi.js";
import { RaycastPickupType } from "../../enums/RaycastPickupType";
import { RaycastWeaponType } from "../../enums/RaycastWeaponType";
import { RaycastEnemyType } from "../../enums/RaycastEnemyType";
import {
  IRaycastWeaponConfig,
  IMuzzleFlashConfig,
  IMuzzleFlashLayer,
  IMuzzleFlashSparks,
} from "../../configs/interfaces/IRaycastWeaponConfig";
import { IRaycastPickupConfig } from "../../configs/interfaces/IRaycastPickupConfig";
import { IRaycastEnemyConfig } from "../../configs/interfaces/IRaycastEnemyConfig";
import {
  raycastWeaponConfigs,
  getRaycastWeaponConfig,
} from "../../configs/RaycastWeaponConfigs";
import {
  raycastPickupConfigs,
  getRaycastPickupConfig,
} from "../../configs/RaycastPickupConfigs";
import {
  raycastEnemyConfigs,
  getRaycastEnemyConfig,
} from "../../configs/RaycastEnemyConfigs";

export { RaycastPickupType, RaycastWeaponType, RaycastEnemyType };
export {
  IRaycastWeaponConfig,
  IMuzzleFlashConfig,
  IMuzzleFlashLayer,
  IMuzzleFlashSparks,
  IRaycastPickupConfig,
  IRaycastEnemyConfig,
};
export {
  raycastWeaponConfigs,
  getRaycastWeaponConfig,
  raycastPickupConfigs,
  getRaycastPickupConfig,
  raycastEnemyConfigs,
  getRaycastEnemyConfig,
};

export interface RaycastPickupItem {
  id: number;
  x: number;
  y: number;
  texture: number; // tile ID
  type: RaycastPickupType;
  weaponType?: RaycastWeaponType;
  keyColor?: "blue" | "green" | "red" | string;
  amount: number;
  collected: boolean;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  vOffset?: number;
  z?: number;
  anchor?: string;
  config?: IRaycastPickupConfig;
  pickupRadius?: number;
  animatedSprite?: AnimatedSprite;
  occlusionMask?: Graphics;
  parentBreakable?: any;
}

export interface RaycastPlayerState {
  health: number;
  maxHealth: number;
  equippedWeapon: RaycastWeaponType | null;
  weaponConfig: IRaycastWeaponConfig | null;
  ammo: number;
  maxAmmo: number;
  keycards: Set<string>;
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
  customTexture?: Texture;
  customSlices?: Texture[];
  flipX?: boolean;
  tint?: number;
  enemyRef?: any;
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
  image?: string;
}

export interface RaycastBreakable {
  id: number;
  x: number;
  y: number;
  type: "chair" | "table" | string;
  name: string;
  health: number;
  maxHealth: number;
  isBroken: boolean;
  intactTextureId: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  vOffset?: number;
  z?: number;
  anchor?: string;
  hitRadius: number;
  blocksMovement: boolean;
}
