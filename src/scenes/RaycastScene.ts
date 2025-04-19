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
  private player: any;
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

  constructor(stage: Container, scale: number) {
    super(stage, scale);

    this.map = [
      [2, 2, 2, 2, 2, 2, 2, 1, 2],
      [2, 0, 0, 0, 2, 0, 0, 0, 2],
      [2, 0, 0, 0, 2, 2, 0, 2, 2],
      [2, 0, 0, 0, 2, 0, 0, 0, 2],
      [2, 0, 0, 0, 0, 0, 0, 0, 1],
      [2, 0, 0, 0, 2, 0, 0, 0, 2],
      [2, 0, 0, 0, 2, 2, 2, 0, 1],
      [2, 0, 0, 0, 2, 0, 0, 0, 1],
      [2, 0, 0, 0, 2, 0, 0, 0, 1],
      [2, 0, 0, 0, 2, 0, 0, 0, 1],
      [2, 2, 2, 2, 2, 2, 2, 2, 2],
    ];
    this.mapWidth = this.map[0].length;
    this.mapHeight = this.map.length;

    this.player = {
      x: 2,
      y: 2,
      dirX: -2,
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
  };

  private keyUpHandler = (e: KeyboardEvent) => {
    if (e.key in this.keys) this.keys[e.key] = false;
  };

  private async loadTextures() {
    this.textures[1] = Texture.from("imperial_grilled_wall");
    this.textures[2] = Texture.from("basic_imperial_wall");
  }

  private tick(delta: number) {
    this.updatePlayer(delta);
    this.renderScene();
  }

  private updatePlayer(delta: number) {
    const moveSpeed = this.moveSpeed * delta;
    const rotSpeed = this.rotSpeed * delta;

    if (this.keys.w) {
      const newX = this.player.x + this.player.dirX * moveSpeed;
      const newY = this.player.y + this.player.dirY * moveSpeed;
      if (this.map[Math.floor(newY)][Math.floor(newX)] === 0) {
        this.player.x = newX;
        this.player.y = newY;
      }
    }

    if (this.keys.s) {
      const newX = this.player.x - this.player.dirX * moveSpeed;
      const newY = this.player.y - this.player.dirY * moveSpeed;
      if (this.map[Math.floor(newY)][Math.floor(newX)] === 0) {
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
      if (this.map[mapY][mapX] > 0) hit = 1;
    }

    const perpWallDist =
      side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;

    let wallX =
      side === 0
        ? this.player.y + perpWallDist * rayDirY
        : this.player.x + perpWallDist * rayDirX;
    wallX -= Math.floor(wallX);

    return {
      wallType: this.map[mapY][mapX],
      distance: perpWallDist,
      hitX: wallX,
      side,
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

      // Ceiling
      if (drawStart > 0) {
        this.graphics.beginFill(0x87ceeb);
        this.graphics.drawRect(i, 0, 2, drawStart);
        this.graphics.endFill();
      }

      // Wall
      const sprite = this.wallSprites[i];
      const texture = this.textures[ray.wallType];

      if (texture) {
        const texWidth = texture.width;
        const texX = Math.floor(ray.hitX * texWidth);
        const clampedTexX = Math.min(texX, texWidth - 2);

        const cropped = new Texture(
          texture.baseTexture,
          new Rectangle(clampedTexX, 0, 0.05, texture.height)
        );
        sprite.texture = cropped;
        sprite.y = drawStart;
        sprite.height = drawEnd - drawStart;
        sprite.visible = true;
        sprite.tint = ray.side === 1 ? 0xaaaaaa : 0xffffff;
      } else {
        sprite.visible = false;
        this.graphics.beginFill(ray.side === 1 ? 0x666666 : 0x999999);
        this.graphics.drawRect(i, drawStart, 2, drawEnd - drawStart);
        this.graphics.endFill();
      }

      // Floor
      if (drawEnd < screenH) {
        this.graphics.beginFill(0x333333);
        this.graphics.drawRect(i, drawEnd, 2, screenH - drawEnd);
        this.graphics.endFill();
      }
    }
  }
}
