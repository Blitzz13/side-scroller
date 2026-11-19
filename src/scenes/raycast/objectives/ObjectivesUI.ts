import { Container, Graphics, SCALE_MODES, Text, TextStyle } from "pixi.js";
import { gameConfig } from "../../../configs/GameConfig";
import { getRaycastUIConfig, IRaycastUIConfig } from "../../../configs/RaycastUIConfig";
import { RaycastObjectiveManager } from "./RaycastObjectiveManager";

export class ObjectivesUI extends Container {
  private objectiveManager: RaycastObjectiveManager;
  private backdrop: Graphics;
  private modalContainer: Container;
  private modalBg: Graphics;
  private contentContainer: Container;
  private isOpen: boolean = false;
  private dpr: number = 2;
  private readonly uiCfg: IRaycastUIConfig["objectives"];

  constructor(objectiveManager: RaycastObjectiveManager) {
    super();
    this.objectiveManager = objectiveManager;
    this.uiCfg = getRaycastUIConfig().objectives;
    this.visible = false;
    this.eventMode = "static";

    this.dpr = Math.max(
      2,
      Math.min(
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
        this.uiCfg.maxTextDpr
      )
    );

    const screenW = gameConfig.width;
    const screenH = gameConfig.height;

    // 1. Semi-transparent backdrop
    this.backdrop = new Graphics();
    this.backdrop.beginFill(0x000000, 0.65);
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
    this.addChild(this.modalContainer);

    this.modalBg = new Graphics();
    this.modalContainer.addChild(this.modalBg);

    this.contentContainer = new Container();
    this.modalContainer.addChild(this.contentContainer);

    // Listen to updates from objectiveManager
    this.objectiveManager.on("objectivesUpdated", () => {
      if (this.isOpen) {
        this.renderContent();
      }
    });
    this.objectiveManager.on("objectiveCompleted", () => {
      if (this.isOpen) {
        this.renderContent();
      }
    });
  }

  private createCrispText(content: string, style: ConstructorParameters<typeof Text>[1]): Text {
    const txt = new Text(content, {
      fontFamily: this.uiCfg.fontFamily,
      ...style,
    });
    txt.resolution = this.dpr;
    if (this.uiCfg.linearTextScaling) {
      txt.texture.baseTexture.scaleMode = SCALE_MODES.LINEAR;
    }
    return txt;
  }

  public get isVisibleOpen(): boolean {
    return this.isOpen;
  }

