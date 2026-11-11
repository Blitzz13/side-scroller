import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { gameConfig } from "../../configs/GameConfig";

export interface IRaycastDebugCallbacks {
  getSkyboxZoom: () => number;
  setSkyboxZoom: (zoom: number) => void;
  getSkyboxYaw: () => number;
  setSkyboxYaw: (yaw: number) => void;
  getSkyboxWallName: (yaw: number) => string;
  isSkyboxOnly: () => boolean;
  toggleSkyboxOnly: () => void;
  isCubemapActive: () => boolean;
  getCurrentLevel: () => string;
  // Cheats / player actions
  isGodMode: () => boolean;
  toggleGodMode: () => boolean;
  healPlayer: () => void;
  refillAmmo: () => void;
  giveAllWeapons: () => void;
  giveAllKeycards: () => void;
  cycleDoorMode: () => void;
  killNearbyEnemies: () => number;
  warpToLevel: (levelName: string) => void;
  showToast: (text: string, color?: number, duration?: number) => void;
}

export class RaycastDebugMenu extends Container {
  private callbacks: IRaycastDebugCallbacks;
  private backdrop: Graphics;
  private modalContainer: Container;
  private modalBg: Graphics;
  private contentContainer: Container;
  private tabContainer: Container;
  private triggerButton: Container;
  private isOpen: boolean = false;
  private activeTab: "skybox" | "cheats" = "skybox";
  private dpr: number = 2;

  constructor(callbacks: IRaycastDebugCallbacks) {
    super();
    this.callbacks = callbacks;
    this.visible = false;
    this.zIndex = 250;
    this.eventMode = "static";

    this.dpr = Math.max(
      2,
      Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 3)
    );

    const screenW = gameConfig.width;
    const screenH = gameConfig.height;

    // 1. Semi-transparent backdrop (blocks touches/clicks to game world)
    this.backdrop = new Graphics();
    this.backdrop.beginFill(0x000000, 0.72);
    this.backdrop.drawRect(0, 0, screenW, screenH);
    this.backdrop.endFill();
    this.backdrop.eventMode = "static";
    this.backdrop.cursor = "pointer";
    this.backdrop.on("pointerdown", (e) => {
      e?.stopPropagation?.();
      this.hide();
    });
    this.addChild(this.backdrop);

    // 2. Centered Modal Container
    this.modalContainer = new Container();
    this.modalContainer.position.set(screenW / 2, screenH / 2);
    this.modalContainer.eventMode = "static";
    this.modalContainer.on("pointerdown", (e) => e?.stopPropagation?.());
    this.addChild(this.modalContainer);

    this.modalBg = new Graphics();
    this.modalContainer.addChild(this.modalBg);

    this.tabContainer = new Container();
    this.modalContainer.addChild(this.tabContainer);

    this.contentContainer = new Container();
    this.modalContainer.addChild(this.contentContainer);

