import {
  Assets,
  BLEND_MODES,
  Container,
  Graphics,
  Sprite,
  Texture,
} from "pixi.js";
import { gameConfig } from "../../configs/GameConfig";
import { RaycastEnemy } from "./RaycastEnemy";

export interface ActiveLaser {
  id: number;
  startX: number;
  startY: number;
  startZ: number;
  currentX: number;
  currentY: number;
  currentZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  distanceTraveled: number;
  totalDistance: number;
  damage: number;
  targetEnemy: RaycastEnemy | null;
  targetBreakable: any | null;
  onEnemyKilled?: (enemy: RaycastEnemy) => void;
  onBreakableDestroyed?: (b: any) => void;
  sprite: Sprite;
  alive: boolean;
}

export interface ActiveLaserImpact {
  x: number;
  y: number;
  z: number;
  timer: number;
  maxTimer: number;
  graphics: Graphics;
  sparks: Array<{ vx: number; vy: number; vz: number; color: number; length: number }>;
}

export class RaycastLaserManager {
  private container: Container;
  private laserTexture: Texture | null = null;
  private lasers: ActiveLaser[] = [];
  private impacts: ActiveLaserImpact[] = [];
  private laserSpritePool: Sprite[] = [];
  private impactGraphicsPool: Graphics[] = [];
  private nextLaserId: number = 1;

  constructor(container: Container) {
    this.container = container;
  }

  public async initTextures(): Promise<void> {
    const candidateKeys = [
      "laser",
      "./assets/laser.png",
      "assets/laser.png",
    ];

    for (const k of candidateKeys) {
      if (Assets.cache.has(k)) {
        this.laserTexture = Assets.get(k);
        break;
      }
    }

    if (!this.laserTexture) {
      try {
        this.laserTexture = await Assets.load("./assets/laser.png");
      } catch {
        try {
          this.laserTexture = await Assets.load("assets/laser.png");
        } catch (e) {
          console.warn("Failed to load laser.png:", e);
        }
      }
    }

    if (!this.laserTexture) {
      try {
        this.laserTexture = Texture.from("laser");
      } catch {
        // Fallback procedural texture if texture load is delayed
        this.laserTexture = Texture.WHITE;
      }
    }
  }

  /**
   * Fires a 3D laser bolt originating at the weapon muzzle in screen space and
   * flying along the aim trajectory towards the targeted enemy or obstacle.
   */
  public fireLaser(
    playerX: number,
    playerY: number,
    dirX: number,
    dirY: number,
    planeX: number,
    planeY: number,
    muzzleScreenPos: { x: number; y: number },
    target: { x: number; y: number; z?: number },
    damage: number,
    targetEnemy: RaycastEnemy | null = null,
    targetBreakable: any | null = null,
    onEnemyKilled?: (enemy: RaycastEnemy) => void,
    onBreakableDestroyed?: (b: any) => void
  ): void {
    const screenW = gameConfig.width;
    const screenH = gameConfig.height;

    // Small near-camera depth distance where the laser begins emerging from the weapon
    const d0 = 0.35;
    const muzzleX = muzzleScreenPos.x;
    const muzzleY = muzzleScreenPos.y;

    // Camera space coordinates corresponding exactly to muzzle screen position
    const transformX = d0 * ((2 * muzzleX) / screenW - 1);

    // World space start position derived mathematically from inverse camera transformation
    const startX = playerX + dirX * d0 + planeX * transformX;
    const startY = playerY + dirY * d0 + planeY * transformX;
    const startZ = 0.5 - ((muzzleY - screenH / 2) / (screenH / 2)) * (d0 * 0.5);

    const targetX = target.x;
    const targetY = target.y;
    const targetZ = target.z ?? 0.5;

    const dx = targetX - startX;
    const dy = targetY - startY;
    const dz = targetZ - startZ;
    const totalDistance = Math.max(0.1, Math.hypot(dx, dy, dz));

    const vx = dx / totalDistance;
    const vy = dy / totalDistance;
    const vz = dz / totalDistance;

    // Acquire or create pooled laser sprite
    let sprite: Sprite;
    if (this.laserSpritePool.length > 0) {
      sprite = this.laserSpritePool.pop()!;
    } else {
      sprite = new Sprite(this.laserTexture ?? Texture.WHITE);
      sprite.anchor.set(0.5, 0.5);
      sprite.blendMode = BLEND_MODES.ADD;
      this.container.addChild(sprite);
    }

    if (this.laserTexture) {
      sprite.texture = this.laserTexture;
    }
    sprite.visible = false;

    const laser: ActiveLaser = {
      id: this.nextLaserId++,
      startX,
      startY,
      startZ,
      currentX: startX,
      currentY: startY,
      currentZ: startZ,
      targetX,
      targetY,
      targetZ,
      vx,
      vy,
      vz,
      speed: 38.0, // High-speed, responsive sci-fi blaster bolt (units/sec)
      distanceTraveled: 0,
      totalDistance,
      damage,
      targetEnemy,
      targetBreakable,
      onEnemyKilled,
      onBreakableDestroyed,
      sprite,
      alive: true,
    };

    this.lasers.push(laser);
  }

