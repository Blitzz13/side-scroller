import { Container, Graphics, Text } from "pixi.js";
import { gameConfig } from "../configs/GameConfig";
import { getRaycastUIConfig } from "../configs/RaycastUIConfig";
import { IDisposable } from "../characters/interfaces/IDisposable";

export class RaycastLoadingOverlay extends Container implements IDisposable {
  private backdrop: Graphics;
  private barContainer: Container;
  private barTrack: Graphics;
  private barFill: Graphics;
  private barGlow: Graphics;
  private titleText: Text;
  private statusText: Text;

  private barWidth: number;
  private barHeight: number;
  private barRadius: number;
  private currentProgress: number = 0;

  constructor() {
    super();

    const loadingCfg = getRaycastUIConfig().loading;
    this.barWidth = loadingCfg.barWidth;
    this.barHeight = loadingCfg.barHeight;
    this.barRadius = loadingCfg.barRadius;

    const dpr = Math.max(
      1,
      Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 3)
    );

    // Ensure this container handles its own sorting if needed
    this.sortableChildren = true;
    this.eventMode = "static"; // Block mouse/touch events behind the loading screen
    this.cursor = "wait";

    // 1. Pure solid black full-screen background
    this.backdrop = new Graphics();
    this.backdrop.beginFill(0x000000, 1.0);
    this.backdrop.drawRect(0, 0, gameConfig.width, gameConfig.height);
    this.backdrop.endFill();
    this.addChild(this.backdrop);

    // 2. Bar Container centered horizontally
    this.barContainer = new Container();
    const startX = Math.round((gameConfig.width - this.barWidth) / 2);
    const startY = Math.round(gameConfig.height / 2 + loadingCfg.barCenterOffsetY);
    this.barContainer.position.set(startX, startY);
    this.addChild(this.barContainer);

    // 3. Title text above loading bar
    this.titleText = new Text("INITIALIZING SECTOR", {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: loadingCfg.titleFontSize,
      fontWeight: "bold",
      fill: 0x00e5ff, // Same cyan as MainMenu subtitle & buttons
      letterSpacing: loadingCfg.titleLetterSpacing,
      dropShadow: true,
      dropShadowColor: 0x002233,
      dropShadowDistance: 2,
      align: "center",
    });
    this.titleText.resolution = dpr;
    this.titleText.anchor.set(0.5, 0.5);
    this.titleText.position.set(gameConfig.width / 2, startY - loadingCfg.titleOffsetY);
    this.addChild(this.titleText);

    // 4. Background Track matching MainMenu Button aesthetic (0x05101e fill, 0x00e5ff stroke)
    this.barTrack = new Graphics();
    this.barContainer.addChild(this.barTrack);

    // 5. Fill and glow graphics
    this.barGlow = new Graphics();
    this.barContainer.addChild(this.barGlow);

    this.barFill = new Graphics();
    this.barContainer.addChild(this.barFill);

    this.drawTrack();

    // 6. Status details text below loading bar
    this.statusText = new Text("Loading assets...", {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: loadingCfg.statusFontSize,
      fontWeight: "normal",
      fill: 0x7be5ff,
      letterSpacing: loadingCfg.statusLetterSpacing,
      align: "center",
    });
    this.statusText.resolution = dpr;
    this.statusText.anchor.set(0.5, 0);
    this.statusText.position.set(gameConfig.width / 2, startY + this.barHeight + loadingCfg.statusOffsetY);
    this.addChild(this.statusText);

    this.setProgress(0);
  }

  private drawTrack(): void {
    this.barTrack.clear();
    // Button styling: Fill: 0x05101e (deep cosmic blue, alpha 0.95), Stroke: 0x00e5ff (cyan border, alpha 0.85)
    this.barTrack.beginFill(0x05101e, 0.95);
    this.barTrack.lineStyle({
      width: 2,
      color: 0x00e5ff,
      alpha: 0.85,
    });
    this.barTrack.drawRoundedRect(0, 0, this.barWidth, this.barHeight, this.barRadius);
    this.barTrack.endFill();
  }

  /**
   * Sets the progress fraction (between 0.0 and 1.0) and updates the visual fill.
   */
  public setProgress(progress: number, status?: string): void {
    this.currentProgress = Math.max(0, Math.min(1, progress));

    if (status) {
      this.statusText.text = status;
    }

    this.barFill.clear();
    this.barGlow.clear();

    const innerPadding = 2;
    const maxWidth = this.barWidth - innerPadding * 2;
    const fillW = Math.max(0, maxWidth * this.currentProgress);
    const innerH = this.barHeight - innerPadding * 2;
    const innerRadius = Math.max(2, this.barRadius - innerPadding);

    if (fillW > 2) {
      // Outer subtle cyan glow
      this.barGlow.beginFill(0x00e5ff, 0.25);
      this.barGlow.drawRoundedRect(
        innerPadding - 1,
        innerPadding - 1,
        fillW + 2,
        innerH + 2,
        innerRadius + 1
      );
      this.barGlow.endFill();

      // Cyan fill (0x00e5ff with 0.95 alpha)
      this.barFill.beginFill(0x00e5ff, 0.95);
      this.barFill.drawRoundedRect(
        innerPadding,
        innerPadding,
        fillW,
        innerH,
        innerRadius
      );
      this.barFill.endFill();
    }
  }

  public setLevelTitle(levelName: string): void {
    const formatted = levelName
      .replace(/^assets\/raycast\/levels\//, "")
      .replace(/\.json$/, "")
      .toUpperCase();
    this.titleText.text = `ENTERING ${formatted}`;
  }

  public dispose(): void {
    this.destroy({ children: true });
  }
}
