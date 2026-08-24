import { ISoundConfig } from "./ISoundConfig";
import { RaycastPickupType } from "../../enums/RaycastPickupType";
import { RaycastWeaponType } from "../../enums/RaycastWeaponType";

export interface IRaycastPickupConfig {
  type: RaycastPickupType;
  name: string;
  amount: number;
  texture: string;
  pickUpSound: ISoundConfig;
  weaponType?: RaycastWeaponType;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  anchor?: "floor" | "ceiling" | "center" | string;
  keyColor?: "blue" | "green" | "red" | string;
  spritesheet?: string;
  pickupRadius?: number;
}
