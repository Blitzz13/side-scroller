import { Assets, Container, Graphics, SCALE_MODES, Spritesheet } from "pixi.js";
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
};

export class RaycastStationaryObjectManager {
  private container: Container;
  private spritesheets: Record<string, Spritesheet> = {};
  public objects: RaycastStationaryObject[] = [];
  private nextId: number = 1;

  constructor(container: Container) {
    this.container = container;
  }

  public async initSpritesheets(): Promise<void> {
    for (const cfg of Object.values(STATIONARY_OBJECT_REGISTRY)) {
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
      }
      if (sheet.textures) {
        for (const k in sheet.textures) {
          const fTex = sheet.textures[k];
          if (fTex && fTex.baseTexture) {
            fTex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
          }
        }
      }
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

    const objectLayers = allLayers.filter(
      (layer: any) =>
        layer.type === "objectgroup" ||
        (layer.name &&
          (layer.name.toLowerCase().includes("object") ||
            layer.name.toLowerCase().includes("decor") ||
            layer.name.toLowerCase().includes("prop") ||
            layer.name.toLowerCase().includes("furniture") ||
            layer.name.toLowerCase().includes("item")))
    );

    for (const layer of objectLayers) {
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

          const options: StationaryObjectOptions = {
            scale: layerScale ?? meta.scale ?? matchedConfig.scale,
            scaleX: layerScaleX ?? meta.scaleX,
            scaleY: layerScaleY ?? meta.scaleY,
            vOffset: layerVOffset ?? meta.vOffset ?? 0,
            z: layerZ ?? meta.z,
            anchor: layerAnchor ?? (meta.anchor as string) ?? "floor",
            referenceHeight: matchedConfig.referenceHeight,
            hitRadius: matchedConfig.hitRadius,
            blocksMovement: matchedConfig.blocksMovement,
          };

          this.spawnObject(matchedConfig.name, adjustedTileId, x, y, dirX, dirY, options);
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

          const options: StationaryObjectOptions = {
            scale: objScale ?? matchedConfig.scale,
            scaleX: objScaleX,
            scaleY: objScaleY,
            vOffset: objVOffset ?? 0,
            z: objZ,
            anchor: objAnchor ?? "floor",
            referenceHeight: matchedConfig.referenceHeight,
            hitRadius: matchedConfig.hitRadius,
            blocksMovement: matchedConfig.blocksMovement,
          };

          this.spawnObject(matchedConfig.name, adjustedTileId, x, y, dirX, dirY, options);
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
    const sheet = this.spritesheets[name] || this.spritesheets[`assets/raycast/decorations/${name}.json`];
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
