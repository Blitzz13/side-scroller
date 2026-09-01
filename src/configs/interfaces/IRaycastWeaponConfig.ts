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
  rateOfFire: number; // minimum ms between shots/throws
  equippedTexture: string;
  itemTexture: string;
  shootSounds: ISoundConfig[];
  reloadSound?: ISoundConfig;
  muzzleFlash?: IMuzzleFlashConfig;

  // Configurable screen view positioning, scale, and anchor
  viewPosX?: number; // Base screen X (e.g. gameConfig.width * 0.58)
  viewPosY?: number; // Base screen Y (e.g. gameConfig.height + 25)
  viewScale?: number; // Scale multiplier (e.g. 1.05)
  anchorX?: number; // Texture anchor X (default: 0.5)
  anchorY?: number; // Texture anchor Y (default: 0.85)

  // Configurable throwable & explosion properties
  isThrowable?: boolean;
  fuseTime?: number; // Timer before detonation in seconds (e.g. 2.0)
  explosionRadius?: number; // AOE damage radius in world units (e.g. 3.5)
  throwSpeed?: number; // Initial throw velocity in world units/sec (e.g. 9.5)
  bounciness?: number; // Floor bounce restitution (0.0 = no bounce / thud, 1.0 = super elastic, e.g. 0.25)
  wallBounciness?: number; // Wall bounce restitution (0.0 = stops on wall, 1.0 = full reflection, e.g. 0.3)
  friction?: number; // Ground rolling friction (lower = stops faster, e.g. 0.75 - 0.85)
  maxBounces?: number; // Max bounces before settling flat on the ground (e.g. 2)
}

