import {
  AnimatedSprite,
  Assets,
  Container,
  Graphics,
  Rectangle,
  SCALE_MODES,
  Spritesheet,
  Texture,
} from "pixi.js";
import { sound } from "@pixi/sound";
import { gameConfig } from "../../configs/GameConfig";
import { MapObject } from "./types";

export interface ActiveDetonator {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  timer: number;
  maxTimer: number;
  isLanded: boolean;
  radius: number;
  damage: number;
  bounces: number;
  bounciness: number;
  wallBounciness: number;
  friction: number;
  maxBounces: number;
}

export interface ActiveExplosion {
  id: number;
  x: number;
  y: number;
  z: number;
  sprite: AnimatedSprite;
  mask: Graphics;
  scale: number;
}

export class ThermalDetonatorManager {
  private container: Container;
  private detonators: ActiveDetonator[] = [];
  private explosions: ActiveExplosion[] = [];
  private nextId: number = 1;

  private detonatorTexture: Texture | null = null;
  private detonatorSlices: Texture[] = [];
  private explosionFrames: Texture[] = [];

  public onDetonate?: (
    x: number,
    y: number,
    z: number,
    radius: number,
    damage: number
  ) => void;

  constructor(container: Container) {
    this.container = container;
  }

  public async initTextures(): Promise<void> {
    // 1. Load detonator pickup texture for 3D in-flight/on-ground billboard
    try {
      let tex: Texture | null = null;
      const texKeys = [
        "thermal_detonator_pickup",
        "./assets/raycast/pickups/thermal_detonator_pickup.png",
        "assets/raycast/pickups/thermal_detonator_pickup.png",
      ];
      for (const k of texKeys) {
        if (Assets.cache.has(k)) {
          tex = Assets.get(k);
          break;
        }
      }
      if (!tex) {
        tex = await Assets.load("./assets/raycast/pickups/thermal_detonator_pickup.png");
      }

      if (tex) {
        if (tex.baseTexture) {
          tex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
        }
        this.detonatorTexture = tex;
        this.detonatorSlices = this.sliceTexture(tex);
      }
    } catch (err) {
      console.warn("Failed to load thermal detonator pickup texture:", err);
    }

    // 2. Load explosion spritesheet for 3D explosion effect
    try {
      let sheet: Spritesheet | null = null;
      const sheetKeys = [
        "explosion",
        "./assets/explosion.json",
        "assets/explosion.json",
      ];
      for (const k of sheetKeys) {
        if (Assets.cache.has(k)) {
          sheet = Assets.get(k);
          break;
        }
      }
      if (!sheet) {
        sheet = await Assets.load("./assets/explosion.json");
      }

      if (sheet) {
        this.explosionFrames = [];
        for (let i = 0; i <= 16; i++) {
          const pad = i < 10 ? `0${i}` : `${i}`;
          const frameName = `explosion_${pad}.png`;
          const frameTex = sheet.textures[frameName];
          if (frameTex) {
            if (frameTex.baseTexture) {
              frameTex.baseTexture.scaleMode = SCALE_MODES.NEAREST;
            }
            this.explosionFrames.push(frameTex);
          }
        }
      }
    } catch (err) {
      console.warn("Failed to load explosion.json:", err);
    }
  }

  private sliceTexture(texture: Texture): Texture[] {
    const slices: Texture[] = [];
    const texW = texture.width || 64;
    const texH = texture.height || 64;
    for (let x = 0; x < texW; x++) {
      slices.push(
        new Texture(texture.baseTexture, new Rectangle(x, 0, 1, texH))
      );
    }
    return slices;
  }

  public throwDetonator(
    playerX: number,
    playerY: number,
    playerZ: number,
    dirX: number,
    dirY: number,
    options?: {
      fuseTime?: number;
      throwSpeed?: number;
      explosionRadius?: number;
      damage?: number;
      bounciness?: number;
      wallBounciness?: number;
      friction?: number;
      maxBounces?: number;
    }
  ): ActiveDetonator {
    const fuseTime = options?.fuseTime ?? 2.0;
    const throwSpeed = options?.throwSpeed ?? 8.5;
    const radius = options?.explosionRadius ?? 3.5;
    const damage = options?.damage ?? 150;
    const bounciness = options?.bounciness ?? 0.28;
    const wallBounciness = options?.wallBounciness ?? 0.30;
    const friction = options?.friction ?? 0.80;
    const maxBounces = options?.maxBounces ?? 2;

    const det: ActiveDetonator = {
      id: this.nextId++,
      x: playerX + dirX * 0.45,
      y: playerY + dirY * 0.45,
      z: (playerZ ?? 0) + 0.45, // Thrown from player chest/eye height
      vx: dirX * throwSpeed,
      vy: dirY * throwSpeed,
      vz: 2.2, // Controlled initial upward arc velocity
      timer: fuseTime,
      maxTimer: fuseTime,
      isLanded: false,
      radius,
      damage,
      bounces: 0,
      bounciness,
      wallBounciness,
      friction,
      maxBounces,
    };

    this.detonators.push(det);

    // Play throw swoosh sound
    try {
      sound.play("reload_sound", { volume: 0.65 });
    } catch (e) {}

    return det;
  }

