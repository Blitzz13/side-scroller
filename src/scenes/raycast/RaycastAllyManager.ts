import { Assets, Container, Graphics, MIPMAP_MODES, SCALE_MODES, Spritesheet } from "pixi.js";
import { sound } from "@pixi/sound";
import { RaycastAlly } from "./RaycastAlly";
import { TileMeta } from "./types";
import { extractTiledGidAndRotation, forEachTileInLayer } from "./tiledUtils";
import { AStarPathfinder, IAStarGrid } from "../../plugins/pathfinding";

export class RaycastAllyManager {
  private container: Container;
  private spritesheet: Spritesheet | null = null;
  public allies: RaycastAlly[] = [];
  public onAllySpawned?: (gridX: number, gridY: number) => void;
  public onAllyOpenDoor?: (cellX: number, cellY: number, allyX?: number, allyY?: number) => boolean;
  public onToast?: (message: string, color?: number, duration?: number) => void;
  private nextId: number = 1;

  // A* Pathfinder for allies
  private astar: AStarPathfinder | null = null;

  // Cached map references for LOS and interaction checks
  private cachedMapFlat?: Int32Array;
  private cachedMapWidth: number = 0;
  private cachedMapHeight: number = 0;
  private cachedDoorStatesFlat?: Float64Array;
  private cachedTileTypeFlags?: Uint8Array;
  private cachedThinWalls?: Array<{ x1: number; y1: number; x2: number; y2: number }>;

  constructor(container: Container) {
    this.container = container;
  }

