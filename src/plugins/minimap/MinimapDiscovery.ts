import { IDiscoveredMapObject, IMinimapDataSource, MinimapTileType } from "./MinimapTypes";

/**
 * Manages the fog-of-war exploration grid, radial line-of-sight raycasting,
 * and persistent discovery of map objects (keycards, pickups, stairs, terminals).
 */
export class MinimapDiscovery {
  private _discoveredTiles: Uint8Array = new Uint8Array(0);
  private _discoveredObjects: Map<string, IDiscoveredMapObject> = new Map();
  private _totalWalkableTiles: number = 0;
  private _discoveredWalkableCount: number = 0;
  private _needsStaticRedraw: boolean = true;

  private lastDiscoveredPlayerX: number = -999;
  private lastDiscoveredPlayerY: number = -999;
  private lastDiscoveredDirX: number = -999;
  private lastDiscoveredDirY: number = -999;

  public get discoveredTiles(): Uint8Array {
    return this._discoveredTiles;
  }

  public get discoveredObjects(): Map<string, IDiscoveredMapObject> {
    return this._discoveredObjects;
  }

  public get totalWalkableTiles(): number {
    return this._totalWalkableTiles;
  }

  public get discoveredWalkableCount(): number {
    return this._discoveredWalkableCount;
  }

  public get needsStaticRedraw(): boolean {
    return this._needsStaticRedraw;
  }

  public set needsStaticRedraw(value: boolean) {
    this._needsStaticRedraw = value;
  }

  public getExplorationPercentage(): number {
    if (this._totalWalkableTiles <= 0) return 0;
    return Math.min(100, Math.round((this._discoveredWalkableCount / this._totalWalkableTiles) * 100));
  }

  public reset(): void {
    this._discoveredTiles = new Uint8Array(0);
    this._discoveredObjects.clear();
    this._totalWalkableTiles = 0;
    this._discoveredWalkableCount = 0;
    this._needsStaticRedraw = true;
    this.lastDiscoveredPlayerX = -999;
    this.lastDiscoveredPlayerY = -999;
    this.lastDiscoveredDirX = -999;
    this.lastDiscoveredDirY = -999;
  }

