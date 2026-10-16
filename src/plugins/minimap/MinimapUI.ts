import { Container, Graphics, Text } from "pixi.js";

export interface IMinimapUIOptions {
  screenWidth: number;
  screenHeight: number;
  modalWidth: number;
  modalHeight: number;
  onClose: () => void;
}

/**
 * Manages the Datapad Holomap modal container, window frame chrome,
 * header info texts, close button, legend footer, and viewport layers.
 */
export class MinimapUI {
  public readonly rootContainer: Container;
  public readonly backdropGraphic: Graphics;
  public readonly modalContainer: Container;
  public readonly modalBg: Graphics;
  public readonly headerContainer: Container;
  public readonly titleText: Text;
  public readonly sectorText: Text;
  public readonly exploredText: Text;
  public readonly enemyCountText: Text;
  public readonly closeButton: Container;
  public readonly closeBtnBg: Graphics;

  public readonly mapViewport: Container;
  public readonly mapBgGraphic: Graphics;
  public readonly staticMapGraphic: Graphics;
  public readonly dynamicMapGraphic: Graphics;

  public readonly legendContainer: Container;

  public readonly viewportX: number = 24;
  public readonly viewportY: number = 56;
  public readonly viewportW: number;
  public readonly viewportH: number;

  constructor(options: IMinimapUIOptions) {
    const { screenWidth, screenHeight, modalWidth, modalHeight, onClose } = options;
    const devicePixelRatio = Math.max(2, Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 3));

    this.rootContainer = new Container();

    // 1. Semi-transparent backdrop to focus attention and catch outside clicks
    this.backdropGraphic = new Graphics();
    this.backdropGraphic.eventMode = "static";
    this.backdropGraphic.cursor = "pointer";
    this.backdropGraphic.beginFill(0x02070e, 0.72);
    this.backdropGraphic.drawRect(0, 0, screenWidth, screenHeight);
    this.backdropGraphic.endFill();
    this.backdropGraphic.on("pointertap", (event) => {
      if (event && typeof event.stopPropagation === "function") event.stopPropagation();
      onClose();
    });
    this.rootContainer.addChild(this.backdropGraphic);

    // 2. Main Datapad / Holomap Modal Window
    this.modalContainer = new Container();
    this.modalContainer.position.set((screenWidth - modalWidth) / 2, (screenHeight - modalHeight) / 2);
    this.modalContainer.eventMode = "static";
    this.modalContainer.on("pointerdown", (event) => {
      if (event && typeof event.stopPropagation === "function") event.stopPropagation();
    });
    this.rootContainer.addChild(this.modalContainer);

    // Modal Background frame
    this.modalBg = new Graphics();
    this.modalContainer.addChild(this.modalBg);

    // 3. Header bar
    this.headerContainer = new Container();
    this.headerContainer.position.set(24, 14);
    this.modalContainer.addChild(this.headerContainer);

    this.titleText = new Text("TACTICAL DATAPAD // AUTOMAP", {
      fontFamily: "Arial, sans-serif",
      fontSize: 15,
      fontWeight: "bold",
      fill: 0x00e5ff,
      letterSpacing: 1.5,
    });
    this.titleText.resolution = devicePixelRatio;
    this.headerContainer.addChild(this.titleText);

    this.sectorText = new Text("SECTOR: LEVEL 1", {
      fontFamily: "Arial, sans-serif",
      fontSize: 11,
      fontWeight: "bold",
      fill: 0x88bbdd,
      letterSpacing: 1.0,
    });
    this.sectorText.resolution = devicePixelRatio;
    this.sectorText.position.set(310, 3);
    this.headerContainer.addChild(this.sectorText);

    this.exploredText = new Text("EXPLORED: 0%", {
      fontFamily: "Arial, sans-serif",
      fontSize: 11,
      fontWeight: "bold",
      fill: 0x00ff88,
      letterSpacing: 1.0,
    });
    this.exploredText.resolution = devicePixelRatio;
    this.exploredText.position.set(470, 3);
    this.headerContainer.addChild(this.exploredText);

