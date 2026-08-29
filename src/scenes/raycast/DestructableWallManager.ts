import { DestructableWall } from "./DestructableWall";
import { RaycastBreakable, ThinWallDescriptor } from "./types";

export class DestructableWallManager {
  private walls: DestructableWall[] = [];
  public onWallDeactivated?: (wall: DestructableWall) => void;

  /**
   * Parses all DestructableWall objects from the DoorProtectors layer or any object layers in Tiled mapData.
   */
  public parseMapDoorProtectors(mapData: any, firstgid: number = 1): void {
    this.walls = [];

    const tileW = mapData.tilewidth || 64;
    const tileH = mapData.tileheight || 64;

    const allObjectLayers = (mapData.layers || []).filter(
      (l: any) => l.type === "objectgroup" || l.objects
    );

    const processedObjIds = new Set<number>();

    const parseObject = (obj: any, layer: any) => {
      if (processedObjIds.has(obj.id)) return;
      const layerName = (layer.name || "").toLowerCase();
      const objType = (obj.type || "").toLowerCase();

      const isDestructable =
        objType === "destructablewall" ||
        obj.type === "DestructableWall" ||
        layerName.includes("doorprotector") ||
        layerName.includes("protector") ||
        layerName.includes("destructablewall") ||
        layerName.includes("barrier");

      if (!isDestructable) return;
      processedObjIds.add(obj.id);

      const gid = obj.gid ?? 0;
      const adjustedTileId = gid !== 0 ? gid - firstgid : 1; // Default to fence texture if not set

      // Resolve grid cell (gx, gy)
      const objW = obj.width || tileW;
      const objH = obj.height || tileH;
      // In Tiled tile objects with gid, the y coordinate is at bottom-left
      const objCenterX = obj.x + objW * 0.5;
      const objCenterY = gid !== 0 ? obj.y - objH * 0.5 : obj.y + objH * 0.5;

      const gridX = Math.floor(objCenterX / tileW);
      const gridY = Math.floor(objCenterY / tileH);

      let align = "center";
      let rotation = "vertical";
      let offset = 0;
      let linkIds: any = [];

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

  public dispose(): void {
    this.walls = [];
    this.onWallDeactivated = undefined;
  }
}
