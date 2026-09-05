import { Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { gameConfig } from "../../configs/GameConfig";

export class RaycastHUD extends Container {
  // Health components
  private healthContainer: Container;
  private healthBarBg: Graphics;
  private healthBarFill: Graphics;
  private healthText: Text;
  private healthIcon: Sprite;

  // Shield components
  private shieldIcon: Graphics;
  private shieldBarFill: Graphics;
  private shieldText: Text;

  // Weapon & Ammo components
  private weaponContainer: Container;
  private weaponNameText: Text;
  private ammoText: Text;
  private ammoIcon: Sprite;
  private switchHint: Text;

  // Toast notification
  private toastContainer: Container;
  private toastBg: Graphics;
  private toastText: Text;
  private toastTimer: number = 0;

  // Screen Flash
  private flashOverlay: Graphics;
  private flashAlpha: number = 0;
  private flashColor: number = 0x000000;

  // Keycards inventory display
  private keycardContainer: Container;
  private keycardBg: Graphics;
  private keycardIcons: Map<string, Sprite> = new Map();

  constructor() {
    super();

    const screenW = gameConfig.width;
    const screenH = gameConfig.height;
    const dpr = Math.max(2, Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 3));

    // 1. Fullscreen flash overlay (bottom-most in HUD layer)
    this.flashOverlay = new Graphics();
    this.flashOverlay.visible = false;
    this.addChild(this.flashOverlay);

    // 2. Health & Shield HUD (Bottom-Left)
    this.healthContainer = new Container();
    this.healthContainer.position.set(24, screenH - 96);

    this.healthBarBg = new Graphics();
    this.healthBarBg.beginFill(0x0a1018, 0.75);
    this.healthBarBg.lineStyle(2, 0x00ffff, 0.4);
    this.healthBarBg.drawRoundedRect(0, 0, 240, 72, 10);
    this.healthBarBg.endFill();
    this.healthContainer.addChild(this.healthBarBg);

    // Layout metrics for perfect vertical and horizontal centering
    const iconCenterX = 26;
    const row1CenterY = 19;
    const row2CenterY = 53;

    // Health icon - centered at (iconCenterX, row1CenterY)
    try {
      this.healthIcon = Sprite.from("health");
    } catch {
      this.healthIcon = new Sprite();
    }
    this.healthIcon.anchor.set(0.5, 0.5);
    this.healthIcon.scale.set(0.04);
    this.healthIcon.position.set(iconCenterX, row1CenterY);
    this.healthContainer.addChild(this.healthIcon);

    // Health text - vertically centered at row1CenterY
    this.healthText = new Text("100 HP", {
      fontFamily: "Arial, sans-serif",
      fontSize: 14,
      fontWeight: "bold",
      fill: 0xffffff,
      letterSpacing: 0.5,
    });
    this.healthText.resolution = dpr;
    this.healthText.anchor.set(0, 0.5);
    this.healthText.position.set(45, row1CenterY);
    this.healthContainer.addChild(this.healthText);

    // Health bar fill
    this.healthBarFill = new Graphics();
    this.healthContainer.addChild(this.healthBarFill);

    // Shield vector icon (energy crest emblem) - perfectly centered at (iconCenterX, row2CenterY)
    this.shieldIcon = new Graphics();
    // Outer shield rim
    this.shieldIcon.lineStyle(1.8, 0x00ff66, 1);
    this.shieldIcon.beginFill(0x00c853, 0.25);
    this.shieldIcon.moveTo(iconCenterX - 8, row2CenterY - 11);
    this.shieldIcon.lineTo(iconCenterX + 8, row2CenterY - 11);
    this.shieldIcon.lineTo(iconCenterX + 11, row2CenterY - 8);
    this.shieldIcon.lineTo(iconCenterX + 11, row2CenterY);
    this.shieldIcon.quadraticCurveTo(iconCenterX + 9, row2CenterY + 8, iconCenterX, row2CenterY + 12);
    this.shieldIcon.quadraticCurveTo(iconCenterX - 9, row2CenterY + 8, iconCenterX - 11, row2CenterY);
    this.shieldIcon.lineTo(iconCenterX - 11, row2CenterY - 8);
    this.shieldIcon.closePath();
    this.shieldIcon.endFill();

    // Inner high-tech deflector chevrons
    this.shieldIcon.lineStyle(1.5, 0x69f0ae, 0.9);
    this.shieldIcon.moveTo(iconCenterX - 5, row2CenterY - 6);
    this.shieldIcon.lineTo(iconCenterX, row2CenterY - 1);
    this.shieldIcon.lineTo(iconCenterX + 5, row2CenterY - 6);

    this.shieldIcon.moveTo(iconCenterX - 4, row2CenterY + 1);
    this.shieldIcon.lineTo(iconCenterX, row2CenterY + 5);
    this.shieldIcon.lineTo(iconCenterX + 4, row2CenterY + 1);
    this.healthContainer.addChild(this.shieldIcon);

    // Shield text - vertically centered at row2CenterY
    this.shieldText = new Text("0 SHD", {
      fontFamily: "Arial, sans-serif",
      fontSize: 14,
      fontWeight: "bold",
      fill: 0x00ff66,
      letterSpacing: 0.5,
    });
    this.shieldText.resolution = dpr;
    this.shieldText.anchor.set(0, 0.5);
    this.shieldText.position.set(45, row2CenterY);
    this.healthContainer.addChild(this.shieldText);

    // Shield bar fill
    this.shieldBarFill = new Graphics();
    this.healthContainer.addChild(this.shieldBarFill);

    this.addChild(this.healthContainer);
    this.drawHealthBar(100, 100);
    this.drawShieldBar(0, 100);

    this.weaponContainer = new Container();
    this.weaponContainer.position.set(screenW - 264, screenH - 96);
    this.weaponContainer.eventMode = "static";
    this.weaponContainer.cursor = "pointer";
    this.weaponContainer.on("pointerdown", () => {
      this.emit("switchWeapon");
    });

    const weaponBg = new Graphics();
    weaponBg.beginFill(0x0a1018, 0.75);
    weaponBg.lineStyle(2, 0xffaa00, 0.4);
    weaponBg.drawRoundedRect(0, 0, 240, 72, 10);
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

    this.weaponNameText = new Text("UNARMED", {
      fontFamily: "Arial, sans-serif",
      fontSize: 14,
      fontWeight: "bold",
      fill: 0xffaa00,
      letterSpacing: 0.5,
    });
    this.weaponNameText.resolution = dpr;
    this.weaponNameText.position.set(55, 8);
    this.weaponContainer.addChild(this.weaponNameText);

    this.ammoText = new Text("--", {
      fontFamily: "Arial, sans-serif",
      fontSize: 20,
      fontWeight: "bold",
      fill: 0xffffff,
      letterSpacing: 0.5,
    });
    this.ammoText.resolution = dpr;
    this.ammoText.position.set(55, 28);
    this.weaponContainer.addChild(this.ammoText);

    // Small weapon switch hotkey / tap indicator
    this.switchHint = new Text("[1-3 / TAP]", {
      fontFamily: "Arial, sans-serif",
      fontSize: 10,
      fontWeight: "bold",
      fill: 0x88bbdd,
      letterSpacing: 0.5,
    });
    this.switchHint.resolution = dpr;
    this.switchHint.position.set(170, 36);
    this.weaponContainer.addChild(this.switchHint);

    this.addChild(this.weaponContainer);

    // 4. Toast notification (Top-Center)
    this.toastContainer = new Container();
    this.toastContainer.position.set(screenW / 2, 45);
    this.toastContainer.visible = false;

    this.toastBg = new Graphics();
    this.toastContainer.addChild(this.toastBg);

    this.toastText = new Text("", {
      fontFamily: "Arial, sans-serif",
      fontSize: 18,
      fontWeight: "bold",
      fill: 0xffffff,
      align: "center",
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowDistance: 1,
      dropShadowBlur: 2,
    });
    this.toastText.resolution = dpr;
    this.toastContainer.addChild(this.toastText);

    this.addChild(this.toastContainer);

    // 5. Keycards HUD (Top-Left)
    this.keycardContainer = new Container();
    this.keycardContainer.position.set(24, 24);
    this.keycardContainer.visible = false;

    this.keycardBg = new Graphics();
    this.keycardContainer.addChild(this.keycardBg);

    const keycardLabel = new Text("KEYS", {
      fontFamily: "Arial, sans-serif",
      fontSize: 11,
      fontWeight: "bold",
      fill: 0x00e5ff,
      letterSpacing: 1,
    });
    keycardLabel.resolution = dpr;
    keycardLabel.position.set(8, 6);
    this.keycardContainer.addChild(keycardLabel);

    this.addChild(this.keycardContainer);
  }

  public addKeycard(color: string, customTexture?: Texture): void {
    const key = color.toLowerCase();
    if (this.keycardIcons.has(key)) return;

    let texture: Texture;
    if (customTexture) {
      texture = customTexture;
    } else {
      try {
        texture = Texture.from(`keycard/key_card_${key}_1.png`);
      } catch {
        texture = Texture.WHITE;
      }
    }

    const sprite = new Sprite(texture);
    sprite.scale.set(0.6);
    sprite.roundPixels = true;

    this.keycardIcons.set(key, sprite);
    this.keycardContainer.addChild(sprite);
    this.keycardContainer.visible = true;

    this.layoutKeycards();
  }

  public hasKeycard(color: string): boolean {
    return this.keycardIcons.has(color.toLowerCase());
  }

  public clearKeycards(): void {
    for (const [_, sprite] of this.keycardIcons) {
      sprite.destroy();
    }
    this.keycardIcons.clear();
    this.keycardContainer.visible = false;
  }

  private layoutKeycards(): void {
    let currentX = 48;
    for (const [_, sprite] of this.keycardIcons) {
      sprite.position.set(currentX, 4);
      currentX += 20;
    }

    const totalWidth = Math.max(70, currentX + 6);
    this.keycardBg.clear();
    this.keycardBg.beginFill(0x0a1018, 0.75);
    this.keycardBg.lineStyle(1.5, 0x00e5ff, 0.5);
    this.keycardBg.drawRoundedRect(0, 0, totalWidth, 26, 6);
    this.keycardBg.endFill();
  }

  public setHealth(currentHealth: number, maxHealth: number = 100): void {
    const clampedHp = Math.max(0, Math.min(maxHealth, currentHealth));
    this.healthText.text = `${Math.ceil(clampedHp)} HP`;
    this.drawHealthBar(clampedHp, maxHealth);
  }

  private drawHealthBar(hp: number, maxHp: number): void {
    this.healthBarFill.clear();
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    const width = 114 * ratio;

    // Dark background track
    this.healthBarFill.beginFill(0x152530, 0.85);
    this.healthBarFill.drawRoundedRect(114, 15, 114, 8, 3);
    this.healthBarFill.endFill();

    // Red health bar (darker crimson at critical <= 25%)
    if (width > 0) {
      const barColor = ratio <= 0.25 ? 0xcc1111 : 0xff3344;

      this.healthBarFill.beginFill(barColor, 0.95);
      this.healthBarFill.drawRoundedRect(114, 15, width, 8, 3);
      this.healthBarFill.endFill();
    }
  }

  public setShield(currentShield: number, maxShield: number = 100): void {
    const clampedShield = Math.max(0, Math.min(maxShield, currentShield));
    this.shieldText.text = `${Math.ceil(clampedShield)} SHD`;
    this.drawShieldBar(clampedShield, maxShield);
  }

  private drawShieldBar(shield: number, maxShield: number): void {
    this.shieldBarFill.clear();
    const ratio = Math.max(0, Math.min(1, shield / maxShield));
    const width = 114 * ratio;

    // Dark background track
    this.shieldBarFill.beginFill(0x152530, 0.85);
    this.shieldBarFill.drawRoundedRect(114, 49, 114, 8, 3);
    this.shieldBarFill.endFill();

    if (width > 0) {
      this.shieldBarFill.beginFill(0x00e676, 0.95);
      this.shieldBarFill.drawRoundedRect(114, 49, width, 8, 3);
      this.shieldBarFill.endFill();
    }
  }

  public setWeapon(weaponName: string | null, ammo: number): void {
    if (weaponName) {
      this.weaponNameText.text = weaponName.toUpperCase();
      if (weaponName.toLowerCase().includes("detonator")) {
        this.ammoText.text = `${ammo} REMAINING`;
      } else {
        this.ammoText.text = `${ammo} AMMO`;
      }
    } else {
      this.weaponNameText.text = "UNARMED";
      this.ammoText.text = "--";
    }
  }

  public adaptForMobile(): void {
    if (this.switchHint) {
      this.switchHint.text = "[TAP / WPN]";
    }
  }

  public showToast(message: string, borderColor: number = 0x00e5ff): void {
    this.toastText.text = message;
    const paddingX = 20;
    const paddingY = 8;
    const textW = this.toastText.width;
    const textH = this.toastText.height;

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
