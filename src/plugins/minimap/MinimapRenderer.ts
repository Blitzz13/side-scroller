import { Graphics } from "pixi.js";
import { MinimapDiscovery } from "./MinimapDiscovery";
import { IMinimapDataSource, IMinimapViewportMetrics, MinimapTileType } from "./MinimapTypes";

/**
 * Handles the rendering of both static geometry (walls, floors, stairs, thin walls)
 * and dynamic game elements (doors, items, exits, enemies, and player) for the minimap.
 */
export class MinimapRenderer {
  /**
   * Computes the scaling factor and centered offsets for the map inside the viewport.
   */
  public computeMetrics(
    mapWidth: number,
    mapHeight: number,
    viewportW: number,
    viewportH: number
  ): IMinimapViewportMetrics {
    const cellWidth = (viewportW - 16) / mapWidth;
    const cellHeight = (viewportH - 16) / mapHeight;
    const cellSize = Math.max(6, Math.min(cellWidth, cellHeight));

    const totalMapWidth = mapWidth * cellSize;
    const totalMapHeight = mapHeight * cellSize;
    const mapOffsetX = (viewportW - totalMapWidth) / 2;
    const mapOffsetY = (viewportH - totalMapHeight) / 2;

    return {
      cellSize,
      mapOffsetX,
      mapOffsetY,
      viewportW,
      viewportH,
    };
  }

