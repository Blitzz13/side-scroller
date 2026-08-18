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
import { BaseScene } from "./BaseScene";
import { gameConfig } from "../configs/GameConfig";
import { MobileControls } from "../ui/MobileControls";

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
  private readonly MAX_HITS_PER_COLUMN: number = 3;
  private readonly MAX_RENDER_DISTANCE: number = 30;
  private tileTypes: Record<number, string> = {};
  private rawTextureData: Record<number, RawTextureData> = {};

  // --- Performance: Flat typed arrays for cache-local map access ---
  private mapFlat!: Int32Array;
  private floorMapFlat!: Int32Array;
  private ceilingMapFlat!: Int32Array;
  // Numeric door states keyed by flat index (y * mapWidth + x) instead of string keys
  private doorStatesFlat!: Float64Array;
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

  private bgCanvas!: HTMLCanvasElement;
  private bgCtx!: CanvasRenderingContext2D;
  private bgImageData!: ImageData;
  private bgBuffer32!: Uint32Array;
  private bgTexture!: Texture;
  private bgSprite!: Sprite;
  private skyBuffer: Uint32Array = new Uint32Array(0);

  private mobileControls!: MobileControls;

  constructor(stage: Container, scale: number, level: string = "level2") {
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

    // Overlay mobile on-screen controls
    this.mobileControls = new MobileControls();
    this.mobileControls.on("action", () => this.tryOpenDoor());
    this.addChild(this.mobileControls);

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

  private async loadLevel(levelName: string) {
    const mapData = await Assets.load(`assets/${levelName}.json`);

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

    const tileset = mapData.tilesets[0];
    if (tileset && tileset.tiles) {
      tileset.tiles.forEach((tile: any) => {
        const gid = tile.id + firstgid;
        const typeProp = tile.properties?.find(
          (prop: any) => prop.name === "type"
        );
        if (typeProp) {
          this.tileTypes[gid] = typeProp.value;
        }
      });
    }

    const floorLayer = mapData.layers.find(
      (layer: any) => layer.name === "Floor"
    );
    if (floorLayer) {
      floorLayer.data.forEach((tileGid: number, index: number) => {
        const x = index % floorLayer.width;
        const y = Math.floor(index / floorLayer.width);
        if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
          if (tileGid !== 0) {
            this.floorMap[y][x] = tileGid - firstgid;
          } else {
            this.floorMap[y][x] = -1;
          }
        }
      });
    }

    const ceilingLayer = mapData.layers.find(
      (layer: any) => layer.name === "Ceiling"
    );
    if (ceilingLayer) {
      ceilingLayer.data.forEach((tileGid: number, index: number) => {
        const x = index % ceilingLayer.width;
        const y = Math.floor(index / ceilingLayer.width);
        if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
          if (tileGid !== 0) {
            this.ceilingMap[y][x] = tileGid - firstgid;
          } else {
            this.ceilingMap[y][x] = -1;
          }
        }
      });
    }

    const wallsLayer = mapData.layers.find(
      (layer: any) => layer.name === "Walls"
    );
    if (wallsLayer) {
      wallsLayer.data.forEach((tileId: number, index: number) => {
        const x = index % wallsLayer.width;
        const y = Math.floor(index / wallsLayer.width);
        if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
          if (tileId !== 0) {
            this.map[y][x] = tileId;
            const tileType = this.tileTypes[tileId];
            if (tileType === "door") {
              this.doorStates[`${x},${y}`] = 0;
            }
          }
        }
      });
    }

    const thinWallsLayer = mapData.layers.find(
      (layer: any) => layer.name === "ThinWalls"
    );
    if (thinWallsLayer) {
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
        if (tileType === "thinWall") {
          const hasTop = thinWallTiles.some(
            (t) =>
              t.x === x &&
              t.y === y - 1 &&
              this.tileTypes[t.tileId] === "thinWall"
          );
          const hasBottom = thinWallTiles.some(
            (t) =>
              t.x === x &&
              t.y === y + 1 &&
              this.tileTypes[t.tileId] === "thinWall"
          );
          const hasLeft = thinWallTiles.some(
            (t) =>
              t.x === x - 1 &&
              t.y === y &&
              this.tileTypes[t.tileId] === "thinWall"
          );
          const hasRight = thinWallTiles.some(
            (t) =>
              t.x === x + 1 &&
              t.y === y &&
              this.tileTypes[t.tileId] === "thinWall"
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

    const doorsLayer = mapData.layers.find(
      (layer: any) => layer.name === "Doors"
    );
    if (doorsLayer) {
      doorsLayer.data.forEach((tileId: number, index: number) => {
        if (tileId !== 0) {
          const x = index % doorsLayer.width;
          const y = Math.floor(index / doorsLayer.width);
          const tileType = this.tileTypes[tileId];
          if (tileType === "door") {
            this.map[y][x] = tileId;
            this.doorStates[`${x},${y}`] = 0;
          }
        }
      });
    }

    // --- Performance: Flatten jagged arrays into typed arrays ---
    const totalCells = this.mapHeight * this.mapWidth;
    this.mapFlat = new Int32Array(totalCells);
    this.floorMapFlat = new Int32Array(totalCells);
    this.ceilingMapFlat = new Int32Array(totalCells);
    this.doorStatesFlat = new Float64Array(totalCells);
    this.tileTypeFlags = new Uint8Array(totalCells);

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

    // Build flat texture data array for O(1) indexed access
    this.rawTexArray = new Array(maxTileId + 1);
    for (let i = 0; i <= maxTileId; i++) {
      this.rawTexArray[i] = this.rawTextureData[i];
    }
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
    for (const slices of Object.values(this.columnTextures)) {
      for (const tex of slices) {
        tex.destroy(false);
      }
    }
    this.columnTextures = {};
    window.removeEventListener("keydown", this.keyDownHandler);
    window.removeEventListener("keyup", this.keyUpHandler);
    window.removeEventListener("mousemove", this.mouseMoveHandler);
    document.removeEventListener(
      "pointerlockchange",
      this.pointerLockChangeHandler
    );
  }

  private setupControls() {
    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);
    window.addEventListener("mousemove", this.mouseMoveHandler);

    const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    this.stage.interactive = true;
    this.stage.on("mousedown", async (e: any) => {
      // Only lock pointer on desktop when clicking outside mobile UI controls
      if (!isMobile && !document.pointerLockElement && e?.target === this.stage) {
        try {
          await document.body.requestPointerLock();
        } catch (err) {}
      }
    });

    document.addEventListener(
      "pointerlockchange",
      this.pointerLockChangeHandler
    );
  }

  private pointerLockChangeHandler = () => {
    console.log("Pointer lock state:", document.pointerLockElement);
    if (document.pointerLockElement === document.body) {
      this.stage.interactive = true;
    } else {
      this.stage.interactive = true;
    }
  };

  private keyDownHandler = (e: KeyboardEvent) => {
    if (e.key in this.keys) {
      this.keys[e.key] = true;
    }
    if (e.key === "e") {
      this.tryOpenDoor();
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
    this.updatePlayer(delta);
    this.updateDoors(delta);
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
      tileType === "door" && (this.doorStates[doorKey] ?? 0) > 0;

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

    const nearbyOffsets = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    for (const [dx, dy] of nearbyOffsets) {
      const x = px + dx;
      const y = py + dy;
      const tile = this.map[y]?.[x];
      if (tile && this.tileTypes[tile] === "door") {
        const key = `${x},${y}`;
        const currentState = this.doorStates[key];

        if (currentState === 0) {
          this.doorStates[key] = 0.01;
          this.doorStatesFlat[y * this.mapWidth + x] = 0.01;
        } else if (currentState === 1) {
          this.doorStates[key] = -1;
          this.doorStatesFlat[y * this.mapWidth + x] = -1;
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

    for (const wall of this.thinWalls) {
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
          const open = this.doorStatesFlat[flatIdx];
          if (Math.abs(open) < 1) {
            const offset = 1 - Math.abs(open);
            const wallEdge = side === 0 ? mapX + offset : mapY + offset;
            const hitPos = side === 0 ? mapX + hitX : mapY + hitX;
            if (hitPos < wallEdge && hitCount < pool.length) {
              hitX = Math.min(1, hitX + Math.abs(open));
              const h = pool[hitCount++];
              h.wallType = adjustedTileId;
              h.distance = dist;
              h.hitX = hitX;
              h.side = side;
              h.mapX = mapX;
              h.mapY = mapY;
              h.rayDirX = rayDirX;
              h.rayDirY = rayDirY;
              solidWallDist = dist;
              break;
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
      if (pool[i].distance + minDistance > pool[i - 1].distance) {
        for (let k = i; k < hitCount - 1; k++) {
          pool[k] = pool[k + 1];
        }
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
    this.bgTexture.update();
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

      let minDrawStart = screenH;
      let maxDrawEnd = 0;

      for (let j = 0; j < hitCount; j++) {
        const ray = pool[j];
        const lineHeight = screenH / ray.distance;
        const drawStart = -lineHeight / 2 + screenH / 2;
        const drawEnd = lineHeight / 2 + screenH / 2;

        const flatIdx = ray.mapY * this.mapWidth + ray.mapX;
        const tileFlag = this.tileTypeFlags[flatIdx];
        if (tileFlag === RaycastScene.TILE_DOOR) {
          const open = this.doorStatesFlat[flatIdx];
          if (Math.abs(open) < 0.05) {
            minDrawStart = Math.min(minDrawStart, drawStart);
            maxDrawEnd = Math.max(maxDrawEnd, drawEnd);
          }
        } else if (tileFlag !== RaycastScene.TILE_THIN) {
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

    // 4. Render wall column sprites with viewport culling
    for (let i = 0; i < screenW; i++) {
      const hitCount = this.hitCounts[i];
      const pool = this.hitPool[i];

      for (const sprite of this.spritePool[i]) {
        sprite.visible = false;
      }

      for (let j = 0; j < hitCount; j++) {
        const ray = pool[j];
        const lineHeight = screenH / ray.distance;
        const drawStart = -lineHeight / 2 + screenH / 2;
        const drawEnd = lineHeight / 2 + screenH / 2;

        // Viewport culling: skip drawing if wall slice is outside the screen bounds
        if (drawEnd <= 0 || drawStart >= screenH) continue;

        const sprite = this.spritePool[i][j];
        const tileType = this.tileTypes[ray.wallType + 1];
        const slices = this.columnTextures[ray.wallType];

        if (slices && slices.length > 0) {
          const clampedTexX = Math.min(
            Math.max(0, Math.floor(ray.hitX * slices.length)),
            slices.length - 1
          );

          sprite.texture = slices[clampedTexX];
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
  }
}
