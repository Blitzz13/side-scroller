import { Container, Graphics, Text } from "pixi.js";
import { gameConfig } from "../configs/GameConfig";
import { IDisposable } from "../characters/interfaces/IDisposable";

export class RaycastLoadingOverlay extends Container implements IDisposable {
  private backdrop: Graphics;
  private barContainer: Container;
  private barTrack: Graphics;
  private barFill: Graphics;
  private barGlow: Graphics;
  private titleText: Text;
  private statusText: Text;

  private barWidth: number = 360;
  private barHeight: number = 18;
  private barRadius: number = 9;
  private currentProgress: number = 0;

  constructor() {
    super();

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
    const startY = Math.round(gameConfig.height / 2 + 30);
    this.barContainer.position.set(startX, startY);
    this.addChild(this.barContainer);

    // 3. Title text above loading bar
    this.titleText = new Text("INITIALIZING SECTOR", {
      fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: 22,
      fontWeight: "bold",
      fill: 0x00e5ff, // Same cyan as MainMenu subtitle & buttons
      letterSpacing: 4,
      dropShadow: true,
      dropShadowColor: 0x002233,
      dropShadowDistance: 2,
      align: "center",
    });
    this.titleText.anchor.set(0.5, 0.5);
    this.titleText.position.set(gameConfig.width / 2, startY - 50);
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
      fontSize: 14,
      fontWeight: "normal",
      fill: 0x7be5ff,
      letterSpacing: 1,
      align: "center",
    });
    this.statusText.anchor.set(0.5, 0);
    this.statusText.position.set(gameConfig.width / 2, startY + this.barHeight + 14);
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
