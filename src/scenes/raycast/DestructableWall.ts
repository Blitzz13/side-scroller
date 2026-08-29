import { DestructableWallConfig, RaycastBreakable } from "./types";

/**
 * Extracts list of ID strings from any format (arrays, Tiled property lists, objects, strings, numbers).
 */
export function extractLinkIds(input: any): string[] {
  if (input === undefined || input === null) return [];
  if (Array.isArray(input)) {
    const ids: string[] = [];
    for (const item of input) {
      if (item !== null && typeof item === "object") {
        if (item.value !== undefined) {
          ids.push(...extractLinkIds(item.value));
        } else if (item.id !== undefined) {
          ids.push(...extractLinkIds(item.id));
        }
      } else if (item !== undefined && item !== null) {
        ids.push(...extractLinkIds(item));
      }
    }
    return ids;
  }
  if (typeof input === "object") {
    if (input.value !== undefined) {
      return extractLinkIds(input.value);
    }
    if (input.id !== undefined) {
      return extractLinkIds(input.id);
    }
  }
  return String(input)
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * DestructableWall represents a thin wall fixed in world-space (not following player's view).
 * It fits into a grid square, aligns to edges or center according to `align`, shifts with `offset`,
 * and is disabled/removed when all linked breakable objects are destroyed.
 */
export class DestructableWall {
  public readonly id: number;
  public readonly name: string;
  public readonly gridX: number;
  public readonly gridY: number;
  public readonly texture: number;
  public readonly rotation: "vertical" | "horizontal";
  public readonly align: string;
  public readonly offset: number;
  public readonly linkIds: string[];

  public x1: number = 0;
  public y1: number = 0;
  public x2: number = 0;
  public y2: number = 0;

  private active: boolean = true;
  private linkedBreakables: RaycastBreakable[] = [];

  constructor(config: DestructableWallConfig) {
    this.id = config.id;
    this.name = config.name || `DestructableWall_${config.id}`;
    this.gridX = config.gridX;
    this.gridY = config.gridY;
    this.texture = config.texture;

    const rotStr = String(config.rotation || "vertical").toLowerCase();
    this.rotation =
      rotStr.includes("horiz") ||
      rotStr === "h" ||
      rotStr === "ew" ||
      rotStr === "x" ||
      rotStr === "90" ||
      rotStr === "270"
        ? "horizontal"
        : "vertical";

    this.align = String(config.align || "center").toLowerCase();
    this.offset =
      typeof config.offset === "number"
        ? config.offset
        : parseFloat(String(config.offset || 0)) || 0;

    // Normalize linkIds into a cleaned array of strings
    this.linkIds = extractLinkIds(config.linkIds);

    this.calculateGeometry();
  }

  /**
   * Calculates world-space line segment (x1, y1) to (x2, y2) based on grid coordinates,
   * rotation (vertical/horizontal), alignment (center/left/right/top/bottom), and offset.
   */
  public calculateGeometry(): void {
    const gx = this.gridX;
    const gy = this.gridY;
    const alignStr = this.align;
    let offsetVal = this.offset;

    // If offset was specified in pixels (e.g. |offset| > 1), normalize to tile units (assuming 64px standard tile)
    if (Math.abs(offsetVal) > 1) {
      offsetVal = offsetVal / 64;
    }

    if (this.rotation === "vertical") {
      // Wall runs vertically along Y axis (spanning from gy to gy + 1)
      let alignX = 0.5; // default center
      if (
        alignStr === "left" ||
        alignStr === "west" ||
        alignStr === "min" ||
        alignStr === "inner"
      ) {
        alignX = 0.0;
      } else if (
        alignStr === "right" ||
        alignStr === "east" ||
        alignStr === "max" ||
        alignStr === "outer"
      ) {
        alignX = 1.0;
      } else if (alignStr === "center" || alignStr === "middle") {
        alignX = 0.5;
      } else {
        const parsed = parseFloat(alignStr);
        if (!isNaN(parsed)) {
          alignX = Math.abs(parsed) > 1 ? parsed / 64 : parsed;
        }
      }

      const finalX = gx + alignX + offsetVal;
      this.x1 = finalX;
      this.y1 = gy;
      this.x2 = finalX;
      this.y2 = gy + 1;
    } else {
      // Wall runs horizontally along X axis (spanning from gx to gx + 1)
      let alignY = 0.5; // default center
      if (
        alignStr === "top" ||
        alignStr === "north" ||
        alignStr === "up" ||
        alignStr === "min" ||
        alignStr === "outer"
      ) {
        alignY = 0.0;
      } else if (
        alignStr === "bottom" ||
        alignStr === "south" ||
        alignStr === "down" ||
        alignStr === "max" ||
        alignStr === "inner"
      ) {
        alignY = 1.0;
      } else if (alignStr === "center" || alignStr === "middle") {
        alignY = 0.5;
      } else {
        const parsed = parseFloat(alignStr);
        if (!isNaN(parsed)) {
          alignY = Math.abs(parsed) > 1 ? parsed / 64 : parsed;
        }
      }

      const finalY = gy + alignY + offsetVal;
      this.x1 = gx;
      this.y1 = finalY;
      this.x2 = gx + 1;
      this.y2 = finalY;
    }
  }

  /**
   * Binds breakable objects to this wall by matching link IDs.
   */
  public bindBreakables(
    allBreakables: RaycastBreakable[],
    firstgid: number = 1
  ): void {
    if (this.linkIds.length === 0) {
      this.linkedBreakables = [];
      return;
    }

    const matchedBreakables = new Set<RaycastBreakable>();

    for (const linkId of this.linkIds) {
      const lidStr = String(linkId).trim();
      if (!lidStr) continue;

      // 1. Exact object ID / custom linkId match
      const exactMatches = allBreakables.filter((b) => {
        const matchObjId = b.objId !== undefined && String(b.objId) === lidStr;
        const matchId = String(b.id) === lidStr;
        const matchLinkId = b.linkId !== undefined && String(b.linkId) === lidStr;
        return matchObjId || matchId || matchLinkId;
      });

      if (exactMatches.length > 0) {
        for (const m of exactMatches) {
          matchedBreakables.add(m);
        }
      } else {
        // 2. Fallback: match by tileId / GID / name / type
        const fallbackMatches = allBreakables.filter((b) => {
          const matchTileId = b.tileId !== undefined && String(b.tileId) === lidStr;
          const matchGid =
            b.tileId !== undefined && String(b.tileId + firstgid) === lidStr;
          const matchName =
            b.name && b.name.toLowerCase().includes(lidStr.toLowerCase());
          const matchType =
            b.type && b.type.toLowerCase().includes(lidStr.toLowerCase());
          return matchTileId || matchGid || matchName || matchType;
        });

        for (const m of fallbackMatches) {
          matchedBreakables.add(m);
        }
      }
    }

    this.linkedBreakables = Array.from(matchedBreakables);
    this.updateActiveStatus();
  }

  /**
   * Called when any breakable is destroyed.
   * Returns true if this specific wall transitioned from active to inactive.
   */
  public onBreakableDestroyed(broken: RaycastBreakable): boolean {
    if (!this.active) return false;
    const wasActive = this.active;
    this.updateActiveStatus();
    return wasActive && !this.active;
  }

  /**
   * Updates whether the wall is active.
   * The wall is disabled if and only if ALL linked breakables are destroyed.
   */
  public updateActiveStatus(): boolean {
    if (this.linkedBreakables.length === 0) {
      // If link IDs were specified but no breakables were matched yet, remain active
      if (this.linkIds.length > 0) {
        this.active = true;
        return this.active;
      }
      return this.active;
    }

    const allDestroyed = this.linkedBreakables.every((b) => b.isBroken);
    this.active = !allDestroyed;
    return this.active;
  }

  public isActive(): boolean {
    return this.active;
  }

  public setActive(active: boolean): void {
    this.active = active;
  }

  public getLinkedBreakables(): RaycastBreakable[] {
    return this.linkedBreakables;
  }

  /**
   * Checks if player collides with this thin wall segment.
   */
  public checkCollision(
    playerX: number,
    playerY: number,
    playerRadius: number = 0.25
  ): boolean {
    if (!this.active) return false;

    const x1 = this.x1;
    const y1 = this.y1;
    const x2 = this.x2;
    const y2 = this.y2;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      const dsq =
        (playerX - x1) * (playerX - x1) + (playerY - y1) * (playerY - y1);
      return dsq < playerRadius * playerRadius;
    }

    const t = Math.max(
      0,
      Math.min(1, ((playerX - x1) * dx + (playerY - y1) * dy) / lengthSq)
    );
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const distSq =
      (playerX - projX) * (playerX - projX) +
      (playerY - projY) * (playerY - projY);

    return distSq < playerRadius * playerRadius;
  }
}
