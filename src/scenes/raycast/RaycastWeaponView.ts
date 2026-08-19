import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { sound } from "@pixi/sound";
import { gameConfig } from "../../configs/GameConfig";
import { RAYCAST_WEAPONS, RaycastWeaponDef } from "./types";

export class RaycastWeaponView extends Container {
  private weaponSprite: Sprite;
  private muzzleFlash: Graphics;
  private crosshair: Graphics;
  private currentWeapon: RaycastWeaponDef | null = null;

  // Animation states
  private bobTimer: number = 0;
  private idleTimer: number = 0;
  private recoilOffset: number = 0;
  private recoilRotation: number = 0;
  private flashTimer: number = 0;

  // Base positioning (centered/right-aligned bottom first-person view)
  private readonly baseScale: number = 1.05;
  private readonly basePosX: number = gameConfig.width * 0.58;
  private readonly basePosY: number = gameConfig.height + 15;

  constructor() {
    super();

    // 1. Crosshair in screen center
    this.crosshair = new Graphics();
    this.drawCrosshair();
    this.addChild(this.crosshair);

    // 2. Weapon sprite (drawn on top of 3D world, below HUD)
    this.weaponSprite = new Sprite();
    this.weaponSprite.anchor.set(0.5, 1.0);
    this.weaponSprite.scale.set(this.baseScale);
    this.weaponSprite.position.set(this.basePosX, this.basePosY);
    this.weaponSprite.visible = false;
    this.addChild(this.weaponSprite);

    // 3. Muzzle flash effect
    this.muzzleFlash = new Graphics();
    this.muzzleFlash.visible = false;
    this.addChild(this.muzzleFlash);
  }

  private drawCrosshair(): void {
    const cx = gameConfig.width / 2;
    const cy = gameConfig.height / 2;
    const size = 12;
    const gap = 4;

    this.crosshair.clear();
    // Center subtle dot
    this.crosshair.beginFill(0x44eeff, 0.85);
    this.crosshair.drawCircle(cx, cy, 2);
    this.crosshair.endFill();

    // 4 crosshair lines with outer shadow
    this.crosshair.lineStyle(1.5, 0x44eeff, 0.7);
    // Top
    this.crosshair.moveTo(cx, cy - gap);
    this.crosshair.lineTo(cx, cy - gap - size);
    // Bottom
    this.crosshair.moveTo(cx, cy + gap);
    this.crosshair.lineTo(cx, cy + gap + size);
    // Left
    this.crosshair.moveTo(cx - gap, cy);
    this.crosshair.lineTo(cx - gap - size, cy);
    // Right
    this.crosshair.moveTo(cx + gap, cy);
    this.crosshair.lineTo(cx + gap + size, cy);
  }

  public equip(weaponId: string, customTexture?: Texture): void {
    const def = RAYCAST_WEAPONS[weaponId] || {
      id: weaponId,
      name: "Blaster",
      equippedTexture: "assets/E_11-equiped.png",
      itemTexture: "assets/E-11-item.png",
      fireSounds: ["blaster_1", "blaster_2", "blaster_3", "blaster_4"],
      fireRate: 200,
      damage: 25,
      defaultAmmo: 20,
    };

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

  public get weaponDef(): RaycastWeaponDef | null {
    return this.currentWeapon;
  }

  public shoot(): boolean {
    if (!this.currentWeapon || !this.weaponSprite.visible) return false;

    // Trigger recoil
    this.recoilOffset = 24;
    this.recoilRotation = -0.04;

    // Trigger muzzle flash
    this.flashTimer = 5; // ~5 frames
    this.drawMuzzleFlash();

    // Play blaster sound
    if (this.currentWeapon.fireSounds && this.currentWeapon.fireSounds.length > 0) {
      const soundIndex = Math.floor(Math.random() * this.currentWeapon.fireSounds.length);
      const sndName = this.currentWeapon.fireSounds[soundIndex];
      try {
        sound.play(sndName, { volume: 1.2 });
      } catch (e) {
        console.warn(`Failed to play ${sndName}:`, e);
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

    // Muzzle position relative to the weapon sprite
    const muzzleX = this.weaponSprite.x - 70;
    const muzzleY = this.weaponSprite.y - this.weaponSprite.height * 0.72;

    // Outer plasma glow
    this.muzzleFlash.beginFill(0xff3300, 0.45);
    this.muzzleFlash.drawCircle(muzzleX, muzzleY, 34);
    this.muzzleFlash.endFill();

    // Inner bright blaster flash
    this.muzzleFlash.beginFill(0xffaa22, 0.85);
    this.muzzleFlash.drawCircle(muzzleX, muzzleY, 20);
    this.muzzleFlash.endFill();

    // Core white hot spark
    this.muzzleFlash.beginFill(0xffffff, 0.95);
    this.muzzleFlash.drawCircle(muzzleX, muzzleY, 9);
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

    // 2. Smooth recoil recovery
    if (this.recoilOffset > 0) {
      this.recoilOffset = Math.max(0, this.recoilOffset - 2.5 * delta);
    }
    if (Math.abs(this.recoilRotation) > 0.001) {
      this.recoilRotation *= Math.pow(0.85, delta);
    } else {
      this.recoilRotation = 0;
    }

    // 3. Update muzzle flash timer
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) {
        this.muzzleFlash.visible = false;
      }
    }

    // Apply combined transformation
    this.weaponSprite.x = this.basePosX + bobX;
    this.weaponSprite.y = this.basePosY + bobY + this.recoilOffset;
    this.weaponSprite.rotation = this.recoilRotation;
  }

  public dispose(): void {
    this.destroy({ children: true });
  }
}
