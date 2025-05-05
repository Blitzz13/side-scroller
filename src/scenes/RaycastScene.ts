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
  private moveSpeed: number = 0.02;
  private rotSpeed: number = 0.05;
  private mouseSensitivity: number = 0.002; // Added for mouse look
  private map: number[][];
  private mapWidth: number;
  private mapHeight: number;
  private doorStates: Record<string, number> = {};
  private thinWalls: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    texture: number;
  }> = [];
  private spritePool: Sprite[][] = [];
  private readonly MAX_HITS_PER_COLUMN: number = 3;
  private readonly MAX_RENDER_DISTANCE: number = 50;

  constructor(stage: Container, scale: number) {
    super(stage, scale);

    this.map = [
      [2, 2, 2, 2, 2, 2, 2, 1, 2],
      [2, 0, 0, 0, 2, 0, 0, 0, 2],
      [2, 0, 0, 0, 2, 2, 5, 2, 2],
      [4, 0, 0, 0, 2, 0, 0, 0, 2],
      [2, 0, 0, 0, 4, 0, 0, 0, 1],
      [2, 0, 0, 0, 0, 0, 0, 0, 2],
      [2, 0, 0, 0, 2, 2, 2, 0, 1],
      [2, 0, 0, 0, 2, 0, 0, 0, 1],
      [2, 0, 0, 0, 2, 0, 0, 0, 1],
      [2, 0, 0, 0, 2, 0, 0, 0, 1],
      [2, 2, 2, 2, 2, 2, 2, 2, 2],
    ];
    this.mapWidth = this.map[0].length;
    this.mapHeight = this.map.length;

    this.generateThinWalls();

    this.player = {
      x: 2,
      y: 4.5,
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
    this.loadTextures().then(() => {
      Ticker.shared.add(this.tick, this);
    });
  }

  private generateThinWalls() {
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const tile = this.map[y][x];
        if (tile >= 4 && tile <= 9) {
          if (tile === 4) {
            this.thinWalls.push({
              x1: x + 0.5,
              y1: y,
              x2: x + 0.5,
              y2: y + 1,
              texture: 4,
            });
          } else if (tile === 5) {
            this.thinWalls.push({
              x1: x,
              y1: y + 0.5,
              x2: x + 1,
              y2: y + 0.5,
              texture: 4,
            });
          } else if (tile === 6) {
            this.thinWalls.push({
              x1: x,
              y1: y,
              x2: x,
              y2: y + 1,
              texture: 4,
            });
          } else if (tile === 7) {
            this.thinWalls.push({
              x1: x + 1,
              y1: y,
              x2: x + 1,
              y2: y + 1,
              texture: 4,
            });
          } else if (tile === 8) {
            this.thinWalls.push({
              x1: x,
              y1: y,
              x2: x + 1,
              y2: y,
              texture: 4,
            });
          } else if (tile === 9) {
            this.thinWalls.push({
              x1: x,
              y1: y + 1,
              x2: x + 1,
              y2: y + 1,
              texture: 4,
            });
          }
        }
      }
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

    // Request pointer lock on click to enable mouse look
    this.stage.interactive = true;
    this.stage.on("mousedown", () => {
      document.body.requestPointerLock();
    });

    // Handle pointer lock state changes
    document.addEventListener(
      "pointerlockchange",
      this.pointerLockChangeHandler
    );
  }

  private pointerLockChangeHandler = () => {
    if (document.pointerLockElement === document.body) {
      // Pointer is locked, enable mouse movement
      this.stage.interactive = true;
    } else {
      // Pointer is unlocked, disable mouse movement
      this.stage.interactive = false;
    }
  };

  private keyDownHandler = (e: KeyboardEvent) => {
    if (e.key in this.keys) this.keys[e.key] = true;
    if (e.key === "e") this.tryOpenDoor();
  };

  private keyUpHandler = (e: KeyboardEvent) => {
    if (e.key in this.keys) this.keys[e.key] = false;
  };

  private mouseMoveHandler = (e: MouseEvent) => {
    if (document.pointerLockElement !== document.body) {
      return;
    }

    const angle = e.movementX * this.mouseSensitivity; // movementX is delta in mouse position
    const cos = Math.cos(-angle); // Negative to match FPS convention (left = turn left)
    const sin = Math.sin(-angle);

    // Rotate player direction
    const oldDirX = this.player.dirX;
    this.player.dirX = this.player.dirX * cos - this.player.dirY * sin;
    this.player.dirY = oldDirX * sin + this.player.dirY * cos;

    // Rotate camera plane
    const oldPlaneX = this.player.planeX;
    this.player.planeX = this.player.planeX * cos - this.player.planeY * sin;
    this.player.planeY = oldPlaneX * sin + this.player.planeY * cos;
  };

  private async loadTextures() {
    this.textures[1] = Texture.from("imperial_grilled_wall");
    this.textures[2] = Texture.from("basic_imperial_wall");
    this.textures[3] = Texture.from("metal_door");
    this.textures[4] = Texture.from("fence");
  }

  private tick(delta: number) {
    this.updatePlayer(delta);
    this.updateDoors(delta);
    this.renderScene();
  }

  private updatePlayer(delta: number) {
    const moveSpeed = this.moveSpeed * delta;

    const tryMove = (newX: number, newY: number) => {
      const targetX = Math.floor(newX);
      const targetY = Math.floor(newY);
      const tile = this.map[targetY]?.[targetX];
      const doorKey = `${targetX},${targetY}`;
      const isDoorOpen = tile === 3 && (this.doorStates[doorKey] ?? 0) >= 1;

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

      return tile === 0 || isDoorOpen || (tile >= 4 && tile <= 9);
    };

    if (this.keys.w) {
      const newX = this.player.x + this.player.dirX * moveSpeed;
      const newY = this.player.y + this.player.dirY * moveSpeed;
      if (tryMove(newX, newY)) {
        this.player.x = newX;
        this.player.y = newY;
      }
    }

    if (this.keys.s) {
      const newX = this.player.x - this.player.dirX * moveSpeed;
      const newY = this.player.y - this.player.dirY * moveSpeed;
      if (tryMove(newX, newY)) {
        this.player.x = newX;
        this.player.y = newY;
      }
    }

    if (this.keys.a || this.keys.d) {
      const strafeDirX = this.player.dirY; // Perpendicular to direction (rotate 90 degrees)
      const strafeDirY = -this.player.dirX;
      const sign = this.keys.a ? -1 : 1; // A = left, D = right
      const newX = this.player.x + strafeDirX * moveSpeed * sign;
      const newY = this.player.y + strafeDirY * moveSpeed * sign;
      if (tryMove(newX, newY)) {
        this.player.x = newX;
        this.player.y = newY;
      }
    }
  }

  private updateDoors(delta: number) {
    for (const key in this.doorStates) {
      if (this.doorStates[key] < 1) {
        this.doorStates[key] += 0.01 * delta;
        if (this.doorStates[key] > 1) this.doorStates[key] = 1;
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
      if (this.map[y]?.[x] === 3) {
        const key = `${x},${y}`;
        this.doorStates[key] = this.doorStates[key] || 0.01;
      }
    }
  }

  private castRay(column: number) {
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

    const hits: Array<{
      wallType: number;
      distance: number;
      hitX: number;
      side: number;
      mapX: number;
      mapY: number;
      rayDirX: number;
      rayDirY: number;
    }> = [];

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

      if (tile === 3) {
        const open = this.doorStates[key] ?? 0;
        if (open < 1) {
          const offset = 1 - open;
          const hitPos =
            side === 0
              ? this.player.x + dist * rayDirX
              : this.player.y + dist * rayDirY;

          const wallEdge = side === 0 ? mapX + offset : mapY + offset;

          if (hitPos < wallEdge) {
            let hitX =
              side === 0
                ? this.player.y + dist * rayDirY
                : this.player.x + dist * rayDirX;
            hitX -= Math.floor(hitX);
            if (tile === 3) {
              hitX = Math.min(1, hitX + open);
            }
            hits.push({
              wallType: tile,
              distance: dist,
              hitX,
              side,
              mapX,
              mapY,
              rayDirX,
              rayDirY,
            });
            break;
          }
        }
      } else if (tile > 0 && (tile < 4 || tile > 9)) {
        let hitX =
          side === 0
            ? this.player.y + dist * rayDirY
            : this.player.x + dist * rayDirX;
        hitX -= Math.floor(hitX);
        hits.push({
          wallType: tile,
          distance: dist,
          hitX,
          side,
          mapX,
          mapY,
          rayDirX,
          rayDirY,
        });
        break;
      }
    }

    for (const wall of this.thinWalls) {
      const x1 = wall.x1;
      const y1 = wall.y1;
      const x2 = wall.x2;
      const y2 = wall.y2;

      const dx = x2 - x1;
      const dy = y2 - y1;

      const denominator = dx * rayDirY - dy * rayDirX;
      if (Math.abs(denominator) < 0.0001) continue;

      const t =
        ((this.player.x - x1) * rayDirY - (this.player.y - y1) * rayDirX) /
        denominator;
      const u =
        ((this.player.x - x1) * dy - (this.player.y - y1) * dx) / denominator;

      if (t >= 0 && t <= 1 && u >= 0 && u <= this.MAX_RENDER_DISTANCE) {
        const dist = u;
        const hitPosX = this.player.x + dist * rayDirX;
        const hitPosY = this.player.y + dist * rayDirY;
        const hitX = t;
        hits.push({
          wallType: wall.texture,
          distance: dist,
          hitX,
          side: 2,
          mapX: Math.floor(hitPosX),
          mapY: Math.floor(hitPosY),
          rayDirX,
          rayDirY,
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

    for (let i = 0; i < screenW; i++) {
      const hits = this.castRay(i);

      this.graphics.beginFill(0x87ceeb);
      this.graphics.drawRect(i, 0, 1, screenH / 2);
      this.graphics.endFill();
      this.graphics.beginFill(0x333333);
      this.graphics.drawRect(i, screenH / 2, 1, screenH / 2);
      this.graphics.endFill();

      for (const sprite of this.spritePool[i]) {
        sprite.visible = false;
      }

      for (let j = 0; j < hits.length; j++) {
        const ray = hits[j];
        const lineHeight = screenH / ray.distance;
        const drawStart = -lineHeight / 2 + screenH / 2;
        const drawEnd = lineHeight / 2 + screenH / 2;

        const sprite = this.spritePool[i][j];
        const texture = this.textures[ray.wallType];

        if (ray.wallType === 3) {
          const open = this.doorStates[`${ray.mapX},${ray.mapY}`] ?? 0;
          const doorWidth = texture?.width ?? 64;

          if (texture && open < 1) {
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
            sprite.alpha = 1;
          }

          if (open > 0 && drawStart < drawEnd) {
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
}
