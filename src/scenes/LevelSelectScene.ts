import { Assets, Container, Graphics, Sprite, Text, Texture, RoundedRectangle } from "pixi.js";
import { sound } from "@pixi/sound";
import { BaseScene } from "./BaseScene";
import { Scene } from "../enums/Scene";
import { GameEvent } from "../enums/GameEvent";
import { gameConfig } from "../configs/GameConfig";
import { Button } from "../misc/Button";
import { RaycastSaveManager } from "./raycast/RaycastSaveManager";
import { allConfigs } from "../configs/PlayerConfigs";

export interface ILevelCardData {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  screenshotKey: string;
  isEndless?: boolean;
}

export const LEVEL_CARDS: ILevelCardData[] = [
  {
    id: "level1",
    badge: "LEVEL 1",
    title: "Detention Block",
    subtitle: "Cell Block AA-23",
    screenshotKey: "level1_screenshot",
  },
  {
    id: "level2",
    badge: "LEVEL 2",
    title: "Imperial Facility",
    subtitle: "Core Complex",
    screenshotKey: "level2_screenshot",
  },
  {
    id: "level3",
    badge: "LEVEL 3",
    title: "Imperial Hangar",
    subtitle: "Docking Bay 94",
    screenshotKey: "level3_screenshot",
  },
  {
    id: "endless",
    badge: "ENDLESS",
    title: "Endless Space",
    subtitle: "Starfighter Assault",
    screenshotKey: "endless_screenshot",
    isEndless: true,
  },
];

export class LevelSelectScene extends BaseScene {
  private isNavigating: boolean = false;

  constructor(stage: Container, scale: number) {
    super(stage, scale);

    // Ensure audio theme is playing
    try {
      const s = sound.find("menu_theme");
      if (!s || !s.isPlaying) {
        sound.play("menu_theme", { loop: true });
      }
    } catch {}

    // 1. Background
    const background = Sprite.from("menu_background");
    background.position.set(-3, -3);
    background.scale.set(1.2);
    this.addChild(background);

    // Dim overlay for high contrast
    const dimOverlay = new Graphics();
    dimOverlay.beginFill(0x000000, 0.55);
    dimOverlay.drawRect(0, 0, gameConfig.width, gameConfig.height);
    dimOverlay.endFill();
    this.addChild(dimOverlay);

    // 2. Header
    const titleText = new Text("MISSION SELECT", {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: 50,
      fontWeight: "900",
      fill: ["#FFE81F", "#D4AC0D"],
      letterSpacing: 6,
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowBlur: 8,
      dropShadowDistance: 4,
      align: "center",
    });
    titleText.resolution = 2;
    titleText.anchor.set(0.5, 0.5);
    titleText.position.set(gameConfig.width / 2, 70);
    this.addChild(titleText);

    const subtitleText = new Text("Select an infiltrated sector or launch endless starfighter combat", {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: 18,
      fontWeight: "600",
      fill: 0x9fb3c8,
      letterSpacing: 2,
      align: "center",
    });
    subtitleText.resolution = 2;
    subtitleText.anchor.set(0.5, 0.5);
    subtitleText.position.set(gameConfig.width / 2, 118);
    this.addChild(subtitleText);

    // 3. Level Cards Grid (4 squares horizontally centered)
    const cardSize = 250;
    const gap = 28;
    const totalW = LEVEL_CARDS.length * cardSize + (LEVEL_CARDS.length - 1) * gap;
    const startX = (gameConfig.width - totalW) / 2;
    const startY = 175;

    const save = RaycastSaveManager.loadProgress();
    const completedList = save?.completedLevels || [];
    const completedSet = new Set<string>(
      completedList.map((l) => l.replace(/^.*[\\\/]/, "").replace(/\.json$/i, "").toLowerCase())
    );
    const currentSaved = (save?.currentLevel || "level1")
      .replace(/^.*[\\\/]/, "")
      .replace(/\.json$/i, "")
      .toLowerCase();

    const isLevelUnlocked = (index: number, levelId: string): boolean => {
      // Level 1 is always unlocked
      if (index === 0) return true;

      // Endless mode is always unlocked
      if (levelId === "endless" || LEVEL_CARDS[index]?.isEndless) return true;

      // Check if the previous sector was completed
      const prevId = LEVEL_CARDS[index - 1].id;
      if (completedSet.has(prevId)) return true;

      // Check if current saved level is at or beyond this level
      const currentIdx = LEVEL_CARDS.findIndex((c) => c.id === currentSaved);
      if (currentIdx >= index) return true;

      return false;
    };

    LEVEL_CARDS.forEach((level, index) => {
      const cardX = startX + index * (cardSize + gap);
      const unlocked = isLevelUnlocked(index, level.id);
      const card = this.createLevelCard(level, cardSize, cardX, startY, {
        isCompleted: completedSet.has(level.id),
        isCurrent: currentSaved === level.id,
        isUnlocked: unlocked,
      });
      this.addChild(card);
    });

    // 4. Back Button at bottom
    const backBtn = new Button(new RoundedRectangle(0, 0, 220, 56, 14), "Back");
    backBtn.x = gameConfig.width / 2 - 110;
    backBtn.y = 615;
    backBtn.eventMode = "static";
    backBtn.cursor = "pointer";
    backBtn.on("pointertap", (e) => {
      e?.stopPropagation?.();
      this.playClickSound();
      this.emit(Scene.Change, Scene.MainMenu);
    });
    this.addChild(backBtn);
  }