  /**
   * Draws the static map layer: viewport background, discovered floors, walls, stairs, and thin walls.
   */
  public drawStaticMap(
    staticGraphics: Graphics,
    bgGraphics: Graphics,
    dataSource: IMinimapDataSource,
    discovery: MinimapDiscovery,
    metrics: IMinimapViewportMetrics,
    fogOfWar: boolean
  ): void {
    const mapWidth = dataSource.getMapWidth();
    const mapHeight = dataSource.getMapHeight();
    if (!mapWidth || !mapHeight) return;

    const { cellSize, mapOffsetX, mapOffsetY, viewportW, viewportH } = metrics;
    const tileTypeFlags = dataSource.getTileTypeFlags();
    const discoveredTiles = discovery.discoveredTiles;
    const hasFog = fogOfWar && discoveredTiles.length === mapWidth * mapHeight;

    // 1. Viewport background
    bgGraphics.clear();
    bgGraphics.beginFill(0x040810, 0.98);
    bgGraphics.lineStyle(1.5, 0x0d2235, 0.9);
    bgGraphics.drawRoundedRect(0, 0, viewportW, viewportH, 8);
    bgGraphics.endFill();

    // 2. Discovered walkable floor & corridors
    staticGraphics.clear();
    staticGraphics.lineStyle(0.5, 0x0c1b2c, 0.7);
    for (let cellY = 0; cellY < mapHeight; cellY++) {
      for (let cellX = 0; cellX < mapWidth; cellX++) {
        const tileIndex = cellY * mapWidth + cellX;
        if (hasFog && discoveredTiles[tileIndex] === 0) {
          continue; // Undiscovered: hidden in dark fog
        }

        const flag = tileTypeFlags[tileIndex] ?? MinimapTileType.EMPTY;
        if (flag === MinimapTileType.EMPTY || flag === MinimapTileType.DOOR) {
          const screenX = mapOffsetX + cellX * cellSize;
          const screenY = mapOffsetY + cellY * cellSize;
          staticGraphics.beginFill(0x0a1624, 0.85);
          staticGraphics.drawRect(screenX, screenY, cellSize, cellSize);
          staticGraphics.endFill();
        }
      }
    }

    // Collect stairs map for fast lookup
    const stairsList = dataSource.getStairs?.() || [];
    const stairsMap = new Map<string, { stairType: "up" | "down" | "generic" }>();
    for (let i = 0; i < stairsList.length; i++) {
      const stair = stairsList[i];
      stairsMap.set(`${stair.x},${stair.y}`, stair);
    }

    // 3. Discovered solid walls & stairs
    for (let cellY = 0; cellY < mapHeight; cellY++) {
      for (let cellX = 0; cellX < mapWidth; cellX++) {
        const tileIndex = cellY * mapWidth + cellX;
        if (hasFog && discoveredTiles[tileIndex] === 0) {
          continue; // Undiscovered: hidden
        }

        const screenX = mapOffsetX + cellX * cellSize;
        const screenY = mapOffsetY + cellY * cellSize;
        const stair = stairsMap.get(`${cellX},${cellY}`);

        if (stair) {
          // Dedicated high-visibility stairs rendering
          const isDown = stair.stairType === "down";
          const baseColor = isDown ? 0x221133 : 0x09263a;
          const borderColor = isDown ? 0xc084fc : 0x00e5ff;
          const treadColor = isDown ? 0xe9d5ff : 0xa5f3fc;

          // Stairwell tile background
          staticGraphics.beginFill(baseColor, 0.95);
          staticGraphics.lineStyle(1.5, borderColor, 0.95);
          staticGraphics.drawRect(screenX, screenY, cellSize, cellSize);
          staticGraphics.endFill();

          // 3 parallel stair step tread lines
          const numSteps = 3;
          staticGraphics.lineStyle(1.2, treadColor, 0.85);
          for (let stepIndex = 1; stepIndex <= numSteps; stepIndex++) {
            const stepY = screenY + (cellSize / (numSteps + 1)) * stepIndex;
            staticGraphics.moveTo(screenX + 2, stepY);
            staticGraphics.lineTo(screenX + cellSize - 2, stepY);
          }

          // Center direction arrow (▲ for UP, ▼ for DOWN)
          const midX = screenX + cellSize / 2;
          const midY = screenY + cellSize / 2;
          const arrowSize = Math.max(2.5, cellSize * 0.22);

          staticGraphics.beginFill(borderColor, 1);
          staticGraphics.lineStyle(0);
          if (isDown) {
            // DOWN ▼
            staticGraphics.moveTo(midX, midY + arrowSize);
            staticGraphics.lineTo(midX - arrowSize, midY - arrowSize * 0.7);
            staticGraphics.lineTo(midX + arrowSize, midY - arrowSize * 0.7);
            staticGraphics.closePath();
          } else {
            // UP ▲
            staticGraphics.moveTo(midX, midY - arrowSize);
            staticGraphics.lineTo(midX - arrowSize, midY + arrowSize * 0.7);
            staticGraphics.lineTo(midX + arrowSize, midY + arrowSize * 0.7);
            staticGraphics.closePath();
          }
          staticGraphics.endFill();
          continue;
        }

        const flag = tileTypeFlags[tileIndex] ?? MinimapTileType.EMPTY;
        if (flag === MinimapTileType.WALL) {
          staticGraphics.beginFill(0x152c3f, 0.95);
          staticGraphics.lineStyle(1, 0x225577, 0.9);
          staticGraphics.drawRect(screenX, screenY, cellSize, cellSize);
          staticGraphics.endFill();
        }
      }
    }

    // 4. Discovered thin walls
    const thinWalls = dataSource.getThinWalls?.() || [];
    staticGraphics.lineStyle(Math.max(1.5, cellSize * 0.18), 0x00e5ff, 0.9);
    for (const thinWall of thinWalls) {
      const cellStartX = Math.floor(thinWall.x1);
      const cellStartY = Math.floor(thinWall.y1);
      const cellEndX = Math.floor(thinWall.x2);
      const cellEndY = Math.floor(thinWall.y2);
      const startTileIndex = cellStartY * mapWidth + cellStartX;
      const endTileIndex = cellEndY * mapWidth + cellEndX;

      // Only draw thin wall if at least one adjacent cell is discovered
      if (!hasFog || discoveredTiles[startTileIndex] === 1 || discoveredTiles[endTileIndex] === 1) {
        const screenStartX = mapOffsetX + thinWall.x1 * cellSize;
        const screenStartY = mapOffsetY + thinWall.y1 * cellSize;
        const screenEndX = mapOffsetX + thinWall.x2 * cellSize;
        const screenEndY = mapOffsetY + thinWall.y2 * cellSize;
        staticGraphics.moveTo(screenStartX, screenStartY);
        staticGraphics.lineTo(screenEndX, screenEndY);
      }
    }
  }

