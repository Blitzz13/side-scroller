import { Assets, Container, Graphics, MIPMAP_MODES, SCALE_MODES, Spritesheet } from "pixi.js";
import { RaycastStationaryObject, StationaryObjectOptions } from "./RaycastStationaryObject";
import { TileMeta } from "./types";
import { extractTiledGidAndRotation, forEachTileInLayer } from "./tiledUtils";

export interface StationaryObjectConfig {
  name: string;
  spritesheet: string;
  scale?: number;
  referenceHeight?: number;
  hitRadius?: number;
  blocksMovement?: boolean;
}

export const STATIONARY_OBJECT_REGISTRY: Record<string, StationaryObjectConfig> = {
  isb_holotable: {
    name: "isb_holotable",
    spritesheet: "assets/raycast/decorations/isb_holotable.json",
    scale: 1,
    referenceHeight: 220,
    hitRadius: 0.45,
    blocksMovement: true,
  },
  at_st: {
    name: "at_st",
    spritesheet: "assets/raycast/decorations/at_st.json",
    scale: 2.3,
    referenceHeight: 1615,
    hitRadius: 0.65,
    blocksMovement: true,
  },
  tie_fighter: {
    name: "tie_fighter",
    spritesheet: "assets/raycast/decorations/tie_fighter.json",
    scale: 1.8,
    referenceHeight: 656,
    hitRadius: 0.68,
    blocksMovement: true,
  },
  tie_bomber: {
    name: "tie_bomber",
    spritesheet: "assets/raycast/decorations/tie_bomber.json",
    scale: 1.8,
    referenceHeight: 670,
    hitRadius: 0.85,
    blocksMovement: true,
  },
  at_at: {
    name: "at_at",
    spritesheet: "assets/at_at.json",
    scale: 3.5,
    referenceHeight: 262,
    hitRadius: 1.25,
    blocksMovement: true,
  },
};

export class RaycastStationaryObjectManager {
  private container: Container;
  private spritesheets: Record<string, Spritesheet> = {};
  public objects: RaycastStationaryObject[] = [];
  public onObjectSpawned?: (gridX: number, gridY: number) => void;
  private nextId: number = 1;

  constructor(container: Container) {
    this.container = container;
  }

  public async initSpritesheets(
    mapData?: any,
    tileMeta?: Record<number, TileMeta>,
    firstgid: number = 1
  ): Promise<void> {
    let configs = Object.values(STATIONARY_OBJECT_REGISTRY);
    if (mapData && tileMeta) {
      // Only load spritesheets for stationary objects present in this map
      const needed = new Set<StationaryObjectConfig>();
      const scan = (layers: any[]) => {
        for (const layer of layers || []) {
          if (Array.isArray(layer.layers)) scan(layer.layers);
          if (layer.data || layer.chunks) {
            forEachTileInLayer(layer, (rawGid: number) => {
              if (rawGid === 0) return;
              const meta = tileMeta[(rawGid & 0x1fffffff) - firstgid] || {};
              const cfg = this.matchStationaryConfig(
                (meta.image || "").toLowerCase(),
                (meta.type || "").toLowerCase()
              );
              if (cfg) needed.add(cfg);
            });
          } else if (Array.isArray(layer.objects)) {
            for (const obj of layer.objects) {
              const rawGid = obj.gid ?? 0;
              if (rawGid === 0) continue;
              const meta = tileMeta[(rawGid & 0x1fffffff) - firstgid] || {};
              const cfg = this.matchStationaryConfig(
                (meta.image || "").toLowerCase(),
                (obj.type || meta.type || "").toLowerCase(),
                (obj.name || "").toLowerCase()
              );
              if (cfg) needed.add(cfg);
            }
          }
        }
      };
      scan(mapData.layers);
      configs = Array.from(needed);
    }
    for (const cfg of configs) {
      await this.loadSpritesheet(cfg.spritesheet, cfg.name);
    }
  }


