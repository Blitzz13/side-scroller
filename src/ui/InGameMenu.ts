import { Container, Graphics, RoundedRectangle, Text } from "pixi.js";
import { sound } from "@pixi/sound";
import { IDisposable } from "../characters/interfaces/IDisposable";
import { GameEvent } from "../enums/GameEvent";
import { gameConfig } from "../configs/GameConfig";
import { SettingsManager, SUBTITLE_SCALE_STEP } from "../managers/SettingsManager";

export interface IInGameMenuOptions {
  /** If true, shown as standalone settings menu (Title: SETTINGS, Back button). If false, pause menu (Title: PAUSED, Resume, Quit). */
  standaloneOptions?: boolean;
}

export class InGameMenu extends Container implements IDisposable {
  private backdrop: Graphics;
  private panel: Container;
  private settingsManager: SettingsManager;
  private unsubscribeSettings?: () => void;

  private voicesValueText!: Text;
  private musicValueText!: Text;
  private subtitleSizeValueText!: Text;
  private autoAimStatusText!: Text;
  private autoAimBtnGraphic!: Graphics;

  constructor(options: IInGameMenuOptions = {}) {
    super();
    this.settingsManager = SettingsManager.getInstance();

    const isStandalone = !!options.standaloneOptions;

    // 1. Semi-transparent backdrop to dim the game and block clicks behind it
    this.backdrop = new Graphics();
    this.backdrop.beginFill(0x000000, 0.65);
    this.backdrop.drawRect(0, 0, gameConfig.width, gameConfig.height);
    this.backdrop.endFill();
    this.backdrop.eventMode = "static";
    this.backdrop.cursor = "default";
    this.addChild(this.backdrop);

    // 2. Settings dialog panel container
    this.panel = new Container();
    this.addChild(this.panel);

    const panelW = 540;
    const panelH = isStandalone ? 480 : 560;
    const panelX = Math.round((gameConfig.width - panelW) / 2);
    const panelY = Math.round((gameConfig.height - panelH) / 2);
    this.panel.position.set(panelX, panelY);

    // Panel background with sci-fi Star Wars aesthetic
    const panelBg = new Graphics();
    panelBg.beginFill(0x06121e, 0.95);
    panelBg.lineStyle(2.5, 0x00e5ff, 0.9);
    panelBg.drawRoundedRect(0, 0, panelW, panelH, 16);
    // Inner subtle glow border
    panelBg.lineStyle(1, 0x00a8cc, 0.35);
    panelBg.drawRoundedRect(6, 6, panelW - 12, panelH - 12, 12);
    panelBg.endFill();
    this.panel.addChild(panelBg);

    // Header Title
    const titleString = isStandalone ? "SETTINGS & OPTIONS" : "GAME PAUSED";
    const titleText = new Text(titleString, {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: 26,
      fontWeight: "900",
      letterSpacing: 4,
      fill: ["#FFE81F", "#D4AC0D"],
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowDistance: 2,
      align: "center",
    });
    titleText.anchor.set(0.5, 0);
    titleText.position.set(panelW / 2, 28);
    this.panel.addChild(titleText);

    // Subtle header divider
    const divider = new Graphics();
    divider.lineStyle(1.5, 0x00e5ff, 0.4);
    divider.moveTo(40, 72);
    divider.lineTo(panelW - 40, 72);
    this.panel.addChild(divider);

    // Content rows starting coordinate
    let currentY = 96;
    const rowSpacing = 62;

    // --- ROW 1: GAME VOICES VOLUME ---
    this.createStepperRow(
      currentY,
      panelW,
      "VOICES VOLUME",
      () => Math.round(this.settingsManager.getVoicesVolume() * 100) + "%",
      (lbl) => { this.voicesValueText = lbl; },
      () => {
        const cur = this.settingsManager.getVoicesVolume();
        this.settingsManager.setVoicesVolume(cur - 0.1);
        this.playClick();
      },
      () => {
        const cur = this.settingsManager.getVoicesVolume();
        this.settingsManager.setVoicesVolume(cur + 0.1);
        this.playClick();
      }
    );
    currentY += rowSpacing;

    // --- ROW 2: MUSIC VOLUME ---
    this.createStepperRow(
      currentY,
      panelW,
      "MUSIC VOLUME",
      () => Math.round(this.settingsManager.getMusicVolume() * 100) + "%",
      (lbl) => { this.musicValueText = lbl; },
      () => {
        const cur = this.settingsManager.getMusicVolume();
        this.settingsManager.setMusicVolume(cur - 0.1);
        this.playClick();
      },
      () => {
        const cur = this.settingsManager.getMusicVolume();
        this.settingsManager.setMusicVolume(cur + 0.1);
        this.playClick();
      }
    );
    currentY += rowSpacing;

    // --- ROW 3: SUBTITLE SIZE ---
    this.createStepperRow(
      currentY,
      panelW,
      "SUBTITLE SIZE",
      () => Math.round(this.settingsManager.getSubtitleScale() * 100) + "%",
      (lbl) => { this.subtitleSizeValueText = lbl; },
      () => {
        const cur = this.settingsManager.getSubtitleScale();
        this.settingsManager.setSubtitleScale(cur - SUBTITLE_SCALE_STEP);
        this.playClick();
      },
      () => {
        const cur = this.settingsManager.getSubtitleScale();
        this.settingsManager.setSubtitleScale(cur + SUBTITLE_SCALE_STEP);
        this.playClick();
      }
    );
    currentY += rowSpacing;

    // --- ROW 4: AUTO AIM TOGGLE ---
    this.createAutoAimRow(currentY, panelW);
    currentY += rowSpacing + 16;

    // --- ACTION BUTTONS (Aligned cleanly to the bottom of the panel) ---
    const btnH = 50;
    const bottomPadding = 30;
    const actionBtnY = panelH - btnH - bottomPadding;

    // Divider above bottom action buttons
    const divider2 = new Graphics();
    divider2.lineStyle(1.5, 0x00e5ff, 0.4);
    divider2.moveTo(40, actionBtnY - 20);
    divider2.lineTo(panelW - 40, actionBtnY - 20);
    this.panel.addChild(divider2);

    if (isStandalone) {
      // Standalone Back button
      const backBtn = this.createActionButton(panelW / 2 - 110, actionBtnY, 220, btnH, "BACK", 0x00e5ff, () => {
        this.playClick();
        this.emit("close");
      });
      this.panel.addChild(backBtn);
    } else {
      // In-Game Pause: Resume & Quit Buttons aligned to bottom
      const btnW = 210;
      const spacing = 20;
      const totalW = btnW * 2 + spacing;
      const startX = (panelW - totalW) / 2;

      const resumeBtn = this.createActionButton(startX, actionBtnY, btnW, btnH, "RESUME", 0x2ecc71, () => {
        this.playClick();
        this.emit(GameEvent.RESUME_GAME);
      });
      this.panel.addChild(resumeBtn);

      const quitBtn = this.createActionButton(startX + btnW + spacing, actionBtnY, btnW, btnH, "QUIT", 0xe74c3c, () => {
        this.playClick();
        this.emit(GameEvent.QUIT_GAME);
      });
      this.panel.addChild(quitBtn);
    }

    // Subscribe to external settings updates
    this.unsubscribeSettings = this.settingsManager.subscribe(() => {
      this.refreshDisplay();
    });

    this.visible = false;
  }

