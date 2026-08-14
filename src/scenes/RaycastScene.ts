import {
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
  Ticker,
  Assets,
} from "pixi.js";
import { BaseScene } from "./BaseScene";
import { gameConfig } from "../configs/GameConfig";

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
  private floorTextures: Record<number, Texture> = {};
  private moveSpeed: number = 0.02;
  private rotSpeed: number = 0.05;
  private mouseSensitivity: number = 0.002;
  private map: number[][];
  private floorMap: number[][];
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
  private spritePool: Sprite[][] = [];
  private readonly MAX_HITS_PER_COLUMN: number = 4; // Wall + floor hits
  private readonly MAX_RENDER_DISTANCE: number = 50;
  private tileTypes: Record<number, string> = {};

  constructor(stage: Container, scale: number, level: string = "level2") {
    super(stage, scale);

    this.map = [];
    this.floorMap = [];
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
    }

    this.setupControls();
    this.loadLevel(level).then(() => {
      Ticker.shared.add(this.tick, this);
    });
  }

  private async loadLevel(levelName: string) {
    const mapData = await Assets.load(`assets/${levelName}.json`);

    const textureMap: Record<number, string> = {};
    const tileset = mapData.tilesets[0];
    if (tileset && tileset.tiles) {
      tileset.tiles.forEach((tile: any) => {
        const tileId = tile.id + 1; // Adjust for firstgid = 1
        const imagePath = tile.image;
        const fileName = imagePath.split(/[\\/]/).pop();
        textureMap[tileId] = fileName;
        const typeProp = tile.properties?.find((prop: any) => prop.name === "type");
        if (typeProp) {
          this.tileTypes[tileId] = typeProp.value;
        }
      });
    }

    // Load floor textures
    this.floorTextures[6] = await Assets.load("assets/inside_floor.jpg").catch((err) => {
      console.error("Failed to load inside_floor.jpg:", err);
      return null;
    });

    const texturePromises = Object.entries(textureMap).map(
      ([tileId, fileName]) =>
        Assets.load(`assets/${fileName}`)
          .then((texture) => {
            this.textures[parseInt(tileId)] = texture;
          })
          .catch((err) => console.error(`Failed to load ${fileName}:`, err))
    );
    await Promise.all(texturePromises);

    this.parseTiledMap(mapData);
    console.log("Parsed map:", this.map);
    console.log("Floor map:", this.floorMap);
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
      .map(() => Array(mapData.width).fill(0));
    this.mapWidth = mapData.width;
    this.mapHeight = mapData.height;

    const firstgid = mapData.tilesets[0].firstgid;

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

    const floorLayer = mapData.layers.find(
      (layer: any) => layer.name === "Floor"
    );
    if (floorLayer) {
      floorLayer.data.forEach((tileId: number, index: number) => {
        const x = index % floorLayer.width;
        const y = Math.floor(index / floorLayer.width);
        if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
          if (tileId !== 0) {
            this.floorMap[y][x] = tileId;
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
  }

  public dispose(): void {
    Ticker.shared.remove(this.tick, this);
    this.removeChildren();
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

    this.stage.interactive = true;
    this.stage.on("mousedown", async () => {
      if (!document.pointerLockElement) {
        await document.body.requestPointerLock();
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
      this.stage.interactive = true; // Keep interactive to allow re-locking
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

  private mouseMoveHandler = (e: MouseEvent) => {
    if (document.pointerLockElement !== document.body) return;

    const angle = e.movementX * this.mouseSensitivity;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);

    const oldDirX = this.player.dirX;
    this.player.dirX = this.player.dirX * cos - this.player.dirY * sin;
    this.player.dirY = oldDirX * sin + this.player.dirY * cos;

    const oldPlaneX = this.player.planeX;
    this.player.planeX = this.player.planeX * cos - this.player.planeY * sin;
    this.player.planeY = oldPlaneX * sin + this.player.planeY * cos;
  };

  private tick(delta: number) {
    this.updatePlayer(delta);
    this.updateDoors(delta);
    this.renderScene();
  }

  private updatePlayer(delta: number) {
    const moveSpeed = this.moveSpeed * delta;

    if (this.keys.w) {
      const newX = this.player.x + this.player.dirX * moveSpeed;
      const newY = this.player.y + this.player.dirY * moveSpeed;
      if (this.tryMove(newX, newY)) {
        this.player.x = newX;
        this.player.y = newY;
      }
    }

    if (this.keys.s) {
      const newX = this.player.x - this.player.dirX * moveSpeed;
      const newY = this.player.y - this.player.dirY * moveSpeed;
      if (this.tryMove(newX, newY)) {
        this.player.x = newX;
        this.player.y = newY;
      }
    }

    if (this.keys.a || this.keys.d) {
      const strafeDirX = this.player.dirY;
      const strafeDirY = -this.player.dirX;
      const sign = this.keys.a ? -1 : 1;
      const newX = this.player.x + strafeDirX * moveSpeed * sign;
      const newY = this.player.y + strafeDirY * moveSpeed * sign;
      if (this.tryMove(newX, newY)) {
        this.player.x = newX;
        this.player.y = newY;
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
          this.doorStates[key] = state + 0.05 * delta;
          if (this.doorStates[key] > 0) {
            this.doorStates[key] = 0;
          }
        } else if (state > 0) {
          this.doorStates[key] = state + 0.05 * delta;
          if (this.doorStates[key] > 1) {
            this.doorStates[key] = 1;
          }
        }
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
        } else if (currentState === 1) {
          this.doorStates[key] = -1;
        }
      }
    }
  }

  private castRay(column: number) {
    const screenW = gameConfig.width;
    const screenH = gameConfig.height;
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

    const hits: Array<{
      wallType: number;
      distance: number;
      hitX: number;
      hitY: number;
      side: number;
      mapX: number;
      mapY: number;
      rayDirX: number;
      rayDirY: number;
      orientation?: "vertical" | "horizontal";
      isFloor?: boolean;
    }> = [];

    // Cast ray for walls
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

      const tile = this.map[mapY][mapX];
      const key = `${mapX},${mapY}`;

      if (tile > 0) {
        let hitX =
          side === 0
            ? this.player.y + dist * rayDirY
            : this.player.x + dist * rayDirX;
        hitX -= Math.floor(hitX);

        const tileType = this.tileTypes[tile];
        const adjustedTileId = tile - 1;

        if (tileType === "door") {
          const open = this.doorStates[key] ?? 0;
          if (Math.abs(open) < 1) {
            const offset = 1 - Math.abs(open);
            const wallEdge = side === 0 ? mapX + offset : mapY + offset;
            const hitPos = side === 0 ? mapX + hitX : mapY + hitX;
            if (hitPos < wallEdge) {
              hitX = Math.min(1, hitX + Math.abs(open));
              hits.push({
                wallType: adjustedTileId,
                distance: dist,
                hitX,
                hitY: 0,
                side,
                mapX,
                mapY,
                rayDirX,
                rayDirY,
              });
              break;
            }
          }
        } else {
          hits.push({
            wallType: adjustedTileId,
            distance: dist,
            hitX,
            hitY: 0,
            side,
            mapX,
            mapY,
            rayDirX,
            rayDirY,
          });
          break;
        }
      }
    }

    // Cast ray for floor (adapted from 3DSage's floor casting)
    const floorRayDirX = rayDirX;
    const floorRayDirY = rayDirY;
    for (let y = screenH / 2; y < screenH; y++) {
      const rayPosZ = 0.5 * screenH; // Vertical position of ray (screen center to bottom)
      const currentDist = rayPosZ / (y - screenH / 2); // Distance to floor plane (y = 0)

      if (currentDist > 0 && currentDist < this.MAX_RENDER_DISTANCE) {
        const floorX = this.player.x + currentDist * floorRayDirX;
        const floorY = this.player.y + currentDist * floorRayDirY;

        const mapX = Math.floor(floorX);
        const mapY = Math.floor(floorY);
        const hitX = floorX - mapX; // Texture x-coordinate
        const hitY = floorY - mapY; // Texture y-coordinate

        if (
          mapX >= 0 &&
          mapX < this.mapWidth &&
          mapY >= 0 &&
          mapY < this.mapHeight
        ) {
          const floorTile = this.floorMap[mapY][mapX];
          if (floorTile > 0) {
            hits.push({
              wallType: floorTile,
              distance: currentDist,
              hitX: hitX,
              hitY: hitY,
              side: -1,
              mapX,
              mapY,
              rayDirX: floorRayDirX,
              rayDirY: floorRayDirY,
              isFloor: true,
            });
          }
        }
      }
    }

    for (const wall of this.thinWalls) {
      const x1 = wall.x1;
      const y1 = wall.y1;
      const x2 = wall.x2;
      const y2 = wall.y2;

      const wallCenterX = (x1 + x2) / 2;
      const wallCenterY = (y1 + y2) / 2;

      const toWallX = wallCenterX - this.player.x;
      const toWallY = wallCenterY - this.player.y;

      const distToWallCenterSq = toWallX * toWallX + toWallY * toWallY;

      if (
        distToWallCenterSq >
        this.MAX_RENDER_DISTANCE * this.MAX_RENDER_DISTANCE
      ) {
        continue;
      }

      const dotProduct = rayDirX * toWallX + rayDirY * toWallY;
      if (dotProduct < 0 && distToWallCenterSq > 4) {
        continue;
      }

      const dx = x2 - x1;
      const dy = y2 - y1;

      const denominator = dx * rayDirY - dy * rayDirX;
      if (Math.abs(denominator) < 0.0001) continue;

      const u_numerator = (this.player.x - x1) * dy - (this.player.y - y1) * dx;
      const u = u_numerator / denominator;

      const t_numerator =
        (this.player.x - x1) * rayDirY - (this.player.y - y1) * rayDirX;
      const t = t_numerator / denominator;

      if (t >= 0 && t <= 1 && u >= 0 && u <= this.MAX_RENDER_DISTANCE) {
        const dist = u;
        if (dist < 0.01) continue;

        const hitPosX = this.player.x + dist * rayDirX;
        const hitPosY = this.player.y + dist * rayDirY;

        const hitX = t;

        hits.push({
          wallType: wall.texture,
          distance: dist,
          hitX,
          hitY: 0,
          side: 2,
          mapX: Math.floor(hitPosX),
          mapY: Math.floor(hitPosY),
          rayDirX,
          rayDirY,
          orientation: wall.orientation,
        });
      }
    }

    hits.sort((a, b) => b.distance - a.distance);
    if (hits.length > this.MAX_HITS_PER_COLUMN) {
      hits.length = this.MAX_HITS_PER_COLUMN;
    }

    const minDistance = 0.05;
    for (let i = 1; i < hits.length; i++) {
      if (hits[i].distance + minDistance > hits[i - 1].distance) {
        hits.splice(i, 1);
        i--;
      }
    }

    return hits;
  }

  private renderScene() {
    const screenW = gameConfig.width;
    const screenH = gameConfig.height;

    this.graphics.clear();

    // Render ceiling
    this.graphics.beginFill(0x87ceeb);
    this.graphics.drawRect(0, 0, screenW, screenH / 2);
    this.graphics.endFill();

    for (let i = 0; i < screenW; i++) {
      const hits = this.castRay(i);

      for (const sprite of this.spritePool[i]) {
        sprite.visible = false;
      }

      for (let j = 0; j < hits.length; j++) {
        const ray = hits[j];
        const lineHeight = screenH / ray.distance;
        const drawStart = -lineHeight / 2 + screenH / 2;
        const drawEnd = lineHeight / 2 + screenH / 2;

        const sprite = this.spritePool[i][j];
        if (ray.isFloor && this.floorTextures[ray.wallType]) {
          const texture = this.floorTextures[ray.wallType];
          const texWidth = texture.width;
          const texX = Math.floor(ray.hitX * texWidth);
          const texY = Math.floor(ray.hitY * texWidth);
          const clampedTexX = Math.min(texX, texWidth - 1);
          const clampedTexY = Math.min(texY, texWidth - 1);

          const cropped = new Texture(
            texture.baseTexture,
            new Rectangle(clampedTexX, clampedTexY, 1, 1)
          );
          sprite.texture = cropped;
          sprite.y = drawStart;
          sprite.height = drawEnd - drawStart;
          sprite.width = 1;
          sprite.visible = true;
          sprite.tint = 0xffffff;
        } else {
          const texture = this.textures[ray.wallType];
          const tileType = this.tileTypes[ray.wallType + 1];

          if (tileType === "door") {
            const open = this.doorStates[`${ray.mapX},${ray.mapY}`] ?? 0;
            const doorWidth = texture?.width ?? 64;

            if (texture && Math.abs(open) < 1) {
              const texX = Math.floor(ray.hitX * doorWidth);
              const clampedTexX = Math.min(texX, doorWidth - 1);

              const cropped = new Texture(
                texture.baseTexture,
                new Rectangle(clampedTexX, 0, 1, texture.height)
              );
              sprite.texture = cropped;
              sprite.y = drawStart;
              sprite.height = drawEnd - drawStart;
              sprite.width = 1;
              sprite.visible = true;
              sprite.tint = ray.side === 0 ? 0xaaaaaa : 0xffffff;
            }

            if (Math.abs(open) > 0 && drawStart < drawEnd) {
              this.graphics.beginFill(0x000000);
              this.graphics.drawRect(i, drawStart, 1, drawEnd - drawStart);
              this.graphics.endFill();
            }
          } else if (texture) {
            const texWidth = texture.width;
            const texX = Math.floor(ray.hitX * texWidth);
            const clampedTexX = Math.min(texX, texWidth - 1);

            const cropped = new Texture(
              texture.baseTexture,
              new Rectangle(clampedTexX, 0, 1, texture.height)
            );
            sprite.texture = cropped;
            sprite.y = drawStart;
            sprite.height = drawEnd - drawStart;
            sprite.width = 1;
            sprite.visible = true;
            sprite.tint = ray.side === 0 ? 0xaaaaaa : 0xcccccc;
            sprite.alpha = 1;
          } else {
            this.graphics.beginFill(ray.side === 0 ? 0x666666 : 0x999999);
            this.graphics.drawRect(i, drawStart, 1, drawEnd - drawStart);
            this.graphics.endFill();
          }
        }
      }
    }

    // Fallback ground color
    this.graphics.beginFill(0x333333);
    this.graphics.drawRect(0, screenH / 2, screenW, screenH / 2);
    this.graphics.endFill();
  }
}