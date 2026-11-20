import { RaycastWeaponType } from "../enums/RaycastWeaponType";
import { IRaycastWeaponConfig } from "../configs/interfaces/IRaycastWeaponConfig";
import { DoorOpen } from "../enums/DoorOpen";
import { TileType } from "../enums/TileType";
import { Align } from "../enums/Align";
import { Anchor } from "../enums/Anchor";
import { FlatWallRotation } from "../enums/FlatWallRotation";
import { Weapons } from "../enums/Weapons";
import { PickupType } from "../enums/PickUpType";

export type DoorSlideMode = DoorOpen;

export interface RaycastPlayerState {
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  equippedWeapon: RaycastWeaponType | null;
  weaponConfig: IRaycastWeaponConfig | null;
  ammo: number;
  maxAmmo: number;
  keycards: Set<string>;
  isSprinting: boolean;
}

export interface TileMeta {
  type?: string;
  tileType?: TileType;
  surface?: string;
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

export interface ILinkable {
  action?: string;
  linkIds?: (string | number)[] | any;
}

export interface IWait {
  shouldWait: boolean;
  waitTimeInSeconds: number;
}

export interface IDestructableWall {
  align: Align | string;
  isEnabling?: boolean;
  linkIds?: (string | number)[];
  link?: ILinkable;
  offset: number;
  rotation: FlatWallRotation | string;
  wall?: ITile;
  objective?: {
    isObjective: boolean;
    objectiveKey: string;
    displayMessage?: string;
  };
}

export interface IEnemy {
  itemDrop?: IPickupItem;
  triggerAlert?: boolean;
}

export interface IEnemyItemDrop {
  type: string;
  amount?: number;
  weaponType?: string;
  itemId?: string;
  sprite?: string;
  object?: {
    anchor?: string;
    scale?: number;
    vOffset?: number;
  };
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
  linkIds?: string[];
  linkAction?: string;
  isEnabling?: boolean;
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
  isWallBlock?: boolean;
  gridX?: number;
  gridY?: number;
  destroyedTextureId?: number;
  isObjective?: boolean;
  objectiveKey?: string;
  wait?: IWait;
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
  objId?: number;
  name?: string;
  gridX: number;
  gridY: number;
  texture: number;
  rotation?: "vertical" | "horizontal" | string;
  align?: "center" | "left" | "right" | "top" | "bottom" | string;
  offset?: number;
  linkIds?: (string | number)[] | string | number;
  link?: ILinkable;
  isEnabling?: boolean;
  isObjective?: boolean;
  objectiveKey?: string;
}