  private playClick(): void {
    if (sound.exists("button_click")) {
      sound.play("button_click", { volume: 0.45 });
    }
  }

  private createStepperRow(
    y: number,
    panelW: number,
    labelText: string,
    getValueStr: () => string,
    bindValueLabel: (lbl: Text) => void,
    onMinus: () => void,
    onPlus: () => void
  ): void {
    const label = new Text(labelText, {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: 16,
      fontWeight: "bold",
      fill: 0xffffff,
      letterSpacing: 2,
    });
    label.anchor.set(0, 0.5);
    label.position.set(45, y);
    this.panel.addChild(label);

    const controlX = panelW - 45 - 200;

    // Minus Button [-]
    const minusBtn = this.createPillButton(controlX, y - 20, 44, 40, "–", () => onMinus());
    this.panel.addChild(minusBtn);

    // Value display box [ 80% ]
    const valBox = new Graphics();
    valBox.beginFill(0x030a12, 0.8);
    valBox.lineStyle(1.5, 0x00a8cc, 0.5);
    valBox.drawRoundedRect(controlX + 50, y - 20, 100, 40, 8);
    valBox.endFill();
    this.panel.addChild(valBox);

    const valText = new Text(getValueStr(), {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: 18,
      fontWeight: "bold",
      fill: 0x00e5ff,
      align: "center",
    });
    valText.anchor.set(0.5, 0.5);
    valText.position.set(controlX + 100, y);
    this.panel.addChild(valText);
    bindValueLabel(valText);

    // Plus Button [+]
    const plusBtn = this.createPillButton(controlX + 156, y - 20, 44, 40, "+", () => onPlus());
    this.panel.addChild(plusBtn);
  }

