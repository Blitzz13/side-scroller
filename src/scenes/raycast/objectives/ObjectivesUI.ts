import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { gameConfig } from "../../../configs/GameConfig";
import { RaycastObjectiveManager } from "./RaycastObjectiveManager";

export class ObjectivesUI extends Container {
  private objectiveManager: RaycastObjectiveManager;
  private backdrop: Graphics;
  private modalContainer: Container;
  private modalBg: Graphics;
  private contentContainer: Container;
  private isOpen: boolean = false;
  private dpr: number = 2;

  constructor(objectiveManager: RaycastObjectiveManager) {
    super();
    this.objectiveManager = objectiveManager;
    this.visible = false;
    this.eventMode = "static";

    this.dpr = Math.max(
      2,
      Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 3)
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
    const panelW = Math.min(680, screenW - 60);
    const panelH = Math.min(480, screenH - 80);
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
    const titleText = new Text("TACTICAL DATAPAD // MISSION OBJECTIVES", {
      fontFamily: "Arial, sans-serif",
      fontSize: 18,
      fontWeight: "bold",
      fill: 0x00ffff,
      letterSpacing: 2,
      dropShadow: true,
      dropShadowColor: 0x003344,
      dropShadowDistance: 1,
    });
    titleText.resolution = this.dpr;
    titleText.anchor.set(0, 0.5);
    titleText.position.set(-halfW + 28, -halfH + 32);
    this.contentContainer.addChild(titleText);

    // Close button in top-right [X]
    const closeBtn = new Container();
    closeBtn.position.set(halfW - 22, -halfH + 20);
    closeBtn.eventMode = "static";
    closeBtn.cursor = "pointer";
    const closeBg = new Graphics();
    closeBg.beginFill(0x1a2838, 0.8);
    closeBg.lineStyle(1.5, 0x00e5ff, 0.8);
    closeBg.drawCircle(0, 0, 14);
    closeBg.endFill();
    closeBtn.addChild(closeBg);

    const closeIcon = new Text("✕", {
      fontFamily: "Arial, sans-serif",
      fontSize: 13,
      fontWeight: "bold",
      fill: 0x00e5ff,
    });
    closeIcon.resolution = this.dpr;
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
      const emptyText = new Text("NO ACTIVE MISSION OBJECTIVES RECORDED", {
        fontFamily: "Arial, sans-serif",
        fontSize: 15,
        fontStyle: "italic",
        fill: 0x8899aa,
        align: "center",
      });
      emptyText.resolution = this.dpr;
      emptyText.anchor.set(0.5);
      emptyText.position.set(0, 0);
      this.contentContainer.addChild(emptyText);
    } else {
      visibleObjectives.forEach((obj, idx) => {
        const itemContainer = new Container();
        itemContainer.position.set(-halfW + 28, startY);

        const isCurrentActive = !obj.isCompleted;

        // Background box for active objective
        if (isCurrentActive) {
          const itemBg = new Graphics();
          itemBg.beginFill(0x002844, 0.6);
          itemBg.lineStyle(1.5, 0x00e5ff, 0.9);
          itemBg.drawRoundedRect(0, 0, contentW, obj.description ? 72 : 46, 8);
          itemBg.endFill();
          itemContainer.addChild(itemBg);
        } else {
          const itemBg = new Graphics();
          itemBg.beginFill(0x0a1622, 0.4);
          itemBg.lineStyle(1, 0x008855, 0.4);
          itemBg.drawRoundedRect(0, 0, contentW, 40, 6);
          itemBg.endFill();
          itemContainer.addChild(itemBg);
        }

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
        const objTitle = new Text(obj.title, {
          fontFamily: "Arial, sans-serif",
          fontSize: isCurrentActive ? 16 : 14,
          fontWeight: "bold",
          fill: obj.isCompleted ? 0x77aa88 : 0xffffff,
          dropShadow: isCurrentActive,
          dropShadowColor: 0x003344,
          dropShadowDistance: 1,
        });
        objTitle.resolution = this.dpr;
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

        const tagText = new Text(tagLabel, {
          fontFamily: "Arial, sans-serif",
          fontSize: 11,
          fontWeight: "bold",
          fill: tagColor,
          letterSpacing: 1,
        });
        tagText.resolution = this.dpr;
        tagText.anchor.set(1, 0.5);
        tagText.position.set(contentW - 16, 20);
        itemContainer.addChild(tagText);

        // Description if active
        if (isCurrentActive && obj.description) {
          const descText = new Text(obj.description, {
            fontFamily: "Arial, sans-serif",
            fontSize: 12.5,
            fill: 0xbbddee,
            wordWrap: true,
            wordWrapWidth: contentW - 56,
            lineHeight: 16,
          });
          descText.resolution = this.dpr;
          descText.position.set(42, 38);
          itemContainer.addChild(descText);
          startY += 82;
        } else {
          startY += 48;
        }

        this.contentContainer.addChild(itemContainer);
      });

      // If all completed celebration note
      if (this.objectiveManager.isAllCompleted()) {
        const allDoneText = new Text("★ ALL PRIMARY OBJECTIVES ACCOMPLISHED // PROCEED TO EXIT ★", {
          fontFamily: "Arial, sans-serif",
          fontSize: 13,
          fontWeight: "bold",
          fill: 0x00ff88,
          letterSpacing: 1,
          align: "center",
        });
        allDoneText.resolution = this.dpr;
        allDoneText.anchor.set(0.5);
        allDoneText.position.set(0, startY + 14);
        this.contentContainer.addChild(allDoneText);
      }
    }

    // Footer Help Text
    const footerHint = new Text(
      "Desktop: Press [TAB] or [ESC] to toggle | Mobile: Tap anywhere to close",
      {
        fontFamily: "Arial, sans-serif",
        fontSize: 12,
        fill: 0x00aacc,
        letterSpacing: 1,
        align: "center",
      }
    );
    footerHint.resolution = this.dpr;
    footerHint.anchor.set(0.5);
    footerHint.position.set(0, halfH - 22);
    this.contentContainer.addChild(footerHint);
  }
}
