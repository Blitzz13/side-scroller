import { BitmapText, Container, Graphics, Sprite, Texture } from "pixi.js";
import { gameConfig } from "../../configs/GameConfig";

export class RaycastHUD extends Container {
  // Health components
  private healthContainer: Container;
  private healthBarBg: Graphics;
  private healthBarFill: Graphics;
  private healthText: BitmapText;
  private healthIcon: Sprite;

  // Weapon & Ammo components
  private weaponContainer: Container;
  private weaponNameText: BitmapText;
  private ammoText: BitmapText;
  private ammoIcon: Sprite;

  // Toast notification
  private toastContainer: Container;
  private toastBg: Graphics;
  private toastText: BitmapText;
  private toastTimer: number = 0;

  // Screen Flash
  private flashOverlay: Graphics;
  private flashAlpha: number = 0;
  private flashColor: number = 0x000000;

  constructor() {
    super();

    const screenW = gameConfig.width;
    const screenH = gameConfig.height;

    // 1. Fullscreen flash overlay (bottom-most in HUD layer)
    this.flashOverlay = new Graphics();
    this.flashOverlay.visible = false;
    this.addChild(this.flashOverlay);

    // 2. Health HUD (Bottom-Left)
    this.healthContainer = new Container();
    this.healthContainer.position.set(24, screenH - 85);

    this.healthBarBg = new Graphics();
    this.healthBarBg.beginFill(0x0a1018, 0.75);
    this.healthBarBg.lineStyle(2, 0x00ffff, 0.4);
    this.healthBarBg.drawRoundedRect(0, 0, 240, 60, 10);
    this.healthBarBg.endFill();
    this.healthContainer.addChild(this.healthBarBg);

    // Health icon
    try {
      this.healthIcon = Sprite.from("health");
    } catch {
      this.healthIcon = new Sprite();
    }
    this.healthIcon.scale.set(0.06);
    this.healthIcon.position.set(12, 12);
    this.healthContainer.addChild(this.healthIcon);

    // Health bar fill
    this.healthBarFill = new Graphics();
    this.healthContainer.addChild(this.healthBarFill);

    // Health text
    this.healthText = new BitmapText("100 HP", {
      fontName: "arial32",
    });
    this.healthText.scale.set(0.65);
    this.healthText.position.set(55, 12);
    this.healthContainer.addChild(this.healthText);

    this.addChild(this.healthContainer);
    this.drawHealthBar(100, 100);

    // 3. Weapon / Ammo HUD (Bottom-Right)
    this.weaponContainer = new Container();
    this.weaponContainer.position.set(screenW - 264, screenH - 85);

    const weaponBg = new Graphics();
    weaponBg.beginFill(0x0a1018, 0.75);
    weaponBg.lineStyle(2, 0xffaa00, 0.4);
    weaponBg.drawRoundedRect(0, 0, 240, 60, 10);
    weaponBg.endFill();
    this.weaponContainer.addChild(weaponBg);

    // Ammo icon
    try {
      this.ammoIcon = Sprite.from("ammo");
    } catch {
      this.ammoIcon = new Sprite();
    }
    this.ammoIcon.scale.set(0.12);
    this.ammoIcon.position.set(12, 12);
    this.weaponContainer.addChild(this.ammoIcon);

    this.weaponNameText = new BitmapText("UNARMED", {
      fontName: "arial32",
    });
    this.weaponNameText.scale.set(0.5);
    this.weaponNameText.position.set(55, 10);
    this.weaponContainer.addChild(this.weaponNameText);

    this.ammoText = new BitmapText("--", {
      fontName: "arial32",
    });
    this.ammoText.scale.set(0.65);
    this.ammoText.position.set(55, 28);
    this.weaponContainer.addChild(this.ammoText);

    this.addChild(this.weaponContainer);

    // 4. Toast notification (Top-Center)
    this.toastContainer = new Container();
    this.toastContainer.position.set(screenW / 2, 45);
    this.toastContainer.visible = false;

    this.toastBg = new Graphics();
    this.toastContainer.addChild(this.toastBg);

    this.toastText = new BitmapText("", {
      fontName: "arial32",
    });
    this.toastText.scale.set(0.6);
    this.toastContainer.addChild(this.toastText);

    this.addChild(this.toastContainer);
  }

  public setHealth(currentHealth: number, maxHealth: number = 100): void {
    const clampedHp = Math.max(0, Math.min(maxHealth, currentHealth));
    this.healthText.text = `${Math.ceil(clampedHp)} HP`;
    this.drawHealthBar(clampedHp, maxHealth);
  }

  private drawHealthBar(hp: number, maxHp: number): void {
    this.healthBarFill.clear();
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    const width = 170 * ratio;

    // Color shift based on HP level
    let barColor = 0x00ff88;
    if (ratio <= 0.25) {
      barColor = 0xff2222;
    } else if (ratio <= 0.5) {
      barColor = 0xffaa00;
    }

    this.healthBarFill.beginFill(barColor, 0.85);
    this.healthBarFill.drawRoundedRect(55, 38, width, 12, 4);
    this.healthBarFill.endFill();
  }

  public setWeapon(weaponName: string | null, ammo: number): void {
    if (weaponName) {
      this.weaponNameText.text = weaponName.toUpperCase();
      this.ammoText.text = `${ammo} AMMO`;
    } else {
      this.weaponNameText.text = "UNARMED";
      this.ammoText.text = "--";
    }
  }

  public showToast(message: string, borderColor: number = 0x00e5ff): void {
    this.toastText.text = message;
    const paddingX = 20;
    const paddingY = 8;
    const textW = this.toastText.textWidth * 0.6;
    const textH = this.toastText.textHeight * 0.6;

    this.toastBg.clear();
    this.toastBg.beginFill(0x060f18, 0.85);
    this.toastBg.lineStyle(2, borderColor, 0.8);
    this.toastBg.drawRoundedRect(
      -textW / 2 - paddingX,
      -paddingY,
      textW + paddingX * 2,
      textH + paddingY * 2,
      8
    );
    this.toastBg.endFill();

    this.toastText.position.set(-textW / 2, 0);
    this.toastContainer.visible = true;
    this.toastContainer.alpha = 1;
    this.toastTimer = 150; // ~2.5 seconds at 60fps
  }

  public flashScreen(color: number, maxAlpha: number = 0.3): void {
    this.flashColor = color;
    this.flashAlpha = maxAlpha;
    this.renderFlashOverlay();
  }

  private renderFlashOverlay(): void {
    if (this.flashAlpha <= 0.01) {
      this.flashOverlay.visible = false;
      return;
    }

    this.flashOverlay.clear();
    this.flashOverlay.beginFill(this.flashColor, this.flashAlpha);
    this.flashOverlay.drawRect(0, 0, gameConfig.width, gameConfig.height);
    this.flashOverlay.endFill();
    this.flashOverlay.visible = true;
  }

  public update(delta: number): void {
    // 1. Screen flash fade
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - 0.02 * delta);
      this.renderFlashOverlay();
    }

    // 2. Toast fade out
    if (this.toastTimer > 0) {
      this.toastTimer -= delta;
      if (this.toastTimer < 30) {
        this.toastContainer.alpha = this.toastTimer / 30;
      }
      if (this.toastTimer <= 0) {
        this.toastContainer.visible = false;
      }
    }
  }

  public dispose(): void {
    this.destroy({ children: true });
  }
}
