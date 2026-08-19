import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { sound } from "@pixi/sound";
import { gameConfig } from "../../configs/GameConfig";
import { IRaycastWeaponConfig, RaycastWeaponType, getRaycastWeaponConfig } from "./types";

export class RaycastWeaponView extends Container {
  private weaponSprite: Sprite;
  private muzzleFlash: Graphics;
  private crosshair: Graphics;
  private currentWeapon: IRaycastWeaponConfig | null = null;

  // Animation states
  private bobTimer: number = 0;
  private idleTimer: number = 0;
  private recoilOffset: number = 0;
  private recoilRotation: number = 0;
  private flashTimer: number = 0;

  // Base positioning (centered/right-aligned bottom first-person view)
  private readonly baseScale: number = 1.05;
  private readonly basePosX: number = gameConfig.width * 0.58;
  private readonly basePosY: number = gameConfig.height + 25;

  constructor() {
    super();

    // 1. Crosshair in screen center
    this.crosshair = new Graphics();
    this.drawCrosshair();
    this.addChild(this.crosshair);

    // 2. Muzzle flash effect
    this.muzzleFlash = new Graphics();
    this.muzzleFlash.visible = false;
    this.addChild(this.muzzleFlash);

    // 3. Weapon sprite (drawn on top of 3D world, below HUD)
    // Anchor set at 85% down the weapon (near rear grip/stock)
    this.weaponSprite = new Sprite();
    this.weaponSprite.anchor.set(0.5, 0.85);
    this.weaponSprite.scale.set(this.baseScale);
    this.weaponSprite.position.set(this.basePosX, this.basePosY);
    this.weaponSprite.visible = false;
    this.addChild(this.weaponSprite);
  }

  private drawCrosshair(): void {
    const cx = gameConfig.width / 2;
    const cy = gameConfig.height / 2;
    const size = 14;
    const gap = 5;
    const thickness = 2.5;
    const halfThick = thickness / 2;
    const outline = 1.2;

    this.crosshair.clear();

    // 1. Black outer contrast border (visible on bright walls, sky, dark floors)
    const shadowColor = 0x000000;
    const shadowAlpha = 0.85;

    // Center dot outline
    this.crosshair.beginFill(shadowColor, shadowAlpha);
    this.crosshair.drawCircle(cx, cy, 2.5 + outline);
    this.crosshair.endFill();

    // 4 bars outline
    this.crosshair.beginFill(shadowColor, shadowAlpha);
    // Top
    this.crosshair.drawRect(
      cx - halfThick - outline,
      cy - gap - size - outline,
      thickness + outline * 2,
      size + outline * 2
    );
    // Bottom
    this.crosshair.drawRect(
      cx - halfThick - outline,
      cy + gap - outline,
      thickness + outline * 2,
      size + outline * 2
    );
    // Left
    this.crosshair.drawRect(
      cx - gap - size - outline,
      cy - halfThick - outline,
      size + outline * 2,
      thickness + outline * 2
    );
    // Right
    this.crosshair.drawRect(
      cx + gap - outline,
      cy - halfThick - outline,
      size + outline * 2,
      thickness + outline * 2
    );
    this.crosshair.endFill();

    // 2. Bright Cyan crosshair bars and center dot (solid 100% opacity)
    const crossColor = 0x00ffff;
    const crossAlpha = 0.95;

    this.crosshair.beginFill(crossColor, crossAlpha);
    // Top bar
    this.crosshair.drawRect(cx - halfThick, cy - gap - size, thickness, size);
    // Bottom bar
    this.crosshair.drawRect(cx - halfThick, cy + gap, thickness, size);
    // Left bar
    this.crosshair.drawRect(cx - gap - size, cy - halfThick, size, thickness);
    // Right bar
    this.crosshair.drawRect(cx + gap, cy - halfThick, size, thickness);
    // Center dot
    this.crosshair.drawCircle(cx, cy, 2);
    this.crosshair.endFill();
  }

  public equip(
    weapon: RaycastWeaponType | IRaycastWeaponConfig | string,
    customTexture?: Texture
  ): void {
    const def =
      typeof weapon === "object"
        ? weapon
        : getRaycastWeaponConfig(weapon as RaycastWeaponType) || getRaycastWeaponConfig(RaycastWeaponType.E11)!;

    this.currentWeapon = def;

    if (customTexture) {
      this.weaponSprite.texture = customTexture;
    } else {
      this.weaponSprite.texture = Texture.from(def.equippedTexture);
    }

    this.weaponSprite.visible = true;
    this.recoilOffset = 0;
    this.recoilRotation = 0;
  }

