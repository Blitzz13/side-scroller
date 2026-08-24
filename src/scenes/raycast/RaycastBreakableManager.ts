import { Assets, Rectangle, SCALE_MODES, Texture } from "pixi.js";
import { sound } from "@pixi/sound";
import { MapObject, RaycastBreakable, TileMeta } from "./types";

export class RaycastBreakableManager {
  private breakables: RaycastBreakable[] = [];
  private brokenTextures: Record<string, Texture> = {};
  private brokenColumnTextures: Record<string, Texture[]> = {};
  private nextId: number = 1;

  public async initTextures(): Promise<void> {
    const assetsToLoad = [
      { key: "chair", path: "assets/chair_broken.png" },
      { key: "table", path: "assets/table_broken.png" },
    ];

    await Promise.all(
      assetsToLoad.map(async ({ key, path }) => {
        try {
          const tex = await Assets.load(path);
          if (tex) {
            if (tex.baseTexture) {
              tex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
            }
            this.brokenTextures[key] = tex;
            this.brokenColumnTextures[key] = this.sliceTexture(tex);
          }
        } catch (err) {
          console.warn(`Failed to load breakable texture ${path}:`, err);
        }
      })
    );
  }

  private sliceTexture(texture: Texture): Texture[] {
    const slices: Texture[] = [];
    const texW = texture.width || 64;
    const texH = texture.height || 64;
    for (let x = 0; x < texW; x++) {
      slices.push(
        new Texture(texture.baseTexture, new Rectangle(x, 0, 1, texH))
      );
    }
    return slices;
  }

