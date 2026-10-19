import { DestructableWall } from "./DestructableWall";
import { RaycastBreakable, ThinWallDescriptor } from "./types";

export class DestructableWallManager {
  private walls: DestructableWall[] = [];
  public onWallDeactivated?: (wall: DestructableWall) => void;

  /**
   * Parses all DestructableWall objects from the DoorProtectors layer or any object layers in Tiled mapData.
   */
  public parseMapDoorProtectors(
    mapData: any,
    firstgid: number = 1,
    offsetX: number = 0,
    offsetY: number = 0
  ): void {
    this.walls = [];

    const tileW = mapData.tilewidth || 64;
    const tileH = mapData.tileheight || 64;

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

    const allObjectLayers = allLayers.filter(
      (l: any) => l.type === "objectgroup" || l.objects
    );

    const processedObjIds = new Set<number>();

    const parseObject = (obj: any, layer: any) => {
      if (processedObjIds.has(obj.id)) return;
      const layerName = (layer.name || "").toLowerCase();
      const objType = (obj.type || "").toLowerCase();

      // Skip solid DestructableWalls layers (handled as solid blocks by RaycastBreakableManager)
      if (
        (layerName.includes("destructablewall") ||
          layerName.includes("destructiblewall") ||
          layerName.includes("destructable wall") ||
          layerName.includes("destructible wall")) &&
        !layerName.includes("door") &&
        !layerName.includes("protector") &&
        !layerName.includes("barrier")
      ) {
        return;
      }

      const isDestructable =
        objType === "destructablewall" ||
        obj.type === "DestructableWall" ||
        layerName.includes("doorprotector") ||
        layerName.includes("protector") ||
        layerName.includes("barrier");

      if (!isDestructable) return;
      processedObjIds.add(obj.id);

      const rawGid = obj.gid ?? 0;
      const gid = rawGid & 0x1FFFFFFF;
      const adjustedTileId = gid !== 0 ? gid - firstgid : 1; // Default to fence texture if not set

      // Resolve grid cell (gx, gy)
      const objW = obj.width || tileW;
      const objH = obj.height || tileH;
      // In Tiled tile objects with gid, the y coordinate is at bottom-left
      const objCenterX = obj.x + objW * 0.5;
      const objCenterY = gid !== 0 ? obj.y - objH * 0.5 : obj.y + objH * 0.5;

      const gridX = Math.floor(objCenterX / tileW) + offsetX;
      const gridY = Math.floor(objCenterY / tileH) + offsetY;

      let align = "center";
      let rotation = "";
      let offset = 0;
      let linkIds: any = [];
      let isEnabling = false;
      let isObjective = false;
      let objectiveKey = "";

      // Extract custom properties from object and layer
      const allProps = [...(layer.properties || []), ...(obj.properties || [])];
      for (const prop of allProps) {
        const pName = prop.name.toLowerCase();
        const pVal = prop.value;
        if (
          pName === "align" ||
          pName === "alignment" ||
          pName === "valign" ||
          pName === "halign"
        ) {
          align = String(pVal);
        } else if (
          pName === "rotation" ||
          pName === "orientation" ||
          pName === "rot"
        ) {
          rotation = String(pVal);
        } else if (
          pName === "offset" ||
          pName === "offsetx" ||
          pName === "offsety" ||
          pName === "voffset" ||
          pName === "hoffset"
        ) {
          offset = typeof pVal === "number" ? pVal : parseFloat(pVal) || 0;
        } else if (
          pName === "link" &&
          typeof pVal === "object" &&
          pVal !== null
        ) {
          if (pVal.action !== undefined) {
            if (String(pVal.action).toLowerCase() === "enable") isEnabling = true;
            else if (String(pVal.action).toLowerCase() === "disable") isEnabling = false;
          }
          if (pVal.linkIds !== undefined) {
            linkIds = pVal.linkIds;
          }
        } else if (
          pName === "linkid" ||
          pName === "linkids" ||
          pName === "linkedid" ||
          pName === "linkedids" ||
          pName === "link" ||
          pName === "links" ||
          pName === "targetid" ||
          pName === "targetids"
        ) {
          linkIds = pVal;
        } else if (pName === "isenabling") {
          isEnabling = Boolean(pVal);
        } else if (pName === "objective" && typeof pVal === "object" && pVal !== null) {
          if (pVal.isObjective !== undefined) isObjective = Boolean(pVal.isObjective);
          if (pVal.objectiveKey !== undefined) objectiveKey = String(pVal.objectiveKey).trim();
        } else if (pName === "isobjective") {
          isObjective = Boolean(pVal);
        } else if (pName === "objectivekey") {
          objectiveKey = String(pVal).trim();
        }
      }

      // If rotation is not explicitly set and align is center/-, infer orientation from neighboring Walls tiles
      const normAlign = align.toLowerCase().trim();
      const normRot = rotation.toLowerCase().trim();
      if (
        (!normRot || normRot === "-") &&
        (normAlign === "center" || normAlign === "middle" || normAlign === "-" || normAlign === "")
      ) {
        const rawTileX = Math.floor(objCenterX / tileW);
        const rawTileY = Math.floor(objCenterY / tileH);
        const hasWallAt = (tx: number, ty: number): boolean => {
          for (const l of allLayers) {
            const lName = (l.name || "").toLowerCase();
            if (lName !== "walls" && lName !== "wall") continue;
            if (l.chunks && Array.isArray(l.chunks)) {
              for (const c of l.chunks) {
                if (tx >= c.x && tx < c.x + c.width && ty >= c.y && ty < c.y + c.height) {
                  if ((c.data[(ty - c.y) * c.width + (tx - c.x)] & 0x1fffffff) !== 0) return true;
                }
              }
            } else if (l.data && Array.isArray(l.data)) {
              const w = l.width || mapData.width || 0;
              const h = l.height || mapData.height || 0;
              if (tx >= 0 && tx < w && ty >= 0 && ty < h) {
                if ((l.data[ty * w + tx] & 0x1fffffff) !== 0) return true;
              }
            }
          }
          return false;
        };
        const leftWall = hasWallAt(rawTileX - 1, rawTileY);
        const rightWall = hasWallAt(rawTileX + 1, rawTileY);
        const topWall = hasWallAt(rawTileX, rawTileY - 1);
        const bottomWall = hasWallAt(rawTileX, rawTileY + 1);
        if ((leftWall || rightWall) && !(topWall || bottomWall)) {
          rotation = "horizontal";
        } else if ((topWall || bottomWall) && !(leftWall || rightWall)) {
          rotation = "vertical";
        }
      }

      const wall = new DestructableWall({
        id: obj.id,
        name: obj.name || `Wall_${obj.id}`,
        gridX,
        gridY,
        texture: adjustedTileId,
        rotation,
        align,
        offset,
        linkIds,
        isEnabling,
        isObjective,
        objectiveKey,
      });

      this.walls.push(wall);
    };

    for (const layer of allObjectLayers) {
      if (layer.objects) {
        for (const obj of layer.objects) {
          parseObject(obj, layer);
        }
      }
    }
  }