  public update(
    delta: number,
    activeEnemies: RaycastEnemy[] = [],
    breakableManager?: any
  ): void {
    const dt = delta / 60;

    // 1. Update laser projectile positions and collisions
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const laser = this.lasers[i];
      if (!laser.alive) {
        this.destroyLaser(laser, i);
        continue;
      }

      const stepDist = laser.speed * dt;
      laser.distanceTraveled += stepDist;
      const progress = Math.min(1.0, laser.distanceTraveled / laser.totalDistance);

      laser.currentX = laser.startX + (laser.targetX - laser.startX) * progress;
      laser.currentY = laser.startY + (laser.targetY - laser.startY) * progress;
      laser.currentZ = laser.startZ + (laser.targetZ - laser.startZ) * progress;

      // Check collision with targeted enemy or any other enemy in flight path
      let hitEnemy: RaycastEnemy | null = null;
      if (laser.targetEnemy && !laser.targetEnemy.isDead) {
        const distToTarget = Math.hypot(
          laser.targetEnemy.x - laser.currentX,
          laser.targetEnemy.y - laser.currentY
        );
        if (distToTarget < 0.55 || progress >= 0.98) {
          hitEnemy = laser.targetEnemy;
        }
      }

      if (!hitEnemy) {
        for (const enemy of activeEnemies) {
          if (enemy.isDead) continue;
          const dist = Math.hypot(
            enemy.x - laser.currentX,
            enemy.y - laser.currentY
          );
          if (dist < 0.45) {
            hitEnemy = enemy;
            break;
          }
        }
      }

      if (hitEnemy) {
        hitEnemy.takeDamage(laser.damage, laser.onEnemyKilled);
        this.spawnImpact(laser.currentX, laser.currentY, laser.currentZ);
        laser.alive = false;
        this.destroyLaser(laser, i);
        continue;
      }

      // Check target arrival (breakable or wall)
      if (progress >= 1.0) {
        if (laser.targetBreakable && breakableManager) {
          breakableManager.damageBreakable(
            laser.targetBreakable,
            laser.damage,
            laser.onBreakableDestroyed
          );
        }
        this.spawnImpact(laser.targetX, laser.targetY, laser.targetZ);
        laser.alive = false;
        this.destroyLaser(laser, i);
        continue;
      }
    }

