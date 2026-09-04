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

  private flashSprite: Sprite;

  // Base positioning (configurable per weapon)
  private baseScale: number = 1.05;
  private basePosX: number = gameConfig.width * 0.58;
  private basePosY: number = gameConfig.height + 25;

  // Throw animation states
  private isThrowing: boolean = false;
  private throwProgress: number = 0;
  private onThrowRelease?: () => void;
  private onThrowComplete?: () => void;

  constructor() {
    super();

    // 1. Crosshair in screen center
    this.crosshair = new Graphics();
    this.drawCrosshair();
    this.addChild(this.crosshair);

    // 2. Muzzle flash effect (procedural graphics + optional sprite)
    this.muzzleFlash = new Graphics();
    this.muzzleFlash.visible = false;
    this.addChild(this.muzzleFlash);

    this.flashSprite = new Sprite();
    this.flashSprite.anchor.set(0.5, 0.5);
    this.flashSprite.visible = false;
    this.addChild(this.flashSprite);

    // 3. Weapon sprite (drawn on top of 3D world, below HUD)
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

    // Apply configurable screen position, scale, and anchor
    this.basePosX = def.viewPosX ?? gameConfig.width * 0.58;
    this.basePosY = def.viewPosY ?? gameConfig.height + 25;
    this.baseScale = def.viewScale ?? 1.05;
    const ancX = def.anchorX ?? 0.5;
    const ancY = def.anchorY ?? 0.85;

    this.weaponSprite.anchor.set(ancX, ancY);
    this.weaponSprite.scale.set(this.baseScale);
    this.weaponSprite.position.set(this.basePosX, this.basePosY);

    if (customTexture) {
      this.weaponSprite.texture = customTexture;
    } else {
      this.weaponSprite.texture = Texture.from(def.equippedTexture);
    }

    this.weaponSprite.visible = true;
    this.recoilOffset = 0;
    this.recoilRotation = 0;
    this.isThrowing = false;
    this.throwProgress = 0;
  }

  public playThrowAnimation(
    onRelease?: () => void,
    onComplete?: () => void
  ): boolean {
    if (this.isThrowing || !this.currentWeapon) {
      return false;
    }
    this.weaponSprite.visible = true;
    this.isThrowing = true;
    this.throwProgress = 0;
    this.onThrowRelease = onRelease;
    this.onThrowComplete = onComplete;
    return true;
  }

  public unequip(): void {
    this.currentWeapon = null;
    this.weaponSprite.visible = false;
    this.muzzleFlash.visible = false;
    if (this.flashSprite) this.flashSprite.visible = false;
    this.isThrowing = false;
    this.throwProgress = 0;
  }

  public get isEquipped(): boolean {
    return this.currentWeapon !== null && (this.weaponSprite.visible || this.isThrowing);
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

    // Trigger configurable muzzle flash
    const flashCfg = this.currentWeapon.muzzleFlash;
    const isEnabled = flashCfg?.enabled ?? true;
    if (isEnabled) {
      this.flashTimer = flashCfg?.duration ?? 5;
      this.drawMuzzleFlash();
    } else {
      this.flashTimer = 0;
      this.muzzleFlash.visible = false;
      if (this.flashSprite) this.flashSprite.visible = false;
    }

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
    if (this.flashSprite) this.flashSprite.visible = false;

    if (!this.weaponSprite.visible) {
      this.muzzleFlash.visible = false;
      return;
    }

    const cfg = this.currentWeapon?.muzzleFlash;
    if (cfg && cfg.enabled === false) {
      this.muzzleFlash.visible = false;
      return;
    }

    const scale = (cfg?.scale ?? 1.0) * this.baseScale;
    const followRotation = cfg?.followRotation ?? true;

    // Direct configured offsets per weapon relative to weapon anchor
    const rawOffsetX = (cfg?.offsetX ?? 0) * this.baseScale;
    const rawOffsetY = (cfg?.offsetY ?? 0) * this.baseScale;

    let muzzleX = this.weaponSprite.x;
    let muzzleY = this.weaponSprite.y;

    if (followRotation && this.weaponSprite.rotation !== 0) {
      const cos = Math.cos(this.weaponSprite.rotation);
      const sin = Math.sin(this.weaponSprite.rotation);
      muzzleX += rawOffsetX * cos - rawOffsetY * sin;
      muzzleY += rawOffsetX * sin + rawOffsetY * cos;
    } else {
      muzzleX += rawOffsetX;
      muzzleY += rawOffsetY;
    }

    // 1. Optional Sprite Texture
    if (cfg?.texture) {
      try {
        this.flashSprite.texture = Texture.from(cfg.texture);
        this.flashSprite.position.set(muzzleX, muzzleY);
        this.flashSprite.rotation = followRotation ? this.weaponSprite.rotation : 0;
        this.flashSprite.scale.set(scale);
        this.flashSprite.visible = true;
      } catch (e) {
        console.warn(`Failed to load muzzle flash texture ${cfg.texture}:`, e);
      }
    }

    // 2. Custom multi-layer circles if defined
    if (cfg?.layers && cfg.layers.length > 0) {
      for (const layer of cfg.layers) {
        const lx = muzzleX + (layer.offsetX ?? 0) * scale;
        const ly = muzzleY + (layer.offsetY ?? 0) * scale;
        const radius = layer.radius * scale;
        const alpha = layer.alpha ?? 1.0;

        this.muzzleFlash.beginFill(layer.color, alpha);
        this.muzzleFlash.drawCircle(lx, ly, radius);
        this.muzzleFlash.endFill();
      }
    } else {
      // 3. Standard configured 3-tier blaster flash layers
      const outerColor = cfg?.outerColor ?? 0xff3300;
      const outerRadius = (cfg?.outerRadius ?? 32) * scale;
      const outerAlpha = cfg?.outerAlpha ?? 0.4;

      const innerColor = cfg?.innerColor ?? 0xff8800;
      const innerRadius = (cfg?.innerRadius ?? 18) * scale;
      const innerAlpha = cfg?.innerAlpha ?? 0.85;

      const coreColor = cfg?.coreColor ?? 0xffffff;
      const coreRadius = (cfg?.coreRadius ?? 8) * scale;
      const coreAlpha = cfg?.coreAlpha ?? 0.95;

      // Outer plasma glow
      if (outerRadius > 0 && outerAlpha > 0) {
        this.muzzleFlash.beginFill(outerColor, outerAlpha);
        this.muzzleFlash.drawCircle(muzzleX, muzzleY, outerRadius);
        this.muzzleFlash.endFill();
      }

      // Inner bright blaster flash
      if (innerRadius > 0 && innerAlpha > 0) {
        this.muzzleFlash.beginFill(innerColor, innerAlpha);
        this.muzzleFlash.drawCircle(muzzleX, muzzleY, innerRadius);
        this.muzzleFlash.endFill();
      }

      // Core white-hot spark
      if (coreRadius > 0 && coreAlpha > 0) {
        this.muzzleFlash.beginFill(coreColor, coreAlpha);
        this.muzzleFlash.drawCircle(muzzleX, muzzleY, coreRadius);
        this.muzzleFlash.endFill();
      }
    }

    // 4. Optional sparks / burst rays if configured
    if (cfg?.sparks && cfg.sparks.count > 0) {
      const sparkCount = cfg.sparks.count;
      const sparkLength = (cfg.sparks.length ?? 24) * scale;
      const sparkColor = cfg.sparks.color ?? 0xffdd44;
      const sparkAlpha = cfg.sparks.alpha ?? 0.8;

      this.muzzleFlash.lineStyle(2 * scale, sparkColor, sparkAlpha);
      for (let i = 0; i < sparkCount; i++) {
        const angle = (i * (Math.PI * 2)) / sparkCount + (Math.random() * 0.4 - 0.2);
        const len = sparkLength * (0.7 + Math.random() * 0.6);
        const sx = muzzleX + Math.cos(angle) * (8 * scale);
        const sy = muzzleY + Math.sin(angle) * (8 * scale);
        const ex = muzzleX + Math.cos(angle) * len;
        const ey = muzzleY + Math.sin(angle) * len;

        this.muzzleFlash.moveTo(sx, sy);
        this.muzzleFlash.lineTo(ex, ey);
      }
    }

    this.muzzleFlash.visible = true;
  }

  public update(delta: number, isMoving: boolean, moveIntensity: number = 1): void {
    if (!this.currentWeapon) {
      this.muzzleFlash.visible = false;
      if (this.flashSprite) this.flashSprite.visible = false;
      return;
    }

    // 0. Handle throw animation for throwables (e.g. Thermal Detonator)
    if (this.isThrowing) {
      this.muzzleFlash.visible = false;
      if (this.flashSprite) this.flashSprite.visible = false;

      const prevProgress = this.throwProgress;
      this.throwProgress += 0.05 * delta;

      // Phase 1 (0 -> 0.25): Windup (hand pulls back and up slightly)
      if (this.throwProgress < 0.25) {
        const p = this.throwProgress / 0.25;
        this.weaponSprite.x = this.basePosX - 20 * p;
        this.weaponSprite.y = this.basePosY - 35 * p;
        this.weaponSprite.rotation = -0.25 * p;
        this.weaponSprite.visible = true;
      }
      // Phase 2 (0.25 -> 0.55): Toss forward and sweep down offscreen
      else if (this.throwProgress < 0.55) {
        const p = (this.throwProgress - 0.25) / 0.30;
        this.weaponSprite.x = this.basePosX - 20 + 50 * p;
        this.weaponSprite.y = this.basePosY - 35 + 300 * p;
        this.weaponSprite.rotation = -0.25 + 0.65 * p;
        this.weaponSprite.visible = true;

        // Trigger projectile release at peak toss (~0.45)
        if (prevProgress < 0.45 && this.throwProgress >= 0.45) {
          if (this.onThrowRelease) {
            this.onThrowRelease();
            this.onThrowRelease = undefined;
          }
        }
      }
      // Phase 3 (0.55 -> 0.75): Offscreen brief pause
      else if (this.throwProgress < 0.75) {
        this.weaponSprite.visible = false;
      }
      // Phase 4 (0.75 -> 1.0): Draw next detonator upwards from bottom of screen
      else if (this.throwProgress < 1.0) {
        const p = (this.throwProgress - 0.75) / 0.25;
        this.weaponSprite.visible = true;
        this.weaponSprite.x = this.basePosX;
        this.weaponSprite.y = this.basePosY + 160 * (1 - p);
        this.weaponSprite.rotation = 0.15 * (1 - p);
      } else {
        // Finished throw animation
        this.isThrowing = false;
        this.weaponSprite.visible = true;
        this.weaponSprite.x = this.basePosX;
        this.weaponSprite.y = this.basePosY;
        this.weaponSprite.rotation = 0;
        if (this.onThrowComplete) {
          const cb = this.onThrowComplete;
          this.onThrowComplete = undefined;
          cb();
        }
      }
      return;
    }

    if (!this.weaponSprite.visible) {
      this.muzzleFlash.visible = false;
      if (this.flashSprite) this.flashSprite.visible = false;
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
        if (this.flashSprite) this.flashSprite.visible = false;
      } else {
        this.drawMuzzleFlash();
      }
    }
  }

  public dispose(): void {
    this.destroy({ children: true });
  }
}
