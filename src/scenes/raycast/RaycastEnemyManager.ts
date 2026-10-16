import { Assets, Container, Graphics, MIPMAP_MODES, SCALE_MODES, Spritesheet } from "pixi.js";
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
  IEnemyItemDrop,
} from "./types";
import { RaycastPickupManager } from "./RaycastPickupManager";
import { RaycastPlayerController } from "./RaycastPlayerController";
import { gameConfig } from "../../configs/GameConfig";
import { EnemyVoicelineManager } from "./EnemyVoicelineManager";
import { RaycastLaserManager } from "./RaycastLaserManager";
import { extractTiledGidAndRotation, forEachTileInLayer } from "./tiledUtils";
import { AStarPathfinder, AStarPathFollower, IAStarGrid } from "../../plugins/pathfinding";

export interface IEnemyWaveConfig {
  maxWaves?: number;
  enemiesPerWave: number;
  enemyThreshold?: number;
  spawnIntervalSeconds?: number;
  waveCooldownSeconds?: number;
  /** @deprecated Use spawnIntervalSeconds */
  spawnIntervalFrames?: number;
  /** @deprecated Use waveCooldownSeconds */
  waveCooldownFrames?: number;
}

export class RaycastEnemyManager {
  public static readonly ALERT_AWARENESS_RADIUS: number = 24.0;

  private container: Container;
  private enemies: RaycastEnemy[] = [];
  private astar?: AStarPathfinder;
  private spritesheets: Record<string, Spritesheet> = {};
  private nextEnemyId: number = 1;
  private voicelineManager: EnemyVoicelineManager;
  private onKillCallback?: (killedEnemy: RaycastEnemy, killedCount: number, totalCount: number) => void;
  private onAlertCallback?: (alertedEnemy: RaycastEnemy) => void;
  private cachedMapFlat?: Int32Array;
  private cachedMapWidth: number = 0;
  private cachedMapHeight: number = 0;
  private cachedDoorStatesFlat?: Float64Array;
  private cachedTileTypeFlags?: Uint8Array;
  private cachedThinWalls?: Array<{ x1: number; y1: number; x2: number; y2: number; isDestructableWall?: boolean }>;
  private cachedLockedDoors?: Record<string, string>;

  // Alert and Wave Spawning state
  public isAlertActive: boolean = false;
  private enemySpawnPoints: Array<{ x: number; y: number }> = [];
  private waveEnemyIds: Set<number> = new Set();
  private waveConfig: IEnemyWaveConfig = {
    maxWaves: Infinity, // Continuous endless waves while base alert is active
    enemiesPerWave: 6,
    enemyThreshold: 20, // Concurrency limit to prevent performance degradation
    spawnIntervalSeconds: 1.15, // ~1.15s
    waveCooldownSeconds: 10.0, // ~10s
    spawnIntervalFrames: 70, // legacy fallback alias
    waveCooldownFrames: 600, // legacy fallback alias
  };
  private wavesSpawned: number = 0;
  private currentWaveRemaining: number = 0;
  private spawnIntervalTimer: number = 0;
  private waveCooldownTimer: number = 0;
  private activeWaveSpawnPoint: { x: number; y: number } | null = null;

  // BFS Pathfinding grid
  private bfsDistGrid?: Int16Array;
  private lastBfsPlayerCellX: number = -1;
  private lastBfsPlayerCellY: number = -1;
  private bfsUpdateTimer: number = 0; // Update timer in seconds

  private onEnemyOpenDoorCallback?: (cellX: number, cellY: number, enemyX?: number, enemyY?: number) => boolean;
  private onWaveStartCallback?: (waveNumber: number, maxWaves?: number, spawnPoint?: { x: number; y: number }) => void;
  private onAlertClearedCallback?: () => void;

  public get totalEnemies(): number {
    return this.enemies.length;
  }

  public get killedEnemies(): number {
    return this.enemies.filter((e) => e.isDead).length;
  }

  public setOnKillCallback(
    cb: (killedEnemy: RaycastEnemy, killedCount: number, totalCount: number) => void
  ): void {
    this.onKillCallback = cb;
  }

  public setOnAlertCallback(
    cb: (alertedEnemy: RaycastEnemy) => void
  ): void {
    this.onAlertCallback = cb;
  }

  public setEnemySpawnPoints(points: Array<{ x: number; y: number }>): void {
    this.enemySpawnPoints = [...points];
  }

  public getEnemySpawnPoints(): Array<{ x: number; y: number }> {
    return this.enemySpawnPoints;
  }

  public setWaveConfig(config: Partial<IEnemyWaveConfig>): void {
    this.waveConfig = { ...this.waveConfig, ...config };
  }

  public getWaveConfig(): IEnemyWaveConfig {
    return { ...this.waveConfig };
  }

  public resetWaveSpawner(): void {
    this.wavesSpawned = 0;
    this.currentWaveRemaining = 0;
    this.spawnIntervalTimer = 0;
    this.waveCooldownTimer = 0;
    this.activeWaveSpawnPoint = null;
    this.waveEnemyIds.clear();
  }

  public setOnEnemyOpenDoorCallback(cb: (cellX: number, cellY: number, enemyX?: number, enemyY?: number) => boolean): void {
    this.onEnemyOpenDoorCallback = cb;
  }

  public setOnWaveStartCallback(
    cb: (waveNumber: number, maxWaves?: number, spawnPoint?: { x: number; y: number }) => void
  ): void {
    this.onWaveStartCallback = cb;
  }

  public setOnAlertClearedCallback(cb: () => void): void {
    this.onAlertClearedCallback = cb;
  }