  private createLevelCard(
    level: ILevelCardData,
    size: number,
    x: number,
    y: number,
    status: { isCompleted: boolean; isCurrent: boolean; isUnlocked: boolean }
  ): Container {
    const card = new Container();
    card.position.set(x, y);
    card.eventMode = "static";
    card.cursor = status.isUnlocked ? "pointer" : "not-allowed";
    if (!status.isUnlocked) {
      card.alpha = 0.68;
    }

    // Card frame/border graphic
    const frame = new Graphics();
    const drawFrame = (isHover: boolean) => {
      frame.clear();
      // Background
      const bgColor = isHover
        ? 0x141b26
        : status.isUnlocked
        ? 0x0c1119
        : 0x070b10;
      frame.beginFill(bgColor, 0.94);

      // Border: highlighted on hover or current
      let borderColor = 0x2b384a;
      let borderWidth = 2;

      if (!status.isUnlocked) {
        borderColor = 0x1f2733;
        borderWidth = 1.5;
      } else if (isHover) {
        borderColor = level.isEndless ? 0xffe81f : 0x00e5ff;
        borderWidth = 3;
      } else if (status.isCurrent) {
        borderColor = 0x00e5ff;
        borderWidth = 2.5;
      }

      frame.lineStyle(borderWidth, borderColor);
      frame.drawRoundedRect(0, 0, size, size, 14);
      frame.endFill();
    };
    drawFrame(false);
    card.addChild(frame);

    // Screenshot area (Square placeholder: ready for user image)
    const pad = 10;
    const imgW = size - pad * 2;
    const imgH = 132;

    // Check if texture exists in Assets cache (pure cache check, avoids triggering network 404s)
    let screenshotTexture: Texture | null = null;
    try {
      if (level.screenshotKey && Assets.cache.has(level.screenshotKey)) {
        screenshotTexture = Assets.get(level.screenshotKey);
      }
    } catch {}

    const imgContainer = new Container();
    imgContainer.position.set(pad, pad);

    if (screenshotTexture && screenshotTexture.valid) {
      const sprite = new Sprite(screenshotTexture);
      sprite.width = imgW;
      sprite.height = imgH;
      imgContainer.addChild(sprite);
    } else {
      // Clean blank screenshot placeholder
      const placeholder = new Graphics();
      placeholder.beginFill(0x131922, 1);
      placeholder.drawRoundedRect(0, 0, imgW, imgH, 8);
      placeholder.endFill();

      // Subtle blueprint grid lines
      placeholder.lineStyle(1, 0x1d2633, 0.7);
      for (let gx = 20; gx < imgW; gx += 20) {
        placeholder.moveTo(gx, 0);
        placeholder.lineTo(gx, imgH);
      }
      for (let gy = 20; gy < imgH; gy += 20) {
        placeholder.moveTo(0, gy);
        placeholder.lineTo(imgW, gy);
      }

      // Camera / Frame icon outline
      placeholder.lineStyle(2, 0x3d4e66, 0.8);
      const iconSize = 34;
      const ix = (imgW - iconSize) / 2;
      const iy = (imgH - iconSize) / 2 - 6;
      placeholder.drawRoundedRect(ix, iy, iconSize, iconSize * 0.72, 4);
      placeholder.drawCircle(ix + iconSize / 2, iy + (iconSize * 0.72) / 2, 6);

      const placeholderText = new Text("SCREENSHOT", {
        fontFamily: "Segoe UI, Arial, sans-serif",
        fontSize: 12,
        fontWeight: "bold",
        fill: 0x4d607a,
        letterSpacing: 2,
      });
      placeholderText.resolution = 2;
      placeholderText.anchor.set(0.5, 0.5);
      placeholderText.position.set(imgW / 2, iy + iconSize * 0.72 + 13);

      imgContainer.addChild(placeholder);
      imgContainer.addChild(placeholderText);
    }

    // If locked, overlay a lock icon over the screenshot area
    if (!status.isUnlocked) {
      const lockOverlay = new Graphics();
      lockOverlay.beginFill(0x000000, 0.65);
      lockOverlay.drawRoundedRect(0, 0, imgW, imgH, 8);
      lockOverlay.endFill();

      // Lock shackle and body
      const lcx = imgW / 2;
      const lcy = imgH / 2;
      lockOverlay.lineStyle(2.5, 0xff5555, 0.9);
      lockOverlay.drawRoundedRect(lcx - 10, lcy - 14, 20, 14, 7);
      lockOverlay.beginFill(0x2a1111, 0.95);
      lockOverlay.lineStyle(2, 0xff5555, 0.95);
      lockOverlay.drawRoundedRect(lcx - 14, lcy - 4, 28, 22, 5);
      lockOverlay.endFill();
      // Lock keyhole
      lockOverlay.beginFill(0xff5555);
      lockOverlay.drawCircle(lcx, lcy + 5, 2.5);
      lockOverlay.endFill();

      imgContainer.addChild(lockOverlay);
    }

    card.addChild(imgContainer);

    // Top Badge (LEVEL 1 / 2 / 3 / ENDLESS)
    const badgeW = 92;
    const badgeH = 26;
    const badgeBg = new Graphics();
    badgeBg.beginFill(0x000000, 0.75);
    badgeBg.lineStyle(1.5, status.isUnlocked ? (level.isEndless ? 0xffe81f : 0x00e5ff) : 0x556677, 0.7);
    badgeBg.drawRoundedRect(pad + 6, pad + 6, badgeW, badgeH, 6);
    badgeBg.endFill();
    card.addChild(badgeBg);

    const badgeText = new Text(level.badge, {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: 13,
      fontWeight: "900",
      fill: status.isUnlocked ? (level.isEndless ? 0xffe81f : 0x00e5ff) : 0x778899,
      letterSpacing: 1.5,
    });
    badgeText.resolution = 2;
    badgeText.anchor.set(0.5, 0.5);
    badgeText.position.set(pad + 6 + badgeW / 2, pad + 6 + badgeH / 2);
    card.addChild(badgeText);

    // Status indicator (Completed, Current, or Locked)
    const statusW = 76;
    const statusH = 26;
    if (!status.isUnlocked) {
      const lockBadge = new Graphics();
      lockBadge.beginFill(0x3a1111, 0.5);
      lockBadge.lineStyle(1.5, 0xff4444, 0.8);
      lockBadge.drawRoundedRect(size - pad - statusW - 6, pad + 6, statusW, statusH, 6);
      lockBadge.endFill();
      card.addChild(lockBadge);

      const lockText = new Text("LOCKED", {
        fontFamily: "Segoe UI, Arial, sans-serif",
        fontSize: 11,
        fontWeight: "900",
        fill: 0xff6666,
        letterSpacing: 1,
      });
      lockText.resolution = 2;
      lockText.anchor.set(0.5, 0.5);
      lockText.position.set(size - pad - statusW - 6 + statusW / 2, pad + 6 + statusH / 2);
      card.addChild(lockText);
    } else if (status.isCompleted) {
      const compBadge = new Graphics();
      compBadge.beginFill(0x00ff88, 0.22);
      compBadge.lineStyle(1.5, 0x00ff88, 0.85);
      compBadge.drawRoundedRect(size - pad - statusW - 6, pad + 6, statusW, statusH, 6);
      compBadge.endFill();
      card.addChild(compBadge);

      const compText = new Text("CLEARED", {
        fontFamily: "Segoe UI, Arial, sans-serif",
        fontSize: 12,
        fontWeight: "bold",
        fill: 0x00ff88,
        letterSpacing: 1,
      });
      compText.resolution = 2;
      compText.anchor.set(0.5, 0.5);
      compText.position.set(size - pad - statusW - 6 + statusW / 2, pad + 6 + statusH / 2);
      card.addChild(compText);
    } else if (status.isCurrent) {
      const curBadge = new Graphics();
      curBadge.beginFill(0x00e5ff, 0.22);
      curBadge.lineStyle(1.5, 0x00e5ff, 0.85);
      curBadge.drawRoundedRect(size - pad - statusW - 6, pad + 6, statusW, statusH, 6);
      curBadge.endFill();
      card.addChild(curBadge);

      const curText = new Text("SAVED", {
        fontFamily: "Segoe UI, Arial, sans-serif",
        fontSize: 12,
        fontWeight: "bold",
        fill: 0x00e5ff,
        letterSpacing: 1,
      });
      curText.resolution = 2;
      curText.anchor.set(0.5, 0.5);
      curText.position.set(size - pad - statusW - 6 + statusW / 2, pad + 6 + statusH / 2);
      card.addChild(curText);
    }

    // Bottom Level Title & Subtitle (Larger & Bolder)
    const title = new Text(level.title.toUpperCase(), {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: 20,
      fontWeight: "900",
      fill: status.isUnlocked ? 0xffffff : 0x778899,
      letterSpacing: 1.2,
      dropShadow: status.isUnlocked,
      dropShadowColor: 0x000000,
      dropShadowBlur: 4,
      dropShadowDistance: 2,
    });
    title.resolution = 2;
    title.anchor.set(0.5, 0);
    title.position.set(size / 2, 148);
    card.addChild(title);

    const sub = new Text(level.subtitle, {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: 14,
      fontWeight: "700",
      fill: status.isUnlocked ? 0x9fb3c8 : 0x556677,
      letterSpacing: 0.5,
    });
    sub.resolution = 2;
    sub.anchor.set(0.5, 0);
    sub.position.set(size / 2, 178);
    card.addChild(sub);

    // Launch hint
    let hintString = level.isEndless ? "LAUNCH FLIGHT ▸" : "START MISSION ▸";
    let hintColor = level.isEndless ? 0xffe81f : 0x00e5ff;
    if (!status.isUnlocked) {
      hintString = "🔒 SECTOR LOCKED";
      hintColor = 0xff5555;
    }

    const hint = new Text(hintString, {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: 13,
      fontWeight: "900",
      fill: hintColor,
      letterSpacing: 1.2,
    });
    hint.resolution = 2;
    hint.anchor.set(0.5, 0);
    hint.position.set(size / 2, 210);
    hint.alpha = status.isUnlocked ? 0.88 : 0.9;
    card.addChild(hint);

    // Interactive Hover & Click
    card.on("pointerenter", () => {
      if (!status.isUnlocked) return;
      card.y = y - 6;
      drawFrame(true);
      hint.alpha = 1.0;
    });

    card.on("pointerleave", () => {
      if (!status.isUnlocked) return;
      card.y = y;
      drawFrame(false);
      hint.alpha = 0.88;
    });

    card.on("pointertap", (e) => {
      e?.stopPropagation?.();
      if (!status.isUnlocked) {
        // Horizontal shake visual feedback for locked level
        const origX = card.x;
        let count = 0;
        const shakeTimer = setInterval(() => {
          count++;
          card.x = origX + (count % 2 === 0 ? 5 : -5);
          if (count >= 6) {
            clearInterval(shakeTimer);
            card.x = origX;
          }
        }, 25);
        return;
      }
      this.selectLevel(level);
    });

    return card;
  }

  private selectLevel(level: ILevelCardData): void {
    if (this.isNavigating) return;
    this.isNavigating = true;
    this.playClickSound();

    if (sound.exists("menu_theme")) {
      sound.stop("menu_theme");
    }

    if (level.isEndless) {
      this.emit(GameEvent.SELECT_SHIP, allConfigs[0]);
      this.emit(Scene.Change, Scene.Endless);
      return;
    }

    // Set level in save manager so player spawns cleanly
    RaycastSaveManager.setCurrentLevel(level.id);

    if (level.id === "level1") {
      // Start level 1 via intro crawl & cutscene
      this.emit(Scene.Change, Scene.Raycast, "level1", false);
    } else {
      // Jump directly into the selected mission
      this.emit(Scene.Change, Scene.Raycast, level.id, true);
    }
  }

  private playClickSound(): void {
    try {
      if (sound.exists("button_click")) {
        sound.play("button_click", { volume: 0.45 });
      } else {
        sound.add("button_click", {
          url: "./assets/sounds/button_click.mp3",
          preload: true,
          loaded: () => {
            sound.play("button_click", { volume: 0.45 });
          },
        });
      }
    } catch {}
  }

  public dispose(): void {
    this.destroy({ children: true });
  }
}
