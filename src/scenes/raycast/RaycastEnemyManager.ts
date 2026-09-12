import { Assets, Container, Graphics, SCALE_MODES, Spritesheet } from "pixi.js";
import { sound } from "@pixi/sound";
import { RaycastEnemy } from "./RaycastEnemy";
import {
  IRaycastEnemyConfig,
  RaycastEnemyType,
  RaycastPickupType,
  RaycastWeaponType,
  getRaycastEnemyConfig,
  raycastEnemyConfigs,
  TileMeta,
} from "./types";
import { RaycastPickupManager } from "./RaycastPickupManager";
import { RaycastPlayerController } from "./RaycastPlayerController";
import { gameConfig } from "../../configs/GameConfig";
import { EnemyVoicelineManager } from "./EnemyVoicelineManager";
import { RaycastLaserManager } from "./RaycastLaserManager";

export class RaycastEnemyManager {
  private container: Container;
  private enemies: RaycastEnemy[] = [];
  private spritesheets: Record<string, Spritesheet> = {};
  private nextEnemyId: number = 1;
  private voicelineManager: EnemyVoicelineManager;

  private static readonly ENEMY_SFX_REGISTRY: Record<string, string> = {
    probe_droid_hovering: "assets/raycast/sfx/viper_droid/probe_droid_hovering.mp3",
    probe_droid_shot_1: "assets/raycast/sfx/viper_droid/probe_droid_shot_1.mp3",
    probe_droid_shot_2: "assets/raycast/sfx/viper_droid/probe_droid_shot_2.mp3",
    probe_droid_shot_3: "assets/raycast/sfx/viper_droid/probe_droid_shot_3.mp3",
    probe_droid_shot_4: "assets/raycast/sfx/viper_droid/probe_droid_shot_4.mp3",
    probe_droid_shot_5: "assets/raycast/sfx/viper_droid/probe_droid_shot_5.mp3",
    probe_droid_shot_6: "assets/raycast/sfx/viper_droid/probe_droid_shot_6.mp3",
    probe_droid_voice_1: "assets/raycast/sfx/viper_droid/probe_droid_voice_1.mp3",
    probe_droid_voice_2: "assets/raycast/sfx/viper_droid/probe_droid_voice_2.mp3",
    probe_droid_voice_3: "assets/raycast/sfx/viper_droid/probe_droid_voice_3.mp3",
    probe_droid_voice_4: "assets/raycast/sfx/viper_droid/probe_droid_voice_4.mp3",
    probe_droid_voice_5: "assets/raycast/sfx/viper_droid/probe_droid_voice_5.mp3",
    probe_droid_voice_6: "assets/raycast/sfx/viper_droid/probe_droid_voice_6.mp3",
    probe_droid_voice_7: "assets/raycast/sfx/viper_droid/probe_droid_voice_7.mp3",
    probe_droid_voice_8: "assets/raycast/sfx/viper_droid/probe_droid_voice_8.mp3",
    stormtrooper_pain_1: "assets/raycast/sfx/storm_trooper/stormtrooper_pain_1.mp3",
    stormtrooper_death_1: "assets/raycast/sfx/storm_trooper/stormtrooper_death_1.mp3",
    stormtrooper_grenade: "assets/raycast/sfx/storm_trooper/grenade_grenade.mp3",
    stormtrooper_hear_something: "assets/raycast/sfx/storm_trooper/i_hear_something.mp3",
    stormtrooper_rebel_scum: "assets/raycast/sfx/storm_trooper/rebel_scum.mp3",
    stormtrooper_there_he_is: "assets/raycast/sfx/storm_trooper/there_he_is.mp3",
    dh_17_blaster: "assets/sounds/dh_17_blaster.mp3",
    imperial_officer_death: "assets/raycast/sfx/imperial_officer/imperial_officer_death.mp3",
    officer_commando_damage: "assets/raycast/sfx/imperial_officer/officer_commando_damage.mp3",
    stop_right_there_scum: "assets/raycast/sfx/imperial_officer/stop_right_there_scum.mp3",
    troopers_blast_him: "assets/raycast/sfx/imperial_officer/troopers_blast_him.mp3",
  };

  constructor(container: Container) {
    this.container = container;
    this.voicelineManager = new EnemyVoicelineManager();
    this.ensureSoundsRegistered();
  }

