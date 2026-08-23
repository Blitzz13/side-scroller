import { Assets, Container, Graphics, SCALE_MODES, Spritesheet } from "pixi.js";
import { RaycastEnemy } from "./RaycastEnemy";
import {
  IRaycastEnemyConfig,
  RaycastEnemyType,
  RaycastPickupType,
  getRaycastEnemyConfig,
} from "./types";
import { RaycastPickupManager } from "./RaycastPickupManager";
import { RaycastPlayerController } from "./RaycastPlayerController";
import { gameConfig } from "../../configs/GameConfig";

export class RaycastEnemyManager {
  private container: Container;
  private enemies: RaycastEnemy[] = [];
  private spritesheets: Record<string, Spritesheet> = {};
  private nextEnemyId: number = 1;

  constructor(container: Container) {
    this.container = container;
  }

  public async initSpritesheets(): Promise<void> {
    try {
      const sheet = await Assets.load("assets/storm_trooper.json");
      if (sheet) {
        if (sheet.baseTexture) {
          sheet.baseTexture.scaleMode = SCALE_MODES.NEAREST;
        }
        this.spritesheets["assets/storm_trooper.json"] = sheet;
      }
    } catch (err) {
      console.warn("Failed to load storm_trooper spritesheet:", err);
    }
  }

  public parseMapEnemies(
    mapData: any,
    firstgid: number = 1
  ): void {
    // Clean up any existing enemies
    this.disposeEnemies();
    this.enemies = [];
    this.nextEnemyId = 1;

    const sheet = this.spritesheets["assets/storm_trooper.json"];

    // Check for "Enemies" tile layers or object layers
    const enemyLayers = (mapData.layers || []).filter(
      (layer: any) =>
        layer.name &&
        (layer.name.toLowerCase().includes("enem") ||
          layer.name.toLowerCase().includes("monster") ||
          layer.name.toLowerCase().includes("trooper") ||
          layer.name.toLowerCase().includes("spawn"))
    );

    for (const layer of enemyLayers) {
      if (layer.data) {
        // Tile Layer
        layer.data.forEach((tileGid: number, index: number) => {
          if (tileGid !== 0) {
            const x = (index % layer.width) + 0.5;
            const y = Math.floor(index / layer.width) + 0.5;
            const config = getRaycastEnemyConfig(RaycastEnemyType.STORMTROOPER)!;
            this.spawnEnemy(config, x, y, sheet);
          }
        });
      } else if (layer.objects) {
        // Object Layer
        for (const obj of layer.objects) {
          const x = obj.x / 64;
          const y = obj.y / 64;
          const typeName = obj.type || obj.name || "stormtrooper";
          const config =
            getRaycastEnemyConfig(typeName) ||
            getRaycastEnemyConfig(RaycastEnemyType.STORMTROOPER)!;
          this.spawnEnemy(config, x, y, sheet);
        }
      }
    }

    // Fallback: spawn at least one Stormtrooper for immediate testing if layer empty
    if (this.enemies.length === 0) {
      const config = getRaycastEnemyConfig(RaycastEnemyType.STORMTROOPER)!;
      this.spawnEnemy(config, 10.5, 10.5, sheet);
    }
  }

  public spawnEnemy(
    config: IRaycastEnemyConfig,
    x: number,
    y: number,
    spritesheet?: Spritesheet
  ): RaycastEnemy {
    const sheet = spritesheet || this.spritesheets[config.spritesheet] || this.spritesheets["assets/storm_trooper.json"];
    const enemy = new RaycastEnemy(this.nextEnemyId++, config, x, y, sheet);

    if (enemy.animatedSprite) {
      // Per-enemy Graphics mask for partial wall occlusion
      const mask = new Graphics();
      this.container.addChild(mask);
      this.container.addChild(enemy.animatedSprite);
      enemy.animatedSprite.mask = mask;
      enemy.occlusionMask = mask;
    }

    this.enemies.push(enemy);
    return enemy;
  }