    // 3. Floating Trigger Button (top-right next to Objectives button)
    this.triggerButton = this.createTriggerButton();
  }

  public get isVisibleOpen(): boolean {
    return this.isOpen;
  }

  public getTriggerButton(): Container {
    return this.triggerButton;
  }

  private createTriggerButton(): Container {
    const screenW = gameConfig.width;
    const btn = new Container();
    // Positioned at screenW - 310, 60 (adjacent to Objectives button at screenW - 230)
    btn.position.set(screenW - 310, 60);
    btn.eventMode = "static";
    btn.cursor = "pointer";
    btn.zIndex = 105;

    const bg = new Graphics();
    const drawBg = (pressed: boolean) => {
      bg.clear();
      const bgColor = pressed ? 0x004466 : 0x091929;
      const borderColor = pressed ? 0x00ffff : 0x00e5ff;
      bg.beginFill(bgColor, pressed ? 0.95 : 0.85);
      bg.lineStyle(2.5, borderColor, pressed ? 1.0 : 0.85);
      bg.drawCircle(0, 0, 36);
      bg.lineStyle(1, borderColor, pressed ? 0.6 : 0.35);
      bg.drawCircle(0, 0, 31);
      bg.endFill();
    };
    drawBg(false);
    btn.addChild(bg);

    const label = new Text("DEV", {
      fontFamily: "Arial, sans-serif",
      fontSize: 18,
      fontWeight: "bold",
      fill: 0x00ffff,
      dropShadow: true,
      dropShadowColor: 0x002233,
      dropShadowDistance: 1,
    });
    label.resolution = this.dpr;
    label.anchor.set(0.5);
    label.position.set(0, 0);
    btn.addChild(label);

    btn.on("pointerdown", (e: any) => {
      e?.stopPropagation?.();
      drawBg(true);
      btn.scale.set(0.92);
    });
    btn.on("pointerup", (e: any) => {
      e?.stopPropagation?.();
      drawBg(false);
      btn.scale.set(1.0);
      this.toggle();
    });
    btn.on("pointerupoutside", () => {
      drawBg(false);
      btn.scale.set(1.0);
    });
    btn.on("pointercancel", () => {
      drawBg(false);
      btn.scale.set(1.0);
    });

    return btn;
  }

  public show(): void {
    this.isOpen = true;
    this.visible = true;
    this.alpha = 0;
    this.modalContainer.scale.set(0.96);

    this.renderTabs();
    this.renderContent();

    let elapsed = 0;
    const duration = 120;
    const startTime = performance.now();
    const animate = (now: number) => {
      if (!this.isOpen) return;
      elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      this.alpha = progress;
      const curScale = 0.96 + 0.04 * progress;
      this.modalContainer.scale.set(curScale);
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
    this.emit("opened");
  }

  public hide(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.visible = false;
    this.emit("closed");
  }

  public toggle(): void {
    if (this.isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  private renderTabs(): void {
    this.tabContainer.removeChildren();

    const panelW = 920;
    const panelH = 580;
    const halfW = panelW / 2;
    const halfH = panelH / 2;

    // Draw Imperial Terminal Frame
    this.modalBg.clear();
    // Drop shadow
    this.modalBg.beginFill(0x000000, 0.55);
    this.modalBg.drawRoundedRect(-halfW + 6, -halfH + 8, panelW, panelH, 16);
    this.modalBg.endFill();

    // Dark cyber panel fill
    this.modalBg.beginFill(0x091422, 0.96);
    this.modalBg.lineStyle(2.5, 0x00e5ff, 0.9);
    this.modalBg.drawRoundedRect(-halfW, -halfH, panelW, panelH, 14);
    this.modalBg.endFill();

    // Inner subtle border
    this.modalBg.lineStyle(1, 0x00aacc, 0.35);
    this.modalBg.drawRoundedRect(-halfW + 8, -halfH + 8, panelW - 16, panelH - 16, 10);

    // Header bar line
    this.modalBg.lineStyle(1.5, 0x00e5ff, 0.5);
    this.modalBg.moveTo(-halfW + 16, -halfH + 54);
    this.modalBg.lineTo(halfW - 16, -halfH + 54);

    // Title text
    const titleText = new Text("IMPERIAL TERMINAL // IN-GAME DEBUG & TUNING", {
      fontFamily: "Arial, sans-serif",
      fontSize: 20,
      fontWeight: "bold",
      fill: 0x00ffff,
      letterSpacing: 2,
    });
    titleText.resolution = this.dpr;
    titleText.position.set(-halfW + 24, -halfH + 18);
    this.tabContainer.addChild(titleText);

    // Close button [X]
    const closeBtn = this.createButton("✕ CLOSE", 100, 36, () => this.hide(), {
      bgColor: 0x441111,
      borderColor: 0xff4444,
      textColor: 0xff6666,
      fontSize: 14,
    });
    closeBtn.position.set(halfW - 124, -halfH + 12);
    this.tabContainer.addChild(closeBtn);

    // Tab buttons
    const tab1 = this.createButton("🌌 SKYBOX & VISTA", 220, 38, () => {
      this.activeTab = "skybox";
      this.renderTabs();
      this.renderContent();
    }, {
      isActive: this.activeTab === "skybox",
      fontSize: 15,
    });
    tab1.position.set(-halfW + 24, -halfH + 64);
    this.tabContainer.addChild(tab1);

    const tab2 = this.createButton("⚡ CHEATS & LEVEL WARP", 250, 38, () => {
      this.activeTab = "cheats";
      this.renderTabs();
      this.renderContent();
    }, {
      isActive: this.activeTab === "cheats",
      fontSize: 15,
    });
    tab2.position.set(-halfW + 254, -halfH + 64);
    this.tabContainer.addChild(tab2);
  }

  public renderContent(): void {
    this.contentContainer.removeChildren();

    const panelW = 920;
    const halfW = panelW / 2;
    const halfH = 580 / 2;
    const contentStartY = -halfH + 115;

    if (this.activeTab === "skybox") {
      this.renderSkyboxTab(halfW, contentStartY);
    } else {
      this.renderCheatsTab(halfW, contentStartY);
    }
  }

  private renderSkyboxTab(halfW: number, startY: number): void {
    const curZoom = this.callbacks.getSkyboxZoom();
    const curYaw = this.callbacks.getSkyboxYaw();
    const curWall = this.callbacks.getSkyboxWallName(curYaw);
    const isSkyOnly = this.callbacks.isSkyboxOnly();
    const isCube = this.callbacks.isCubemapActive();
    const levelName = this.callbacks.getCurrentLevel();

    let y = startY;

    // Status Banner
    const statusBg = new Graphics();
    statusBg.beginFill(0x0c2236, 0.85);
    statusBg.lineStyle(1, 0x00e5ff, 0.4);
    statusBg.drawRoundedRect(-halfW + 24, y, 872, 32, 6);
    statusBg.endFill();
    this.contentContainer.addChild(statusBg);

    const statusText = new Text(
      `CURRENT LEVEL: ${levelName.toUpperCase()}   |   TYPE: ${isCube ? "CUBEMAP 3D" : "2D PANORAMA"}   |   HOTKEYS: [ / ] = ZOOM, Y / , / . = YAW, F8 = SKY ONLY`,
      {
        fontFamily: "Arial, sans-serif",
        fontSize: 12,
        fill: 0x88ccff,
        letterSpacing: 0.5,
      }
    );
    statusText.resolution = this.dpr;
    statusText.position.set(-halfW + 36, y + 8);
    this.contentContainer.addChild(statusText);

    y += 42;

    // SECTION 1: FOV & ZOOM (Image Scale)
    const zoomHeader = new Text("1. SKYBOX SCALE / FOV ZOOM   (Higher = Farther & Realistic  |  Lower = Closer & Giant)", {
      fontFamily: "Arial, sans-serif",
      fontSize: 14,
      fontWeight: "bold",
      fill: 0xffbb33,
      letterSpacing: 1,
    });
    zoomHeader.resolution = this.dpr;
    zoomHeader.position.set(-halfW + 24, y);
    this.contentContainer.addChild(zoomHeader);

    y += 24;

    // Live Zoom badge
    const zoomBadge = this.createValueBadge(`Zoom: ${curZoom.toFixed(2)}x`, 160, 36);
    zoomBadge.position.set(-halfW + 24, y);
    this.contentContainer.addChild(zoomBadge);

    // Quick Zoom preset buttons
    const presets = [
      { label: "1.0x (Giant)", val: 1.0 },
      { label: "1.1x (Default)", val: 1.1 },
      { label: "1.6x", val: 1.6 },
      { label: "2.2x", val: 2.2 },
      { label: "3.5x (Colossal)", val: 3.5 },
    ];
    let px = -halfW + 196;
    for (const p of presets) {
      const isSel = Math.abs(curZoom - p.val) < 0.05;
      const btn = this.createButton(p.label, 130, 36, () => {
        this.callbacks.setSkyboxZoom(p.val);
        this.renderContent();
      }, {
        isActive: isSel,
        fontSize: 13,
      });
      btn.position.set(px, y);
      this.contentContainer.addChild(btn);
      px += 140;
    }

    y += 44;

    // Fine step buttons
    const stepLabel = new Text("Fine Adjust:", {
      fontFamily: "Arial, sans-serif",
      fontSize: 13,
      fill: 0x99bbdd,
    });
    stepLabel.resolution = this.dpr;
    stepLabel.position.set(-halfW + 36, y + 8);
    this.contentContainer.addChild(stepLabel);

    const stepBtns = [
      { label: "- 0.20", delta: -0.20 },
      { label: "- 0.05", delta: -0.05 },
      { label: "+ 0.05", delta: 0.05 },
      { label: "+ 0.20", delta: 0.20 },
    ];
    let sx = -halfW + 150;
    for (const s of stepBtns) {
      const btn = this.createButton(s.label, 95, 34, () => {
        this.callbacks.setSkyboxZoom(curZoom + s.delta);
        this.renderContent();
      }, {
        fontSize: 13,
        bgColor: 0x112233,
      });
      btn.position.set(sx, y);
      this.contentContainer.addChild(btn);
      sx += 105;
    }

    y += 48;

    // SECTION 2: WALL DIRECTION / YAW
    const yawHeader = new Text("2. WALL DIRECTION / YAW ORIENTATION   (Select which wall faces forward)", {
      fontFamily: "Arial, sans-serif",
      fontSize: 14,
      fontWeight: "bold",
      fill: 0xffbb33,
      letterSpacing: 1,
    });
    yawHeader.resolution = this.dpr;
    yawHeader.position.set(-halfW + 24, y);
    this.contentContainer.addChild(yawHeader);

    y += 24;

    // Live Yaw badge
    const yawBadge = this.createValueBadge(`Yaw: ${Math.round(curYaw)}°  (${curWall})`, 330, 36);
    yawBadge.position.set(-halfW + 24, y);
    this.contentContainer.addChild(yawBadge);

    // Fine rotation step buttons (smooth, responsive increments)
    const yawStepBtns = [
      { label: "- 15°", delta: -15 },
      { label: "- 5°", delta: -5 },
      { label: "- 1°", delta: -1 },
      { label: "+ 1°", delta: 1 },
      { label: "+ 5°", delta: 5 },
      { label: "+ 15°", delta: 15 },
    ];
    let yx = -halfW + 366;
    for (const s of yawStepBtns) {
      const btn = this.createButton(s.label, 76, 36, () => {
        this.callbacks.setSkyboxYaw(curYaw + s.delta);
        this.renderContent();
      }, {
        fontSize: 12,
        bgColor: 0x112233,
      });
      btn.position.set(yx, y);
      this.contentContainer.addChild(btn);
      yx += 84;
    }

    y += 46;

    // 4 Wall Snap Buttons (Large, highly clickable)
    const walls = [
      { label: "PZ: Jungle Vista (0°)", yaw: 0 },
      { label: "NX: Control Room (90°)", yaw: 90 },
      { label: "NZ: Blast Doors (180°)", yaw: 180 },
      { label: "PX: Steel Wall (270°)", yaw: 270 },
    ];
    let wx = -halfW + 24;
    for (const w of walls) {
      const isSel = Math.abs((((curYaw % 360) + 360) % 360) - w.yaw) < 5;
      const btn = this.createButton(w.label, 208, 42, () => {
        this.callbacks.setSkyboxYaw(w.yaw);
        this.renderContent();
      }, {
        isActive: isSel,
        fontSize: 13,
      });
      btn.position.set(wx, y);
      this.contentContainer.addChild(btn);
      wx += 218;
    }

    y += 56;

    // SECTION 3: UTILITIES & ACTIONS
    const skyOnlyBtn = this.createButton(
      isSkyOnly ? "👁️ SKYBOX ONLY: ON" : "👁️ TOGGLE SKYBOX ONLY (F8)",
      280,
      40,
      () => {
        this.callbacks.toggleSkyboxOnly();
        this.renderContent();
      },
      {
        isActive: isSkyOnly,
        bgColor: isSkyOnly ? 0x005577 : 0x0f2233,
        borderColor: isSkyOnly ? 0x00ffff : 0x00aacc,
        fontSize: 13,
      }
    );
    skyOnlyBtn.position.set(-halfW + 24, y);
    this.contentContainer.addChild(skyOnlyBtn);

    const copyBtn = this.createButton("📋 COPY JSON CONFIG", 240, 40, () => {
      const configStr = `{\n  "skyboxZoom": ${curZoom.toFixed(2)},\n  "skyboxYaw": ${Math.round(curYaw)}\n}`;
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(configStr).catch(() => {});
      }
      this.callbacks.showToast(`[📋] Config: zoom ${curZoom.toFixed(2)}, yaw ${Math.round(curYaw)}°`, 0x00ffcc, 3000);
      console.log(`[SkyboxConfig] Copy:\n${configStr}`);
    }, {
      bgColor: 0x0a3322,
      borderColor: 0x00ff88,
      textColor: 0x00ff88,
      fontSize: 13,
    });
    copyBtn.position.set(-halfW + 316, y);
    this.contentContainer.addChild(copyBtn);
  }

  private renderCheatsTab(halfW: number, startY: number): void {
    let y = startY;

    // SECTION 1: WARP TO LEVEL
    const warpHeader = new Text("1. WARP TO LEVEL (Instantly load sector)", {
      fontFamily: "Arial, sans-serif",
      fontSize: 14,
      fontWeight: "bold",
      fill: 0xffbb33,
      letterSpacing: 1,
    });
    warpHeader.resolution = this.dpr;
    warpHeader.position.set(-halfW + 24, y);
    this.contentContainer.addChild(warpHeader);

    y += 26;

    const levels = [
      { label: "Sector 1: Cell Block", file: "level1" },
      { label: "Sector 2: Imperial Facility", file: "level2" },
      { label: "Sector 3: Imperial Hangar", file: "level3" },
    ];
    let lx = -halfW + 24;
    for (const lvl of levels) {
      const btn = this.createButton(lvl.label, 280, 42, () => {
        this.hide();
        this.callbacks.warpToLevel(lvl.file);
      }, {
        bgColor: 0x112638,
        borderColor: 0x00ccee,
        fontSize: 14,
      });
      btn.position.set(lx, y);
      this.contentContainer.addChild(btn);
      lx += 296;
    }

    y += 62;

    // SECTION 2: COMBAT CHEATS & BUFFS
    const cheatHeader = new Text("2. PLAYER CHEATS & GAMEPLAY BUFFS", {
      fontFamily: "Arial, sans-serif",
      fontSize: 14,
      fontWeight: "bold",
      fill: 0xffbb33,
      letterSpacing: 1,
    });
    cheatHeader.resolution = this.dpr;
    cheatHeader.position.set(-halfW + 24, y);
    this.contentContainer.addChild(cheatHeader);

    y += 28;

    const isGod = this.callbacks.isGodMode();
    const godBtn = this.createButton(
      isGod ? "🛡️ GOD MODE: ACTIVE (IMMORTAL)" : "🛡️ GOD MODE: DISABLED",
      424,
      46,
      () => {
        this.callbacks.toggleGodMode();
        this.renderContent();
      },
      {
        isActive: isGod,
        bgColor: isGod ? 0x005522 : 0x19222c,
        borderColor: isGod ? 0x00ff88 : 0x557799,
        textColor: isGod ? 0x00ff88 : 0xccddee,
        fontSize: 14,
      }
    );
    godBtn.position.set(-halfW + 24, y);
    this.contentContainer.addChild(godBtn);

    const healBtn = this.createButton("❤️ FULL HEALTH & SHIELD (100%)", 424, 46, () => {
      this.callbacks.healPlayer();
    }, {
      bgColor: 0x221122,
      borderColor: 0xff44aa,
      textColor: 0xff88cc,
      fontSize: 14,
    });
    healBtn.position.set(-halfW + 472, y);
    this.contentContainer.addChild(healBtn);

    y += 56;

    const ammoBtn = this.createButton("🔋 REFILL ALL AMMO (MAX)", 424, 46, () => {
      this.callbacks.refillAmmo();
    }, {
      bgColor: 0x112233,
      borderColor: 0x00bbff,
      textColor: 0x66ccff,
      fontSize: 14,
    });
    ammoBtn.position.set(-halfW + 24, y);
    this.contentContainer.addChild(ammoBtn);

    const wpnBtn = this.createButton("🔫 UNLOCK ALL WEAPONS", 424, 46, () => {
      this.callbacks.giveAllWeapons();
    }, {
      bgColor: 0x2b1e0d,
      borderColor: 0xffaa00,
      textColor: 0xffbb44,
      fontSize: 14,
    });
    wpnBtn.position.set(-halfW + 472, y);
    this.contentContainer.addChild(wpnBtn);

    y += 56;

    const keyBtn = this.createButton("🔑 GRANT ALL KEYCARDS (R/B/G)", 424, 46, () => {
      this.callbacks.giveAllKeycards();
    }, {
      bgColor: 0x0f2b2b,
      borderColor: 0x00ffcc,
      textColor: 0x33ffee,
      fontSize: 14,
    });
    keyBtn.position.set(-halfW + 24, y);
    this.contentContainer.addChild(keyBtn);

    const doorBtn = this.createButton("🚪 CYCLE DOOR SLIDE MODE", 424, 46, () => {
      this.callbacks.cycleDoorMode();
    }, {
      bgColor: 0x222211,
      borderColor: 0xddcc33,
      textColor: 0xffee66,
      fontSize: 14,
    });
    doorBtn.position.set(-halfW + 472, y);
    this.contentContainer.addChild(doorBtn);

    y += 56;

    const killBtn = this.createButton("💥 ELIMINATE ALL NEARBY ENEMIES", 872, 46, () => {
      this.callbacks.killNearbyEnemies();
    }, {
      bgColor: 0x3d0f0f,
      borderColor: 0xff3333,
      textColor: 0xff6666,
      fontSize: 14,
    });
    killBtn.position.set(-halfW + 24, y);
    this.contentContainer.addChild(killBtn);
  }

  private createValueBadge(text: string, width: number, height: number): Container {
    const container = new Container();
    const bg = new Graphics();
    bg.beginFill(0x0c1e2e, 0.9);
    bg.lineStyle(1.5, 0x00e5ff, 0.8);
    bg.drawRoundedRect(0, 0, width, height, 6);
    bg.endFill();
    container.addChild(bg);

    const txt = new Text(text, {
      fontFamily: "Arial, sans-serif",
      fontSize: 14,
      fontWeight: "bold",
      fill: 0x00ffff,
    });
    txt.resolution = this.dpr;
    txt.anchor.set(0.5);
    txt.position.set(width / 2, height / 2);
    container.addChild(txt);

    return container;
  }

  private createButton(
    text: string,
    width: number,
    height: number,
    onClick: () => void,
    options?: {
      bgColor?: number;
      borderColor?: number;
      textColor?: number;
      fontSize?: number;
      isActive?: boolean;
    }
  ): Container {
    const container = new Container();
    container.eventMode = "static";
    container.cursor = "pointer";

    const bg = new Graphics();
    const isAct = Boolean(options?.isActive);
    const defaultBg = isAct ? 0x004466 : (options?.bgColor ?? 0x0b1c2b);
    const defaultBorder = isAct ? 0x00ffff : (options?.borderColor ?? 0x00b4d8);
    const defaultText = isAct ? 0xffffff : (options?.textColor ?? 0x00e5ff);

    const draw = (pressed: boolean) => {
      bg.clear();
      const fill = pressed ? 0x006699 : defaultBg;
      const border = pressed ? 0xffffff : defaultBorder;
      bg.beginFill(fill, pressed ? 0.98 : 0.88);
      bg.lineStyle(2, border, pressed ? 1.0 : isAct ? 1.0 : 0.7);
      bg.drawRoundedRect(0, 0, width, height, 8);
      bg.endFill();
    };
    draw(false);
    container.addChild(bg);

    const label = new Text(text, {
      fontFamily: "Arial, sans-serif",
      fontSize: options?.fontSize ?? 14,
      fontWeight: "bold",
      fill: defaultText,
      align: "center",
      dropShadow: true,
      dropShadowColor: 0x001122,
      dropShadowDistance: 1,
    });
    label.resolution = this.dpr;
    label.anchor.set(0.5);
    label.position.set(width / 2, height / 2);
    container.addChild(label);

    container.on("pointerdown", (e: any) => {
      e?.stopPropagation?.();
      draw(true);
      container.scale.set(0.96);
    });
    container.on("pointerup", (e: any) => {
      e?.stopPropagation?.();
      draw(false);
      container.scale.set(1.0);
      onClick();
    });
    container.on("pointerupoutside", () => {
      draw(false);
      container.scale.set(1.0);
    });
    container.on("pointercancel", () => {
      draw(false);
      container.scale.set(1.0);
    });

    return container;
  }
}