  public update(
    delta: number,
    mapFlat: Int32Array,
    mapWidth: number,
    mapHeight: number,
    doorStatesFlat: Float64Array,
    thinWalls: Array<{ x1: number; y1: number; x2: number; y2: number }>
  ): void {
    const dt = delta / 60; // Convert to seconds
    const gravity = 8.5; // Acceleration due to gravity

    for (let i = this.detonators.length - 1; i >= 0; i--) {
      const det = this.detonators[i];

      // 1. Countdown fuse timer
      det.timer -= dt;
      if (det.timer <= 0) {
        this.explode(det);
        this.detonators.splice(i, 1);
        continue;
      }

      // 2. Vertical Physics (gravity and floor bounce)
      if (!det.isLanded) {
        det.vz -= gravity * dt;
        det.z += det.vz * dt;

        // Ground collision (z <= 0)
        if (det.z <= 0) {
          det.z = 0;
          det.bounces++;

          if (
            Math.abs(det.vz) > 0.4 &&
            det.bounces <= det.maxBounces &&
            det.bounciness > 0.05
          ) {
            // Bounce upward with energy loss based on configurable bounciness
            det.vz = -det.vz * det.bounciness;
            det.vx *= Math.max(0.3, det.bounciness * 1.2);
            det.vy *= Math.max(0.3, det.bounciness * 1.2);
          } else {
            // Settle on ground (no more bouncing)
            det.vz = 0;
            det.isLanded = true;
          }
        }
      } else {
        // Rolling friction on floor
        det.z = 0;
        const rollFriction = Math.pow(det.friction, delta);
        det.vx *= rollFriction;
        det.vy *= rollFriction;

        if (Math.abs(det.vx) < 0.02 && Math.abs(det.vy) < 0.02) {
          det.vx = 0;
          det.vy = 0;
        }
      }

      // 3. Horizontal Physics & Wall Collisions
      if (Math.abs(det.vx) > 0.01 || Math.abs(det.vy) > 0.01) {
        const nextX = det.x + det.vx * dt;
        const nextY = det.y + det.vy * dt;

        // Check collision along X
        if (!this.checkWallCollision(nextX, det.y, mapFlat, mapWidth, mapHeight, doorStatesFlat, thinWalls)) {
          det.x = nextX;
        } else {
          // Bounce off X wall using configurable wallBounciness
          det.vx = -det.vx * det.wallBounciness;
        }

        // Check collision along Y
        if (!this.checkWallCollision(det.x, nextY, mapFlat, mapWidth, mapHeight, doorStatesFlat, thinWalls)) {
          det.y = nextY;
        } else {
          // Bounce off Y wall using configurable wallBounciness
          det.vy = -det.vy * det.wallBounciness;
        }
      }
    }
  }

