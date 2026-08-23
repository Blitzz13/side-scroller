import { ISoundConfig } from "./ISoundConfig";
import { RaycastWeaponType } from "../../enums/RaycastWeaponType";

export interface IMuzzleFlashLayer {
  color: number;
  radius: number;
  alpha?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface IMuzzleFlashSparks {
  count: number;
  length?: number;
  color?: number;
  alpha?: number;
}

export interface IMuzzleFlashConfig {
  /** Whether muzzle flash is enabled for this weapon (default: true) */
  enabled?: boolean;
  /** Horizontal offset relative to the weapon sprite in design coordinates */
  offsetX?: number;
  /** Vertical offset relative to the weapon sprite in design coordinates */
  offsetY?: number;
  /** Whether the muzzle flash offset rotates with the weapon recoil / tilt (default: true) */
  followRotation?: boolean;
  /** Duration in animation frames that the flash stays visible (default: 5) */
  duration?: number;
  /** Overall scale multiplier for the flash (default: 1.0) */
  scale?: number;
  /** Optional custom multi-layer circles for full artistic freedom */
  layers?: IMuzzleFlashLayer[];
  /** Outer glow layer color (default: 0xff3300) */
  outerColor?: number;
  /** Outer glow radius (default: 32) */
  outerRadius?: number;
  /** Outer glow opacity (default: 0.4) */
  outerAlpha?: number;
  /** Inner bright flash color (default: 0xff8800) */
  innerColor?: number;
  /** Inner bright flash radius (default: 18) */
  innerRadius?: number;
  /** Inner bright flash opacity (default: 0.85) */
  innerAlpha?: number;
  /** Core hot spark color (default: 0xffffff) */
  coreColor?: number;
  /** Core hot spark radius (default: 8) */
  coreRadius?: number;
  /** Core hot spark opacity (default: 0.95) */
  coreAlpha?: number;
  /** Optional sparks / rays burst */
  sparks?: IMuzzleFlashSparks;
  /** Optional sprite texture name if using an image asset */
  texture?: string;
}

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
  muzzleFlash?: IMuzzleFlashConfig;
}
