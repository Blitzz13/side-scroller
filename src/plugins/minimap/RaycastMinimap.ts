import { Container } from "pixi.js";
import { IDisposable } from "../../characters/interfaces/IDisposable";
import { gameConfig } from "../../configs/GameConfig";
import { MinimapDiscovery } from "./MinimapDiscovery";
import { MinimapRenderer } from "./MinimapRenderer";
import {
  IMinimapDataSource,
  IMinimapViewportMetrics,
  IRaycastMinimapOptions,
} from "./MinimapTypes";
import { MinimapUI } from "./MinimapUI";

/**
 * Reusable Tactical Minimap & Automap Plugin.
 *
 * Coordinates fog-of-war discovery, real-time map rendering,
 * and the Sci-Fi Holomap Datapad UI.
 */
export class RaycastMinimap extends Container implements IDisposable {
  private dataSource: IMinimapDataSource;
  private options: Required<IRaycastMinimapOptions>;
  private _isOpen: boolean = false;

  private discovery: MinimapDiscovery;
  private renderer: MinimapRenderer;
  private ui: MinimapUI;

  private cachedMetrics?: IMinimapViewportMetrics;
  private pulseTimer: number = 0;

  constructor(dataSource: IMinimapDataSource, options?: IRaycastMinimapOptions) {
    super();
    this.dataSource = dataSource;

    const screenWidth = options?.width ?? gameConfig.width;
    const screenHeight = options?.height ?? gameConfig.height;
    const modalWidth = options?.modalWidth ?? Math.min(880, Math.floor(screenWidth * 0.88));
    const modalHeight = options?.modalHeight ?? Math.min(620, Math.floor(screenHeight * 0.88));

    this.options = {
      width: screenWidth,
      height: screenHeight,
      modalWidth,
      modalHeight,
      showEnemies: options?.showEnemies ?? true,
      showFovCone: options?.showFovCone ?? true,
      fogOfWar: options?.fogOfWar ?? true,
    };

    this.discovery = new MinimapDiscovery();
    this.renderer = new MinimapRenderer();

    this.ui = new MinimapUI({
      screenWidth,
      screenHeight,
      modalWidth,
      modalHeight,
      onClose: () => this.hide(),
    });
    this.addChild(this.ui.rootContainer);

    // Start closed
    this.visible = false;
  }

  public get isOpen(): boolean {
    return this._isOpen;
  }

  public toggle(): void {
    if (this._isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  public show(): void {
    if (this._isOpen) return;
    this._isOpen = true;
    this.visible = true;

    // Immediately discover current surroundings and refresh static map if needed
    const player = this.dataSource.getPlayer();
    if (player) {
      this.updateDiscovery(player.x, player.y, player.dirX, player.dirY, true);
    }
    if (this.discovery.needsStaticRedraw) {
      this.refreshStaticMap();
    }
    this.update(0);
    this.emit("open");
  }

  public hide(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    this.visible = false;
    this.emit("close");
  }

  public resetDiscovery(): void {
    this.discovery.reset();
    this.ui.updateHeader(undefined, 0);
  }

  /**
   * Discovers rooms, corridors, and objects along the player's line-of-sight.
   * Can be called continuously during gameplay tick so exploration happens in real-time.
   */
  public updateDiscovery(
    playerX: number,
    playerY: number,
    dirX: number,
    dirY: number,
    force: boolean = false
  ): void {
    const newlyDiscovered = this.discovery.update(
      this.dataSource,
      playerX,
      playerY,
      dirX,
      dirY,
      force
    );
    if (newlyDiscovered) {
      this.ui.updateHeader(undefined, this.discovery.getExplorationPercentage());
    }
  }

  /**
   * Re-renders the static terrain layer (discovered walls, floors, thin walls, and stairs).
   */
  public refreshStaticMap(): void {
    const mapW = this.dataSource.getMapWidth();
    const mapH = this.dataSource.getMapHeight();
    if (!mapW || !mapH) return;

    this.cachedMetrics = this.renderer.computeMetrics(
      mapW,
      mapH,
      this.ui.viewportW,
      this.ui.viewportH
    );

    this.renderer.drawStaticMap(
      this.ui.staticMapGraphic,
      this.ui.mapBgGraphic,
      this.dataSource,
      this.discovery,
      this.cachedMetrics,
      this.options.fogOfWar
    );

    const levelName = this.dataSource.getLevelName?.();
    const pct = this.discovery.getExplorationPercentage();
    this.ui.updateHeader(levelName, pct);

    this.discovery.needsStaticRedraw = false;
  }

  /**
   * Frame update loop: updates fog-of-war discovery and renders animated elements.
   */
  public update(delta: number): void {
    if (!this._isOpen) return;

    this.pulseTimer += delta * 0.05;
    const pulseAlpha = 0.5 + 0.5 * Math.sin(this.pulseTimer);

    const mapW = this.dataSource.getMapWidth();
    const mapH = this.dataSource.getMapHeight();
    if (!mapW || !mapH) return;

    // Update discovery from current player position
    const player = this.dataSource.getPlayer();
    if (player) {
      this.updateDiscovery(player.x, player.y, player.dirX, player.dirY);
    }

    // If new tiles were discovered, refresh static map representation
    if (this.discovery.needsStaticRedraw) {
      this.refreshStaticMap();
    }

    if (!this.cachedMetrics) {
      this.cachedMetrics = this.renderer.computeMetrics(
        mapW,
        mapH,
        this.ui.viewportW,
        this.ui.viewportH
      );
    }

    const hostileCount = this.renderer.drawDynamicMap(
      this.ui.dynamicMapGraphic,
      this.dataSource,
      this.discovery,
      this.cachedMetrics,
      this.options,
      pulseAlpha
    );

    this.ui.updateHeader(undefined, undefined, hostileCount);
  }

  public dispose(): void {
    this.ui.dispose();
    this.destroy({ children: true });
  }
}