  public async initSpritesheet(): Promise<void> {
    if (this.spritesheet) return;

    // 1. Ensure the underlying base texture is assets/raycast/enemies/prisoner.png
    const pngPath = "assets/raycast/enemies/prisoner.png";
    const pngCandidates = [
      pngPath,
      `./${pngPath}`,
      pngPath.replace(/^assets\//, "./assets/"),
      pngPath.replace(/^\.\//, ""),
    ];

    let baseTex: any = null;
    for (const p of pngCandidates) {
      if (Assets.cache.has(p)) {
        const res = Assets.get(p);
        baseTex = res.baseTexture || res;
        break;
      }
    }

    if (!baseTex) {
      for (const p of pngCandidates) {
        try {
          const res = await Assets.load(p);
          if (res) {
            baseTex = res.baseTexture || res;
            break;
          }
        } catch {}
      }
    }

    // 2. Load the spritesheet JSON
    const path = "assets/raycast/enemies/prisoner.json";
    const candidatePaths = [
      path,
      `./${path}`,
      path.replace(/^assets\//, "./assets/"),
      path.replace(/^\.\//, ""),
    ];

    let sheet: Spritesheet | null = null;
    for (const p of candidatePaths) {
      if (Assets.cache.has(p)) {
        sheet = Assets.get(p);
        break;
      }
    }

    if (!sheet) {
      for (const p of candidatePaths) {
        try {
          sheet = await Assets.load(p);
          if (sheet) break;
        } catch {}
      }
    }

    if (sheet) {
      if (baseTex && sheet.baseTexture !== baseTex) {
        sheet.baseTexture = baseTex;
      }
      if (sheet.baseTexture) {
        sheet.baseTexture.scaleMode = SCALE_MODES.NEAREST;
        sheet.baseTexture.mipmap = MIPMAP_MODES.OFF;
        sheet.baseTexture.update();
      }
      if (sheet.textures) {
        for (const k in sheet.textures) {
          const fTex = sheet.textures[k];
          if (fTex) {
            if (baseTex && fTex.baseTexture !== baseTex) {
              fTex.baseTexture = baseTex;
            }
            if (fTex.baseTexture) {
              fTex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
              fTex.baseTexture.mipmap = MIPMAP_MODES.OFF;
              fTex.baseTexture.update();
            }
          }
        }
      }
      this.spritesheet = sheet;
    }
  }

  public parseMapAllies(
    mapData: any,
    tileMeta: Record<number, TileMeta>,
    firstgid: number,
    offsetX: number = 0,
    offsetY: number = 0
  ): void {
    this.disposeAllies();
    this.allies = [];
    this.nextId = 1;

    const collectLayers = (layers: any[]): any[] => {
      let flat: any[] = [];
      for (const l of layers) {
        if (l.layers && Array.isArray(l.layers)) {
          flat = flat.concat(collectLayers(l.layers));
        } else {
          flat.push(l);
        }
      }
      return flat;
    };

    const allLayers = collectLayers(mapData.layers || []);

    const allyLayers = allLayers.filter((l: any) => {
      const name = (l.name || "").toLowerCase();
      return name.includes("allie") || name.includes("ally") || name.includes("prisoner") || name.includes("friend");
    });

    for (const layer of allyLayers) {
      if (layer.data || layer.chunks) {
        forEachTileInLayer(layer, (rawTileGid: number, tileX: number, tileY: number) => {
          if (rawTileGid === 0) return;

          const tileGid = rawTileGid & 0x1fffffff;
          const adjustedTileId = tileGid - firstgid;
          const meta = tileMeta[adjustedTileId] || {};
          const imgStr = (meta.image || "").toLowerCase();

          // Match prisoner tile or any ally in the allies layer
          const isPrisoner =
            imgStr.includes("prisoner") ||
            adjustedTileId === 54 ||
            tileGid === 55 ||
            (layer.name || "").toLowerCase().includes("allie");

          if (!isPrisoner) return;

          const { dirX, dirY } = extractTiledGidAndRotation(rawTileGid);
          const x = tileX + offsetX + 0.5;
          const y = tileY + offsetY + 0.5;

          this.spawnAlly(adjustedTileId, x, y, dirX, dirY);
          this.onAllySpawned?.(tileX + offsetX, tileY + offsetY);
        });
      } else if (layer.objects && Array.isArray(layer.objects)) {
        const tileW = mapData.tilewidth || 64;
        const tileH = mapData.tileheight || 64;

        layer.objects.forEach((obj: any) => {
          const rawGid = obj.gid ?? 0;
          if (rawGid === 0) return;

          const tileGid = rawGid & 0x1fffffff;
          const adjustedTileId = tileGid - firstgid;
          const meta = tileMeta[adjustedTileId] || {};
          const imgStr = (meta.image || "").toLowerCase();
          const nameStr = (obj.name || "").toLowerCase();

          if (imgStr.includes("prisoner") || nameStr.includes("prisoner") || adjustedTileId === 54) {
            const { dirX, dirY } = extractTiledGidAndRotation(rawGid);
            const objW = obj.width || tileW;
            const objH = obj.height || tileH;
            const x = (obj.x + objW / 2) / tileW + offsetX;
            const y = (obj.y - objH / 2) / tileH + offsetY;

            this.spawnAlly(adjustedTileId, x, y, dirX, dirY);
            this.onAllySpawned?.(Math.floor(x), Math.floor(y));
          }
        });
      }
    }
  }

  public spawnAlly(
    tileId: number,
    x: number,
    y: number,
    dirX: number = 0,
    dirY: number = 1
  ): RaycastAlly {
    const ally = new RaycastAlly(this.nextId++, tileId, x, y, dirX, dirY, this.spritesheet || undefined, {
      name: "Prisoner",
      scale: 0.7,
      referenceHeight: 69,
      hitRadius: 0.25,
      speed: 0.016,
    });

    if (ally.animatedSprite) {
      const mask = new Graphics();
      this.container.addChild(mask);
      this.container.addChild(ally.animatedSprite);
      ally.animatedSprite.mask = mask;
      ally.occlusionMask = mask;
    }

    this.allies.push(ally);
    return ally;
  }

  /**
   * Teleports following allies with the player when stairs are used.
   */
  public teleportFollowingAllies(
    playerX: number,
    playerY: number,
    dirX: number,
    dirY: number,
    mapFlat: Int32Array,
    mapWidth: number,
    mapHeight: number
  ): void {
    for (const ally of this.allies) {
      if (!ally.isFollowing) continue;

      const candidates = [
        { x: playerX - dirX * 1.4, y: playerY - dirY * 1.4 },
        { x: playerX - dirX * 1.0, y: playerY - dirY * 1.0 },
        { x: playerX - dirY * 1.2, y: playerY + dirX * 1.2 },
        { x: playerX + dirY * 1.2, y: playerY - dirX * 1.2 },
        { x: playerX - dirX * 0.6, y: playerY - dirY * 0.6 },
        { x: playerX, y: playerY },
      ];

      let chosen = candidates[0];
      for (const c of candidates) {
        const cx = Math.floor(c.x);
        const cy = Math.floor(c.y);
        if (cx >= 0 && cx < mapWidth && cy >= 0 && cy < mapHeight) {
          const idx = cy * mapWidth + cx;
          if (mapFlat[idx] === 0) {
            chosen = c;
            break;
          }
        }
      }

      ally.x = chosen.x;
      ally.y = chosen.y;
      ally.dirX = dirX;
      ally.dirY = dirY;
      ally.isMoving = false;
      ally.pathFollower.clear();
      ally.pathTargetX = -1;
      ally.pathTargetY = -1;
      ally.pathCooldown = 0;
      ally.stuckFrames = 0;
    }
  }

  /**
   * Quick line-of-sight check to ensure player cannot interact through walls or closed doors.
   */
  private hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    if (!this.cachedMapFlat || this.cachedMapWidth === 0 || this.cachedMapHeight === 0) return true;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.1) return true;

    const steps = Math.ceil(dist / 0.2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const cx = Math.floor(x1 + dx * t);
      const cy = Math.floor(y1 + dy * t);
      if (cx < 0 || cx >= this.cachedMapWidth || cy < 0 || cy >= this.cachedMapHeight) return false;
      const idx = cy * this.cachedMapWidth + cx;
      const isDoor =
        (this.cachedTileTypeFlags && this.cachedTileTypeFlags[idx] === 2) ||
        (this.cachedDoorStatesFlat && !Number.isNaN(this.cachedDoorStatesFlat[idx]));

      if (isDoor) {
        if (this.cachedDoorStatesFlat && Math.abs(this.cachedDoorStatesFlat[idx]) < 0.45) return false;
      } else if (this.cachedMapFlat[idx] !== 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Interacts with an ally when the player looks at him and presses "e/E".
   * Toggles following on and off with clear contextual dialog.
   */
  public tryInteractWithAlly(
    playerX: number,
    playerY: number,
    dirX: number,
    dirY: number
  ): boolean {
    const MAX_INTERACT_DIST = 1.8;
    const MIN_LOOK_DOT = 0.72;

    for (const ally of this.allies) {
      const dx = ally.x - playerX;
      const dy = ally.y - playerY;
      const dist = Math.hypot(dx, dy);

      if (dist > MAX_INTERACT_DIST) continue;

      const dot = (dx * dirX + dy * dirY) / dist;
      if (dot < MIN_LOOK_DOT) continue;

      if (!this.hasLineOfSight(playerX, playerY, ally.x, ally.y)) continue;

      const isNowFollowing = ally.toggleFollowing();
      try {
        sound.play("button_click", { volume: 0.5 });
      } catch {}

      if (isNowFollowing) {
        this.onToast?.("[+] Prisoner: 'Right behind you!'", 0x44ff44, 2.5);
      } else {
        this.onToast?.("[!] Prisoner: 'Holding position here.'", 0xffbb00, 2.5);
      }
      return true;
    }

    return false;
  }

  /**
   * Returns a HUD prompt string and theme color when the player is aiming at an ally.
   */
  public getInteractionPrompt(
    playerX: number,
    playerY: number,
    dirX: number,
    dirY: number
  ): { text: string; color: number } | null {
    const MAX_INTERACT_DIST = 1.8;
    const MIN_LOOK_DOT = 0.72;

    for (const ally of this.allies) {
      const dx = ally.x - playerX;
      const dy = ally.y - playerY;
      const dist = Math.hypot(dx, dy);

      if (dist > MAX_INTERACT_DIST) continue;

      const dot = (dx * dirX + dy * dirY) / dist;
      if (dot < MIN_LOOK_DOT) continue;

      if (!this.hasLineOfSight(playerX, playerY, ally.x, ally.y)) continue;

      if (ally.isFollowing) {
        return { text: "[E] COMMAND: WAIT HERE", color: 0x00e5ff };
      } else {
        return { text: "[E] COMMAND: FOLLOW ME", color: 0x44ff44 };
      }
    }

    return null;
  }

  /**
   * Updates navigation, following behavior, and door interaction for all allies.
   */
  public update(
    delta: number,
    playerX: number,
    playerY: number,
    mapFlat: Int32Array,
    mapWidth: number,
    mapHeight: number,
    doorStatesFlat: Float64Array,
    tileTypeFlags: Uint8Array,
    thinWalls: Array<{ x1: number; y1: number; x2: number; y2: number }>
  ): void {
    if (this.allies.length === 0) return;

    this.cachedMapFlat = mapFlat;
    this.cachedMapWidth = mapWidth;
    this.cachedMapHeight = mapHeight;
    this.cachedDoorStatesFlat = doorStatesFlat;
    this.cachedTileTypeFlags = tileTypeFlags;
    this.cachedThinWalls = thinWalls;

    const thinWallBlockedCells = new Set<number>();
    if (thinWalls && thinWalls.length > 0) {
      for (const wall of thinWalls) {
        const minCX = Math.max(0, Math.floor(Math.min(wall.x1, wall.x2)));
        const maxCX = Math.min(mapWidth - 1, Math.floor(Math.max(wall.x1, wall.x2) - 1e-4));
        const minCY = Math.max(0, Math.floor(Math.min(wall.y1, wall.y2)));
        const maxCY = Math.min(mapHeight - 1, Math.floor(Math.max(wall.y1, wall.y2) - 1e-4));
        for (let cy = minCY; cy <= maxCY; cy++) {
          for (let cx = minCX; cx <= maxCX; cx++) {
            thinWallBlockedCells.add(cy * mapWidth + cx);
          }
        }
      }
    }

    const isCellWalkable = (cx: number, cy: number): boolean => {
      if (cx < 0 || cx >= mapWidth || cy < 0 || cy >= mapHeight) return false;
      const idx = cy * mapWidth + cx;
      if (thinWallBlockedCells.has(idx)) return false;
      const isDoor =
        (tileTypeFlags && tileTypeFlags[idx] === 2) ||
        (doorStatesFlat && !Number.isNaN(doorStatesFlat[idx]) && doorStatesFlat[idx] !== undefined);
      if (isDoor) return true; // Allies can open doors along path
      return mapFlat[idx] === 0;
    };

    const astarGrid: IAStarGrid = {
      width: mapWidth,
      height: mapHeight,
      isWalkable: isCellWalkable,
    };

    if (!this.astar || this.astar.getGrid().width !== mapWidth || this.astar.getGrid().height !== mapHeight) {
      this.astar = new AStarPathfinder(astarGrid, {
        allowDiagonal: true,
        preventCornerCutting: true,
        heuristic: "octile",
        maxIterations: 4000,
      });
    } else {
      this.astar.setGrid(astarGrid);
    }

    for (const ally of this.allies) {
      ally.update(
        delta,
        playerX,
        playerY,
        mapFlat,
        mapWidth,
        mapHeight,
        doorStatesFlat,
        tileTypeFlags,
        thinWalls,
        this.astar,
        (cellX, cellY) => {
          if (this.onAllyOpenDoor) {
            return this.onAllyOpenDoor(cellX, cellY, ally.x, ally.y);
          }
          return false;
        }
      );
    }
  }

  /**
   * Renders allies in 3D with hardware billboard projection and per-column Z-buffer occlusion.
   */
  public render(
    playerX: number,
    playerY: number,
    dirX: number,
    dirY: number,
    planeX: number,
    planeY: number,
    zBuffer: Float64Array,
    maxRenderDistance: number,
    doorDistBuffer?: Float64Array,
    doorBottomBuffer?: Float64Array
  ): void {
    for (const ally of this.allies) {
      ally.render3D(
        playerX,
        playerY,
        dirX,
        dirY,
        planeX,
        planeY,
        zBuffer,
        maxRenderDistance,
        doorDistBuffer,
        doorBottomBuffer
      );
    }
  }

  private disposeAllies(): void {
    for (const ally of this.allies) {
      if (ally.animatedSprite) {
        this.container.removeChild(ally.animatedSprite);
      }
      if (ally.occlusionMask) {
        this.container.removeChild(ally.occlusionMask);
      }
      ally.dispose();
    }
    this.allies = [];
  }

  public clear(): void {
    this.disposeAllies();
  }

  public dispose(): void {
    this.disposeAllies();
    this.spritesheet = null;
    this.astar = null;
  }
}