  /**
   * Links walls to matching breakable props.
   */
  public bindBreakables(
    breakables: RaycastBreakable[],
    firstgid: number = 1
  ): void {
    for (const wall of this.walls) {
      wall.bindBreakables(breakables, firstgid);
    }
  }

  /**
   * Dispatches broken breakable event to all walls and fires onWallDeactivated if a wall disables.
   */
  public onBreakableDestroyed(broken: RaycastBreakable): void {
    for (const wall of this.walls) {
      const deactivated = wall.onBreakableDestroyed(broken);
      if (deactivated) {
        this.onWallDeactivated?.(wall);
      }
    }
  }

  /**
   * Returns active thin wall line segments for raycasting.
   */
  public getThinWalls(): ThinWallDescriptor[] {
    const thinWalls: ThinWallDescriptor[] = [];
    for (const wall of this.walls) {
      if (wall.isActive()) {
        thinWalls.push({
          x1: wall.x1,
          y1: wall.y1,
          x2: wall.x2,
          y2: wall.y2,
          texture: wall.texture,
          orientation: wall.rotation,
          isDestructableWall: true,
        });
      }
    }
    return thinWalls;
  }

  /**
   * Checks if player collides with any active destructible wall.
   */
  public checkCollision(
    newX: number,
    newY: number,
    playerRadius: number = 0.25
  ): boolean {
    for (const wall of this.walls) {
      if (wall.isActive() && wall.checkCollision(newX, newY, playerRadius)) {
        return true;
      }
    }
    return false;
  }

  public getWalls(): DestructableWall[] {
    return this.walls;
  }

  public getWallById(wallId: number | string): DestructableWall | undefined {
    const sId = String(wallId).trim();
    return this.walls.find((w) => String(w.id) === sId || (w.name && w.name === sId));
  }

  public setWallActiveById(wallId: number | string, active: boolean): DestructableWall | undefined {
    const wall = this.getWallById(wallId);
    if (wall) {
      const wasActive = wall.isActive();
      wall.setActive(active);
      if (wasActive && !active) {
        this.onWallDeactivated?.(wall);
      }
    }
    return wall;
  }

  public dispose(): void {
    this.walls = [];
    this.onWallDeactivated = undefined;
  }
}