    this.enemyCountText = new Text("HOSTILES: 0", {
      fontFamily: "Arial, sans-serif",
      fontSize: 11,
      fontWeight: "bold",
      fill: 0xff5555,
      letterSpacing: 1.0,
    });
    this.enemyCountText.resolution = devicePixelRatio;
    this.enemyCountText.position.set(620, 3);
    this.headerContainer.addChild(this.enemyCountText);

    // Close Button [X] in top-right
    this.closeButton = new Container();
    this.closeButton.position.set(modalWidth - 54, 10);
    this.closeButton.eventMode = "static";
    this.closeButton.cursor = "pointer";

    this.closeBtnBg = new Graphics();
    this.drawCloseButton(false);
    this.closeButton.addChild(this.closeBtnBg);

    const closeLabel = new Text("X", {
      fontFamily: "Arial, sans-serif",
      fontSize: 18,
      fontWeight: "bold",
      fill: 0xffffff,
    });
    closeLabel.resolution = devicePixelRatio;
    closeLabel.anchor.set(0.5);
    closeLabel.position.set(18, 18);
    this.closeButton.addChild(closeLabel);

    this.closeButton.on("pointerover", () => this.drawCloseButton(true));
    this.closeButton.on("pointerout", () => this.drawCloseButton(false));
    this.closeButton.on("pointertap", (event) => {
      if (event && typeof event.stopPropagation === "function") event.stopPropagation();
      onClose();
    });
    this.modalContainer.addChild(this.closeButton);

    // 4. Map Viewport Container
    this.viewportW = modalWidth - 48;
    this.viewportH = modalHeight - 120;

    this.mapViewport = new Container();
    this.mapViewport.position.set(this.viewportX, this.viewportY);
    this.modalContainer.addChild(this.mapViewport);

    // Viewport background
    this.mapBgGraphic = new Graphics();
    this.mapViewport.addChild(this.mapBgGraphic);

    // Static map layer (walls, thin walls, tile grid)
    this.staticMapGraphic = new Graphics();
    this.mapViewport.addChild(this.staticMapGraphic);

    // Dynamic map layer (player, doors, persistent objects, enemies, finish zones)
    this.dynamicMapGraphic = new Graphics();
    this.mapViewport.addChild(this.dynamicMapGraphic);

    // 5. Legend footer
    this.legendContainer = new Container();
    this.legendContainer.position.set(24, modalHeight - 42);
    this.modalContainer.addChild(this.legendContainer);