  /**
   * Scans surroundings and line-of-sight rays from the player's position,
   * uncovering rooms, corridors, and visible items.
   *
   * @returns true if any new tiles or objects were discovered.
   */
  public update(
    dataSource: IMinimapDataSource,
    playerX: number,
    playerY: number,
    dirX: number,
    dirY: number,
    force: boolean = false
  ): boolean {
    const mapWidth = dataSource.getMapWidth();
    const mapHeight = dataSource.getMapHeight();
    if (!mapWidth || !mapHeight) return false;

    // Allocate or re-allocate discovery buffer if map dimensions changed or after reset
    if (this._discoveredTiles.length !== mapWidth * mapHeight) {
      this._discoveredTiles = new Uint8Array(mapWidth * mapHeight);
      this._needsStaticRedraw = true;
      this._totalWalkableTiles = 0;
      this._discoveredWalkableCount = 0;

      const flags = dataSource.getTileTypeFlags();
      for (let i = 0; i < flags.length; i++) {
        if (flags[i] === MinimapTileType.EMPTY || flags[i] === MinimapTileType.DOOR) {
          this._totalWalkableTiles++;
        }
      }
    }

    // Skip if player position and angle haven't changed meaningfully
    const positionDeltaSq = (playerX - this.lastDiscoveredPlayerX) ** 2 + (playerY - this.lastDiscoveredPlayerY) ** 2;
    const rotationDelta = Math.abs(dirX - this.lastDiscoveredDirX) + Math.abs(dirY - this.lastDiscoveredDirY);
    if (!force && positionDeltaSq < 0.003 && rotationDelta < 0.01) {
      return false;
    }
    this.lastDiscoveredPlayerX = playerX;
    this.lastDiscoveredPlayerY = playerY;
    this.lastDiscoveredDirX = dirX;
    this.lastDiscoveredDirY = dirY;

    const tileTypeFlags = dataSource.getTileTypeFlags();
    const doorStates = dataSource.getDoorStatesFlat?.();
    let newlyDiscovered = false;

    // 1. Immediate Proximity Discovery (Player's current room/corridor vicinity within radius 2.6)
    const proximityRadius = 2.6;
    const minTileX = Math.max(0, Math.floor(playerX - proximityRadius));
    const maxTileX = Math.min(mapWidth - 1, Math.floor(playerX + proximityRadius));
    const minTileY = Math.max(0, Math.floor(playerY - proximityRadius));
    const maxTileY = Math.min(mapHeight - 1, Math.floor(playerY + proximityRadius));
    const proximityRadiusSq = proximityRadius * proximityRadius;

    for (let cellY = minTileY; cellY <= maxTileY; cellY++) {
      for (let cellX = minTileX; cellX <= maxTileX; cellX++) {
        const distanceSquared = (cellX + 0.5 - playerX) ** 2 + (cellY + 0.5 - playerY) ** 2;
        if (distanceSquared <= proximityRadiusSq) {
          const tileIndex = cellY * mapWidth + cellX;
          if (this._discoveredTiles[tileIndex] === 0) {
            this._discoveredTiles[tileIndex] = 1;
            newlyDiscovered = true;
            if (tileTypeFlags[tileIndex] === MinimapTileType.EMPTY || tileTypeFlags[tileIndex] === MinimapTileType.DOOR) {
              this._discoveredWalkableCount++;
            }
          }
        }
      }
    }

    // 2. Line-of-Sight Radial Raycasting (Room & Corridor Discovery up to 14 tiles)
    // Cast rays in full circle with 2-degree increments (180 rays)
    const numRays = 180;
    const maxSightDistance = 14.0;
    const stepSize = 0.28;

    for (let rayIndex = 0; rayIndex < numRays; rayIndex++) {
      const angle = (rayIndex / numRays) * (Math.PI * 2);
      const rayDirX = Math.cos(angle);
      const rayDirY = Math.sin(angle);

      let currentX = playerX;
      let currentY = playerY;

      for (let distance = stepSize; distance <= maxSightDistance; distance += stepSize) {
        currentX += rayDirX * stepSize;
        currentY += rayDirY * stepSize;

        const cellX = Math.floor(currentX);
        const cellY = Math.floor(currentY);
        if (cellX < 0 || cellX >= mapWidth || cellY < 0 || cellY >= mapHeight) {
          break;
        }

        const tileIndex = cellY * mapWidth + cellX;
        if (this._discoveredTiles[tileIndex] === 0) {
          this._discoveredTiles[tileIndex] = 1;
          newlyDiscovered = true;
          if (tileTypeFlags[tileIndex] === MinimapTileType.EMPTY || tileTypeFlags[tileIndex] === MinimapTileType.DOOR) {
            this._discoveredWalkableCount++;
          }
        }

        // Sight stopped by solid walls
        if (tileTypeFlags[tileIndex] === MinimapTileType.WALL) {
          break;
        }

        // Sight stopped by closed or nearly-closed doors (< 0.35 open)
        if (tileTypeFlags[tileIndex] === MinimapTileType.DOOR) {
          let openAmount = 0;
          if (doorStates && doorStates[tileIndex] !== undefined) {
            openAmount = Math.abs(doorStates[tileIndex]);
          }
          if (openAmount < 0.35) {
            break;
          }
        }
      }
    }

    // 3. Persistent Object Discovery:
    // If an object's tile has been discovered, record it permanently on the minimap
    if (dataSource.getPickups) {
      const pickups = dataSource.getPickups();
      for (const pickup of pickups) {
        const objKey = `pickup_${pickup.id}`;
        const pickupCellX = Math.floor(pickup.x);
        const pickupCellY = Math.floor(pickup.y);
        const pickupTileIndex = pickupCellY * mapWidth + pickupCellX;

        if (pickupTileIndex >= 0 && pickupTileIndex < this._discoveredTiles.length && this._discoveredTiles[pickupTileIndex] === 1) {
          let category: IDiscoveredMapObject["category"] = "ammo";
          let label = "AMMO";
          let color = 0xffaa00;

          if (pickup.keyColor) {
            category = "keycard";
            label = `${pickup.keyColor.toUpperCase()} KEY`;
            if (pickup.keyColor === "blue") color = 0x00aaff;
            else if (pickup.keyColor === "red") color = 0xff3344;
            else if (pickup.keyColor === "yellow") color = 0xffcc00;
            else if (pickup.keyColor === "green") color = 0x00ff88;
          } else if (pickup.type === 0 /* HEALTH */) {
            category = "health";
            label = "HEALTH";
            color = 0x00ff88;
          } else if (pickup.type === 9 /* SHIELD */) {
            category = "shield";
            label = "SHIELD";
            color = 0x00e5ff;
          } else if (pickup.type === 1 /* WEAPON */) {
            category = "weapon";
            label = "BLASTER";
            color = 0xffbb00;
          } else if (pickup.type === 7 || pickup.type === 8 /* THERMAL DETONATORS */) {
            category = "ammo";
            label = "DETONATOR";
            color = 0xff6600;
          }

          this._discoveredObjects.set(objKey, {
            id: objKey,
            x: pickup.x,
            y: pickup.y,
            category,
            label,
            color,
            isCollected: pickup.collected,
          });
        }
      }
    }

    // Stationary Objects (Holotables, Consoles, Terminals)
    if (dataSource.getStationaryObjects) {
      const stationaryList = dataSource.getStationaryObjects();
      for (let i = 0; i < stationaryList.length; i++) {
        const stationObj = stationaryList[i];
        const stationaryCellX = Math.floor(stationObj.x);
        const stationaryCellY = Math.floor(stationObj.y);
        const stationaryTileIndex = stationaryCellY * mapWidth + stationaryCellX;

        if (stationaryTileIndex >= 0 && stationaryTileIndex < this._discoveredTiles.length && this._discoveredTiles[stationaryTileIndex] === 1) {
          const objKey = `stat_${stationaryCellX}_${stationaryCellY}`;
          this._discoveredObjects.set(objKey, {
            id: objKey,
            x: stationObj.x,
            y: stationObj.y,
            category: "terminal",
            label: (stationObj.name || "TERMINAL").toUpperCase(),
            color: 0x00ffff,
            isCollected: false,
          });
        }
      }
    }

    // Level Finish / Exit Zones
    if (dataSource.getLevelFinishZones) {
      const finishZones = dataSource.getLevelFinishZones();
      for (let i = 0; i < finishZones.length; i++) {
        const zone = finishZones[i];
        const midX = (zone.x1 + zone.x2) / 2;
        const midY = (zone.y1 + zone.y2) / 2;
        const zoneCellX = Math.floor(midX);
        const zoneCellY = Math.floor(midY);
        const zoneTileIndex = zoneCellY * mapWidth + zoneCellX;

        if (zoneTileIndex >= 0 && zoneTileIndex < this._discoveredTiles.length && this._discoveredTiles[zoneTileIndex] === 1) {
          const objKey = `exit_${zone.x1}_${zone.y1}`;
          this._discoveredObjects.set(objKey, {
            id: objKey,
            x: midX,
            y: midY,
            category: "exit",
            label: "EXIT",
            color: 0x00ff88,
            isCollected: false,
          });
        }
      }
    }

    // Stairs Discovery
    if (dataSource.getStairs) {
      const stairs = dataSource.getStairs();
      for (let i = 0; i < stairs.length; i++) {
        const stair = stairs[i];
        const stairTileIndex = stair.y * mapWidth + stair.x;
        if (stairTileIndex >= 0 && stairTileIndex < this._discoveredTiles.length && this._discoveredTiles[stairTileIndex] === 1) {
          const objKey = `stairs_${stair.x}_${stair.y}`;
          const isDown = stair.stairType === "down";
          this._discoveredObjects.set(objKey, {
            id: objKey,
            x: stair.x + 0.5,
            y: stair.y + 0.5,
            category: "stairs",
            label: isDown ? "STAIRS DOWN" : (stair.stairType === "up" ? "STAIRS UP" : "STAIRS"),
            color: isDown ? 0xc084fc : 0x00e5ff,
            stairType: stair.stairType,
            isCollected: false,
          });
        }
      }
    }

    if (newlyDiscovered) {
      this._needsStaticRedraw = true;
    }

    return newlyDiscovered;
  }
}
