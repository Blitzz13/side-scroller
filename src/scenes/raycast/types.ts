export type RaycastPickupType = "health" | "weapon" | "ammo";

export interface RaycastPickupItem {
  id: number;
  x: number;
  y: number;
  texture: number; // tile ID
  type: RaycastPickupType;
  weaponType?: string;
  amount: number;
  collected: boolean;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  vOffset?: number;
  z?: number;
  anchor?: string;
}

export interface RaycastWeaponDef {
  id: string;
  name: string;
  equippedTexture: string;
  itemTexture: string;
  fireSounds: string[];
  fireRate: number; // minimum ms between shots
  damage: number;
  defaultAmmo: number;
}

export const RAYCAST_WEAPONS: Record<string, RaycastWeaponDef> = {
  e_11: {
    id: "e_11",
    name: "E-11 Blaster Rifle",
    equippedTexture: "assets/E_11-equiped.png",
    itemTexture: "assets/E-11-item.png",
    fireSounds: ["blaster_1", "blaster_2", "blaster_3", "blaster_4"],
    fireRate: 200,
    damage: 25,
    defaultAmmo: 20,
  },
};

export interface RaycastPlayerState {
  health: number;
  maxHealth: number;
  equippedWeapon: string | null;
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