    this.drawModalFrame(modalWidth, modalHeight);
    this.buildLegend(devicePixelRatio, modalWidth);
  }

  public updateHeader(sectorName?: string, exploredPct?: number, hostiles?: number): void {
    if (sectorName !== undefined) {
      this.sectorText.text = `SECTOR: ${sectorName.toUpperCase()}`;
    }
    if (exploredPct !== undefined) {
      this.exploredText.text = `EXPLORED: ${exploredPct}%`;
    }
    if (hostiles !== undefined) {
      this.enemyCountText.text = `HOSTILES: ${hostiles}`;
    }
  }

  private drawCloseButton(hover: boolean): void {
    this.closeBtnBg.clear();
    const bgColor = hover ? 0xcc2222 : 0x223344;
    const borderColor = hover ? 0xff5555 : 0x00e5ff;
    this.closeBtnBg.beginFill(bgColor, hover ? 0.95 : 0.7);
    this.closeBtnBg.lineStyle(1.5, borderColor, 0.9);
    this.closeBtnBg.drawRoundedRect(0, 0, 36, 36, 6);
    this.closeBtnBg.endFill();
  }

  private drawModalFrame(modalWidth: number, modalHeight: number): void {
    this.modalBg.clear();
    // Modal frame background
    this.modalBg.beginFill(0x08131e, 0.95);
    this.modalBg.lineStyle(2, 0x00e5ff, 0.85);
    this.modalBg.drawRoundedRect(0, 0, modalWidth, modalHeight, 12);
    this.modalBg.endFill();

    // Subtle sci-fi header divider
    this.modalBg.lineStyle(1, 0x00e5ff, 0.35);
    this.modalBg.moveTo(16, 48);
    this.modalBg.lineTo(modalWidth - 16, 48);

    // Subtle sci-fi footer divider
    this.modalBg.moveTo(16, modalHeight - 52);
    this.modalBg.lineTo(modalWidth - 16, modalHeight - 52);

    // Corner decorative accents
    const accentLength = 14;
    this.modalBg.lineStyle(3, 0x00ffff, 1);
    // Top-left
    this.modalBg.moveTo(4, 4 + accentLength);
    this.modalBg.lineTo(4, 4);
    this.modalBg.lineTo(4 + accentLength, 4);
    // Bottom-left
    this.modalBg.moveTo(4, modalHeight - 4 - accentLength);
    this.modalBg.lineTo(4, modalHeight - 4);
    this.modalBg.lineTo(4 + accentLength, modalHeight - 4);
    // Bottom-right
    this.modalBg.moveTo(modalWidth - 4 - accentLength, modalHeight - 4);
    this.modalBg.lineTo(modalWidth - 4, modalHeight - 4);
    this.modalBg.lineTo(modalWidth - 4, modalHeight - 4 - accentLength);
  }

  private buildLegend(devicePixelRatio: number, modalWidth: number): void {
    const legendGraphics = new Graphics();
    this.legendContainer.addChild(legendGraphics);

    let cursorX = 0;

    // 1. Player: Cyan Chevron
    legendGraphics.lineStyle(2, 0x00ffff, 1);
    legendGraphics.beginFill(0x00e5ff, 0.6);
    legendGraphics.drawCircle(cursorX + 6, 8, 5);
    legendGraphics.endFill();
    const playerLabel = new Text("YOU", {
      fontFamily: "Arial, sans-serif",
      fontSize: 10,
      fontWeight: "bold",
      fill: 0x00e5ff,
    });
    playerLabel.resolution = devicePixelRatio;
    playerLabel.position.set(cursorX + 16, 2);
    this.legendContainer.addChild(playerLabel);
    cursorX += 56;

    // 2. Door: Yellow Bar
    legendGraphics.lineStyle(1.5, 0xffaa00, 1);
    legendGraphics.beginFill(0xffaa00, 0.85);
    legendGraphics.drawRect(cursorX, 4, 12, 8);
    legendGraphics.endFill();
    const doorLabel = new Text("DOOR", {
      fontFamily: "Arial, sans-serif",
      fontSize: 10,
      fontWeight: "bold",
      fill: 0xffaa00,
    });
    doorLabel.resolution = devicePixelRatio;
    doorLabel.position.set(cursorX + 16, 2);
    this.legendContainer.addChild(doorLabel);
    cursorX += 64;

    // 3. Keycard: Multi-color square
    legendGraphics.lineStyle(1, 0x0088ff, 1);
    legendGraphics.beginFill(0x0088ff, 1);
    legendGraphics.drawRect(cursorX, 4, 4, 8);
    legendGraphics.endFill();
    legendGraphics.lineStyle(1, 0xff3333, 1);
    legendGraphics.beginFill(0xff3333, 1);
    legendGraphics.drawRect(cursorX + 5, 4, 4, 8);
    legendGraphics.endFill();
    legendGraphics.lineStyle(1, 0xffcc00, 1);
    legendGraphics.beginFill(0xffcc00, 1);
    legendGraphics.drawRect(cursorX + 10, 4, 4, 8);
    legendGraphics.endFill();
    const keycardLabel = new Text("KEYCARD", {
      fontFamily: "Arial, sans-serif",
      fontSize: 10,
      fontWeight: "bold",
      fill: 0x88bbdd,
    });
    keycardLabel.resolution = devicePixelRatio;
    keycardLabel.position.set(cursorX + 18, 2);
    this.legendContainer.addChild(keycardLabel);
    cursorX += 84;

    // 4. Discovered Items / Objects: Medical cross + Diamond
    legendGraphics.lineStyle(1.5, 0x00ff88, 1);
    legendGraphics.beginFill(0x00ff88, 0.3);
    legendGraphics.drawCircle(cursorX + 5, 8, 4);
    legendGraphics.endFill();
    legendGraphics.lineStyle(1.5, 0x00e5ff, 1);
    legendGraphics.drawRect(cursorX + 12, 5, 6, 6);
    const itemsLabel = new Text("ITEMS", {
      fontFamily: "Arial, sans-serif",
      fontSize: 10,
      fontWeight: "bold",
      fill: 0x00ffcc,
    });
    itemsLabel.resolution = devicePixelRatio;
    itemsLabel.position.set(cursorX + 22, 2);
    this.legendContainer.addChild(itemsLabel);
    cursorX += 74;

    // 5. Exit: Emerald Green
    legendGraphics.lineStyle(1.5, 0x00ff88, 1);
    legendGraphics.beginFill(0x00ff88, 0.8);
    legendGraphics.drawRoundedRect(cursorX, 3, 10, 10, 2);
    legendGraphics.endFill();
    const exitLabel = new Text("EXIT", {
      fontFamily: "Arial, sans-serif",
      fontSize: 10,
      fontWeight: "bold",
      fill: 0x00ff88,
    });
    exitLabel.resolution = devicePixelRatio;
    exitLabel.position.set(cursorX + 14, 2);
    this.legendContainer.addChild(exitLabel);
    cursorX += 52;

    // 6. Stairs: Distinct step treads with arrows (▲/▼)
    legendGraphics.lineStyle(1.5, 0x00e5ff, 1);
    legendGraphics.beginFill(0x0c2538, 0.9);
    legendGraphics.drawRect(cursorX, 3, 11, 10);
    legendGraphics.endFill();
    legendGraphics.lineStyle(1, 0xa5f3fc, 0.9);
    legendGraphics.moveTo(cursorX + 1, 6);
    legendGraphics.lineTo(cursorX + 10, 6);
    legendGraphics.moveTo(cursorX + 1, 9);
    legendGraphics.lineTo(cursorX + 10, 9);
    const stairsLabel = new Text("STAIRS", {
      fontFamily: "Arial, sans-serif",
      fontSize: 10,
      fontWeight: "bold",
      fill: 0x00e5ff,
    });
    stairsLabel.resolution = devicePixelRatio;
    stairsLabel.position.set(cursorX + 15, 2);
    this.legendContainer.addChild(stairsLabel);
    cursorX += 66;

    // 7. Hostiles: Red Dot
    legendGraphics.lineStyle(1.5, 0xff2222, 1);
    legendGraphics.beginFill(0xff3333, 0.9);
    legendGraphics.drawCircle(cursorX + 5, 8, 4);
    legendGraphics.endFill();
    const hostileLabel = new Text("HOSTILE", {
      fontFamily: "Arial, sans-serif",
      fontSize: 10,
      fontWeight: "bold",
      fill: 0xff4444,
    });
    hostileLabel.resolution = devicePixelRatio;
    hostileLabel.position.set(cursorX + 14, 2);
    this.legendContainer.addChild(hostileLabel);

    // Right-aligned hotkey hint
    const hintLabel = new Text("[M] / [ESC] / TAP [X] TO CLOSE", {
      fontFamily: "Arial, sans-serif",
      fontSize: 10,
      fontWeight: "bold",
      fill: 0x5588aa,
      letterSpacing: 0.5,
    });
    hintLabel.resolution = devicePixelRatio;
    hintLabel.anchor.set(1, 0);
    hintLabel.position.set(modalWidth - 52, 2);
    this.legendContainer.addChild(hintLabel);
  }

  public dispose(): void {
    this.backdropGraphic.off("pointertap");
    this.closeButton.off("pointerover");
    this.closeButton.off("pointerout");
    this.closeButton.off("pointertap");
  }
}
