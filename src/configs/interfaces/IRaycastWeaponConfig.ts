import { ISoundConfig } from "./ISoundConfig";
import { RaycastWeaponType } from "../../enums/RaycastWeaponType";

export interface IRaycastWeaponConfig {
  type: RaycastWeaponType;
  name: string;
  damage: number;
  maxAmmo: number;
  defaultAmmo: number;
  rateOfFire: number; // minimum ms between shots
  equippedTexture: string;
  itemTexture: string;
  shootSounds: ISoundConfig[];
  reloadSound?: ISoundConfig;
}