  /**
   * Draws dynamic elements: doors, persistent objects, exits, enemies, and player.
   *
   * @returns Total number of active hostiles detected in the area.
   */
  public drawDynamicMap(
    dynamicGraphics: Graphics,
    dataSource: IMinimapDataSource,
    discovery: MinimapDiscovery,
    metrics: IMinimapViewportMetrics,
    options: { fogOfWar: boolean; showEnemies: boolean; showFovCone: boolean },
    pulseAlpha: number
  ): number {
    dynamicGraphics.clear();

    const mapWidth = dataSource.getMapWidth();
    const mapHeight = dataSource.getMapHeight();
    if (!mapWidth || !mapHeight) return 0;

    const { cellSize, mapOffsetX, mapOffsetY } = metrics;
    const tileTypeFlags = dataSource.getTileTypeFlags();
    const doorStates = dataSource.getDoorStatesFlat?.();
    const lockedDoors = dataSource.getLockedDoors?.() || {};
    const unlockedKeycardDoors = dataSource.getUnlockedKeycardDoors?.() || new Set<string>();
    const discoveredTiles = discovery.discoveredTiles;
    const hasFog = options.fogOfWar && discoveredTiles.length === mapWidth * mapHeight;

    // 1. Draw Discovered Doors (Open / Closed / Sliding & Keycards)
    for (let cellY = 0; cellY < mapHeight; cellY++) {
      for (let cellX = 0; cellX < mapWidth; cellX++) {
        const tileIndex = cellY * mapWidth + cellX;
        if (hasFog && discoveredTiles[tileIndex] === 0) {
          continue; // Undiscovered door: hidden
        }

        if (tileTypeFlags[tileIndex] === MinimapTileType.DOOR) {
          const screenX = mapOffsetX + cellX * cellSize;
          const screenY = mapOffsetY + cellY * cellSize;

          const doorCoordKey = `${cellX},${cellY}`;
          const requiredKeyColor = lockedDoors[doorCoordKey];
          const isUnlocked = unlockedKeycardDoors.has(doorCoordKey);

          // Get open state: 0 = closed, 1 = fully open, negative = closing
          let openRatio = 0;
          if (doorStates && doorStates[tileIndex] !== undefined) {
            openRatio = Math.abs(doorStates[tileIndex]);
          }

          // Door color determination
          let doorColor = 0xffaa00; // default amber
          if (requiredKeyColor === "blue") doorColor = 0x0088ff;
          else if (requiredKeyColor === "red") doorColor = 0xff3333;
          else if (requiredKeyColor === "yellow") doorColor = 0xffcc00;

          if (isUnlocked && requiredKeyColor) {
            dynamicGraphics.lineStyle(1.5, 0x00ff88, 0.9);
          } else {
            dynamicGraphics.lineStyle(1.5, doorColor, 0.95);
          }

          if (openRatio > 0.85) {
            // Door is wide open: draw open side posts
            dynamicGraphics.beginFill(0x00ff88, 0.4);
            dynamicGraphics.drawRect(screenX + 1, screenY + 1, 2, cellSize - 2);
            dynamicGraphics.drawRect(screenX + cellSize - 3, screenY + 1, 2, cellSize - 2);
            dynamicGraphics.endFill();
          } else {
            // Closed or partially sliding door
            const barThickness = Math.max(3, cellSize * 0.28);
            const midY = screenY + (cellSize - barThickness) / 2;
            const remainingWidth = (cellSize - 2) * (1 - openRatio * 0.8);

            dynamicGraphics.beginFill(doorColor, 0.85);
            dynamicGraphics.drawRect(screenX + 1, midY, remainingWidth, barThickness);
            dynamicGraphics.endFill();
          }
        }
      }
    }

    // 2. Draw Discovered Objects (Pickups, Keycards, Terminals, Exits, Stairs)
    for (const objectItem of discovery.discoveredObjects.values()) {
      if (objectItem.isCollected) continue;

      const objectScreenX = mapOffsetX + objectItem.x * cellSize;
      const objectScreenY = mapOffsetY + objectItem.y * cellSize;

      if (objectItem.category === "keycard") {
        // High-visibility glowing keycard badge
        const badgeWidth = Math.max(8, cellSize * 0.7);
        const badgeHeight = Math.max(6, cellSize * 0.5);
        dynamicGraphics.lineStyle(1.5, 0xffffff, 0.9);
        dynamicGraphics.beginFill(objectItem.color, 0.95);
        dynamicGraphics.drawRoundedRect(objectScreenX - badgeWidth / 2, objectScreenY - badgeHeight / 2, badgeWidth, badgeHeight, 2);
        dynamicGraphics.endFill();

        // Pulsing glow halo
        dynamicGraphics.lineStyle(1, objectItem.color, 0.5 + 0.5 * pulseAlpha);
        dynamicGraphics.drawCircle(objectScreenX, objectScreenY, badgeWidth * 0.9);
      } else if (objectItem.category === "health") {
        // Green medical cross icon inside dark badge
        const radius = Math.max(4, cellSize * 0.35);
        dynamicGraphics.lineStyle(1.2, 0x00ff88, 0.9);
        dynamicGraphics.beginFill(0x0a2215, 0.85);
        dynamicGraphics.drawCircle(objectScreenX, objectScreenY, radius);
        dynamicGraphics.endFill();

        // Cross +
        const barLength = radius * 0.65;
        dynamicGraphics.lineStyle(1.5, 0x00ff88, 1);
        dynamicGraphics.moveTo(objectScreenX - barLength, objectScreenY);
        dynamicGraphics.lineTo(objectScreenX + barLength, objectScreenY);
        dynamicGraphics.moveTo(objectScreenX, objectScreenY - barLength);
        dynamicGraphics.lineTo(objectScreenX, objectScreenY + barLength);
      } else if (objectItem.category === "shield") {
        // Cyan shield crest badge
        const radius = Math.max(4, cellSize * 0.35);
        dynamicGraphics.lineStyle(1.5, 0x00e5ff, 0.95);
        dynamicGraphics.beginFill(0x003344, 0.8);
        dynamicGraphics.drawRoundedRect(objectScreenX - radius, objectScreenY - radius, radius * 2, radius * 2, 2);
        dynamicGraphics.endFill();
      } else if (objectItem.category === "weapon") {
        // Amber weapon star/diamond badge
        const radius = Math.max(4, cellSize * 0.35);
        dynamicGraphics.lineStyle(1.5, 0xffbb00, 0.95);
        dynamicGraphics.beginFill(0x332200, 0.85);
        dynamicGraphics.drawCircle(objectScreenX, objectScreenY, radius);
        dynamicGraphics.endFill();
      } else if (objectItem.category === "ammo") {
        // Orange ammo circle badge
        const radius = Math.max(3.5, cellSize * 0.3);
        dynamicGraphics.lineStyle(1.2, 0xff8800, 0.95);
        dynamicGraphics.beginFill(0xff8800, 0.7);
        dynamicGraphics.drawCircle(objectScreenX, objectScreenY, radius);
        dynamicGraphics.endFill();
      } else if (objectItem.category === "terminal") {
        // Cyan computer terminal / holotable diamond
        const size = Math.max(4, cellSize * 0.35);
        dynamicGraphics.lineStyle(1.5, 0x00ffff, 0.9);
        dynamicGraphics.beginFill(0x002233, 0.85);
        dynamicGraphics.moveTo(objectScreenX, objectScreenY - size);
        dynamicGraphics.lineTo(objectScreenX + size, objectScreenY);
        dynamicGraphics.lineTo(objectScreenX, objectScreenY + size);
        dynamicGraphics.lineTo(objectScreenX - size, objectScreenY);
        dynamicGraphics.closePath();
        dynamicGraphics.endFill();
      } else if (objectItem.category === "exit") {
        // Pulsing emerald exit badge
        const radius = Math.max(5, cellSize * 0.45);
        dynamicGraphics.lineStyle(2, 0x00ff88, 0.7 + 0.3 * pulseAlpha);
        dynamicGraphics.beginFill(0x00ff88, 0.3 + 0.3 * pulseAlpha);
        dynamicGraphics.drawCircle(objectScreenX, objectScreenY, radius);
        dynamicGraphics.endFill();
      } else if (objectItem.category === "stairs") {
        // High-visibility glowing stairs indicator on dynamic layer
        const isDown = objectItem.stairType === "down";
        const color = isDown ? 0xc084fc : 0x00e5ff;
        const halfSize = cellSize * 0.44;

        dynamicGraphics.lineStyle(1.5, color, 0.6 + 0.4 * pulseAlpha);
        dynamicGraphics.beginFill(color, 0.12 + 0.15 * pulseAlpha);
        dynamicGraphics.drawRoundedRect(objectScreenX - halfSize, objectScreenY - halfSize, halfSize * 2, halfSize * 2, 2);
        dynamicGraphics.endFill();
      }
    }

    // 3. Draw Discovered Level Finish / Exit Zones
    const finishZones = dataSource.getLevelFinishZones?.() || [];
    for (const zone of finishZones) {
      if (zone.enabled === false) continue;
      const zoneCellX = Math.floor((zone.x1 + zone.x2) / 2);
      const zoneCellY = Math.floor((zone.y1 + zone.y2) / 2);
      const zoneTileIndex = zoneCellY * mapWidth + zoneCellX;

      // Only draw if discovered
      if (!hasFog || discoveredTiles[zoneTileIndex] === 1) {
        const zoneScreenX = mapOffsetX + zone.x1 * cellSize;
        const zoneScreenY = mapOffsetY + zone.y1 * cellSize;
        const zoneScreenWidth = (zone.x2 - zone.x1) * cellSize;
        const zoneScreenHeight = (zone.y2 - zone.y1) * cellSize;

        dynamicGraphics.lineStyle(2, 0x00ff88, 0.7 + 0.3 * pulseAlpha);
        dynamicGraphics.beginFill(0x00ff88, 0.2 + 0.2 * pulseAlpha);
        dynamicGraphics.drawRect(zoneScreenX, zoneScreenY, zoneScreenWidth, zoneScreenHeight);
        dynamicGraphics.endFill();
      }
    }

    // 4. Draw Enemies (Visible if in discovered area or line-of-sight)
    let hostileCount = 0;
    if (options.showEnemies && dataSource.getActiveEnemies) {
      const enemies = dataSource.getActiveEnemies();
      for (const enemy of enemies) {
        if (enemy.isDead) continue;
        hostileCount++;

        const enemyCellX = Math.floor(enemy.x);
        const enemyCellY = Math.floor(enemy.y);
        const enemyTileIndex = enemyCellY * mapWidth + enemyCellX;

        if (hasFog && discoveredTiles[enemyTileIndex] !== 1) {
          continue;
        }

        const enemyScreenX = mapOffsetX + enemy.x * cellSize;
        const enemyScreenY = mapOffsetY + enemy.y * cellSize;
        const enemyRadius = Math.max(2.5, cellSize * 0.28);

        // Alerted pulse ring
        if (enemy.isAlerted) {
          dynamicGraphics.lineStyle(1.5, 0xff2222, 0.5 + 0.5 * pulseAlpha);
          dynamicGraphics.drawCircle(enemyScreenX, enemyScreenY, enemyRadius * 1.8);
        }

        // Hostile blip
        dynamicGraphics.lineStyle(1, 0xff7777, 1);
        dynamicGraphics.beginFill(0xff2222, 0.95);
        dynamicGraphics.drawCircle(enemyScreenX, enemyScreenY, enemyRadius);
        dynamicGraphics.endFill();
      }
    }

    // 5. Draw Player
    const player = dataSource.getPlayer();
    if (player) {
      const screenX = mapOffsetX + player.x * cellSize;
      const screenY = mapOffsetY + player.y * cellSize;
      const dirX = player.dirX;
      const dirY = player.dirY;

      // Vision cone / FOV indicator (60-degree spread wedge)
      if (options.showFovCone) {
        const coneDistance = cellSize * 2.8;
        const fovAngle = Math.PI / 3; // 60 deg
        const lookAngle = Math.atan2(dirY, dirX);
        const angleStart = lookAngle - fovAngle / 2;
        const angleEnd = lookAngle + fovAngle / 2;

        dynamicGraphics.lineStyle(1, 0x00ffff, 0.45);
        dynamicGraphics.beginFill(0x00e5ff, 0.12);
        dynamicGraphics.moveTo(screenX, screenY);
        dynamicGraphics.lineTo(screenX + Math.cos(angleStart) * coneDistance, screenY + Math.sin(angleStart) * coneDistance);
        dynamicGraphics.arc(screenX, screenY, coneDistance, angleStart, angleEnd);
        dynamicGraphics.lineTo(screenX, screenY);
        dynamicGraphics.endFill();
      }

      // Directional arrow / chevron
      const playerRadius = Math.max(3.5, cellSize * 0.38);
      const tipDistance = playerRadius * 1.6;
      const backDistance = playerRadius * 0.9;
      const wingDistance = playerRadius * 0.85;

      const norm = Math.hypot(dirX, dirY) || 1;
      const normalizedDirX = dirX / norm;
      const normalizedDirY = dirY / norm;
      const perpendicularDirX = -normalizedDirY;
      const perpendicularDirY = normalizedDirX;

      const tipX = screenX + normalizedDirX * tipDistance;
      const tipY = screenY + normalizedDirY * tipDistance;
      const leftX = screenX - normalizedDirX * backDistance + perpendicularDirX * wingDistance;
      const leftY = screenY - normalizedDirY * backDistance + perpendicularDirY * wingDistance;
      const rightX = screenX - normalizedDirX * backDistance - perpendicularDirX * wingDistance;
      const rightY = screenY - normalizedDirY * backDistance - perpendicularDirY * wingDistance;

      dynamicGraphics.lineStyle(1.5, 0xffffff, 1);
      dynamicGraphics.beginFill(0x00ffff, 0.95);
      dynamicGraphics.moveTo(tipX, tipY);
      dynamicGraphics.lineTo(leftX, leftY);
      dynamicGraphics.lineTo(screenX - normalizedDirX * (backDistance * 0.3), screenY - normalizedDirY * (backDistance * 0.3));
      dynamicGraphics.lineTo(rightX, rightY);
      dynamicGraphics.closePath();
      dynamicGraphics.endFill();
    }

    return hostileCount;
  }
}