  public unequip(): void {
    this.currentWeapon = null;
    this.weaponSprite.visible = false;
  }

  public get isEquipped(): boolean {
    return this.currentWeapon !== null && this.weaponSprite.visible;
  }

  public get weaponConfig(): IRaycastWeaponConfig | null {
    return this.currentWeapon;
  }

  public shoot(): boolean {
    if (!this.currentWeapon || !this.weaponSprite.visible) return false;

    // Recoil: pulls back towards player (+y) and rotates up from the 85% back anchor
    this.recoilOffset = 18;
    this.recoilRotation = 0.08;

    // Apply immediate position for muzzle flash alignment
    this.weaponSprite.y = this.basePosY + this.recoilOffset;
    this.weaponSprite.rotation = this.recoilRotation;

    // Trigger muzzle flash
    this.flashTimer = 5; // ~5 frames
    this.drawMuzzleFlash();

    // Play blaster shoot sound from config array
    if (this.currentWeapon.shootSounds && this.currentWeapon.shootSounds.length > 0) {
      const soundIndex = Math.floor(Math.random() * this.currentWeapon.shootSounds.length);
      const snd = this.currentWeapon.shootSounds[soundIndex];
      try {
        sound.play(snd.src, { volume: snd.volume, loop: snd.loop });
      } catch (e) {
        console.warn(`Failed to play shoot sound ${snd.src}:`, e);
      }
    }

    return true;
  }

  private drawMuzzleFlash(): void {
    this.muzzleFlash.clear();
    if (!this.weaponSprite.visible) {
      this.muzzleFlash.visible = false;
      return;
    }

    // Exact rotated muzzle tip position at front barrel opening relative to rear anchor (0.5, 0.85)
    const cos = Math.cos(this.weaponSprite.rotation);
    const sin = Math.sin(this.weaponSprite.rotation);
    const localMuzzleX = 97 * this.baseScale;
    const localMuzzleY = -284 * this.baseScale;

    const muzzleX = this.weaponSprite.x //+ (localMuzzleX * cos - localMuzzleY * sin);
    const muzzleY = this.weaponSprite.y //+ (localMuzzleX * sin + localMuzzleY * cos);

    // Outer plasma glow
    this.muzzleFlash.beginFill(0xff3300, 0.4);
    this.muzzleFlash.drawCircle(muzzleX, muzzleY, 32);
    this.muzzleFlash.endFill();

    // Inner bright blaster flash
    this.muzzleFlash.beginFill(0xff8800, 0.85);
    this.muzzleFlash.drawCircle(muzzleX, muzzleY, 18);
    this.muzzleFlash.endFill();

    // Core white-hot spark
    this.muzzleFlash.beginFill(0xffffff, 0.95);
    this.muzzleFlash.drawCircle(muzzleX, muzzleY, 8);
    this.muzzleFlash.endFill();

    this.muzzleFlash.visible = true;
  }

  public update(delta: number, isMoving: boolean, moveIntensity: number = 1): void {
    if (!this.weaponSprite.visible) {
      this.muzzleFlash.visible = false;
      return;
    }

    // 1. Bobbing / Breathing animation
    let bobX = 0;
    let bobY = 0;

    if (isMoving) {
      this.bobTimer += 0.12 * delta * moveIntensity;
      bobX = Math.cos(this.bobTimer) * 8;
      bobY = Math.abs(Math.sin(this.bobTimer)) * 7;
    } else {
      this.idleTimer += 0.04 * delta;
      bobX = Math.cos(this.idleTimer * 0.5) * 1.5;
      bobY = Math.sin(this.idleTimer) * 2.5;
    }

    // 2. Smooth recoil recovery (recovers back to resting position)
    if (this.recoilOffset > 0) {
      this.recoilOffset = Math.max(0, this.recoilOffset - 2.2 * delta);
    }
    if (Math.abs(this.recoilRotation) > 0.001) {
      this.recoilRotation *= Math.pow(0.80, delta);
    } else {
      this.recoilRotation = 0;
    }

    // Apply combined transformation (pulls towards player on Y, rotates muzzle up)
    this.weaponSprite.x = this.basePosX + bobX;
    this.weaponSprite.y = this.basePosY + bobY + this.recoilOffset;
    this.weaponSprite.rotation = this.recoilRotation;

    // 3. Update muzzle flash timer and locked position
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) {
        this.muzzleFlash.visible = false;
      } else {
        this.drawMuzzleFlash();
      }
    }
  }

  public dispose(): void {
    this.destroy({ children: true });
  }
}
