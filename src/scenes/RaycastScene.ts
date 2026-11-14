import {
  Container,
  Graphics,
  Mesh,
  MeshGeometry,
  MIPMAP_MODES,
  Rectangle,
  SCALE_MODES,
  Shader,
  Sprite,
  Texture,
  Ticker,
  Assets,
  TilingSprite,
  WRAP_MODES,
  BaseTexture,
  CubeResource,
  BufferResource,
} from "pixi.js";
import { sound } from "@pixi/sound";
import { BaseScene } from "./BaseScene";
import { Scene } from "../enums/Scene";
import { gameConfig } from "../configs/GameConfig";
import { getSoundBaseVolume } from "../configs/SoundConfig";
import { MobileControls } from "../ui/MobileControls";
import { MapObject, RaycastBreakable, TileMeta } from "./raycast/types";
import { RaycastSaveManager } from "./raycast/RaycastSaveManager";
import { defaultDestructibleWallConfig } from "../configs/DestructableWallConfig";
import { RaycastPickupManager } from "./raycast/RaycastPickupManager";
import { RaycastBreakableManager } from "./raycast/RaycastBreakableManager";
import { RaycastWeaponView } from "./raycast/RaycastWeaponView";
import { RaycastHUD } from "./raycast/RaycastHUD";
import { RaycastPlayerController } from "./raycast/RaycastPlayerController";
import { RaycastEnemy } from "./raycast/RaycastEnemy";
import { RaycastEnemyManager } from "./raycast/RaycastEnemyManager";
import { DestructableWallManager } from "./raycast/DestructableWallManager";
import { ThermalDetonatorManager } from "./raycast/ThermalDetonatorManager";
import { RaycastLaserManager } from "./raycast/RaycastLaserManager";
import { RaycastStairsManager } from "./raycast/RaycastStairsManager";
import { RaycastStationaryObjectManager } from "./raycast/RaycastStationaryObjectManager";
import { RaycastAllyManager } from "./raycast/RaycastAllyManager";
import { RaycastDebugMenu } from "./raycast/RaycastDebugMenu";
import { RaycastWeaponType } from "../enums/RaycastWeaponType";
import { RaycastPickupType } from "../enums/RaycastPickupType";
import {
  getSkyboxConfig,
  RaycastSkyboxConfig,
} from "../configs/SkyboxConfig";
import { DoorSlideMode, DoorOpen, TileType } from "./raycast/types";
import floorCeilingVert from "./raycast/shaders/floorCeiling.vert";
import floorCeilingFrag from "./raycast/shaders/floorCeiling.frag";
import skyboxVert from "./raycast/shaders/skybox.vert";
import skyboxFrag from "./raycast/shaders/skybox.frag";
import { RaycastMinimap, IMinimapObjectiveMarker } from "../plugins/minimap";
import { RaycastMissionManager, ITriggerZone, ITriggerSoundConfig } from "./raycast/objectives";
import { SubtitleManager, RaycastSubtitles } from "./raycast/subtitles";
import { InGameMenu } from "../ui/InGameMenu";
import { RaycastLoadingOverlay } from "../ui/RaycastLoadingOverlay";
import { SettingsManager } from "../managers/SettingsManager";
import { GameEvent } from "../enums/GameEvent";
import {
  calculateMapBounds,
  extractTiledGidAndRotation,
  forEachTileInLayer,
} from "./raycast/tiledUtils";

export interface LevelFinishZone {
  id?: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  targetLevel: string;
  enabled?: boolean;
}

interface RayHit {
  wallType: number;
  distance: number;
  hitX: number;
  side: number;
  mapX: number;
  mapY: number;
  rayDirX: number;
  rayDirY: number;
  orientation?: "vertical" | "horizontal";
  isDoor?: boolean;
  doorSlide?: DoorOpen;
  doorOpen?: number;
}

interface ThinWallEntry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  texture: number;
  orientation: "vertical" | "horizontal";
  minCol?: number;
  maxCol?: number;
}

export class RaycastScene extends BaseScene {
  private player: {
    x: number;
    y: number;
    dirX: number;
    dirY: number;
    planeX: number;
    planeY: number;
  };
  private keys: Record<string, boolean> = {
    w: false,
    a: false,
    s: false,
    d: false,
    shift: false,
  };
  private graphics: Graphics;
  private textures: Record<number, Texture> = {};
  private columnTextures: Record<number, Texture[]> = {};
  private moveSpeed: number = 0.02;
  private lastFrameDistMoved: number = 0;
  private playerRadius: number = 0.28;
  private rotSpeed: number = 0.05;
  private mouseSensitivity: number = 0.002;
  private map: number[][];
  private floorMap: number[][];
  private ceilingMap: number[][];
  private mapWidth: number;
  private mapHeight: number;
  private doorStates: Record<string, number> = {};
  private thinWalls: ThinWallEntry[] = [];
  private activeThinWalls: ThinWallEntry[] = [];
  private spritePool: Sprite[][] = [];
  private thinWallContainer!: Container;
  private thinWallSpritePool: Sprite[][] = [];
  private prevThinHitCounts: Int32Array = new Int32Array(gameConfig.width);
  private hitPool: RayHit[][] = [];
  private readonly MAX_HITS_PER_COLUMN: number = 16;
  private readonly MAX_RENDER_DISTANCE: number = 30;
  private tileTypes: Record<number, string> = {};
  private tileMeta: Record<number, TileMeta> = {};

  // --- Performance: Flat typed arrays for cache-local map access ---
  private mapFlat!: Int32Array;
  private floorMapFlat!: Int32Array;
  private ceilingMapFlat!: Int32Array;
  // Numeric door states keyed by flat index (y * mapWidth + x) instead of string keys
  private doorStatesFlat!: Float64Array;
  private doorOrientationsFlat!: Uint8Array; // 0 = NS (plane at x + 0.5), 1 = EW (plane at y + 0.5)
  private doorSlideModesFlat!: Uint8Array; // 0 = DoorOpen.LEFT, 1 = DoorOpen.UP, 3 = DoorOpen.RIGHT
  private doorSlideModes: Record<string, DoorOpen> = {};
  public defaultDoorSlide: DoorOpen = gameConfig.defaultDoorSlide || DoorOpen.UP;
  private doorColumnTextures: Texture[][] = [];
  private thinWallColumnTextures: Texture[][] = [];

  // Numeric tile type flags (0=empty, 1=thickWall, 2=door, 3=thinWall)
  private static readonly TILE_EMPTY = 0;
  private static readonly TILE_WALL = 1;
  private static readonly TILE_DOOR = 2;
  private static readonly TILE_THIN = 3;
  private tileTypeFlags!: Uint8Array;
  // Global row-skip bounds
  private globalMinWallTop: number = 0;
  private globalMaxWallTop: number = 0;
  private globalMinWallBottom: number = 0;
  private globalMaxWallBottom: number = 0;

  private wallTop: Int32Array = new Int32Array(gameConfig.width);
  private wallBottom: Int32Array = new Int32Array(gameConfig.width);
  private hitCounts: Int32Array = new Int32Array(gameConfig.width);
  private prevHitCounts: Int32Array = new Int32Array(gameConfig.width);
  private zBuffer: Float64Array = new Float64Array(gameConfig.width);
  private doorDistBuffer: Float64Array = new Float64Array(gameConfig.width);
  private doorBottomBuffer: Float64Array = new Float64Array(gameConfig.width);

  private mapObjects: MapObject[] = [];
  private objectContainer!: Container;
  private objectSpritePool: Sprite[] = [];
  private objectSpritePoolIndex: number = 0;

  // Layered containers for clean scene hierarchy and fast transforms
  private worldContainer!: Container;
  private backgroundContainer!: Container;
  private wallContainer!: Container;
  private entityContainer!: Container;



  // GPU Floor & Ceiling rendering
  private floorCeilingMesh!: Mesh<Shader>;
  private floorCeilingShader!: Shader;
  private skyboxMesh!: Mesh<Shader>;
  private skyboxShader!: Shader;
  private isSkyboxOnlyActive: boolean = false;
  private floorCeilingAtlasTexture: Texture = Texture.WHITE;
  private floorCeilingMapTexture: Texture = Texture.WHITE;
  private currentSkyboxTexture: Texture | null = null;
  private currentSkyboxCubeTexture: Texture | null = null;
  private emptyCubeMapTexture!: Texture;
  private uPlayerPosUniform = new Float32Array(2);
  private uDirUniform = new Float32Array(2);
  private uPlaneUniform = new Float32Array(2);
  private uSkyboxYawCS = new Float32Array([1.0, 0.0]);
  private currentSkyboxZoom: number = 1.10;
  private currentSkyboxYaw: number = 0.0;
  private wallBoundsData = new Uint8Array(gameConfig.width * 4);
  private wallBoundsTexture!: Texture;
  private skyboxGeom!: MeshGeometry;
  private skyboxFullScreen: boolean = false;
  private uCeilingBoundsUniform = new Float32Array([-1.0, -1.0, -1.0, -1.0]);
  private graphicsUsed: boolean = false;

  // Reusable zero-allocation arrays and constants (High Priority Fixes)
  private static readonly ZERO_VECTOR = { x: 0, y: 0 };
  private static readonly NEARBY_OFFSETS = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  private allThinWalls: ThinWallEntry[] = [];
  private doorEntries: Array<{ key: string; flatIdx: number; x: number; y: number }> = [];

  private mobileControls!: MobileControls;
  private weaponView!: RaycastWeaponView;
  private hud!: RaycastHUD;
  private minimap!: RaycastMinimap;
  private missionManager!: RaycastMissionManager;
  private subtitleManager!: SubtitleManager;
  private subtitles?: RaycastSubtitles;
  private debugMenu!: RaycastDebugMenu;
  private inGameMenu!: InGameMenu;
  private loadingOverlay?: RaycastLoadingOverlay;
  private isLevelLoading: boolean = false;
  private isPaused: boolean = false;
  private playerController!: RaycastPlayerController;
  private pickupManager!: RaycastPickupManager;
  private breakableManager!: RaycastBreakableManager;
  private animatedPickupContainer!: Container;
  private enemyContainer!: Container;
  private enemyManager!: RaycastEnemyManager;
  private stationaryObjectManager!: RaycastStationaryObjectManager;
  private allyManager!: RaycastAllyManager;
  private destructableWallManager!: DestructableWallManager;
  private detonatorContainer!: Container;
  private detonatorManager!: ThermalDetonatorManager;
  private laserContainer!: Container;
  private laserManager!: RaycastLaserManager;
  private stairsManager!: RaycastStairsManager;
  private shakeIntensity: number = 0;
  private shakeDuration: number = 0;
  private lockedDoors: Record<string, string> = {};
  private unlockedKeycardDoors: Set<string> = new Set();
  private disabledDoors: Set<string> = new Set();
  private activePropSounds: Map<string, any> = new Map();
  private triggerSoundTimeouts: Set<number> = new Set();
  private isLeftMouseDown: boolean = false;
  private isRightMouseDown: boolean = false;
  private bgMusicInstance: any = null;
  private currentBgMusicAlias: string | null = null;
  private isBgMusicOverridden: boolean = false;
  private battleMusicInstance: any = null;
  private baseAlarmInstance: any = null;
  private isAlertActive: boolean = false;
  private enemySpawnPoints: Array<{ x: number; y: number }> = [];
  private firstgid: number = 1;
  private currentLevel: string = "level1";
  private isLevelTransitioning: boolean = false;
  private levelFinishZones: LevelFinishZone[] = [];
  private currentMapOffsetX: number = 0;
  private currentMapOffsetY: number = 0;
  private currentMapData: any = null;
  private mapObjectsById: Map<number, any> = new Map();
  private animatedWallFrames: Record<number, Texture[][]> = {};
  private animatedWallTextures: Record<number, Texture[]> = {};
  private animatedWallTimer: number = 0;
  private animatedWallFrameIndex: number = 0;

  constructor(stage: Container, scale: number, level?: string) {
    super(stage, scale);
    this.sortableChildren = true;

    const startLevel = level || RaycastSaveManager.getCurrentLevel();
    this.currentLevel = startLevel;

    this.map = [];
    this.floorMap = [];
    this.ceilingMap = [];
    this.mapWidth = 0;
    this.mapHeight = 0;

    this.player = {
      x: 2,
      y: 5,
      dirX: -1,
      dirY: 0,
      planeX: 0,
      planeY: -0.8,
    };

    // 1. World container holding all 3D world elements (supports isolated sorting and shake)
    this.worldContainer = new Container();
    this.worldContainer.sortableChildren = true;
    this.addChild(this.worldContainer);

    // Background mesh for GPU floor & ceiling/sky rendering (native 1:1 resolution via GLSL shader)
    const floorCeilingGeom = new MeshGeometry(
      new Float32Array([
        0, 0,
        gameConfig.width, 0,
        gameConfig.width, gameConfig.height,
        0, gameConfig.height,
      ]) as any,
      new Float32Array([
        0, 0,
        1, 0,
        1, 1,
        0, 1,
      ]) as any,
      new Uint16Array([0, 1, 2, 0, 2, 3]) as any
    );

    this.uPlayerPosUniform[0] = this.player.x;
    this.uPlayerPosUniform[1] = this.player.y;
    this.uDirUniform[0] = this.player.dirX;
    this.uDirUniform[1] = this.player.dirY;
    this.uPlaneUniform[0] = this.player.planeX;
    this.uPlaneUniform[1] = this.player.planeY;

    this.emptyCubeMapTexture = this.createEmptyCubeMapTexture();

    // 1. Dedicated Skybox mesh (rendered behind floor & ceiling at zIndex = 0).
    // Covers only the top (ceiling) half of the screen during gameplay.
    this.wallBoundsData.fill(0);
    for (let c = 0; c < gameConfig.width; c++) {
      this.wallBoundsData[c * 4] = 255; // wallTop = screen bottom (no occlusion)
      this.wallBoundsData[c * 4 + 2] = 255;
      this.wallBoundsData[c * 4 + 3] = 255; // opaque alpha: avoids premultiply side effects
    }
    this.wallBoundsTexture = new Texture(
      new BaseTexture(
        new BufferResource(this.wallBoundsData, { width: gameConfig.width, height: 1 }),
        {
          scaleMode: SCALE_MODES.NEAREST,
          mipmap: MIPMAP_MODES.OFF,
          wrapMode: WRAP_MODES.CLAMP,
        }
      )
    );

    const skyboxGeom = new MeshGeometry(
      new Float32Array([
        0, 0,
        gameConfig.width, 0,
        gameConfig.width, gameConfig.height * 0.5,
        0, gameConfig.height * 0.5,
      ]) as any,
      new Float32Array([
        0, 0,
        1, 0,
        1, 0.5,
        0, 0.5,
      ]) as any,
      new Uint16Array([0, 1, 2, 0, 2, 3]) as any
    );
    this.skyboxGeom = skyboxGeom;

    this.skyboxShader = Shader.from(
      skyboxVert,
      skyboxFrag,
      {
        uDir: this.uDirUniform,
        uPlane: this.uPlaneUniform,
        uSkyboxTexture: Texture.WHITE,
        uSkyboxCube: this.emptyCubeMapTexture,
        uHasSkybox: 0.0,
        uHasCubeMap: 0.0,
        uSkyboxZoom: this.currentSkyboxZoom,
        uSkyboxVFactor: (0.8 * 2.0) / (gameConfig.width / gameConfig.height),
        uSkyboxYawCS: this.uSkyboxYawCS,
        uSkyboxRepeat: [1.0, 1.0],
        uSkyboxOffset: [0.0, 0.0],
        uWallBoundsTex: this.wallBoundsTexture,
      }
    );
    this.skyboxMesh = new Mesh(skyboxGeom, this.skyboxShader);
    this.skyboxMesh.zIndex = 0;
    this.skyboxMesh.visible = false;

    // 2. Dedicated Floor/Ceiling mesh (zIndex = 1). Opaque on indoor levels; on skybox levels
    // open ceiling cells output alpha 0 so the skybox shows through (no discard needed).
    this.floorCeilingShader = Shader.from(
      floorCeilingVert,
      floorCeilingFrag,
      {
        uPlayerPos: this.uPlayerPosUniform,
        uDir: this.uDirUniform,
        uPlane: this.uPlaneUniform,
        uMaxDist: this.MAX_RENDER_DISTANCE,
        uMapSize: [1.0, 1.0],
        uMapTexture: Texture.WHITE,
        uAtlas: Texture.WHITE,
        uAtlasGrid: [4.0, 4.0],
        uTileSize: 256.0,
        uCeilingBounds: this.uCeilingBoundsUniform,
        uWallBoundsTex: this.wallBoundsTexture,
        uSkyActive: 0.0,
      }
    );

    this.floorCeilingMesh = new Mesh(floorCeilingGeom, this.floorCeilingShader);
    this.floorCeilingMesh.zIndex = 1;
    this.floorCeilingMesh.state.blend = false;

    this.graphics = new Graphics();

    // Background layer container (skybox, floor, ceiling, graphics fallback)
    this.backgroundContainer = new Container();
    this.backgroundContainer.zIndex = 0;
    this.backgroundContainer.sortableChildren = true;
    this.backgroundContainer.addChild(this.skyboxMesh);
    this.backgroundContainer.addChild(this.floorCeilingMesh);
    this.backgroundContainer.addChild(this.graphics);
    this.worldContainer.addChild(this.backgroundContainer);

    // Wall layer container (isolates the solid wall column slice sprites)
    this.wallContainer = new Container();
    this.wallContainer.zIndex = 10;
    this.worldContainer.addChild(this.wallContainer);

    // Entity layer container holding all depth-sorted transparent elements (thin walls, pickups, enemies)
    this.entityContainer = new Container();
    this.entityContainer.zIndex = 20;
    this.entityContainer.sortableChildren = true;
    this.worldContainer.addChild(this.entityContainer);

    this.thinWallContainer = this.entityContainer;
    this.objectContainer = this.entityContainer;
    this.animatedPickupContainer = this.entityContainer;
    this.enemyContainer = this.entityContainer;

    for (let i = 0; i < gameConfig.width; i++) {
      const columnSprites: Sprite[] = [];
      for (let j = 0; j < this.MAX_HITS_PER_COLUMN; j++) {
        const sprite = new Sprite();
        sprite.width = 1;
        sprite.x = i;
        sprite.roundPixels = true;
        sprite.visible = false;
        columnSprites.push(sprite);
      }
      this.spritePool.push(columnSprites);

      const thinSprites: Sprite[] = [];
      for (let j = 0; j < 2; j++) {
        const sprite = new Sprite();
        sprite.width = 1;
        sprite.x = i;
        sprite.roundPixels = true;
        sprite.visible = false;
        thinSprites.push(sprite);
      }
      this.thinWallSpritePool.push(thinSprites);

      const colDoorTex: Texture[] = [];
      const colThinTex: Texture[] = [];
      for (let j = 0; j < 16; j++) {
        const dTex = new Texture(Texture.WHITE.baseTexture, new Rectangle(0, 0, 1, 1));
        dTex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
        dTex.baseTexture.mipmap = MIPMAP_MODES.OFF;
        colDoorTex.push(dTex);
        const tTex = new Texture(Texture.WHITE.baseTexture, new Rectangle(0, 0, 1, 1));
        tTex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
        tTex.baseTexture.mipmap = MIPMAP_MODES.OFF;
        colThinTex.push(tTex);
      }
      this.doorColumnTextures.push(colDoorTex);
      this.thinWallColumnTextures.push(colThinTex);

      // Pre-allocate ray hit pool for zero-allocation raycasting
      const colHits: RayHit[] = [];
      for (let j = 0; j < 16; j++) {
        colHits.push({
          wallType: 0,
          distance: 0,
          hitX: 0,
          side: 0,
          mapX: 0,
          mapY: 0,
          rayDirX: 0,
          rayDirY: 0,
        });
      }
      this.hitPool.push(colHits);
    }

    for (let i = 0; i < 400; i++) {
      const sprite = new Sprite();
      sprite.width = 1;
      sprite.roundPixels = true;
      sprite.visible = false;
      this.objectSpritePool.push(sprite);
    }

    this.enemyManager = new RaycastEnemyManager(this.enemyContainer);
    this.stationaryObjectManager = new RaycastStationaryObjectManager(this.entityContainer);
    this.allyManager = new RaycastAllyManager(this.entityContainer);
    this.allyManager.onAllyOpenDoor = (cellX, cellY, allyX, allyY) => {
      return this.checkAndInteractEnemyDoor(cellX, cellY, allyX, allyY);
    };
    this.allyManager.onToast = (msg, color, dur) => {
      this.hud?.showToast(msg, color, dur);
    };

    // 3D Detonator projectile & explosion container
    this.detonatorContainer = new Container();
    this.detonatorContainer.zIndex = 50;
    this.detonatorContainer.sortableChildren = true;
    this.worldContainer.addChild(this.detonatorContainer);

    this.detonatorManager = new ThermalDetonatorManager(this.detonatorContainer);
    this.detonatorManager.onDetonate = (x, y, z, radius, damage) => {
      this.handleExplosionDetonation(x, y, z, radius, damage);
    };

    // 3D Laser projectile container (rendered above detonators & enemies, below HUD)
    this.laserContainer = new Container();
    this.laserContainer.zIndex = 55;
    this.worldContainer.addChild(this.laserContainer);

    this.laserManager = new RaycastLaserManager(this.laserContainer);
    this.laserManager.onLaserImpactAlert = (impactX, impactY, shooterX, shooterY) => {
      this.enemyManager.onLaserImpact(impactX, impactY, shooterX, shooterY);
    };

    // First-person equipped weapon view (rendered in front of 3D world, behind HUD)
    this.weaponView = new RaycastWeaponView();
    this.weaponView.zIndex = 60;
    this.addChild(this.weaponView);

    // Modern Star Wars HUD (crosshair, health bar, ammo counter, pickup toasts, screen flash)
    this.hud = new RaycastHUD();
    this.hud.zIndex = 70;
    this.addChild(this.hud);

    this.playerController = new RaycastPlayerController(this.weaponView, this.hud);
    this.pickupManager = new RaycastPickupManager(this.animatedPickupContainer);
    this.breakableManager = new RaycastBreakableManager();
    this.destructableWallManager = new DestructableWallManager();
    this.stairsManager = new RaycastStairsManager(this as any);

    // Overlay mobile on-screen controls (only on mobile devices)
    if (this.isMobileDevice()) {
      this.hud.adaptForMobile();
      // MobileControls includes the touch map and objectives buttons; hide HUD duplicates
      this.hud.setMapButtonVisible(false);
      this.hud.setObjectivesButtonVisible(false);
      this.mobileControls = new MobileControls();
      this.mobileControls.zIndex = 80;
      this.mobileControls.on("action", () => this.tryOpenDoor());
      this.mobileControls.on("fire", () => this.tryShoot(false));
      this.mobileControls.on("altFire", () => this.tryAltFire());
      this.mobileControls.on("switchWeapon", () => this.playerController.cycleWeapon(1));
      this.mobileControls.on("toggleSprint", (active: boolean) => {
        this.playerController.setSprinting(active);
      });
      this.mobileControls.on("toggleMinimap", () => this.minimap.toggle());
      this.mobileControls.on("toggleObjectives", () => this.missionManager.toggleObjectives());
      this.mobileControls.on("toggleDebug", () => this.debugMenu.toggle());
      this.mobileControls.on("togglePause", () => this.togglePause());
      this.addChild(this.mobileControls);
    }

    // Mission Objectives & Triggers Manager
    this.missionManager = new RaycastMissionManager({
      onTriggerAlarm: () => this.triggerAlert(),
      showToast: (text, color, duration) => this.hud?.showToast(text, color, duration),
      showPrompt: (text, color) => this.hud?.setPrompt(text, color),
      hidePrompt: () => this.hud?.clearPrompt(),
      onTriggerFired: (trigger) => this.handleTriggerFired(trigger),
      onTriggerWaitComplete: (trigger) => this.handleTriggerWaitComplete(trigger),
      onVoicelineStart: (level, key) => {
        this.subtitles?.start(this.subtitleManager.getCues(level, key));
      },
      onVoicelineProgress: (_key, progress, durationSec) =>
        this.subtitles?.setProgress(progress, durationSec),
      onVoicelineEnd: () => this.subtitles?.clear(),
    });
    this.subtitleManager = new SubtitleManager();
    this.subtitles = new RaycastSubtitles();
    this.subtitles.zIndex = 90; // Above HUD & mobile controls, below objectives/minimap/menus
    this.addChild(this.subtitles);
    const missionUI = this.missionManager.getUIContainer();
    missionUI.zIndex = 95;
    this.hud.on("toggleObjectives", () => this.missionManager.toggleObjectives());
    this.addChild(missionUI);

    // Tactical Minimap & Holomap Datapad Plugin
    this.minimap = new RaycastMinimap({
      getMapWidth: () => this.mapWidth,
      getMapHeight: () => this.mapHeight,
      getMapFlat: () => this.mapFlat,
      getTileTypeFlags: () => this.tileTypeFlags,
      getDoorStatesFlat: () => this.doorStatesFlat,
      getLockedDoors: () => this.lockedDoors,
      getUnlockedKeycardDoors: () => this.unlockedKeycardDoors,
      getThinWalls: () => this.allThinWalls,
      getLevelFinishZones: () => this.levelFinishZones,
      getObjectiveMarkers: () => this.getActiveObjectiveMarkers(),
      getPlayer: () => this.player,
      getActiveEnemies: () => this.enemyManager?.activeEnemies || [],
      getAllies: () => this.allyManager?.allies || [],
      getPickups: () => this.pickupManager?.getPickups() || [],
      getStationaryObjects: () => this.stationaryObjectManager?.objects || [],
      getStairs: () => this.stairsManager?.getStairList() || [],
      getLevelName: () => this.currentLevel || "Sector 1",
    });
    this.minimap.zIndex = 100;
    this.hud.on("toggleMinimap", () => this.minimap.toggle());
    this.addChild(this.minimap);

    // In-game mobile & desktop Debug / Tuning Datapad
    this.debugMenu = new RaycastDebugMenu({
      getSkyboxZoom: () => this.currentSkyboxZoom,
      setSkyboxZoom: (zoom) => this.setSkyboxZoom(zoom),
      getSkyboxYaw: () => this.currentSkyboxYaw,
      setSkyboxYaw: (yaw) => this.setSkyboxYaw(yaw),
      getSkyboxWallName: (yaw) => this.getCubeMapWallNameForYaw(yaw),
      isSkyboxOnly: () => this.isSkyboxOnlyActive,
      toggleSkyboxOnly: () => this.toggleSkyboxOnly(),
      isCubemapActive: () => (this.skyboxShader?.uniforms?.uHasCubeMap || 0) > 0.5,
      getCurrentLevel: () => this.currentLevel || "level3",
      isGodMode: () => this.playerController?.isGodMode || false,
      toggleGodMode: () => this.playerController?.toggleGodMode() || false,
      healPlayer: () => this.playerController?.refillHealthAndShield(),
      refillAmmo: () => this.playerController?.refillAllAmmo(),
      giveAllWeapons: () => this.playerController?.unlockAllWeapons(),
      giveAllKeycards: () => this.playerController?.grantAllKeycards(),
      cycleDoorMode: () => this.cycleDoorSlideMode(),
      killNearbyEnemies: () => this.killNearbyEnemies(),
      warpToLevel: (levelName) => this.loadLevel(levelName),
      showToast: (text, color, duration) => this.hud?.showToast(text, color, duration),
    });
    this.addChild(this.debugMenu);
    if (!this.isMobileDevice()) {
      this.addChild(this.debugMenu.getTriggerButton());
    }

    // In-game Pause & Options Menu
    this.inGameMenu = new InGameMenu();
    this.inGameMenu.zIndex = 110;
    this.inGameMenu.on(GameEvent.RESUME_GAME, () => {
      this.resumeGame();
    });
    this.inGameMenu.on(GameEvent.QUIT_GAME, () => {
      this.quitToMainMenu();
    });
    this.addChild(this.inGameMenu);

    this.setupControls();

    // Skybox controls and inspection helpers on window
    (window as any).setSkyboxZoom = (zoom: number) => this.setSkyboxZoom(zoom);
    (window as any).setSkyboxYaw = (yaw: number) => this.setSkyboxYaw(yaw);
    (window as any).setSkybox = (opts: { zoom?: number; yaw?: number }) => {
      if (opts.zoom !== undefined) this.setSkyboxZoom(opts.zoom);
      if (opts.yaw !== undefined) this.setSkyboxYaw(opts.yaw);
      return this.getSkyboxSettings();
    };
    (window as any).getSkybox = () => this.getSkyboxSettings();
    Ticker.shared.add(this.tick, this);
    this.loadLevel(startLevel).then(() => {
      this.playBackgroundMusic();
    });
  }


