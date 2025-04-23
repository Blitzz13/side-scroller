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
  private wallSprites: Sprite[] = [];
  private textures: Record<number, Texture> = {};
  private moveSpeed: number = 0.02;
  private rotSpeed: number = 0.05;
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

  constructor(stage: Container, scale: number) {
    super(stage, scale);

    this.map = [
      [2, 2, 2, 2, 2, 2, 2, 1, 2],
      [2, 0, 0, 0, 2, 0, 0, 0, 2],
      [2, 0, 0, 0, 2, 2, 5, 2, 2],
      [2, 0, 0, 0, 2, 0, 0, 0, 2],
      [2, 0, 0, 0, 4, 0, 0, 0, 1], // 4: Vertical thin wall at center
      [2, 0, 0, 0, 0, 0, 0, 0, 2],
      [2, 0, 0, 0, 2, 2, 2, 0, 1],
      [2, 0, 0, 0, 2, 0, 0, 0, 1],
      [2, 0, 0, 0, 2, 0, 0, 0, 1],
      [2, 0, 0, 0, 2, 0, 0, 0, 1],
      [2, 2, 2, 2, 2, 2, 2, 2, 2],
    ];
    this.mapWidth = this.map[0].length;
    this.mapHeight = this.map.length;

    // Generate thin walls based on map
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
      const sprite = new Sprite();
      sprite.width = 1;
      sprite.x = i;
      sprite.visible = false;
      this.addChild(sprite);
      this.wallSprites.push(sprite);
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
        if (tile >= 4 && tile <= 9) { // Handle thin walls (4 to 9)
          if (tile === 4) {
            // Vertical thin wall at center
            this.thinWalls.push({
              x1: x + 0.5,
              y1: y,
              x2: x + 0.5,
              y2: y + 1,
              texture: 4,
            });
          } else if (tile === 5) {
            // Horizontal thin wall at center
            this.thinWalls.push({
              x1: x,
              y1: y + 0.5,
              x2: x + 1,
              y2: y + 0.5,
              texture: 4,
            });
          } else if (tile === 6) {
            // Vertical thin wall on the left side
            this.thinWalls.push({
              x1: x,
              y1: y,
              x2: x,
              y2: y + 1,
              texture: 4,
            });
          } else if (tile === 7) {
            // Vertical thin wall on the right side
            this.thinWalls.push({
              x1: x + 1,
              y1: y,
              x2: x + 1,
              y2: y + 1,
              texture: 4,
            });
          } else if (tile === 8) {
            // Horizontal thin wall on the top side
            this.thinWalls.push({
              x1: x,
              y1: y,
              x2: x + 1,
              y2: y,
              texture: 4,
            });
          } else if (tile === 9) {
            // Horizontal thin wall on the bottom side
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
  }

  private setupControls() {
    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);
  }

  private keyDownHandler = (e: KeyboardEvent) => {
    if (e.key in this.keys) this.keys[e.key] = true;
    if (e.key === "e") this.tryOpenDoor();
  };

  private keyUpHandler = (e: KeyboardEvent) => {
    if (e.key in this.keys) this.keys[e.key] = false;
  };

  private async loadTextures() {
    this.textures[1] = Texture.from("imperial_grilled_wall");
    this.textures[2] = Texture.from("basic_imperial_wall");
    this.textures[3] = Texture.from("metal_door");
    this.textures[4] = Texture.from("metal_door");
  }

  private tick(delta: number) {
    this.updatePlayer(delta);
    this.updateDoors(delta);
    this.renderScene();
  }

  private updatePlayer(delta: number) {
    const moveSpeed = this.moveSpeed * delta;
    const rotSpeed = this.rotSpeed * delta;

    const tryMove = (newX: number, newY: number) => {
      const targetX = Math.floor(newX);
      const targetY = Math.floor(newY);
      const tile = this.map[targetY]?.[targetX];
      const doorKey = `${targetX},${targetY}`;
      const isDoorOpen = tile === 3 && (this.doorStates[doorKey] ?? 0) >= 1;

      // Check collision with thin walls
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

      return tile === 0 || isDoorOpen || (tile >= 4 && tile <= 9); // Allow movement through thin wall cells
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
      const sign = this.keys.a ? 1 : -1;
      const angle = rotSpeed * sign;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const oldDirX = this.player.dirX;
      this.player.dirX = this.player.dirX * cos - this.player.dirY * sin;
      this.player.dirY = oldDirX * sin + this.player.dirY * cos;

      const oldPlaneX = this.player.planeX;
      this.player.planeX = this.player.planeX * cos - this.player.planeY * sin;
      this.player.planeY = oldPlaneX * sin + this.player.planeY * cos;
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

    let stepX, stepY, sideDistX, sideDistY;

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

    let hit = 0;
    let side = 0;
    let wallType = 0;
    let perpWallDist = Infinity;
    let hitX = 0;
    let mapHitX = mapX;
    let mapHitY = mapY;

    // Check for thick walls
    while (hit === 0) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }

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
          const dist =
            side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
          const hitPos =
            side === 0
              ? this.player.x + dist * rayDirX
              : this.player.y + dist * rayDirY;

          const wallEdge = side === 0 ? mapX + offset : mapY + offset;

          if (hitPos < wallEdge) {
            hit = 1;
            wallType = tile;
            perpWallDist = dist;
            hitX =
              side === 0
                ? this.player.y + dist * rayDirY
                : this.player.x + dist * rayDirX;
            hitX -= Math.floor(hitX);
            if (wallType === 3) {
              hitX = Math.min(1, hitX + open);
            }
            mapHitX = mapX;
            mapHitY = mapY;
          }
        }
      } else if (tile > 0 && (tile < 4 || tile > 9)) { // Skip thin walls (4-9) in grid-based raycasting
        hit = 1;
        wallType = tile;
        perpWallDist =
          side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
        hitX =
          side === 0
            ? this.player.y + perpWallDist * rayDirY
            : this.player.x + perpWallDist * rayDirX;
        hitX -= Math.floor(hitX);
        mapHitX = mapX;
        mapHitY = mapY;
      }
    }

    // Check for thin walls
    let closestThinWallDist = Infinity;
    let thinWallHitX = 0;
    let thinWallType = 0;

    for (const wall of this.thinWalls) {
      const x1 = wall.x1;
      const y1 = wall.y1;
      const x2 = wall.x2;
      const y2 = wall.y2;

      const dx = x2 - x1;
      const dy = y2 - y1;

      const denominator = dx * rayDirY - dy * rayDirX;
      if (Math.abs(denominator) < 0.0001) continue; // Parallel lines

      const t = ((this.player.x - x1) * rayDirY - (this.player.y - y1) * rayDirX) / denominator;
      const u = ((this.player.x - x1) * dy - (this.player.y - y1) * dx) / denominator;

      if (t >= 0 && t <= 1 && u >= 0) {
        const dist = u; // Distance along the ray
        if (dist < closestThinWallDist) {
          closestThinWallDist = dist;
          const hitPosX = this.player.x + dist * rayDirX;
          const hitPosY = this.player.y + dist * rayDirY;
          thinWallHitX = t; // Texture coordinate along the wall
          thinWallType = wall.texture;
        }
      }
    }

    // Determine which hit is closer: thick wall or thin wall
    if (closestThinWallDist < perpWallDist) {
      perpWallDist = closestThinWallDist;
      hitX = thinWallHitX;
      wallType = thinWallType;
      side = 2; // Special side value for thin walls
    }

    return {
      wallType,
      distance: perpWallDist,
      hitX,
      side,
      mapX: mapHitX,
      mapY: mapHitY,
      rayDirX,
      rayDirY,
    };
  }

  private renderScene() {
    const screenW = gameConfig.width;
    const screenH = gameConfig.height;

    this.graphics.clear();

    for (let i = 0; i < screenW; i++) {
      const ray = this.castRay(i);
      const lineHeight = screenH / ray.distance;
      const drawStart = -lineHeight / 2 + screenH / 2;
      const drawEnd = lineHeight / 2 + screenH / 2;

      if (drawStart > 0) {
        this.graphics.beginFill(0x87ceeb);
        this.graphics.drawRect(i, 0, 1, drawStart);
        this.graphics.endFill();
      }

      const sprite = this.wallSprites[i];
      const texture = this.textures[ray.wallType];

      if (ray.wallType === 3) {
        // Handle doors
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
          sprite.tint = ray.side === 1 ? 0xaaaaaa : 0xffffff;
        } else {
          sprite.visible = false;
        }

        if (open > 0 && drawStart < drawEnd) {
          this.graphics.beginFill(0x000000);
          this.graphics.drawRect(i, drawStart, 1, drawEnd - drawStart);
          this.graphics.endFill();
        }
      } else if (texture) {
        // Handle regular walls and thin walls
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
        sprite.tint = ray.side === 1 ? 0xaaaaaa : ray.side === 2 ? 0xcccccc : 0xffffff;
      } else {
        sprite.visible = false;
        this.graphics.beginFill(ray.side === 1 ? 0x666666 : 0x999999);
        this.graphics.drawRect(i, drawStart, 1, drawEnd - drawStart);
        this.graphics.endFill();
      }

      if (drawEnd < screenH) {
        this.graphics.beginFill(0x333333);
        this.graphics.drawRect(i, drawEnd, 1, screenH - drawEnd);
        this.graphics.endFill();
      }
    }
  }
}