  public parseMapBreakables(
    mapData: any,
    tileMeta: Record<number, TileMeta>,
    tileTypes: Record<number, string>,
    firstgid: number
  ): void {
    this.breakables = [];
    this.nextId = 1;

    // Identify which tile IDs map to chair and table
    const breakableTileMap: Record<number, "chair" | "table"> = {};

    if (mapData.tilesets) {
      mapData.tilesets.forEach((tileset: any) => {
        const fgid = tileset.firstgid ?? firstgid;
        if (tileset.tiles) {
          tileset.tiles.forEach((tile: any) => {
            const imgPath = (tile.image || "").toLowerCase();
            const typeStr = (tile.type || "").toLowerCase();
            if (imgPath.includes("chair") || typeStr.includes("chair")) {
              breakableTileMap[tile.id] = "chair";
            } else if (imgPath.includes("table") || typeStr.includes("table")) {
              breakableTileMap[tile.id] = "table";
            }
          });
        }
      });
    }

    const objectLayers = (mapData.layers || []).filter(
      (layer: any) =>
        layer.type === "objectgroup" ||
        (layer.name &&
          (layer.name.toLowerCase().includes("object") ||
            layer.name.toLowerCase().includes("prop") ||
            layer.name.toLowerCase().includes("decor") ||
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
          if (
            pName === "voffset" ||
            pName === "yoffset" ||
            pName === "offset" ||
            pName === "heightoffset"
          ) {
            layerVOffset = parseFloat(pVal);
          }
          if (
            pName === "z" ||
            pName === "elevation" ||
            pName === "altitude" ||
            pName === "height"
          ) {
            layerZ = parseFloat(pVal);
          }
          if (
            pName === "anchor" ||
            pName === "position" ||
            pName === "align" ||
            pName === "valign"
          ) {
            layerAnchor = String(pVal).toLowerCase();
          }
        });
      }

      if (layer.data) {
        // Tile Layer
        layer.data.forEach((tileGid: number, index: number) => {
          if (tileGid !== 0) {
            const adjustedTileId = tileGid - firstgid;
            const breakableType = breakableTileMap[adjustedTileId];
            if (breakableType) {
              const x = (index % layer.width) + 0.5;
              const y = Math.floor(index / layer.width) + 0.5;
              const meta = tileMeta[adjustedTileId] || {};
              this.spawnBreakable(
                breakableType,
                x,
                y,
                adjustedTileId,
                meta,
                layerScale,
                layerScaleX,
                layerScaleY,
                layerVOffset,
                layerZ,
                layerAnchor
              );
            }
          }
        });
      } else if (layer.objects) {
        // Object Layer
        const tileW = mapData.tilewidth || 64;
        const tileH = mapData.tileheight || 64;

        layer.objects.forEach((obj: any) => {
          const gid = obj.gid ?? 0;
          if (gid !== 0) {
            const adjustedTileId = gid - firstgid;
            const objName = (obj.name || "").toLowerCase();
            const breakableType =
              breakableTileMap[adjustedTileId] ||
              (objName.includes("chair") ? "chair" : objName.includes("table") ? "table" : undefined);

            if (breakableType) {
              const objW = obj.width || tileW;
              const objH = obj.height || tileH;
              const x = (obj.x + objW / 2) / tileW;
              const y = (obj.y - objH / 2) / tileH;
              const meta = tileMeta[adjustedTileId] || {};
              this.spawnBreakable(
                breakableType,
                x,
                y,
                adjustedTileId,
                meta,
                layerScale,
                layerScaleX,
                layerScaleY,
                layerVOffset,
                layerZ,
                layerAnchor
              );
            }
          }
        });
      }
    }
  }

  public spawnBreakable(
    type: "chair" | "table",
    x: number,
    y: number,
    intactTextureId: number,
    meta: TileMeta = {},
    layerScale?: number,
    layerScaleX?: number,
    layerScaleY?: number,
    layerVOffset?: number,
    layerZ?: number,
    layerAnchor?: string
  ): RaycastBreakable {
    const isTable = type === "table";
    const scale = layerScale ?? meta.scale ?? (isTable ? 0.38 : 0.30);
    const scaleX = layerScaleX ?? meta.scaleX ?? scale;
    const scaleY = layerScaleY ?? meta.scaleY ?? scale;
    const vOffset = layerVOffset ?? meta.vOffset;
    const z = layerZ ?? meta.z;
    const anchor = layerAnchor ?? meta.anchor ?? "floor";

    const breakable: RaycastBreakable = {
      id: this.nextId++,
      x,
      y,
      type,
      name: isTable ? "Table" : "Chair",
      health: 1,
      maxHealth: 1,
      isBroken: false,
      intactTextureId,
      scale,
      scaleX,
      scaleY,
      vOffset,
      z,
      anchor,
      hitRadius: isTable ? 0.5 : 0.35,
      blocksMovement: true,
    };
    this.breakables.push(breakable);
    return breakable;
  }

  public getVisibleMapObjects(): MapObject[] {
    const list: MapObject[] = [];
    for (const b of this.breakables) {
      if (b.isBroken) {
        const customTex = this.brokenTextures[b.type];
        const customSlices = this.brokenColumnTextures[b.type];
        list.push({
          x: b.x,
          y: b.y,
          texture: b.intactTextureId,
          customTexture: customTex,
          customSlices: customSlices,
          scale: b.scale,
          scaleX: b.scaleX,
          scaleY: b.scaleY,
          vOffset: b.vOffset,
          z: b.z,
          anchor: "floor",
        });
      } else {
        list.push({
          x: b.x,
          y: b.y,
          texture: b.intactTextureId,
          scale: b.scale,
          scaleX: b.scaleX,
          scaleY: b.scaleY,
          vOffset: b.vOffset,
          z: b.z,
          anchor: b.anchor ?? "floor",
        });
      }
    }
    return list;
  }

  public getBreakables(): RaycastBreakable[] {
    return this.breakables;
  }

  public checkCollision(newX: number, newY: number, playerRadius: number = 0.25): boolean {
    for (const b of this.breakables) {
      if (!b.isBroken && b.blocksMovement) {
        const dx = newX - b.x;
        const dy = newY - b.y;
        const distSq = dx * dx + dy * dy;
        const minDist = b.hitRadius * 0.7 + playerRadius;
        if (distSq < minDist * minDist) {
          return true; // Collision with solid unbroken furniture
        }
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
  ): { breakable: RaycastBreakable; distance: number } | null {
    let closestBreakable: RaycastBreakable | null = null;
    let closestDist = maxDistance;

    for (const b of this.breakables) {
      if (b.isBroken) continue; // Bullets pass through broken debris

      const dx = b.x - playerX;
      const dy = b.y - playerY;
      const t = dx * dirX + dy * dirY;

      if (t > 0.1 && t < closestDist) {
        const perpDist = Math.abs(dx * -dirY + dy * dirX);
        if (perpDist <= b.hitRadius) {
          closestDist = t;
          closestBreakable = b;
        }
      }
    }

    if (closestBreakable) {
      return { breakable: closestBreakable, distance: closestDist };
    }
    return null;
  }

  public damageBreakable(
    breakable: RaycastBreakable,
    damage: number,
    onBroken?: (b: RaycastBreakable) => void
  ): boolean {
    if (breakable.isBroken) return false;

    breakable.health = Math.max(0, breakable.health - damage);
    if (breakable.health <= 0) {
      breakable.isBroken = true;
      breakable.blocksMovement = false;

      // Play break/explosion sound effect
      try {
        sound.play("explosion_sound", { volume: 0.35 });
      } catch (e) {
        console.warn("Failed to play break sound:", e);
      }

      if (onBroken) {
        onBroken(breakable);
      }
      return true;
    }
    return false;
  }

  public dispose(): void {
    this.breakables = [];
    for (const slices of Object.values(this.brokenColumnTextures)) {
      for (const tex of slices) {
        tex.destroy(false);
      }
    }
    this.brokenColumnTextures = {};
    for (const tex of Object.values(this.brokenTextures)) {
      tex.destroy(false);
    }
    this.brokenTextures = {};
  }
}