  private createAutoAimRow(y: number, panelW: number): void {
    const label = new Text("AUTO AIM", {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: 16,
      fontWeight: "bold",
      fill: 0xffffff,
      letterSpacing: 2,
    });
    label.anchor.set(0, 0.5);
    label.position.set(45, y);
    this.panel.addChild(label);

    const controlX = panelW - 45 - 200;
    const btnContainer = new Container();
    btnContainer.position.set(controlX, y - 20);
    btnContainer.eventMode = "static";
    btnContainer.cursor = "pointer";

    this.autoAimBtnGraphic = new Graphics();
    btnContainer.addChild(this.autoAimBtnGraphic);

    this.autoAimStatusText = new Text("", {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: 16,
      fontWeight: "bold",
      letterSpacing: 2,
      align: "center",
    });
    this.autoAimStatusText.anchor.set(0.5, 0.5);
    this.autoAimStatusText.position.set(100, 20);
    btnContainer.addChild(this.autoAimStatusText);

    const updateToggle = () => {
      const isEnabled = this.settingsManager.getAutoAim();
      this.autoAimBtnGraphic.clear();
      const borderColor = isEnabled ? 0x2ecc71 : 0x7f8c8d;
      const bgColor = isEnabled ? 0x0d3822 : 0x1a252f;

      this.autoAimBtnGraphic.beginFill(bgColor, 0.85);
      this.autoAimBtnGraphic.lineStyle(2, borderColor, 0.9);
      this.autoAimBtnGraphic.drawRoundedRect(0, 0, 200, 40, 8);
      this.autoAimBtnGraphic.endFill();

      this.autoAimStatusText.text = isEnabled ? "ENABLED" : "DISABLED";
      this.autoAimStatusText.style.fill = isEnabled ? 0x2ecc71 : 0x95a5a6;
    };

    updateToggle();

    btnContainer.on("pointerdown", () => {
      this.settingsManager.toggleAutoAim();
      this.playClick();
      updateToggle();
    });

    btnContainer.on("mouseenter", () => {
      btnContainer.alpha = 0.85;
    });
    btnContainer.on("mouseleave", () => {
      btnContainer.alpha = 1.0;
    });

    this.panel.addChild(btnContainer);
  }

  private createPillButton(
    x: number,
    y: number,
    w: number,
    h: number,
    txt: string,
    onClick: () => void
  ): Container {
    const btn = new Container();
    btn.position.set(x, y);
    btn.eventMode = "static";
    btn.cursor = "pointer";

    const g = new Graphics();
    const draw = (hover: boolean) => {
      g.clear();
      g.beginFill(hover ? 0x004466 : 0x091929, 0.9);
      g.lineStyle(1.8, hover ? 0x00ffff : 0x00e5ff, 0.9);
      g.drawRoundedRect(0, 0, w, h, 8);
      g.endFill();
    };
    draw(false);
    btn.addChild(g);

    const t = new Text(txt, {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: 20,
      fontWeight: "bold",
      fill: 0x00e5ff,
    });
    t.anchor.set(0.5, 0.5);
    t.position.set(w / 2, h / 2 - 1);
    btn.addChild(t);

    btn.on("pointerdown", (e) => {
      e?.stopPropagation?.();
      onClick();
    });
    btn.on("mouseenter", () => draw(true));
    btn.on("mouseleave", () => draw(false));

    return btn;
  }

  private createActionButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    themeColor: number,
    onClick: () => void
  ): Container {
    const btn = new Container();
    btn.position.set(x, y);
    btn.eventMode = "static";
    btn.cursor = "pointer";

    const g = new Graphics();
    const draw = (hover: boolean) => {
      g.clear();
      g.beginFill(hover ? 0x092636 : 0x061824, 0.95);
      g.lineStyle(2, hover ? 0xffffff : themeColor, 0.95);
      g.drawRoundedRect(0, 0, w, h, 10);
      g.endFill();
    };
    draw(false);
    btn.addChild(g);

    const t = new Text(label, {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: 3,
      fill: themeColor,
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowDistance: 1,
    });
    t.anchor.set(0.5, 0.5);
    t.position.set(w / 2, h / 2);
    btn.addChild(t);

    btn.on("pointerdown", (e) => {
      e?.stopPropagation?.();
      onClick();
    });
    btn.on("mouseenter", () => {
      draw(true);
      t.style.fill = 0xffffff;
    });
    btn.on("mouseleave", () => {
      draw(false);
      t.style.fill = themeColor;
    });

    return btn;
  }

  public refreshDisplay(): void {
    if (this.voicesValueText) {
      this.voicesValueText.text = Math.round(this.settingsManager.getVoicesVolume() * 100) + "%";
    }
    if (this.musicValueText) {
      this.musicValueText.text = Math.round(this.settingsManager.getMusicVolume() * 100) + "%";
    }
    if (this.subtitleSizeValueText) {
      this.subtitleSizeValueText.text = Math.round(this.settingsManager.getSubtitleScale() * 100) + "%";
    }
    if (this.autoAimStatusText && this.autoAimBtnGraphic) {
      const isEnabled = this.settingsManager.getAutoAim();
      this.autoAimBtnGraphic.clear();
      const borderColor = isEnabled ? 0x2ecc71 : 0x7f8c8d;
      const bgColor = isEnabled ? 0x0d3822 : 0x1a252f;

      this.autoAimBtnGraphic.beginFill(bgColor, 0.85);
      this.autoAimBtnGraphic.lineStyle(2, borderColor, 0.9);
      this.autoAimBtnGraphic.drawRoundedRect(0, 0, 200, 40, 8);
      this.autoAimBtnGraphic.endFill();

      this.autoAimStatusText.text = isEnabled ? "ENABLED" : "DISABLED";
      this.autoAimStatusText.style.fill = isEnabled ? 0x2ecc71 : 0x95a5a6;
    }
  }

  public dispose(): void {
    if (this.unsubscribeSettings) {
      this.unsubscribeSettings();
      this.unsubscribeSettings = undefined;
    }
    this.destroy({ children: true });
  }
}