  private async loadSpritesheet(path: string, alias: string): Promise<void> {
    if (this.spritesheets[alias] || this.spritesheets[path]) return;

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
      if (sheet.baseTexture) {
        sheet.baseTexture.scaleMode = SCALE_MODES.NEAREST;
        sheet.baseTexture.mipmap = MIPMAP_MODES.OFF;
        sheet.baseTexture.update();
      }
      // Frames share the spritesheet baseTexture; it was uploaded once above
      this.spritesheets[alias] = sheet;
      this.spritesheets[path] = sheet;
    }
  }

  public parseMapObjects(
    mapData: any,
    tileMeta: Record<number, TileMeta>,
    firstgid: number,
    offsetX: number = 0,
    offsetY: number = 0
  ): void {
    this.disposeObjects();
    this.objects = [];
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

    const layersToScan = allLayers;

    for (const layer of layersToScan) {
      let layerScale: number | undefined;
      let layerScaleX: number | undefined;
      let layerScaleY: number | undefined;
      let layerVOffset: number | undefined;
      let layerZ: number | undefined;
      let layerAnchor: string | undefined;

      if (layer.properties) {
        layer.properties.forEach((prop: any) => {
          const pName = prop.name.toLowerCase();
          const pVal = prop.value;
          if (pName === "scale" || pName === "size") layerScale = parseFloat(pVal);
          if (pName === "scalex" || pName === "sizex") layerScaleX = parseFloat(pVal);
          if (pName === "scaley" || pName === "sizey") layerScaleY = parseFloat(pVal);
          if (pName === "voffset" || pName === "yoffset" || pName === "offset") {
            layerVOffset = parseFloat(pVal);
          }
          if (pName === "z" || pName === "elevation" || pName === "height") {
            layerZ = parseFloat(pVal);
          }
          if (pName === "anchor" || pName === "align") {
            layerAnchor = String(pVal).toLowerCase();
          }
        });
      }

      if (layer.data || layer.chunks) {
        // Tile layer (flat array or chunks)
        forEachTileInLayer(layer, (rawTileGid: number, tileX: number, tileY: number) => {
          if (rawTileGid === 0) return;

          const tileGid = rawTileGid & 0x1fffffff;
          const adjustedTileId = tileGid - firstgid;
          const meta = tileMeta[adjustedTileId] || {};
          const imgStr = (meta.image || "").toLowerCase();
          const typeStr = (meta.type || "").toLowerCase();

          const matchedConfig = this.matchStationaryConfig(imgStr, typeStr);
          if (!matchedConfig) return;

          const { dirX, dirY } = extractTiledGidAndRotation(rawTileGid);
          const x = tileX + offsetX + 0.5;
          const y = tileY + offsetY + 0.5;

          const finalScale = layerScale ?? meta.scale ?? matchedConfig.scale;
          const scaleMultiplier =
            matchedConfig.scale && finalScale ? finalScale / matchedConfig.scale : 1;

          const options: StationaryObjectOptions = {
            scale: finalScale,
            scaleX: layerScaleX ?? meta.scaleX,
            scaleY: layerScaleY ?? meta.scaleY,
            vOffset: layerVOffset ?? meta.vOffset ?? 0,
            z: layerZ ?? meta.z,
            anchor: layerAnchor ?? (meta.anchor as string) ?? "floor",
            referenceHeight: matchedConfig.referenceHeight,
            hitRadius: (matchedConfig.hitRadius ?? 0.45) * scaleMultiplier,
            blocksMovement: matchedConfig.blocksMovement,
          };

          this.spawnObject(matchedConfig.name, adjustedTileId, x, y, dirX, dirY, options);
          this.onObjectSpawned?.(tileX + offsetX, tileY + offsetY);
        });
      } else if (layer.objects && Array.isArray(layer.objects)) {
        // Object layer
        const tileW = mapData.tilewidth || 64;
        const tileH = mapData.tileheight || 64;

        layer.objects.forEach((obj: any) => {
          const rawGid = obj.gid ?? 0;
          if (rawGid === 0) return;

          const tileGid = rawGid & 0x1fffffff;
          const adjustedTileId = tileGid - firstgid;
          const meta = tileMeta[adjustedTileId] || {};
          const imgStr = (meta.image || "").toLowerCase();
          const typeStr = (obj.type || meta.type || "").toLowerCase();
          const nameStr = (obj.name || "").toLowerCase();

          const matchedConfig = this.matchStationaryConfig(imgStr, typeStr, nameStr);
          if (!matchedConfig) return;

          const { dirX, dirY } = extractTiledGidAndRotation(rawGid);
          const objW = obj.width || tileW;
          const objH = obj.height || tileH;
          const x = (obj.x + objW / 2) / tileW + offsetX;
          const y = (obj.y - objH / 2) / tileH + offsetY;

          let objScale = layerScale ?? meta.scale;
          let objScaleX = layerScaleX ?? meta.scaleX;
          let objScaleY = layerScaleY ?? meta.scaleY;
          let objVOffset = layerVOffset ?? meta.vOffset;
          let objZ = layerZ ?? meta.z;
          let objAnchor = layerAnchor ?? (meta.anchor as string);

          if (obj.properties) {
            obj.properties.forEach((prop: any) => {
              const pName = prop.name.toLowerCase();
              const pVal = prop.value;
              if (pName === "scale" || pName === "size") objScale = parseFloat(pVal);
              if (pName === "scalex" || pName === "sizex") objScaleX = parseFloat(pVal);
              if (pName === "scaley" || pName === "sizey") objScaleY = parseFloat(pVal);
              if (pName === "voffset" || pName === "offset") objVOffset = parseFloat(pVal);
              if (pName === "z" || pName === "elevation") objZ = parseFloat(pVal);
              if (pName === "anchor") objAnchor = String(pVal).toLowerCase();
            });
          }

          const finalObjScale = objScale ?? matchedConfig.scale;
          const scaleMultiplier =
            matchedConfig.scale && finalObjScale ? finalObjScale / matchedConfig.scale : 1;

          const options: StationaryObjectOptions = {
            scale: finalObjScale,
            scaleX: objScaleX,
            scaleY: objScaleY,
            vOffset: objVOffset ?? 0,
            z: objZ,
            anchor: objAnchor ?? "floor",
            referenceHeight: matchedConfig.referenceHeight,
            hitRadius: (matchedConfig.hitRadius ?? 0.45) * scaleMultiplier,
            blocksMovement: matchedConfig.blocksMovement,
          };

          this.spawnObject(matchedConfig.name, adjustedTileId, x, y, dirX, dirY, options);
          this.onObjectSpawned?.(Math.floor(x), Math.floor(y));
        });
      }
    }
  }

  private matchStationaryConfig(
    imgStr: string,
    typeStr: string = "",
    nameStr: string = ""
  ): StationaryObjectConfig | null {
    if (
      imgStr.includes("isb_holotable") ||
      imgStr.includes("holotable") ||
      typeStr.includes("isb_holotable") ||
      typeStr.includes("holotable") ||
      nameStr.includes("isb_holotable") ||
      nameStr.includes("holotable")
    ) {
      return STATIONARY_OBJECT_REGISTRY.isb_holotable;
    }
    if (
      imgStr.includes("at_at") ||
      imgStr.includes("atat") ||
      typeStr.includes("at_at") ||
      typeStr.includes("atat") ||
      nameStr.includes("at_at") ||
      nameStr.includes("atat")
    ) {
      return STATIONARY_OBJECT_REGISTRY.at_at;
    }
    if (
      imgStr.includes("at_st") ||
      imgStr.includes("atst") ||
      typeStr.includes("at_st") ||
      typeStr.includes("atst") ||
      nameStr.includes("at_st") ||
      nameStr.includes("atst")
    ) {
      return STATIONARY_OBJECT_REGISTRY.at_st;
    }
    if (
      imgStr.includes("tie_bomber") ||
      imgStr.includes("bomber") ||
      typeStr.includes("tie_bomber") ||
      typeStr.includes("bomber") ||
      nameStr.includes("tie_bomber") ||
      nameStr.includes("bomber")
    ) {
      return STATIONARY_OBJECT_REGISTRY.tie_bomber;
    }
    if (
      imgStr.includes("tie_fighter") ||
      imgStr.includes("tie") ||
      imgStr.includes("fighter") ||
      typeStr.includes("tie_fighter") ||
      typeStr.includes("fighter") ||
      nameStr.includes("tie_fighter") ||
      nameStr.includes("fighter")
    ) {
      return STATIONARY_OBJECT_REGISTRY.tie_fighter;
    }
    return null;
  }

  public spawnObject(
    name: string,
    tileId: number,
    x: number,
    y: number,
    dirX: number = 0,
    dirY: number = 1,
    options?: StationaryObjectOptions
  ): RaycastStationaryObject {
    const regCfg = STATIONARY_OBJECT_REGISTRY[name];
    const sheet =
      this.spritesheets[name] ||
      this.spritesheets[`assets/raycast/decorations/${name}.json`] ||
      (regCfg ? this.spritesheets[regCfg.spritesheet] : undefined);
    const obj = new RaycastStationaryObject(
      this.nextId++,
      name,
      tileId,
      x,
      y,
      dirX,
      dirY,
      sheet,
      options
    );

    if (obj.animatedSprite) {
      const mask = new Graphics();
      this.container.addChild(mask);
      this.container.addChild(obj.animatedSprite);
      obj.animatedSprite.mask = mask;
      obj.occlusionMask = mask;
    }

    this.objects.push(obj);
    return obj;
  }

  public checkCollision(newX: number, newY: number, playerRadius: number = 0.28): boolean {
    for (const obj of this.objects) {
      if (!obj.blocksMovement) continue;
      const dx = newX - obj.x;
      const dy = newY - obj.y;
      const distSq = dx * dx + dy * dy;
      const minDist = obj.hitRadius + playerRadius;
      if (distSq < minDist * minDist) {
        return true;
      }
    }
    return false;
  }

  public findClosestHit(
    playerX: number,
    playerY: number,
    dirX: number,
    dirY: number,
    maxDistance: number
  ): { object: RaycastStationaryObject; distance: number } | null {
    let closest: RaycastStationaryObject | null = null;
    let closestDist = maxDistance;

    for (const obj of this.objects) {
      const dx = obj.x - playerX;
      const dy = obj.y - playerY;
      const t = dx * dirX + dy * dirY;
      if (t > 0.1 && t < closestDist) {
        const perpDist = Math.abs(dx * -dirY + dy * dirX);
        if (perpDist <= obj.hitRadius) {
          closestDist = t;
          closest = obj;
        }
      }
    }

    if (closest) {
      return { object: closest, distance: closestDist };
    }
    return null;
  }

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
    for (const obj of this.objects) {
      obj.render3D(
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

  private disposeObjects(): void {
    for (const obj of this.objects) {
      if (obj.animatedSprite) {
        this.container.removeChild(obj.animatedSprite);
      }
      if (obj.occlusionMask) {
        this.container.removeChild(obj.occlusionMask);
      }
      obj.dispose();
    }
    this.objects = [];
  }

  public clear(): void {
    this.disposeObjects();
  }

  public dispose(): void {
    this.disposeObjects();
  }
}
