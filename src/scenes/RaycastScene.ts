import {
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
  Ticker,
  Assets,
  TilingSprite,
} from "pixi.js";
import { sound } from "@pixi/sound";
import { BaseScene } from "./BaseScene";
import { gameConfig } from "../configs/GameConfig";
import { MobileControls } from "../ui/MobileControls";
import { MapObject, TileMeta } from "./raycast/types";
import { RaycastPickupManager } from "./raycast/RaycastPickupManager";
import { RaycastBreakableManager } from "./raycast/RaycastBreakableManager";
import { RaycastWeaponView } from "./raycast/RaycastWeaponView";
import { RaycastHUD } from "./raycast/RaycastHUD";
import { RaycastPlayerController } from "./raycast/RaycastPlayerController";
import { RaycastEnemyManager } from "./raycast/RaycastEnemyManager";
import { DestructableWallManager } from "./raycast/DestructableWallManager";
import { ThermalDetonatorManager } from "./raycast/ThermalDetonatorManager";
import { RaycastWeaponType } from "../enums/RaycastWeaponType";
import { RaycastPickupType } from "../enums/RaycastPickupType";
import { DoorSlideMode, DoorOpen, TileType } from "./raycast/types";

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

interface RawTextureData {
  width: number;
  height: number;
  pixels: Uint32Array;
  isPow2: boolean;
  maskX: number;
  maskY: number;
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
  };
  private graphics: Graphics;
  private textures: Record<number, Texture> = {};
  private columnTextures: Record<number, Texture[]> = {};
  private moveSpeed: number = 0.02;
  private rotSpeed: number = 0.05;
  private mouseSensitivity: number = 0.002;
  private map: number[][];
  private floorMap: number[][];
  private ceilingMap: number[][];
  private mapWidth: number;
  private mapHeight: number;
  private doorStates: Record<string, number> = {};
  private thinWalls: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    texture: number;
    orientation: "vertical" | "horizontal";
  }> = [];
  private activeThinWalls: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    texture: number;
    orientation: "vertical" | "horizontal";
  }> = [];
  private spritePool: Sprite[][] = [];
  private hitPool: RayHit[][] = [];
  private readonly MAX_HITS_PER_COLUMN: number = 6;
  private readonly MAX_RENDER_DISTANCE: number = 30;
  private tileTypes: Record<number, string> = {};
  private tileMeta: Record<number, TileMeta> = {};
  private rawTextureData: Record<number, RawTextureData> = {};

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
  private doorColumnTextures: Texture[] = [];

  // Numeric tile type flags (0=empty, 1=thickWall, 2=door, 3=thinWall)
  private static readonly TILE_EMPTY = 0;
  private static readonly TILE_WALL = 1;
  private static readonly TILE_DOOR = 2;
  private static readonly TILE_THIN = 3;
  private tileTypeFlags!: Uint8Array;
  // Flat texture data array indexed by tileId for O(1) lookup
  private rawTexArray: (RawTextureData | undefined)[] = [];
  // Global row-skip bounds
  private globalMinWallTop: number = 0;
  private globalMaxWallBottom: number = 0;

  private wallTop: Int32Array = new Int32Array(gameConfig.width);
  private wallBottom: Int32Array = new Int32Array(gameConfig.width);
  private hitCounts: Int32Array = new Int32Array(gameConfig.width);
  private zBuffer: Float64Array = new Float64Array(gameConfig.width);

  private mapObjects: MapObject[] = [];
  private objectContainer!: Container;
  private objectSpritePool: Sprite[] = [];
  private objectSpritePoolIndex: number = 0;

  private bgCanvas!: HTMLCanvasElement;
  private bgCtx!: CanvasRenderingContext2D;
  private bgImageData!: ImageData;
  private bgBuffer32!: Uint32Array;
  private bgTexture!: Texture;
  private bgSprite!: Sprite;
  private skyBuffer: Uint32Array = new Uint32Array(0);

  private mobileControls!: MobileControls;
  private weaponView!: RaycastWeaponView;
  private hud!: RaycastHUD;
  private playerController!: RaycastPlayerController;
  private pickupManager!: RaycastPickupManager;
  private breakableManager!: RaycastBreakableManager;
  private animatedPickupContainer!: Container;
  private enemyContainer!: Container;
  private enemyManager!: RaycastEnemyManager;
  private destructableWallManager!: DestructableWallManager;
  private detonatorContainer!: Container;
  private detonatorManager!: ThermalDetonatorManager;
  private shakeIntensity: number = 0;
  private shakeDuration: number = 0;
  private lockedDoors: Record<string, string> = {};
  private isLeftMouseDown: boolean = false;
  private isRightMouseDown: boolean = false;

  constructor(stage: Container, scale: number, level: string = "test_level") {
    super(stage, scale);

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
      planeY: 0.8,
    };

    // Background sprite for floor & ceiling/sky rendering (native 1:1 crisp resolution)
    this.bgCanvas = document.createElement("canvas");
    this.bgCanvas.width = gameConfig.width;
    this.bgCanvas.height = gameConfig.height;
    this.bgCtx = this.bgCanvas.getContext("2d", { willReadFrequently: true })!;
    this.bgImageData = this.bgCtx.createImageData(
      gameConfig.width,
      gameConfig.height
    );
    this.bgBuffer32 = new Uint32Array(this.bgImageData.data.buffer);
    this.bgTexture = Texture.from(this.bgCanvas);
    this.bgSprite = new Sprite(this.bgTexture);
    this.bgSprite.width = gameConfig.width;
    this.bgSprite.height = gameConfig.height;
    this.addChild(this.bgSprite);

    this.initSkyGradient();

    this.graphics = new Graphics();
    this.addChild(this.graphics);

    for (let i = 0; i < gameConfig.width; i++) {
      const columnSprites: Sprite[] = [];
      for (let j = 0; j < this.MAX_HITS_PER_COLUMN; j++) {
        const sprite = new Sprite();
        sprite.width = 1;
        sprite.x = i;
        sprite.visible = false;
        this.addChild(sprite);
        columnSprites.push(sprite);
      }
      this.spritePool.push(columnSprites);
      this.doorColumnTextures.push(
        new Texture(Texture.WHITE.baseTexture, new Rectangle(0, 0, 1, 1))
      );

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

    // Container for billboard sprites (rendered on top of wall columns with depth testing)
    this.objectContainer = new Container();
    this.addChild(this.objectContainer);

    for (let i = 0; i < 1000; i++) {
      const sprite = new Sprite();
      sprite.width = 1;
      sprite.visible = false;
      this.objectContainer.addChild(sprite);
      this.objectSpritePool.push(sprite);
    }

    // Container for animated world props (keycards, rotating pickups) with hardware rotation & Z-ordering
    this.animatedPickupContainer = new Container();
    this.animatedPickupContainer.sortableChildren = true;
    this.addChild(this.animatedPickupContainer);

    // Container for animated enemy sprites with hardware rotation & Z-ordering (in 3D world)
    this.enemyContainer = new Container();
    this.enemyContainer.sortableChildren = true;
    this.addChild(this.enemyContainer);

    this.enemyManager = new RaycastEnemyManager(this.enemyContainer);

    // First-person equipped weapon view (rendered in front of 3D world, behind HUD)
    this.weaponView = new RaycastWeaponView();
    this.addChild(this.weaponView);

    // Modern Star Wars HUD (crosshair, health bar, ammo counter, pickup toasts, screen flash)
    this.hud = new RaycastHUD();
    this.addChild(this.hud);

    this.playerController = new RaycastPlayerController(this.weaponView, this.hud);
    this.pickupManager = new RaycastPickupManager(this.animatedPickupContainer);
    this.breakableManager = new RaycastBreakableManager();
    this.destructableWallManager = new DestructableWallManager();

    // 3D Detonator projectile & explosion container
    this.detonatorContainer = new Container();
    this.detonatorContainer.sortableChildren = true;
    this.addChild(this.detonatorContainer);

    this.detonatorManager = new ThermalDetonatorManager(this.detonatorContainer);
    this.detonatorManager.onDetonate = (x, y, z, radius, damage) => {
      this.handleExplosionDetonation(x, y, z, radius, damage);
    };

    // Overlay mobile on-screen controls (only on mobile devices)
    if (this.isMobileDevice()) {
      this.mobileControls = new MobileControls();
      this.mobileControls.on("action", () => this.tryOpenDoor());
      this.mobileControls.on("fire", () => this.tryShoot());
      this.addChild(this.mobileControls);
    }

    this.setupControls();
    this.loadLevel(level).then(() => {
      Ticker.shared.add(this.tick, this);
    });
  }

  private initSkyGradient() {
    const horizon = Math.floor(gameConfig.height / 2);
    this.skyBuffer = new Uint32Array(gameConfig.width * horizon);

    for (let y = 0; y < horizon; y++) {
      const t = y / horizon;
      const r = Math.floor(40 + (135 - 40) * t);
      const g = Math.floor(70 + (206 - 70) * t);
      const b = Math.floor(120 + (235 - 120) * t);
      const color = 0xff000000 | (b << 16) | (g << 8) | r;

      const rowOffset = y * gameConfig.width;
      for (let x = 0; x < gameConfig.width; x++) {
        this.skyBuffer[rowOffset + x] = color;
      }
    }
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
        { id: 16, image: "power_cell.PNG", type: "Object", properties: [{ name: "anchor", value: "floor" }] },
        { id: 17, image: "thermal_detonator.png", type: "PickupItem" },
        { id: 18, image: "dh_17.png", type: "PickupItem" },
      ];
    }
  }

  private extractTexturePixels(texture: Texture): RawTextureData {
    const width = texture.width || 64;
    const height = texture.height || 64;
    const isPow2 =
      (width & (width - 1)) === 0 && (height & (height - 1)) === 0;
    const maskX = width - 1;
    const maskY = height - 1;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      const resource = texture.baseTexture.resource as any;
      const source = resource?.source || resource;
      if (source) {
        try {
          ctx.drawImage(source, 0, 0, width, height);
        } catch (e) {
          console.warn("Could not draw source directly:", e);
        }
      }
      const imgData = ctx.getImageData(0, 0, width, height);
      return {
        width,
        height,
        pixels: new Uint32Array(imgData.data.buffer),
        isPow2,
        maskX,
        maskY,
      };
    }
    return {
      width: 64,
      height: 64,
      pixels: new Uint32Array(64 * 64).fill(0xff666666),
      isPow2: true,
      maskX: 63,
      maskY: 63,
    };
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

    // 2. AOE damage to enemies in blast radius
    this.enemyManager.applyAreaDamage(x, y, radius, damage, (enemy) => {
      this.hud.showToast(`[!] Neutralized ${enemy.config.name} (Explosion)`, 0x00ff88);
    });

    // 3. AOE damage to breakable objects
    if (this.breakableManager) {
      this.breakableManager.applyAreaDamage(x, y, radius, damage, (broken) => {
        this.hud.showToast(`[!] Smashed ${broken.name} (Explosion)`, 0xffaa00);
        if (this.destructableWallManager) {
          this.destructableWallManager.onBreakableDestroyed(broken);
        }
      });
    }

    // 4. Damage player if caught in the explosion
    if (distToPlayer <= radius) {
      const falloff = 1 - distToPlayer / radius;
      const playerDmg = Math.max(10, Math.round(damage * 0.6 * falloff));
      this.playerController.takeDamage(playerDmg);
      this.hud.showToast(`[-] Caught in Thermal Blast! (-${playerDmg} HP)`, 0xff3333);
      this.hud.flashScreen(0xff5500, 0.4);
    }
  }

  public triggerScreenShake(intensity: number = 8, duration: number = 0.35): void {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
  }

  private async loadLevel(levelName: string) {
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

    if (mapData.tilesets) {
      for (const tileset of mapData.tilesets) {
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
            const fileName = imagePath.split(/[\\/]/).pop();
            textureMap[tileId] = fileName;
          });
        }
      });
    }

    const texturePromises = Object.entries(textureMap).map(
      ([tileId, fileName]) =>
        Assets.load(`assets/${fileName}`)
          .then((texture) => {
            this.textures[parseInt(tileId)] = texture;
          })
          .catch((err) => console.error(`Failed to load ${fileName}:`, err))
    );
    await Promise.all(texturePromises);

    // Extract raw pixel buffers and pre-slice 1px column textures for zero-allocation rendering
    for (const [tileIdStr, texture] of Object.entries(this.textures)) {
      const tileId = parseInt(tileIdStr);
      this.rawTextureData[tileId] = this.extractTexturePixels(texture);

      const slices: Texture[] = [];
      const texW = texture.width || 64;
      const texH = texture.height || 64;
      for (let x = 0; x < texW; x++) {
        slices.push(
          new Texture(texture.baseTexture, new Rectangle(x, 0, 1, texH))
        );
      }
      this.columnTextures[tileId] = slices;
    }

    this.parseTiledMap(mapData);
    await this.pickupManager.initTextures();
    await this.breakableManager.initTextures();
    const firstgid = mapData.tilesets?.[0]?.firstgid ?? 1;
    this.breakableManager.parseMapBreakables(
      mapData,
      this.tileMeta,
      this.tileTypes,
      firstgid
    );
    this.pickupManager.bindBreakables(this.breakableManager.getBreakables());
    this.destructableWallManager.parseMapDoorProtectors(mapData, firstgid);
    this.destructableWallManager.bindBreakables(
      this.breakableManager.getBreakables(),
      firstgid
    );
    this.destructableWallManager.onWallDeactivated = (wall) => {
      this.hud.showToast(`[!] Security Barrier Deactivated!`, 0x00ffcc);
      try {
        sound.play("door_1", { volume: 0.4 });
      } catch (e) {
        console.warn("Failed to play barrier deactivated sound:", e);
      }
    };
    await this.enemyManager.initSpritesheets();
    this.enemyManager.parseMapEnemies(mapData);

    // Initialize thermal detonator manager textures & frames
    await this.detonatorManager.initTextures();

    // Spawn initial thermal detonator pickups for quick player testing
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
            console.log(`Moved player to (${this.player.x}, ${this.player.y})`);
            break;
          }
        }
      }
    }
  }

  private parseTiledMap(mapData: any) {
    this.map = Array(mapData.height)
      .fill(0)
      .map(() => Array(mapData.width).fill(0));
    this.floorMap = Array(mapData.height)
      .fill(0)
      .map(() => Array(mapData.width).fill(-1));
    this.ceilingMap = Array(mapData.height)
      .fill(0)
      .map(() => Array(mapData.width).fill(-1));
    this.mapWidth = mapData.width;
    this.mapHeight = mapData.height;

    const firstgid = mapData.tilesets[0]?.firstgid ?? 1;

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
              });
            }
            if (tile.imageheight) {
              meta.imageHeight = tile.imageheight;
              meta.imageWidth = tile.imagewidth;
            }
            const imgPath = tile.image || "";
            meta.image = imgPath.split(/[\\/]/).pop() || "";
            this.tileMeta[tile.id] = meta;
          });
        }
      });
    }

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

    const floorLayers = allLayers.filter(
      (layer: any) => layer.name && layer.name.toLowerCase() === "floor"
    );
    for (const floorLayer of floorLayers) {
      if (floorLayer.data) {
        floorLayer.data.forEach((tileGid: number, index: number) => {
          const x = index % floorLayer.width;
          const y = Math.floor(index / floorLayer.width);
          if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
            if (tileGid !== 0) {
              this.floorMap[y][x] = tileGid - firstgid;
            } else if (this.floorMap[y][x] === undefined) {
              this.floorMap[y][x] = -1;
            }
          }
        });
      }
    }

    const ceilingLayers = allLayers.filter(
      (layer: any) => layer.name && layer.name.toLowerCase() === "ceiling"
    );
    for (const ceilingLayer of ceilingLayers) {
      if (ceilingLayer.data) {
        ceilingLayer.data.forEach((tileGid: number, index: number) => {
          const x = index % ceilingLayer.width;
          const y = Math.floor(index / ceilingLayer.width);
          if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
            if (tileGid !== 0) {
              this.ceilingMap[y][x] = tileGid - firstgid;
            } else if (this.ceilingMap[y][x] === undefined) {
              this.ceilingMap[y][x] = -1;
            }
          }
        });
      }
    }

    const wallsLayers = allLayers.filter(
      (layer: any) => layer.name && layer.name.toLowerCase() === "walls"
    );
    for (const wallsLayer of wallsLayers) {
      if (wallsLayer.data) {
        wallsLayer.data.forEach((tileId: number, index: number) => {
          const x = index % wallsLayer.width;
          const y = Math.floor(index / wallsLayer.width);
          if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
            if (tileId !== 0) {
              this.map[y][x] = tileId;
              const tileType = this.tileTypes[tileId];
              if (tileType === "door" || tileType === TileType.DOOR) {
                this.doorStates[`${x},${y}`] = 0;
              }
            }
          }
        });
      }
    }

    const thinWallsLayers = allLayers.filter(
      (layer: any) => layer.name && layer.name.toLowerCase() === "thinwalls"
    );
    for (const thinWallsLayer of thinWallsLayers) {
      if (thinWallsLayer.data) {
        const thinWallTiles: Array<{ x: number; y: number; tileId: number }> = [];
        thinWallsLayer.data.forEach((tileId: number, index: number) => {
          if (tileId !== 0) {
            const x = index % thinWallsLayer.width;
            const y = Math.floor(index / thinWallsLayer.width);
            thinWallTiles.push({ x, y, tileId });
          }
        });

        thinWallTiles.forEach(({ x, y, tileId }) => {
          const tileType = this.tileTypes[tileId];
          const adjustedTileId = tileId - firstgid;
          if (tileType === "thinWall" || tileType === TileType.THIN_WALL) {
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
            if ((hasLeft || hasRight) && !(hasTop || hasBottom)) {
              orientation = "horizontal";
            } else if ((hasTop || hasBottom) && !(hasLeft || hasRight)) {
              orientation = "vertical";
            } else if (hasLeft || hasRight) {
              orientation = "horizontal";
            }

            if (orientation === "vertical") {
              this.thinWalls.push({
                x1: x + 0.5,
                y1: y,
                x2: x + 0.5,
                y2: y + 1,
                texture: adjustedTileId,
                orientation,
              });
            } else {
              this.thinWalls.push({
                x1: x,
                y1: y + 0.5,
                x2: x + 1,
                y2: y + 0.5,
                texture: adjustedTileId,
                orientation,
              });
            }
          }
        });
      }
    }

    const doorsLayers = allLayers.filter(
      (layer: any) => layer.name && layer.name.toLowerCase() === "doors"
    );
    for (const doorsLayer of doorsLayers) {
      if (doorsLayer.data) {
        doorsLayer.data.forEach((tileId: number, index: number) => {
          if (tileId !== 0) {
            const x = index % doorsLayer.width;
            const y = Math.floor(index / doorsLayer.width);
            const tileType = this.tileTypes[tileId];
            if (tileType === "door" || tileType === TileType.DOOR) {
              this.map[y][x] = tileId;
              this.doorStates[`${x},${y}`] = 0;
            }
          }
        });
      }
    }

    // Door keys layer parsing (identifies doors requiring keycards)
    this.lockedDoors = {};
    const keysLayers = allLayers.filter(
      (layer: any) => layer.name && layer.name.toLowerCase().includes("key")
    );
    for (const keysLayer of keysLayers) {
      if (keysLayer.data) {
        keysLayer.data.forEach((tileGid: number, index: number) => {
          if (tileGid !== 0) {
            const x = index % keysLayer.width;
            const y = Math.floor(index / keysLayer.width);
            const adjustedTileId = tileGid - firstgid;
            const meta = this.tileMeta[adjustedTileId] || {};
            const typeStr = (meta.type || this.tileTypes[tileGid] || "").toLowerCase();
            const imgStr = (meta.image || "").toLowerCase();

            let reqKey = "blue";
            if (typeStr.includes("green") || imgStr.includes("green")) reqKey = "green";
            else if (typeStr.includes("red") || imgStr.includes("red")) reqKey = "red";
            else if (typeStr.includes("blue") || imgStr.includes("blue")) reqKey = "blue";

            this.lockedDoors[`${x},${y}`] = reqKey;
          }
        });
      }
    }

    // Objects and pickups layer parsing (handled via RaycastPickupManager)
    this.pickupManager.parseMapPickups(
      mapData,
      this.tileMeta,
      this.tileTypes,
      firstgid
    );
    this.mapObjects = this.pickupManager.getVisibleMapObjects();

    // --- Performance: Flatten jagged arrays into typed arrays ---
    const totalCells = this.mapHeight * this.mapWidth;
    this.mapFlat = new Int32Array(totalCells);
    this.floorMapFlat = new Int32Array(totalCells);
    this.ceilingMapFlat = new Int32Array(totalCells);
    this.doorStatesFlat = new Float64Array(totalCells);
    this.tileTypeFlags = new Uint8Array(totalCells);
    this.doorOrientationsFlat = new Uint8Array(totalCells);
    this.doorSlideModesFlat = new Uint8Array(totalCells);

    let maxTileId = 0;
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const idx = y * this.mapWidth + x;
        const wallTile = this.map[y][x];
        this.mapFlat[idx] = wallTile;
        this.floorMapFlat[idx] = this.floorMap[y][x];
        this.ceilingMapFlat[idx] = this.ceilingMap[y][x];

        // Convert string tile types to numeric flags
        const typeStr = this.tileTypes[wallTile];
        if (typeStr === "door") {
          this.tileTypeFlags[idx] = RaycastScene.TILE_DOOR;
        } else if (typeStr === "thinWall") {
          this.tileTypeFlags[idx] = RaycastScene.TILE_THIN;
        } else if (wallTile > 0) {
          this.tileTypeFlags[idx] = RaycastScene.TILE_WALL;
        }

        // Initialize door states from string-keyed map
        const doorKey = `${x},${y}`;
        if (doorKey in this.doorStates) {
          this.doorStatesFlat[idx] = this.doorStates[doorKey];
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

    // Build flat texture data array for O(1) indexed access
    this.rawTexArray = new Array(maxTileId + 1);
    for (let i = 0; i <= maxTileId; i++) {
      this.rawTexArray[i] = this.rawTextureData[i];
    }
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

  public dispose(): void {
    Ticker.shared.remove(this.tick, this);
    this.removeChildren();
    if (this.bgTexture) {
      this.bgTexture.destroy(true);
    }
    if (this.mobileControls) {
      this.mobileControls.dispose();
    }
    if (this.weaponView) {
      this.weaponView.dispose();
    }
    if (this.hud) {
      this.hud.dispose();
    }
    if (this.pickupManager) {
      this.pickupManager.dispose();
    }
    if (this.breakableManager) {
      this.breakableManager.dispose();
    }
    if (this.destructableWallManager) {
      this.destructableWallManager.dispose();
    }
    if (this.enemyManager) {
      this.enemyManager.dispose();
    }
    if (this.playerController) {
      this.playerController.dispose();
    }
    if (this.objectContainer) {
      this.objectContainer.removeChildren();
      this.objectContainer.destroy({ children: true });
    }
    if (this.enemyContainer) {
      this.enemyContainer.removeChildren();
      this.enemyContainer.destroy({ children: true });
    }
    this.objectSpritePool = [];
    this.objectSpritePoolIndex = 0;
    for (const slices of Object.values(this.columnTextures)) {
      for (const tex of slices) {
        tex.destroy(false);
      }
    }
    for (const t of this.doorColumnTextures) {
      t.destroy(false);
    }
    this.doorColumnTextures = [];
    this.columnTextures = {};
    window.removeEventListener("keydown", this.keyDownHandler);
    window.removeEventListener("keyup", this.keyUpHandler);
    window.removeEventListener("mousemove", this.mouseMoveHandler);
    window.removeEventListener("mousedown", this.mouseDownHandler);
    window.removeEventListener("mouseup", this.mouseUpHandler);
    window.removeEventListener("contextmenu", this.contextMenuHandler);
    window.removeEventListener("blur", this.blurHandler);
    window.removeEventListener("wheel", this.wheelHandler);
    if (this.detonatorManager) {
      this.detonatorManager.dispose();
    }
    document.removeEventListener(
      "pointerlockchange",
      this.pointerLockChangeHandler
    );
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
  };

  private mouseUpHandler = (e: MouseEvent) => {
    if (e.button === 0) {
      this.isLeftMouseDown = false;
    } else if (e.button === 2) {
      this.isRightMouseDown = false;
    }
  };

  private mouseDownHandler = (e: MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault();
    }

    if (!this.isMobileDevice()) {
      // If pointer is not locked yet, request pointer lock on click on desktop
      if (!document.pointerLockElement) {
        try {
          const p: any = (document.body as any).requestPointerLock?.();
          if (p && typeof p.catch === "function") {
            p.catch(() => {});
          }
        } catch (err) {}
      }

      if (e.button === 0) {
        this.isLeftMouseDown = true;
        this.tryShoot(false);
      } else if (e.button === 2) {
        this.isRightMouseDown = true;

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
    }
  };

  private pointerLockChangeHandler = () => {
    if (!document.pointerLockElement) {
      this.isLeftMouseDown = false;
      this.isRightMouseDown = false;
    }
  };

  private tryShoot(isAutoFire: boolean = false): void {
    const currentCfg = this.playerController.weaponConfig;
    if (!currentCfg) return;

    // 1. Throwable weapons (Thermal Detonator)
    if (currentCfg.isThrowable) {
      this.playerController.tryShoot(() => {
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
      return;
    }

    // 2. Direct hitscan firearm (DH-17, E-11, etc.)
    const didShoot = this.playerController.tryShoot(undefined, isAutoFire);
    if (didShoot) {
      const damage = currentCfg.damage ?? 25;
      const centerCol = Math.floor(gameConfig.width / 2);
      const wallDistance = this.zBuffer[centerCol] || this.MAX_RENDER_DISTANCE;

      // Find closest breakable furniture hit along aiming vector
      const breakableHit = this.breakableManager.findClosestHit(
        this.player.x,
        this.player.y,
        this.player.dirX,
        this.player.dirY,
        wallDistance
      );

      const maxEnemyDist = breakableHit ? breakableHit.distance : wallDistance;

      // Shoot enemy up to the nearest obstacle (breakable or wall)
      const hitEnemy = this.enemyManager.handlePlayerShot(
        this.player.x,
        this.player.y,
        this.player.dirX,
        this.player.dirY,
        damage,
        maxEnemyDist,
        (enemy) => {
          this.hud.showToast(`[!] Neutralized ${enemy.config.name} (+${currentCfg.name})`, 0x00ff88);
        }
      );

      // If no enemy was in front of the breakable, damage the breakable
      if (!hitEnemy && breakableHit) {
        this.breakableManager.damageBreakable(breakableHit.breakable, damage, (broken) => {
          this.hud.showToast(`[!] Smashed ${broken.name}`, 0xffaa00);
          if (this.destructableWallManager) {
            this.destructableWallManager.onBreakableDestroyed(broken);
          }
        });
      }
    }
  }

  private keyDownHandler = (e: KeyboardEvent) => {
    if (e.key in this.keys) {
      this.keys[e.key] = true;
    }
    if (e.key === "e" || e.key === "E") {
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
    if (e.key === "q" || e.key === "Q") {
      this.playerController.cycleWeapon(-1);
    }
    // Toggle/Cycle Door Slide Mode (V: Up -> Down -> Sideways)
    if (e.key === "v" || e.key === "V") {
      this.cycleDoorSlideMode();
    }
  };

  private keyUpHandler = (e: KeyboardEvent) => {
    if (e.key in this.keys) this.keys[e.key] = false;
  };

  private rotatePlayer(angle: number): void {
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);

    const oldDirX = this.player.dirX;
    this.player.dirX = this.player.dirX * cos - this.player.dirY * sin;
    this.player.dirY = oldDirX * sin + this.player.dirY * cos;

    const oldPlaneX = this.player.planeX;
    this.player.planeX = this.player.planeX * cos - this.player.planeY * sin;
    this.player.planeY = oldPlaneX * sin + this.player.planeY * cos;
  }

  private mouseMoveHandler = (e: MouseEvent) => {
    if (document.pointerLockElement !== document.body) return;
    const angle = e.movementX * this.mouseSensitivity;
    this.rotatePlayer(angle);
  };

  private tick(delta: number) {
    // Screen shake update
    if (this.shakeDuration > 0) {
      this.shakeDuration -= delta / 60;
      const offsetX = (Math.random() * 2 - 1) * this.shakeIntensity;
      const offsetY = (Math.random() * 2 - 1) * this.shakeIntensity;
      this.position.set(offsetX, offsetY);
      this.shakeIntensity = Math.max(0, this.shakeIntensity - 15 * (delta / 60));
    } else {
      this.position.set(0, 0);
    }

    this.updatePlayer(delta);
    this.updateDoors(delta);
    this.pickupManager.update(delta);

    const allThinWalls = this.thinWalls.concat(
      this.destructableWallManager ? this.destructableWallManager.getThinWalls() : []
    );

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
      this.pickupManager
    );

    // Check for item pickups
    const collected = this.pickupManager.checkPlayerPickups(
      this.player.x,
      this.player.y
    );
    if (collected.length > 0) {
      this.playerController.handlePickups(collected);
    }

    // Determine movement for weapon bobbing
    const joyVector = this.mobileControls?.moveVector ?? { x: 0, y: 0 };
    const isMoving =
      this.keys.w ||
      this.keys.s ||
      this.keys.a ||
      this.keys.d ||
      Math.abs(joyVector.x) > 0.15 ||
      Math.abs(joyVector.y) > 0.15;

    // Automatic continuous firing while right mouse button is pressed with the E-11 Blaster
    if (this.isRightMouseDown && this.playerController.equippedWeapon === RaycastWeaponType.E11) {
      this.tryShoot(true);
    }

    this.playerController.update(delta, isMoving);

    this.renderScene();
  }

  private updatePlayer(delta: number) {
    const moveSpeed = this.moveSpeed * delta;

    // Mobile joystick input
    const joyVector = this.mobileControls?.moveVector ?? { x: 0, y: 0 };
    const joyX = joyVector.x;
    const joyY = joyVector.y; // Negative is forward, positive is backward

    // 1. Forward / Backward Movement
    if (this.keys.w || joyY < -0.15) {
      const intensity = this.keys.w ? 1 : Math.min(1, -joyY);
      const newX = this.player.x + this.player.dirX * moveSpeed * intensity;
      const newY = this.player.y + this.player.dirY * moveSpeed * intensity;
      if (this.tryMove(newX, newY)) {
        this.player.x = newX;
        this.player.y = newY;
      }
    } else if (this.keys.s || joyY > 0.15) {
      const intensity = this.keys.s ? 1 : Math.min(1, joyY);
      const newX = this.player.x - this.player.dirX * moveSpeed * intensity;
      const newY = this.player.y - this.player.dirY * moveSpeed * intensity;
      if (this.tryMove(newX, newY)) {
        this.player.x = newX;
        this.player.y = newY;
      }
    }

    // 2. Strafe Left / Right Movement
    if (this.keys.a || this.keys.d || Math.abs(joyX) > 0.15) {
      const strafeDirX = this.player.dirY;
      const strafeDirY = -this.player.dirX;
      let sign = 0;
      let intensity = 1;
      if (this.keys.a) {
        sign = -1;
      } else if (this.keys.d) {
        sign = 1;
      } else {
        sign = Math.sign(joyX);
        intensity = Math.min(1, Math.abs(joyX));
      }
      const newX = this.player.x + strafeDirX * moveSpeed * sign * intensity;
      const newY = this.player.y + strafeDirY * moveSpeed * sign * intensity;
      if (this.tryMove(newX, newY)) {
        this.player.x = newX;
        this.player.y = newY;
      }
    }

    // 3. Mobile Camera Rotation (swipe look area & turn buttons)
    if (this.mobileControls) {
      const lookDelta = this.mobileControls.consumeLookDelta();
      if (lookDelta !== 0) {
        this.rotatePlayer(lookDelta);
      }
    }
  }

  private tryMove(newX: number, newY: number): boolean {
    const targetX = Math.floor(newX);
    const targetY = Math.floor(newY);
    const tile = this.map[targetY]?.[targetX];
    const doorKey = `${targetX},${targetY}`;
    const tileType = this.tileTypes[tile];
    const isDoorOpen =
      tileType === "door" && Math.abs(this.doorStates[doorKey] ?? 0) >= 0.7;

    for (const wall of this.thinWalls) {
      const minX = Math.min(wall.x1, wall.x2);
      const maxX = Math.max(wall.x1, wall.x2);
      const minY = Math.min(wall.y1, wall.y2);
      const maxY = Math.max(wall.y1, wall.y2);
      if (
        newX >= minX - 0.1 &&
        newX <= maxX + 0.1 &&
        newY >= minY - 0.1 &&
        newY <= maxY + 0.1
      ) {
        return false;
      }
    }

    if (this.destructableWallManager && this.destructableWallManager.checkCollision(newX, newY)) {
      return false;
    }

    if (this.breakableManager && this.breakableManager.checkCollision(newX, newY)) {
      return false;
    }

    return tile === 0 || isDoorOpen;
  }

  private updateDoors(delta: number) {
    for (const key in this.doorStates) {
      const state = this.doorStates[key];
      if (typeof state === "number") {
        if (state < 0) {
          // Closing the door
          this.doorStates[key] = state + 0.05 * delta;
          if (this.doorStates[key] > 0) {
            this.doorStates[key] = 0;
          } // Reset to closed
        } else if (state > 0) {
          // Opening the door
          this.doorStates[key] = state + 0.05 * delta;
          if (this.doorStates[key] > 1) {
            this.doorStates[key] = 1; // Fully open
          }
        }
        // Sync to flat array for zero-allocation lookups during raycasting
        const parts = key.split(",");
        const flatIdx = parseInt(parts[1]) * this.mapWidth + parseInt(parts[0]);
        this.doorStatesFlat[flatIdx] = this.doorStates[key];
      }
    }
  }

  private tryOpenDoor() {
    const px = Math.floor(this.player.x);
    const py = Math.floor(this.player.y);
    const lookX = Math.floor(this.player.x + this.player.dirX * 0.85);
    const lookY = Math.floor(this.player.y + this.player.dirY * 0.85);

    const nearbyOffsets = [
      [lookX - px, lookY - py],
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    const tested = new Set<string>();

    for (const [dx, dy] of nearbyOffsets) {
      const x = px + dx;
      const y = py + dy;
      const key = `${x},${y}`;
      if (tested.has(key)) continue;
      tested.add(key);

      const tile = this.map[y]?.[x];
      if (tile && this.tileTypes[tile] === "door") {
        const currentState = this.doorStates[key];

        // Check if door requires a keycard to unlock
        const reqKey = this.lockedDoors[key];
        if (reqKey && currentState === 0) {
          if (!this.playerController.hasKeycard(reqKey)) {
            const keyName = reqKey.charAt(0).toUpperCase() + reqKey.slice(1) + " Keycard";
            this.hud.showToast(`[X] Access Denied! Requires ${keyName}`, 0xff3333);
            this.hud.flashScreen(0xff0000, 0.2);
            continue;
          } else {
            const keyName = reqKey.charAt(0).toUpperCase() + reqKey.slice(1) + " Keycard";
            this.hud.showToast(`[!] Access Granted (${keyName})`, 0x00e5ff);
          }
        }

        if (currentState === 0) {
          this.doorStates[key] = 0.01;
          this.doorStatesFlat[y * this.mapWidth + x] = 0.01;
          try {
            sound.play("door_1", { volume: 0.5 });
          } catch (e) {
            console.warn("Failed to play door_1 sound:", e);
          }
          break; // Action triggered
        } else if (currentState === 1) {
          this.doorStates[key] = -1;
          this.doorStatesFlat[y * this.mapWidth + x] = -1;
          try {
            sound.play("door_1", { volume: 0.4 });
          } catch (e) {
            console.warn("Failed to play door_1 sound:", e);
          }
          break;
        }
      }
    }
  }

  private cullThinWalls(): void {
    this.activeThinWalls = [];
    const invDet =
      1.0 /
      (this.player.planeX * this.player.dirY -
        this.player.dirX * this.player.planeY);

    const allThinWalls = this.thinWalls.concat(
      this.destructableWallManager ? this.destructableWallManager.getThinWalls() : []
    );

    for (const wall of allThinWalls) {
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
    for (let k = 0; k < pool.length; k++) {
      pool[k].isDoor = false;
      pool[k].doorSlide = undefined;
      pool[k].doorOpen = undefined;
    }
    let solidWallDist = this.MAX_RENDER_DISTANCE;

    while (true) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
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

  private renderFloorAndCeiling() {
    const screenW = gameConfig.width;
    const screenH = gameConfig.height;
    const horizon = screenH >> 1;
    const posZ = 0.5 * screenH;
    const maxDist = this.MAX_RENDER_DISTANCE;
    const invMaxDist = 0.75 / maxDist;
    const mapW = this.mapWidth;
    const mapH = this.mapHeight;
    const buf = this.bgBuffer32;
    const sky = this.skyBuffer;
    const floorMap = this.floorMapFlat;
    const ceilMap = this.ceilingMapFlat;
    const texArr = this.rawTexArray;
    const wTop = this.wallTop;
    const wBot = this.wallBottom;

    const planeX = this.player.planeX;
    const planeY = this.player.planeY;
    const dirX = this.player.dirX;
    const dirY = this.player.dirY;
    const posX = this.player.x;
    const posY = this.player.y;

    const rdx0 = dirX - planeX;
    const rdy0 = dirY - planeY;
    const rdx1 = dirX + planeX;
    const rdy1 = dirY + planeY;
    const drdx = rdx1 - rdx0;
    const drdy = rdy1 - rdy0;

    // Pre-compute inverse screenW for step calculations
    const invScreenW = 1.0 / screenW;

    // 1. Ceiling casting for top half (y = 0 to horizon - 1)
    for (let y = 0; y < horizon; y++) {
      const p = horizon - y;
      const rowDist = posZ / p;

      // Early termination: if this row is beyond render distance, fill with sky
      if (rowDist > maxDist) {
        const rowStart = y * screenW;
        buf.set(sky.subarray(rowStart, rowStart + screenW), rowStart);
        continue;
      }

      const stepX = rowDist * drdx * invScreenW;
      const stepY = rowDist * drdy * invScreenW;
      let ceilX = posX + rowDist * rdx0;
      let ceilY = posY + rowDist * rdy0;

      const shade = 1.0 - rowDist * invMaxDist;
      const shadeInt = (Math.max(0.18, Math.min(1.0, shade)) * 256) | 0;

      let bufIdx = y * screenW;

      for (let x = 0; x < screenW; x++) {
        // OCCLUSION CULLING: Skip pixels hidden behind walls
        if (y >= wTop[x]) {
          bufIdx++;
          ceilX += stepX;
          ceilY += stepY;
          continue;
        }

        const cellX = ceilX | 0;
        const cellY = ceilY | 0;

        if (
          cellX >= 0 && cellX < mapW &&
          cellY >= 0 && cellY < mapH
        ) {
          const tileId = ceilMap[cellY * mapW + cellX];
          if (tileId >= 0) {
            const texData = texArr[tileId];
            if (texData) {
              const cxFrac = ceilX - cellX;
              const cyFrac = ceilY - cellY;
              const safeX = cxFrac < 0 ? cxFrac + 1 : cxFrac;
              const safeY = cyFrac < 0 ? cyFrac + 1 : cyFrac;

              const tx = texData.isPow2
                ? ((safeX * texData.width) | 0) & texData.maskX
                : ((safeX * texData.width) | 0) % texData.width;
              const ty = texData.isPow2
                ? ((safeY * texData.height) | 0) & texData.maskY
                : ((safeY * texData.height) | 0) % texData.height;

              const rawPix = texData.pixels[ty * texData.width + tx];
              const r = ((rawPix & 0xff) * shadeInt) >> 8;
              const g = (((rawPix >> 8) & 0xff) * shadeInt) >> 8;
              const b = (((rawPix >> 16) & 0xff) * shadeInt) >> 8;
              buf[bufIdx] = 0xff000000 | (b << 16) | (g << 8) | r;
            } else {
              buf[bufIdx] = sky[bufIdx];
            }
          } else {
            buf[bufIdx] = sky[bufIdx];
          }
        } else {
          buf[bufIdx] = sky[bufIdx];
        }

        bufIdx++;
        ceilX += stepX;
        ceilY += stepY;
      }
    }

    // 2. Floor casting for bottom half (y = horizon to screenH - 1)
    for (let y = horizon; y < screenH; y++) {
      const p = y - horizon;
      if (p === 0) continue;

      const rowDist = posZ / p;

      // Early termination: if this row is beyond render distance, fill with fog
      if (rowDist > maxDist) {
        const fogVal = (0x33 * 46) >> 8; // min shade (0.18) applied to 0x33
        const fogColor = 0xff000000 | (fogVal << 16) | (fogVal << 8) | fogVal;
        const rowStart = y * screenW;
        buf.fill(fogColor, rowStart, rowStart + screenW);
        continue;
      }

      const stepX = rowDist * drdx * invScreenW;
      const stepY = rowDist * drdy * invScreenW;
      let floorX = posX + rowDist * rdx0;
      let floorY = posY + rowDist * rdy0;

      const shade = 1.0 - rowDist * invMaxDist;
      const shadeInt = (Math.max(0.18, Math.min(1.0, shade)) * 256) | 0;

      let bufIdx = y * screenW;

      for (let x = 0; x < screenW; x++) {
        // OCCLUSION CULLING: Skip pixels hidden behind walls
        if (y < wBot[x]) {
          bufIdx++;
          floorX += stepX;
          floorY += stepY;
          continue;
        }

        const cellX = floorX | 0;
        const cellY = floorY | 0;

        if (
          cellX >= 0 && cellX < mapW &&
          cellY >= 0 && cellY < mapH
        ) {
          const tileId = floorMap[cellY * mapW + cellX];
          if (tileId >= 0) {
            const texData = texArr[tileId];
            if (texData) {
              const fx = floorX - cellX;
              const fy = floorY - cellY;
              const safeX = fx < 0 ? fx + 1 : fx;
              const safeY = fy < 0 ? fy + 1 : fy;

              const tx = texData.isPow2
                ? ((safeX * texData.width) | 0) & texData.maskX
                : ((safeX * texData.width) | 0) % texData.width;
              const ty = texData.isPow2
                ? ((safeY * texData.height) | 0) & texData.maskY
                : ((safeY * texData.height) | 0) % texData.height;

              const rawPix = texData.pixels[ty * texData.width + tx];
              const r = ((rawPix & 0xff) * shadeInt) >> 8;
              const g = (((rawPix >> 8) & 0xff) * shadeInt) >> 8;
              const b = (((rawPix >> 16) & 0xff) * shadeInt) >> 8;
              buf[bufIdx] = 0xff000000 | (b << 16) | (g << 8) | r;
            } else {
              const base = 0x33;
              const val = (base * shadeInt) >> 8;
              buf[bufIdx] = 0xff000000 | (val << 16) | (val << 8) | val;
            }
          } else {
            const base = 0x33;
            const val = (base * shadeInt) >> 8;
            buf[bufIdx] = 0xff000000 | (val << 16) | (val << 8) | val;
          }
        } else {
          const base = 0x33;
          const val = (base * shadeInt) >> 8;
          buf[bufIdx] = 0xff000000 | (val << 16) | (val << 8) | val;
        }

        bufIdx++;
        floorX += stepX;
        floorY += stepY;
      }
    }

    this.bgCtx.putImageData(this.bgImageData, 0, 0);
    if ((this.bgTexture as any).source?.update) {
      (this.bgTexture as any).source.update();
    } else {
      this.bgTexture.update();
    }
  }

  private renderScene() {
    const screenW = gameConfig.width;
    const screenH = gameConfig.height;

    this.graphics.clear();

    // 1. Frustum cull thin walls before casting rays
    this.cullThinWalls();

    // 2. Raycast all columns to get hits and calculate wall occlusion bounds
    for (let i = 0; i < screenW; i++) {
      const hitCount = this.castRay(i);
      this.hitCounts[i] = hitCount;
      const pool = this.hitPool[i];
      this.zBuffer[i] =
        hitCount > 0 ? pool[hitCount - 1].distance : this.MAX_RENDER_DISTANCE;

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
          const open = Math.abs(this.doorStatesFlat[flatIdx]);
          // When a door is closed (< 0.05 open), it occludes floor and ceiling like a wall
          if (open < 0.05) {
            const lineHeight = screenH / ray.distance;
            const drawStart = -lineHeight / 2 + screenH / 2;
            const drawEnd = lineHeight / 2 + screenH / 2;
            minDrawStart = Math.min(minDrawStart, drawStart);
            maxDrawEnd = Math.max(maxDrawEnd, drawEnd);
          }
          // When open >= 0.05, the door is an open aperture:
          // The room behind the door must have its ceiling and floor rendered without occlusion.
          // The remaining door panel sprite is drawn on top of the background in step 4.
        } else if (tileFlag !== RaycastScene.TILE_THIN && !ray.isDoor) {
          const lineHeight = screenH / ray.distance;
          const drawStart = -lineHeight / 2 + screenH / 2;
          const drawEnd = lineHeight / 2 + screenH / 2;
          minDrawStart = Math.min(minDrawStart, drawStart);
          maxDrawEnd = Math.max(maxDrawEnd, drawEnd);
        }
      }

      this.wallTop[i] = Math.max(0, Math.floor(minDrawStart));
      this.wallBottom[i] = Math.min(screenH, Math.ceil(maxDrawEnd));
    }

    // Compute global row-skip bounds for floor/ceiling early termination
    let gMinTop = screenH;
    let gMaxBot = 0;
    for (let i = 0; i < screenW; i++) {
      if (this.wallTop[i] < gMinTop) gMinTop = this.wallTop[i];
      if (this.wallBottom[i] > gMaxBot) gMaxBot = this.wallBottom[i];
    }
    this.globalMinWallTop = gMinTop;
    this.globalMaxWallBottom = gMaxBot;

    // 3. Render floor and ceiling with wall occlusion culling at crisp native 1:1 resolution
    this.renderFloorAndCeiling();

    // 4. Render wall column sprites with viewport culling (back to front order)
    for (let i = 0; i < screenW; i++) {
      const hitCount = this.hitCounts[i];
      const pool = this.hitPool[i];

      for (const sprite of this.spritePool[i]) {
        sprite.visible = false;
      }

      for (let j = hitCount - 1; j >= 0; j--) {
        const ray = pool[j];
        const lineHeight = screenH / ray.distance;
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

        // Viewport culling: skip drawing if wall slice is outside the screen bounds
        if (drawEnd <= 0 || drawStart >= screenH || drawEnd <= drawStart) continue;

        const sprite = this.spritePool[i][j];
        const slices = this.columnTextures[ray.wallType];

        if (slices && slices.length > 0) {
          const clampedTexX = Math.min(
            Math.max(0, Math.floor(ray.hitX * slices.length)),
            slices.length - 1
          );

          if (isActualDoor && ray.doorSlide === DoorOpen.UP) {
            const texH = slices[clampedTexX].baseTexture.height || 64;
            const open = ray.doorOpen ?? 0;
            const doorTex = this.doorColumnTextures[i];
            doorTex.baseTexture = slices[clampedTexX].baseTexture;

            const srcY = Math.min(texH - 1, Math.floor(open * texH));
            const srcH = Math.max(1, texH - srcY);

            const origFrame = slices[clampedTexX].frame;
            doorTex.frame.x = origFrame.x;
            doorTex.frame.y = origFrame.y + srcY;
            doorTex.frame.width = 1;
            doorTex.frame.height = srcH;
            doorTex.updateUvs();

            sprite.texture = doorTex;
          } else {
            sprite.texture = slices[clampedTexX];
          }

          sprite.y = drawStart;
          sprite.height = drawEnd - drawStart;
          sprite.width = 1;
          sprite.visible = true;
          sprite.tint =
            ray.side === 0
              ? 0xaaaaaa
              : tileType === "door"
              ? 0xffffff
              : 0xcccccc;
        } else {
          this.graphics.beginFill(ray.side === 0 ? 0x666666 : 0x999999);
          this.graphics.drawRect(i, drawStart, 1, drawEnd - drawStart);
          this.graphics.endFill();
        }
      }
    }

    // 5. Render billboard pickups, breakables & detonators with Z-buffer occlusion
    const pickupObjects = this.pickupManager.getVisibleMapObjects();
    const breakableObjects = this.breakableManager ? this.breakableManager.getVisibleMapObjects() : [];
    const detonatorObjects = this.detonatorManager ? this.detonatorManager.getVisibleMapObjects() : [];
    this.mapObjects = pickupObjects.concat(breakableObjects).concat(detonatorObjects);
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
      this.MAX_RENDER_DISTANCE
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
      this.MAX_RENDER_DISTANCE
    );

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
    this.mapObjects.sort((a, b) => (b.distance ?? 0) - (a.distance ?? 0));

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

      const meta = obj.customTexture ? undefined : this.tileMeta[obj.texture];
      const texW = texture.width || 64;
      const texH = texture.height || 64;
      const aspectRatio = texW / texH;

      // Base wall height projected at this depth
      const baseHeight = Math.abs(Math.floor(screenH / transformY));

      // Resolve scale:
      // Priority 1: Object instance scale (from Tiled object layer)
      // Priority 2: Tile metadata scale (from Tiled tileset custom property)
      // Priority 3: Automatic image size scaling (relative to 512px standard wall)
      let effectiveScaleY = obj.scaleY ?? obj.scale ?? meta?.scaleY ?? meta?.scale;
      let effectiveScaleX = obj.scaleX ?? obj.scale ?? meta?.scaleX ?? meta?.scale;

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
      const anchor = (obj.anchor ?? meta?.anchor ?? (effectiveScaleY < 0.8 ? "floor" : "center")).toLowerCase();
      const z = obj.z ?? meta?.z;
      const vOffset = obj.vOffset ?? meta?.vOffset ?? 0;

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
          const texX = Math.floor(
            ((stripe - drawStartX) * texW) / spriteWidth
          );
          const clampedTexX = Math.min(Math.max(0, texX), slices.length - 1);
          const sliceIndex = obj.flipX ? slices.length - 1 - clampedTexX : clampedTexX;

          let sprite: Sprite;
          if (poolIdx < this.objectSpritePool.length) {
            sprite = this.objectSpritePool[poolIdx];
          } else {
            sprite = new Sprite();
            sprite.width = 1;
            this.objectContainer.addChild(sprite);
            this.objectSpritePool.push(sprite);
          }
          poolIdx++;

          sprite.texture = slices[sliceIndex];
          sprite.x = stripe;
          sprite.y = drawStartY;
          sprite.width = 1;
          sprite.height = actualHeight;
          sprite.tint = obj.tint ?? tint;
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
}
