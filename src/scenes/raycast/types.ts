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
import { DoorOpen } from "../../enums/DoorOpen";
import { TileType } from "../../enums/TileType";
import { Align } from "../../enums/Align";
import { Anchor } from "../../enums/Anchor";
import { FlatWallRotation } from "../../enums/FlatWallRotation";
import { Weapons } from "../../enums/Weapons";
import { PickupType } from "../../enums/PickUpType";

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
export type DoorSlideMode = DoorOpen;
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
  tileType?: TileType;
  open?: DoorOpen;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  vOffset?: number;
  z?: number;
  anchor?: Anchor | string;
  imageWidth?: number;
  imageHeight?: number;
  amount?: number;
  weaponType?: Weapons | string;
  tileClass?: string;
  image?: string;
}

export interface ITile {
  open: DoorOpen;
  tileType: TileType;
}

export interface IDestructableWall {
  align: Align | string;
  linkIds: (string | number)[];
  offset: number;
  rotation: FlatWallRotation | string;
}

export interface IObject {
  anchor: Anchor | string;
  scale: number;
  vOffset: number;
}

export interface IPickupItem {
  amount: number;
  itemId: string;
  object: IObject;
  sprite: string;
  type: PickupType | string;
  weaponType: Weapons | string;
}

export interface IWeapon {
  pickup: IPickupItem;
  type: Weapons | string;
}

export interface RaycastBreakable {
  id: number;
  objId?: number;
  tileId?: number;
  linkId?: string;
  x: number;
  y: number;
  type: "chair" | "table" | "power_cell" | string;
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

export interface ThinWallDescriptor {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  texture: number;
  orientation: "vertical" | "horizontal";
  isDestructableWall?: boolean;
}

export interface DestructableWallConfig {
  id: number;
  name?: string;
  gridX: number;
  gridY: number;
  texture: number;
  rotation?: "vertical" | "horizontal" | string;
  align?: "center" | "left" | "right" | "top" | "bottom" | string;
  offset?: number;
  linkIds?: string[] | string | number;
}

export * from "../../configs/interfaces/IEnemyVoicelineConfig";
export * from "../../configs/EnemyVoicelineConfig";
export * from "./EnemyVoicelineManager";