  private async loadExternalTileset(tileset: any): Promise<void> {
    const source = tileset.source;
    if (!source) return;

    const baseName = source.split(/[\\/]/).pop() || "";
    const candidatePaths = [
      `assets/raycast/levels/${source}`,
      `assets/raycast/${source}`,
      `assets/${source}`,
      `assets/raycast/levels/StarWarsTileset/${baseName}`,
      `assets/raycast/levels/${baseName}`,
      `assets/${baseName}`,
    ];

    let xmlText = "";
    for (const p of candidatePaths) {
      try {
        const res = await fetch(p);
        if (res.ok) {
          const text = await res.text();
          if (text && text.includes("<tileset")) {
            xmlText = text;
            break;
          }
        }
      } catch {
        // continue trying next path
      }
    }

    if (xmlText) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, "text/xml");
        const tilesetEl = doc.getElementsByTagName("tileset")[0];
        if (tilesetEl) {
          const tileEls = Array.from(tilesetEl.getElementsByTagName("tile"));
          const parsedTiles: any[] = [];

          for (const tileEl of tileEls) {
            const id = parseInt(tileEl.getAttribute("id") || "0", 10);
            const type = tileEl.getAttribute("type") || undefined;
            const imgEl = tileEl.getElementsByTagName("image")[0];
            const image = imgEl ? imgEl.getAttribute("source") || undefined : undefined;
            const imagewidth = imgEl ? parseInt(imgEl.getAttribute("width") || "0", 10) : undefined;
            const imageheight = imgEl ? parseInt(imgEl.getAttribute("height") || "0", 10) : undefined;

            const propsEl = tileEl.getElementsByTagName("properties")[0];
            const properties: any[] = [];
            if (propsEl) {
              for (let i = 0; i < propsEl.children.length; i++) {
                const prop = propsEl.children[i];
                if (prop.tagName !== "property") continue;
                const name = prop.getAttribute("name") || "";
                const propType = prop.getAttribute("type") || "string";
                const propertytype = prop.getAttribute("propertytype") || undefined;
                let val: any = prop.getAttribute("value");

                if (propType === "class") {
                  const nestedPropsEl = prop.getElementsByTagName("properties")[0];
                  if (nestedPropsEl) {
                    const subObj: Record<string, any> = {};
                    for (let j = 0; j < nestedPropsEl.children.length; j++) {
                      const sp = nestedPropsEl.children[j];
                      if (sp.tagName !== "property") continue;
                      const spName = sp.getAttribute("name") || "";
                      const spType = sp.getAttribute("type") || "string";
                      let spVal: any = sp.getAttribute("value");
                      if (spType === "int") spVal = parseInt(spVal, 10);
                      else if (spType === "float") spVal = parseFloat(spVal);
                      else if (spType === "bool") spVal = spVal === "true";
                      subObj[spName] = spVal;
                    }
                    val = subObj;
                  }
                } else if (propType === "int") {
                  val = parseInt(val, 10);
                } else if (propType === "float") {
                  val = parseFloat(val);
                } else if (propType === "bool") {
                  val = val === "true";
                }

                properties.push({ name, type: propType, propertytype, value: val });
              }
            }

            parsedTiles.push({
              id,
              type,
              image,
              imagewidth,
              imageheight,
              properties,
            });
          }

          if (parsedTiles.length > 0) {
            tileset.tiles = parsedTiles;
            if (tilesetEl.getAttribute("tilewidth")) {
              tileset.tilewidth = parseInt(tilesetEl.getAttribute("tilewidth") || "64", 10);
            }
            if (tilesetEl.getAttribute("tileheight")) {
              tileset.tileheight = parseInt(tilesetEl.getAttribute("tileheight") || "64", 10);
            }
          }
        }
      } catch (err) {
        console.warn(`Error parsing TSX tileset XML for ${source}:`, err);
      }
    }

    // Reliable fallback for StarWarsTileset if fetch was blocked or unavailable
    if (!tileset.tiles || tileset.tiles.length === 0) {
      tileset.tiles = [
        { id: 0, image: "basic_imperial_wall.jpg", type: "Tile", properties: [{ name: "tileType", value: "thickWall" }] },
        { id: 1, image: "fence.png", type: "Tile", properties: [{ name: "tileType", value: "thinWall" }] },
        { id: 2, image: "imperial_grilled_wall.jpg", type: "Tile", properties: [{ name: "tileType", value: "thickWall" }] },
        { id: 3, image: "metal_door.jpg", type: "Tile", properties: [{ name: "tileType", value: "door" }, { name: "open", value: "Up" }] },
        { id: 4, image: "inside_floor.jpg", type: "Tile", properties: [{ name: "tileType", value: "thinWall" }] },
        { id: 5, image: "floor.png", type: "Tile", properties: [{ name: "tileType", value: "floor" }] },
        { id: 6, image: "ceiling_3.jpg", type: "Tile", properties: [{ name: "tileType", value: "ceiling" }] },
        { id: 7, image: "ceiling_1.jpg", type: "Tile", properties: [{ name: "tileType", value: "ceiling" }] },
        { id: 8, image: "ceiling_2.jpg", type: "Tile", properties: [{ name: "tileType", value: "ceiling" }] },
        { id: 9, image: "e_11_item.png", type: "PickupItem", properties: [{ name: "amount", value: 20 }, { name: "object", value: { anchor: "floor", scale: 0.2 } }, { name: "type", value: "weapon" }, { name: "weaponType", value: "e_11" }] },
        { id: 10, image: "health.png", type: "PickupItem", properties: [{ name: "amount", value: 20 }, { name: "type", value: "health" }] },
        { id: 11, image: "storm_trooper.png", type: "Tile" },
        { id: 12, image: "table.png", type: "Object", properties: [{ name: "anchor", value: "floor" }] },
        { id: 13, image: "chair.png", type: "Object", properties: [{ name: "anchor", value: "floor" }] },
        { id: 14, image: "key_card_blue_1.png", type: "PickupItem", properties: [{ name: "object", value: { anchor: "center", scale: 0.4 } }, { name: "type", value: "blue_keycard" }] },
        { id: 15, image: "stairs.png", type: "Tile", properties: [{ name: "tileType", value: "stairs" }] },
        { id: 16, image: "power_cell.png", type: "Object", properties: [{ name: "anchor", value: "floor" }] },
        { id: 17, image: "thermal_detonator_belt.png", type: "PickupItem", properties: [{ name: "amount", value: 5 }, { name: "type", value: "ammo" }, { name: "weaponType", value: "thermal_detonator" }] },
        { id: 18, image: "thermal_detonator_pickup.png", type: "PickupItem", properties: [{ name: "amount", value: 1 }, { name: "type", value: "ammo" }, { name: "weaponType", value: "thermal_detonator" }] },
        { id: 19, image: "shield_unit.png", type: "PickupItem", properties: [{ name: "amount", value: 25 }, { name: "type", value: "shield" }] },
        { id: 20, image: "assets/raycast/textures/computer_panel_destroyed.jpg", type: "Tile", properties: [{ name: "tileType", value: "thickWall" }] },
        { id: 21, image: "assets/raycast/textures/computer_panel.jpg", type: "DestructableWall", properties: [{ name: "tileType", value: "thickWall" }] },
        { id: 22, image: "assets/raycast/enemies/viper_droid_default_1.png", type: "Tile" },
        { id: 23, image: "assets/raycast/enemies/implerial_officer.png", type: "Tile" },
        { id: 24, image: "assets/raycast/enemies/imperial_commando.png", type: "Tile" },
        { id: 25, image: "assets/raycast/textures/stairs_up.png", type: "Tile", properties: [{ name: "tileType", value: "stairs" }, { name: "stairType", value: "up" }] },
        { id: 26, image: "assets/raycast/textures/stairs_down.png", type: "Tile", properties: [{ name: "tileType", value: "stairs" }, { name: "stairType", value: "down" }] },
        { id: 27, image: "dh_17_item.png", type: "PickupItem", properties: [{ name: "amount", value: 20 }, { name: "object", value: { anchor: "floor", scale: 0.2 } }, { name: "type", value: "weapon" }, { name: "weaponType", value: "dh_17" }] },
        { id: 28, image: "assets/raycast/enemies/phase1_dark_trooper.png", type: "Tile" },
        { id: 29, image: "assets/raycast/enemies/diagona.png", type: "Tile" },
        { id: 30, image: "assets/raycast/enemies/diagona.png", type: "Tile" },
        { id: 31, image: "assets/raycast/textures/dirty_water.jpg", type: "Tile", properties: [{ name: "tileType", value: "floor" }, { name: "surface", value: "water" }] },
        { id: 32, image: "assets/raycast/decorations/isb_holotable.png", type: "Object", properties: [{ name: "anchor", value: "floor" }] },
        { id: 33, image: "assets/raycast/pickups/key_card_green.png", type: "PickupItem", properties: [{ name: "type", value: "green_keycard" }] },
        { id: 34, image: "assets/raycast/pickups/key_card_red.png", type: "PickupItem", properties: [{ name: "type", value: "red_keycard" }] },
        { id: 36, image: "assets/raycast/textures/grilled_wall.jpg", type: "DestructableWall", properties: [{ name: "tileType", value: "thickWall" }] },
        { id: 39, image: "assets/raycast/textures/grilled_wall_destroyed.jpg", type: "Tile", properties: [{ name: "tileType", value: "thickWall" }] },
        { id: 40, image: "assets/raycast/textures/lever_off.png", type: "Tile", properties: [{ name: "tileType", value: "thickWall" }] },
        { id: 41, image: "assets/raycast/textures/lever_on.jpg", type: "Tile", properties: [{ name: "tileType", value: "thickWall" }] },
        { id: 42, image: "assets/raycast/textures/piped_wall.png", type: "Tile", properties: [{ name: "tileType", value: "thickWall" }] },
        { id: 43, image: "assets/raycast/textures/computer_wall.png", type: "Tile", properties: [{ name: "tileType", value: "thickWall" }] },
        { id: 44, image: "assets/raycast/textures/electronic_wall.png", type: "Tile", properties: [{ name: "tileType", value: "thickWall" }] },
        { id: 45, image: "assets/raycast/textures/worn_piped_wall.jpg", type: "Tile", properties: [{ name: "tileType", value: "thickWall" }] },
        { id: 46, image: "assets/raycast/textures/worn_sewer_wall.jpg", type: "Tile", properties: [{ name: "tileType", value: "thickWall" }] },
        { id: 47, image: "assets/raycast/textures/worn_grilled_wall.jpg", type: "Tile", properties: [{ name: "tileType", value: "thickWall" }] },
        { id: 48, image: "assets/raycast/textures/sewer_wall.jpg", type: "Tile", properties: [{ name: "tileType", value: "thickWall" }] },
        { id: 49, image: "assets/raycast/textures/sewer_ceiling.jpg", type: "Tile", properties: [{ name: "tileType", value: "ceiling" }] },
        { id: 50, image: "assets/raycast/textures/sewer_door.jpg", type: "Tile", properties: [{ name: "tileType", value: "door" }, { name: "open", value: "Up" }] },
        { id: 51, image: "assets/raycast/textures/sewer_waterfall.png", type: "Tile", properties: [{ name: "align", value: "-" }, { name: "tileType", value: "thinWall" }] },
        { id: 52, image: "assets/raycast/textures/worn_stairs_up.jpg", type: "Tile", properties: [{ name: "tileType", value: "stairs" }, { name: "stairType", value: "up" }] },
        { id: 53, image: "assets/raycast/textures/worn_stairs_down.jpg", type: "Tile", properties: [{ name: "tileType", value: "stairs" }, { name: "stairType", value: "down" }] },
        { id: 54, image: "assets/raycast/enemies/prisoner.png", type: "Tile" },
        { id: 55, image: "assets/raycast/decorations/at_st.png", type: "Tile" },
        { id: 56, image: "assets/raycast/decorations/tie_fighter.png", type: "Tile" },
        { id: 57, image: "assets/raycast/decorations/tie_bomber.png", type: "Tile" },
      ];
    }
  }

  private handleExplosionDetonation(
    x: number,
    y: number,
    z: number,
    radius: number,
    damage: number
  ): void {
    // 1. Camera screen shake based on player proximity
    const dx = this.player.x - x;
    const dy = this.player.y - y;
    const distToPlayer = Math.sqrt(dx * dx + dy * dy);

    if (distToPlayer < 14) {
      const intensity = Math.max(2, (1 - distToPlayer / 14) * 12);
      this.triggerScreenShake(intensity, 0.35);
    }

    // 2. AOE damage to enemies in blast radius (blocked by door protectors / thin walls)
    this.enemyManager.applyAreaDamage(
      x,
      y,
      radius,
      damage,
      (enemy) => {
        this.hud.showToast(`[!] Neutralized ${enemy.config.name} (Explosion)`, 0x00ff88);
      },
      this.allThinWalls
    );

    // 3. AOE damage to breakable objects (blocked by door protectors / thin walls)
    if (this.breakableManager) {
      this.breakableManager.applyAreaDamage(
        x,
        y,
        radius,
        damage,
        (broken) => {
          this.handleBreakableDestroyed(broken, "Explosion");
        },
        this.allThinWalls
      );
    }

    // 4. Damage player if caught in the explosion (blocked by door protectors / thin walls)
    if (distToPlayer <= radius) {
      if (!this.enemyManager.isBlockedByDoorProtector(x, y, this.player.x, this.player.y, this.allThinWalls)) {
        const falloff = 1 - distToPlayer / radius;
        const playerDmg = Math.max(10, Math.round(damage * 0.6 * falloff));
        this.playerController.takeDamage(playerDmg);
        this.hud.showToast(`[-] Caught in Thermal Blast! (-${playerDmg} HP)`, 0xff3333);
        this.hud.flashScreen(0xff5500, 0.4);
      }
    }
  }

  public triggerScreenShake(intensity: number = 8, duration: number = 0.35): void {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
  }

  private handleBreakableDestroyed(broken: RaycastBreakable, context: string = ""): void {
    if (broken.isObjective && broken.objectiveKey) {
      this.missionManager?.completeObjective(broken.objectiveKey);
    }
    if (broken.isWallBlock) {
      this.handleWallBlockDestroyed(broken);
    } else {
      const toastText = context ? `[!] Smashed ${broken.name} (${context})` : `[!] Smashed ${broken.name}`;
      this.hud.showToast(toastText, 0xffaa00);
      if (this.destructableWallManager) {
        this.destructableWallManager.onBreakableDestroyed(broken);
      }
    }

    const linkIds = broken.linkIds;
    if (linkIds && linkIds.length > 0) {
      const action = broken.isEnabling ? "enable" : (broken.linkAction || "disable");
      this.applyLinkAction(linkIds, action);
      if (broken.wait && broken.wait.shouldWait && broken.wait.waitTimeInSeconds > 0) {
        setTimeout(() => {
          const revertAction = action === "disable" ? "enable" : "disable";
          this.applyLinkAction(linkIds, revertAction);
          this.updateLevelFinishZonesStatus();
        }, broken.wait.waitTimeInSeconds * 1000);
      }
    }
    this.updateLevelFinishZonesStatus();
  }

  /**
   * Scans every layer (tile data, infinite-map chunks, object gids, nested groups) and returns
   * the set of tile ids (gid - firstgid) used by the level. Always includes the default
   * destroyed-wall textures (20, 21) and any explicit destroyedTextureId properties.
   */
  private collectUsedTileIds(mapData: any): Set<number> {
    const used = new Set<number>([20, 21]);
    const fgid = mapData.tilesets?.[0]?.firstgid ?? 1;
    const addGid = (raw: number) => {
      const gid = raw & 0x1fffffff;
      if (gid > 0) used.add(gid - fgid);
    };
    const scanProps = (props: any) => {
      if (!Array.isArray(props)) return;
      for (const p of props) {
        if (p && typeof p.name === "string" && /textureid|texture_id/i.test(p.name) && typeof p.value === "number") {
          used.add(p.value);
        }
      }
    };
    const scan = (layers: any[]) => {
      if (!Array.isArray(layers)) return;
      for (const layer of layers) {
        if (!layer) continue;
        if (Array.isArray(layer.data)) layer.data.forEach(addGid);
        if (Array.isArray(layer.chunks)) {
          for (const chunk of layer.chunks) {
            if (Array.isArray(chunk?.data)) chunk.data.forEach(addGid);
          }
        }
        if (Array.isArray(layer.objects)) {
          for (const obj of layer.objects) {
            if (obj?.gid) addGid(obj.gid);
            scanProps(obj?.properties);
          }
        }
        scanProps(layer.properties);
        if (Array.isArray(layer.layers)) scan(layer.layers);
      }
    };
    scan(mapData.layers);

    // Breakable walls swap to a "<name>_destroyed" tile (or 39 for grilled walls): keep those too.
    const baseNames = new Set<string>();
    const tileImages: { id: number; img: string }[] = [];
    for (const ts of mapData.tilesets || []) {
      for (const t of ts?.tiles || []) {
        const img = ((t.image as string) || "").toLowerCase();
        tileImages.push({ id: t.id, img });
        if (used.has(t.id) && img) {
          baseNames.add((img.split(/[\\/]/).pop() || "").replace(/\.[^/.]+$/, ""));
        }
      }
    }
    for (const t of tileImages) {
      for (const base of baseNames) {
        if (base && t.img.includes(`${base}_destroyed`)) used.add(t.id);
      }
      if ((baseNames.has("lever_on") && t.img.includes("lever_off")) ||
          (baseNames.has("lever_off") && t.img.includes("lever_on"))) {
        used.add(t.id);
      }
    }
    used.add(39);
    return used;
  }

  /**
   * Collects tile IDs referenced outside of pure "floor" / "ceiling" layers
   * so floor/ceiling textures are only sliced into 1px columns when also used on walls/objects.
   */
  private collectWallSliceTileIds(mapData: any): Set<number> {
    const used = new Set<number>();
    const fgid = mapData.tilesets?.[0]?.firstgid ?? 1;
    const addGid = (raw: number) => {
      const gid = raw & 0x1fffffff;
      if (gid > 0) used.add(gid - fgid);
    };
    const scan = (layers: any[]) => {
      if (!Array.isArray(layers)) return;
      for (const layer of layers) {
        if (!layer) continue;
        const lname = (layer.name || "").trim().toLowerCase();
        if (lname === "floor" || lname === "ceiling") continue;
        if (Array.isArray(layer.data)) layer.data.forEach(addGid);
        if (Array.isArray(layer.chunks)) {
          for (const chunk of layer.chunks) {
            if (Array.isArray(chunk?.data)) chunk.data.forEach(addGid);
          }
        }
        if (Array.isArray(layer.objects)) {
          for (const obj of layer.objects) {
            if (obj?.gid) addGid(obj.gid);
          }
        }
        if (Array.isArray(layer.layers)) scan(layer.layers);
      }
    };
    scan(mapData.layers);
    return used;
  }

  private handleWallBlockDestroyed(broken: RaycastBreakable): void {
    const gx = broken.gridX !== undefined ? broken.gridX : Math.floor(broken.x);
    const gy = broken.gridY !== undefined ? broken.gridY : Math.floor(broken.y);
    const destroyedTileId = broken.destroyedTextureId !== undefined ? broken.destroyedTextureId : 20;
    const destroyedGid = destroyedTileId + this.firstgid;

    this.tileTypes[destroyedGid] = TileType.THICK_WALL;

    // 1. Swap texture in map and flat arrays so raycaster renders computer_panel_destroyed or grilled_wall_destroyed
    if (gy >= 0 && gy < this.mapHeight && gx >= 0 && gx < this.mapWidth) {
      this.map[gy][gx] = destroyedGid;
      const flatIdx = gy * this.mapWidth + gx;
      this.mapFlat[flatIdx] = destroyedGid;
      this.tileTypeFlags[flatIdx] = RaycastScene.TILE_WALL;
    }

    // 2. Determine facing normal towards the player to spawn explosions in front of the wall
    const wallCenterX = gx + 0.5;
    const wallCenterY = gy + 0.5;
    const dx = this.player.x - wallCenterX;
    const dy = this.player.y - wallCenterY;
    let normX = 0;
    let normY = 0;
    if (Math.abs(dx) > Math.abs(dy)) {
      normX = Math.sign(dx);
    } else {
      normY = Math.sign(dy);
    }

    // Position explosion sequence slightly off the front face of the block towards player
    const expX = wallCenterX + normX * 0.55;
    const expY = wallCenterY + normY * 0.55;
    const expZ = 0.5;

    if (this.detonatorManager) {
      this.detonatorManager.spawnExplosionSequence(
        expX,
        expY,
        expZ,
        defaultDestructibleWallConfig.explosion
      );
    }

    // 3. Screen shake & toast
    this.triggerScreenShake(8, 0.45);
    this.hud.showToast(`[!] Destroyed ${broken.name}!`, 0xff5533);

    // 4. Deactivate linked security barrier (door protector) if not enabling
    if (this.destructableWallManager) {
      this.destructableWallManager.onBreakableDestroyed(broken);
    }
  }

  private showLoadingOverlay(levelName: string): void {
    if (!this.loadingOverlay) {
      this.loadingOverlay = new RaycastLoadingOverlay();
      this.loadingOverlay.zIndex = 200; // Above HUD, minimap, mobile controls and debug menu
      this.addChild(this.loadingOverlay);
    }
    this.loadingOverlay.setLevelTitle(levelName);
    this.loadingOverlay.setProgress(0.05, "Reading sector blueprints...");
    this.loadingOverlay.visible = true;
    this.loadingOverlay.alpha = 1;
    this.isLevelLoading = true;
  }

  private hideLoadingOverlay(): void {
    if (!this.loadingOverlay) {
      this.isLevelLoading = false;
      return;
    }
    this.loadingOverlay.setProgress(1.0, "System ready");
    let fadeElapsed = 0;
    const fadeDuration = 0.25;
    const overlay = this.loadingOverlay;
    const onFade = (delta: number) => {
      fadeElapsed += delta / 60;
      overlay.alpha = Math.max(0, 1 - fadeElapsed / fadeDuration);
      if (overlay.alpha <= 0) {
        Ticker.shared.remove(onFade);
        overlay.visible = false;
        overlay.alpha = 0;
        this.isLevelLoading = false;
      }
    };
    Ticker.shared.add(onFade);
  }

  private async loadLevel(levelName: string) {
    this.showLoadingOverlay(levelName);
    // Yield a frame so Pixi renders the loading overlay immediately before blocking texture extraction/slicing
    await new Promise((resolve) => requestAnimationFrame(resolve));

    this.currentLevel = levelName;
    this.thinWalls = [];
    this.doorStates = {};
    this.doorEntries = [];
    this.doorSlideModes = {};
    this.lockedDoors = {};
    this.unlockedKeycardDoors.clear();
    this.disabledDoors.clear();
    this.clearTriggerSoundTimeouts();
    this.isBgMusicOverridden = false;
    this.stopBackgroundMusic();
    for (const [_, inst] of this.activePropSounds) {
      try { inst?.stop?.(); } catch {}
    }
    this.activePropSounds.clear();
    this.levelFinishZones = [];
    if (this.laserManager) this.laserManager.clear();
    if (this.detonatorManager) this.detonatorManager.clear();
    if (this.stationaryObjectManager) this.stationaryObjectManager.clear();
    if (this.allyManager) this.allyManager.clear();
    if (this.playerController) this.playerController.resetKeycards();
    if (this.minimap) this.minimap.resetDiscovery();
    this.stopAlertAudio();
    this.enemySpawnPoints = [];
    this.animatedWallFrames = {};
    this.animatedWallTextures = {};
    this.animatedWallTimer = 0;
    this.animatedWallFrameIndex = 0;
    this.mapObjectsById.clear();

    this.loadingOverlay?.setProgress(0.2, "Building sector geometry...");
    let mapData: any;
    try {
      mapData = await Assets.load(`assets/raycast/levels/${levelName}.json`);
    } catch {
      try {
        mapData = await Assets.load(`assets/${levelName}.json`);
      } catch {
        mapData = await Assets.load(`assets/raycast/levels/test_level.json`);
      }
    }
    this.currentMapData = mapData;

    if (mapData.tilesets) {
      for (const tileset of mapData.tilesets) {
        if (
          (!tileset.source && tileset.name === "StarWarsTileset") ||
          (tileset.source && tileset.tiles && tileset.tiles.length < 30)
        ) {
          tileset.source = tileset.source || "StarWarsTileset/StarWarsTileset.tsx";
          delete tileset.tiles;
        }
        if (!tileset.tiles && tileset.source) {
          await this.loadExternalTileset(tileset);
        }
      }
    }

    const textureMap: Record<number, string> = {};
    if (mapData.tilesets) {
      mapData.tilesets.forEach((tileset: any) => {
        if (tileset && tileset.tiles) {
          tileset.tiles.forEach((tile: any) => {
            const tileId = tile.id;
            const imagePath = tile.image;
            if (
              !imagePath ||
              imagePath.includes("player_spawn") ||
              imagePath.includes("enemy_spawn") ||
              imagePath.includes("key_card") ||
              imagePath.includes("keycard") ||
              imagePath.includes("viper_droid") ||
              imagePath.includes("pickups/") ||
              imagePath.includes("enemies/") ||
              imagePath.includes("isb_holotable") ||
              imagePath.includes("at_st") ||
              imagePath.includes("at_at") ||
              imagePath.includes("tie_fighter") ||
              imagePath.includes("tie_bomber") ||
              tile.type === "PickupItem" ||
              tile.type === "Enemy"
            ) {
              return;
            }
            textureMap[tileId] = imagePath;
          });
        }
      });
    }

    // Only load / upload / slice tiles actually referenced by this level's layers
    // (the tileset is shared across levels; unused 2048x2048 textures waste VRAM).
    const usedTileIds = this.collectUsedTileIds(mapData);
    if (usedTileIds.size > 0) {
      for (const key of Object.keys(textureMap)) {
        if (!usedTileIds.has(parseInt(key))) {
          delete textureMap[parseInt(key)];
        }
      }
    }

    this.loadingOverlay?.setProgress(0.4, "Loading texture banks...");
    const texturePromises = Object.entries(textureMap).map(
      ([tileId, fileName]) => {
        if (fileName.includes("sewer_waterfall")) {
          return Assets.load("assets/raycast/textures/sewer_waterfall.json")
            .then((sheet: any) => {
              if (sheet && sheet.textures) {
                const sortedKeys = Object.keys(sheet.textures).sort((a, b) => {
                  const numA = parseInt(a.match(/_(\d+)\.png$/)?.[1] || "0");
                  const numB = parseInt(b.match(/_(\d+)\.png$/)?.[1] || "0");
                  return numA - numB;
                });
                const allFrameSlices: Texture[][] = [];
                const allFrameTextures: Texture[] = [];
                for (const fKey of sortedKeys) {
                  const fTex: Texture = sheet.textures[fKey];
                  if (fTex.baseTexture) {
                    fTex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
                    fTex.baseTexture.mipmap = MIPMAP_MODES.OFF;
                    fTex.baseTexture.update();
                  }
                  allFrameTextures.push(fTex);
                  const slices: Texture[] = [];
                  const fRect = fTex.frame;
                  const realW = fTex.baseTexture.realWidth || 2034;
                  for (let x = 0; x < fRect.width; x++) {
                    const slice = new Texture(
                      fTex.baseTexture,
                      new Rectangle(fRect.x + x, fRect.y, 1, fRect.height)
                    );
                    if (slice.baseTexture) {
                      slice.baseTexture.scaleMode = SCALE_MODES.NEAREST;
                      slice.baseTexture.mipmap = MIPMAP_MODES.OFF;
                    }
                    slice.updateUvs();
                    const u = (fRect.x + x + 0.5) / realW;
                    slice._uvs.x0 = u;
                    slice._uvs.x1 = u;
                    slice._uvs.x2 = u;
                    slice._uvs.x3 = u;
                    slice._uvs.uvsFloat32[0] = u;
                    slice._uvs.uvsFloat32[2] = u;
                    slice._uvs.uvsFloat32[4] = u;
                    slice._uvs.uvsFloat32[6] = u;
                    slices.push(slice);
                  }
                  allFrameSlices.push(slices);
                }
                const tId = parseInt(tileId);
                this.animatedWallFrames[tId] = allFrameSlices;
                this.animatedWallTextures[tId] = allFrameTextures;
                this.textures[tId] = allFrameTextures[0];
                this.columnTextures[tId] = allFrameSlices[0];
              }
            })
            .catch((e) => {
              console.warn("Failed to load sewer_waterfall spritesheet:", e);
            });
        }

        const cleanFileName = fileName.split(/[\\/]/).pop() || "";
        const baseAlias = cleanFileName.replace(/\.[^/.]+$/, "");

        const applyTexture = (tex: any) => {
          if (!tex) return;
          let actualTexture: Texture | null = null;
          if (tex instanceof Texture) {
            actualTexture = tex;
          } else if (tex.textures && typeof tex.textures === "object") {
            const firstKey = Object.keys(tex.textures)[0];
            if (firstKey && tex.textures[firstKey] instanceof Texture) {
              actualTexture = tex.textures[firstKey];
            }
          }
          if (!actualTexture || !actualTexture.baseTexture) return;

          actualTexture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
          actualTexture.baseTexture.mipmap = MIPMAP_MODES.OFF;
          actualTexture.baseTexture.update();
          this.textures[parseInt(tileId)] = actualTexture;
        };

        const tryCached = (key: string): boolean => {
          if (Assets.cache.has(key)) {
            const cached = Assets.get(key);
            if (cached instanceof Texture) {
              applyTexture(cached);
              return true;
            }
          }
          return false;
        };

        if (
          tryCached(baseAlias) ||
          tryCached(fileName) ||
          tryCached(`./${fileName}`) ||
          tryCached(`assets/raycast/textures/${cleanFileName}`) ||
          tryCached(`./assets/raycast/textures/${cleanFileName}`)
        ) {
          return Promise.resolve();
        }

        const candidatePaths = [
          fileName,
          `./${fileName}`,
          `assets/raycast/textures/${cleanFileName}`,
          `./assets/raycast/textures/${cleanFileName}`,
          `assets/${cleanFileName}`,
          `./assets/${cleanFileName}`,
        ];

        const tryLoad = async () => {
          for (const path of candidatePaths) {
            try {
              const tex = await Assets.load(path);
              if (tex) {
                applyTexture(tex);
                return;
              }
            } catch {
              // try next candidate
            }
          }
          console.error(`Failed to load texture for tile ${tileId} (${fileName})`);
        };

        return tryLoad();
      }
    );
    await Promise.all(texturePromises);
    this.enforceNearestScaleMode();

    this.loadingOverlay?.setProgress(0.65, "Generating raycast slices & floor atlas...");
    const wallSliceTileIds = this.collectWallSliceTileIds(mapData);
    // Pre-slice 1px column textures with texel-centered UVs
    for (const [tileIdStr, texture] of Object.entries(this.textures)) {
      const tileId = parseInt(tileIdStr);
      if (this.animatedWallFrames[tileId]) {
        continue;
      }
      if (!texture || !(texture instanceof Texture) || !texture.baseTexture) {
        continue;
      }
      texture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      texture.baseTexture.mipmap = MIPMAP_MODES.OFF;
      texture.baseTexture.update();

      const imgPath = (textureMap[tileId] || "").toLowerCase();
      if ((imgPath.includes("ceiling") || imgPath.includes("dirty_water")) && !wallSliceTileIds.has(tileId)) {
        // Floor and ceiling textures are rendered exclusively by the GPU GLSL shader atlas
        // unless also placed on a wall/door/object layer.
        continue;
      }

      const baseW = texture.baseTexture.width || 64;
      const baseH = texture.baseTexture.height || 64;
      const frameX = texture.frame ? texture.frame.x : 0;
      const frameY = texture.frame ? texture.frame.y : 0;
      const texW = Math.min(texture.width || baseW, Math.max(0, baseW - frameX));
      const texH = Math.min(texture.height || baseH, Math.max(0, baseH - frameY));
      const realW = texture.baseTexture.realWidth || baseW;

      if (texW <= 0 || texH <= 0) continue;

      const slices: Texture[] = [];
      for (let x = 0; x < texW; x++) {
        const slice = new Texture(texture.baseTexture, new Rectangle(frameX + x, frameY, 1, texH));
        if (slice.baseTexture) {
          slice.baseTexture.scaleMode = SCALE_MODES.NEAREST;
          slice.baseTexture.mipmap = MIPMAP_MODES.OFF;
        }
        slice.updateUvs();
        const u = (frameX + x + 0.5) / realW;
        slice._uvs.x0 = u;
        slice._uvs.x1 = u;
        slice._uvs.x2 = u;
        slice._uvs.x3 = u;
        slice._uvs.uvsFloat32[0] = u;
        slice._uvs.uvsFloat32[2] = u;
        slice._uvs.uvsFloat32[4] = u;
        slice._uvs.uvsFloat32[6] = u;
        slices.push(slice);
      }
      this.columnTextures[tileId] = slices;
    }

    this.parseTiledMap(mapData);
    this.loadingOverlay?.setProgress(0.85, "Spawning entities & tactical systems...");
    await this.pickupManager.initTextures();
    await this.breakableManager.initTextures();
    this.firstgid = mapData.tilesets?.[0]?.firstgid ?? 1;
    const firstgid = this.firstgid;
    const offsetX = this.currentMapOffsetX;
    const offsetY = this.currentMapOffsetY;

    this.breakableManager.parseMapBreakables(
      mapData,
      this.tileMeta,
      this.tileTypes,
      firstgid,
      offsetX,
      offsetY
    );
    this.pickupManager.bindBreakables(this.breakableManager.getBreakables());
    this.destructableWallManager.parseMapDoorProtectors(mapData, firstgid, offsetX, offsetY);
    this.destructableWallManager.bindBreakables(
      this.breakableManager.getBreakables(),
      firstgid
    );
    this.updateLevelFinishZonesStatus();
    this.destructableWallManager.onWallDeactivated = (wall, playSound = true) => {
      this.hud.showToast(`[!] Security Barrier Deactivated!`, 0x00ffcc);
      if (wall.isObjective && wall.objectiveKey) {
        this.missionManager?.completeObjective(wall.objectiveKey);
      }
      if (playSound) {
        try {
          sound.play("door_1", { volume: 0.4 });
        } catch (e) {
          console.warn("Failed to play barrier deactivated sound:", e);
        }
      }
      this.updateLevelFinishZonesStatus(playSound);
    };
    await this.enemyManager.initSpritesheets();
    this.enemyManager.parseMapEnemies(mapData, firstgid, this.tileMeta, offsetX, offsetY);
    if (this.enemySpawnPoints.length > 0) {
      this.enemyManager.setEnemySpawnPoints(this.enemySpawnPoints);
    }
    this.enemyManager.setOnAlertCallback((alertedEnemy) => {
      this.triggerAlert();
    });
    this.enemyManager.setOnEnemyOpenDoorCallback((cellX, cellY, enemyX, enemyY) => {
      return this.checkAndInteractEnemyDoor(cellX, cellY, enemyX, enemyY);
    });
    this.enemyManager.setOnWaveStartCallback((wave, maxWaves, sp) => {
      const waveLabel = maxWaves && Number.isFinite(maxWaves) ? `(Wave ${wave}/${maxWaves})` : `(Wave ${wave})`;
      this.hud?.showToast(`[!] Imperial Reinforcements! ${waveLabel}`, 0xff9900, 3.0);
      this.hud?.flashScreen(0xff6600, 0.25);
      if (sound.exists("stormtrooper_there_he_is")) {
        try {
          sound.play("stormtrooper_there_he_is", { volume: 0.65 });
        } catch {}
      }
    });
    await this.stationaryObjectManager.initSpritesheets(mapData, this.tileMeta, firstgid);
    this.stationaryObjectManager.onObjectSpawned = (gx, gy) => {
      if (this.map && this.map[gy] && this.map[gy][gx] !== undefined) {
        this.map[gy][gx] = 0;
      }
      if (this.mapFlat && gy >= 0 && gy < this.mapHeight && gx >= 0 && gx < this.mapWidth) {
        this.mapFlat[gy * this.mapWidth + gx] = 0;
      }
    };
    this.stationaryObjectManager.parseMapObjects(mapData, this.tileMeta, firstgid, offsetX, offsetY);

    // Initialize friendly allies (e.g. rescued prisoner)
    await this.allyManager.initSpritesheet();
    this.allyManager.onAllySpawned = (gx, gy) => {
      if (this.map && this.map[gy] && this.map[gy][gx] !== undefined) {
        this.map[gy][gx] = 0;
      }
      if (this.mapFlat && gy >= 0 && gy < this.mapHeight && gx >= 0 && gx < this.mapWidth) {
        this.mapFlat[gy * this.mapWidth + gx] = 0;
      }
    };
    this.allyManager.parseMapAllies(mapData, this.tileMeta, firstgid, offsetX, offsetY);

    // Initialize thermal detonator manager textures & frames
    await this.detonatorManager.initTextures();
    await this.laserManager.initTextures();

    // Initialize mission triggers and objectives
    if (this.missionManager) {
      await this.missionManager.init(mapData, levelName, offsetX, offsetY);
      this.subtitles?.clear();
      await this.subtitleManager.load(levelName);
    }
    this.initControlledDoors();

    // Spawn initial thermal detonator pickups for quick player testing only on test_level
    if (levelName === "test_level") {
      this.pickupManager.spawnPickup(
        RaycastPickupType.THERMAL_DETONATOR_BELT,
        3.0,
        5.2,
        5
      );
      this.pickupManager.spawnPickup(
        RaycastPickupType.THERMAL_DETONATOR_SINGLE,
        3.8,
        5.2,
        1
      );
      this.pickupManager.spawnPickup(
        RaycastPickupType.SHIELD,
        4.6,
        5.2,
        50
      );
    }

    console.log("Parsed map:", this.map);
    console.log("Parsed floor map:", this.floorMap);
    console.log("Tile types:", this.tileTypes);
    console.log("Thin walls:", this.thinWalls);

    const px = Math.floor(this.player.x);
    const py = Math.floor(this.player.y);
    if (this.map[py]?.[px] !== 0) {
      console.warn(
        "Player spawned inside a wall! Finding new spawn position..."
      );
      for (let y = 0; y < this.mapHeight; y++) {
        for (let x = 0; x < this.mapWidth; x++) {
          if (this.map[y][x] === 0) {
            this.player.x = x + 0.5;
            this.player.y = y + 0.5;
            this.uPlayerPosUniform[0] = this.player.x;
            this.uPlayerPosUniform[1] = this.player.y;
            console.log(`Moved player to (${this.player.x}, ${this.player.y})`);
            break;
          }
        }
      }
    }

    // Restore saved player state (health, shield, weapons, ammo, keycards) if available for this run
    if (RaycastSaveManager.hasSave()) {
      const save = RaycastSaveManager.loadProgress();
      if (
        save &&
        (save.currentLevel === levelName ||
          save.nextLevel === levelName ||
          save.previousLevel === levelName ||
          (save.completedLevels && save.completedLevels.length > 0))
      ) {
        RaycastSaveManager.applySaveToPlayer(this.playerController);
      }
    }

    if (this.minimap) {
      this.minimap.updateDiscovery(this.player.x, this.player.y, this.player.dirX, this.player.dirY, true);
      this.minimap.refreshStaticMap();
    }

    // Apply 360 panoramic skybox if configured for this level
    await this.applyLevelSkybox(levelName, mapData);

    this.hideLoadingOverlay();
  }

  private parseTiledMap(mapData: any) {
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

    for (const l of allLayers) {
      if (l.objects && Array.isArray(l.objects)) {
        for (const obj of l.objects) {
          if (obj.id !== undefined) {
            obj._layerName = l.name;
            this.mapObjectsById.set(obj.id, obj);
          }
        }
      }
    }

    const bounds = calculateMapBounds(mapData, allLayers);
    this.mapWidth = bounds.mapWidth;
    this.mapHeight = bounds.mapHeight;
    const offsetX = bounds.offsetX;
    const offsetY = bounds.offsetY;
    this.currentMapOffsetX = offsetX;
    this.currentMapOffsetY = offsetY;

    this.map = Array(this.mapHeight)
      .fill(0)
      .map(() => Array(this.mapWidth).fill(0));
    this.floorMap = Array(this.mapHeight)
      .fill(0)
      .map(() => Array(this.mapWidth).fill(-1));
    this.ceilingMap = Array(this.mapHeight)
      .fill(0)
      .map(() => Array(this.mapWidth).fill(-1));

    this.firstgid = mapData.tilesets?.[0]?.firstgid ?? 1;
    const firstgid = this.firstgid;

    this.tileMeta = {};
    if (mapData.tilesets) {
      mapData.tilesets.forEach((tileset: any) => {
        const fgid = tileset.firstgid ?? firstgid;
        if (tileset && tileset.tiles) {
          tileset.tiles.forEach((tile: any) => {
            const gid = tile.id + fgid;
            const meta: TileMeta = {};
            if (tile.type) {
              meta.tileClass = tile.type;
              if (tile.type === "Tile") {
                // Class "Tile" defaults according to user's Tiled type schema
                meta.type = TileType.DOOR;
                meta.tileType = TileType.DOOR;
                meta.open = DoorOpen.UP;
                this.tileTypes[gid] = TileType.DOOR;
              } else if (tile.type === "DestructableWall") {
                meta.type = TileType.THICK_WALL;
                meta.tileType = TileType.THICK_WALL;
                this.tileTypes[gid] = TileType.THICK_WALL;
              }
            }
            if (tile.properties) {
              tile.properties.forEach((prop: any) => {
                const pName = prop.name.toLowerCase();
                const pVal = prop.value;
                if (pName === "type" || pName === "tiletype") {
                  const val = String(pVal).toLowerCase();
                  if (val === TileType.DOOR) meta.tileType = TileType.DOOR;
                  else if (val === TileType.THIN_WALL.toLowerCase()) meta.tileType = TileType.THIN_WALL;
                  else if (val === TileType.THICK_WALL.toLowerCase()) meta.tileType = TileType.THICK_WALL;
                  else if (val === TileType.CEILING) meta.tileType = TileType.CEILING;
                  else if (val === TileType.FLOOR) meta.tileType = TileType.FLOOR;
                  else if (val === TileType.STAIRS) meta.tileType = TileType.STAIRS;
                  this.tileTypes[gid] = meta.tileType || pVal;
                  meta.type = this.tileTypes[gid];
                }
                if (pName === "open" || pName === "doorslide" || pName === "slide" || pName === "slidemode") {
                  if (pVal === DoorOpen.LEFT) meta.open = DoorOpen.LEFT;
                  else if (pVal === DoorOpen.RIGHT) meta.open = DoorOpen.RIGHT;
                  else meta.open = DoorOpen.UP;
                }
                if (pName === "weapontype") {
                  meta.weaponType = String(pVal);
                }
                if (pName === "amount") {
                  meta.amount = typeof pVal === "number" ? pVal : parseInt(pVal, 10);
                }
                if (pName === "object" && typeof pVal === "object" && pVal !== null) {
                  if (pVal.scale !== undefined) meta.scale = parseFloat(pVal.scale);
                  if (pVal.anchor !== undefined) meta.anchor = String(pVal.anchor).toLowerCase();
                  if (pVal.scaleX !== undefined) meta.scaleX = parseFloat(pVal.scaleX);
                  if (pVal.scaleY !== undefined) meta.scaleY = parseFloat(pVal.scaleY);
                  if (pVal.vOffset !== undefined) meta.vOffset = parseFloat(pVal.vOffset);
                  if (pVal.z !== undefined) meta.z = parseFloat(pVal.z);
                }
                if (pName === "scale" || pName === "size") meta.scale = parseFloat(pVal);
                if (pName === "scalex" || pName === "sizex") meta.scaleX = parseFloat(pVal);
                if (pName === "scaley" || pName === "sizey") meta.scaleY = parseFloat(pVal);
                if (pName === "voffset" || pName === "yoffset" || pName === "offset" || pName === "heightoffset") {
                  meta.vOffset = parseFloat(pVal);
                }
                if (pName === "z" || pName === "elevation" || pName === "altitude" || pName === "height") {
                  meta.z = parseFloat(pVal);
                }
                if (pName === "anchor" || pName === "position" || pName === "align" || pName === "valign") {
                  meta.anchor = String(pVal).toLowerCase();
                }
                if (pName === "surface" || pName === "surfacetype") {
                  meta.surface = String(pVal).toLowerCase();
                }
              });
            }
            if (tile.imageheight) {
              meta.imageHeight = tile.imageheight;
              meta.imageWidth = tile.imagewidth;
            }
            const imgPath = tile.image || "";
            meta.image = imgPath.split(/[\\/]/).pop() || "";
            if (
              imgPath.toLowerCase().includes("computer_panel") ||
              imgPath.toLowerCase().includes("grilled_wall") ||
              imgPath.toLowerCase().includes("computer_wall") ||
              imgPath.toLowerCase().includes("electronic_wall") ||
              imgPath.toLowerCase().includes("piped_wall") ||
              imgPath.toLowerCase().includes("lever") ||
              imgPath.toLowerCase().includes("lever_off")
            ) {
              meta.type = TileType.THICK_WALL;
              meta.tileType = TileType.THICK_WALL;
              this.tileTypes[gid] = TileType.THICK_WALL;
            }
            if (imgPath.toLowerCase().includes("dirty_water") || imgPath.toLowerCase().includes("water")) {
              meta.surface = meta.surface || "water";
            }
            this.tileMeta[tile.id] = meta;
          });
        }
      });
    }

    const floorLayers = allLayers.filter(
      (layer: any) => layer.name && layer.name.toLowerCase() === "floor"
    );
    for (const floorLayer of floorLayers) {
      forEachTileInLayer(floorLayer, (rawGid: number, lx: number, ly: number) => {
        const x = lx + offsetX;
        const y = ly + offsetY;
        if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
          const gid = rawGid & 0x1FFFFFFF;
          if (gid !== 0) {
            this.floorMap[y][x] = gid - firstgid;
          } else if (this.floorMap[y][x] === undefined) {
            this.floorMap[y][x] = -1;
          }
        }
      });
    }

    const ceilingLayers = allLayers.filter(
      (layer: any) => layer.name && layer.name.toLowerCase() === "ceiling"
    );
    for (const ceilingLayer of ceilingLayers) {
      forEachTileInLayer(ceilingLayer, (rawGid: number, lx: number, ly: number) => {
        const x = lx + offsetX;
        const y = ly + offsetY;
        if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
          const gid = rawGid & 0x1FFFFFFF;
          if (gid !== 0) {
            this.ceilingMap[y][x] = gid - firstgid;
          } else if (this.ceilingMap[y][x] === undefined) {
            this.ceilingMap[y][x] = -1;
          }
        }
      });
    }

    const wallsLayers = allLayers.filter(
      (layer: any) =>
        layer.name &&
        (layer.name.toLowerCase() === "walls" || layer.name.toLowerCase() === "wall")
    );
    for (const wallsLayer of wallsLayers) {
      forEachTileInLayer(wallsLayer, (rawGid: number, lx: number, ly: number) => {
        const x = lx + offsetX;
        const y = ly + offsetY;
        if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
          const gid = rawGid & 0x1FFFFFFF;
          if (gid !== 0) {
            const tileId = gid - firstgid;
            const meta = this.tileMeta[tileId];
            if (meta?.image?.toLowerCase().includes("player_spawn") || tileId === 27) return;
            const imgLower = meta?.image?.toLowerCase() || "";
            if (
              imgLower.includes("at_st") ||
              imgLower.includes("atst") ||
              imgLower.includes("at_at") ||
              imgLower.includes("atat") ||
              imgLower.includes("tie_fighter") ||
              imgLower.includes("tie_bomber") ||
              imgLower.includes("prisoner") ||
              imgLower.includes("holotable")
            ) {
              return;
            }
            // Any sprite in the walls layer is strictly a wall, never registered as a door
            this.map[y][x] = gid;
          }
        }
      });
    }

    const destructableWallLayers = allLayers.filter(
      (layer: any) =>
        layer.name &&
        (layer.name.toLowerCase().includes("destructablewall") ||
          layer.name.toLowerCase().includes("destructiblewall") ||
          layer.name.toLowerCase().includes("destructable wall") ||
          layer.name.toLowerCase().includes("destructible wall")) &&
        !layer.name.toLowerCase().includes("door") &&
        !layer.name.toLowerCase().includes("protector") &&
        !layer.name.toLowerCase().includes("barrier")
    );
    for (const dwLayer of destructableWallLayers) {
      if (dwLayer.objects) {
        const tileW = mapData.tilewidth || 64;
        const tileH = mapData.tileheight || 64;
        dwLayer.objects.forEach((obj: any) => {
          const rawGid = obj.gid ?? 0;
          const gid = rawGid & 0x1FFFFFFF;
          if (gid !== 0) {
            const objW = obj.width || tileW;
            const objH = obj.height || tileH;
            const centerX = obj.x + objW * 0.5;
            const centerY = rawGid !== 0 ? obj.y - objH * 0.5 : obj.y + objH * 0.5;
            const gridX = Math.floor(centerX / tileW) + offsetX;
            const gridY = Math.floor(centerY / tileH) + offsetY;
            if (gridX >= 0 && gridX < this.mapWidth && gridY >= 0 && gridY < this.mapHeight) {
              this.map[gridY][gridX] = gid;
              this.tileTypes[gid] = TileType.THICK_WALL;
            }
          }
        });
      } else if (dwLayer.data || dwLayer.chunks) {
        forEachTileInLayer(dwLayer, (rawGid: number, lx: number, ly: number) => {
          const gid = rawGid & 0x1FFFFFFF;
          if (gid !== 0) {
            const x = lx + offsetX;
            const y = ly + offsetY;
            if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
              this.map[y][x] = gid;
              this.tileTypes[gid] = TileType.THICK_WALL;
            }
          }
        });
      }
    }

    const thinWallsLayers = allLayers.filter(
      (layer: any) => layer.name && layer.name.toLowerCase() === "thinwalls"
    );
    for (const thinWallsLayer of thinWallsLayers) {
      let layerAlign = "";
      if (thinWallsLayer.properties && Array.isArray(thinWallsLayer.properties)) {
        for (const p of thinWallsLayer.properties) {
          const pName = (p.name || "").toLowerCase();
          if (pName === "align" || pName === "alignment" || pName === "valign" || pName === "halign") {
            layerAlign = String(p.value || "").toLowerCase().trim();
          }
        }
      }

      const thinWallTiles: Array<{ x: number; y: number; tileId: number }> = [];
      forEachTileInLayer(thinWallsLayer, (rawGid: number, lx: number, ly: number) => {
        const gid = rawGid & 0x1FFFFFFF;
        if (gid !== 0) {
          thinWallTiles.push({ x: lx + offsetX, y: ly + offsetY, tileId: gid });
        }
      });

      thinWallTiles.forEach(({ x, y, tileId }) => {
        const tileType = this.tileTypes[tileId];
        const adjustedTileId = tileId - firstgid;
        if (tileType === "thinWall" || tileType === TileType.THIN_WALL) {
          const metaAlign = (this.tileMeta[adjustedTileId]?.anchor || "").toLowerCase().trim();
          const rawAlign = layerAlign || metaAlign;
          const alignStr = rawAlign === "-" || rawAlign === "" ? "center" : rawAlign;

          const hasTop = thinWallTiles.some(
            (t) =>
              t.x === x &&
              t.y === y - 1 &&
              (this.tileTypes[t.tileId] === "thinWall" || this.tileTypes[t.tileId] === TileType.THIN_WALL)
          );
          const hasBottom = thinWallTiles.some(
            (t) =>
              t.x === x &&
              t.y === y + 1 &&
              (this.tileTypes[t.tileId] === "thinWall" || this.tileTypes[t.tileId] === TileType.THIN_WALL)
          );
          const hasLeft = thinWallTiles.some(
            (t) =>
              t.x === x - 1 &&
              t.y === y &&
              (this.tileTypes[t.tileId] === "thinWall" || this.tileTypes[t.tileId] === TileType.THIN_WALL)
          );
          const hasRight = thinWallTiles.some(
            (t) =>
              t.x === x + 1 &&
              t.y === y &&
              (this.tileTypes[t.tileId] === "thinWall" || this.tileTypes[t.tileId] === TileType.THIN_WALL)
          );

          let orientation: "vertical" | "horizontal" = "vertical";
          if (alignStr === "top" || alignStr === "bottom" || alignStr === "north" || alignStr === "south") {
            orientation = "horizontal";
          } else if (alignStr === "left" || alignStr === "right" || alignStr === "west" || alignStr === "east") {
            orientation = "vertical";
          } else if ((hasLeft || hasRight) && !(hasTop || hasBottom)) {
            orientation = "horizontal";
          } else if ((hasTop || hasBottom) && !(hasLeft || hasRight)) {
            orientation = "vertical";
          } else if (hasLeft || hasRight) {
            orientation = "horizontal";
          } else {
            const wallLeft = x > 0 && (this.map[y]?.[x - 1] ?? 0) > 0;
            const wallRight = x < this.mapWidth - 1 && (this.map[y]?.[x + 1] ?? 0) > 0;
            const wallTop = y > 0 && (this.map[y - 1]?.[x] ?? 0) > 0;
            const wallBottom = y < this.mapHeight - 1 && (this.map[y + 1]?.[x] ?? 0) > 0;
            if ((wallLeft || wallRight) && !(wallTop || wallBottom)) {
              orientation = "horizontal";
            } else if ((wallTop || wallBottom) && !(wallLeft || wallRight)) {
              orientation = "vertical";
            }
          }

          if (orientation === "vertical") {
            const alignX =
              alignStr === "left" || alignStr === "west"
                ? 0.0
                : alignStr === "right" || alignStr === "east"
                ? 1.0
                : 0.5;
            this.thinWalls.push({
              x1: x + alignX,
              y1: y,
              x2: x + alignX,
              y2: y + 1,
              texture: adjustedTileId,
              orientation,
            });
          } else {
            const alignY =
              alignStr === "top" || alignStr === "north"
                ? 0.0
                : alignStr === "bottom" || alignStr === "south"
                ? 1.0
                : 0.5;
            this.thinWalls.push({
              x1: x,
              y1: y + alignY,
              x2: x + 1,
              y2: y + alignY,
              texture: adjustedTileId,
              orientation,
            });
          }
        }
      });
    }

    const doorsLayers = allLayers.filter(
      (layer: any) =>
        layer.name &&
        (layer.name.toLowerCase() === "doors" || layer.name.toLowerCase() === "door")
    );
    for (const doorsLayer of doorsLayers) {
      forEachTileInLayer(doorsLayer, (rawGid: number, lx: number, ly: number) => {
        const gid = rawGid & 0x1FFFFFFF;
        if (gid !== 0) {
          const x = lx + offsetX;
          const y = ly + offsetY;
          if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
            this.tileTypes[gid] = TileType.DOOR;
            this.map[y][x] = gid;
            this.doorStates[`${x},${y}`] = 0;
          }
        }
      });
    }

    // Door keys layer parsing (identifies doors requiring keycards)
    this.lockedDoors = {};
    this.unlockedKeycardDoors.clear();
    const keysLayers = allLayers.filter(
      (layer: any) => layer.name && layer.name.toLowerCase().includes("key")
    );
    for (const keysLayer of keysLayers) {
      forEachTileInLayer(keysLayer, (rawGid: number, lx: number, ly: number) => {
        const gid = rawGid & 0x1FFFFFFF;
        if (gid !== 0) {
          const x = lx + offsetX;
          const y = ly + offsetY;
          const adjustedTileId = gid - firstgid;
          const meta = this.tileMeta[adjustedTileId] || {};
          const typeStr = (meta.type || this.tileTypes[gid] || "").toLowerCase();
          const imgStr = (meta.image || "").toLowerCase();

          let reqKey = "blue";
          if (typeStr.includes("green") || imgStr.includes("green")) reqKey = "green";
          else if (typeStr.includes("red") || imgStr.includes("red")) reqKey = "red";
          else if (typeStr.includes("blue") || imgStr.includes("blue")) reqKey = "blue";

          this.lockedDoors[`${x},${y}`] = reqKey;
        }
      });
    }

    // Spawns layer parsing (player spawn location & rotation)
    const spawnLayers = allLayers.filter(
      (layer: any) => layer.name && layer.name.toLowerCase().includes("spawn")
    );
    for (const spawnLayer of spawnLayers) {
      if (spawnLayer.objects && Array.isArray(spawnLayer.objects)) {
        for (const obj of spawnLayer.objects) {
          const objName = (obj.name || "").toLowerCase();
          const objType = (obj.type || "").toLowerCase();
          if (
            objName.includes("enemy_spawn") ||
            objType.includes("enemy_spawn") ||
            (objName.includes("enemy") && objName.includes("spawn"))
          ) {
            const tileW = mapData.tilewidth || 64;
            const tileH = mapData.tileheight || 64;
            const spX = obj.x / tileW + offsetX + 0.5;
            const spY = obj.y / tileH + offsetY + 0.5;
            if (!this.enemySpawnPoints.some((p) => Math.hypot(p.x - spX, p.y - spY) < 0.1)) {
              this.enemySpawnPoints.push({ x: spX, y: spY });
            }
            continue;
          }
          if (objName.includes("enemy") || objType.includes("enemy")) continue;
          if (
            objName.includes("player") ||
            objType.includes("player") ||
            (!objName && !objType)
          ) {
            const tileW = mapData.tilewidth || 64;
            const tileH = mapData.tileheight || 64;
            this.player.x = obj.x / tileW + offsetX + 0.5;
            this.player.y = obj.y / tileH + offsetY + 0.5;
            if (obj.rotation !== undefined) {
              const rad = (obj.rotation * Math.PI) / 180;
              this.player.dirX = Math.cos(rad);
              this.player.dirY = Math.sin(rad);
              const fov = 0.8;
              this.player.planeX = -this.player.dirY * fov;
              this.player.planeY = this.player.dirX * fov;
            }
            this.uPlayerPosUniform[0] = this.player.x;
            this.uPlayerPosUniform[1] = this.player.y;
            this.uDirUniform[0] = this.player.dirX;
            this.uDirUniform[1] = this.player.dirY;
            this.uPlaneUniform[0] = this.player.planeX;
            this.uPlaneUniform[1] = this.player.planeY;
          }
        }
      }
      forEachTileInLayer(spawnLayer, (rawGid: number, lx: number, ly: number) => {
        if (rawGid !== 0) {
          const info = extractTiledGidAndRotation(rawGid);
          const tileId = info.gid - firstgid;
          const meta = this.tileMeta[tileId] || {};
          const imgStr = (meta.image || "").toLowerCase();
          const typeStr = (meta.type || this.tileTypes[info.gid] || meta.tileClass || "").toLowerCase();

          // Collect enemy spawn tiles
          if (
            tileId === 38 ||
            imgStr.includes("enemy_spawn") ||
            typeStr.includes("enemy_spawn") ||
            imgStr.includes("enemy") ||
            typeStr.includes("enemy")
          ) {
            const spX = lx + offsetX + 0.5;
            const spY = ly + offsetY + 0.5;
            if (!this.enemySpawnPoints.some((p) => Math.hypot(p.x - spX, p.y - spY) < 0.1)) {
              this.enemySpawnPoints.push({ x: spX, y: spY });
            }
            return;
          }

          // Only accept player spawn tile/definition
          const isPlayerSpawn =
            tileId === 27 ||
            imgStr.includes("player_spawn") ||
            imgStr.includes("player") ||
            typeStr.includes("player");

          if (!isPlayerSpawn) {
            return;
          }

          this.player.x = lx + offsetX + 0.5;
          this.player.y = ly + offsetY + 0.5;
          this.player.dirX = info.dirX;
          this.player.dirY = info.dirY;
          const fov = 0.8;
          this.player.planeX = -info.dirY * fov;
          this.player.planeY = info.dirX * fov;

          this.uPlayerPosUniform[0] = this.player.x;
          this.uPlayerPosUniform[1] = this.player.y;
          this.uDirUniform[0] = this.player.dirX;
          this.uDirUniform[1] = this.player.dirY;
          this.uPlaneUniform[0] = this.player.planeX;
          this.uPlaneUniform[1] = this.player.planeY;
        }
      });
    }

    if (this.enemySpawnPoints.length > 0) {
      this.enemyManager.setEnemySpawnPoints(this.enemySpawnPoints);
    }

    // LevelFinish layer parsing (level exit trigger zones)
    this.levelFinishZones = [];
    const finishLayers = allLayers.filter(
      (layer: any) => layer.name && layer.name.toLowerCase().includes("finish")
    );
    const tileW = mapData.tilewidth || 64;
    const tileH = mapData.tileheight || 64;
    for (const finishLayer of finishLayers) {
      if (finishLayer.objects && Array.isArray(finishLayer.objects)) {
        for (const obj of finishLayer.objects) {
          const objType = (obj.type || "").toLowerCase();
          const hasTriggerProps =
            obj.properties &&
            obj.properties.some((p: any) => {
              const pName = (p.name || "").toLowerCase();
              return (
                pName === "voicelinesontrigger" ||
                pName === "trigerevent" ||
                pName === "triggerevent" ||
                pName === "shouldbepressed" ||
                pName === "triggeralarm"
              );
            });
          if (objType === "triger" || objType === "trigger" || hasTriggerProps) {
            continue;
          }

          const objW = obj.width || tileW;
          const objH = obj.height || tileH;
          const x1 = obj.x / tileW + offsetX;
          const y1 = obj.y / tileH + offsetY;
          const x2 = (obj.x + objW) / tileW + offsetX;
          const y2 = (obj.y + objH) / tileH + offsetY;
          const targetLevel = obj.name || obj.type || "test_level";

          this.levelFinishZones.push({
            id: obj.id,
            x1: Math.min(x1, x2),
            y1: Math.min(y1, y2),
            x2: Math.max(x1, x2),
            y2: Math.max(y1, y2),
            targetLevel,
            enabled: true,
          });
        }
      }
    }

    // Objects and pickups layer parsing (handled via RaycastPickupManager)
    this.pickupManager.parseMapPickups(
      mapData,
      this.tileMeta,
      this.tileTypes,
      firstgid,
      offsetX,
      offsetY
    );
    this.mapObjects = this.pickupManager.getVisibleMapObjects();

    // Parse stairs and integrate them into the map collision & raycast grid
    if (this.stairsManager) {
      this.stairsManager.parseMapStairs(mapData, firstgid, this.tileMeta, offsetX, offsetY);
    }

    // --- Performance: Flatten jagged arrays into typed arrays ---
    const totalCells = this.mapHeight * this.mapWidth;
    this.mapFlat = new Int32Array(totalCells);
    this.floorMapFlat = new Int32Array(totalCells);
    this.ceilingMapFlat = new Int32Array(totalCells);
    this.doorStatesFlat = new Float64Array(totalCells);
    this.doorStatesFlat.fill(NaN);
    this.tileTypeFlags = new Uint8Array(totalCells);
    this.doorOrientationsFlat = new Uint8Array(totalCells);
    this.doorSlideModesFlat = new Uint8Array(totalCells);

    this.doorEntries = [];
    let maxTileId = 0;
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const idx = y * this.mapWidth + x;
        const wallTile = this.map[y][x];
        this.mapFlat[idx] = wallTile;
        this.floorMapFlat[idx] = this.floorMap[y][x];
        this.ceilingMapFlat[idx] = this.ceilingMap[y][x];

        // Convert string tile types to numeric flags: only actual doors in doorStates become TILE_DOOR.
        // Any sprite placed in the wall layer (not in doorStates) is strictly a TILE_WALL.
        const typeStr = this.tileTypes[wallTile];
        const doorKey = `${x},${y}`;
        const isDoor = doorKey in this.doorStates;

        if (isDoor) {
          this.tileTypeFlags[idx] = RaycastScene.TILE_DOOR;
          this.doorStatesFlat[idx] = this.doorStates[doorKey];
          this.doorEntries.push({ key: doorKey, flatIdx: idx, x, y });
        } else if (typeStr === "thinWall") {
          this.tileTypeFlags[idx] = RaycastScene.TILE_THIN;
        } else if (wallTile > 0) {
          this.tileTypeFlags[idx] = RaycastScene.TILE_WALL;
        }

        // Track max tile IDs for flat texture array
        const floorTile = this.floorMap[y][x];
        const ceilTile = this.ceilingMap[y][x];
        if (floorTile > maxTileId) maxTileId = floorTile;
        if (ceilTile > maxTileId) maxTileId = ceilTile;
        if (wallTile > 0 && wallTile - 1 > maxTileId) maxTileId = wallTile - 1;
      }
    }

    // Determine door orientations (NS vs EW) and slide modes
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const idx = y * this.mapWidth + x;
        if (this.tileTypeFlags[idx] === RaycastScene.TILE_DOOR) {
          const leftIsWall =
            x > 0 &&
            this.tileTypeFlags[y * this.mapWidth + (x - 1)] !==
              RaycastScene.TILE_EMPTY;
          const rightIsWall =
            x < this.mapWidth - 1 &&
            this.tileTypeFlags[y * this.mapWidth + (x + 1)] !==
              RaycastScene.TILE_EMPTY;
          const topIsWall =
            y > 0 &&
            this.tileTypeFlags[(y - 1) * this.mapWidth + x] !==
              RaycastScene.TILE_EMPTY;
          const botIsWall =
            y < this.mapHeight - 1 &&
            this.tileTypeFlags[(y + 1) * this.mapWidth + x] !==
              RaycastScene.TILE_EMPTY;

          let isNS = false;
          let isEW = false;

          if (topIsWall && botIsWall && !leftIsWall && !rightIsWall) {
            isNS = true; // Door flanked vertically -> door plane is at x + 0.5
          } else if (leftIsWall && rightIsWall && !topIsWall && !botIsWall) {
            isEW = true; // Door flanked horizontally -> door plane is at y + 0.5
          } else if (topIsWall || botIsWall) {
            isNS = true;
          } else {
            isEW = true;
          }

          this.doorOrientationsFlat[idx] = isNS ? 0 : 1;

          // Determine slide mode:
          // 1 = DoorOpen.UP (vertical up into ceiling)
          // 0 = DoorOpen.LEFT (horizontal slide left)
          // 3 = DoorOpen.RIGHT (horizontal slide right)
          // 2 = "down" (legacy vertical down into floor)
          const doorKey = `${x},${y}`;
          const tile = this.mapFlat[idx];
          const meta = this.tileMeta[tile - 1] || {};
          const explicitMode = this.doorSlideModes[doorKey];
          const mode: DoorOpen = explicitMode || meta.open || this.defaultDoorSlide;

          this.doorSlideModesFlat[idx] = this.getDoorSlideNumericMode(mode);
        }
      }
    }

    for (const obj of this.mapObjects) {
      if (obj.texture > maxTileId) maxTileId = obj.texture;
    }

    // Build GPU texture atlas and map texture for floor & ceiling GLSL shader
    this.buildFloorCeilingTextures();
  }

  private buildFloorCeilingTextures(): void {
    // 1. Collect all unique tile IDs used in floor and ceiling maps
    const uniqueTileIds: number[] = [];
    const tileToSlot = new Map<number, number>();
    for (let i = 0; i < this.floorMapFlat.length; i++) {
      const f = this.floorMapFlat[i];
      if (f >= 0 && !tileToSlot.has(f)) {
        tileToSlot.set(f, uniqueTileIds.length);
        uniqueTileIds.push(f);
      }
      const c = this.ceilingMapFlat[i];
      if (c >= 0 && !tileToSlot.has(c)) {
        tileToSlot.set(c, uniqueTileIds.length);
        uniqueTileIds.push(c);
      }
    }

    const numSlots = Math.max(1, uniqueTileIds.length);
    const cols = 4;
    const rows = Math.ceil(numSlots / cols);
    const tileSize = 256;

    // 2. Build texture atlas canvas
    const atlasCanvas = document.createElement("canvas");
    atlasCanvas.width = cols * tileSize;
    atlasCanvas.height = rows * tileSize;
    const atlasCtx = atlasCanvas.getContext("2d")!;
    atlasCtx.imageSmoothingEnabled = false;
    atlasCtx.fillStyle = "#333333";
    atlasCtx.fillRect(0, 0, atlasCanvas.width, atlasCanvas.height);

    for (let slot = 0; slot < uniqueTileIds.length; slot++) {
      const tileId = uniqueTileIds[slot];
      const col = slot % cols;
      const row = Math.floor(slot / cols);
      const tex = this.textures[tileId];

      if (tex) {
        const resource = (tex.baseTexture.resource as any);
        const source = resource?.source || resource;
        if (source) {
          try {
            atlasCtx.drawImage(
              source,
              col * tileSize,
              row * tileSize,
              tileSize,
              tileSize
            );
          } catch (e) {
            // ignore
          }
        }
      }
    }

    if (this.floorCeilingAtlasTexture && this.floorCeilingAtlasTexture !== Texture.WHITE) {
      this.floorCeilingAtlasTexture.destroy(true);
    }
    this.floorCeilingAtlasTexture = Texture.from(atlasCanvas);
    this.floorCeilingAtlasTexture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
    this.floorCeilingAtlasTexture.baseTexture.mipmap = MIPMAP_MODES.OFF;
    this.floorCeilingAtlasTexture.baseTexture.update();

    // 3. Build map lookup texture (R = floor slot + 1, G = ceiling slot + 1)
    const mapCanvas = document.createElement("canvas");
    mapCanvas.width = this.mapWidth;
    mapCanvas.height = this.mapHeight;
    const mapCtx = mapCanvas.getContext("2d")!;
    const mapImg = mapCtx.createImageData(this.mapWidth, this.mapHeight);
    const data = mapImg.data;

    let minCeilX = this.mapWidth;
    let minCeilY = this.mapHeight;
    let maxCeilX = -1;
    let maxCeilY = -1;

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const idx = y * this.mapWidth + x;
        const pxIdx = idx * 4;
        const floorTile = this.floorMapFlat[idx];
        const ceilTile = this.ceilingMapFlat[idx];

        if (floorTile >= 0 && tileToSlot.has(floorTile)) {
          data[pxIdx] = tileToSlot.get(floorTile)! + 1;
        } else {
          data[pxIdx] = 0;
        }

        if (ceilTile >= 0 && tileToSlot.has(ceilTile)) {
          data[pxIdx + 1] = tileToSlot.get(ceilTile)! + 1;
          if (x < minCeilX) minCeilX = x;
          if (y < minCeilY) minCeilY = y;
          if (x > maxCeilX) maxCeilX = x;
          if (y > maxCeilY) maxCeilY = y;
        } else {
          data[pxIdx + 1] = 0;
        }

        data[pxIdx + 2] = 0;
        data[pxIdx + 3] = 255;
      }
    }

    if (maxCeilX >= minCeilX) {
      this.uCeilingBoundsUniform[0] = minCeilX;
      this.uCeilingBoundsUniform[1] = minCeilY;
      this.uCeilingBoundsUniform[2] = maxCeilX + 1;
      this.uCeilingBoundsUniform[3] = maxCeilY + 1;
    } else {
      this.uCeilingBoundsUniform[0] = -1.0;
      this.uCeilingBoundsUniform[1] = -1.0;
      this.uCeilingBoundsUniform[2] = -1.0;
      this.uCeilingBoundsUniform[3] = -1.0;
    }

    mapCtx.putImageData(mapImg, 0, 0);

    if (this.floorCeilingMapTexture && this.floorCeilingMapTexture !== Texture.WHITE) {
      this.floorCeilingMapTexture.destroy(true);
    }
    this.floorCeilingMapTexture = Texture.from(mapCanvas);
    this.floorCeilingMapTexture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
    this.floorCeilingMapTexture.baseTexture.mipmap = MIPMAP_MODES.OFF;
    this.floorCeilingMapTexture.baseTexture.update();

    // 4. Update shader uniforms
    const uniforms = this.floorCeilingShader.uniforms;
    uniforms.uMapSize = [this.mapWidth, this.mapHeight];
    uniforms.uMapTexture = this.floorCeilingMapTexture;
    uniforms.uAtlas = this.floorCeilingAtlasTexture;
    uniforms.uAtlasGrid = [cols, rows];
    uniforms.uTileSize = tileSize;
    uniforms.uCeilingBounds = this.uCeilingBoundsUniform;
  }

  /**
   * Applies the skybox configuration for the current level.
   * Checks Tiled map properties first, then falls back to RAYCAST_LEVEL_CONFIGS.
   */
  private async applyLevelSkybox(levelName: string, mapData: any): Promise<void> {
    const skyConfig = getSkyboxConfig(levelName, mapData?.properties);
    if (skyConfig) {
      await this.setSkybox(skyConfig);
    } else {
      this.clearSkybox();
    }
  }

  /**
   * Stitches front and back panoramic images into a single 360-degree cylinder texture.
   */
  private async createStitchedSkyboxTexture(frontKey: string, backKey: string): Promise<Texture> {
    const [frontAsset, backAsset] = await Promise.all([
      Assets.load(frontKey),
      Assets.load(backKey),
    ]);

    const frontTex: Texture =
      frontAsset instanceof Texture
        ? frontAsset
        : frontAsset?.texture || frontAsset;
    const backTex: Texture =
      backAsset instanceof Texture ? backAsset : backAsset?.texture || backAsset;

    const fw = frontTex.baseTexture?.realWidth || frontTex.width || 2752;
    const fh = frontTex.baseTexture?.realHeight || frontTex.height || 1536;
    const bw = backTex.baseTexture?.realWidth || backTex.width || 2752;
    const bh = backTex.baseTexture?.realHeight || backTex.height || 1536;

    const totalW = fw + bw;
    const maxH = Math.max(fh, bh);

    const canvas = document.createElement("canvas");
    canvas.width = totalW;
    canvas.height = maxH;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const frontSrc =
        (frontTex.baseTexture?.resource as any)?.source ||
        frontTex.baseTexture?.resource;
      const backSrc =
        (backTex.baseTexture?.resource as any)?.source ||
        backTex.baseTexture?.resource;

      if (frontSrc) {
        ctx.drawImage(frontSrc, 0, 0, fw, fh);
      }
      if (backSrc) {
        ctx.drawImage(backSrc, fw, 0, bw, bh);
      }
    }

    const stitchedTexture = Texture.from(canvas);
    stitchedTexture.baseTexture.wrapMode = WRAP_MODES.REPEAT;
    stitchedTexture.baseTexture.scaleMode = SCALE_MODES.LINEAR;
    stitchedTexture.baseTexture.mipmap = MIPMAP_MODES.OFF;
    stitchedTexture.baseTexture.update();
    return stitchedTexture;
  }

  /**
   * Creates an empty 1x1 WebGL CubeMap texture for default shader uniform binding.
   */
  private createEmptyCubeMapTexture(): Texture {
    const cubeResource = new CubeResource(undefined, { width: 1, height: 1, autoLoad: false });
    for (let i = 0; i < 6; i++) {
      const buf = new BufferResource(new Uint8Array([255, 255, 255, 255]), { width: 1, height: 1 });
      cubeResource.addResourceAt(buf, i);
    }
    const baseTexture = new BaseTexture(cubeResource, {
      wrapMode: WRAP_MODES.CLAMP,
      scaleMode: SCALE_MODES.LINEAR,
      mipmap: MIPMAP_MODES.OFF,
    });
    return new Texture(baseTexture);
  }

  /**
   * Creates a WebGL CubeMap texture using Pixi's CubeResource from 6 face URLs/resources.
   * Expected OpenGL face order: [px, nx, py, ny, pz, nz]
   */
  public async createCubeMapTexture(facesOrDir: string | string[]): Promise<Texture> {
    let faceUrls: string[];
    if (Array.isArray(facesOrDir)) {
      if (facesOrDir.length !== 6) {
        throw new Error(`[RaycastScene] CubeMap requires 6 faces, got ${facesOrDir.length}`);
      }
      faceUrls = facesOrDir;
    } else {
      const dir = facesOrDir.replace(/[\\\/]$/, "");
      faceUrls = [
        `${dir}/px.png`,
        `${dir}/nx.png`,
        `${dir}/py.png`,
        `${dir}/ny.png`,
        `${dir}/pz.png`,
        `${dir}/nz.png`,
      ];
    }

    // Map face URLs to either pre-loaded HTMLImageElement from Assets.cache or the URL string
    const sources: any[] = faceUrls.map((url) => {
      const baseName = url.split("/").pop()?.replace(/\.\w+$/, "");
      const cacheKeys = [url, `./${url}`, `hanger_cube_${baseName}`, baseName];
      for (const k of cacheKeys) {
        if (k && Assets.cache.has(k)) {
          const cached = Assets.get(k);
          const img = (cached?.baseTexture?.resource as any)?.source;
          if (img) return img;
        }
      }
      return url;
    });

    const cubeResource = new CubeResource(sources as any, {
      width: 512,
      height: 512,
      autoLoad: true,
    } as any);
    await cubeResource.load();

    const baseTexture = new BaseTexture(cubeResource, {
      wrapMode: WRAP_MODES.CLAMP,
      scaleMode: SCALE_MODES.LINEAR,
      mipmap: MIPMAP_MODES.POW2,
    });

    const cubeTexture = new Texture(baseTexture);
    return cubeTexture;
  }

  /**
   * Sets or updates the skybox (CubeMap or panoramic) in the floor/ceiling shader.
   */
  public async setSkybox(config: RaycastSkyboxConfig | string | null): Promise<void> {
    if (!config) {
      this.clearSkybox();
      return;
    }

    const resolvedConfig: RaycastSkyboxConfig =
      typeof config === "string" ? { texture: config } : config;

    try {
      // 1. Check if a CubeMap is specified or implied
      const cubeMapTarget =
        resolvedConfig.cubeMap ||
        (resolvedConfig.texture && resolvedConfig.texture.toLowerCase().includes("cubemap")
          ? resolvedConfig.texture
          : undefined);

      if (cubeMapTarget) {
        const cubeTexture = await this.createCubeMapTexture(cubeMapTarget);
        if (this.currentSkyboxCubeTexture && this.currentSkyboxCubeTexture !== this.emptyCubeMapTexture) {
          try {
            this.currentSkyboxCubeTexture.destroy(true);
          } catch {}
        }
        this.currentSkyboxCubeTexture = cubeTexture;
        this.currentSkyboxTexture = null;

        const uniforms = this.skyboxShader.uniforms;
        uniforms.uSkyboxCube = cubeTexture;
        uniforms.uHasCubeMap = 1.0;
        uniforms.uHasSkybox = 0.0;
        this.currentSkyboxZoom = resolvedConfig.zoom ?? 1.10;
        this.currentSkyboxYaw = ((resolvedConfig.yaw ?? 270.0) % 360 + 360) % 360;
        uniforms.uSkyboxZoom = this.currentSkyboxZoom;
        const vFactor = (0.8 * 2.0) / (gameConfig.width / gameConfig.height);
        uniforms.uSkyboxVFactor = vFactor;
        const yawRad = this.currentSkyboxYaw * (Math.PI / 180.0);
        this.uSkyboxYawCS[0] = Math.cos(yawRad);
        this.uSkyboxYawCS[1] = Math.sin(yawRad);
        uniforms.uSkyboxYawCS = this.uSkyboxYawCS;
        this.setSkyboxActive(true, !!resolvedConfig.skyboxOnly);
        return;
      }

      if (this.currentSkyboxCubeTexture && this.currentSkyboxCubeTexture !== this.emptyCubeMapTexture) {
        try {
          this.currentSkyboxCubeTexture.destroy(true);
        } catch {}
      }
      this.currentSkyboxCubeTexture = null;

      // 2. Fall back to 2D equirectangular/cylindrical texture (or stitched front/back)
      let texture: Texture;

      if (resolvedConfig.front && resolvedConfig.back) {
        // If pre-stitched 360 texture is available in cache, prefer it for fast direct GPU binding
        if (resolvedConfig.texture && Assets.cache.has(resolvedConfig.texture)) {
          const raw = Assets.get(resolvedConfig.texture);
          texture = raw instanceof Texture ? raw : raw?.texture || raw;
        } else {
          texture = await this.createStitchedSkyboxTexture(
            resolvedConfig.front,
            resolvedConfig.back
          );
        }
      } else {
        const texKey = resolvedConfig.texture;
        if (!texKey) {
          this.clearSkybox();
          return;
        }
        const rawTex = Assets.cache.has(texKey) ? Assets.get(texKey) : await Assets.load(texKey);

        texture =
          rawTex instanceof Texture
            ? rawTex
            : rawTex?.texture instanceof Texture
            ? rawTex.texture
            : rawTex?.baseTexture
            ? rawTex
            : Texture.WHITE;
      }

      if (texture && texture.baseTexture) {
        texture.baseTexture.wrapMode = WRAP_MODES.REPEAT;
        texture.baseTexture.scaleMode = SCALE_MODES.LINEAR;
        texture.baseTexture.mipmap = MIPMAP_MODES.OFF;
        texture.baseTexture.update();
      }

      this.currentSkyboxTexture = texture;
      this.currentSkyboxCubeTexture = null;
      const imgW = texture.baseTexture?.realWidth || texture.width || 2880;
      const imgH = texture.baseTexture?.realHeight || texture.height || 1440;
      const hFov = 2.0 * Math.atan(0.8); // Camera horizontal FOV in radians (~1.3495 rad)

      // Zoom factor: > 1.0 zooms out to reveal high ceiling beams, crane, and broader vista
      const zoom = resolvedConfig.zoom ?? 3.5;
      const userRepeatX = (resolvedConfig.repeatX ?? 1.0) * zoom;
      const userRepeatY = (resolvedConfig.repeatY ?? 1.0) * zoom;

      // In a 360-degree cylinder, naturalRepeatY matches vertical pixel density
      // to horizontal pixel density (1:1 pixel aspect ratio, zero stretching):
      const naturalRepeatY =
        (hFov / (2.0 * Math.PI)) *
        (imgW / imgH) *
        (gameConfig.height / gameConfig.width);

      const finalRepeatX = userRepeatX;
      const finalRepeatY = userRepeatY * naturalRepeatY;

      // Automatically align centerU with North direction (normalized angle = 0.25):
      const centerU = resolvedConfig.centerU ?? 0.5;
      const baseOffsetX = centerU - 0.25 * finalRepeatX;
      let finalOffsetX = (baseOffsetX + (resolvedConfig.offsetX ?? 0.0)) % 1.0;
      if (finalOffsetX < 0) finalOffsetX += 1.0;
      const finalOffsetY = resolvedConfig.offsetY ?? 0.0;

      const uniforms = this.skyboxShader.uniforms;
      uniforms.uSkyboxTexture = texture;
      uniforms.uHasSkybox = 1.0;
      uniforms.uHasCubeMap = 0.0;
      uniforms.uSkyboxRepeat = [finalRepeatX, finalRepeatY];
      uniforms.uSkyboxOffset = [finalOffsetX, finalOffsetY];
      this.setSkyboxActive(true, !!resolvedConfig.skyboxOnly);
    } catch (err) {
      console.warn(`[RaycastScene] Failed to load skybox texture:`, err);
      this.clearSkybox();
    }
  }

  /**
   * Disables the active skybox, reverting to the default sky gradient.
   */
  public clearSkybox(): void {
    if (this.currentSkyboxCubeTexture && this.currentSkyboxCubeTexture !== this.emptyCubeMapTexture) {
      try {
        this.currentSkyboxCubeTexture.destroy(true);
      } catch {}
    }
    this.currentSkyboxTexture = null;
    this.currentSkyboxCubeTexture = null;
    if (this.skyboxShader && this.skyboxShader.uniforms) {
      const uniforms = this.skyboxShader.uniforms;
      uniforms.uHasSkybox = 0.0;
      uniforms.uHasCubeMap = 0.0;
      uniforms.uSkyboxTexture = Texture.WHITE;
      this.uSkyboxYawCS[0] = 1.0;
      this.uSkyboxYawCS[1] = 0.0;
      uniforms.uSkyboxYawCS = this.uSkyboxYawCS;
      if (this.emptyCubeMapTexture) {
        uniforms.uSkyboxCube = this.emptyCubeMapTexture;
      }
    }
    if (this.skyboxMesh && this.floorCeilingMesh) {
      this.setSkyboxActive(false, false);
    }
  }

  /**
   * Shows/hides the skybox and configures the floor/ceiling mesh accordingly:
   * - Skybox active: ceiling holes output alpha 0 (blend on) so the sky shows through.
   * - No skybox: floor/ceiling is a fully opaque pass (blend off).
   * The skybox quad covers only the top half unless skybox-only mode is on.
   */
  private setSkyboxActive(active: boolean, skyboxOnly: boolean): void {
    this.skyboxMesh.visible = active;
    this.floorCeilingMesh.visible = !(active && skyboxOnly) && !(active && this.isSkyboxOnlyActive);
    this.floorCeilingShader.uniforms.uSkyActive = active ? 1.0 : 0.0;
    this.floorCeilingMesh.state.blend = active;
    this.updateSkyboxGeometry(active && (skyboxOnly || this.isSkyboxOnlyActive));
  }

  private updateSkyboxGeometry(fullScreen: boolean): void {
    if (!this.skyboxGeom || this.skyboxFullScreen === fullScreen) return;
    this.skyboxFullScreen = fullScreen;
    const w = gameConfig.width;
    const h = gameConfig.height * (fullScreen ? 1.0 : 0.5);
    const v = fullScreen ? 1.0 : 0.5;
    this.skyboxGeom.getBuffer("aVertexPosition").update(new Float32Array([0, 0, w, 0, w, h, 0, h]));
    this.skyboxGeom.getBuffer("aTextureCoord").update(new Float32Array([0, 0, 1, 0, 1, v, 0, v]));
  }

  /**
   * Adjusts the skybox zoom (FOV scale factor). Higher zoom broadens the view, making objects look smaller / farther away.
   */
  public setSkyboxZoom(zoom: number): void {
    this.currentSkyboxZoom = Math.max(0.1, Math.min(10.0, Math.round(zoom * 100) / 100));
    if (this.skyboxShader?.uniforms) {
      this.skyboxShader.uniforms.uSkyboxZoom = this.currentSkyboxZoom;
    }
    console.log(`[RaycastScene] Skybox Zoom set to: ${this.currentSkyboxZoom.toFixed(2)}`);
    this.hud?.showToast(`Skybox Zoom: ${this.currentSkyboxZoom.toFixed(2)}x`, 0x00ffff, 1500);
  }

  /**
   * Adjusts the skybox yaw rotation in degrees (0..360).
   * 0 deg = North faces +Z (pz, open bay door)
   * 90 deg = North faces -X (nx, left wall)
   * 180 deg = North faces -Z (nz, blast door)
   * 270 deg = North faces +X (px, right wall)
   */
  public setSkyboxYaw(degrees: number): void {
    this.currentSkyboxYaw = ((degrees % 360) + 360) % 360;
    const yawRad = this.currentSkyboxYaw * (Math.PI / 180.0);
    this.uSkyboxYawCS[0] = Math.cos(yawRad);
    this.uSkyboxYawCS[1] = Math.sin(yawRad);
    if (this.skyboxShader?.uniforms) {
      this.skyboxShader.uniforms.uSkyboxYawCS = this.uSkyboxYawCS;
    }
    const wallLabel = this.getCubeMapWallNameForYaw(this.currentSkyboxYaw);
    console.log(`[RaycastScene] Skybox Yaw set to: ${this.currentSkyboxYaw.toFixed(1)}° (${wallLabel})`);
    this.hud?.showToast(`Skybox Yaw: ${this.currentSkyboxYaw.toFixed(0)}° (${wallLabel})`, 0x00ffff, 1500);
  }

  /**
   * Toggles skybox-only visualization mode (F8), hiding foreground floor & ceiling.
   */
  public toggleSkyboxOnly(forceState?: boolean): void {
    this.isSkyboxOnlyActive = forceState !== undefined ? forceState : !this.isSkyboxOnlyActive;
    if (this.floorCeilingMesh) {
      this.floorCeilingMesh.visible = !this.isSkyboxOnlyActive;
    }
    if (this.skyboxMesh) {
      this.updateSkyboxGeometry(this.skyboxMesh.visible && this.isSkyboxOnlyActive);
    }
    console.log(`[RaycastScene] Skybox-only mode: ${this.isSkyboxOnlyActive}`);
    this.hud?.showToast(`Skybox-Only: ${this.isSkyboxOnlyActive ? "ON" : "OFF"}`, 0x00ffff, 1500);
  }

  private getCubeMapWallNameForYaw(yaw: number): string {
    const snap = Math.round(yaw / 90) % 4;
    switch (snap) {
      case 0: return "Facing PZ: Jungle Vista";
      case 1: return "Facing NX: Control Room";
      case 2: return "Facing NZ: Blast Doors";
      case 3: return "Facing PX: Steel Wall";
      default: return "";
    }
  }

  public getSkyboxSettings(): { zoom: number; yaw: number; wall: string } {
    return {
      zoom: this.currentSkyboxZoom,
      yaw: this.currentSkyboxYaw,
      wall: this.getCubeMapWallNameForYaw(this.currentSkyboxYaw),
    };
  }

  /**
   * Cheat/debug: Instantly kills all active enemies within a given distance of the player.
   */
  public killNearbyEnemies(radius: number = 35.0): number {
    if (!this.enemyManager) return 0;
    const killed = this.enemyManager.killNearbyEnemies(
      this.player.x,
      this.player.y,
      radius
    );
    if (killed > 0) {
      this.hud?.showToast(`[💥] Eliminated ${killed} nearby enemies!`, 0xff4444, 2000);
      this.hud?.flashScreen(0xff2222, 0.25);
    } else {
      this.hud?.showToast("[!] No active enemies within radius", 0x88bbdd, 1500);
    }
    return killed;
  }

  public getDoorSlideNumericMode(mode: DoorOpen | undefined): number {
    if (mode === DoorOpen.LEFT) return 0;
    if (mode === DoorOpen.RIGHT) return 3;
    return 1; // DoorOpen.UP
  }

  public setDoorSlideMode(
    x: number,
    y: number,
    mode: DoorOpen
  ): void {
    const key = `${x},${y}`;
    this.doorSlideModes[key] = mode;
    if (this.doorSlideModesFlat && x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
      this.doorSlideModesFlat[y * this.mapWidth + x] = this.getDoorSlideNumericMode(mode);
    }
  }

  public setDefaultDoorSlideMode(mode: DoorOpen): void {
    this.defaultDoorSlide = mode;
    if (this.doorSlideModesFlat) {
      const modeVal = this.getDoorSlideNumericMode(mode);
      for (let y = 0; y < this.mapHeight; y++) {
        for (let x = 0; x < this.mapWidth; x++) {
          const idx = y * this.mapWidth + x;
          if (this.tileTypeFlags[idx] === RaycastScene.TILE_DOOR) {
            const doorKey = `${x},${y}`;
            if (!this.doorSlideModes[doorKey]) {
              this.doorSlideModesFlat[idx] = modeVal;
            }
          }
        }
      }
    }
  }

  public cycleDoorSlideMode(): DoorOpen {
    let nextMode: DoorOpen = DoorOpen.UP;
    if (this.defaultDoorSlide === DoorOpen.UP) {
      nextMode = DoorOpen.LEFT;
    } else if (this.defaultDoorSlide === DoorOpen.LEFT) {
      nextMode = DoorOpen.RIGHT;
    } else {
      nextMode = DoorOpen.UP;
    }

    this.setDefaultDoorSlideMode(nextMode);
    this.hud.showToast(`[!] Door Mode: ${nextMode.toUpperCase()}`, 0x00e5ff);
    return nextMode;
  }

  public playBackgroundMusic(): void {
    if (this.bgMusicInstance || this.isAlertActive || this.isBgMusicOverridden) return;
    try {
      if (!sound.exists("calm_loop")) {
        sound.add("calm_loop", { url: "./assets/sounds/calm_loop.mp3", preload: true });
      }
      this.currentBgMusicAlias = "calm_loop";
      const res = sound.play("calm_loop", {
        loop: true,
        volume: gameConfig.musicVolume ?? 0.35,
      });
      if (res && typeof (res as any).then === "function") {
        (res as any)
          .then((inst: any) => {
            this.bgMusicInstance = inst;
          })
          .catch(() => {});
      } else {
        this.bgMusicInstance = res;
      }
    } catch (e) {
      console.warn("Could not start background music calm_loop:", e);
    }
  }

  private stopBackgroundMusic(): void {
    if (this.bgMusicInstance) {
      try {
        this.bgMusicInstance.stop?.();
      } catch {}
      this.bgMusicInstance = null;
    }
    if (sound.exists("calm_loop")) {
      try {
        sound.stop("calm_loop");
      } catch {}
    }
    if (this.currentBgMusicAlias && this.currentBgMusicAlias !== "calm_loop") {
      try {
        if (sound.exists(this.currentBgMusicAlias)) {
          sound.stop(this.currentBgMusicAlias);
        }
      } catch {}
    }
    this.currentBgMusicAlias = null;
  }

  public triggerAlert(): void {
    if (this.isAlertActive) return;
    this.triggerAlertAudio();
    this.hud?.showToast("[!] BASE ALERT ACTIVATED! [!]", 0xff2222, 3.3);
    this.hud?.flashScreen(0xff0000, 0.35);
  }

  public triggerAlertAudio(): void {
    if (this.isAlertActive) return;
    this.isAlertActive = true;
    this.enemyManager?.setAlertActive(true, this.player?.x, this.player?.y);

    // Stop calm or overridden background music if running
    this.stopBackgroundMusic();

    // Play battle_theme on loop
    try {
      if (!sound.exists("battle_theme")) {
        try {
          sound.add("battle_theme", { url: "./assets/sounds/battle_theme.mp3", preload: true });
        } catch {
          sound.add("battle_theme", "./assets/sounds/battle_theme.mp3");
        }
      }
      const res = sound.play("battle_theme", {
        loop: true,
        volume: gameConfig.musicVolume ?? 0.45,
      });
      if (res && typeof (res as any).then === "function") {
        (res as any)
          .then((inst: any) => {
            this.battleMusicInstance = inst;
          })
          .catch(() => {});
      } else {
        this.battleMusicInstance = res;
      }
    } catch (e) {
      console.warn("Could not play battle_theme:", e);
    }

    // Play base_alarm on loop
    try {
      if (!sound.exists("base_alarm")) {
        try {
          sound.add("base_alarm", { url: "./assets/sounds/base_alarm.mp3", preload: true });
        } catch {
          sound.add("base_alarm", "./assets/sounds/base_alarm.mp3");
        }
      }
      const res = sound.play("base_alarm", {
        loop: true,
        volume: 0.35,
      });
      if (res && typeof (res as any).then === "function") {
        (res as any)
          .then((inst: any) => {
            this.baseAlarmInstance = inst;
          })
          .catch(() => {});
      } else {
        this.baseAlarmInstance = res;
      }
    } catch (e) {
      console.warn("Could not play base_alarm:", e);
    }
  }

  public stopAlertAudio(): void {
    if (this.battleMusicInstance) {
      try {
        this.battleMusicInstance.stop?.();
      } catch {}
      this.battleMusicInstance = null;
    }
    if (sound.exists("battle_theme")) {
      try {
        sound.stop("battle_theme");
      } catch {}
    }

    if (this.baseAlarmInstance) {
      try {
        this.baseAlarmInstance.stop?.();
      } catch {}
      this.baseAlarmInstance = null;
    }
    if (sound.exists("base_alarm")) {
      try {
        sound.stop("base_alarm");
      } catch {}
    }
    this.isAlertActive = false;
    this.enemyManager?.setAlertActive(false);
    this.playBackgroundMusic();
  }

  private checkAndInteractEnemyDoor(x: number, y: number, enemyX?: number, enemyY?: number): boolean {
    if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) return false;
    const flatIdx = y * this.mapWidth + x;
    if (this.tileTypeFlags[flatIdx] !== RaycastScene.TILE_DOOR) return false;

    const key = `${x},${y}`;
    if (this.disabledDoors.has(key)) return false; // Held open/disabled by mechanism
    if (this.lockedDoors[key]) return false; // Enemies can never open doors that need a keycard
    if (this.destructableWallManager) {
      const activeWallAtTile = this.destructableWallManager.getWalls().find(
        (w) => w.isActive() && w.gridX === x && w.gridY === y
      );
      if (activeWallAtTile) return false;
    }

    const currentState = this.doorStatesFlat[flatIdx];

    // If door is currently closing (currentState < 0), enemies cannot cancel or reopen it
    // UNLESS they are physically inside the doorway threshold (pinch protection)
    if (currentState < 0) {
      if (enemyX !== undefined && enemyY !== undefined) {
        const distToCenter = Math.hypot(enemyX - (x + 0.5), enemyY - (y + 0.5));
        // Pinch protection: if enemy is physically trapped inside the doorway threshold (< 0.65 tiles from center)
        if (distToCenter < 0.65) {
          const startOpen = Math.max(0.05, Math.abs(currentState));
          this.doorStates[key] = startOpen;
          this.doorStatesFlat[flatIdx] = startOpen;
          try {
            sound.play("door_1", { volume: 0.45 });
          } catch (e) {
            console.warn("Failed to play door_1 sound for enemy:", e);
          }
          return true;
        }
      }
      return false;
    }

    // If door is closed (currentState === 0)
    if (currentState === 0) {
      if (enemyX !== undefined && enemyY !== undefined) {
        const distToCenter = Math.hypot(enemyX - (x + 0.5), enemyY - (y + 0.5));
        // Only open if the enemy is directly in front of the door (dist <= 1.15)
        if (distToCenter > 1.15) {
          return false;
        }
      }
      const startOpen = 0.01;
      this.doorStates[key] = startOpen;
      this.doorStatesFlat[flatIdx] = startOpen;
      try {
        sound.play("door_1", { volume: 0.45 });
      } catch (e) {
        console.warn("Failed to play door_1 sound for enemy:", e);
      }
      return true;
    }

    return false;
  }

  private enforceNearestScaleMode(): void {
    try {
      const cache = (Assets.cache as any)?._cache;
      if (cache && typeof cache.forEach === "function") {
        cache.forEach((asset: any) => {
          if (asset?.mipmap !== undefined) {
            asset.scaleMode = SCALE_MODES.NEAREST;
            asset.mipmap = MIPMAP_MODES.OFF;
            asset.update?.();
          }
          if (asset?.baseTexture) {
            asset.baseTexture.scaleMode = SCALE_MODES.NEAREST;
            asset.baseTexture.mipmap = MIPMAP_MODES.OFF;
            asset.baseTexture.update();
          }
          if (asset?.textures) {
            for (const k in asset.textures) {
              const subTex = asset.textures[k];
              if (subTex?.baseTexture) {
                subTex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
                subTex.baseTexture.mipmap = MIPMAP_MODES.OFF;
                subTex.baseTexture.update();
              }
            }
          }
        });
      }
    } catch {}
  }

  private removeControls(): void {
    window.removeEventListener("keydown", this.keyDownHandler);
    window.removeEventListener("keyup", this.keyUpHandler);
    window.removeEventListener("mousemove", this.mouseMoveHandler);
    window.removeEventListener("mousedown", this.mouseDownHandler);
    window.removeEventListener("mouseup", this.mouseUpHandler);
    window.removeEventListener("contextmenu", this.contextMenuHandler);
    window.removeEventListener("blur", this.blurHandler);
    window.removeEventListener("wheel", this.wheelHandler);
    document.removeEventListener(
      "pointerlockchange",
      this.pointerLockChangeHandler
    );
    this.isLeftMouseDown = false;
    this.isRightMouseDown = false;
    for (const k in this.keys) {
      this.keys[k] = false;
    }
    if (this.playerController) {
      this.playerController.stopSprint();
    }
  }

  public dispose(): void {
    this.removeControls();
    try {
      if (document.exitPointerLock) {
        document.exitPointerLock();
      }
    } catch {}
    if (this.parent) {
      this.parent.removeChild(this);
    }
    Ticker.shared.remove(this.tick, this);
    this.clearTriggerSoundTimeouts();
    this.stopAlertAudio();
    this.isBgMusicOverridden = false;
    this.stopBackgroundMusic();
    for (const [_, inst] of this.activePropSounds) {
      try { inst?.stop?.(); } catch {}
    }
    this.activePropSounds.clear();
    this.disabledDoors.clear();
    try {
      this.clearSkybox();
    } catch {}
    try {
      if (this.emptyCubeMapTexture) {
        this.emptyCubeMapTexture.destroy(true);
      }
    } catch {}
    try {
      if (this.floorCeilingAtlasTexture && this.floorCeilingAtlasTexture !== Texture.WHITE) {
        this.floorCeilingAtlasTexture.destroy(true);
      }
    } catch {}
    try {
      if (this.floorCeilingMapTexture && this.floorCeilingMapTexture !== Texture.WHITE) {
        this.floorCeilingMapTexture.destroy(true);
      }
    } catch {}
    try {
      if (this.floorCeilingMesh) {
        this.floorCeilingMesh.destroy({ children: true });
      }
      this.wallBoundsTexture?.destroy(true);
    } catch {}
    try {
      if (this.inGameMenu) {
        this.inGameMenu.dispose();
      }
    } catch {}
    try {
      if (this.mobileControls) {
        this.mobileControls.dispose();
      }
    } catch {}
    try {
      if (this.weaponView) {
        this.weaponView.dispose();
      }
    } catch {}
    try {
      if (this.hud) {
        this.hud.dispose();
      }
    } catch {}
    try {
      if (this.minimap) {
        this.minimap.dispose();
      }
    } catch {}
    try {
      if (this.missionManager) {
        this.missionManager.destroy();
      }
    } catch {}
    try {
      if (this.subtitles) {
        const subtitles = this.subtitles;
        this.subtitles = undefined;
        subtitles.dispose();
      }
    } catch {}
    try {
      if (this.pickupManager) {
        this.pickupManager.dispose();
      }
    } catch {}
    try {
      if (this.breakableManager) {
        this.breakableManager.dispose();
      }
    } catch {}
    try {
      if (this.destructableWallManager) {
        this.destructableWallManager.dispose();
      }
    } catch {}
    try {
      if (this.enemyManager) {
        this.enemyManager.dispose();
      }
    } catch {}
    try {
      if (this.stationaryObjectManager) {
        this.stationaryObjectManager.dispose();
      }
    } catch {}
    try {
      if (this.allyManager) {
        this.allyManager.dispose();
      }
    } catch {}
    try {
      if (this.playerController) {
        this.playerController.dispose();
      }
    } catch {}
    try {
      if (this.stairsManager) {
        this.stairsManager.destroy();
      }
    } catch {}
    try {
      if (this.loadingOverlay) {
        this.loadingOverlay.dispose();
        this.loadingOverlay = undefined;
      }
    } catch {}
    try {
      if (this.detonatorManager) {
        this.detonatorManager.dispose();
      }
    } catch {}
    try {
      if (this.entityContainer && !(this.entityContainer as any).destroyed) {
        this.entityContainer.removeChildren();
        this.entityContainer.destroy({ children: true });
      }
    } catch {}
    try {
      if (this.worldContainer && !(this.worldContainer as any).destroyed) {
        this.worldContainer.removeChildren();
        this.worldContainer.destroy({ children: true });
      }
    } catch {}
    this.thinWallSpritePool = [];
    this.objectSpritePool = [];
    this.objectSpritePoolIndex = 0;
    try {
      for (const slices of Object.values(this.columnTextures)) {
        for (const tex of slices) {
          tex.destroy(false);
        }
      }
    } catch {}
    try {
      for (const arr of this.doorColumnTextures) {
        for (const t of arr) {
          t.destroy(false);
        }
      }
    } catch {}
    this.doorColumnTextures = [];
    try {
      for (const arr of this.thinWallColumnTextures) {
        for (const t of arr) {
          t.destroy(false);
        }
      }
    } catch {}
    this.thinWallColumnTextures = [];
    this.columnTextures = {};
    this.animatedWallFrames = {};
    this.animatedWallTextures = {};
    this.mapObjectsById.clear();
    try {
      this.removeChildren();
      this.destroy({ children: true });
    } catch {}
  }

  private isMobileDevice(): boolean {
    const ua = navigator.userAgent || "";
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const isCoarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    return isMobileUA || (hasTouch && isCoarsePointer);
  }

  private setupControls() {
    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);
    window.addEventListener("mousemove", this.mouseMoveHandler);
    window.addEventListener("mousedown", this.mouseDownHandler);
    window.addEventListener("mouseup", this.mouseUpHandler);
    window.addEventListener("contextmenu", this.contextMenuHandler);
    window.addEventListener("blur", this.blurHandler);
    window.addEventListener("wheel", this.wheelHandler, { passive: true });

    document.addEventListener(
      "pointerlockchange",
      this.pointerLockChangeHandler
    );

    this.hud.on("switchWeapon", () => {
      this.playerController.cycleWeapon(1);
    });

    this.weaponView.on("switchWeapon", () => {
      this.playerController.cycleWeapon(1);
    });
  }

  private wheelHandler = (e: WheelEvent) => {
    if (e.deltaY > 0) {
      this.playerController.cycleWeapon(1);
    } else if (e.deltaY < 0) {
      this.playerController.cycleWeapon(-1);
    }
  };

  private contextMenuHandler = (e: MouseEvent) => {
    e.preventDefault();
  };

  private blurHandler = () => {
    this.isLeftMouseDown = false;
    this.isRightMouseDown = false;
    for (const k in this.keys) {
      this.keys[k] = false;
    }
    if (!this.mobileControls && this.playerController) {
      this.playerController.stopSprint();
    }
  };

  private mouseUpHandler = (e: MouseEvent) => {
    if (e.button === 0) {
      this.isLeftMouseDown = false;
    } else if (e.button === 2) {
      this.isRightMouseDown = false;
    }
  };

  private mouseDownHandler = (e: MouseEvent) => {
    if (this.isPaused) {
      return;
    }
    if (e.button === 2) {
      e.preventDefault();
    }

    if (!this.bgMusicInstance && !this.isAlertActive) {
      this.playBackgroundMusic();
    }

    if (!this.isMobileDevice()) {
      // If pointer is not locked yet, request pointer lock on click on desktop (do not shoot on capture click)
      if (!document.pointerLockElement) {
        try {
          const p: any = (document.body as any).requestPointerLock?.();
          if (p && typeof p.catch === "function") {
            p.catch(() => {});
          }
        } catch (err) {}
        return;
      }

      if (e.button === 0) {
        this.isLeftMouseDown = true;
        this.tryShoot(false);
      } else if (e.button === 2) {
        this.isRightMouseDown = true;
        this.tryAltFire();
      }
    }
  };

  private tryAltFire(): void {
    // Auto-switch to E-11 if player owns it and isn't currently holding it
    if (
      this.playerController.equippedWeapon !== RaycastWeaponType.E11 &&
      this.playerController.weaponInventory.has(RaycastWeaponType.E11)
    ) {
      this.playerController.switchWeapon(RaycastWeaponType.E11);
    }

    if (this.playerController.equippedWeapon === RaycastWeaponType.E11) {
      this.tryShoot(true);
    } else {
      this.hud.showToast("[!] E-11 Blaster Rifle required for Auto-Fire", 0x88bbdd);
    }
  }

  private pointerLockChangeHandler = () => {
    if (!document.pointerLockElement) {
      this.isLeftMouseDown = false;
      this.isRightMouseDown = false;
    }
  };

  private tryShoot(isAutoFire: boolean = false): void {
    if (this.isPaused) return;
    if (this.debugMenu?.isVisibleOpen) return;
    if (this.stairsManager && this.stairsManager.isTransitioning()) return;
    const currentCfg = this.playerController.weaponConfig;
    if (!currentCfg) return;

    // 1. Throwable weapons (Thermal Detonator)
    if (currentCfg.isThrowable) {
      const started = this.playerController.tryShoot(() => {
        // Detonator projectile releases at peak toss of first-person throw animation
        this.detonatorManager.throwDetonator(
          this.player.x,
          this.player.y,
          0,
          this.player.dirX,
          this.player.dirY,
          {
            fuseTime: currentCfg.fuseTime ?? 2.0,
            throwSpeed: currentCfg.throwSpeed ?? 8.5,
            explosionRadius: currentCfg.explosionRadius ?? 3.5,
            damage: currentCfg.damage ?? 150,
            bounciness: currentCfg.bounciness ?? 0.28,
            wallBounciness: currentCfg.wallBounciness ?? 0.30,
            friction: currentCfg.friction ?? 0.80,
            maxBounces: currentCfg.maxBounces ?? 2,
          }
        );
      });

      if (started) {
        // Alert stormtroopers immediately when grenade throw begins
        this.enemyManager.onPlayerThrowGrenade(this.player.x, this.player.y);
      }
      return;
    }

    // 2. Blaster firearm (DH-17, E-11, etc.)
    const didShoot = this.playerController.tryShoot(undefined, isAutoFire);
    if (didShoot) {
      const damage = currentCfg.damage ?? 25;
      const { targetEnemy, breakableHit, effectiveWallDist } = this.getAimTarget();

      // Determine 3D target coordinates
      let targetX: number;
      let targetY: number;
      let targetZ: number = 0.5;

      if (targetEnemy) {
        targetX = targetEnemy.x;
        targetY = targetEnemy.y;
        targetZ = 0.5;
      } else if (breakableHit) {
        if (breakableHit.breakable.isWallBlock) {
          targetX = this.player.x + this.player.dirX * breakableHit.distance;
          targetY = this.player.y + this.player.dirY * breakableHit.distance;
          targetZ = 0.5;
        } else {
          targetX = breakableHit.breakable.x;
          targetY = breakableHit.breakable.y;
          targetZ = breakableHit.breakable.z ?? 0.5;
        }
      } else {
        targetX = this.player.x + this.player.dirX * effectiveWallDist;
        targetY = this.player.y + this.player.dirY * effectiveWallDist;
        targetZ = 0.5;
      }

      // Alert enemies around the shooter (gunshot noise), near the bullet path (near-miss), and near the impact
      this.enemyManager.onPlayerShoot(
        this.player.x,
        this.player.y,
        targetX,
        targetY
      );

      // Get precise weapon barrel muzzle screen position
      const muzzleScreenPos = this.weaponView.getMuzzlePosition();

      // Fire 3D laser bolt flying from the weapon muzzle towards the target
      this.laserManager.fireLaser(
        this.player.x,
        this.player.y,
        this.player.dirX,
        this.player.dirY,
        this.player.planeX,
        this.player.planeY,
        muzzleScreenPos,
        { x: targetX, y: targetY, z: targetZ },
        damage,
        targetEnemy,
        breakableHit?.breakable ?? null,
        (killedEnemy) => {
          this.hud.showToast(
            `[!] Neutralized ${killedEnemy.config.name} (+${currentCfg.name})`,
            0x00ff88
          );
        },
        (broken) => {
          this.handleBreakableDestroyed(broken);
        },
        this.allThinWalls
      );
    }
  }

  public getAimTarget(): {
    targetEnemy: RaycastEnemy | null;
    breakableHit: { breakable: RaycastBreakable; distance: number } | null;
    effectiveWallDist: number;
  } {
    const centerCol = Math.floor(gameConfig.width / 2);
    const wallDistance = this.zBuffer[centerCol] || this.MAX_RENDER_DISTANCE;

    // Find distance to obstacle (solid wall, door, or door protector) along aim vector
    const aimBarrierDist = this.enemyManager.findRayWallDistance(
      this.player.x,
      this.player.y,
      this.player.dirX,
      this.player.dirY,
      wallDistance,
      this.mapFlat,
      this.mapWidth,
      this.mapHeight,
      this.doorStatesFlat,
      this.allThinWalls
    );
    let effectiveWallDist = Math.min(wallDistance, aimBarrierDist);

    // Find closest stationary 8-directional object hit along aiming vector
    const stationaryHit = this.stationaryObjectManager?.findClosestHit(
      this.player.x,
      this.player.y,
      this.player.dirX,
      this.player.dirY,
      effectiveWallDist
    );
    if (stationaryHit && stationaryHit.distance < effectiveWallDist) {
      effectiveWallDist = stationaryHit.distance;
    }

    // Find closest breakable furniture or destructible wall hit along aiming vector
    let breakableHit = this.breakableManager.findClosestHit(
      this.player.x,
      this.player.y,
      this.player.dirX,
      this.player.dirY,
      effectiveWallDist
    );

    // Check if center screen ray directly struck an unbroken destructible wall block
    const centerHits = this.hitCounts[centerCol] || 0;
    const centerPool = this.hitPool[centerCol];
    for (let j = 0; j < centerHits; j++) {
      const ray = centerPool[j];
      const b = this.breakableManager.getBreakableAtGrid(ray.mapX, ray.mapY);
      if (b && !b.isBroken) {
        if (!breakableHit || ray.distance < breakableHit.distance) {
          breakableHit = { breakable: b, distance: ray.distance };
        }
        break;
      }
    }

    const maxTargetDist = breakableHit ? breakableHit.distance : effectiveWallDist;

    // Find closest enemy along aiming cone
    let targetEnemy: RaycastEnemy | null = null;
    let closestEnemyDist = maxTargetDist;
    const isAutoAim = SettingsManager.getInstance().getAutoAim();
    const hitRadius = isAutoAim ? 0.65 : 0.22;

    for (const enemy of this.enemyManager.activeEnemies) {
      if (enemy.isDead) continue;

      // Enemy must not be occluded by full-height wall columns
      if (enemy.animatedSprite && !enemy.animatedSprite.visible) continue;

      // Block targeting enemies through door protectors or thin wall barriers
      if (
        this.enemyManager.isBlockedByDoorProtector(
          this.player.x,
          this.player.y,
          enemy.x,
          enemy.y,
          this.allThinWalls
        )
      ) {
        continue;
      }

      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const t = dx * this.player.dirX + dy * this.player.dirY;

      if (t > 0.1 && t < closestEnemyDist) {
        const perpDist = Math.abs(dx * -this.player.dirY + dy * this.player.dirX);
        if (perpDist <= hitRadius) {
          closestEnemyDist = t;
          targetEnemy = enemy;
        }
      }
    }

    return { targetEnemy, breakableHit, effectiveWallDist };
  }

  private updateCrosshair(delta: number): void {
    if (!this.hud) return;

    if ((this.stairsManager && this.stairsManager.isTransitioning()) || this.isLevelTransitioning) {
      this.hud.updateCrosshairTarget(false, undefined, undefined, delta);
      return;
    }

    const { targetEnemy, breakableHit } = this.getAimTarget();

    if (targetEnemy) {
      const isAutoAim = SettingsManager.getInstance().getAutoAim();
      if (isAutoAim) {
        // Valid enemy that will take damage: turn red and snap crosshair to enemy screen position
        let snapX = targetEnemy.screenX;
        let snapY = targetEnemy.screenY;

        // Fallback projection if screen coordinates were not yet rendered or offscreen
        if (snapX <= 0 || snapY <= 0 || snapX > gameConfig.width) {
          const invDet = 1.0 / (this.player.planeX * this.player.dirY - this.player.dirX * this.player.planeY);
          const dx = targetEnemy.x - this.player.x;
          const dy = targetEnemy.y - this.player.y;
          const transformX = invDet * (this.player.dirY * dx - this.player.dirX * dy);
          const transformY = invDet * (-this.player.planeY * dx + this.player.planeX * dy);
          if (transformY > 0.1) {
            snapX = (gameConfig.width / 2) * (1 + transformX / transformY);
            snapY = gameConfig.height / 2;
          } else {
            snapX = gameConfig.width / 2;
            snapY = gameConfig.height / 2;
          }
        }

        this.hud.updateCrosshairTarget(true, snapX, snapY, delta);
      } else {
        // Manual aim: turn red to indicate target lock, but keep crosshair at center screen
        this.hud.updateCrosshairTarget(true, gameConfig.width / 2, gameConfig.height / 2, delta);
      }
    } else if (breakableHit && !breakableHit.breakable.isBroken) {
      // Valid breakable target that will break: turn red at default center position
      this.hud.updateCrosshairTarget(true, gameConfig.width / 2, gameConfig.height / 2, delta);
    } else {
      // Nothing to break or damage: return to default cyan at default center position
      this.hud.updateCrosshairTarget(false, undefined, undefined, delta);
    }
  }

  private isPlayerMoving(): boolean {
    const joyVector = this.mobileControls?.moveVector ?? RaycastScene.ZERO_VECTOR;
    return (
      this.keys.w ||
      this.keys.s ||
      this.keys.a ||
      this.keys.d ||
      Math.abs(joyVector.x) > 0.15 ||
      Math.abs(joyVector.y) > 0.15
    );
  }

  public getSurfaceTypeAt(x: number, y: number): "default" | "water" {
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    if (gridX < 0 || gridX >= this.mapWidth || gridY < 0 || gridY >= this.mapHeight) {
      return "default";
    }
    const idx = gridY * this.mapWidth + gridX;
    const floorTile = this.floorMapFlat ? this.floorMapFlat[idx] : (this.floorMap?.[gridY]?.[gridX] ?? -1);
    if (floorTile < 0) return "default";

    const meta = this.tileMeta[floorTile];
    if (meta) {
      if (meta.surface === "water" || meta.surface === "dirty_water") {
        return "water";
      }
      if (meta.image && (meta.image.toLowerCase().includes("water") || meta.image.toLowerCase().includes("dirty_water"))) {
        return "water";
      }
    }
    return "default";
  }

  private keyDownHandler = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (key === "escape") {
      if (this.inGameMenu?.visible) {
        this.resumeGame();
      } else if (this.debugMenu?.isVisibleOpen) {
        this.debugMenu.hide();
      } else if (this.missionManager?.isObjectivesOpen) {
        this.missionManager.hideObjectives();
      } else if (this.minimap?.isOpen) {
        this.minimap.hide();
      } else {
        this.pauseGame();
      }
      return;
    }
    if (this.isPaused) {
      return;
    }
    if (!this.bgMusicInstance) {
      this.playBackgroundMusic();
    }
    if (key in this.keys) {
      this.keys[key] = true;
      // If Shift is already held when starting to move on desktop, immediately sprint
      if (!this.mobileControls && (this.keys.shift || e.shiftKey)) {
        this.playerController.setSprinting(true);
      }
    }
    // Desktop hold-to-sprint: immediately sprint when Shift is pressed while moving
    if (e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") {
      this.keys.shift = true;
      if (!this.mobileControls && this.isPlayerMoving()) {
        this.playerController.setSprinting(true);
      }
    }
    if (key === "e") {
      this.tryOpenDoor();
    }
    if (e.code === "Space") {
      this.tryShoot();
    }
    // Weapon switching shortcuts (1: DH-17, 2: E-11, 3: Thermal Detonator)
    if (e.key === "1" || e.code === "Digit1") {
      this.playerController.switchWeapon(RaycastWeaponType.DH17);
    }
    if (e.key === "2" || e.code === "Digit2") {
      this.playerController.switchWeapon(RaycastWeaponType.E11);
    }
    if (e.key === "3" || e.code === "Digit3") {
      this.playerController.switchWeapon(RaycastWeaponType.THERMAL_DETONATOR);
    }
    if (key === "q") {
      this.playerController.cycleWeapon(-1);
    }
    // Toggle/Cycle Door Slide Mode (V: Up -> Down -> Sideways)
    if (key === "v") {
      this.cycleDoorSlideMode();
    }
    // Toggle Minimap (M) / Close on ESC
    if (key === "m") {
      this.minimap?.toggle();
    }
    // Toggle Skybox Only mode for testing skybox vista (F8)
    if (e.key === "F8" || key === "f8") {
      this.toggleSkyboxOnly();
    }
    // Skybox Zoom Adjustments ([ / - zooms in / enlarges, ] / = zooms out / widens)
    if (key === "[" || key === "-") {
      this.setSkyboxZoom(this.currentSkyboxZoom - 0.1);
    }
    if (key === "]" || key === "=" || key === "+") {
      this.setSkyboxZoom(this.currentSkyboxZoom + 0.1);
    }
    // Skybox Yaw Rotation Adjustments (, / < rotates left, . / > rotates right)
    if (key === "," || key === "<") {
      const delta = e.shiftKey ? -15 : -2;
      this.setSkyboxYaw(this.currentSkyboxYaw + delta);
    }
    if (key === "." || key === ">") {
      const delta = e.shiftKey ? 15 : 2;
      this.setSkyboxYaw(this.currentSkyboxYaw + delta);
    }
    // Snap / cycle to next 90-degree Skybox wall (Y)
    if (key === "y" && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const nextSnap = (Math.round((this.currentSkyboxYaw + 45) / 90) * 90) % 360;
      const targetYaw = nextSnap === Math.round(this.currentSkyboxYaw) ? (nextSnap + 90) % 360 : nextSnap;
      this.setSkyboxYaw(targetYaw);
    }
    // Toggle Objectives Datapad (Tab) / Close on ESC
    if (e.key === "Tab" || e.code === "Tab") {
      e.preventDefault();
      this.missionManager?.toggleObjectives();
    }
    // Toggle In-Game Debug Datapad (` or ~ or F2)
    if (key === "`" || key === "~" || e.key === "F2") {
      this.debugMenu?.toggle();
    }
  };

  private keyUpHandler = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (key in this.keys) this.keys[key] = false;

    // Desktop hold-to-sprint: immediately stop sprinting when Shift is released
    if (e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight" || !e.shiftKey) {
      if (e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") {
        this.keys.shift = false;
      }
      if (!this.mobileControls && (!this.keys.shift || !e.shiftKey)) {
        this.keys.shift = false;
        this.playerController.setSprinting(false);
      }
    }
  };

  private rotatePlayer(angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const oldDirX = this.player.dirX;
    this.player.dirX = this.player.dirX * cos - this.player.dirY * sin;
    this.player.dirY = oldDirX * sin + this.player.dirY * cos;

    const oldPlaneX = this.player.planeX;
    this.player.planeX = this.player.planeX * cos - this.player.planeY * sin;
    this.player.planeY = oldPlaneX * sin + this.player.planeY * cos;
  }

  public togglePause(): void {
    if (this.isPaused) {
      this.resumeGame();
    } else {
      this.pauseGame();
    }
  }

  public pauseGame(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    for (const k in this.keys) {
      this.keys[k] = false;
    }
    this.isLeftMouseDown = false;
    this.isRightMouseDown = false;
    if (this.playerController) {
      this.playerController.stopSprint();
    }
    try {
      if (document.exitPointerLock) {
        document.exitPointerLock();
      }
    } catch {}
    if (this.inGameMenu) {
      this.inGameMenu.refreshDisplay();
      this.inGameMenu.visible = true;
    }
  }

  public resumeGame(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    if (this.inGameMenu) {
      this.inGameMenu.visible = false;
    }
    if (!this.isMobileDevice()) {
      try {
        const p: any = (document.body as any).requestPointerLock?.();
        if (p && typeof p.catch === "function") {
          p.catch(() => {});
        }
      } catch {}
    }
  }

  public quitToMainMenu(): void {
    if (this.inGameMenu) {
      this.inGameMenu.visible = false;
    }
    this.isPaused = false;
    this.emit(Scene.Change, Scene.MainMenu);
  }

  private mouseMoveHandler = (e: MouseEvent) => {
    if (this.isPaused || this.isLevelLoading) return;
    if (document.pointerLockElement !== document.body) return;
    const angle = e.movementX * this.mouseSensitivity;
    this.rotatePlayer(angle);
  };

  private tick(delta: number) {
    if (this.isPaused || this.isLevelLoading) {
      return;
    }
    // Screen shake update (only shakes the 3D world, keeping HUD and overlays steady)
    if (this.shakeDuration > 0) {
      this.shakeDuration -= delta / 60;
      const offsetX = (Math.random() * 2 - 1) * this.shakeIntensity;
      const offsetY = (Math.random() * 2 - 1) * this.shakeIntensity;
      this.worldContainer.position.set(offsetX, offsetY);
      this.shakeIntensity = Math.max(0, this.shakeIntensity - 15 * (delta / 60));
    } else if (this.worldContainer.x !== 0 || this.worldContainer.y !== 0) {
      this.worldContainer.position.set(0, 0);
    }

    this.updatePlayer(delta);
    this.updateDoors(delta);
    if (Object.keys(this.animatedWallFrames).length > 0) {
      this.animatedWallTimer += delta / 60;
      if (this.animatedWallTimer >= 0.1) {
        this.animatedWallTimer = 0;
        this.animatedWallFrameIndex++;
        for (const [tIdStr, frames] of Object.entries(this.animatedWallFrames)) {
          const tId = parseInt(tIdStr);
          const fIdx = this.animatedWallFrameIndex % frames.length;
          this.columnTextures[tId] = frames[fIdx];
          if (this.animatedWallTextures[tId]) {
            this.textures[tId] = this.animatedWallTextures[tId][fIdx];
          }
        }
      }
    }
    if (this.stairsManager) {
      this.stairsManager.update(delta);
    }
    this.pickupManager.update(delta);
    if (this.minimap) {
      this.minimap.updateDiscovery(this.player.x, this.player.y, this.player.dirX, this.player.dirY);
      if (this.minimap.isOpen) {
        this.minimap.update(delta);
      }
    }
    if (this.missionManager) {
      this.missionManager.update(this.player.x, this.player.y);
    }

    // Build allThinWalls into reusable array without concat allocations
    this.allThinWalls.length = 0;
    for (let i = 0; i < this.thinWalls.length; i++) {
      this.allThinWalls.push(this.thinWalls[i]);
    }
    if (this.destructableWallManager) {
      const destWalls = this.destructableWallManager.getThinWalls();
      for (let i = 0; i < destWalls.length; i++) {
        this.allThinWalls.push(destWalls[i]);
      }
    }
    const allThinWalls = this.allThinWalls;

    // Update detonators in-flight physics, bouncing, timer, and active explosions
    if (this.detonatorManager) {
      this.detonatorManager.update(
        delta,
        this.mapFlat,
        this.mapWidth,
        this.mapHeight,
        this.doorStatesFlat,
        allThinWalls
      );
    }

    // Update active laser projectiles, flight, and collisions
    if (this.laserManager) {
      this.laserManager.update(
        delta,
        this.enemyManager.activeEnemies,
        this.breakableManager,
        this.player,
        (dmg) => {
          this.playerController.takeDamage(dmg);
          this.triggerScreenShake(5, 0.22);
          this.hud.showToast(`[-] Hit by Blaster Fire! (-${dmg} HP)`, 0xff4444);
        },
        allThinWalls,
        this.stationaryObjectManager
      );
    }

    // Update enemy AI, navigation, line of sight, and shooting
    this.enemyManager.update(
      delta,
      this.player.x,
      this.player.y,
      this.mapFlat,
      this.mapWidth,
      this.mapHeight,
      this.doorStatesFlat,
      allThinWalls,
      this.playerController,
      this.pickupManager,
      this.laserManager,
      this.player.dirX,
      this.player.dirY,
      this.detonatorManager?.activeDetonators,
      this.lockedDoors,
      this.tileTypeFlags
    );

    // Update friendly allies (e.g. rescued prisoner following Tuk)
    if (this.allyManager) {
      this.allyManager.update(
        delta,
        this.player.x,
        this.player.y,
        this.mapFlat,
        this.mapWidth,
        this.mapHeight,
        this.doorStatesFlat,
        this.tileTypeFlags,
        allThinWalls
      );
    }

    // Check for item pickups
    const collected = this.pickupManager.checkPlayerPickups(
      this.player.x,
      this.player.y
    );
    if (collected.length > 0) {
      this.playerController.handlePickups(collected);
    }

    // Determine movement for weapon bobbing
    const isMoving = this.isPlayerMoving();

    // Automatic continuous firing while right mouse button or mobile alt-fire is pressed with the E-11 Blaster
    if (
      (this.isRightMouseDown || this.mobileControls?.isAltFirePressed) &&
      this.playerController.equippedWeapon === RaycastWeaponType.E11
    ) {
      this.tryShoot(true);
    }

    const surfaceType = this.getSurfaceTypeAt(this.player.x, this.player.y);
    this.playerController.update(delta, isMoving, 1, this.lastFrameDistMoved, surfaceType);

    this.updateInteractionPrompt();

    this.renderScene();

    this.updateCrosshair(delta);
  }

  private updatePlayer(delta: number) {
    if (
      (this.stairsManager && this.stairsManager.isTransitioning()) ||
      this.isLevelTransitioning ||
      this.debugMenu?.isVisibleOpen
    ) {
      this.lastFrameDistMoved = 0;
      return;
    }

    const startX = this.player.x;
    const startY = this.player.y;

    const isMoving = this.isPlayerMoving();

    // On mobile: sprint is driven by mobileControls toggle button.
    // On desktop: sprint only while Shift is kept pressed and player is moving.
    if (this.mobileControls) {
      if (this.playerController.isSprinting !== this.mobileControls.isSprintToggled) {
        this.playerController.setSprinting(this.mobileControls.isSprintToggled);
      }
    } else {
      const shouldSprint = this.keys.shift && isMoving;
      if (this.playerController.isSprinting !== shouldSprint) {
        this.playerController.setSprinting(shouldSprint);
      }
    }

    const speedMultiplier = this.playerController.currentSpeedMultiplier;
    const moveSpeed = this.moveSpeed * delta * speedMultiplier;

    // Mobile joystick input
    const joyVector = this.mobileControls?.moveVector ?? RaycastScene.ZERO_VECTOR;
    const joyX = joyVector.x;
    const joyY = joyVector.y; // Negative is forward, positive is backward

    // Unified Movement Vector (Forward/Backward + Strafe Left/Right)
    let fwd = 0;
    if (this.keys.w) {
      fwd += 1;
    } else if (joyY < -0.15) {
      fwd += Math.min(1, -joyY);
    }

    if (this.keys.s) {
      fwd -= 1;
    } else if (joyY > 0.15) {
      fwd -= Math.min(1, joyY);
    }

    let strafe = 0;
    if (this.keys.d) {
      strafe += 1;
    } else if (joyX > 0.15) {
      strafe += Math.min(1, joyX);
    }

    if (this.keys.a) {
      strafe -= 1;
    } else if (joyX < -0.15) {
      strafe -= Math.min(1, -joyX);
    }

    if (fwd !== 0 || strafe !== 0) {
      // Normalize combined movement vector if length > 1 (prevents diagonal speed boost)
      const inputMag = Math.hypot(fwd, strafe);
      let normFwd = fwd;
      let normStrafe = strafe;
      if (inputMag > 1) {
        normFwd /= inputMag;
        normStrafe /= inputMag;
      }

      const strafeDirX = -this.player.dirY;
      const strafeDirY = this.player.dirX;

      const dx = (this.player.dirX * normFwd + strafeDirX * normStrafe) * moveSpeed;
      const dy = (this.player.dirY * normFwd + strafeDirY * normStrafe) * moveSpeed;

      const targetX = this.player.x + dx;
      const targetY = this.player.y + dy;

      if (this.tryMove(targetX, targetY)) {
        this.player.x = targetX;
        this.player.y = targetY;
      } else {
        // Wall sliding: test X-axis and Y-axis movements independently
        const origX = this.player.x;
        const origY = this.player.y;
        if (this.tryMove(targetX, origY)) {
          this.player.x = targetX;
        } else if (this.tryMove(origX, targetY)) {
          this.player.y = targetY;
        }
      }
    }

    // Track actual distance moved for footsteps
    this.lastFrameDistMoved = Math.hypot(this.player.x - startX, this.player.y - startY);

    // 3. Mobile Camera Rotation (swipe look area & turn buttons)
    if (this.mobileControls) {
      const lookDelta = this.mobileControls.consumeLookDelta();
      if (lookDelta !== 0) {
        this.rotatePlayer(lookDelta);
      }
    }

  }

  public getActiveLevelFinishZone(): LevelFinishZone | null {
    if (!this.levelFinishZones || this.levelFinishZones.length === 0) return null;
    const px = this.player.x;
    const py = this.player.y;
    for (const zone of this.levelFinishZones) {
      if (zone.enabled !== false && px >= zone.x1 && px <= zone.x2 && py >= zone.y1 && py <= zone.y2) {
        return zone;
      }
    }
    return null;
  }

  public getNearbyLockedFinishZone(): LevelFinishZone | null {
    if (!this.levelFinishZones || this.levelFinishZones.length === 0) return null;
    const px = this.player.x;
    const py = this.player.y;
    for (const zone of this.levelFinishZones) {
      if (zone.enabled === false && px >= zone.x1 && px <= zone.x2 && py >= zone.y1 && py <= zone.y2) {
        return zone;
      }
    }
    return null;
  }

  private updateLevelFinishZonesStatus(playSound: boolean = true): void {
    const breakables = this.breakableManager ? this.breakableManager.getBreakables() : [];
    const walls = this.destructableWallManager ? this.destructableWallManager.getWalls() : [];

    for (const zone of this.levelFinishZones) {
      if (zone.id === undefined) continue;
      const zoneIdStr = String(zone.id);

      const hasLinkedEnabler =
        breakables.some(
          (b) => b.isEnabling && b.linkIds && b.linkIds.some((lid) => String(lid).trim() === zoneIdStr)
        ) ||
        walls.some(
          (w) => w.isEnabling && w.linkIds && w.linkIds.some((lid) => String(lid).trim() === zoneIdStr)
        );

      if (!hasLinkedEnabler) {
        if (zone.enabled === undefined) {
          zone.enabled = true;
        }
        continue;
      }

      const activeLinkedBreakable = breakables.find(
        (b) => b.isEnabling && !b.isBroken && b.linkIds && b.linkIds.some((lid) => String(lid).trim() === zoneIdStr)
      );
      const activeLinkedWall = walls.find(
        (w) => w.isEnabling && w.isActive() && w.linkIds && w.linkIds.some((lid) => String(lid).trim() === zoneIdStr)
      );

      if (activeLinkedBreakable || activeLinkedWall) {
        zone.enabled = false;
      } else {
        const wasDisabled = zone.enabled === false;
        zone.enabled = true;
        if (wasDisabled) {
          this.hud?.showToast("[★] Exit Sector Unlocked!", 0x00ffcc);
          if (playSound) {
            try {
              sound.play("door_1", { volume: 0.5 });
            } catch {}
          }
        }
      }
    }
  }

  private finishLevel(targetLevel: string): void {
    if (this.isLevelTransitioning) return;
    this.isLevelTransitioning = true;
    this.removeControls();
    this.stopAlertAudio();

    const kills = this.enemyManager ? this.enemyManager.killedEnemies : 0;
    const total = this.enemyManager ? this.enemyManager.totalEnemies : 0;

    if (this.missionManager) {
      this.missionManager.completeRemainingObjectives();
      this.missionManager.completeObjective("escape_sector_1");
      this.missionManager.completeObjective("reach_elevator");
      this.missionManager.completeObjective("reach_exit");
    }

    this.hud?.setPrompt(null);
    this.hud?.showToast(`[★] Sector Cleared! (${kills}/${total} Hostiles)`, 0x00ffcc);
    try {
      sound.play("door_1", { volume: 0.5 });
    } catch {}

    // Unlock mouse cursor so player can interact with LevelEnd buttons
    try {
      if (document.exitPointerLock) {
        document.exitPointerLock();
      }
    } catch {}

    // Save progress to LocalStorage via RaycastSaveManager (setting currentLevel to targetLevel)
    RaycastSaveManager.saveProgress(
      this.currentLevel,
      targetLevel,
      this.playerController,
      kills,
      total
    );

    this.emit(Scene.Change, Scene.LevelEnd, targetLevel);
  }

  private tryMove(newX: number, newY: number): boolean {
    const r = this.playerRadius;

    // Bounds check with radius
    if (
      newX - r < 0 ||
      newX + r >= this.mapWidth ||
      newY - r < 0 ||
      newY + r >= this.mapHeight
    ) {
      return false;
    }

    // Check all tiles overlapped by player collision circle
    const minTileX = Math.floor(newX - r);
    const maxTileX = Math.floor(newX + r);
    const minTileY = Math.floor(newY - r);
    const maxTileY = Math.floor(newY + r);

    for (let gy = minTileY; gy <= maxTileY; gy++) {
      for (let gx = minTileX; gx <= maxTileX; gx++) {
        const flatIdx = gy * this.mapWidth + gx;
        const tile = this.mapFlat[flatIdx];

        if (tile !== 0) {
          const isDoorOpen =
            this.tileTypeFlags[flatIdx] === RaycastScene.TILE_DOOR &&
            Math.abs(this.doorStatesFlat[flatIdx]) >= 0.7;

          if (!isDoorOpen) {
            // Circle-to-AABB distance check to ensure player stays at least `r` distance away from wall faces and corners
            const clampX = Math.max(gx, Math.min(newX, gx + 1));
            const clampY = Math.max(gy, Math.min(newY, gy + 1));
            const dx = newX - clampX;
            const dy = newY - clampY;
            if (dx * dx + dy * dy < r * r) {
              return false;
            }
          }
        }
      }
    }

    // Thin walls collision check with radius
    for (let i = 0; i < this.thinWalls.length; i++) {
      const wall = this.thinWalls[i];
      const minX = Math.min(wall.x1, wall.x2);
      const maxX = Math.max(wall.x1, wall.x2);
      const minY = Math.min(wall.y1, wall.y2);
      const maxY = Math.max(wall.y1, wall.y2);
      if (
        newX + r >= minX &&
        newX - r <= maxX &&
        newY + r >= minY &&
        newY - r <= maxY
      ) {
        return false;
      }
    }

    if (
      this.destructableWallManager &&
      this.destructableWallManager.checkCollision(newX, newY, r)
    ) {
      return false;
    }

    if (
      this.breakableManager &&
      this.breakableManager.checkCollision(newX, newY, r)
    ) {
      return false;
    }

    if (
      this.stationaryObjectManager &&
      this.stationaryObjectManager.checkCollision(newX, newY, r)
    ) {
      return false;
    }

    return true;
  }

  private updateDoors(delta: number) {
    const entries = this.doorEntries;
    for (let i = 0; i < entries.length; i++) {
      const door = entries[i];
      const state = this.doorStatesFlat[door.flatIdx];
      if (state < 0) {
        // Closing the door
        let newState = state + 0.05 * delta;
        if (newState > 0) newState = 0;
        this.doorStates[door.key] = newState;
        this.doorStatesFlat[door.flatIdx] = newState;
      } else if (state > 0 && state < 1) {
        // Opening the door
        let newState = state + 0.05 * delta;
        if (newState > 1) newState = 1;
        this.doorStates[door.key] = newState;
        this.doorStatesFlat[door.flatIdx] = newState;
      }
    }
  }

  private updateInteractionPrompt(): void {
    if (!this.hud) return;

    if ((this.stairsManager && this.stairsManager.isTransitioning()) || this.isLevelTransitioning) {
      this.hud.setPrompt(null);
      return;
    }

    // 0. Prioritize interactive mission trigger prompt
    const missionPrompt = this.missionManager?.getActivePrompt();
    if (missionPrompt) {
      const color = this.missionManager?.getActivePromptColor() ?? 0x00e5ff;
      this.hud.setPrompt(missionPrompt, color);
      return;
    }

    // 0.5 Check if player is aiming at an ally (rescued prisoner command prompt)
    const allyPrompt = this.allyManager?.getInteractionPrompt(this.player.x, this.player.y, this.player.dirX, this.player.dirY);
    if (allyPrompt) {
      this.hud.setPrompt(allyPrompt.text, allyPrompt.color);
      return;
    }

    // 1. Check if player is standing in a LevelFinish zone
    const finishZone = this.getActiveLevelFinishZone();
    if (finishZone) {
      if (this.missionManager && !this.missionManager.canExitLevel()) {
        this.hud.setPrompt("[!] COMPLETE OBJECTIVES TO EXIT", 0xffaa00);
      } else {
        this.hud.setPrompt("[★] PRESS [E] TO FINISH LEVEL", 0x00ffcc);
      }
      return;
    }
    const lockedZone = this.getNearbyLockedFinishZone();
    if (lockedZone) {
      this.hud.setPrompt("[!] EXIT LOCKED - DESTROY SECURITY BARRIER", 0xffaa00);
      return;
    }

    if (!this.stairsManager) return;

    // Check if player is facing or near an interactable door
    const nearbyDoor = this.getNearbyOrFacingDoor();
    if (nearbyDoor) {
      const doorKey = `${nearbyDoor.x},${nearbyDoor.y}`;
      const flatIdx = nearbyDoor.y * this.mapWidth + nearbyDoor.x;
      const currentState = this.doorStatesFlat[flatIdx];
      const reqKey = this.lockedDoors[doorKey];

      let promptText: string;
      let promptColor = 0x00ffcc;

      if (this.disabledDoors.has(doorKey)) {
        promptText = "[!] DOOR OFFLINE";
        promptColor = 0xffaa00;
      } else if (reqKey && currentState === 0 && !this.unlockedKeycardDoors.has(doorKey)) {
        const keyName = reqKey.toUpperCase() + " KEYCARD";
        if (this.playerController.hasKeycard(reqKey)) {
          promptText = this.mobileControls ? `[E / TAP] UNLOCK (${keyName})` : `[E] UNLOCK (${keyName})`;
          promptColor = 0x00e5ff;
        } else {
          promptText = `[X] REQUIRES ${keyName}`;
          promptColor = 0xff4444;
        }
      } else if (currentState <= 0) {
        promptText = this.mobileControls ? "[E / TAP] OPEN DOOR" : "[E] OPEN DOOR";
        promptColor = 0x00ffcc;
      } else {
        promptText = this.mobileControls ? "[E / TAP] CLOSE DOOR" : "[E] CLOSE DOOR";
        promptColor = 0x00ffcc;
      }

      this.hud.setPrompt(promptText, promptColor);
      return;
    }

    const stair = this.stairsManager.getNearbyStair(
      this.player.x,
      this.player.y,
      this.player.dirX,
      this.player.dirY
    );

    if (stair) {
      let promptText = "PRESS [E] TO ENTER";
      if (stair.stairType === "up") {
        promptText = "[▲] PRESS [E] TO ENTER";
      } else if (stair.stairType === "down") {
        promptText = "[▼] PRESS [E] TO ENTER";
      }
      this.hud.setPrompt(promptText, 0x00e5ff);
    } else {
      this.hud.setPrompt(null);
    }
  }

  private getNearbyOrFacingDoor(): { x: number; y: number; dist: number } | null {
    if (!this.tileTypeFlags) return null;
    const px = Math.floor(this.player.x);
    const py = Math.floor(this.player.y);

    // 1. Ray sample along player facing direction at multiple distances (up to 2.2 tiles)
    const forwardDists = [0.5, 0.8, 1.1, 1.4, 1.7, 2.0, 2.2];
    for (const d of forwardDists) {
      const lx = Math.floor(this.player.x + this.player.dirX * d);
      const ly = Math.floor(this.player.y + this.player.dirY * d);
      if (lx < 0 || lx >= this.mapWidth || ly < 0 || ly >= this.mapHeight) continue;
      const flatIdx = ly * this.mapWidth + lx;
      if (this.tileTypeFlags[flatIdx] === RaycastScene.TILE_DOOR) {
        const dist = Math.hypot(lx + 0.5 - this.player.x, ly + 0.5 - this.player.y);
        return { x: lx, y: ly, dist };
      }
      // If a solid thick wall is hit before the door, stop searching along this ray
      if (this.tileTypeFlags[flatIdx] === RaycastScene.TILE_WALL) {
        break;
      }
    }

    // 2. Search nearby cells within radius 2.2 tiles, scoring by alignment with facing vector and proximity
    const candidates: Array<{ x: number; y: number; dist: number; score: number }> = [];
    const searchRadius = 2;
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) continue;
        const flatIdx = y * this.mapWidth + x;
        if (this.tileTypeFlags[flatIdx] === RaycastScene.TILE_DOOR) {
          const doorCenterX = x + 0.5;
          const doorCenterY = y + 0.5;
          const toDoorX = doorCenterX - this.player.x;
          const toDoorY = doorCenterY - this.player.y;
          const dist = Math.hypot(toDoorX, toDoorY);
          if (dist <= 2.2) {
            const dot = (toDoorX * this.player.dirX + toDoorY * this.player.dirY) / (dist || 1);
            if (dot > -0.2) {
              const score = dot * 2.0 - dist;
              candidates.push({ x, y, dist, score });
            }
          }
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0];
    }

    return null;
  }

  private tryOpenDoor() {
    if ((this.stairsManager && this.stairsManager.isTransitioning()) || this.isLevelTransitioning) return;

    // 0. Prioritize interactive mission triggers (terminals, alarms, switches)
    if (this.missionManager && this.missionManager.handleInteract()) {
      return;
    }

    // 0.5 Prioritize interacting with ally when looking directly at him
    if (
      this.allyManager &&
      this.allyManager.tryInteractWithAlly(this.player.x, this.player.y, this.player.dirX, this.player.dirY)
    ) {
      return;
    }

    // 1. Prioritize level finish if standing in the finish zone
    const finishZone = this.getActiveLevelFinishZone();
    if (finishZone) {
      if (this.missionManager && !this.missionManager.canExitLevel()) {
        this.hud.showToast("[!] Complete remaining primary objectives before exiting!", 0xffaa00, 3.0);
        return;
      }
      this.finishLevel(finishZone.targetLevel);
      return;
    }

    const lookX = Math.floor(this.player.x + this.player.dirX * 1.1);
    const lookY = Math.floor(this.player.y + this.player.dirY * 1.1);

    // 2. Prioritize stairs if player is facing them
    if (this.stairsManager && this.stairsManager.tryInteractStairs(lookX, lookY)) {
      return;
    }

    // 3. Prioritize facing or nearby doors (handles mobile joystick positions up to 2.2 tiles reach)
    const door = this.getNearbyOrFacingDoor();
    if (door && this.checkAndInteractDoor(door.x, door.y)) {
      return;
    }

    // 4. Check adjacent cells or general nearby stairs
    if (
      this.stairsManager &&
      (this.stairsManager.tryInteractNearbyStairs(this.player.x, this.player.y) ||
        this.stairsManager.tryInteract(this.player.x, this.player.y, this.player.dirX, this.player.dirY))
    ) {
      return;
    }

    // 5. Fallback: check adjacent cells for doors
    const px = Math.floor(this.player.x);
    const py = Math.floor(this.player.y);
    for (let i = 0; i < RaycastScene.NEARBY_OFFSETS.length; i++) {
      const off = RaycastScene.NEARBY_OFFSETS[i];
      const x = px + off[0];
      const y = py + off[1];
      if (door && x === door.x && y === door.y) continue;
      if (this.checkAndInteractDoor(x, y)) {
        return;
      }
    }
  }

  private checkAndInteractDoor(x: number, y: number): boolean {
    if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) return false;
    const flatIdx = y * this.mapWidth + x;
    if (this.tileTypeFlags[flatIdx] !== RaycastScene.TILE_DOOR) return false;

    const key = `${x},${y}`;
    const currentState = this.doorStatesFlat[flatIdx];

    // Check if door has an active DoorProtector barrier physically guarding this doorway
    if (this.destructableWallManager) {
      const activeWallAtTile = this.destructableWallManager.getWalls().find(
        (w) => w.isActive() && w.gridX === x && w.gridY === y
      );
      if (activeWallAtTile) {
        this.hud?.showToast("[!] Security Barrier Active - Disable Barrier First", 0xffaa00);
        return false;
      }
    }

    if (this.disabledDoors.has(key)) {
      if (currentState <= 0) {
        if (this.missionManager?.isWaitRunning()) {
          this.hud?.showToast("[⏳] Operation in progress, please wait...", 0xffaa00);
        } else {
          this.hud?.showToast("[!] Door Offline - Elevator / Terminal Required", 0xffaa00);
        }
      } else {
        this.hud?.showToast("[!] Mechanism Active - Door Locked Open", 0xffaa00);
      }
      return false;
    }

    // Check if door requires a keycard to unlock
    const reqKey = this.lockedDoors[key];
    if (reqKey && currentState === 0) {
      if (!this.playerController.hasKeycard(reqKey)) {
        const keyName = reqKey.charAt(0).toUpperCase() + reqKey.slice(1) + " Keycard";
        this.hud.showToast(`[X] Access Denied! Requires ${keyName}`, 0xff3333);
        this.hud.flashScreen(0xff0000, 0.2);
        return false;
      } else if (!this.unlockedKeycardDoors.has(key)) {
        const keyName = reqKey.charAt(0).toUpperCase() + reqKey.slice(1) + " Keycard";
        this.hud.showToast(`[!] Access Granted (${keyName})`, 0x00e5ff);
        this.unlockedKeycardDoors.add(key);
      }
    }

    if (currentState <= 0) {
      // Open closed door or reverse closing door
      const startOpen = currentState < 0 ? Math.max(0.05, Math.abs(currentState)) : 0.01;
      this.doorStates[key] = startOpen;
      this.doorStatesFlat[flatIdx] = startOpen;
      try {
        sound.play("door_1", { volume: 0.5 });
      } catch (e) {
        console.warn("Failed to play door_1 sound:", e);
      }
      return true;
    } else if (currentState > 0) {
      // Close open door or reverse opening door
      const startClose = -Math.max(0.05, currentState);
      this.doorStates[key] = startClose;
      this.doorStatesFlat[flatIdx] = startClose;
      try {
        sound.play("door_1", { volume: 0.4 });
      } catch (e) {
        console.warn("Failed to play door_1 sound:", e);
      }
      return true;
    }
    return false;
  }

  public openDoorAt(x: number, y: number, playSound: boolean = true): boolean {
    if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) return false;
    const flatIdx = y * this.mapWidth + x;
    if (this.tileTypeFlags[flatIdx] !== RaycastScene.TILE_DOOR) return false;

    const key = `${x},${y}`;
    const currentState = this.doorStatesFlat[flatIdx];
    if (currentState <= 0) {
      const startOpen = currentState < 0 ? Math.max(0.05, Math.abs(currentState)) : 0.01;
      this.doorStates[key] = startOpen;
      this.doorStatesFlat[flatIdx] = startOpen;
      if (playSound) {
        try {
          sound.play("door_1", { volume: 0.5 });
        } catch (e) {}
      }
      return true;
    }
    return false;
  }

  public closeDoorAt(x: number, y: number, playSound: boolean = true): boolean {
    if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) return false;
    const flatIdx = y * this.mapWidth + x;
    if (this.tileTypeFlags[flatIdx] !== RaycastScene.TILE_DOOR) return false;

    const key = `${x},${y}`;
    const currentState = this.doorStatesFlat[flatIdx];
    if (currentState > 0) {
      const startClose = -Math.max(0.05, currentState);
      this.doorStates[key] = startClose;
      this.doorStatesFlat[flatIdx] = startClose;
      if (playSound) {
        try {
          sound.play("door_1", { volume: 0.4 });
        } catch (e) {}
      }
      return true;
    }
    return false;
  }

  private hasTriggerSound(trigger?: ITriggerZone): boolean {
    if (!trigger) return false;
    if (trigger.sound && trigger.sound.soundName) return true;
    if (trigger.soundOnTrigger && trigger.soundOnTrigger.length > 0) return true;
    return false;
  }

  private extractSoundName(props: any): string | null {
    if (!props) return null;
    if (Array.isArray(props)) {
      for (const p of props) {
        const name = (p.name || "").toLowerCase();
        if (name === "sound" || name === "soundontrigger" || name === "sfx" || name === "audio") {
          if (typeof p.value === "string") return p.value.trim();
          if (p.value && typeof p.value === "object" && typeof p.value.soundName === "string") {
            return p.value.soundName.trim() || null;
          }
        }
      }
    } else if (typeof props === "object") {
      for (const k of Object.keys(props)) {
        const lk = k.toLowerCase();
        if (lk === "sound" || lk === "soundontrigger" || lk === "sfx" || lk === "audio") {
          const val = props[k];
          if (typeof val === "string") return val.trim();
          if (val && typeof val === "object" && typeof val.soundName === "string") {
            return val.soundName.trim() || null;
          }
        }
      }
    }
    return null;
  }

  private normalizeSoundName(raw: string): string {
    let name = raw.replace(/\\/g, "/");
    const lastSlash = name.lastIndexOf("/");
    if (lastSlash !== -1) {
      name = name.substring(lastSlash + 1);
    }
    const dot = name.lastIndexOf(".");
    if (dot !== -1) {
      name = name.substring(0, dot);
    }
    return name.trim();
  }

  private playPropSounds(
    obj: any,
    sourceTrigger?: ITriggerZone,
    propCenterX?: number,
    propCenterY?: number,
    action: string = "disable"
  ): void {
    let soundName: string | null = null;
    if (obj) {
      soundName = this.extractSoundName(obj.properties);
    }
    if (!soundName && sourceTrigger) {
      if (sourceTrigger.soundOnTrigger && sourceTrigger.soundOnTrigger.length > 0) {
        soundName = sourceTrigger.soundOnTrigger[0];
      } else if (typeof (sourceTrigger as any).sound === "string") {
        soundName = (sourceTrigger as any).sound;
      } else {
        soundName = this.extractSoundName((sourceTrigger as any).properties);
      }
    }
    if (!soundName) return;

    const normName = this.normalizeSoundName(soundName);
    let volume = 0.6;
    if (propCenterX !== undefined && propCenterY !== undefined) {
      const dist = Math.hypot(this.player.x - propCenterX, this.player.y - propCenterY);
      const maxDist = 15;
      volume = Math.max(0.05, Math.min(1.0, 1.0 - dist / maxDist)) * 0.7;
    }

    const isWaitTrigger = Boolean(
      sourceTrigger?.isWaitRunning || (sourceTrigger?.wait?.shouldWait && action === "disable")
    );
    const soundKey = String(sourceTrigger?.id ?? obj?.id ?? normName);

    try {
      if (sound.exists(normName)) {
        this.stopTriggerPropSounds(soundKey, normName);
        const res = sound.play(normName, { loop: isWaitTrigger, volume });
        if (isWaitTrigger) {
          if (res && typeof (res as any).then === "function") {
            (res as any)
              .then((inst: any) => {
                if (sourceTrigger && !sourceTrigger.isWaitRunning) {
                  try {
                    inst.stop?.();
                  } catch {}
                  return;
                }
                this.activePropSounds.set(soundKey, inst);
                this.activePropSounds.set(normName, inst);
              })
              .catch(() => {});
          } else if (res) {
            this.activePropSounds.set(soundKey, res);
            this.activePropSounds.set(normName, res);
          }
        }
      } else {
        console.warn(`Sound '${normName}' not found in Pixi sound cache.`);
      }
    } catch (e) {
      console.warn(`Failed to play prop sound '${normName}':`, e);
    }
  }

  private stopTriggerPropSounds(key: string | number, soundName?: string): void {
    const sKey = String(key);
    const inst = this.activePropSounds.get(sKey);
    if (inst) {
      try {
        inst.stop?.();
      } catch {}
      this.activePropSounds.delete(sKey);
    }
    if (soundName) {
      const norm = this.normalizeSoundName(soundName);
      const inst2 = this.activePropSounds.get(norm);
      if (inst2) {
        try {
          inst2.stop?.();
        } catch {}
        this.activePropSounds.delete(norm);
      }
      try {
        if (sound.exists(norm)) {
          sound.stop(norm);
        }
      } catch {}
    }
  }

  private resolveLinkTargetState(normAction: string, currentState: boolean): boolean {
    if (normAction === "enable") return true;
    if (normAction === "disable") return false;
    return !currentState;
  }

  public applyLinkAction(
    linkIds: (string | number)[],
    action: string = "disable",
    sourceTrigger?: ITriggerZone
  ): void {
    if (!linkIds || linkIds.length === 0) return;
    const normAction = (action || "disable").toLowerCase();
    const shouldPlayDoorSound = !this.hasTriggerSound(sourceTrigger);

    for (const rawId of linkIds) {
      const numId = Number(rawId);
      const strId = String(rawId).trim();

      // 0. Linked Triggers
      const linkedTrigger = this.missionManager?.getTriggerById(strId);
      if (linkedTrigger && linkedTrigger !== sourceTrigger) {
        this.missionManager.setTriggerEnabled(
          strId,
          this.resolveLinkTargetState(normAction, linkedTrigger.enabled ?? true)
        );
        continue;
      }

      // 1. DestructableWallManager (door protectors / security barriers by ID)
      let isDoorProtector = false;
      if (this.destructableWallManager) {
        const wall = this.destructableWallManager.getWallById(strId);
        if (wall) {
          isDoorProtector = true;
          this.destructableWallManager.setWallActiveById(
            wall.id,
            this.resolveLinkTargetState(normAction, wall.isActive()),
            shouldPlayDoorSound
          );
        }
      }

      // 2. Check map objects (for doors, switches, elevator doors, barriers within object limits)
      const obj = this.mapObjectsById.get(numId);
      if (obj) {
        const objLayer = String((obj as any)._layerName || "").toLowerCase();
        if (objLayer.includes("protector") || objLayer.includes("barrier")) {
          isDoorProtector = true;
        }

        const tileW = this.currentMapData?.tilewidth || 64;
        const tileH = this.currentMapData?.tileheight || 64;
        const objW = Math.max(1, obj.width || tileW);
        const objH = Math.max(1, obj.height || tileH);
        const x1 = obj.x;
        const x2 = obj.x + objW;
        const y1 = obj.gid ? obj.y - objH : obj.y;
        const y2 = obj.gid ? obj.y : obj.y + objH;

        const minGx = Math.floor(Math.min(x1, x2) / tileW) + this.currentMapOffsetX;
        const maxGx = Math.floor((Math.max(x1, x2) - 0.001) / tileW) + this.currentMapOffsetX;
        const minGy = Math.floor(Math.min(y1, y2) / tileH) + this.currentMapOffsetY;
        const maxGy = Math.floor((Math.max(y1, y2) - 0.001) / tileH) + this.currentMapOffsetY;

        const propCenterX = (x1 + x2) / 2 / tileW + this.currentMapOffsetX;
        const propCenterY = (y1 + y2) / 2 / tileH + this.currentMapOffsetY;

        // Disable / enable all doors within the rectangular limits of the linked object
        for (let gy = minGy; gy <= maxGy; gy++) {
          if (gy < 0 || gy >= this.mapHeight) continue;
          for (let gx = minGx; gx <= maxGx; gx++) {
            if (gx < 0 || gx >= this.mapWidth) continue;
            const flatIdx = gy * this.mapWidth + gx;
            const isDoorTile =
              (this.tileTypeFlags && this.tileTypeFlags[flatIdx] === RaycastScene.TILE_DOOR) ||
              (this.tileTypes && this.tileTypes[this.mapFlat[flatIdx]] === "door");

            if (isDoorTile) {
              const doorKey = `${gx},${gy}`;
              const shouldPlayDoorSound = !this.hasTriggerSound(sourceTrigger);
              if (isDoorProtector) {
                // When acting on a door protector / security barrier:
                // "disable" deactivates the barrier and OPENS/ENABLES the door!
                // It should NEVER lock the door shut or mark it offline!
                if (normAction === "disable") {
                  this.disabledDoors.delete(doorKey);
                  this.openDoorAt(gx, gy, shouldPlayDoorSound);
                } else if (normAction === "enable") {
                  this.closeDoorAt(gx, gy, shouldPlayDoorSound);
                }
              } else {
                // Non-protector controlled doors (elevators / mechanisms)
                const shouldEnable = this.resolveLinkTargetState(
                  normAction,
                  !this.disabledDoors.has(doorKey)
                );
                if (shouldEnable) {
                  this.disabledDoors.delete(doorKey);
                  this.openDoorAt(gx, gy, shouldPlayDoorSound);
                } else {
                  this.disabledDoors.add(doorKey);
                  this.closeDoorAt(gx, gy, shouldPlayDoorSound);
                }
              }
            }
          }
        }

        // Also disable/enable any DestructableWall barriers within limits of the linked object
        if (this.destructableWallManager) {
          for (const wall of this.destructableWallManager.getWalls()) {
            if (wall.gridX >= minGx && wall.gridX <= maxGx && wall.gridY >= minGy && wall.gridY <= maxGy) {
              this.destructableWallManager.setWallActiveById(
                wall.id,
                this.resolveLinkTargetState(normAction, wall.isActive()),
                shouldPlayDoorSound
              );
            }
          }
        }
      }

      // 3. Check level finish zones
      for (const zone of this.levelFinishZones) {
        if ((zone.id !== undefined && String(zone.id) === strId) || zone.targetLevel === strId) {
          const wasDisabled = zone.enabled === false;
          const nextEnabled = this.resolveLinkTargetState(normAction, zone.enabled !== false);
          zone.enabled = nextEnabled;
          if (nextEnabled && wasDisabled) {
            this.hud.showToast("[★] Exit Sector Unlocked!", 0x00ffcc);
            if (shouldPlayDoorSound) {
              try {
                sound.play("door_1", { volume: 0.5 });
              } catch {}
            }
          }
        }
      }
    }
    this.updateLevelFinishZonesStatus(!this.hasTriggerSound(sourceTrigger));
  }

  private initControlledDoors(): void {
    if (!this.missionManager) return;
    const triggers = this.missionManager.getTriggers();
    const tileW = this.currentMapData?.tilewidth || 64;
    const tileH = this.currentMapData?.tileheight || 64;

    for (const trigger of triggers) {
      // ONLY waitable operations (such as elevator countdowns) should start with locked offline doors!
      const isWaitable = Boolean(trigger.wait && trigger.wait.shouldWait && trigger.wait.waitTimeInSeconds > 0);
      if (!isWaitable) continue;
      if (!trigger.linkIds || trigger.linkIds.length === 0) continue;

      for (const rawId of trigger.linkIds) {
        const numId = Number(rawId);
        const strId = String(rawId).trim();

        // Never lock door protectors or security barriers as offline elevator doors
        if (this.destructableWallManager?.getWallById(strId)) continue;
        const obj = this.mapObjectsById.get(numId);
        if (!obj) continue;
        const objLayer = String((obj as any)._layerName || "").toLowerCase();
        if (objLayer.includes("protector") || objLayer.includes("barrier")) continue;

        const objW = Math.max(1, obj.width || tileW);
        const objH = Math.max(1, obj.height || tileH);
        const x1 = obj.x;
        const x2 = obj.x + objW;
        const y1 = obj.gid ? obj.y - objH : obj.y;
        const y2 = obj.gid ? obj.y : obj.y + objH;

        const minGx = Math.floor(Math.min(x1, x2) / tileW) + this.currentMapOffsetX;
        const maxGx = Math.floor((Math.max(x1, x2) - 0.001) / tileW) + this.currentMapOffsetX;
        const minGy = Math.floor(Math.min(y1, y2) / tileH) + this.currentMapOffsetY;
        const maxGy = Math.floor((Math.max(y1, y2) - 0.001) / tileH) + this.currentMapOffsetY;

        for (let gy = minGy; gy <= maxGy; gy++) {
          if (gy < 0 || gy >= this.mapHeight) continue;
          for (let gx = minGx; gx <= maxGx; gx++) {
            if (gx < 0 || gx >= this.mapWidth) continue;
            const flatIdx = gy * this.mapWidth + gx;
            const isDoorTile =
              (this.tileTypeFlags && this.tileTypeFlags[flatIdx] === RaycastScene.TILE_DOOR) ||
              (this.tileTypes && this.tileTypes[this.mapFlat[flatIdx]] === "door");

            if (isDoorTile) {
              const doorKey = `${gx},${gy}`;
              // Initial state: elevator door is disabled (locked closed) until enabled by trigger wait
              this.disabledDoors.add(doorKey);
              this.doorStates[doorKey] = 0;
              this.doorStatesFlat[flatIdx] = 0;
            }
          }
        }
      }
    }
  }

  private clearTriggerSoundTimeouts(): void {
    for (const timerId of this.triggerSoundTimeouts) {
      window.clearTimeout(timerId);
    }
    this.triggerSoundTimeouts.clear();
  }

  private async waitForSoundLoaded(normName: string, timeoutMs: number = 5000): Promise<boolean> {
    const start = Date.now();
    while (!this.destroyed && Date.now() - start < timeoutMs) {
      const s = sound.find(normName);
      if (!s) return false;
      if (s.isLoaded) return true;
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    }
    return Boolean(sound.find(normName)?.isLoaded);
  }

  private async ensureTriggerSoundLoaded(normName: string): Promise<boolean> {
    if (!normName) return false;
    if (sound.exists(normName)) {
      return this.waitForSoundLoaded(normName);
    }

    const candidateUrls = [
      `./assets/raycast/sfx/${normName}.mp3`,
      `./assets/raycast/sfx/${normName}.wav`,
      `./assets/sounds/${normName}.mp3`,
      `./assets/sounds/${normName}.wav`,
    ];

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, { method: "HEAD" });
        if (res.ok) {
          if (sound.exists(normName)) {
            return this.waitForSoundLoaded(normName);
          }
          return await new Promise<boolean>((resolve) => {
            sound.add(normName, {
              url,
              preload: true,
              loaded: (err) => resolve(!err),
            });
          });
        }
      } catch {}
    }

    return false;
  }

  private handleTriggerSound(trigger: ITriggerZone): void {
    const config = trigger.sound;
    if (!config) return;

    const delayMs = Math.max(0, (config.delay || 0) * 1000);
    if (delayMs > 0) {
      const timerId = window.setTimeout(() => {
        this.triggerSoundTimeouts.delete(timerId);
        if (this.destroyed) return;
        void this.executeTriggerSound(trigger, config);
      }, delayMs);
      this.triggerSoundTimeouts.add(timerId);
    } else {
      void this.executeTriggerSound(trigger, config);
    }
  }

  private async executeTriggerSound(
    trigger: ITriggerZone,
    config: ITriggerSoundConfig
  ): Promise<void> {
    const normName = config.soundName ? this.normalizeSoundName(config.soundName) : "";

    if (config.action === "stop") {
      if (config.overrideBackgroundMusic || normName === "calm_loop" || (normName && normName === this.currentBgMusicAlias)) {
        this.isBgMusicOverridden = true;
        this.stopBackgroundMusic();
      }
      if (normName) {
        this.stopTriggerPropSounds(trigger.id, normName);
      }
      return;
    }

    if (!normName) return;

    if (config.overrideBackgroundMusic) {
      this.isBgMusicOverridden = true;
      this.stopBackgroundMusic();
    }

    const loaded = await this.ensureTriggerSoundLoaded(normName);
    if (!loaded || this.destroyed) {
      if (!loaded) {
        console.warn(`Trigger sound '${normName}' could not be found or loaded.`);
      }
      return;
    }

    const optionsMusicVol = SettingsManager.getInstance().getMusicVolume();
    const sfxBaseVolume = getSoundBaseVolume(normName);
    const volume = config.overrideBackgroundMusic
      ? (gameConfig.musicVolume ?? optionsMusicVol)
      : sfxBaseVolume * optionsMusicVol;
    const loop = Boolean(config.shouldLoop);

    try {
      if (!config.overrideBackgroundMusic) {
        this.stopTriggerPropSounds(trigger.id, normName);
      }

      const res = sound.play(normName, { loop, volume });
      const handleInstance = (inst: any) => {
        if (!inst || this.destroyed) {
          try {
            inst?.stop?.();
          } catch {}
          return;
        }
        if (config.overrideBackgroundMusic) {
          this.bgMusicInstance = inst;
          this.currentBgMusicAlias = normName;
        } else {
          this.activePropSounds.set(String(trigger.id), inst);
          this.activePropSounds.set(normName, inst);
        }
      };

      if (res && typeof (res as any).then === "function") {
        (res as any).then(handleInstance).catch(() => {});
      } else {
        handleInstance(res);
      }
    } catch (e) {
      console.warn(`Failed to execute trigger sound '${normName}':`, e);
    }
  }

  private getLeverGids(): { leverOffGid: number; leverOnGid: number } {
    let leverOffId = 40;
    let leverOnId = 41;
    for (const idStr of Object.keys(this.tileMeta)) {
      const id = Number(idStr);
      const img = (this.tileMeta[id]?.image || "").toLowerCase();
      if (img.includes("lever_off")) {
        leverOffId = id;
      } else if (img.includes("lever_on")) {
        leverOnId = id;
      }
    }
    return {
      leverOffGid: leverOffId + this.firstgid,
      leverOnGid: leverOnId + this.firstgid,
    };
  }

  private toggleNearbyLeverTextures(trigger: ITriggerZone): void {
    const { leverOffGid, leverOnGid } = this.getLeverGids();
    const minGx = Math.max(0, Math.floor(trigger.minX) - 1);
    const maxGx = Math.min(this.mapWidth - 1, Math.floor(trigger.maxX) + 1);
    const minGy = Math.max(0, Math.floor(trigger.minY) - 1);
    const maxGy = Math.min(this.mapHeight - 1, Math.floor(trigger.maxY) + 1);

    for (let gy = minGy; gy <= maxGy; gy++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const flatIdx = gy * this.mapWidth + gx;
        const currentGid = this.mapFlat[flatIdx];
        if (currentGid === leverOnGid) {
          this.map[gy][gx] = leverOffGid;
          this.mapFlat[flatIdx] = leverOffGid;
          this.tileTypes[leverOffGid] = TileType.THICK_WALL;
        } else if (currentGid === leverOffGid) {
          this.map[gy][gx] = leverOnGid;
          this.mapFlat[flatIdx] = leverOnGid;
          this.tileTypes[leverOnGid] = TileType.THICK_WALL;
        }
      }
    }
  }

  private handleTriggerFired(trigger: ITriggerZone): void {
    const triggerCenterX = (trigger.minX + trigger.maxX) / 2;
    const triggerCenterY = (trigger.minY + trigger.maxY) / 2;
    const isWaitable = Boolean(trigger.wait && trigger.wait.shouldWait && trigger.wait.waitTimeInSeconds > 0);

    if (trigger.sound) {
      this.handleTriggerSound(trigger);
    }
    if (trigger.shouldBePressed) {
      this.toggleNearbyLeverTextures(trigger);
    }

    if (isWaitable) {
      // Waitable operation: play looping spatial sound from prop / trigger during wait countdown.
      // The link action (e.g. enabling / opening doors) will execute when the wait countdown finishes!
      if (trigger.linkIds && trigger.linkIds.length > 0) {
        const firstId = Number(trigger.linkIds[0]);
        const obj = this.mapObjectsById.get(firstId);
        if (obj) {
          const tileW = this.currentMapData?.tilewidth || 64;
          const tileH = this.currentMapData?.tileheight || 64;
          const propCenterX = (obj.x + (obj.width || tileW) / 2) / tileW + this.currentMapOffsetX;
          const propCenterY = (obj.y + (obj.height || tileH) / 2) / tileH + this.currentMapOffsetY;
          this.playPropSounds(obj, trigger, propCenterX, propCenterY, "disable");
        } else {
          this.playPropSounds(null, trigger, triggerCenterX, triggerCenterY, "disable");
        }
      } else {
        this.playPropSounds(null, trigger, triggerCenterX, triggerCenterY, "disable");
      }
    } else {
      // Non-waitable instant trigger: play prop sound if configured, then apply link action immediately
      if (trigger.linkIds && trigger.linkIds.length > 0) {
        const firstId = Number(trigger.linkIds[0]);
        const obj = this.mapObjectsById.get(firstId);
        const tileW = this.currentMapData?.tilewidth || 64;
        const tileH = this.currentMapData?.tileheight || 64;
        const propCenterX = obj ? (obj.x + (obj.width || tileW) / 2) / tileW + this.currentMapOffsetX : triggerCenterX;
        const propCenterY = obj ? (obj.y + (obj.height || tileH) / 2) / tileH + this.currentMapOffsetY : triggerCenterY;
        const action = trigger.linkAction && trigger.linkAction !== "-" ? trigger.linkAction : "disable";
        this.playPropSounds(obj, trigger, propCenterX, propCenterY, action);
        this.applyLinkAction(trigger.linkIds, action, trigger);
      } else {
        this.playPropSounds(null, trigger, triggerCenterX, triggerCenterY, trigger.linkAction || "disable");
      }
    }
  }

  private handleTriggerWaitComplete(trigger: ITriggerZone): void {
    // 1. Stop looping prop sounds associated with this trigger, its linked IDs, or configured sound aliases
    this.stopTriggerPropSounds(trigger.id);
    if (trigger.linkIds) {
      for (const id of trigger.linkIds) {
        this.stopTriggerPropSounds(id);
      }
    }
    if (trigger.soundOnTrigger && trigger.soundOnTrigger.length > 0) {
      for (const s of trigger.soundOnTrigger) {
        this.stopTriggerPropSounds(s, s);
      }
    }
    this.stopTriggerPropSounds("elevator", "elevator");
    try {
      if (sound.exists("elevator")) {
        sound.stop("elevator");
      }
    } catch {}

    // 2. Play completion chime / door sound only if trigger has no custom sound attached
    if (!this.hasTriggerSound(trigger)) {
      try {
        if (sound.exists("door_1")) {
          sound.play("door_1", { volume: 0.5 });
        }
      } catch {}
    }

    // 3. Execute completion action on linked objects (enable/open doors after wait finishes)
    if (trigger.linkIds && trigger.linkIds.length > 0) {
      const action = (trigger.wait && trigger.wait.shouldWait)
        ? (trigger.linkAction && trigger.linkAction !== "-" && trigger.linkAction !== "disable" ? trigger.linkAction : "enable")
        : (trigger.linkAction && trigger.linkAction !== "-" ? trigger.linkAction : "enable");
      this.applyLinkAction(trigger.linkIds, action, trigger);
    }
  }

  private cullThinWalls(): void {
    this.activeThinWalls.length = 0;
    const invDet =
      1.0 /
      (this.player.planeX * this.player.dirY -
        this.player.dirX * this.player.planeY);

    const allThinWalls = this.allThinWalls;
    for (let i = 0; i < allThinWalls.length; i++) {
      const wall = allThinWalls[i];
      // Transform wall endpoints into player camera space
      const dx1 = wall.x1 - this.player.x;
      const dy1 = wall.y1 - this.player.y;
      const tx1 = invDet * (this.player.dirY * dx1 - this.player.dirX * dy1);
      const ty1 = invDet * (-this.player.planeY * dx1 + this.player.planeX * dy1);

      const dx2 = wall.x2 - this.player.x;
      const dy2 = wall.y2 - this.player.y;
      const tx2 = invDet * (this.player.dirY * dx2 - this.player.dirX * dy2);
      const ty2 = invDet * (-this.player.planeY * dx2 + this.player.planeX * dy2);

      // Frustum culling: if both endpoints are behind the player, cull
      if (ty1 <= 0.05 && ty2 <= 0.05) continue;

      // Frustum culling: if both endpoints are to the left of the FOV, cull
      if (tx1 < -1.2 * ty1 && tx2 < -1.2 * ty2 && ty1 > 0 && ty2 > 0) continue;

      // Frustum culling: if both endpoints are to the right of the FOV, cull
      if (tx1 > 1.2 * ty1 && tx2 > 1.2 * ty2 && ty1 > 0 && ty2 > 0) continue;

      // Project endpoints to screen columns with near-plane clipping
      let cx1 = tx1;
      let cy1 = ty1;
      let cx2 = tx2;
      let cy2 = ty2;

      const NEAR = 0.05;
      if (cy1 < NEAR) {
        const t = (NEAR - cy1) / (cy2 - cy1);
        cx1 = cx1 + t * (cx2 - cx1);
        cy1 = NEAR;
      } else if (cy2 < NEAR) {
        const t = (NEAR - cy2) / (cy1 - cy2);
        cx2 = cx2 + t * (cx1 - cx2);
        cy2 = NEAR;
      }

      const screenW = gameConfig.width;
      const col1 = (screenW / 2) * (1 + cx1 / cy1);
      const col2 = (screenW / 2) * (1 + cx2 / cy2);

      const minCol = Math.max(0, Math.floor(Math.min(col1, col2)));
      const maxCol = Math.min(screenW - 1, Math.ceil(Math.max(col1, col2)));

      if (minCol > maxCol) continue;

      wall.minCol = minCol;
      wall.maxCol = maxCol;

      this.activeThinWalls.push(wall);
    }
  }

  private castRay(column: number): number {
    const screenW = gameConfig.width;
    const cameraX = (2 * column) / screenW - 1;
    const rayDirX = this.player.dirX + this.player.planeX * cameraX;
    const rayDirY = this.player.dirY + this.player.planeY * cameraX;

    let mapX = Math.floor(this.player.x);
    let mapY = Math.floor(this.player.y);

    const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
    const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

    let stepX: number, stepY: number, sideDistX: number, sideDistY: number;
    let side: number = 0;

    if (rayDirX < 0) {
      stepX = -1;
      sideDistX = (this.player.x - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1 - this.player.x) * deltaDistX;
    }

    if (rayDirY < 0) {
      stepY = -1;
      sideDistY = (this.player.y - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1 - this.player.y) * deltaDistY;
    }

    const pool = this.hitPool[column];
    let hitCount = 0;
    let solidWallDist = this.MAX_RENDER_DISTANCE;
    let currentDist = 0;

    while (true) {
      if (sideDistX < sideDistY) {
        currentDist = sideDistX;
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        currentDist = sideDistY;
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }

      const dist = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
      if (dist > this.MAX_RENDER_DISTANCE) break;

      if (
        mapX < 0 ||
        mapX >= this.mapWidth ||
        mapY < 0 ||
        mapY >= this.mapHeight
      )
        break;

      const flatIdx = mapY * this.mapWidth + mapX;
      const tile = this.mapFlat[flatIdx];

      if (tile > 0) {
        let hitX =
          side === 0
            ? this.player.y + dist * rayDirY
            : this.player.x + dist * rayDirX;
        hitX -= Math.floor(hitX);

        const tileFlag = this.tileTypeFlags[flatIdx];
        const adjustedTileId = tile - 1;

        if (tileFlag === RaycastScene.TILE_DOOR) {
          const orientation = this.doorOrientationsFlat[flatIdx]; // 0 = NS (plane at x + 0.5), 1 = EW (plane at y + 0.5)
          
          // Fix: Read the explicit door state at THIS cell, not just relying on external assignments
          const open = Math.abs(this.doorStatesFlat[flatIdx]); // 0.0 to 1.0
          
          const slideMode = this.doorSlideModesFlat[flatIdx]; // 0 = sideways, 1 = up, 2 = down

          if (orientation === 0) {
            // North-South door: plane is in the center at x = mapX + 0.5
            if (Math.abs(rayDirX) > 1e-6) {
              const doorDist = (sideDistX - deltaDistX) + 0.5 * deltaDistX;
              const hitY = this.player.y + doorDist * rayDirY;
              const offset = hitY - mapY;

              // Ray intersects door plane within the cell boundaries [0, 1]
              const hitDoor = doorDist > 0 && (side === 0 || doorDist >= dist) && offset >= 0 && offset <= 1;

              if (hitDoor) {
                if (slideMode === 3) {
                  // Sliding right along Y axis (gap on left offset < open)
                  if (offset >= open) {
                    if (hitCount < pool.length) {
                      const h = pool[hitCount++];
                      h.wallType = adjustedTileId;
                      h.distance = doorDist;
                      const texX = offset - open;
                      h.hitX = stepX > 0 ? texX : 1.0 - texX;
                      h.side = 0;
                      h.mapX = mapX;
                      h.mapY = mapY;
                      h.rayDirX = rayDirX;
                      h.rayDirY = rayDirY;
                      h.isDoor = true;
                      h.doorSlide = DoorOpen.RIGHT;
                      h.doorOpen = open;
                      solidWallDist = doorDist;
                    }
                    break;
                  }
                  // Else offset < open: passes through open gap! Continue DDA.
                } else if (slideMode === 0) {
                  // Sliding left along Y axis (gap on right offset > 1.0 - open)
                  if (offset <= 1.0 - open) {
                    if (hitCount < pool.length) {
                      const h = pool[hitCount++];
                      h.wallType = adjustedTileId;
                      h.distance = doorDist;
                      const texX = offset + open;
                      h.hitX = stepX > 0 ? texX : 1.0 - texX;
                      h.side = 0;
                      h.mapX = mapX;
                      h.mapY = mapY;
                      h.rayDirX = rayDirX;
                      h.rayDirY = rayDirY;
                      h.isDoor = true;
                      h.doorSlide = DoorOpen.LEFT;
                      h.doorOpen = open;
                      solidWallDist = doorDist;
                    }
                    break;
                  }
                  // Else offset > 1.0 - open: passes through open gap! Continue DDA.
                } else {
                  // Vertical slide (1 = up into ceiling, 2 = down into floor)
                  if (open < 0.99) {
                    if (hitCount < pool.length) {
                      const h = pool[hitCount++];
                      h.wallType = adjustedTileId;
                      h.distance = doorDist;
                      h.hitX = stepX > 0 ? offset : 1.0 - offset;
                      h.side = 0;
                      h.mapX = mapX;
                      h.mapY = mapY;
                      h.rayDirX = rayDirX;
                      h.rayDirY = rayDirY;
                      h.isDoor = true;
                      h.doorSlide = DoorOpen.UP;
                      h.doorOpen = open;

                      if (open <= 0.01) {
                        solidWallDist = doorDist;
                        break;
                      }
                    }
                  }
                }
              }
            }
          } else {
            // East-West door: plane is in the center at y = mapY + 0.5
            if (Math.abs(rayDirY) > 1e-6) {
              const doorDist = (sideDistY - deltaDistY) + 0.5 * deltaDistY;
              const hitXCoord = this.player.x + doorDist * rayDirX;
              const offset = hitXCoord - mapX;

              const hitDoor = doorDist > 0 && (side === 1 || doorDist >= dist) && offset >= 0 && offset <= 1;

              if (hitDoor) {
                if (slideMode === 3) {
                  // Sliding right along X axis (gap on left offset < open)
                  if (offset >= open) {
                    if (hitCount < pool.length) {
                      const h = pool[hitCount++];
                      h.wallType = adjustedTileId;
                      h.distance = doorDist;
                      const texX = offset - open;
                      h.hitX = stepY > 0 ? 1.0 - texX : texX;
                      h.side = 1;
                      h.mapX = mapX;
                      h.mapY = mapY;
                      h.rayDirX = rayDirX;
                      h.rayDirY = rayDirY;
                      h.isDoor = true;
                      h.doorSlide = DoorOpen.RIGHT;
                      h.doorOpen = open;
                      solidWallDist = doorDist;
                    }
                    break;
                  }
                } else if (slideMode === 0) {
                  // Sliding left along X axis (gap on right offset > 1.0 - open)
                  if (offset <= 1.0 - open) {
                    if (hitCount < pool.length) {
                      const h = pool[hitCount++];
                      h.wallType = adjustedTileId;
                      h.distance = doorDist;
                      const texX = offset + open;
                      h.hitX = stepY > 0 ? 1.0 - texX : texX;
                      h.side = 1;
                      h.mapX = mapX;
                      h.mapY = mapY;
                      h.rayDirX = rayDirX;
                      h.rayDirY = rayDirY;
                      h.isDoor = true;
                      h.doorSlide = DoorOpen.LEFT;
                      h.doorOpen = open;
                      solidWallDist = doorDist;
                    }
                    break;
                  }
                } else {
                  // Vertical slide (1 = up into ceiling, 2 = down into floor)
                  if (open < 0.99) {
                    if (hitCount < pool.length) {
                      const h = pool[hitCount++];
                      h.wallType = adjustedTileId;
                      h.distance = doorDist;
                      h.hitX = stepY > 0 ? 1.0 - offset : offset;
                      h.side = 1;
                      h.mapX = mapX;
                      h.mapY = mapY;
                      h.rayDirX = rayDirX;
                      h.rayDirY = rayDirY;
                      h.isDoor = true;
                      h.doorSlide = DoorOpen.UP;
                      h.doorOpen = open;

                      if (open <= 0.01) {
                        solidWallDist = doorDist;
                        break;
                      }
                    }
                  }
                }
              }
            }
          }
        } else if (hitCount < pool.length) {
          const h = pool[hitCount++];
          h.wallType = adjustedTileId;
          h.distance = dist;
          h.hitX = hitX;
          h.side = side;
          h.mapX = mapX;
          h.mapY = mapY;
          h.rayDirX = rayDirX;
          h.rayDirY = rayDirY;
          h.isDoor = false;
          h.doorSlide = undefined;
          h.doorOpen = undefined;
          solidWallDist = dist;
          break;
        }
      }
    }

    // Only test frustum-visible thin walls that are in front of the solid wall
    for (const wall of this.activeThinWalls) {
      if (wall.minCol !== undefined && wall.maxCol !== undefined && (column < wall.minCol || column > wall.maxCol)) continue;

      const x1 = wall.x1;
      const y1 = wall.y1;
      const x2 = wall.x2;
      const y2 = wall.y2;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const denominator = dx * rayDirY - dy * rayDirX;
      if (Math.abs(denominator) < 0.0001) continue;

      const u =
        ((this.player.x - x1) * dy - (this.player.y - y1) * dx) / denominator;

      // OCCLUSION CULLING: Skip thin walls that are behind the solid wall
      if (u >= solidWallDist || u < 0.01) continue;

      const t =
        ((this.player.x - x1) * rayDirY - (this.player.y - y1) * rayDirX) /
        denominator;

      if (t >= 0 && t <= 1 && hitCount < pool.length) {
        const hitPosX = this.player.x + u * rayDirX;
        const hitPosY = this.player.y + u * rayDirY;

        const h = pool[hitCount++];
        h.wallType = wall.texture;
        h.distance = u;
        h.hitX = t;
        h.side = 2;
        h.mapX = Math.floor(hitPosX);
        h.mapY = Math.floor(hitPosY);
        h.rayDirX = rayDirX;
        h.rayDirY = rayDirY;
        h.orientation = wall.orientation;
        h.isDoor = false;
        h.doorSlide = undefined;
        h.doorOpen = undefined;
      }
    }

    // Sort hits descending by distance using insertion sort
    for (let i = 1; i < hitCount; i++) {
      const item = pool[i];
      let j = i - 1;
      while (j >= 0 && pool[j].distance < item.distance) {
        const temp = pool[j + 1];
        pool[j + 1] = pool[j];
        pool[j] = temp;
        j--;
      }
    }

    if (hitCount > this.MAX_HITS_PER_COLUMN) {
      hitCount = this.MAX_HITS_PER_COLUMN;
    }

    const minDistance = 0.05;
    for (let i = 1; i < hitCount; i++) {
      if (pool[i - 1].distance - pool[i].distance < minDistance) {
        const removed = pool[i];
        for (let k = i; k < hitCount - 1; k++) {
          pool[k] = pool[k + 1];
        }
        pool[hitCount - 1] = removed;
        hitCount--;
        i--;
      }
    }

    return hitCount;
  }



  private renderScene() {
    const screenW = gameConfig.width;
    const screenH = gameConfig.height;

    if (this.graphicsUsed) {
      this.graphics.clear();
      this.graphicsUsed = false;
    }

    // 1. Frustum cull thin walls before casting rays
    this.cullThinWalls();

    // 2. Raycast all columns to get hits and calculate wall occlusion bounds
    for (let i = 0; i < screenW; i++) {
      const hitCount = this.castRay(i);
      this.hitCounts[i] = hitCount;
      const pool = this.hitPool[i];

      let solidDist = this.MAX_RENDER_DISTANCE;
      let doorDist = this.MAX_RENDER_DISTANCE;
      let doorBottom = screenH;

      let minDrawStart = screenH;
      let maxDrawEnd = 0;

      for (let j = 0; j < hitCount; j++) {
        const ray = pool[j];

        // Thin walls (side === 2) are transparent barriers and must NEVER occlude floor or ceiling
        if (ray.side === 2) {
          continue;
        }

        const flatIdx = ray.mapY * this.mapWidth + ray.mapX;
        const tileFlag = this.tileTypeFlags[flatIdx];

        if (ray.isDoor && tileFlag === RaycastScene.TILE_DOOR) {
          // Fix: Use the specific doorOpen state attached to THIS ray hit, 
          // not just the global flat map, so multiple doors in the same view render their own individual states independently.
          const open = ray.doorOpen !== undefined ? ray.doorOpen : Math.abs(this.doorStatesFlat[flatIdx]);
          
          if (ray.doorSlide === DoorOpen.UP) {
            // Vertical sliding door is opening/open: uncovering from bottom up!
            if (open > 0.01) {
              const dLineH = screenH / Math.max(0.2, ray.distance);
              const dFloorY = dLineH / 2 + screenH / 2;
              const dTop = -dLineH / 2 + screenH / 2;
              const doorPanelBottom = Math.max(dTop, dFloorY - open * dLineH);

              // Update the closest door bounds buffer for entity culling (only if this door is closer)
              if (ray.distance < doorDist) {
                doorDist = ray.distance;
                doorBottom = doorPanelBottom;
              }
            } else {
              // Door is fully closed, it acts exactly like a solid wall
              const lineHeight = screenH / Math.max(0.2, ray.distance);
              const drawStart = -lineHeight / 2 + screenH / 2;
              const drawEnd = lineHeight / 2 + screenH / 2;
              minDrawStart = Math.min(minDrawStart, drawStart);
              maxDrawEnd = Math.max(maxDrawEnd, drawEnd);
            }
          } else {
            // Horizontal door handling
            if (open < 0.05) {
              const lineHeight = screenH / Math.max(0.2, ray.distance);
              const drawStart = -lineHeight / 2 + screenH / 2;
              const drawEnd = lineHeight / 2 + screenH / 2;
              minDrawStart = Math.min(minDrawStart, drawStart);
              maxDrawEnd = Math.max(maxDrawEnd, drawEnd);
            }
          }
        } else if (tileFlag !== RaycastScene.TILE_THIN && !ray.isDoor) {
          // Standard solid wall block
          const lineHeight = screenH / Math.max(0.2, ray.distance);
          const drawStart = -lineHeight / 2 + screenH / 2;
          const drawEnd = lineHeight / 2 + screenH / 2;
          minDrawStart = Math.min(minDrawStart, drawStart);
          maxDrawEnd = Math.max(maxDrawEnd, drawEnd);
        }
      }

      // To find the closest solid opaque wall or closed door (for zBuffer)
      for (let j = hitCount - 1; j >= 0; j--) {
        const ray = pool[j];
        if (ray.side !== 2) { // Skip thin walls, since thin walls have transparency and are depth-sorted
          if (ray.isDoor) {
            const open = ray.doorOpen !== undefined ? ray.doorOpen : 0;
            if (open <= 0.01) { // Fully closed door blocks everything behind it
              solidDist = ray.distance;
              break;
            }
            // If open, we look THROUGH it to the next solid obstacle
          } else {
            solidDist = ray.distance; // Solid wall block
            break;
          }
        }
      }

      this.zBuffer[i] = solidDist;
      this.doorDistBuffer[i] = doorDist;
      this.doorBottomBuffer[i] = doorBottom;

      this.wallTop[i] = Math.max(0, Math.floor(minDrawStart));
      this.wallBottom[i] = Math.min(screenH, Math.ceil(maxDrawEnd));
    }

    // Compute global row-skip bounds for floor/ceiling early termination
    let gMinTop = screenH;
    let gMaxTop = 0;
    let gMinBot = screenH;
    let gMaxBot = 0;
    for (let i = 0; i < screenW; i++) {
      const top = this.wallTop[i];
      const bot = this.wallBottom[i];
      if (top < gMinTop) gMinTop = top;
      if (top > gMaxTop) gMaxTop = top;
      if (bot < gMinBot) gMinBot = bot;
      if (bot > gMaxBot) gMaxBot = bot;
    }
    this.globalMinWallTop = gMinTop;
    this.globalMaxWallTop = gMaxTop;
    this.globalMinWallBottom = gMinBot;
    this.globalMaxWallBottom = gMaxBot;

    // Upload per-column wall occlusion bounds (R = top / screenH, G = bottom / screenH)
    const bounds = this.wallBoundsData;
    for (let i = 0; i < screenW; i++) {
      const idx = i * 4;
      const top = this.wallTop[i];
      const bot = this.wallBottom[i];
      if (bot > top) {
        bounds[idx] = Math.min(255, Math.ceil((top / screenH) * 255));
        bounds[idx + 1] = Math.max(0, Math.floor((bot / screenH) * 255));
      } else {
        bounds[idx] = 255;
        bounds[idx + 1] = 0;
      }
    }
    this.wallBoundsTexture.baseTexture.update();

    // 3. Update GPU floor/ceiling GLSL shader uniforms (rendered natively in background mesh)
    this.uPlayerPosUniform[0] = this.player.x;
    this.uPlayerPosUniform[1] = this.player.y;
    this.uDirUniform[0] = this.player.dirX;
    this.uDirUniform[1] = this.player.dirY;
    this.uPlaneUniform[0] = this.player.planeX;
    this.uPlaneUniform[1] = this.player.planeY;

    // 4. Render wall column sprites with viewport culling (back to front order)
    for (let i = 0; i < screenW; i++) {
      const hitCount = this.hitCounts[i];
      const pool = this.hitPool[i];
      const colSprites = this.spritePool[i];
      const thinSprites = this.thinWallSpritePool[i];
      const prevSolidCount = this.prevHitCounts[i];
      const prevThinCount = this.prevThinHitCounts[i];

      let solidIdx = 0;
      let thinIdx = 0;

      // Render wall column slices back-to-front (j = 0 is farthest hit, hitCount - 1 is closest)
      for (let j = 0; j < hitCount; j++) {
        const ray = pool[j];
        const lineHeight = screenH / Math.max(0.2, ray.distance);
        let drawStart = -lineHeight / 2 + screenH / 2;
        let drawEnd = lineHeight / 2 + screenH / 2;

        const tileType = this.tileTypes[ray.wallType + 1];
        const isActualDoor = ray.isDoor === true && ray.side !== 2 && tileType === "door";

        if (isActualDoor && ray.doorOpen !== undefined && ray.doorOpen > 0) {
          if (ray.doorSlide === DoorOpen.UP) {
            const floorY = drawEnd;
            drawEnd = Math.max(drawStart, floorY - ray.doorOpen * lineHeight);
          }
        }

        const isThinWall = ray.side === 2;
        const origDrawStart = drawStart;
        const origLineHeight = lineHeight;

        if (isThinWall) {
          // Check if any opaque wall or door in front of this thin wall occludes it
          let occluded = false;
          for (let k = j + 1; k < hitCount; k++) {
            const closer = pool[k];
            if (closer.side === 2) continue; // Another thin wall doesn't fully occlude

            const closerTileType = this.tileTypes[closer.wallType + 1];
            const isCloserDoor = closer.isDoor === true && closer.side !== 2 && closerTileType === "door";

            if (!isCloserDoor) {
              // Solid wall in front of this thin wall -> completely occluded!
              occluded = true;
              break;
            } else {
              // Door in front of this thin wall
              const dFlatIdx = closer.mapY * this.mapWidth + closer.mapX;
              const dOpen = closer.doorOpen !== undefined
                ? closer.doorOpen
                : Math.abs(this.doorStatesFlat[dFlatIdx]);

              if (closer.doorSlide === DoorOpen.UP) {
                // Vertical sliding door: metal panel covers top down to doorPanelBottom
                const dLineH = screenH / closer.distance;
                const dFloorY = dLineH / 2 + screenH / 2;
                const dTop = -dLineH / 2 + screenH / 2;
                const doorPanelBottom = Math.max(dTop, dFloorY - dOpen * dLineH);

                drawStart = Math.max(drawStart, doorPanelBottom);
                if (drawStart >= drawEnd) {
                  occluded = true;
                  break;
                }
              } else {
                // Horizontal sliding door: solid panel blocks completely
                occluded = true;
                break;
              }
            }
          }
          if (occluded || drawEnd <= drawStart) continue;
        }

        // Viewport culling: skip drawing if wall slice is outside the screen bounds
        if (drawEnd <= 0 || drawStart >= screenH || drawEnd <= drawStart) continue;

        let sprite: Sprite | null = null;
        if (isThinWall) {
          if (thinIdx < thinSprites.length) {
            sprite = thinSprites[thinIdx++];
            if (!sprite.parent) this.thinWallContainer.addChild(sprite);
          }
        } else {
          if (solidIdx < colSprites.length) {
            sprite = colSprites[solidIdx++];
            if (!sprite.parent) this.wallContainer.addChild(sprite);
          }
        }
        if (!sprite) continue;

        const slices = this.columnTextures[ray.wallType];

        if (slices && slices.length > 0) {
          const clampedTexX = Math.min(
            Math.max(0, Math.floor(ray.hitX * slices.length)),
            slices.length - 1
          );

          if (isThinWall && drawStart > origDrawStart) {
            const texH = slices[clampedTexX].baseTexture.height || 64;
            const clipRatio = Math.max(0, Math.min(1, (drawStart - origDrawStart) / origLineHeight));
            const thinTex = this.thinWallColumnTextures[i][j];
            thinTex.baseTexture = slices[clampedTexX].baseTexture;
            thinTex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
            thinTex.baseTexture.mipmap = MIPMAP_MODES.OFF;

            const srcY = Math.min(texH - 1, Math.floor(clipRatio * texH));
            const srcH = Math.max(1, texH - srcY);

            const origFrame = slices[clampedTexX].frame;
            thinTex.frame.x = origFrame.x;
            thinTex.frame.y = origFrame.y + srcY;
            thinTex.frame.width = 1;
            thinTex.frame.height = srcH;
            thinTex.updateUvs();
            const realW = thinTex.baseTexture.realWidth || 64;
            const uThin = (origFrame.x + 0.5) / realW;
            thinTex._uvs.x0 = uThin;
            thinTex._uvs.x1 = uThin;
            thinTex._uvs.x2 = uThin;
            thinTex._uvs.x3 = uThin;
            thinTex._uvs.uvsFloat32[0] = uThin;
            thinTex._uvs.uvsFloat32[2] = uThin;
            thinTex._uvs.uvsFloat32[4] = uThin;
            thinTex._uvs.uvsFloat32[6] = uThin;

            sprite.texture = thinTex;
          } else if (isActualDoor && ray.doorSlide === DoorOpen.UP) {
            const texH = slices[clampedTexX].baseTexture.height || 64;
            const open = ray.doorOpen ?? 0;
            const doorTex = this.doorColumnTextures[i][j];
            doorTex.baseTexture = slices[clampedTexX].baseTexture;
            doorTex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
            doorTex.baseTexture.mipmap = MIPMAP_MODES.OFF;

            const srcY = Math.min(texH - 1, Math.floor(open * texH));
            const srcH = Math.max(1, texH - srcY);

            const origFrame = slices[clampedTexX].frame;
            doorTex.frame.x = origFrame.x;
            doorTex.frame.y = origFrame.y + srcY;
            doorTex.frame.width = 1;
            doorTex.frame.height = srcH;
            doorTex.updateUvs();
            const realW = doorTex.baseTexture.realWidth || 64;
            const uDoor = (origFrame.x + 0.5) / realW;
            doorTex._uvs.x0 = uDoor;
            doorTex._uvs.x1 = uDoor;
            doorTex._uvs.x2 = uDoor;
            doorTex._uvs.x3 = uDoor;
            doorTex._uvs.uvsFloat32[0] = uDoor;
            doorTex._uvs.uvsFloat32[2] = uDoor;
            doorTex._uvs.uvsFloat32[4] = uDoor;
            doorTex._uvs.uvsFloat32[6] = uDoor;

            sprite.texture = doorTex;
          } else {
            sprite.texture = slices[clampedTexX];
          }

          if (isThinWall) {
            const newZ = Math.floor((this.MAX_RENDER_DISTANCE - ray.distance) * 1000);
            if (sprite.zIndex !== newZ) {
              sprite.zIndex = newZ;
            }
          }
          const rDrawStart = Math.floor(drawStart);
          const rDrawEnd = Math.ceil(drawEnd);
          sprite.y = rDrawStart;
          sprite.height = Math.max(1, rDrawEnd - rDrawStart);
          sprite.width = 1;
          sprite.visible = true;
          sprite.tint =
            ray.side === 0
              ? 0xaaaaaa
              : tileType === "door"
              ? 0xffffff
              : 0xcccccc;
        } else {
          sprite.visible = false;
          this.graphicsUsed = true;
          this.graphics.beginFill(ray.side === 0 ? 0x666666 : 0x999999);
          this.graphics.drawRect(i, drawStart, 1, drawEnd - drawStart);
          this.graphics.endFill();
        }
      }

      // Hide unused sprites
      for (let s = solidIdx; s < prevSolidCount; s++) {
        colSprites[s].visible = false;
      }
      for (let s = thinIdx; s < prevThinCount; s++) {
        thinSprites[s].visible = false;
      }
      this.prevHitCounts[i] = solidIdx;
      this.prevThinHitCounts[i] = thinIdx;
    }

    // 5. Render billboard pickups, breakables & detonators with Z-buffer occlusion
    this.mapObjects.length = 0;
    const pickupObjects = this.pickupManager.getVisibleMapObjects();
    for (let i = 0; i < pickupObjects.length; i++) this.mapObjects.push(pickupObjects[i]);
    if (this.breakableManager) {
      const breakables = this.breakableManager.getVisibleMapObjects();
      for (let i = 0; i < breakables.length; i++) this.mapObjects.push(breakables[i]);
    }
    if (this.detonatorManager) {
      const detonators = this.detonatorManager.getVisibleMapObjects();
      for (let i = 0; i < detonators.length; i++) this.mapObjects.push(detonators[i]);
    }
    this.renderObjects();

    // 6. Render animated pickups (keycards) with AnimatedSprite & Z-buffer occlusion
    this.pickupManager.render(
      this.player.x,
      this.player.y,
      this.player.dirX,
      this.player.dirY,
      this.player.planeX,
      this.player.planeY,
      this.zBuffer,
      this.MAX_RENDER_DISTANCE,
      this.doorDistBuffer,
      this.doorBottomBuffer
    );

    // 7. Render animated enemy sprites with hardware rotation & Z-buffer occlusion
    this.enemyManager.render(
      this.player.x,
      this.player.y,
      this.player.dirX,
      this.player.dirY,
      this.player.planeX,
      this.player.planeY,
      this.zBuffer,
      this.MAX_RENDER_DISTANCE,
      this.doorDistBuffer,
      this.doorBottomBuffer
    );

    // 8. Render 8-directional stationary objects (e.g. holotables) with Z-buffer occlusion
    if (this.stationaryObjectManager) {
      this.stationaryObjectManager.render(
        this.player.x,
        this.player.y,
        this.player.dirX,
        this.player.dirY,
        this.player.planeX,
        this.player.planeY,
        this.zBuffer,
        this.MAX_RENDER_DISTANCE,
        this.doorDistBuffer,
        this.doorBottomBuffer
      );
    }

    // 8.5 Render friendly allies (e.g. rescued prisoner) with hardware rotation & Z-buffer occlusion
    if (this.allyManager) {
      this.allyManager.render(
        this.player.x,
        this.player.y,
        this.player.dirX,
        this.player.dirY,
        this.player.planeX,
        this.player.planeY,
        this.zBuffer,
        this.MAX_RENDER_DISTANCE,
        this.doorDistBuffer,
        this.doorBottomBuffer
      );
    }

    // 8. Render animated 3D explosions with perspective & Z-buffer occlusion
    if (this.detonatorManager) {
      this.detonatorManager.renderExplosions(
        this.player.x,
        this.player.y,
        0,
        this.player.dirX,
        this.player.dirY,
        this.player.planeX,
        this.player.planeY,
        this.zBuffer,
        this.MAX_RENDER_DISTANCE
      );
    }

    // 9. Render flying 3D laser bolts with perspective & Z-buffer occlusion
    if (this.laserManager) {
      this.laserManager.render(
        this.player.x,
        this.player.y,
        this.player.dirX,
        this.player.dirY,
        this.player.planeX,
        this.player.planeY,
        this.zBuffer,
        this.MAX_RENDER_DISTANCE
      );
    }
  }

  private static compareObjects(a: MapObject, b: MapObject): number {
    return (b.distance ?? 0) - (a.distance ?? 0);
  }

  private renderObjects(): void {
    if (this.mapObjects.length === 0) {
      for (let i = 0; i < this.objectSpritePoolIndex; i++) {
        this.objectSpritePool[i].visible = false;
      }
      this.objectSpritePoolIndex = 0;
      return;
    }

    const screenW = gameConfig.width;
    const screenH = gameConfig.height;
    const posX = this.player.x;
    const posY = this.player.y;
    const planeX = this.player.planeX;
    const planeY = this.player.planeY;
    const dirX = this.player.dirX;
    const dirY = this.player.dirY;

    // 1. Calculate squared distance from player to each object
    for (let i = 0; i < this.mapObjects.length; i++) {
      const obj = this.mapObjects[i];
      const dx = obj.x - posX;
      const dy = obj.y - posY;
      obj.distance = dx * dx + dy * dy;
    }

    // 2. Sort objects from farthest to closest (Painter's algorithm)
    this.mapObjects.sort(RaycastScene.compareObjects);

    let poolIdx = 0;
    const invDet = 1.0 / (planeX * dirY - dirX * planeY);

    for (let i = 0; i < this.mapObjects.length; i++) {
      const obj = this.mapObjects[i];
      const spriteX = obj.x - posX;
      const spriteY = obj.y - posY;

      // Transform sprite position into camera space
      const transformX = invDet * (dirY * spriteX - dirX * spriteY);
      const transformY = invDet * (-planeY * spriteX + planeX * spriteY); // depth in front of camera

      // Frustum culling: must be in front of player and within max render distance
      if (transformY <= 0.1 || transformY > this.MAX_RENDER_DISTANCE) continue;

      const spriteScreenX = Math.floor(
        (screenW / 2) * (1 + transformX / transformY)
      );

      const texture = obj.customTexture ?? this.textures[obj.texture];
      const slices = obj.customSlices ?? this.columnTextures[obj.texture];
      if (!texture || !slices || slices.length === 0) continue;

      const meta = this.tileMeta[obj.texture];
      const texW = texture.width || 64;
      const texH = texture.height || 64;
      const aspectRatio = texW / texH;

      // Base wall height projected at this depth
      const baseHeight = Math.abs(Math.floor(screenH / transformY));

      // Resolve scale:
      // Priority 1: Object instance scale (from Tiled object layer)
      // Priority 2: Pickup config scale (from code configs)
      // Priority 3: Tile metadata scale (from Tiled tileset custom property)
      // Priority 4: Automatic image size scaling (relative to 512px standard wall)
      let effectiveScaleY =
        obj.scaleY ??
        obj.scale ??
        obj.pickupRef?.scaleY ??
        obj.pickupRef?.scale ??
        obj.pickupRef?.config?.scaleY ??
        obj.pickupRef?.config?.scale ??
        meta?.scaleY ??
        meta?.scale;
      let effectiveScaleX =
        obj.scaleX ??
        obj.scale ??
        obj.pickupRef?.scaleX ??
        obj.pickupRef?.scale ??
        obj.pickupRef?.config?.scaleX ??
        obj.pickupRef?.config?.scale ??
        meta?.scaleX ??
        meta?.scale;

      if (effectiveScaleY === undefined) {
        // Automatic scaling based on image size
        if (texH <= 128) {
          effectiveScaleY = texH / 512;
        } else if (texH <= 256) {
          effectiveScaleY = texH / 512;
        } else {
          // For high-res pickup icons/weapons without explicit scale, default to 0.35 (realistic pickup size)
          effectiveScaleY = 0.35;
        }
      }
      if (effectiveScaleX === undefined) {
        effectiveScaleX = effectiveScaleY;
      }

      // Calculate sprite dimensions on screen (preserving aspect ratio and scale)
      const spriteHeight = Math.max(1, Math.floor(baseHeight * effectiveScaleY));
      const spriteWidth = Math.max(1, Math.floor(baseHeight * effectiveScaleX * aspectRatio));

      // Vertical positioning & anchor:
      // "floor" (default for pickups/items) sits cleanly on the floor
      // "ceiling" attaches to the ceiling (e.g. lamps, chandeliers)
      // "center" floats at player eye-level
      // z / elevation: exact height factor between 0.0 (floor) and 1.0 (ceiling)
      const anchor = (
        obj.anchor ??
        obj.pickupRef?.anchor ??
        obj.pickupRef?.config?.anchor ??
        meta?.anchor ??
        (effectiveScaleY < 0.8 ? "floor" : "center")
      ).toLowerCase();
      const z = obj.z ?? obj.pickupRef?.z ?? obj.pickupRef?.config?.z ?? meta?.z;
      const vOffset =
        obj.vOffset ??
        obj.pickupRef?.vOffset ??
        obj.pickupRef?.config?.vOffset ??
        meta?.vOffset ??
        0;

      const floorY = Math.floor(screenH / 2 + baseHeight / 2);
      const ceilingY = Math.floor(screenH / 2 - baseHeight / 2);
      const centerY = Math.floor(screenH / 2);

      let drawStartY: number;
      let drawEndY: number;

      if (z !== undefined) {
        // Explicit elevation / z from 0.0 (floor) to 1.0 (ceiling)
        const baseline = floorY - z * baseHeight;
        if (anchor === "ceiling" || anchor === "top") {
          drawStartY = Math.floor(baseline);
          drawEndY = drawStartY + spriteHeight;
        } else if (anchor === "center" || anchor === "middle" || anchor === "eye") {
          drawStartY = Math.floor(baseline - spriteHeight / 2);
          drawEndY = Math.floor(baseline + spriteHeight / 2);
        } else {
          // Default: bottom of sprite sits at z elevation
          drawEndY = Math.floor(baseline);
          drawStartY = drawEndY - spriteHeight;
        }
      } else if (anchor === "ceiling" || anchor === "top") {
        // Attach top of sprite to the ceiling line
        drawStartY = ceilingY;
        drawEndY = ceilingY + spriteHeight;
      } else if (anchor === "floor" || anchor === "bottom" || anchor === "ground") {
        // Sit bottom of sprite on the floor line
        drawEndY = floorY;
        drawStartY = floorY - spriteHeight;
      } else {
        // Centered vertically around player eye level (screen center)
        drawStartY = Math.floor(centerY - spriteHeight / 2);
        drawEndY = Math.floor(centerY + spriteHeight / 2);
      }

      // Apply vertical offset in world units relative to base wall height (+ moves down, - moves up)
      if (vOffset !== 0) {
        const offsetPixels = Math.floor(vOffset * baseHeight);
        drawStartY += offsetPixels;
        drawEndY += offsetPixels;
      }

      const actualHeight = drawEndY - drawStartY;
      if (actualHeight <= 0) continue;

      const drawStartX = Math.floor(spriteScreenX - spriteWidth / 2);
      const drawEndX = Math.floor(spriteScreenX + spriteWidth / 2);

      const clipStartX = Math.max(0, drawStartX);
      const clipEndX = Math.min(screenW, drawEndX);

      // Distance-based atmospheric depth dimming
      const shade = Math.max(
        0.18,
        Math.min(1.0, 1.0 - (transformY / this.MAX_RENDER_DISTANCE) * 0.75)
      );
      const shadeInt = (shade * 255) | 0;
      const tint = (shadeInt << 16) | (shadeInt << 8) | shadeInt;

      for (let stripe = clipStartX; stripe < clipEndX; stripe++) {
        // Check Z-Buffer: only draw stripe if it is closer than the wall in this column
        if (transformY < this.zBuffer[stripe]) {
          let stripeStartY = drawStartY;
          if (this.doorDistBuffer[stripe] < transformY) {
            stripeStartY = Math.max(drawStartY, Math.floor(this.doorBottomBuffer[stripe]));
          }
          if (stripeStartY >= drawEndY) continue;

          const texX = Math.floor(
            ((stripe - drawStartX) * texW) / spriteWidth
          );
          const clampedTexX = Math.min(Math.max(0, texX), slices.length - 1);
          const sliceIndex = obj.flipX ? slices.length - 1 - clampedTexX : clampedTexX;

          let sprite: Sprite;
          if (poolIdx < this.objectSpritePool.length) {
            sprite = this.objectSpritePool[poolIdx];
            if (!sprite.parent) this.objectContainer.addChild(sprite);
          } else {
            sprite = new Sprite();
            sprite.width = 1;
            sprite.roundPixels = true;
            this.objectContainer.addChild(sprite);
            this.objectSpritePool.push(sprite);
          }
          poolIdx++;

          sprite.texture = slices[sliceIndex];
          sprite.x = stripe;
          sprite.y = stripeStartY;
          sprite.width = 1;
          sprite.height = Math.max(1, drawEndY - stripeStartY);
          sprite.tint = obj.tint ?? tint;
          const newZ = Math.floor((this.MAX_RENDER_DISTANCE - transformY) * 1000);
          if (sprite.zIndex !== newZ) {
            sprite.zIndex = newZ;
          }
          sprite.visible = true;
        }
      }
    }

    // Hide any unused sprites from previous frames
    for (let i = poolIdx; i < this.objectSpritePoolIndex; i++) {
      this.objectSpritePool[i].visible = false;
    }
    this.objectSpritePoolIndex = poolIdx;
  }

  public setPlayerPosition(x: number, y: number, dirX: number, dirY: number): void {
    this.player.x = x;
    this.player.y = y;
    const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1.0;
    const nx = dirX / len;
    const ny = dirY / len;
    this.player.dirX = nx;
    this.player.dirY = ny;
    this.player.planeX = -ny * 0.8;
    this.player.planeY = nx * 0.8;

    this.uPlayerPosUniform[0] = this.player.x;
    this.uPlayerPosUniform[1] = this.player.y;
    this.uDirUniform[0] = this.player.dirX;
    this.uDirUniform[1] = this.player.dirY;
    this.uPlaneUniform[0] = this.player.planeX;
    this.uPlaneUniform[1] = this.player.planeY;

    // Teleport any following allies with the player to the new stair landing
    if (this.allyManager) {
      this.allyManager.teleportFollowingAllies(
        this.player.x,
        this.player.y,
        nx,
        ny,
        this.mapFlat,
        this.mapWidth,
        this.mapHeight
      );
    }
  }

  public getPlayer(): { x: number; y: number; dirX: number; dirY: number; planeX: number; planeY: number } {
    return this.player;
  }

  /**
   * Resolves grid-space positions for the current active objective so it can be
   * displayed on the minimap without revealing fog-of-war tiles around it.
   */
  private getActiveObjectiveMarkers(): IMinimapObjectiveMarker[] {
    const activeObj = this.missionManager?.getObjectiveManager().getCurrentActiveObjective();
    if (!activeObj) return [];

    const targetKey = activeObj.key.trim().toLowerCase();
    const markers: IMinimapObjectiveMarker[] = [];

    for (const trigger of this.missionManager?.getTriggers() || []) {
      if (
        !trigger.hasTriggered &&
        (trigger.isObjective || Boolean(trigger.objectiveKey)) &&
        trigger.objectiveKey?.trim().toLowerCase() === targetKey
      ) {
        markers.push({
          x: (trigger.minX + trigger.maxX) / 2,
          y: (trigger.minY + trigger.maxY) / 2,
        });
      }
    }

    for (const b of this.breakableManager?.getBreakables() || []) {
      if (
        !b.isBroken &&
        (b.isObjective || Boolean(b.objectiveKey)) &&
        b.objectiveKey?.trim().toLowerCase() === targetKey
      ) {
        markers.push({
          x: b.x,
          y: b.y,
        });
      }
    }

    for (const wall of this.destructableWallManager?.getWalls() || []) {
      if (
        wall.isActive() &&
        (wall.isObjective || Boolean(wall.objectiveKey)) &&
        wall.objectiveKey?.trim().toLowerCase() === targetKey
      ) {
        markers.push({
          x: (wall.x1 + wall.x2) / 2,
          y: (wall.y1 + wall.y2) / 2,
        });
      }
    }

    if (
      markers.length === 0 &&
      this.levelFinishZones.length > 0 &&
      (targetKey === "escape" ||
        targetKey.startsWith("escape_") ||
        targetKey === "reach_elevator" ||
        targetKey === "reach_exit" ||
        targetKey.includes("extraction"))
    ) {
      const enabledZones = this.levelFinishZones.filter((z) => z.enabled !== false);
      const zonesToShow = enabledZones.length > 0 ? enabledZones : this.levelFinishZones;
      for (const z of zonesToShow) {
        markers.push({
          x: (z.x1 + z.x2) / 2,
          y: (z.y1 + z.y2) / 2,
        });
      }
    }

    return markers;
  }

  public getHUD(): RaycastHUD {
    return this.hud;
  }

  public getWorldContainer(): Container {
    return this.worldContainer;
  }

  public getWeaponView(): RaycastWeaponView {
    return this.weaponView;
  }

  public getDestructableWallManager(): DestructableWallManager {
    return this.destructableWallManager;
  }

  public getBreakableManager(): RaycastBreakableManager {
    return this.breakableManager;
  }

  public getStairsManager(): RaycastStairsManager {
    return this.stairsManager;
  }

  public getPlayerRadius(): number {
    return this.playerRadius;
  }

  public setPlayerRadius(radius: number): void {
    this.playerRadius = Math.max(0.1, radius);
  }
}
