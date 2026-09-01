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
      { key: "power_cell", path: "assets/power_cell_broken.PNG" },
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

    // Identify which tile IDs map to chair, table, or power_cell
    const breakableTileMap: Record<number, "chair" | "table" | "power_cell"> = {};

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
            } else if (
              imgPath.includes("power_cell") ||
              imgPath.includes("powercell") ||
              typeStr.includes("power_cell") ||
              typeStr.includes("powercell")
            ) {
              breakableTileMap[tile.id] = "power_cell";
            }
          });
        }
      });
    }

    const objectLayers = (mapData.layers || []).filter(
      (layer: any) =>
        (layer.type === "objectgroup" ||
          (layer.name &&
            (layer.name.toLowerCase().includes("object") ||
              layer.name.toLowerCase().includes("prop") ||
              layer.name.toLowerCase().includes("decor") ||
              layer.name.toLowerCase().includes("furniture") ||
              layer.name.toLowerCase().includes("item")))) &&
        !(layer.name &&
          (layer.name.toLowerCase().includes("doorprotector") ||
            layer.name.toLowerCase().includes("destructablewall")))
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
                layerAnchor,
                undefined,
                undefined
              );
            }
          }
        });
      } else if (layer.objects) {
        // Object Layer
        const tileW = mapData.tilewidth || 64;
        const tileH = mapData.tileheight || 64;

        layer.objects.forEach((obj: any) => {
          if (
            obj.type === "DestructableWall" ||
            (obj.type || "").toLowerCase().includes("destructablewall")
          ) {
            return; // Handled by DestructableWallManager
          }

          const gid = obj.gid ?? 0;
          if (gid !== 0) {
            const adjustedTileId = gid - firstgid;
            const objName = (obj.name || "").toLowerCase();
            const objType = (obj.type || "").toLowerCase();
            const meta = tileMeta[adjustedTileId] || {};
            const imgStr = (meta.image || "").toLowerCase();

            let breakableType: "chair" | "table" | "power_cell" | undefined =
              breakableTileMap[adjustedTileId];

            if (!breakableType) {
              if (
                objName.includes("chair") ||
                objType === "chair" ||
                imgStr.includes("chair")
              ) {
                breakableType = "chair";
              } else if (
                (objName.includes("table") ||
                  objType === "table" ||
                  imgStr.includes("table")) &&
                !objType.includes("destructable")
              ) {
                breakableType = "table";
              } else if (
                objName.includes("power_cell") ||
                objName.includes("powercell") ||
                objType.includes("power_cell") ||
                objType.includes("powercell") ||
                imgStr.includes("power_cell") ||
                imgStr.includes("powercell")
              ) {
                breakableType = "power_cell";
              }
            }

            if (breakableType) {
              let objScale = layerScale ?? meta.scale;
              let objScaleX = layerScaleX ?? meta.scaleX;
              let objScaleY = layerScaleY ?? meta.scaleY;
              let objVOffset = layerVOffset ?? meta.vOffset;
              let objZ = layerZ ?? meta.z;
              let objAnchor = layerAnchor ?? meta.anchor;
              let linkId: string | undefined;

              if (obj.properties) {
                obj.properties.forEach((prop: any) => {
                  const pName = prop.name.toLowerCase();
                  const pVal = prop.value;
                  if (pName === "scale" || pName === "size") objScale = parseFloat(pVal);
                  if (pName === "scalex" || pName === "sizex") objScaleX = parseFloat(pVal);
                  if (pName === "scaley" || pName === "sizey") objScaleY = parseFloat(pVal);
                  if (pName === "voffset" || pName === "yoffset" || pName === "offset") {
                    objVOffset = parseFloat(pVal);
                  }
                  if (pName === "z" || pName === "elevation" || pName === "height") {
                    objZ = parseFloat(pVal);
                  }
                  if (pName === "anchor" || pName === "align") {
                    objAnchor = String(pVal).toLowerCase();
                  }
                  if (pName === "linkid" || pName === "link" || pName === "id") {
                    linkId = String(pVal);
                  }
                });
              }

              const objW = obj.width || tileW;
              const objH = obj.height || tileH;
              const x = (obj.x + objW / 2) / tileW;
              const y = (obj.y - objH / 2) / tileH;

              this.spawnBreakable(
                breakableType,
                x,
                y,
                adjustedTileId,
                meta,
                objScale,
                objScaleX,
                objScaleY,
                objVOffset,
                objZ,
                objAnchor,
                obj.id,
                linkId
              );
            }
          }
        });
      }
    }
  }

  public spawnBreakable(
    type: "chair" | "table" | "power_cell" | string,
    x: number,
    y: number,
    intactTextureId: number,
    meta: TileMeta = {},
    layerScale?: number,
    layerScaleX?: number,
    layerScaleY?: number,
    layerVOffset?: number,
    layerZ?: number,
    layerAnchor?: string,
    objId?: number,
    linkId?: string
  ): RaycastBreakable {
    const isTable = type === "table";
    const isPowerCell = type === "power_cell" || type.includes("power_cell") || type.includes("powercell");

    const defaultScale = isTable ? 0.38 : isPowerCell ? 0.38 : 0.30;
    const scale = layerScale ?? meta.scale ?? defaultScale;
    const scaleX = layerScaleX ?? meta.scaleX ?? scale;
    const scaleY = layerScaleY ?? meta.scaleY ?? scale;
    const vOffset = layerVOffset ?? meta.vOffset;
    const z = layerZ ?? meta.z;
    const anchor = layerAnchor ?? meta.anchor ?? "floor";

    const name = isPowerCell ? "Power Cell" : isTable ? "Table" : "Chair";
    const hitRadius = isTable ? 0.5 : isPowerCell ? 0.45 : 0.35;

    const breakable: RaycastBreakable = {
      id: this.nextId++,
      objId,
      tileId: intactTextureId,
      linkId,
      x,
      y,
      type,
      name,
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
      hitRadius,
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
          return true; // Collision with solid unbroken furniture / power cells
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

  public applyAreaDamage(
    centerX: number,
    centerY: number,
    radius: number,
    maxDamage: number,
    onBroken?: (b: RaycastBreakable) => void
  ): RaycastBreakable[] {
    const brokenList: RaycastBreakable[] = [];
    for (const b of this.breakables) {
      if (b.isBroken) continue;
      const dx = b.x - centerX;
      const dy = b.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        const falloff = 1 - dist / radius;
        const damage = Math.max(20, Math.round(maxDamage * falloff));
        const broke = this.damageBreakable(b, damage, onBroken);
        if (broke) {
          brokenList.push(b);
        }
      }
    }
    return brokenList;
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