  private checkWallCollision(
    wx: number,
    wy: number,
    mapFlat: Int32Array,
    mapWidth: number,
    mapHeight: number,
    doorStatesFlat: Float64Array,
    thinWalls: Array<{ x1: number; y1: number; x2: number; y2: number }>
  ): boolean {
    const radius = 0.15;
    const minX = Math.floor(wx - radius);
    const maxX = Math.floor(wx + radius);
    const minY = Math.floor(wy - radius);
    const maxY = Math.floor(wy + radius);

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        if (cx < 0 || cx >= mapWidth || cy < 0 || cy >= mapHeight) {
          return true;
        }
        const flatIdx = cy * mapWidth + cx;
        const tile = mapFlat[flatIdx];
        if (tile > 0) {
          const doorState = doorStatesFlat[flatIdx];
          const isOpen = doorState !== undefined && Math.abs(doorState) > 0.6;
          if (!isOpen) return true;
        }
      }
    }

    for (const wall of thinWalls) {
      const wMinX = Math.min(wall.x1, wall.x2) - radius;
      const wMaxX = Math.max(wall.x1, wall.x2) + radius;
      const wMinY = Math.min(wall.y1, wall.y2) - radius;
      const wMaxY = Math.max(wall.y1, wall.y2) + radius;
      if (wx >= wMinX && wx <= wMaxX && wy >= wMinY && wy <= wMaxY) {
        return true;
      }
    }

    return false;
  }

  public explode(det: ActiveDetonator): void {
    // 1. Play explosion sound
    try {
      sound.play("explosion_sound", { volume: 0.85 });
    } catch (e) {
      console.warn("Failed to play explosion sound:", e);
    }

    // 2. Spawn 3D animated explosion sprite
    if (this.explosionFrames.length > 0) {
      const sprite = new AnimatedSprite(this.explosionFrames);
      sprite.anchor.set(0.5, 0.75); // Centered horizontally, anchored slightly below middle
      sprite.animationSpeed = 0.42;
      sprite.loop = false;
      sprite.roundPixels = true;
      sprite.visible = false;

      const mask = new Graphics();
      sprite.mask = mask;

      this.container.addChild(mask);
      this.container.addChild(sprite);

      const expObj: ActiveExplosion = {
        id: this.nextId++,
        x: det.x,
        y: det.y,
        z: Math.max(0, det.z),
        sprite,
        mask,
        scale: 0.85,
      };

      sprite.onComplete = () => {
        this.removeExplosion(expObj);
      };

      sprite.play();
      this.explosions.push(expObj);
    }

    // 3. Trigger AOE callback (damages enemies, props, and player)
    if (this.onDetonate) {
      this.onDetonate(det.x, det.y, det.z, det.radius, det.damage);
    }
  }

  private removeExplosion(exp: ActiveExplosion): void {
    const idx = this.explosions.indexOf(exp);
    if (idx !== -1) {
      this.explosions.splice(idx, 1);
    }
    if (exp.sprite) {
      exp.sprite.stop();
      if (exp.sprite.parent) {
        exp.sprite.parent.removeChild(exp.sprite);
      }
      exp.sprite.destroy();
    }
    if (exp.mask) {
      if (exp.mask.parent) {
        exp.mask.parent.removeChild(exp.mask);
      }
      exp.mask.destroy();
    }
  }

  /**
   * Returns active detonators formatted as billboard map objects for column rendering with Z-buffer occlusion.
   */
  public getVisibleMapObjects(): MapObject[] {
    const list: MapObject[] = [];

    for (const det of this.detonators) {
      // Blinking red LED effect as timer runs down
      const blinkPeriod = det.timer < 0.8 ? 0.12 : det.timer < 1.4 ? 0.22 : 0.35;
      const isRed = det.timer % blinkPeriod < blinkPeriod * 0.5;
      const tint = isRed ? 0xff4444 : 0xffffff;

      list.push({
        x: det.x,
        y: det.y,
        texture: -1,
        customTexture: this.detonatorTexture ?? undefined,
        customSlices: this.detonatorSlices.length > 0 ? this.detonatorSlices : undefined,
        scale: 0.16,
        scaleX: 0.16,
        scaleY: 0.16,
        z: det.z,
        anchor: "floor",
        tint,
      });
    }

    return list;
  }

  /**
   * Renders active 3D explosions with camera perspective projection and run-length Z-buffer occlusion.
   */
  public renderExplosions(
    playerX: number,
    playerY: number,
    playerZ: number,
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

    for (const exp of this.explosions) {
      const sprite = exp.sprite;
      if (!sprite) continue;

      const dx = exp.x - playerX;
      const dy = exp.y - playerY;

      // Transform into camera space
      const transformX = invDet * (dirY * dx - dirX * dy);
      const transformY = invDet * (-planeY * dx + planeX * dy);

      if (transformY <= 0.1 || transformY > maxRenderDistance) {
        sprite.visible = false;
        continue;
      }

      const spriteScreenX = Math.floor(
        (screenW / 2) * (1 + transformX / transformY)
      );
      const baseHeight = Math.abs(Math.floor(screenH / transformY));
      const spriteHeight = Math.max(1, Math.floor(baseHeight * exp.scale));
      const spriteWidth = spriteHeight; // 1:1 aspect ratio

      // Vertical position taking height z and player elevation into account
      const relZ = exp.z - (playerZ ?? 0);
      const floorY = Math.floor(screenH / 2 + baseHeight / 2) - relZ * baseHeight;
      const screenY = Math.floor(floorY - spriteHeight * 0.35);

      const halfW = spriteWidth / 2;
      const drawStartX = Math.max(0, Math.floor(spriteScreenX - halfW));
      const drawEndX = Math.min(screenW - 1, Math.floor(spriteScreenX + halfW));

      // Per-column occlusion mask against Z-buffer
      const mask = exp.mask;
      if (mask) {
        mask.clear();
        let runStart = -1;
        let anyVisible = false;

        for (let col = drawStartX; col <= drawEndX; col++) {
          if (transformY < zBuffer[col]) {
            if (runStart < 0) runStart = col;
            anyVisible = true;
          } else {
            if (runStart >= 0) {
              mask.beginFill(0xffffff);
              mask.drawRect(runStart, 0, col - runStart, screenH);
              mask.endFill();
              runStart = -1;
            }
          }
        }
        if (runStart >= 0) {
          mask.beginFill(0xffffff);
          mask.drawRect(runStart, 0, drawEndX - runStart + 1, screenH);
          mask.endFill();
        }

        if (!anyVisible && drawStartX <= drawEndX) {
          sprite.visible = false;
          continue;
        }
      }

      sprite.visible = true;
      sprite.x = spriteScreenX;
      sprite.y = screenY;
      sprite.width = spriteWidth;
      sprite.height = spriteHeight;

      // Bright explosion glow
      sprite.tint = 0xffeedd;
      sprite.zIndex = Math.floor((maxRenderDistance - transformY) * 1000) + 50;
    }
  }

  public dispose(): void {
    for (const exp of this.explosions) {
      if (exp.sprite) exp.sprite.destroy();
      if (exp.mask) exp.mask.destroy();
    }
    this.explosions = [];
    this.detonators = [];
  }
}