  public setAlertActive(active: boolean, playerX?: number, playerY?: number): void {
    this.isAlertActive = active;
    if (active) {
      this.resetWaveSpawner();
      this.waveCooldownTimer = 2.0; // 2 seconds delay before wave 1 begins

      if (playerX !== undefined && playerY !== undefined) {
        for (const enemy of this.enemies) {
          if (!enemy.isDead && enemy.config.type !== RaycastEnemyType.DIAGONA) {
            const dist = Math.hypot(enemy.x - playerX, enemy.y - playerY);
            if (dist <= RaycastEnemyManager.ALERT_AWARENESS_RADIUS) {
              enemy.alert(playerX, playerY, true);
              enemy.hasTarget = true;
              enemy.lastKnownPlayerX = playerX;
              enemy.lastKnownPlayerY = playerY;
              enemy.searchTimer = enemy.lostSightDuration;
              if (enemy.state === "idle") {
                enemy.state = "chase";
              }
            }
          }
        }
      }
    } else {
      this.resetWaveSpawner();
    }
  }

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
    imperial_officer_death: "assets/raycast/sfx/imperial_officer_commando/imperial_officer_death.mp3",
    officer_commando_damage: "assets/raycast/sfx/imperial_officer_commando/officer_commando_damage.mp3",
    stop_right_there_scum: "assets/raycast/sfx/imperial_officer_commando/stop_right_there_scum.mp3",
    troopers_blast_him: "assets/raycast/sfx/imperial_officer_commando/troopers_blast_him.mp3",
    office_commando_stop_now: "assets/raycast/sfx/imperial_officer_commando/office_commando_stop_now.mp3",
    officer_commando_fall_back: "assets/raycast/sfx/imperial_officer_commando/officer_commando_fall_back.mp3",
    officer_commando_he_must_be_here: "assets/raycast/sfx/imperial_officer_commando/officer_commando_he_must_be_here.mp3",
    officer_commando_no_use_hiding: "assets/raycast/sfx/imperial_officer_commando/officer_commando_no_use_hiding.mp3",
    officer_commando_show_yourself: "assets/raycast/sfx/imperial_officer_commando/officer_commando_show_yourself.mp3",
    officer_commando_throw_down_your_weapons: "assets/raycast/sfx/imperial_officer_commando/officer_commando_throw_down_your_weapons.mp3",
    phase1_dark_trooper_damage_1: "assets/raycast/sfx/phase1_dark_trooper/damage_1.mp3",
    phase1_dark_trooper_death: "assets/raycast/sfx/phase1_dark_trooper/death.mp3",
    phase1_dark_trooper_hit_flesh: "assets/raycast/sfx/phase1_dark_trooper/hit_flesh.mp3",
    phase1_dark_trooper_step_1: "assets/raycast/sfx/phase1_dark_trooper/robot_step_1.mp3",
    phase1_dark_trooper_step_2: "assets/raycast/sfx/phase1_dark_trooper/robot_step_2.mp3",
    phase1_dark_trooper_slashing_1: "assets/raycast/sfx/phase1_dark_trooper/slashing_1.mp3",
    phase1_dark_trooper_slashing_2: "assets/raycast/sfx/phase1_dark_trooper/slashing_2.mp3",
    phase1_dark_trooper_spoted_enemy: "assets/raycast/sfx/phase1_dark_trooper/spoted_enemy.mp3",
    diagona_coming_out: "assets/raycast/sfx/diagona/coming_out.mp3",
    diagona_attack: "assets/raycast/sfx/diagona/attack.mp3",
    diagona_damage_1: "assets/raycast/sfx/diagona/damage_1.mp3",
    diagona_die: "assets/raycast/sfx/diagona/die.mp3",
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
    const hasLineOfFireCheck = (enemyX: number, enemyY: number): boolean => {
      if (
        this.cachedMapFlat &&
        this.cachedMapWidth &&
        this.cachedMapHeight &&
        this.cachedDoorStatesFlat
      ) {
        return this.hasLineOfFire(
          enemyX,
          enemyY,
          playerX,
          playerY,
          this.cachedMapFlat,
          this.cachedMapWidth,
          this.cachedMapHeight,
          this.cachedDoorStatesFlat,
          this.cachedThinWalls
        );
      }
      return true;
    };
    this.voicelineManager.onPlayerThrowGrenade(
      playerX,
      playerY,
      this.enemies,
      hasLineOfFireCheck
    );
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
        sheet.baseTexture.mipmap = MIPMAP_MODES.OFF;
        sheet.baseTexture.update();
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
          if (imgLower.includes("commando")) {
            return raycastEnemyConfigs[RaycastEnemyType.IMPERIAL_COMMANDO];
          }
          if (imgLower.includes("phase1") || imgLower.includes("dark_trooper") || imgLower.includes("darktrooper")) {
            return raycastEnemyConfigs[RaycastEnemyType.PHASE1_DARK_TROOPER];
          }
          if (imgLower.includes("diagona") || imgLower.includes("dianoga")) {
            return raycastEnemyConfigs[RaycastEnemyType.DIAGONA];
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
        if (tileGid >= fgid && tileset.tiles) {
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
              if (imgLower.includes("commando")) {
                return raycastEnemyConfigs[RaycastEnemyType.IMPERIAL_COMMANDO];
              }
              if (imgLower.includes("phase1") || imgLower.includes("dark_trooper") || imgLower.includes("darktrooper")) {
                return raycastEnemyConfigs[RaycastEnemyType.PHASE1_DARK_TROOPER];
              }
              if (imgLower.includes("diagona") || imgLower.includes("dianoga")) {
                return raycastEnemyConfigs[RaycastEnemyType.DIAGONA];
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
    if (localTileId === 30 || localTileId === 29) {
      return raycastEnemyConfigs[RaycastEnemyType.DIAGONA];
    }
    if (localTileId === 28) {
      return raycastEnemyConfigs[RaycastEnemyType.PHASE1_DARK_TROOPER];
    }
    if (localTileId === 24) {
      return raycastEnemyConfigs[RaycastEnemyType.IMPERIAL_COMMANDO];
    }
    if (localTileId === 23) {
      return raycastEnemyConfigs[RaycastEnemyType.IMPERIAL_OFFICER];
    }
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
    tileMeta?: Record<number, TileMeta>,
    offsetX: number = 0,
    offsetY: number = 0
  ): void {
    // Clean up any existing enemies
    this.disposeEnemies();
    this.enemies = [];
    this.nextEnemyId = 1;

    // Flatten any layer groups recursively (e.g. Elevation groups)
    interface TiledLayerNode {
      name?: string;
      data?: number[];
      chunks?: Array<{
        data: number[];
        x: number;
        y: number;
        width: number;
        height: number;
      }>;
      objects?: Array<{
        x: number;
        y: number;
        gid?: number;
        rotation?: number;
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

    // Collect enemy spawn points across all layers
    if (!this.enemySpawnPoints) {
      this.enemySpawnPoints = [];
    }
    for (const layer of allLayers) {
      if (layer.data || layer.chunks) {
        forEachTileInLayer(layer, (rawTileGid: number, tileX: number, tileY: number) => {
          if (rawTileGid !== 0) {
            const { gid } = extractTiledGidAndRotation(rawTileGid);
            const localTileId = gid - firstgid;
            const meta = tileMeta ? (tileMeta[localTileId] || tileMeta[gid]) : undefined;
            const imgStr = (meta?.image || "").toLowerCase();
            const typeStr = (meta?.type || meta?.tileClass || "").toLowerCase();

            const isSpawn =
              localTileId === 38 ||
              imgStr.includes("enemy_spawn") ||
              typeStr.includes("enemy_spawn");

            if (isSpawn) {
              const spX = tileX + offsetX + 0.5;
              const spY = tileY + offsetY + 0.5;
              if (!this.enemySpawnPoints.some((p) => Math.hypot(p.x - spX, p.y - spY) < 0.1)) {
                this.enemySpawnPoints.push({ x: spX, y: spY });
              }
            }
          }
        });
      }
      if (layer.objects) {
        for (const obj of layer.objects) {
          const objName = (obj.name || "").toLowerCase();
          const objType = (obj.type || "").toLowerCase();
          let isSpawn = false;
          if (obj.gid !== undefined && obj.gid > 0) {
            const decoded = extractTiledGidAndRotation(obj.gid);
            const localTileId = decoded.gid - firstgid;
            const meta = tileMeta ? (tileMeta[localTileId] || tileMeta[decoded.gid]) : undefined;
            const imgStr = (meta?.image || "").toLowerCase();
            const typeStr = (meta?.type || meta?.tileClass || "").toLowerCase();
            if (localTileId === 38 || imgStr.includes("enemy_spawn") || typeStr.includes("enemy_spawn")) {
              isSpawn = true;
            }
          }
          if (
            objName.includes("enemy_spawn") ||
            objType.includes("enemy_spawn") ||
            (objName.includes("enemy") && objName.includes("spawn"))
          ) {
            isSpawn = true;
          }
          if (isSpawn) {
            const tileW = 64;
            const tileH = 64;
            const spX = obj.x / tileW + offsetX + 0.5;
            const spY = obj.y / tileH + offsetY + 0.5;
            if (!this.enemySpawnPoints.some((p) => Math.hypot(p.x - spX, p.y - spY) < 0.1)) {
              this.enemySpawnPoints.push({ x: spX, y: spY });
            }
          }
        }
      }
    }

    // Check for "Enemies" tile layers or object layers (exclude player Spawns layer)
    const enemyLayers = allLayers.filter(
      (layer: TiledLayerNode) =>
        layer.name &&
        (layer.name.toLowerCase().includes("enem") ||
          layer.name.toLowerCase().includes("monster") ||
          layer.name.toLowerCase().includes("trooper")) &&
        layer.name.toLowerCase() !== "spawns" &&
        !layer.name.toLowerCase().includes("player")
    );

    for (const layer of enemyLayers) {
      if (layer.data || layer.chunks) {
        // Tile Layer (flat data or infinite chunks)
        forEachTileInLayer(layer, (rawTileGid: number, tileX: number, tileY: number) => {
          if (rawTileGid !== 0) {
            const { gid, dirX, dirY } = extractTiledGidAndRotation(rawTileGid);
            if (gid !== 0) {
              const x = tileX + offsetX + 0.5;
              const y = tileY + offsetY + 0.5;
              const config = this.resolveEnemyConfigForTile(
                gid,
                firstgid,
                tileMeta,
                mapData
              );
              this.spawnEnemy(config, x, y, dirX, dirY);
            }
          }
        });
      } else if (layer.objects) {
        // Object Layer
        for (const obj of layer.objects) {
          const tileW = 64;
          const x = obj.x / tileW + offsetX + 0.5;
          const y = obj.y / tileW + offsetY + 0.5;
          let config: IRaycastEnemyConfig | undefined;
          let dirX = 0;
          let dirY = 1;
          if (obj.gid !== undefined && obj.gid > 0) {
            const decoded = extractTiledGidAndRotation(obj.gid);
            dirX = decoded.dirX;
            dirY = decoded.dirY;
            config = this.resolveEnemyConfigForTile(
              decoded.gid,
              firstgid,
              tileMeta,
              mapData
            );
          } else {
            const typeName = obj.type || obj.name || "stormtrooper";
            config =
              getRaycastEnemyConfig(typeName) ||
              raycastEnemyConfigs[RaycastEnemyType.STORMTROOPER];
            if (obj.rotation !== undefined) {
              const rad = (obj.rotation * Math.PI) / 180;
              dirX = Math.round(-Math.sin(rad));
              dirY = Math.round(Math.cos(rad));
            }
          }
          let customVisionCone: number | undefined;
          let customItemDrop: IEnemyItemDrop | undefined;
          let customTriggerAlert: boolean = false;

          const layerProps = (layer as any).properties || [];
          const allProps = [...layerProps, ...(obj.properties || [])];
          for (const prop of allProps) {
            const pName = (prop.name || "").toLowerCase();
            if (
              pName === "visionconeangle" ||
              pName === "fov" ||
              pName === "visioncone" ||
              pName === "coneangle"
            ) {
              if (typeof prop.value === "number") {
                customVisionCone = prop.value;
              }
            } else if (pName === "itemdrop" || pName === "dropitem") {
              if (typeof prop.value === "object" && prop.value !== null) {
                customItemDrop = {
                  type: String(prop.value.type || prop.value.pickupType || "-"),
                  amount: prop.value.amount !== undefined ? Number(prop.value.amount) : undefined,
                  weaponType: prop.value.weaponType ? String(prop.value.weaponType) : undefined,
                  itemId: prop.value.itemId ? String(prop.value.itemId) : undefined,
                  sprite: prop.value.sprite ? String(prop.value.sprite) : undefined,
                  object: prop.value.object,
                };
              } else if (typeof prop.value === "string") {
                try {
                  customItemDrop = JSON.parse(prop.value);
                } catch {
                  customItemDrop = { type: prop.value };
                }
              }
            } else if (pName === "triggeralert" || pName === "trigeralert") {
              customTriggerAlert = Boolean(prop.value);
            }
          }

          if (config) {
            this.spawnEnemy(
              config,
              x,
              y,
              dirX,
              dirY,
              undefined,
              customVisionCone,
              customItemDrop,
              customTriggerAlert
            );
          }
        }
      }
    }
  }

  public spawnEnemy(
    config: IRaycastEnemyConfig,
    x: number,
    y: number,
    dirX: number = 0,
    dirY: number = 1,
    spritesheet?: Spritesheet,
    visionConeAngle?: number,
    itemDrop?: IEnemyItemDrop,
    triggerAlert?: boolean
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
    const enemy = new RaycastEnemy(this.nextEnemyId++, config, x, y, sheet, visionConeAngle);
    enemy.dirX = dirX;
    enemy.dirY = dirY;
    enemy.wanderDirX = dirX;
    enemy.wanderDirY = dirY;
    enemy.itemDrop = itemDrop;
    enemy.triggerAlert = Boolean(triggerAlert);
    enemy.onAlertTriggered = (alerted) => {
      this.onAlertCallback?.(alerted);
    };

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
      if (this.onKillCallback) {
        this.onKillCallback(deadEnemy, this.killedEnemies, this.enemies.length);
      }
    };

    this.enemies.push(enemy);
    return enemy;
  }

  /**
   * Robustly checks whether the tile at flatIdx is an actual door,
   * using either tileTypeFlags (RaycastScene.TILE_DOOR = 2) or doorStatesFlat (non-NaN entry).
   */
  public isDoorTile(flatIdx: number, doorStatesFlat?: Float64Array): boolean {
    if (flatIdx < 0) return false;
    if (this.cachedTileTypeFlags && flatIdx < this.cachedTileTypeFlags.length) {
      return this.cachedTileTypeFlags[flatIdx] === 2; // RaycastScene.TILE_DOOR
    }
    const states = doorStatesFlat || this.cachedDoorStatesFlat;
    if (states && flatIdx < states.length) {
      const val = states[flatIdx];
      return !Number.isNaN(val) && val !== undefined;
    }
    return false;
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
        if (this.isDoorTile(flatIdx, doorStatesFlat)) {
          const doorState = doorStatesFlat[flatIdx];
          if (!Number.isNaN(doorState) && Math.abs(doorState) >= 0.5) {
            continue; // Open door
          }
        }
        return false; // Solid wall or closed door
      }
    }

    return true;
  }

  /**
   * Traces from (x1, y1) to (x2, y2) and returns the coordinates of the first door tile
   * crossed along the line segment, or null if no door tile is crossed (or if a solid wall blocks first).
   */
  public findDoorOnSegment(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    mapFlat: Int32Array,
    mapWidth: number,
    mapHeight: number,
    doorStatesFlat: Float64Array
  ): { x: number; y: number } | null {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.001) return null;

    const rayDirX = dx / distance;
    const rayDirY = dy / distance;

    let mapX = Math.floor(x1);
    let mapY = Math.floor(y1);

    const deltaDistX = Math.abs(1 / (rayDirX === 0 ? 1e-6 : rayDirX));
    const deltaDistY = Math.abs(1 / (rayDirY === 0 ? 1e-6 : rayDirY));

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

    // Check starting cell (e.g. if enemy is inside a doorway)
    if (mapX >= 0 && mapX < mapWidth && mapY >= 0 && mapY < mapHeight) {
      const idx = mapY * mapWidth + mapX;
      if (this.isDoorTile(idx, doorStatesFlat)) {
        return { x: mapX, y: mapY };
      }
    }

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
        break;
      }