  public ensureSoundsRegistered(): void {
    for (const [alias, src] of Object.entries(RaycastEnemyManager.ENEMY_SFX_REGISTRY)) {
      if (!sound.exists(alias)) {
        try {
          sound.add(alias, { url: src, preload: true });
        } catch {
          try {
            sound.add(alias, src);
          } catch {}
        }
      }
    }
  }

  public getVoicelineManager(): EnemyVoicelineManager {
    return this.voicelineManager;
  }

  public getAliveEnemies(): RaycastEnemy[] {
    return this.enemies.filter((e) => !e.isDead);
  }

  public onPlayerThrowGrenade(playerX: number, playerY: number): void {
    this.voicelineManager.onPlayerThrowGrenade(playerX, playerY, this.enemies);
  }

  public async initSpritesheets(): Promise<void> {
    this.ensureSoundsRegistered();

    for (const enemyConfig of Object.values(raycastEnemyConfigs)) {
      if (enemyConfig.spritesheet) {
        await this.loadEnemySpritesheet(enemyConfig.spritesheet, enemyConfig.type);
      }
    }
  }

  private async loadEnemySpritesheet(path: string, enemyType?: string): Promise<void> {
    const candidateKeys = [
      path,
      path.startsWith("./") ? path.substring(2) : `./${path}`,
      path.replace(/^assets\//, "./assets/"),
      enemyType || "",
    ].filter(Boolean);

    let sheet: Spritesheet | null = null;
    for (const k of candidateKeys) {
      if (this.spritesheets[k]) {
        sheet = this.spritesheets[k];
        break;
      }
      if (Assets.cache.has(k)) {
        sheet = Assets.get(k);
        break;
      }
    }

    if (!sheet) {
      for (const p of [path, `./${path}`, path.replace(/^\.\//, "")]) {
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
      for (const k of candidateKeys) {
        this.spritesheets[k] = sheet;
      }
      // Also register bare alias if available
      if (enemyType) {
        this.spritesheets[enemyType] = sheet;
      }
    }
  }

  public resolveEnemyConfigForTile(
    tileGid: number,
    firstgid: number = 1,
    tileMeta?: Record<number, TileMeta>,
    mapData?: {
      tilesets?: Array<{
        firstgid?: number;
        name?: string;
        tilecount?: number;
        tiles?: Array<{
          id: number;
          image?: string;
          type?: string;
          class?: string;
          properties?: Array<{ name: string; value: unknown }>;
        }>;
      }>;
    }
  ): IRaycastEnemyConfig {
    const localTileId = tileGid - firstgid;

    // 1. Check tileMeta if available
    if (tileMeta) {
      const meta = tileMeta[localTileId] || tileMeta[tileGid];
      if (meta) {
        if (meta.tileClass) {
          const cfg = getRaycastEnemyConfig(meta.tileClass);
          if (cfg && cfg.type !== RaycastEnemyType.STORMTROOPER) return cfg;
        }
        if (meta.type) {
          const cfg = getRaycastEnemyConfig(meta.type);
          if (cfg && cfg.type !== RaycastEnemyType.STORMTROOPER) return cfg;
        }
        if (meta.image) {
          const imgLower = meta.image.toLowerCase();
          if (imgLower.includes("viper") || imgLower.includes("probe") || imgLower.includes("droid")) {
            return raycastEnemyConfigs[RaycastEnemyType.VIPER_DROID];
          }
          if (imgLower.includes("officer")) {
            return raycastEnemyConfigs[RaycastEnemyType.IMPERIAL_OFFICER];
          }
          if (imgLower.includes("storm") || imgLower.includes("trooper")) {
            return raycastEnemyConfigs[RaycastEnemyType.STORMTROOPER];
          }
          const baseName = meta.image.replace(/\.[^/.]+$/, "");
          const cfg = getRaycastEnemyConfig(baseName);
          if (cfg) return cfg;
        }
      }
    }

    // 2. Check mapData.tilesets
    if (mapData?.tilesets) {
      for (const tileset of mapData.tilesets) {
        const fgid = tileset.firstgid ?? firstgid;
        const count = tileset.tilecount ?? Infinity;
        if (tileGid >= fgid && tileGid < fgid + count && tileset.tiles) {
          const tId = tileGid - fgid;
          const tileDef = tileset.tiles.find((t) => t.id === tId);
          if (tileDef) {
            if (tileDef.type || tileDef.class) {
              const cfg = getRaycastEnemyConfig((tileDef.type || tileDef.class)!);
              if (cfg) return cfg;
            }
            if (tileDef.properties) {
              for (const prop of tileDef.properties) {
                const pName = prop.name.toLowerCase();
                if (pName === "enemytype" || pName === "type" || pName === "name") {
                  const cfg = getRaycastEnemyConfig(String(prop.value));
                  if (cfg) return cfg;
                }
              }
            }
            if (tileDef.image) {
              const imgLower = tileDef.image.toLowerCase();
              if (imgLower.includes("viper") || imgLower.includes("probe") || imgLower.includes("droid")) {
                return raycastEnemyConfigs[RaycastEnemyType.VIPER_DROID];
              }
              if (imgLower.includes("officer")) {
                return raycastEnemyConfigs[RaycastEnemyType.IMPERIAL_OFFICER];
              }
              if (imgLower.includes("storm") || imgLower.includes("trooper")) {
                return raycastEnemyConfigs[RaycastEnemyType.STORMTROOPER];
              }
              const baseName = tileDef.image.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, "");
              if (baseName) {
                const cfg = getRaycastEnemyConfig(baseName);
                if (cfg) return cfg;
              }
            }
          }
        }
      }
    }

    // 3. Fallback tile ID mappings from StarWarsTileset
    if (localTileId === 22) {
      return raycastEnemyConfigs[RaycastEnemyType.VIPER_DROID];
    }
    if (localTileId === 11) {
      return raycastEnemyConfigs[RaycastEnemyType.STORMTROOPER];
    }

    return (
      raycastEnemyConfigs[RaycastEnemyType.STORMTROOPER] ||
      getRaycastEnemyConfig(RaycastEnemyType.STORMTROOPER)!
    );
  }

  public parseMapEnemies(
    mapData: {
      layers?: Array<{
        name?: string;
        data?: number[];
        objects?: Array<{
          x: number;
          y: number;
          gid?: number;
          type?: string;
          name?: string;
          properties?: Array<{ name: string; value: unknown }>;
        }>;
        layers?: Array<Record<string, unknown>>;
        width?: number;
        height?: number;
      }>;
      tilesets?: Array<{
        firstgid?: number;
        name?: string;
        tilecount?: number;
        tiles?: Array<{
          id: number;
          image?: string;
          type?: string;
          class?: string;
          properties?: Array<{ name: string; value: unknown }>;
        }>;
      }>;
    },
    firstgid: number = 1,
    tileMeta?: Record<number, TileMeta>
  ): void {
    // Clean up any existing enemies
    this.disposeEnemies();
    this.enemies = [];
    this.nextEnemyId = 1;

    // Flatten any layer groups recursively (e.g. Elevation groups)
    interface TiledLayerNode {
      name?: string;
      data?: number[];
      objects?: Array<{
        x: number;
        y: number;
        gid?: number;
        type?: string;
        name?: string;
        properties?: Array<{ name: string; value: unknown }>;
      }>;
      layers?: TiledLayerNode[];
      width?: number;
      height?: number;
    }

    const collectLayers = (layers: TiledLayerNode[]): TiledLayerNode[] => {
      let flat: TiledLayerNode[] = [];
      for (const l of layers) {
        if (l.layers && Array.isArray(l.layers)) {
          flat = flat.concat(collectLayers(l.layers));
        } else {
          flat.push(l);
        }
      }
      return flat;
    };

    const allLayers = collectLayers((mapData.layers || []) as TiledLayerNode[]);

    // Check for "Enemies" tile layers or object layers
    const enemyLayers = allLayers.filter(
      (layer: TiledLayerNode) =>
        layer.name &&
        (layer.name.toLowerCase().includes("enem") ||
          layer.name.toLowerCase().includes("monster") ||
          layer.name.toLowerCase().includes("trooper") ||
          layer.name.toLowerCase().includes("spawn"))
    );

    for (const layer of enemyLayers) {
      if (layer.data && layer.width) {
        const layerWidth = layer.width;
        // Tile Layer
        layer.data.forEach((tileGid: number, index: number) => {
          if (tileGid !== 0) {
            const x = (index % layerWidth) + 0.5;
            const y = Math.floor(index / layerWidth) + 0.5;
            const config = this.resolveEnemyConfigForTile(
              tileGid,
              firstgid,
              tileMeta,
              mapData
            );
            this.spawnEnemy(config, x, y);
          }
        });
      } else if (layer.objects) {
        // Object Layer
        for (const obj of layer.objects) {
          const x = obj.x / 64;
          const y = obj.y / 64;
          let config: IRaycastEnemyConfig | undefined;
          if (obj.gid !== undefined && obj.gid > 0) {
            config = this.resolveEnemyConfigForTile(
              obj.gid,
              firstgid,
              tileMeta,
              mapData
            );
          } else {
            const typeName = obj.type || obj.name || "stormtrooper";
            config =
              getRaycastEnemyConfig(typeName) ||
              raycastEnemyConfigs[RaycastEnemyType.STORMTROOPER];
          }
          if (config) {
            this.spawnEnemy(config, x, y);
          }
        }
      }
    }
  }

  public spawnEnemy(
    config: IRaycastEnemyConfig,
    x: number,
    y: number,
    spritesheet?: Spritesheet
  ): RaycastEnemy {
    const sheet =
      spritesheet ||
      this.spritesheets[config.spritesheet] ||
      this.spritesheets[`./${config.spritesheet}`] ||
      this.spritesheets[config.spritesheet.replace(/^\.\//, "")] ||
      this.spritesheets[config.type] ||
      (Assets.cache.has(config.spritesheet) ? Assets.get(config.spritesheet) : undefined) ||
      this.spritesheets["assets/raycast/enemies/storm_trooper.json"] ||
      this.spritesheets["storm_trooper"];
    const enemy = new RaycastEnemy(this.nextEnemyId++, config, x, y, sheet);

    if (enemy.animatedSprite) {
      // Per-enemy Graphics mask for partial wall occlusion
      const mask = new Graphics();
      this.container.addChild(mask);
      this.container.addChild(enemy.animatedSprite);
      enemy.animatedSprite.mask = mask;
      enemy.occlusionMask = mask;
    }

    enemy.onDeathCallback = (deadEnemy) => {
      this.voicelineManager.onEnemyDeath(deadEnemy.id);
    };

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

  /**
   * Checks if any active thin wall or door protector barrier intersects the line segment
   * between (x1, y1) and (x2, y2).
   */
  public isBlockedByDoorProtector(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    thinWalls?: Array<{ x1: number; y1: number; x2: number; y2: number; isDestructableWall?: boolean }>
  ): boolean {
    if (!thinWalls || thinWalls.length === 0) return false;

    const dxA = x2 - x1;
    const dyA = y2 - y1;
    if (Math.hypot(dxA, dyA) < 0.001) return false;

    for (let i = 0; i < thinWalls.length; i++) {
      const wall = thinWalls[i];
      const dxB = wall.x2 - wall.x1;
      const dyB = wall.y2 - wall.y1;
      const denom = dxA * dyB - dyA * dxB;
      if (Math.abs(denom) < 1e-6) continue;

      const deltaX = wall.x1 - x1;
      const deltaY = wall.y1 - y1;
      const s = (deltaX * dyB - deltaY * dxB) / denom;
      const t = (deltaX * dyA - deltaY * dxA) / denom;

      // s is progress from (x1, y1) to (x2, y2), t is along the wall segment
      if (s >= 0.001 && s <= 0.999 && t >= -0.05 && t <= 1.05) {
        return true;
      }
    }

    return false;
  }

  /**
   * Determines if the enemy has an unobstructed line of fire to the target.
   * Requires clear line of sight (no solid walls or closed doors) AND no door protectors / thin walls.
   */
  public hasLineOfFire(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    mapFlat: Int32Array,
    mapWidth: number,
    mapHeight: number,
    doorStatesFlat: Float64Array,
    thinWalls?: Array<{ x1: number; y1: number; x2: number; y2: number; isDestructableWall?: boolean }>
  ): boolean {
    if (!this.checkLineOfSight(x1, y1, x2, y2, mapFlat, mapWidth, mapHeight, doorStatesFlat)) {
      return false;
    }
    if (this.isBlockedByDoorProtector(x1, y1, x2, y2, thinWalls)) {
      return false;
    }
    return true;
  }

  /**
   * Traces a ray from start position along dirX, dirY using DDA to find the distance
   * to the first solid wall, closed door, or thin wall / door protector barrier, up to maxRange.
   */
  public findRayWallDistance(
    startX: number,
    startY: number,
    dirX: number,
    dirY: number,
    maxRange: number,
    mapFlat: Int32Array,
    mapWidth: number,
    mapHeight: number,
    doorStatesFlat: Float64Array,
    thinWalls?: Array<{ x1: number; y1: number; x2: number; y2: number; isDestructableWall?: boolean }>
  ): number {
    const rayDirX = dirX;
    const rayDirY = dirY;

    let mapX = Math.floor(startX);
    let mapY = Math.floor(startY);

    const deltaDistX = Math.abs(1 / (rayDirX === 0 ? 0.00001 : rayDirX));
    const deltaDistY = Math.abs(1 / (rayDirY === 0 ? 0.00001 : rayDirY));

    let stepX: number;
    let stepY: number;
    let sideDistX: number;
    let sideDistY: number;

    if (rayDirX < 0) {
      stepX = -1;
      sideDistX = (startX - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1 - startX) * deltaDistX;
    }

    if (rayDirY < 0) {
      stepY = -1;
      sideDistY = (startY - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1 - startY) * deltaDistY;
    }

    let currentDist = 0;
    let solidWallDist = maxRange;

    while (currentDist < maxRange) {
      if (sideDistX < sideDistY) {
        currentDist = sideDistX;
        sideDistX += deltaDistX;
        mapX += stepX;
      } else {
        currentDist = sideDistY;
        sideDistY += deltaDistY;
        mapY += stepY;
      }

      if (currentDist >= maxRange) break;

      if (mapX < 0 || mapX >= mapWidth || mapY < 0 || mapY >= mapHeight) {
        solidWallDist = currentDist;
        break;
      }

      const flatIdx = mapY * mapWidth + mapX;
      const tile = mapFlat[flatIdx];

      if (tile > 0) {
        const doorState = doorStatesFlat[flatIdx];
        if (doorState !== undefined && Math.abs(doorState) >= 0.8) {
          continue; // Open door
        }
        solidWallDist = currentDist; // Solid wall or closed door
        break;
      }
    }

    let closestDist = solidWallDist;

    // Check intersection with active thin walls / door protectors along the ray
    if (thinWalls && thinWalls.length > 0) {
      for (let i = 0; i < thinWalls.length; i++) {
        const wall = thinWalls[i];
        const dxW = wall.x2 - wall.x1;
        const dyW = wall.y2 - wall.y1;
        const denom = dxW * rayDirY - dyW * rayDirX;
        if (Math.abs(denom) < 1e-6) continue;

        const u = ((startX - wall.x1) * dyW - (startY - wall.y1) * dxW) / denom;
        if (u < 0.01 || u >= closestDist) continue;

        const t = ((startX - wall.x1) * rayDirY - (startY - wall.y1) * rayDirX) / denom;
        if (t >= -0.05 && t <= 1.05) {
          closestDist = u;
        }
      }
    }

    return closestDist;
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

    // Check collision against thin walls (preventing walking through them)
    // We treat the thin wall as a line segment and ensure the enemy's bounding box doesn't cross it
    for (const wall of thinWalls) {
      // Create a slightly expanded bounding box around the wall segment to act as collision thickness
      const wallThickness = 0.1; 
      const minX = Math.min(wall.x1, wall.x2) - wallThickness;
      const maxX = Math.max(wall.x1, wall.x2) + wallThickness;
      const minY = Math.min(wall.y1, wall.y2) - wallThickness;
      const maxY = Math.max(wall.y1, wall.y2) + wallThickness;

      if (
        newX + radius > minX &&
        newX - radius < maxX &&
        newY + radius > minY &&
        newY - radius < maxY
      ) {
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
    pickupManager: RaycastPickupManager,
    laserManager?: RaycastLaserManager
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

    const lofChecker = (x1: number, y1: number, x2: number, y2: number) =>
      this.hasLineOfFire(
        x1,
        y1,
        x2,
        y2,
        mapFlat,
        mapWidth,
        mapHeight,
        doorStatesFlat,
        thinWalls
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
      enemy: RaycastEnemy,
      damage: number,
      accuracy: number,
      distance: number
    ) => {
      // Fix: Ray starts from enemy to player, checking if blocked by thin wall
      if (this.isBlockedByDoorProtector(enemy.x, enemy.y, playerX, playerY, thinWalls)) {
        return;
      }

      if (!laserManager) {
        // Fallback hitscan if no laser manager
        const effectiveAccuracy = Math.max(
          0.2,
          Math.min(0.9, accuracy - (distance / 20) * 0.3)
        );
        if (Math.random() <= effectiveAccuracy) {
          playerController.takeDamage(damage);
        }
        return;
      }

      // Calculate direction from enemy to player
      const dx = playerX - enemy.x;
      const dy = playerY - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 0.001) return;

      const normX = dx / dist;
      const normY = dy / dist;
      const perpX = -normY;
      const perpY = normX;

      const effectiveAccuracy = Math.max(
        0.25,
        Math.min(0.85, accuracy - (dist / 20) * 0.25)
      );
      const isHit = Math.random() <= effectiveAccuracy;

      let aimDirX: number;
      let aimDirY: number;

      if (isHit) {
        // Direct shot towards player with tiny organic jitter (+/- 0.06)
        const jitter = (Math.random() - 0.5) * 0.06;
        aimDirX = normX + perpX * jitter;
        aimDirY = normY + perpY * jitter;
      } else {
        // Inaccurate shot: purposefully aims slightly wide to whiz past player
        const side = Math.random() > 0.5 ? 1 : -1;
        const missOffset = side * (0.35 + Math.random() * 0.45);
        aimDirX = normX + perpX * (missOffset / dist);
        aimDirY = normY + perpY * (missOffset / dist);
      }

      // Normalize aim vector
      const aimLen = Math.hypot(aimDirX, aimDirY);
      aimDirX /= aimLen;
      aimDirY /= aimLen;

      // Find where this laser will hit a wall, door, or door protector (or max range)
      const maxTraceDist = dist + 16.0;
      const wallDist = this.findRayWallDistance(
        enemy.x,
        enemy.y,
        aimDirX,
        aimDirY,
        maxTraceDist,
        mapFlat,
        mapWidth,
        mapHeight,
        doorStatesFlat,
        thinWalls
      );

      const targetDist = Math.max(0.5, wallDist);
      const targetX = enemy.x + aimDirX * targetDist;
      const targetY = enemy.y + aimDirY * targetDist;
      const targetZ = 0.5;

      laserManager.fireEnemyLaser(
        enemy.x,
        enemy.y,
        enemy.config.shootHeight ?? 0.55,
        targetX,
        targetY,
        targetZ,
        damage,
        (dmg) => {
          playerController.takeDamage(dmg);
        }
      );
    };

    for (const enemy of this.enemies) {
      const dx = playerX - enemy.x;
      const dy = playerY - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const los = losChecker(enemy.x, enemy.y, playerX, playerY);

      enemy.update(
        delta,
        playerX,
        playerY,
        losChecker,
        moveChecker,
        onShootPlayer,
        lofChecker
      );

      // Trigger stormtrooper voicelines based on visibility & proximity
      this.voicelineManager.onEnemyUpdate(
        enemy,
        playerX,
        playerY,
        los,
        dist
      );

      // Handle weapon drop on death
      if (enemy.isDead && !enemy.hasDroppedLoot && enemy.config.dropWeapon !== undefined) {
        const shouldDrop =
          enemy.config.dropChance === undefined ||
          Math.random() <= enemy.config.dropChance;

        if (shouldDrop) {
          enemy.hasDroppedLoot = true;
          const dropAmmo = enemy.config.dropAmmo ?? 20;
          const dropWeapon = enemy.config.dropWeapon ?? RaycastWeaponType.E11;
          pickupManager.spawnPickup(
            RaycastPickupType.WEAPON,
            enemy.x,
            enemy.y,
            dropAmmo,
            dropWeapon
          );
        }
      }
    }

    // Update queue, concurrency, and spacing for stormtrooper voicelines
    this.voicelineManager.update(delta, playerX, playerY);
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

      if (drawStartX > drawEndX) {
        sprite.visible = false;
        continue;
      }

      // Per-column occlusion mask: draw only columns where enemy is in front of wall or under opening door
      const mask = enemy.occlusionMask;
      if (mask) {
        mask.clear();

        let runStart = -1;
        let runTopY = -1;
        let hasDrawnAnyRun = false;

        for (let col = drawStartX; col <= drawEndX; col++) {
          if (transformY < zBuffer[col]) {
            let topY = 0;
            if (doorDistBuffer && doorBottomBuffer && doorDistBuffer[col] < transformY) {
              topY = Math.max(0, Math.floor(doorBottomBuffer[col]));
            }
            if (topY < screenH) {
              if (runStart >= 0 && topY === runTopY) {
                // Continue current horizontal run
              } else {
                if (runStart >= 0) {
                  mask.beginFill(0xffffff);
                  mask.drawRect(runStart, runTopY, col - runStart, screenH - runTopY);
                  mask.endFill();
                  hasDrawnAnyRun = true;
                }
                runStart = col;
                runTopY = topY;
              }
            } else {
              // topY >= screenH: door panel completely covers column down to floor
              if (runStart >= 0) {
                mask.beginFill(0xffffff);
                mask.drawRect(runStart, runTopY, col - runStart, screenH - runTopY);
                mask.endFill();
                hasDrawnAnyRun = true;
                runStart = -1;
              }
            }
          } else {
            // Occluded by wall
            if (runStart >= 0) {
              mask.beginFill(0xffffff);
              mask.drawRect(runStart, runTopY, col - runStart, screenH - runTopY);
              mask.endFill();
              hasDrawnAnyRun = true;
              runStart = -1;
            }
          }
        }
        // Flush last open run
        if (runStart >= 0) {
          mask.beginFill(0xffffff);
          mask.drawRect(runStart, runTopY, drawEndX - runStart + 1, screenH - runTopY);
          mask.endFill();
          hasDrawnAnyRun = true;
        }

        if (!hasDrawnAnyRun && drawStartX <= drawEndX) {
          sprite.visible = false;
          continue;
        }
      }

      sprite.visible = true;
      sprite.x = spriteScreenX;
      let renderY = floorY;
      const vOffset = enemy.currentVOffset !== undefined ? enemy.currentVOffset : (enemy.isDead ? 0 : (enemy.config.vOffset ?? 0));
      if (vOffset > 0) {
        renderY -= vOffset * baseHeight;
      }
      if (enemy.config.floatingBob && !enemy.isDead) {
        renderY -= Math.sin((Date.now() + enemy.id * 500) / 350) * 0.03 * baseHeight;
      }
      sprite.y = Math.floor(renderY);
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
      if (enemy.occlusionMask) {
        enemy.occlusionMask.zIndex = sprite.zIndex;
      }
    }
  }

  public handlePlayerShot(
    playerX: number,
    playerY: number,
    dirX: number,
    dirY: number,
    damage: number,
    wallDistance: number,
    onEnemyKilled?: (enemy: RaycastEnemy) => void,
    thinWalls?: Array<{ x1: number; y1: number; x2: number; y2: number; isDestructableWall?: boolean }>
  ): RaycastEnemy | null {
    let closestEnemy: RaycastEnemy | null = null;
    let closestDist = wallDistance;
    const hitRadius = 0.45;

    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      // Fixed: player to enemy ray direction
      if (thinWalls && this.isBlockedByDoorProtector(playerX, playerY, enemy.x, enemy.y, thinWalls)) {
        continue;
      }

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
      closestEnemy.takeDamage(damage, onEnemyKilled, playerX, playerY);
      return closestEnemy;
    }

    return null;
  }

  public get activeEnemies(): RaycastEnemy[] {
    return this.enemies.filter((e) => !e.isDead);
  }

  public applyAreaDamage(
    centerX: number,
    centerY: number,
    radius: number,
    maxDamage: number,
    onEnemyKilled?: (enemy: RaycastEnemy) => void,
    thinWalls?: Array<{ x1: number; y1: number; x2: number; y2: number; isDestructableWall?: boolean }>
  ): RaycastEnemy[] {
    const hitEnemies: RaycastEnemy[] = [];
    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      const dx = enemy.x - centerX;
      const dy = enemy.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        // Fixed: center of explosion to enemy coordinate check
        if (thinWalls && this.isBlockedByDoorProtector(centerX, centerY, enemy.x, enemy.y, thinWalls)) {
          continue;
        }
        const falloff = 1 - dist / radius;
        const damage = Math.max(15, Math.round(maxDamage * falloff));
        enemy.takeDamage(damage, onEnemyKilled, centerX, centerY);
        hitEnemies.push(enemy);
      }
    }
    return hitEnemies;
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
    this.voicelineManager.dispose();
    this.spritesheets = {};
  }
}