    // 2. Update laser impact sparks
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const imp = this.impacts[i];
      imp.timer -= dt;
      if (imp.timer <= 0) {
        imp.graphics.clear();
        imp.graphics.visible = false;
        this.impactGraphicsPool.push(imp.graphics);
        this.impacts.splice(i, 1);
      }
    }
  }

  private destroyLaser(laser: ActiveLaser, index: number): void {
    laser.sprite.visible = false;
    this.laserSpritePool.push(laser.sprite);
    this.lasers.splice(index, 1);
  }

  private spawnImpact(x: number, y: number, z: number): void {
    let gfx: Graphics;
    if (this.impactGraphicsPool.length > 0) {
      gfx = this.impactGraphicsPool.pop()!;
    } else {
      gfx = new Graphics();
      this.container.addChild(gfx);
    }
    gfx.visible = true;

    const colors = [0xffffff, 0xffe066, 0xff6622, 0xff2200];
    const sparks: Array<{ vx: number; vy: number; vz: number; color: number; length: number }> = [];
    for (let i = 0; i < 7; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.2;
      sparks.push({
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: (Math.random() - 0.4) * speed,
        color: colors[Math.floor(Math.random() * colors.length)],
        length: 4 + Math.random() * 6,
      });
    }

    this.impacts.push({
      x,
      y,
      z,
      timer: 0.16,
      maxTimer: 0.16,
      graphics: gfx,
      sparks,
    });
  }

  /**
   * Projects active laser sprites and impact sparks onto the 3D screen buffer with Z-buffer occlusion.
   */
  public render(
    playerX: number,
    playerY: number,
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

    // 1. Render flying 3D laser bolts
    for (let i = 0; i < this.lasers.length; i++) {
      const laser = this.lasers[i];
      if (!laser.alive) {
        laser.sprite.visible = false;
        continue;
      }

      const dx = laser.currentX - playerX;
      const dy = laser.currentY - playerY;

      // Transform into camera space
      const transformX = invDet * (dirY * dx - dirX * dy);
      const transformY = invDet * (-planeY * dx + planeX * dy);

      if (transformY <= 0.05 || transformY > maxRenderDistance) {
        laser.sprite.visible = false;
        continue;
      }

      const spriteScreenX = (screenW / 2) * (1 + transformX / transformY);
      const baseHeight = Math.abs(screenH / transformY);
      const spriteScreenY = screenH / 2 + (0.5 - laser.currentZ) * baseHeight;

      // Z-buffer wall occlusion check
      const col = Math.floor(spriteScreenX);
      if (col >= 0 && col < screenW && transformY > zBuffer[col] + 0.15) {
        laser.sprite.visible = false;
        continue;
      }

      // Compute perspective flight angle along projected trajectory
      const aheadX = laser.currentX + laser.vx * 0.4;
      const aheadY = laser.currentY + laser.vy * 0.4;
      const aheadZ = laser.currentZ + laser.vz * 0.4;

      const aheadDx = aheadX - playerX;
      const aheadDy = aheadY - playerY;
      const aheadTransX = invDet * (dirY * aheadDx - dirX * aheadDy);
      const aheadTransY = invDet * (-planeY * aheadDx + planeX * aheadDy);

      let trajectoryAngle = 0;
      if (aheadTransY > 0.05) {
        const aheadScreenX = (screenW / 2) * (1 + aheadTransX / aheadTransY);
        const aheadBaseH = Math.abs(screenH / aheadTransY);
        const aheadScreenY = screenH / 2 + (0.5 - aheadZ) * aheadBaseH;
        trajectoryAngle = Math.atan2(
          aheadScreenY - spriteScreenY,
          aheadScreenX - spriteScreenX
        );
      }

      // True 3D perspective foreshortening:
      // - Near weapon muzzle (transformY ≈ 0.35), the bolt is elongated (4:1 aspect ratio) along its trajectory.
      // - In the distance (transformY >= 2.5), viewing the bolt along its flight path from behind naturally
      //   compresses its apparent length into a compact, symmetrical rounded plasma pulse (1:1 aspect ratio).
      //   This completely removes any awkward directional tilt or artificial mid-air rotation.
      const thickScale = Math.min(0.70, Math.max(0.12, 0.45 / transformY));
      const foreshortenT = Math.min(1.0, Math.max(0.0, (transformY - 0.35) / 2.2));
      const smoothT = foreshortenT * foreshortenT * (3 - 2 * foreshortenT);
      const targetAspect = 4.0 * (1 - smoothT) + 1.05 * smoothT;
      const lenScale = Math.min(0.85, Math.max(0.035, thickScale * (targetAspect / 4.0)));

      laser.sprite.rotation = trajectoryAngle;
      laser.sprite.scale.set(lenScale, thickScale);
      laser.sprite.position.set(spriteScreenX, spriteScreenY);
      laser.sprite.visible = true;
    }

    // 2. Render impact sparks
    for (let i = 0; i < this.impacts.length; i++) {
      const imp = this.impacts[i];
      const dx = imp.x - playerX;
      const dy = imp.y - playerY;

      const transformX = invDet * (dirY * dx - dirX * dy);
      const transformY = invDet * (-planeY * dx + planeX * dy);

      if (transformY <= 0.1 || transformY > maxRenderDistance) {
        imp.graphics.visible = false;
        continue;
      }

      const spriteScreenX = (screenW / 2) * (1 + transformX / transformY);
      const baseHeight = Math.abs(screenH / transformY);
      const spriteScreenY = screenH / 2 + (0.5 - imp.z) * baseHeight;

      const col = Math.floor(spriteScreenX);
      if (col >= 0 && col < screenW && transformY > zBuffer[col] + 0.1) {
        imp.graphics.visible = false;
        continue;
      }

      const alpha = Math.max(0, imp.timer / imp.maxTimer);
      const elapsed = imp.maxTimer - imp.timer;
      const scale = Math.min(1.5, Math.max(0.2, 1.0 / transformY));

      imp.graphics.clear();
      // Core bright flash circle
      imp.graphics.beginFill(0xffffff, alpha * 0.9);
      imp.graphics.drawCircle(spriteScreenX, spriteScreenY, 6 * scale * alpha);
      imp.graphics.endFill();

      // Outer plasma burst circle
      imp.graphics.beginFill(0xff4411, alpha * 0.5);
      imp.graphics.drawCircle(spriteScreenX, spriteScreenY, 14 * scale * alpha);
      imp.graphics.endFill();

      // Radiating spark lines
      for (const spark of imp.sparks) {
        const sx = spriteScreenX + spark.vx * elapsed * 60 * scale;
        const sy = spriteScreenY + spark.vy * elapsed * 60 * scale;
        const ex = sx + (spark.vx / 2) * spark.length * scale;
        const ey = sy + (spark.vy / 2) * spark.length * scale;

        imp.graphics.lineStyle(1.8 * scale, spark.color, alpha);
        imp.graphics.moveTo(sx, sy);
        imp.graphics.lineTo(ex, ey);
      }

      imp.graphics.visible = true;
    }
  }

  public dispose(): void {
    for (const laser of this.lasers) {
      laser.sprite.destroy();
    }
    this.lasers = [];

    for (const sprite of this.laserSpritePool) {
      sprite.destroy();
    }
    this.laserSpritePool = [];

    for (const imp of this.impacts) {
      imp.graphics.destroy();
    }
    this.impacts = [];

    for (const gfx of this.impactGraphicsPool) {
      gfx.destroy();
    }
    this.impactGraphicsPool = [];
  }
}