  public show(): void {
    this.isOpen = true;
    this.visible = true;
    this.alpha = 0;
    this.modalContainer.scale.set(0.96);

    this.renderContent();

    // Simple smooth fade-in
    let elapsed = 0;
    const duration = 120; // ms
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

  public renderContent(): void {
    this.contentContainer.removeChildren();

    const screenW = gameConfig.width;
    const screenH = gameConfig.height;

    // Responsive panel sizing
    const panelW = Math.min(this.uiCfg.panelMaxWidth, screenW - 60);
    const panelH = Math.min(this.uiCfg.panelMaxHeight, screenH - 80);
    const halfW = panelW / 2;
    const halfH = panelH / 2;

    // Draw Imperial/Rebel Datapad Frame
    this.modalBg.clear();
    // Base shadow
    this.modalBg.beginFill(0x000000, 0.5);
    this.modalBg.drawRoundedRect(-halfW + 4, -halfH + 6, panelW, panelH, 16);
    this.modalBg.endFill();

    // Dark cyber panel fill
    this.modalBg.beginFill(0x091422, 0.94);
    this.modalBg.lineStyle(2, 0x00e5ff, 0.85);
    this.modalBg.drawRoundedRect(-halfW, -halfH, panelW, panelH, 14);
    this.modalBg.endFill();

    // Inner subtle border
    this.modalBg.lineStyle(1, 0x00aacc, 0.3);
    this.modalBg.drawRoundedRect(-halfW + 6, -halfH + 6, panelW - 12, panelH - 12, 10);

    // Decorative corner tech brackets
    const bracketSize = 18;
    this.modalBg.lineStyle(3, 0x00ffff, 1.0);
    // Top-left
    this.modalBg.moveTo(-halfW + 3, -halfH + 3 + bracketSize);
    this.modalBg.lineTo(-halfW + 3, -halfH + 3);
    this.modalBg.lineTo(-halfW + 3 + bracketSize, -halfH + 3);
    // Top-right
    this.modalBg.moveTo(halfW - 3 - bracketSize, -halfH + 3);
    this.modalBg.lineTo(halfW - 3, -halfH + 3);
    this.modalBg.lineTo(halfW - 3, -halfH + 3 + bracketSize);
    // Bottom-left
    this.modalBg.moveTo(-halfW + 3, halfH - 3 - bracketSize);
    this.modalBg.lineTo(-halfW + 3, halfH - 3);
    this.modalBg.lineTo(-halfW + 3 + bracketSize, halfH - 3);
    // Bottom-right
    this.modalBg.moveTo(halfW - 3 - bracketSize, halfH - 3);
    this.modalBg.lineTo(halfW - 3, halfH - 3);
    this.modalBg.lineTo(halfW - 3, halfH - 3 - bracketSize);

    // Header divider line
    this.modalBg.lineStyle(1.5, 0x00e5ff, 0.5);
    this.modalBg.moveTo(-halfW + 20, -halfH + 62);
    this.modalBg.lineTo(halfW - 20, -halfH + 62);

    // Footer divider line
    this.modalBg.lineStyle(1, 0x00e5ff, 0.3);
    this.modalBg.moveTo(-halfW + 20, halfH - 42);
    this.modalBg.lineTo(halfW - 20, halfH - 42);

    // Header Title
    const titleText = this.createCrispText("TACTICAL DATAPAD // MISSION OBJECTIVES", {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: this.uiCfg.headerFontSize,
      fontWeight: "bold",
      fill: 0x00ffff,
      letterSpacing: 2,
      dropShadow: true,
      dropShadowColor: 0x003344,
      dropShadowDistance: 1,
    });
    titleText.anchor.set(0, 0.5);
    titleText.position.set(-halfW + 28, -halfH + 32);
    this.contentContainer.addChild(titleText);

    // Close button in top-right [X]
    const closeBtn = new Container();
    closeBtn.position.set(
      halfW - this.uiCfg.closeButtonOffsetX,
      -halfH + this.uiCfg.closeButtonOffsetY
    );
    closeBtn.eventMode = "static";
    closeBtn.cursor = "pointer";
    const closeBg = new Graphics();
    closeBg.beginFill(0x1a2838, 0.8);
    closeBg.lineStyle(1.5, 0x00e5ff, 0.8);
    closeBg.drawCircle(0, 0, this.uiCfg.closeButtonRadius);
    closeBg.endFill();
    closeBtn.addChild(closeBg);

    const closeIcon = this.createCrispText("✕", {
      fontFamily: "Arial, sans-serif",
      fontSize: this.uiCfg.closeButtonFontSize,
      fontWeight: "bold",
      fill: 0x00e5ff,
    });
    closeIcon.anchor.set(0.5);
    closeBtn.addChild(closeIcon);

    closeBtn.on("pointerdown", (e) => {
      e?.stopPropagation?.();
      this.hide();
    });
    this.contentContainer.addChild(closeBtn);

    // Render Objectives List
    const visibleObjectives = this.objectiveManager.getVisibleObjectives();
    let startY = -halfH + 82;
    const contentW = panelW - 56;

    if (visibleObjectives.length === 0) {
      const emptyText = this.createCrispText("NO ACTIVE MISSION OBJECTIVES RECORDED", {
        fontFamily: "Segoe UI, Arial, sans-serif",
        fontSize: this.uiCfg.emptyFontSize,
        fontStyle: "italic",
        fill: 0x8899aa,
        align: "center",
      });
      emptyText.anchor.set(0.5);
      emptyText.position.set(0, 0);
      this.contentContainer.addChild(emptyText);
    } else {
      visibleObjectives.forEach((obj, idx) => {
        const itemContainer = new Container();
        itemContainer.position.set(-halfW + 28, startY);

        const isCurrentActive = !obj.isCompleted;

        // Description if active (measure first so card height fits enlarged fonts)
        let descText: Text | null = null;
        if (isCurrentActive && obj.description) {
          descText = this.createCrispText(obj.description, {
            fontSize: this.uiCfg.descriptionFontSize,
            fill: this.uiCfg.descriptionColor,
            wordWrap: true,
            wordWrapWidth: contentW - 56,
            lineHeight: this.uiCfg.descriptionLineHeight,
            ...(this.uiCfg.descriptionDropShadow
              ? {
                  dropShadow: true,
                  dropShadowColor: 0x000000,
                  dropShadowDistance: 1,
                  dropShadowBlur: 2,
                }
              : {}),
          });
          descText.position.set(42, 38);
        }

        const boxH = isCurrentActive
          ? descText
            ? Math.max(72, Math.ceil(38 + descText.height + 12))
            : Math.max(46, Math.round(this.uiCfg.titleActiveFontSize * 2.4))
          : Math.max(40, Math.round(this.uiCfg.titleCompletedFontSize * 2.5));

        // Background box for objective
        const itemBg = new Graphics();
        if (isCurrentActive) {
          itemBg.beginFill(0x002844, 0.6);
          itemBg.lineStyle(1.5, 0x00e5ff, 0.9);
          itemBg.drawRoundedRect(0, 0, contentW, boxH, 8);
        } else {
          itemBg.beginFill(0x0a1622, 0.4);
          itemBg.lineStyle(1, 0x008855, 0.4);
          itemBg.drawRoundedRect(0, 0, contentW, boxH, 6);
        }
        itemBg.endFill();
        itemContainer.addChild(itemBg);

        // Icon badge
        const badgeG = new Graphics();
        if (obj.isCompleted) {
          badgeG.beginFill(0x00ff88, 0.2);
          badgeG.lineStyle(1.5, 0x00ff88, 0.9);
          badgeG.drawCircle(20, 20, 11);
          badgeG.endFill();
          itemContainer.addChild(badgeG);

          const checkmark = new Text("✓", {
            fontFamily: "Arial, sans-serif",
            fontSize: 13,
            fontWeight: "bold",
            fill: 0x00ff88,
          });
          checkmark.resolution = this.dpr;
          checkmark.anchor.set(0.5);
          checkmark.position.set(20, 20);
          itemContainer.addChild(checkmark);
        } else {
          badgeG.beginFill(0xffaa00, 0.2);
          badgeG.lineStyle(1.5, 0xffaa00, 0.9);
          badgeG.drawCircle(20, 20, 11);
          badgeG.endFill();
          itemContainer.addChild(badgeG);

          const activeIcon = new Text("►", {
            fontFamily: "Arial, sans-serif",
            fontSize: 10,
            fill: 0xffaa00,
          });
          activeIcon.resolution = this.dpr;
          activeIcon.anchor.set(0.5);
          activeIcon.position.set(21, 20);
          itemContainer.addChild(activeIcon);
        }

        // Objective Title
        const objTitle = this.createCrispText(obj.title, {
          fontFamily: "Segoe UI, Arial, sans-serif",
          fontSize: isCurrentActive
            ? this.uiCfg.titleActiveFontSize
            : this.uiCfg.titleCompletedFontSize,
          fontWeight: "bold",
          fill: obj.isCompleted ? 0x77aa88 : 0xffffff,
          dropShadow: isCurrentActive,
          dropShadowColor: 0x003344,
          dropShadowDistance: 1,
        });
        objTitle.anchor.set(0, 0.5);
        objTitle.position.set(42, 20);
        itemContainer.addChild(objTitle);

        // Status Tag
        const isOptionalFromJson = Boolean(obj.isOptional);
        const tagLabel = obj.isCompleted
          ? "COMPLETED"
          : isOptionalFromJson
          ? "OPTIONAL"
          : "IN PROGRESS";
        const tagColor = obj.isCompleted
          ? 0x00ff88
          : isOptionalFromJson
          ? 0x00e5ff
          : 0xffaa00;

        const tagText = this.createCrispText(tagLabel, {
          fontFamily: "Segoe UI, Arial, sans-serif",
          fontSize: this.uiCfg.tagFontSize,
          fontWeight: "bold",
          fill: tagColor,
          letterSpacing: 1,
        });
        tagText.anchor.set(1, 0.5);
        tagText.position.set(contentW - 16, 20);
        itemContainer.addChild(tagText);

        if (descText) {
          itemContainer.addChild(descText);
          startY += boxH + 10;
        } else {
          startY += boxH + 8;
        }

        this.contentContainer.addChild(itemContainer);
      });

      // If all completed celebration note
      if (this.objectiveManager.isAllCompleted()) {
        const allDoneText = this.createCrispText("★ ALL PRIMARY OBJECTIVES ACCOMPLISHED // PROCEED TO EXIT ★", {
          fontFamily: "Segoe UI, Arial, sans-serif",
          fontSize: this.uiCfg.allDoneFontSize,
          fontWeight: "bold",
          fill: 0x00ff88,
          letterSpacing: 1,
          align: "center",
        });
        allDoneText.anchor.set(0.5);
        allDoneText.position.set(0, startY + 14);
        this.contentContainer.addChild(allDoneText);
      }
    }

    // Footer Help Text
    const footerHint = this.createCrispText(
      "Desktop: Press [TAB] or [ESC] to toggle | Mobile: Tap anywhere to close",
      {
        fontFamily: "Segoe UI, Arial, sans-serif",
        fontSize: this.uiCfg.footerFontSize,
        fill: 0x00aacc,
        letterSpacing: 1,
        align: "center",
      }
    );
    footerHint.anchor.set(0.5);
    footerHint.position.set(0, halfH - 22);
    this.contentContainer.addChild(footerHint);
  }
}