  public checkLineOfSight(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    mapFlat: Int32Array,
    mapWidth: number,
    mapHeight: number,
    doorStatesFlat: Float64Array
  ): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 0.001) return true;

    const rayDirX = dx / distance;
    const rayDirY = dy / distance;

    let mapX = Math.floor(x1);
    let mapY = Math.floor(y1);

    const deltaDistX = Math.abs(1 / rayDirX);
    const deltaDistY = Math.abs(1 / rayDirY);

    let stepX: number, stepY: number, sideDistX: number, sideDistY: number;

    if (rayDirX < 0) {
      stepX = -1;
      sideDistX = (x1 - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1 - x1) * deltaDistX;
    }

    if (rayDirY < 0) {
      stepY = -1;
      sideDistY = (y1 - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1 - y1) * deltaDistY;
    }

    let currentDist = 0;

    while (currentDist < distance) {
      if (sideDistX < sideDistY) {
        currentDist = sideDistX;
        sideDistX += deltaDistX;
        mapX += stepX;
      } else {
        currentDist = sideDistY;
        sideDistY += deltaDistY;
        mapY += stepY;
      }

      if (currentDist >= distance) break;

      if (mapX < 0 || mapX >= mapWidth || mapY < 0 || mapY >= mapHeight) {
        return false;
      }

      const flatIdx = mapY * mapWidth + mapX;
      const tile = mapFlat[flatIdx];

      if (tile > 0) {
        const doorState = doorStatesFlat[flatIdx];
        if (doorState !== undefined && Math.abs(doorState) >= 0.8) {
          continue; // Open door
        }
        return false; // Solid wall or closed door
      }
    }

    return true;
  }

  public tryMoveEnemy(
    enemy: RaycastEnemy,
    newX: number,
    newY: number,
    mapFlat: Int32Array,
    mapWidth: number,
    mapHeight: number,
    doorStatesFlat: Float64Array,
    thinWalls: Array<{ x1: number; y1: number; x2: number; y2: number }>
  ): boolean {
    const radius = 0.28;

    const samplePoints = [
      [newX - radius, newY - radius],
      [newX + radius, newY - radius],
      [newX - radius, newY + radius],
      [newX + radius, newY + radius],
    ];

    for (const [sx, sy] of samplePoints) {
      const cellX = Math.floor(sx);
      const cellY = Math.floor(sy);

      if (cellX < 0 || cellX >= mapWidth || cellY < 0 || cellY >= mapHeight) {
        return false;
      }

      const flatIdx = cellY * mapWidth + cellX;
      const tile = mapFlat[flatIdx];

      if (tile > 0) {
        const doorState = doorStatesFlat[flatIdx];
        const isOpenDoor = doorState !== undefined && Math.abs(doorState) > 0.5;
        if (!isOpenDoor) return false;
      }
    }

    for (const wall of thinWalls) {
      const minX = Math.min(wall.x1, wall.x2) - radius;
      const maxX = Math.max(wall.x1, wall.x2) + radius;
      const minY = Math.min(wall.y1, wall.y2) - radius;
      const maxY = Math.max(wall.y1, wall.y2) + radius;

      if (newX >= minX && newX <= maxX && newY >= minY && newY <= maxY) {
        return false;
      }
    }

    enemy.x = newX;
    enemy.y = newY;
    return true;
  }

  public update(
    delta: number,
    playerX: number,
    playerY: number,
    mapFlat: Int32Array,
    mapWidth: number,
    mapHeight: number,
    doorStatesFlat: Float64Array,
    thinWalls: Array<{ x1: number; y1: number; x2: number; y2: number }>,
    playerController: RaycastPlayerController,
    pickupManager: RaycastPickupManager
  ): void {
    const losChecker = (x1: number, y1: number, x2: number, y2: number) =>
      this.checkLineOfSight(
        x1,
        y1,
        x2,
        y2,
        mapFlat,
        mapWidth,
        mapHeight,
        doorStatesFlat
      );

    const moveChecker = (enemy: RaycastEnemy, nx: number, ny: number) =>
      this.tryMoveEnemy(
        enemy,
        nx,
        ny,
        mapFlat,
        mapWidth,
        mapHeight,
        doorStatesFlat,
        thinWalls
      );

    const onShootPlayer = (
      damage: number,
      accuracy: number,
      distance: number
    ) => {
      const effectiveAccuracy = Math.max(
        0.2,
        Math.min(0.9, accuracy - (distance / 20) * 0.3)
      );
      if (Math.random() <= effectiveAccuracy) {
        playerController.takeDamage(damage);
      }
    };

    for (const enemy of this.enemies) {
      enemy.update(
        delta,
        playerX,
        playerY,
        losChecker,
        moveChecker,
        onShootPlayer
      );

      // Handle weapon drop on death
      if (enemy.isDead && !enemy.hasDroppedLoot && enemy.config.dropWeapon !== undefined) {
        const shouldDrop =
          enemy.config.dropChance === undefined ||
          Math.random() <= enemy.config.dropChance;

        if (shouldDrop) {
          enemy.hasDroppedLoot = true;
          pickupManager.spawnPickup(
            RaycastPickupType.WEAPON,
            enemy.x,
            enemy.y,
            enemy.config.dropWeapon,
            enemy.config.dropAmmo ?? 20
          );
        }
      }
    }
  }

  public render(
    playerX: number,
    playerY: number,
    dirX: number,
    dirY: number,
    planeX: number,
    planeY: number,
    zBuffer: Float64Array,
    maxRenderDistance: number
  ): void {
    const screenW = gameConfig.width;
    const screenH = gameConfig.height;
    const invDet = 1.0 / (planeX * dirY - dirX * planeY);

    for (const enemy of this.enemies) {
      const sprite = enemy.animatedSprite;
      if (!sprite) continue;

      const dx = enemy.x - playerX;
      const dy = enemy.y - playerY;

      // Transform into camera space
      const transformX = invDet * (dirY * dx - dirX * dy);
      const transformY = invDet * (-planeY * dx + planeX * dy);

      // Frustum culling: must be in front of player and within max render distance
      if (transformY <= 0.1 || transformY > maxRenderDistance) {
        sprite.visible = false;
        continue;
      }

      // Update orientation and animation frame
      enemy.updateAnimation(playerX, playerY);

      const spriteScreenX = Math.floor(
        (screenW / 2) * (1 + transformX / transformY)
      );
      const baseHeight = Math.abs(Math.floor(screenH / transformY));
      const refHeight = enemy.config.referenceHeight ?? 67;

      const curTex = sprite.texture;
      const texW = curTex ? (curTex.orig?.width || curTex.width || 32) : 32;
      const texH = curTex ? (curTex.orig?.height || curTex.height || 64) : 64;

      const spriteHeight = Math.max(
        1,
        Math.floor(baseHeight * enemy.config.scale * (texH / refHeight))
      );
      const spriteWidth = Math.max(
        1,
        Math.floor(baseHeight * enemy.config.scale * (texW / refHeight))
      );

      const floorY = Math.floor(screenH / 2 + baseHeight / 2);
      const halfW = spriteWidth / 2;

      // Compute visible screen columns for this sprite
      const drawStartX = Math.max(0, Math.floor(spriteScreenX - halfW));
      const drawEndX = Math.min(screenW - 1, Math.floor(spriteScreenX + halfW));

      // Per-column occlusion mask: draw only columns where enemy is in front of wall
      const mask = enemy.occlusionMask;
      if (mask) {
        mask.clear();

        let runStart = -1;
        for (let col = drawStartX; col <= drawEndX; col++) {
          if (transformY < zBuffer[col]) {
            // This column is visible
            if (runStart < 0) runStart = col;
          } else {
            // This column is occluded; flush any open run
            if (runStart >= 0) {
              mask.beginFill(0xffffff);
              mask.drawRect(runStart, 0, col - runStart, screenH);
              mask.endFill();
              runStart = -1;
            }
          }
        }
        // Flush last open run
        if (runStart >= 0) {
          mask.beginFill(0xffffff);
          mask.drawRect(runStart, 0, drawEndX - runStart + 1, screenH);
          mask.endFill();
        }

        // If mask is completely empty, sprite is fully occluded
        if (runStart < 0 && drawStartX <= drawEndX) {
          // Check if we ever drew anything
          let anyVisible = false;
          for (let col = drawStartX; col <= drawEndX; col++) {
            if (transformY < zBuffer[col]) {
              anyVisible = true;
              break;
            }
          }
          if (!anyVisible) {
            sprite.visible = false;
            continue;
          }
        }
      }

      sprite.visible = true;
      sprite.x = spriteScreenX;
      sprite.y = floorY;
      sprite.width = spriteWidth;
      sprite.height = spriteHeight;

      // Re-apply flipX scale after dimension updates
      if (enemy.isFlipped) {
        sprite.scale.x = -Math.abs(sprite.scale.x);
      } else {
        sprite.scale.x = Math.abs(sprite.scale.x);
      }

      // Distance shading & damage tint
      const shade = Math.max(
        0.18,
        Math.min(1.0, 1.0 - (transformY / maxRenderDistance) * 0.75)
      );
      if (enemy.painTimer > 0) {
        sprite.tint = 0xff4444;
      } else {
        const shadeInt = (shade * 255) | 0;
        sprite.tint = (shadeInt << 16) | (shadeInt << 8) | shadeInt;
      }

      // Depth sorting
      sprite.zIndex = Math.floor((maxRenderDistance - transformY) * 1000);
    }
  }

  public handlePlayerShot(
    playerX: number,
    playerY: number,
    dirX: number,
    dirY: number,
    damage: number,
    wallDistance: number,
    onEnemyKilled?: (enemy: RaycastEnemy) => void
  ): RaycastEnemy | null {
    let closestEnemy: RaycastEnemy | null = null;
    let closestDist = wallDistance;
    const hitRadius = 0.45;

    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;

      const dx = enemy.x - playerX;
      const dy = enemy.y - playerY;
      const t = dx * dirX + dy * dirY;

      if (t > 0.1 && t < closestDist) {
        const perpDist = Math.abs(dx * -dirY + dy * dirX);

        if (perpDist <= hitRadius) {
          closestDist = t;
          closestEnemy = enemy;
        }
      }
    }

    if (closestEnemy) {
      const killed = closestEnemy.takeDamage(damage, onEnemyKilled);
      if (killed && onEnemyKilled) {
        onEnemyKilled(closestEnemy);
      }
      return closestEnemy;
    }

    return null;
  }

  public get activeEnemies(): RaycastEnemy[] {
    return this.enemies.filter((e) => !e.isDead);
  }

  private disposeEnemies(): void {
    for (const enemy of this.enemies) {
      if (enemy.occlusionMask) {
        this.container.removeChild(enemy.occlusionMask);
      }
      if (enemy.animatedSprite) {
        this.container.removeChild(enemy.animatedSprite);
      }
      enemy.dispose();
    }
    this.enemies = [];
  }

  public dispose(): void {
    this.disposeEnemies();
    this.spritesheets = {};
  }
}