      const flatIdx = mapY * mapWidth + mapX;
      if (this.isDoorTile(flatIdx, doorStatesFlat)) {
        return { x: mapX, y: mapY };
      }

      // If a solid wall was encountered before reaching any door, line of sight is obstructed
      const tile = mapFlat[flatIdx];
      if (tile > 0) {
        break;
      }
    }

    return null;
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
        if (this.isDoorTile(flatIdx, doorStatesFlat)) {
          const doorState = doorStatesFlat[flatIdx];
          if (!Number.isNaN(doorState) && Math.abs(doorState) >= 0.8) {
            continue; // Open door
          }
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
    thinWalls: Array<{ x1: number; y1: number; x2: number; y2: number }>,
    checkEnemies: boolean = true
  ): boolean {
    const r = 0.24; // Enemy collision radius with smooth corner gliding

    // Bounds check
    if (newX - r < 0 || newX + r >= mapWidth || newY - r < 0 || newY + r >= mapHeight) {
      return false;
    }

    const minTileX = Math.floor(newX - r);
    const maxTileX = Math.floor(newX + r);
    const minTileY = Math.floor(newY - r);
    const maxTileY = Math.floor(newY + r);

    for (let gy = minTileY; gy <= maxTileY; gy++) {
      for (let gx = minTileX; gx <= maxTileX; gx++) {
        const flatIdx = gy * mapWidth + gx;
        const tile = mapFlat[flatIdx];

        if (tile > 0) {
          const isDoor = this.isDoorTile(flatIdx, doorStatesFlat);
          const doorState = isDoor ? doorStatesFlat[flatIdx] : NaN;
          const isDoorOpen = isDoor && !Number.isNaN(doorState) && Math.abs(doorState) >= 0.45;

          if (!isDoorOpen) {
            // Circle-to-AABB distance check allows enemies to smoothly glide around wall corners
            const clampX = Math.max(gx, Math.min(newX, gx + 1));
            const clampY = Math.max(gy, Math.min(newY, gy + 1));
            const dx = newX - clampX;
            const dy = newY - clampY;
            if (dx * dx + dy * dy < r * r) {
              if (isDoor) {
                const doorKey = `${gx},${gy}`;
                const isKeycardDoor = Boolean(this.cachedLockedDoors && this.cachedLockedDoors[doorKey]);
                if (!isKeycardDoor) {
                  enemy.isWaitingForDoor = true;
                  if (!Number.isNaN(doorState) && (doorState <= 0 || doorState < 0.45)) {
                    this.onEnemyOpenDoorCallback?.(gx, gy, enemy.x, enemy.y);
                  }
                }
              }
              return false;
            }
          }
        }
      }
    }

    // Check collision against thin walls (preventing walking through them)
    for (const wall of thinWalls) {
      const wallThickness = 0.08; 
      const minX = Math.min(wall.x1, wall.x2) - wallThickness;
      const maxX = Math.max(wall.x1, wall.x2) + wallThickness;
      const minY = Math.min(wall.y1, wall.y2) - wallThickness;
      const maxY = Math.max(wall.y1, wall.y2) + wallThickness;

      if (
        newX + r > minX &&
        newX - r < maxX &&
        newY + r > minY &&
        newY - r < maxY
      ) {
        return false;
      }
    }

    // Allow enemies to freely pass through each other so they never jam in doorways or narrow corridors
    enemy.x = newX;
    enemy.y = newY;
    return true;
  }

  /**
   * Updates the BFS distance field from the player position across all walkable cells.
   * Runs efficiently on grid (40x40 = 1600 cells in <0.05ms).
   */
  public updateBfsGrid(
    playerX: number,
    playerY: number,
    mapFlat: Int32Array,
    mapWidth: number,
    mapHeight: number,
    doorStatesFlat: Float64Array,
    lockedDoors?: Record<string, string>,
    thinWalls?: Array<{ x1: number; y1: number; x2: number; y2: number; isDestructableWall?: boolean }>
  ): void {
    const totalCells = mapWidth * mapHeight;
    if (totalCells <= 0) return;
    if (!this.bfsDistGrid || this.bfsDistGrid.length !== totalCells) {
      this.bfsDistGrid = new Int16Array(totalCells);
    }
    this.bfsDistGrid.fill(-1);

    const targetPx = Math.floor(playerX);
    const targetPy = Math.floor(playerY);
    if (targetPx < 0 || targetPx >= mapWidth || targetPy < 0 || targetPy >= mapHeight) {
      return;
    }

    const startIdx = targetPy * mapWidth + targetPx;
    this.bfsDistGrid[startIdx] = 0;

    const queue = new Int32Array(totalCells);
    let head = 0;
    let tail = 0;
    queue[tail++] = startIdx;

    const thinWallBlockedCells = new Set<number>();
    if (thinWalls && thinWalls.length > 0) {
      for (let i = 0; i < thinWalls.length; i++) {
        const wall = thinWalls[i];
        const minCX = Math.max(0, Math.floor(Math.min(wall.x1, wall.x2)));
        const maxCX = Math.min(mapWidth - 1, Math.floor(Math.max(wall.x1, wall.x2) - 1e-4));
        const minCY = Math.max(0, Math.floor(Math.min(wall.y1, wall.y2)));
        const maxCY = Math.min(mapHeight - 1, Math.floor(Math.max(wall.y1, wall.y2) - 1e-4));
        for (let cy = minCY; cy <= maxCY; cy++) {
          for (let cx = minCX; cx <= maxCX; cx++) {
            thinWallBlockedCells.add(cy * mapWidth + cx);
          }
        }
      }
    }

    const isWalkable = (cx: number, cy: number): boolean => {
      if (cx < 0 || cx >= mapWidth || cy < 0 || cy >= mapHeight) return false;
      const idx = cy * mapWidth + cx;
      if (thinWallBlockedCells.has(idx)) return false;
      const tile = mapFlat[idx];
      if (tile === 0) return true; // Empty floor
      // If it's a door:
      if (this.isDoorTile(idx, doorStatesFlat)) {
        const doorState = doorStatesFlat[idx];
        // Open door is passable
        if (!Number.isNaN(doorState) && Math.abs(doorState) > 0.5) return true;
        // If closed, check if locked
        const key = `${cx},${cy}`;
        if (lockedDoors && lockedDoors[key]) {
          return false; // Locked by keycard -> enemies cannot open
        }
        return true; // Unlocked door -> enemies can open and pass through
      }
      return false; // Solid wall or obstacle
    };

    while (head < tail) {
      const curr = queue[head++];
      const cx = curr % mapWidth;
      const cy = Math.floor(curr / mapWidth);
      const currDist = this.bfsDistGrid[curr];

      const neighbors = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ];

      for (let i = 0; i < 4; i++) {
        const nx = neighbors[i][0];
        const ny = neighbors[i][1];
        if (isWalkable(nx, ny)) {
          const nIdx = ny * mapWidth + nx;
          if (this.bfsDistGrid[nIdx] === -1) {
            this.bfsDistGrid[nIdx] = currDist + 1;
            queue[tail++] = nIdx;
          }
        }
      }
    }
  }

  /**
   * Returns the next coordinate along the shortest BFS path towards the player.
   */
  public getNextPathStep(
    enemyX: number,
    enemyY: number,
    mapWidth: number,
    mapHeight: number,
    doorStatesFlat?: Float64Array,
    enemyId?: number
  ): { x: number; y: number } | null {
    if (!this.bfsDistGrid) return null;

    const ex = Math.floor(enemyX);
    const ey = Math.floor(enemyY);
    if (ex < 0 || ex >= mapWidth || ey < 0 || ey >= mapHeight) return null;

    const currIdx = ey * mapWidth + ex;
    const currDist = this.bfsDistGrid[currIdx];
    if (currDist <= 0) return null; // Already in player cell or unreachable

    // Check adjacent 8 neighbors for the cell that is closest to player (dist < currDist)
    const cardinalNeighbors = [
      [ex + 1, ey],
      [ex - 1, ey],
      [ex, ey + 1],
      [ex, ey - 1],
    ];

    let bestDist = currDist;
    let bestCell: [number, number] | null = null;

    for (let i = 0; i < 4; i++) {
      const nx = cardinalNeighbors[i][0];
      const ny = cardinalNeighbors[i][1];
      if (nx >= 0 && nx < mapWidth && ny >= 0 && ny < mapHeight) {
        const nIdx = ny * mapWidth + nx;
        const nDist = this.bfsDistGrid[nIdx];
        if (nDist >= 0 && nDist < bestDist) {
          bestDist = nDist;
          bestCell = [nx, ny];
        }
      }
    }

    // Check 4 diagonal neighbors with corner-cutting prevention
    const diagNeighbors = [
      [ex + 1, ey + 1, ex + 1, ey, ex, ey + 1],
      [ex - 1, ey + 1, ex - 1, ey, ex, ey + 1],
      [ex + 1, ey - 1, ex + 1, ey, ex, ey - 1],
      [ex - 1, ey - 1, ex - 1, ey, ex, ey - 1],
    ];

    for (let i = 0; i < 4; i++) {
      const [nx, ny, c1x, c1y, c2x, c2y] = diagNeighbors[i];
      if (nx >= 0 && nx < mapWidth && ny >= 0 && ny < mapHeight) {
        const c1Idx = c1y * mapWidth + c1x;
        const c2Idx = c2y * mapWidth + c2x;
        const c1Dist = this.bfsDistGrid[c1Idx];
        const c2Dist = this.bfsDistGrid[c2Idx];
        // Both adjacent cardinal neighbors must be walkable to prevent cutting solid corners
        if (c1Dist >= 0 && c2Dist >= 0) {
          const nIdx = ny * mapWidth + nx;
          const nDist = this.bfsDistGrid[nIdx];
          if (nDist >= 0 && nDist <= bestDist) {
            bestDist = nDist;
            bestCell = [nx, ny];
          }
        }
      }
    }

    if (!bestCell) return null;

    const nextX = bestCell[0];
    const nextY = bestCell[1];

    const currCenterX = ex + 0.5;
    const currCenterY = ey + 0.5;

    // If next cell is a closed door, trigger door open (only for non-keycard doors)
    if (doorStatesFlat) {
      const nextIdx = nextY * mapWidth + nextX;
      if (this.isDoorTile(nextIdx, doorStatesFlat)) {
        const doorState = doorStatesFlat[nextIdx];
        const nextKey = `${nextX},${nextY}`;
        const isKeycardDoor = Boolean(this.cachedLockedDoors && this.cachedLockedDoors[nextKey]);
        if (!isKeycardDoor && doorState === 0) {
          this.onEnemyOpenDoorCallback?.(nextX, nextY, currCenterX, currCenterY);
        }
      }
    }

    // Corner alignment check: if the next step turns in an axis where the enemy is not yet centered,
    // guide the enemy to the center of the current cell first to prevent clipping the inner corner wall!
    const stepDirX = nextX - ex;
    const stepDirY = nextY - ey;

    if (stepDirX !== 0 && stepDirY === 0 && this.cachedMapFlat && this.cachedMapWidth && this.cachedMapHeight) {
      const mw = this.cachedMapWidth;
      const mh = this.cachedMapHeight;
      // Horizontal step: if enemy is displaced vertically, check if moving horizontally clips a corner wall
      const yDistFromCenter = Math.abs(enemyY - currCenterY);
      if (yDistFromCenter > 0.16) {
        const testTileY = enemyY < currCenterY ? ey - 1 : ey + 1;
        if (testTileY >= 0 && testTileY < mh) {
          const cornerWall = this.cachedMapFlat[testTileY * mw + nextX];
          if (cornerWall > 0) {
            return { x: currCenterX, y: currCenterY };
          }
        }
      }
    } else if (stepDirY !== 0 && stepDirX === 0 && this.cachedMapFlat && this.cachedMapWidth && this.cachedMapHeight) {
      const mw = this.cachedMapWidth;
      const mh = this.cachedMapHeight;
      // Vertical step: if enemy is displaced horizontally, check if moving vertically clips a corner wall
      const xDistFromCenter = Math.abs(enemyX - currCenterX);
      if (xDistFromCenter > 0.16) {
        const testTileX = enemyX < currCenterX ? ex - 1 : ex + 1;
        if (testTileX >= 0 && testTileX < mw) {
          const cornerWall = this.cachedMapFlat[nextY * mw + testTileX];
          if (cornerWall > 0) {
            return { x: currCenterX, y: currCenterY };
          }
        }
      }
    }

    // Add per-enemy lateral lane offset to distribute troopers across the corridor
    let laneOffsetX = 0;
    let laneOffsetY = 0;
    if (enemyId !== undefined) {
      const perpX = -stepDirY;
      const perpY = stepDirX;
      const lane = ((enemyId % 3) - 1) * 0.10;
      // Ensure lane offset stays inside the walkable corridor tile
      const testOffX = nextX + 0.5 + perpX * lane;
      const testOffY = nextY + 0.5 + perpY * lane;
      if (Math.floor(testOffX) === nextX && Math.floor(testOffY) === nextY) {
        laneOffsetX = perpX * lane;
        laneOffsetY = perpY * lane;
      }
    }

    return {
      x: nextX + 0.5 + laneOffsetX,
      y: nextY + 0.5 + laneOffsetY,
    };
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
    laserManager?: RaycastLaserManager,
    playerDirX?: number,
    playerDirY?: number,
    activeGrenades?: readonly { x: number; y: number; radius?: number }[],
    lockedDoors?: Record<string, string>,
    tileTypeFlags?: Uint8Array
  ): void {
    this.cachedMapFlat = mapFlat;
    this.cachedMapWidth = mapWidth;
    this.cachedMapHeight = mapHeight;
    this.cachedDoorStatesFlat = doorStatesFlat;
    this.cachedTileTypeFlags = tileTypeFlags;
    this.cachedThinWalls = thinWalls;
    this.cachedLockedDoors = lockedDoors;
    const dt = delta / 60; // Delta time in seconds

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

      // Calculate initial sight / target acquisition accuracy penalty
      const { multiplier: acqMultiplier } = enemy.getTargetAcquisitionMultiplier();
      const shotsFired = enemy.shotsFiredAtTarget ?? 0;
      enemy.shotsFiredAtTarget = shotsFired + 1;

      // Handle melee attack (e.g. Phase 1 Dark Trooper with sword)
      if (enemy.config.isMelee) {
        // First melee strike after spotting has a hesitation / whiff chance
        if (shotsFired < 1) {
          return;
        }
        const effectiveMeleeAccuracy = accuracy * acqMultiplier;
        const isHit = Math.random() <= effectiveMeleeAccuracy;
        if (isHit) {
          playerController.takeDamage(damage);
          if (enemy.config.meleeHitSound) {
            try {
              sound.play(enemy.config.meleeHitSound.src, {
                volume: enemy.config.meleeHitSound.volume ?? 0.9,
                loop: false,
              });
            } catch {}
          }
        }
        return;
      }

      // Calculate direction from enemy to player
      const dx = playerX - enemy.x;
      const dy = playerY - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 0.001) return;

      // Ranged Attack Hit Calculation:
      // 1. First shot after spotting player is ALWAYS a warning shot / miss
      // 2. Subsequent shots scale with acquisition ramp
      let isHit = false;
      if (shotsFired >= 1) {
        const distancePenalty = (dist / 20) * 0.20;
        const baseEffectiveAccuracy = Math.max(
          0.08,
          Math.min(0.65, accuracy - distancePenalty)
        );
        const effectiveAccuracy = Math.max(0.03, baseEffectiveAccuracy * acqMultiplier);
        isHit = Math.random() <= effectiveAccuracy;
      }

      if (!laserManager) {
        // Fallback hitscan if no laser manager
        if (isHit) {
          playerController.takeDamage(damage);
        }
        return;
      }

      const normX = dx / dist;
      const normY = dy / dist;
      const perpX = -normY;
      const perpY = normX;

      let aimDirX: number;
      let aimDirY: number;

      if (isHit) {
        // Direct shot towards player with slight organic jitter (+/- 0.04)
        const jitter = (Math.random() - 0.5) * 0.04;
        aimDirX = normX + perpX * jitter;
        aimDirY = normY + perpY * jitter;
      } else {
        // Inaccurate warning / suppression shot: purposefully aims wide past the player
        // Offset 0.85 - 1.6 tiles off to the side so it clearly whizzes past and impacts the backdrop
        const side = Math.random() > 0.5 ? 1 : -1;
        const missOffset = side * (0.85 + Math.random() * 0.75);
        aimDirX = normX + perpX * (missOffset / Math.max(1.0, dist));
        aimDirY = normY + perpY * (missOffset / Math.max(1.0, dist));
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
        },
        isHit // CRUCIAL: Only shots where isHit === true can damage the player!
      );
    };

    // Alert state logic: only enemies within awareness radius around the player
    // or spawned as reinforcement wave know the player's position.
    // Cap active hunters to the nearest 12 enemies (plus wave enemies and active pursuers)
    // so distant enemies across the entire facility don't cause 60-man bottlenecks at doorways.
    if (this.isAlertActive) {
      const candidates: Array<{ enemy: RaycastEnemy; dist: number }> = [];
      for (let i = 0; i < this.enemies.length; i++) {
        const enemy = this.enemies[i];
        if (!enemy.isDead && enemy.config.type !== RaycastEnemyType.DIAGONA) {
          const distToPlayer = Math.hypot(enemy.x - playerX, enemy.y - playerY);
          const isWaveEnemy = this.waveEnemyIds.has(enemy.id);
          const isNearPlayer = distToPlayer <= RaycastEnemyManager.ALERT_AWARENESS_RADIUS;

          if (isWaveEnemy) {
            enemy.hasTarget = true;
            enemy.lastKnownPlayerX = playerX;
            enemy.lastKnownPlayerY = playerY;
            enemy.searchTimer = 999999;
            if (enemy.state === "idle") enemy.state = "chase";
          } else if (isNearPlayer) {
            candidates.push({ enemy, dist: distToPlayer });
          }
        }
      }

      candidates.sort((a, b) => a.dist - b.dist);
      const hunterCap = 12;
      for (let i = 0; i < candidates.length; i++) {
        const { enemy } = candidates[i];
        if (i < hunterCap || enemy.state === "chase" || enemy.state === "attack") {
          enemy.hasTarget = true;
          enemy.lastKnownPlayerX = playerX;
          enemy.lastKnownPlayerY = playerY;
          enemy.searchTimer = enemy.lostSightDuration;
          if (enemy.state === "idle") {
            enemy.state = "chase";
          }
        }
      }

      // Wave Spawner Update (spawns sequentially in waves regardless of total enemies on map)
      if (this.enemySpawnPoints.length > 0) {
        if (this.waveCooldownTimer > 0) {
          this.waveCooldownTimer = Math.max(0, this.waveCooldownTimer - dt);
        }

        // Check if a new wave should be triggered (continuous endless waves during alert)
        const maxWaves = this.waveConfig.maxWaves ?? Infinity;
        const maxCap = this.waveConfig.enemyThreshold ?? 20;
        const currentAlive = this.enemies.filter((e) => !e.isDead).length;

        if (
          this.wavesSpawned < maxWaves &&
          this.currentWaveRemaining === 0 &&
          this.waveCooldownTimer <= 0 &&
          currentAlive < maxCap
        ) {
          this.wavesSpawned++;
          this.currentWaveRemaining = this.waveConfig.enemiesPerWave;
          this.spawnIntervalTimer = 0; // Spawn first enemy immediately

          // Find closest enemy spawnpoint to player (preferring reachable BFS path distance)
          let closestSp: { x: number; y: number } | null = null;
          let closestDist = Infinity;
          let hasReachableSp = false;

          // 1. First pass: prioritize spawnpoints that have a clear, connected BFS path to player
          for (let i = 0; i < this.enemySpawnPoints.length; i++) {
            const sp = this.enemySpawnPoints[i];
            const spCellX = Math.floor(sp.x);
            const spCellY = Math.floor(sp.y);
            const spIdx = spCellY * mapWidth + spCellX;
            const bfsDist = this.bfsDistGrid && spIdx >= 0 && spIdx < this.bfsDistGrid.length ? this.bfsDistGrid[spIdx] : -1;
            if (bfsDist > 0) {
              hasReachableSp = true;
              if (bfsDist < closestDist) {
                closestDist = bfsDist;
                closestSp = sp;
              }
            }
          }

          // 2. Fallback: only if no spawnpoint is reachable via BFS, pick closest by Euclidean distance
          if (!hasReachableSp) {
            for (let i = 0; i < this.enemySpawnPoints.length; i++) {
              const sp = this.enemySpawnPoints[i];
              const d = Math.hypot(sp.x - playerX, sp.y - playerY);
              if (d < closestDist) {
                closestDist = d;
                closestSp = sp;
              }
            }
          }
          this.activeWaveSpawnPoint = closestSp;

          if (this.activeWaveSpawnPoint) {
            this.onWaveStartCallback?.(
              this.wavesSpawned,
              this.waveConfig.maxWaves,
              this.activeWaveSpawnPoint
            );
          }
        }

        // Spawn enemies in current wave with interval spacing
        if (this.currentWaveRemaining > 0 && this.activeWaveSpawnPoint) {
          this.spawnIntervalTimer -= dt;
          if (this.spawnIntervalTimer <= 0) {
            const interval =
              this.waveConfig.spawnIntervalSeconds ??
              (this.waveConfig.spawnIntervalFrames ? this.waveConfig.spawnIntervalFrames / 60 : 1.15);
            this.spawnIntervalTimer = interval;
            this.currentWaveRemaining--;

            const sp = this.activeWaveSpawnPoint;
            const dx = playerX - sp.x;
            const dy = playerY - sp.y;
            const dist = Math.hypot(dx, dy);
            const dirX = dist > 0.001 ? dx / dist : 0;
            const dirY = dist > 0.001 ? dy / dist : 1;

            // Offset perpendicular to spawn direction so troopers emerge staggered
            const perpX = -dirY;
            const perpY = dirX;
            const offsetIdx = (this.currentWaveRemaining % 3) - 1; // -1, 0, 1
            const spawnX = sp.x + perpX * (offsetIdx * 0.28);
            const spawnY = sp.y + perpY * (offsetIdx * 0.28);

            const trooperConfig =
              raycastEnemyConfigs[RaycastEnemyType.STORMTROOPER] ||
              getRaycastEnemyConfig("stormtrooper");

            if (trooperConfig) {
              const trooper = this.spawnEnemy(
                trooperConfig,
                spawnX,
                spawnY,
                dirX,
                dirY
              );
              trooper.state = "chase";
              trooper.hasTarget = true;
              trooper.lastKnownPlayerX = playerX;
              trooper.lastKnownPlayerY = playerY;
              trooper.searchTimer = 999999;
              this.waveEnemyIds.add(trooper.id);
            }

            if (this.currentWaveRemaining === 0) {
              const cooldown =
                this.waveConfig.waveCooldownSeconds ??
                (this.waveConfig.waveCooldownFrames ? this.waveConfig.waveCooldownFrames / 60 : 10.0);
              this.waveCooldownTimer = cooldown;
            }
          }
        }
      }
    }

    // Update BFS distance grid for corridor/room navigation whenever alert is active OR any enemy is chasing/has target
    const hasActivePursuit =
      this.isAlertActive ||
      this.enemies.some(
        (e) => !e.isDead && e.config.type !== RaycastEnemyType.DIAGONA && (e.state === "chase" || e.hasTarget)
      );

    if (hasActivePursuit) {
      const px = Math.floor(playerX);
      const py = Math.floor(playerY);
      this.bfsUpdateTimer += dt;
      if (
        px !== this.lastBfsPlayerCellX ||
        py !== this.lastBfsPlayerCellY ||
        this.bfsUpdateTimer >= 0.25 ||
        !this.bfsDistGrid
      ) {
        this.bfsUpdateTimer = 0;
        this.lastBfsPlayerCellX = px;
        this.lastBfsPlayerCellY = py;
        this.updateBfsGrid(playerX, playerY, mapFlat, mapWidth, mapHeight, doorStatesFlat, lockedDoors, thinWalls);
      }
    }

    // Ensure A* pathfinder grid is initialized and updated
    const thinWallBlockedCells = new Set<number>();
    if (thinWalls && thinWalls.length > 0) {
      for (let i = 0; i < thinWalls.length; i++) {
        const wall = thinWalls[i];
        const minCX = Math.max(0, Math.floor(Math.min(wall.x1, wall.x2)));
        const maxCX = Math.min(mapWidth - 1, Math.floor(Math.max(wall.x1, wall.x2) - 1e-4));
        const minCY = Math.max(0, Math.floor(Math.min(wall.y1, wall.y2)));
        const maxCY = Math.min(mapHeight - 1, Math.floor(Math.max(wall.y1, wall.y2) - 1e-4));
        for (let cy = minCY; cy <= maxCY; cy++) {
          for (let cx = minCX; cx <= maxCX; cx++) {
            thinWallBlockedCells.add(cy * mapWidth + cx);
          }
        }
      }
    }

    const isCellWalkable = (cx: number, cy: number): boolean => {
      if (cx < 0 || cx >= mapWidth || cy < 0 || cy >= mapHeight) return false;
      const idx = cy * mapWidth + cx;
      if (thinWallBlockedCells.has(idx)) return false;
      const tile = mapFlat[idx];
      if (tile === 0) return true; // Empty floor
      // If it's a door:
      if (this.isDoorTile(idx, doorStatesFlat)) {
        const doorState = doorStatesFlat[idx];
        const key = `${cx},${cy}`;
        if (lockedDoors && lockedDoors[key]) {
          // Locked by keycard -> enemies cannot open it, passable only if already open
          return !Number.isNaN(doorState) && Math.abs(doorState) >= 0.45;
        }
        // Unlocked door -> passable (enemies can open it)
        return true;
      }
      return false; // Solid wall or obstacle
    };

    const astarGrid: IAStarGrid = {
      width: mapWidth,
      height: mapHeight,
      isWalkable: isCellWalkable,
    };

    if (!this.astar || this.astar.getGrid().width !== mapWidth || this.astar.getGrid().height !== mapHeight) {
      this.astar = new AStarPathfinder(astarGrid, {
        allowDiagonal: true,
        preventCornerCutting: true,
        heuristic: "octile",
        maxIterations: 5000,
      });
    } else {
      this.astar.setGrid(astarGrid);
    }

    // Flocking separation pass: comfortable personal space in open rooms and corridors
    // Near doorways, separation is constrained along the corridor axis to prevent lateral wall jamming while avoiding pileups
    const aliveMobileEnemies = this.enemies.filter(
      (e) => !e.isDead && e.config.type !== RaycastEnemyType.DIAGONA
    );

    const getDoorwayAxis = (ex: number, ey: number, radius: number = 2.5): { isEWWall: boolean; isNSWall: boolean } | null => {
      const ecx = Math.floor(ex);
      const ecy = Math.floor(ey);
      const rCells = Math.ceil(radius);
      for (let dy = -rCells; dy <= rCells; dy++) {
        for (let dx = -rCells; dx <= rCells; dx++) {
          const nx = ecx + dx;
          const ny = ecy + dy;
          if (nx >= 0 && nx < mapWidth && ny >= 0 && ny < mapHeight) {
            const idx = ny * mapWidth + nx;
            if (this.isDoorTile(idx, doorStatesFlat)) {
              const d = Math.hypot(nx + 0.5 - ex, ny + 0.5 - ey);
              if (d < radius) {
                const isWallW = nx > 0 && mapFlat[ny * mapWidth + (nx - 1)] > 0;
                const isWallE = nx + 1 < mapWidth && mapFlat[ny * mapWidth + (nx + 1)] > 0;
                const isWallN = ny > 0 && mapFlat[(ny - 1) * mapWidth + nx] > 0;
                const isWallS = ny + 1 < mapHeight && mapFlat[(ny + 1) * mapWidth + nx] > 0;
                return { isEWWall: isWallW || isWallE, isNSWall: isWallN || isWallS };
              }
            }
          }
        }
      }
      return null;
    };

    const minSpacing = 0.55;
    for (let i = 0; i < aliveMobileEnemies.length; i++) {
      const e1 = aliveMobileEnemies[i];
      for (let j = i + 1; j < aliveMobileEnemies.length; j++) {
        const e2 = aliveMobileEnemies[j];
        if (e1.isWaitingForDoor || e2.isWaitingForDoor) continue;

        const dx = e2.x - e1.x;
        const dy = e2.y - e1.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < minSpacing * minSpacing && distSq > 0.000001) {
          const dist = Math.sqrt(distSq);
          const overlap = (minSpacing - dist) * 0.5;
          let pushX = (dx / dist) * overlap * 0.15;
          let pushY = (dy / dist) * overlap * 0.15;

          // Check if either entity is near a doorway corridor
          const doorAxis = getDoorwayAxis(e1.x, e1.y, 2.5) || getDoorwayAxis(e2.x, e2.y, 2.5);
          if (doorAxis) {
            if (doorAxis.isEWWall) {
              // Passage is North-South: suppress lateral push (X) to avoid scraping wall jambs,
              // but push vertically (Y) to keep enemies in clean single file!
              pushX = 0;
              pushY = (dy >= 0 ? 1 : -1) * overlap * 0.25;
            } else if (doorAxis.isNSWall) {
              // Passage is East-West: suppress vertical push (Y), push horizontally (X)
              pushY = 0;
              pushX = (dx >= 0 ? 1 : -1) * overlap * 0.25;
            }
          }

          this.tryMoveEnemy(e1, e1.x - pushX, e1.y - pushY, mapFlat, mapWidth, mapHeight, doorStatesFlat, thinWalls, false);
          this.tryMoveEnemy(e2, e2.x + pushX, e2.y + pushY, mapFlat, mapWidth, mapHeight, doorStatesFlat, thinWalls, false);
        }
      }
    }

    for (const enemy of this.enemies) {
      // Check if enemy is currently near a doorway (within 2.2 tiles of any door tile)
      let minDoorDist = Infinity;
      let nearestDoorX = -1;
      let nearestDoorY = -1;
      const ecx = Math.floor(enemy.x);
      const ecy = Math.floor(enemy.y);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = ecx + dx;
          const ny = ecy + dy;
          if (nx >= 0 && nx < mapWidth && ny >= 0 && ny < mapHeight) {
            const nIdx = ny * mapWidth + nx;
            if (this.isDoorTile(nIdx, doorStatesFlat)) {
              const doorCenterDist = Math.hypot(nx + 0.5 - enemy.x, ny + 0.5 - enemy.y);
              if (doorCenterDist < minDoorDist) {
                minDoorDist = doorCenterDist;
                nearestDoorX = nx;
                nearestDoorY = ny;
              }
            }
          }
        }
      }
      enemy.nearestDoorDist = minDoorDist;
      enemy.isNearDoor = minDoorDist <= 2.2;
      enemy.nearestDoorCell = nearestDoorX >= 0 ? { x: nearestDoorX, y: nearestDoorY } : null;
      enemy.doorOnSightLine = this.findDoorOnSegment(
        enemy.x,
        enemy.y,
        playerX,
        playerY,
        mapFlat,
        mapWidth,
        mapHeight,
        doorStatesFlat
      );

      const dx = playerX - enemy.x;
      const dy = playerY - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const los = losChecker(enemy.x, enemy.y, playerX, playerY);
      const lof = lofChecker(enemy.x, enemy.y, playerX, playerY);
      const isBehindWall = !lof;
      const canSee = los && enemy.isPointInVisionCone(playerX, playerY);

      let pathStep: { x: number; y: number } | null = null;
      const isWaveEnemy = this.waveEnemyIds.has(enemy.id);
      const isAlertTracked =
        (this.isAlertActive && dist <= RaycastEnemyManager.ALERT_AWARENESS_RADIUS) ||
        isWaveEnemy;

      const inRange = dist <= enemy.config.attackRange && los && lof;
      const shootingThroughDoor = enemy.doorOnSightLine !== null;
      const inDoorway = enemy.nearestDoorDist < 1.2;
      const hasCleanFiringPosition =
        inRange &&
        !shootingThroughDoor &&
        !inDoorway &&
        enemy.state === "attack";

      const shouldPathfind =
        (enemy.state === "chase" || (enemy.hasTarget && enemy.searchTimer > 0) || isWaveEnemy) &&
        enemy.config.type !== RaycastEnemyType.DIAGONA &&
        !(enemy.state === "attack" && hasCleanFiringPosition);

      if (shouldPathfind) {
        if (enemy.pathCooldown > 0) {
          enemy.pathCooldown = Math.max(0, enemy.pathCooldown - dt);
        }

        // Target real-time player location if directly visible or wave enemy, otherwise pursue last known position
        const targetCoordX = (canSee || isWaveEnemy) ? playerX : (enemy.hasTarget ? enemy.lastKnownPlayerX : playerX);
        const targetCoordY = (canSee || isWaveEnemy) ? playerY : (enemy.hasTarget ? enemy.lastKnownPlayerY : playerY);

        const targetCellX = Math.floor(targetCoordX);
        const targetCellY = Math.floor(targetCoordY);

        const needsRepath =
          !enemy.pathFollower.hasPath() ||
          enemy.pathCooldown <= 0 ||
          targetCellX !== Math.floor(enemy.pathTargetX) ||
          targetCellY !== Math.floor(enemy.pathTargetY);

        const isSegmentClear = (x1: number, y1: number, x2: number, y2: number): boolean => {
          if (!lofChecker(x1, y1, x2, y2)) return false;
          const segDx = x2 - x1;
          const segDy = y2 - y1;
          const segLen = Math.hypot(segDx, segDy);
          if (segLen < 0.001) return true;
          const offX = (-segDy / segLen) * 0.20;
          const offY = (segDx / segLen) * 0.20;
          if (!lofChecker(x1 + offX, y1 + offY, x2 + offX, y2 + offY)) return false;
          if (!lofChecker(x1 - offX, y1 - offY, x2 - offX, y2 - offY)) return false;
          return true;
        };

        if (needsRepath && this.astar) {
          const rawPath = this.astar.findPath(enemy.x, enemy.y, targetCoordX, targetCoordY);
          if (rawPath.length > 0) {
            // Mark door tile AND cardinally adjacent approach/exit tiles as crucial so entities approach doorways cardinally
            const isCrucialDoorNode = (node: { x: number; y: number }): boolean => {
              const idx = node.y * mapWidth + node.x;
              if (this.isDoorTile(idx, doorStatesFlat)) return true;
              const cardinals = [
                { x: node.x + 1, y: node.y },
                { x: node.x - 1, y: node.y },
                { x: node.x, y: node.y + 1 },
                { x: node.x, y: node.y - 1 },
              ];
              for (const c of cardinals) {
                if (c.x >= 0 && c.x < mapWidth && c.y >= 0 && c.y < mapHeight) {
                  if (this.isDoorTile(c.y * mapWidth + c.x, doorStatesFlat)) {
                    return true;
                  }
                }
              }
              return false;
            };
            const smoothedPath = AStarPathfinder.smoothPath(rawPath, isSegmentClear, isCrucialDoorNode);
            enemy.pathFollower.setPath(smoothedPath, true);
            enemy.pathTargetX = targetCoordX;
            enemy.pathTargetY = targetCoordY;
            // Stagger repath frequency across enemies (~0.35s - 0.60s)
            enemy.pathCooldown = 0.35 + (enemy.id % 6) * 0.05;
          }
        }

        // Check doorway immediately ahead to open unlocked doors smoothly (excluding keycard doors)
        if (enemy.nearestDoorCell && enemy.nearestDoorDist <= 1.5) {
          const nCell = enemy.nearestDoorCell;
          const nIdx = nCell.y * mapWidth + nCell.x;
          const nKey = `${nCell.x},${nCell.y}`;
          const isKeycardDoor = Boolean(lockedDoors && lockedDoors[nKey]);
          if (!isKeycardDoor && this.isDoorTile(nIdx, doorStatesFlat) && doorStatesFlat[nIdx] === 0) {
            this.onEnemyOpenDoorCallback?.(nCell.x, nCell.y, enemy.x, enemy.y);
          }
        } else {
          const frontX = Math.floor(enemy.x + enemy.dirX * 0.7);
          const frontY = Math.floor(enemy.y + enemy.dirY * 0.7);
          if (frontX >= 0 && frontX < mapWidth && frontY >= 0 && frontY < mapHeight) {
            const fIdx = frontY * mapWidth + frontX;
            const fKey = `${frontX},${frontY}`;
            const isKeycardDoor = Boolean(lockedDoors && lockedDoors[fKey]);
            if (!isKeycardDoor && this.isDoorTile(fIdx, doorStatesFlat) && doorStatesFlat[fIdx] === 0) {
              this.onEnemyOpenDoorCallback?.(frontX, frontY, enemy.x, enemy.y);
            }
          }
        }

        // Advance follower and obtain active waypoint with natural arrival radius (0.35)
        // Pass isSegmentClear to enable lookahead pure-pursuit shortcutting directly to visible waypoints
        const currentWp = enemy.pathFollower.advance(enemy.x, enemy.y, 0.35, isSegmentClear);
        if (currentWp) {
          pathStep = { x: currentWp.x, y: currentWp.y };
        } else {
          // Fallback to BFS step if available
          pathStep = this.getNextPathStep(
            enemy.x,
            enemy.y,
            mapWidth,
            mapHeight,
            doorStatesFlat,
            enemy.id
          );
        }
      }

      enemy.update(
        delta,
        playerX,
        playerY,
        losChecker,
        moveChecker,
        onShootPlayer,
        lofChecker,
        playerDirX,
        playerDirY,
        activeGrenades,
        pathStep
      );

      // Trigger stormtrooper voicelines based on visibility & proximity
      this.voicelineManager.onEnemyUpdate(
        enemy,
        playerX,
        playerY,
        canSee,
        dist,
        isBehindWall
      );

      // Clear one-frame just-spotted flag
      enemy.justSpottedPlayer = false;

      // Handle drop on death
      if (enemy.isDead && !enemy.hasDroppedLoot) {
        if (enemy.itemDrop && enemy.itemDrop.type && enemy.itemDrop.type !== "-") {
          enemy.hasDroppedLoot = true;
          this.spawnCustomItemDrop(enemy, pickupManager);
        } else if (enemy.config.dropWeapon !== undefined) {
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
    }

    // Update queue, concurrency, and spacing for stormtrooper voicelines
    this.voicelineManager.update(delta, playerX, playerY);
  }

  private spawnCustomItemDrop(
    enemy: RaycastEnemy,
    pickupManager: RaycastPickupManager
  ): void {
    if (!enemy.itemDrop) return;
    const drop = enemy.itemDrop;
    const typeStr = (drop.type || "").toLowerCase().trim();
    const amount = drop.amount !== undefined ? drop.amount : 1;

    let pickupType = RaycastPickupType.WEAPON;
    let weaponEnum = RaycastWeaponType.E11;

    if (typeStr.includes("red") && (typeStr.includes("card") || typeStr.includes("key"))) {
      pickupType = RaycastPickupType.RED_KEYCARD;
    } else if (typeStr.includes("blue") && (typeStr.includes("card") || typeStr.includes("key"))) {
      pickupType = RaycastPickupType.BLUE_KEYCARD;
    } else if (typeStr.includes("green") && (typeStr.includes("card") || typeStr.includes("key"))) {
      pickupType = RaycastPickupType.GREEN_KEYCARD;
    } else if (typeStr === "card" || typeStr === "keycard") {
      pickupType = RaycastPickupType.RED_KEYCARD;
    } else if (typeStr === "shield") {
      pickupType = RaycastPickupType.SHIELD;
    } else if (typeStr === "health") {
      pickupType = RaycastPickupType.HEALTH;
    } else if (typeStr === "ammo") {
      if (drop.weaponType && drop.weaponType.toLowerCase().includes("detonator")) {
        pickupType = amount > 1
          ? RaycastPickupType.THERMAL_DETONATOR_BELT
          : RaycastPickupType.THERMAL_DETONATOR_SINGLE;
      } else {
        pickupType = RaycastPickupType.AMMO;
      }
    } else if (typeStr === "weapon") {
      pickupType = RaycastPickupType.WEAPON;
      const wType = (drop.weaponType || "e_11").toLowerCase();
      if (wType.includes("dh_17") || wType.includes("dh17")) {
        weaponEnum = RaycastWeaponType.DH17;
      } else if (wType.includes("detonator")) {
        weaponEnum = RaycastWeaponType.THERMAL_DETONATOR;
      } else {
        weaponEnum = RaycastWeaponType.E11;
      }
    } else {
      if (typeStr === "red_keycard") pickupType = RaycastPickupType.RED_KEYCARD;
      else if (typeStr === "blue_keycard") pickupType = RaycastPickupType.BLUE_KEYCARD;
      else if (typeStr === "green_keycard") pickupType = RaycastPickupType.GREEN_KEYCARD;
      else pickupType = RaycastPickupType.WEAPON;
    }

    pickupManager.spawnPickup(
      pickupType,
      enemy.x,
      enemy.y,
      amount,
      weaponEnum
    );
  }

  /**
   * Sets the vision cone angle (in degrees) for a specific enemy.
   * Note: Viper Probe Droid is exempt and will always retain 360-degree vision.
   */
  public setEnemyVisionCone(enemyId: number, angleDegrees: number): void {
    const enemy = this.enemies.find((e) => e.id === enemyId);
    if (enemy && enemy.config.type !== RaycastEnemyType.VIPER_DROID) {
      enemy.visionConeAngle = angleDegrees;
    }
  }

  /**
   * Sets the vision cone angle (in degrees) for all active enemies.
   * Note: Viper Probe Droid is exempt and will always retain 360-degree vision.
   */
  public setAllEnemiesVisionCone(angleDegrees: number): void {
    for (const enemy of this.enemies) {
      if (enemy.config.type !== RaycastEnemyType.VIPER_DROID) {
        enemy.visionConeAngle = angleDegrees;
      }
    }
  }

  /**
   * Sets the vision cone angle (in degrees) for all enemies of a given type.
   * Note: Viper Probe Droid is exempt and will always retain 360-degree vision.
   */
  public setVisionConeByType(
    enemyType: RaycastEnemyType | string,
    angleDegrees: number
  ): void {
    if (enemyType === RaycastEnemyType.VIPER_DROID || enemyType === "viper_droid") {
      return; // Viper Droid is exempt from cone restriction
    }
    for (const enemy of this.enemies) {
      if (enemy.config.type === enemyType) {
        enemy.visionConeAngle = angleDegrees;
      }
    }
  }

  /**
   * Sets target acquisition accuracy ramp parameters for a specific enemy.
   */
  public setEnemyAccuracyRamp(
    enemyId: number,
    initialMultiplier?: number,
    rampTimeMs?: number,
    firstShotsCount?: number,
    reactionDelayMs?: number
  ): void {
    const enemy = this.enemies.find((e) => e.id === enemyId);
    if (enemy) {
      if (initialMultiplier !== undefined) enemy.config.initialAccuracyMultiplier = initialMultiplier;
      if (rampTimeMs !== undefined) enemy.config.accuracyRampTime = rampTimeMs;
      if (firstShotsCount !== undefined) enemy.config.firstShotsInaccuracyCount = firstShotsCount;
      if (reactionDelayMs !== undefined) enemy.config.initialReactionDelay = reactionDelayMs;
    }
  }

  /**
   * Sets target acquisition accuracy ramp parameters for all enemies.
   */
  public setAllEnemiesAccuracyRamp(
    initialMultiplier?: number,
    rampTimeMs?: number,
    firstShotsCount?: number,
    reactionDelayMs?: number
  ): void {
    for (const enemy of this.enemies) {
      if (initialMultiplier !== undefined) enemy.config.initialAccuracyMultiplier = initialMultiplier;
      if (rampTimeMs !== undefined) enemy.config.accuracyRampTime = rampTimeMs;
      if (firstShotsCount !== undefined) enemy.config.firstShotsInaccuracyCount = firstShotsCount;
      if (reactionDelayMs !== undefined) enemy.config.initialReactionDelay = reactionDelayMs;
    }
  }

  /**
   * Sets target acquisition accuracy ramp parameters for all enemies of a given type.
   */
  public setAccuracyRampByType(
    enemyType: RaycastEnemyType | string,
    initialMultiplier?: number,
    rampTimeMs?: number,
    firstShotsCount?: number,
    reactionDelayMs?: number
  ): void {
    for (const enemy of this.enemies) {
      if (enemy.config.type === enemyType) {
        if (initialMultiplier !== undefined) enemy.config.initialAccuracyMultiplier = initialMultiplier;
        if (rampTimeMs !== undefined) enemy.config.accuracyRampTime = rampTimeMs;
        if (firstShotsCount !== undefined) enemy.config.firstShotsInaccuracyCount = firstShotsCount;
        if (reactionDelayMs !== undefined) enemy.config.initialReactionDelay = reactionDelayMs;
      }
    }
  }

  /**
   * Called when the player shoots a weapon.
   * Alerts any enemies that:
   * 1. Are within hearing distance of the gunshot (direct acoustic or wall-muffled).
   * 2. Are close to the trajectory of the bullet/laser (near-miss along line segment).
   * 3. Are close to where the bullet/laser hits (impact radius).
   */
  public onPlayerShoot(
    shooterX: number,
    shooterY: number,
    targetX: number,
    targetY: number,
    gunshotRadius: number = 14.0,
    nearMissRadius: number = 3.5,
    impactRadius: number = 4.0
  ): void {
    const segDx = targetX - shooterX;
    const segDy = targetY - shooterY;
    const segLenSq = segDx * segDx + segDy * segDy;

    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;

      const isAlreadyEngaged = enemy.state === "chase" || enemy.hasTarget;
      const distToShooter = Math.hypot(enemy.x - shooterX, enemy.y - shooterY);

      // Line-of-fire check: unalerted distant enemies only hear gunfire if line-of-fire is clear or within acoustic proximity (<= 6.0)
      if (
        !isAlreadyEngaged &&
        distToShooter > 6.0 &&
        this.cachedMapFlat &&
        this.cachedMapWidth &&
        this.cachedMapHeight &&
        this.cachedDoorStatesFlat
      ) {
        const hasClearLine = this.hasLineOfFire(
          enemy.x,
          enemy.y,
          shooterX,
          shooterY,
          this.cachedMapFlat,
          this.cachedMapWidth,
          this.cachedMapHeight,
          this.cachedDoorStatesFlat,
          this.cachedThinWalls
        );
        if (!hasClearLine) {
          continue; // Blocked by solid wall, closed door, or thin wall: distant enemy in another room cannot detect player
        }
      }
      const distToImpact = Math.hypot(enemy.x - targetX, enemy.y - targetY);

      // Check distance from enemy to laser trajectory line segment
      let distToLaser = distToShooter;
      if (segLenSq > 0.0001) {
        const t = Math.max(
          0,
          Math.min(1, ((enemy.x - shooterX) * segDx + (enemy.y - shooterY) * segDy) / segLenSq)
        );
        const projX = shooterX + t * segDx;
        const projY = shooterY + t * segDy;
        distToLaser = Math.hypot(enemy.x - projX, enemy.y - projY);
      }

      const heardGunshot = distToShooter <= gunshotRadius;
      const nearMiss = distToLaser <= nearMissRadius;
      const nearImpact = distToImpact <= impactRadius;

      if (heardGunshot || nearMiss || nearImpact) {
        enemy.alert(shooterX, shooterY, true);
        this.voicelineManager.onGunfireHeard(enemy, shooterX, shooterY, false);
      }
    }
  }

  /**
   * Alerts any enemies within impact radius of where a projectile hit a wall, floor, or object.
   */
  public onLaserImpact(
    impactX: number,
    impactY: number,
    shooterX: number,
    shooterY: number,
    alertRadius: number = 4.0
  ): void {
    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;

      // Strict line-of-fire check: enemies only detect the player if there are NO walls between them and the player
      if (
        this.cachedMapFlat &&
        this.cachedMapWidth &&
        this.cachedMapHeight &&
        this.cachedDoorStatesFlat
      ) {
        const hasClearLine = this.hasLineOfFire(
          enemy.x,
          enemy.y,
          shooterX,
          shooterY,
          this.cachedMapFlat,
          this.cachedMapWidth,
          this.cachedMapHeight,
          this.cachedDoorStatesFlat,
          this.cachedThinWalls
        );
        if (!hasClearLine) {
          continue; // Blocked by wall: enemy in another room cannot detect player
        }
      }

      const distToImpact = Math.hypot(enemy.x - impactX, enemy.y - impactY);
      if (distToImpact <= alertRadius) {
        enemy.alert(shooterX, shooterY, true);
        this.voicelineManager.onGunfireHeard(enemy, shooterX, shooterY, false);
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
    maxRenderDistance: number,
    doorDistBuffer?: Float64Array,
    doorBottomBuffer?: Float64Array
  ): void {
    for (const enemy of this.enemies) {
      enemy.render3D(
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
      if (closestEnemy.isShielding) {
        return closestEnemy;
      }
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
      } else if (dist <= 20.0) {
        const wallsToCheck = thinWalls || this.cachedThinWalls;
        const isBehindWall =
          this.cachedMapFlat && this.cachedMapWidth && this.cachedMapHeight && this.cachedDoorStatesFlat
            ? !this.hasLineOfFire(
                enemy.x,
                enemy.y,
                centerX,
                centerY,
                this.cachedMapFlat,
                this.cachedMapWidth,
                this.cachedMapHeight,
                this.cachedDoorStatesFlat,
                wallsToCheck
              )
            : false;
        if (!isBehindWall) {
          enemy.alert(centerX, centerY, true);
          this.voicelineManager.onGunfireHeard(enemy, centerX, centerY, false);
        }
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
