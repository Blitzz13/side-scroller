import { AnimatedSprite, Graphics, Texture } from "pixi.js";
import {
  DoorOpen,
  TileType,
  Align,
  Anchor,
  FlatWallRotation,
  Weapons,
  PickupType,
  RaycastPickupType,
  RaycastWeaponType,
  RaycastEnemyType,
  IRaycastWeaponConfig,
  IMuzzleFlashConfig,
  IMuzzleFlashLayer,
  IMuzzleFlashSparks,
  IRaycastPickupConfig,
  IRaycastEnemyConfig,
  IRaycastEnemyAnimationConfig,
  IRaycastEnemyAnimationSequence,
  raycastWeaponConfigs,
  getRaycastWeaponConfig,
  raycastPickupConfigs,
  getRaycastPickupConfig,
  raycastEnemyConfigs,
  getRaycastEnemyConfig,
} from "@game/core-types";

// Platform-independent types now live in @game/core-types; re-exported here so
// existing `./types` imports keep working. Only Pixi-coupled models remain below.
export {
  DoorOpen,
  TileType,
  Align,
  Anchor,
  FlatWallRotation,
  Weapons,
  PickupType,
  RaycastPickupType,
  RaycastWeaponType,
  RaycastEnemyType,
};
export {
  IRaycastWeaponConfig,
  IMuzzleFlashConfig,
  IMuzzleFlashLayer,
  IMuzzleFlashSparks,
  IRaycastPickupConfig,
  IRaycastEnemyConfig,
  IRaycastEnemyAnimationConfig,
  IRaycastEnemyAnimationSequence,
};
export {
  raycastWeaponConfigs,
  getRaycastWeaponConfig,
  raycastPickupConfigs,
  getRaycastPickupConfig,
  raycastEnemyConfigs,
  getRaycastEnemyConfig,
};
export type {
  DoorSlideMode,
  RaycastPlayerState,
  TileMeta,
  ITile,
  ILinkable,
  IWait,
  IDestructableWall,
  IEnemy,
  IEnemyItemDrop,
  IObject,
  IPickupItem,
  IWeapon,
  RaycastBreakable,
  ThinWallDescriptor,
  DestructableWallConfig,
} from "@game/core-types";

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

export {
  defaultVoicePool,
  defaultViperDroidVoicePool,
  defaultImperialOfficerVoicePool,
  enemyVoicelineConfig,
  stormtrooperVoicelineConfig,
  defaultStormtrooperVoicePool,
  defaultDestructibleWallConfig,
} from "@game/core-types";
export type {
  IEnemyVoicePool,
  IEnemyVoicelineConfig,
  IStormtrooperVoicelineConfig,
  IDestructibleWallExplosionConfig,
  IDestructibleWallConfig,
} from "@game/core-types";
export * from "./EnemyVoicelineManager";
