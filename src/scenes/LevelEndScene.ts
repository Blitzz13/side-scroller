import { Assets, Container, Graphics, ITextStyle, RoundedRectangle, SCALE_MODES, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { sound } from "@pixi/sound";
import { BaseScene } from "./BaseScene";
import { Scene } from "../enums/Scene";
import { Button } from "../misc/Button";
import { defaultButtonSize, gameConfig } from "../configs/GameConfig";
import { RaycastSaveManager } from "./raycast/RaycastSaveManager";
import { RaycastWeaponType } from "../enums/RaycastWeaponType";

export class LevelEndScene extends BaseScene {
  private nextLevel: string;
  private keydownHandler?: (e: KeyboardEvent) => void;
  private isNavigating: boolean = false;

  constructor(stage: Container, scale: number, nextLevel?: string) {
    super(stage, scale);

    const save = RaycastSaveManager.loadProgress();
    this.nextLevel = nextLevel || save?.nextLevel || save?.currentLevel || "test_level";

    // Ensure the saved currentLevel is already set to the new level so restarting begins at the new level
    RaycastSaveManager.setCurrentLevel(this.nextLevel);

    // Unlock mouse cursor from pointer lock and ensure default pointer cursor
    const unlockMouse = () => {
      try {
        if (document.exitPointerLock) {
          document.exitPointerLock();
        }
      } catch {}
      if (typeof document !== "undefined" && document.body) {
        document.body.style.cursor = "default";
      }
    };
    unlockMouse();
    window.addEventListener("mousemove", unlockMouse, { once: true });

    // 1. Background Image
    let bgTexture: Texture | undefined;
    try {
      if (Assets.cache.has("imperial_base_background")) {
        bgTexture = Assets.get("imperial_base_background");
      }
    } catch {}
    if (!bgTexture) {
      try {
        bgTexture = Texture.from("imperial_base_background");
      } catch {}
    }
    if (!bgTexture || !bgTexture.baseTexture) {
      try {
        bgTexture = Texture.from("assets/common/imperial_base_background.jpg");
      } catch {}
    }
    if (!bgTexture) {
      bgTexture = Texture.WHITE;
    }

    const bg = new Sprite(bgTexture);
    bg.anchor.set(0.5, 0.5);
    bg.position.set(gameConfig.width / 2, gameConfig.height / 2);

    // Scale to cover the entire canvas maintaining aspect ratio
    const applyCoverScale = () => {
      const texW = bgTexture?.width || 1280;
      const texH = bgTexture?.height || 720;
      const scaleX = gameConfig.width / texW;
      const scaleY = gameConfig.height / texH;
      const coverScale = Math.max(scaleX, scaleY);
      bg.scale.set(coverScale);
    };

    applyCoverScale();
    if (bgTexture && bgTexture.baseTexture && !bgTexture.baseTexture.valid) {
      bgTexture.baseTexture.once("loaded", () => applyCoverScale());
    }
    this.addChild(bg);

    // 2. Dark vignette / overlay
    const overlay = new Graphics();
    overlay.beginFill(0x020710, 0.65);
    overlay.drawRect(0, 0, gameConfig.width, gameConfig.height);
    overlay.endFill();
    this.addChild(overlay);

    // 3. Central Mission Complete Terminal Panel
    const panelW = 760;
    const panelH = 540;
    const panelX = (gameConfig.width - panelW) / 2;
    const panelY = (gameConfig.height - panelH) / 2;

    const panel = new Graphics();
    // Glassmorphism background
    panel.beginFill(0x060f1c, 0.90);
    panel.lineStyle({ width: 2, color: 0x00e5ff, alpha: 0.85 });
    panel.drawRoundedRect(panelX, panelY, panelW, panelH, 16);
    panel.endFill();

    // Top glowing cyan accent bar
    panel.beginFill(0x00e5ff, 0.9);
    panel.drawRoundedRect(panelX + 24, panelY + 6, panelW - 48, 3, 2);
    panel.endFill();
    this.addChild(panel);

    // 4. Header Titles
    this.createSharpText(
      "[ MISSION ACCOMPLISHED ]",
      {
        fontSize: 16,
        fontWeight: "bold",
        fill: 0x00e5ff,
        letterSpacing: 4,
      },
      gameConfig.width / 2,
      panelY + 24,
      0.5,
      0
    );

    this.createSharpText(
      "SECTOR SECURED",
      {
        fontSize: 36,
        fontWeight: "900",
        fill: ["#ffffff", "#b0f4ff"],
        dropShadow: true,
        dropShadowColor: "#00e5ff",
        dropShadowBlur: 6,
        dropShadowDistance: 0,
        letterSpacing: 3,
      },
      gameConfig.width / 2,
      panelY + 48,
      0.5,
      0
    );

    // 5. Divider
    const divider = new Graphics();
    divider.lineStyle(1, 0x1a4566, 0.7);
    divider.moveTo(panelX + 40, panelY + 98);
    divider.lineTo(panelX + panelW - 40, panelY + 98);
    this.addChild(divider);

    // 6. Level Info & Stats Display
    const completedName = (save?.previousLevel || "LEVEL 1").toUpperCase();
    const targetName = this.nextLevel.toUpperCase();

    this.createSharpText(
      `SECTOR CLEARED: ${completedName}`,
      {
        fontSize: 18,
        fill: 0x88ccff,
        fontWeight: "bold",
        letterSpacing: 1,
      },
      panelX + 48,
      panelY + 112
    );

    this.createSharpText(
      `NEXT OBJECTIVE: ${targetName}`,
      {
        fontSize: 18,
        fill: 0xffdd44,
        fontWeight: "bold",
        letterSpacing: 1,
      },
      panelX + panelW - 48,
      panelY + 112,
      1,
      0
    );

    // 7. Tactical Status Box (Player inventory & health report)
    const statsBox = new Graphics();
    const boxW = panelW - 80;
    const boxH = 246;
    const boxX = panelX + 40;
    const boxY = panelY + 148;
    statsBox.beginFill(0x040a14, 0.85);
    statsBox.lineStyle(1.5, 0x1e5077, 0.7);
    statsBox.drawRoundedRect(boxX, boxY, boxW, boxH, 10);
    statsBox.endFill();
    this.addChild(statsBox);

    this.createSharpText(
      "OPERATIVE STATUS REPORT",
      {
        fontSize: 14,
        fill: 0x5a9bc8,
        fontWeight: "bold",
        letterSpacing: 2,
      },
      boxX + 24,
      boxY + 14
    );

    // Stats content
    const p = save?.player;
    const hpVal = p ? `${p.health} / ${p.maxHealth || 100} HP` : "100 / 100 HP";
    const shieldVal = p ? `${p.shield} / ${p.maxShield || 100} SHIELD` : "0 / 100 SHIELD";

    // Row 1: Health & Shield
    this.createSharpText(
      `[+] HEALTH: ${hpVal}`,
      {
        fontSize: 16,
        fontWeight: "bold",
        fill: 0x00ff88,
      },
      boxX + 24,
      boxY + 40
    );

    this.createSharpText(
      `[#] SHIELD: ${shieldVal}`,
      {
        fontSize: 16,
        fontWeight: "bold",
        fill: 0x00ccff,
      },
      boxX + boxW / 2 + 10,
      boxY + 40
    );

    // Row 2: Hostiles Neutralized (Kill Count)
    const kills = save?.enemiesKilled ?? 0;
    const total = save?.totalEnemies ?? 0;
    let killsStr = `${kills}`;
    let killsColor = 0xffffff;
    if (total > 0) {
      const pct = Math.round((kills / total) * 100);
      killsStr = `${kills} / ${total} (${pct}% ELIMINATED)`;
      killsColor = kills >= total ? 0x00ff88 : (pct >= 50 ? 0xffcc00 : 0xff7777);
    }

    this.createSharpText(
      `[⚔] HOSTILES NEUTRALIZED: ${killsStr}`,
      {
        fontSize: 15,
        fontWeight: "bold",
        fill: killsColor,
      },
      boxX + 24,
      boxY + 68
    );

    // Row 3: Weapons list
    this.createSharpText(
      "WEAPONS & AMMUNITION PRESERVED:",
      {
        fontSize: 15,
        fontWeight: "bold",
        fill: 0xaad4f5,
      },
      boxX + 24,
      boxY + 96
    );

    let weaponLines: string[] = [];
    if (p && p.weapons && p.weapons.length > 0) {
      weaponLines = p.weapons.map((w) => {
        let name = "DH-17 Blaster";
        if (w.type === RaycastWeaponType.E11) name = "E-11 Blaster Rifle";
        else if (w.type === RaycastWeaponType.THERMAL_DETONATOR) name = "Thermal Detonator";
        return ` • ${name} (${w.ammo} Ammo)`;
      });
    } else {
      weaponLines = [" • DH-17 Blaster Pistol (30 Ammo)"];
    }

    this.createSharpText(
      weaponLines.join("\n"),
      {
        fontSize: 14,
        fill: 0xddf0ff,
        lineHeight: 22,
      },
      boxX + 32,
      boxY + 120
    );

    // Row 4: Keycards status (showing what clearance was secured in completed sector)
    const keycards = save?.securedKeycards || p?.keycards || [];
    const keycardStr = keycards.length > 0
      ? keycards.map(k => k.toUpperCase() + " KEYCARD").join(", ")
      : "NONE SECURED";

    this.createSharpText(
      `SECURITY CLEARANCE: ${keycardStr} (RESET FOR NEXT SECTOR)`,
      {
        fontSize: 14,
        fontWeight: "bold",
        fill: keycards.length > 0 ? 0x00ffcc : 0x778899,
      },
      boxX + 24,
      boxY + boxH - 28
    );

    // 8. Navigation Action Buttons
    const btnWidth = 230;
    const btnHeight = 55;
    const btnSize = new RoundedRectangle(0, 0, btnWidth, btnHeight, 14);

    const mainMenuButton = new Button(btnSize, "Main Menu");
    const nextLevelButton = new Button(btnSize, "Next Level");

    const btnGap = 40;
    const totalBtnW = btnWidth * 2 + btnGap;
    const startBtnX = (gameConfig.width - totalBtnW) / 2;
    const btnY = panelY + panelH - 95;

    mainMenuButton.position.set(startBtnX, btnY);
    nextLevelButton.position.set(startBtnX + btnWidth + btnGap, btnY);

    mainMenuButton.eventMode = "static";
    mainMenuButton.cursor = "pointer";
    nextLevelButton.eventMode = "static";
    nextLevelButton.cursor = "pointer";

    mainMenuButton.on("pointertap", (e) => {
      e?.stopPropagation?.();
      this.goToMainMenu();
    });

    nextLevelButton.on("pointertap", (e) => {
      e?.stopPropagation?.();
      this.playNextLevel();
    });

    this.addChild(mainMenuButton);
    this.addChild(nextLevelButton);

    // Keyboard controls
    this.keydownHandler = (e: KeyboardEvent) => {
      if (this.isNavigating) return;
      if (e.key === "Enter" || e.key === " " || e.key.toLowerCase() === "e") {
        this.playNextLevel();
      } else if (e.key === "Escape") {
        this.goToMainMenu();
      }
    };
    window.addEventListener("keydown", this.keydownHandler);

    // Play victory music/sound
    try {
      if (sound.exists("end_level")) {
        sound.play("end_level", { volume: 0.5 });
      }
    } catch {}
  }

  private playButtonClick(): void {
    try {
      if (sound.exists("button_click")) {
        sound.play("button_click", { volume: 0.5 });
      } else {
        sound.add("button_click", {
          url: "./assets/sounds/button_click.mp3",
          preload: true,
          loaded: () => {
            sound.play("button_click", { volume: 0.5 });
          },
        });
      }
    } catch (e) {
      console.warn("Could not play button_click sound:", e);
    }
  }

  private goToMainMenu(): void {
    if (this.isNavigating) return;
    this.isNavigating = true;
    this.playButtonClick();
    this.emit(Scene.Change, Scene.MainMenu);
  }

  private playNextLevel(): void {
    if (this.isNavigating) return;
    this.isNavigating = true;
    this.playButtonClick();
    RaycastSaveManager.setCurrentLevel(this.nextLevel);
    this.emit(Scene.Change, Scene.Raycast, this.nextLevel);
  }

  private createSharpText(
    content: string,
    style: Partial<ITextStyle> | TextStyle,
    x: number,
    y: number,
    anchorX: number = 0,
    anchorY: number = 0
  ): Text {
    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    // 3x to 4x raster resolution so text remains pin-sharp on 1080p, 1440p, 4K and scaled windows
    const textRes = Math.max(3, Math.min(Math.round(dpr * 2), 4));

    const t = new Text(content, {
      fontFamily: "Segoe UI, Arial, sans-serif",
      ...style,
    });
    t.resolution = textRes;
    t.roundPixels = true;
    if (t.texture && t.texture.baseTexture) {
      t.texture.baseTexture.scaleMode = SCALE_MODES.LINEAR;
    }
    t.anchor.set(anchorX, anchorY);
    t.position.set(Math.round(x), Math.round(y));
    this.addChild(t);
    return t;
  }

  public dispose(): void {
    try {
      if (sound.exists("end_level")) {
        sound.stop("end_level");
      }
    } catch {}

    if (this.keydownHandler) {
      window.removeEventListener("keydown", this.keydownHandler);
      this.keydownHandler = undefined;
    }
    this.destroy({ children: true });
  }
}
