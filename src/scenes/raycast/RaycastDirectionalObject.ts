import { AnimatedSprite, Graphics, Texture } from "pixi.js";
import { gameConfig } from "../../configs/GameConfig";

export interface DirectionalSectorResult {
  dirName: string;
  isFlipped: boolean;
  deg: number;
  absDeg: number;
}

/**
 * Base class for all 8-directional entities in the raycasting engine.
 * Handles:
 * - 2D world positioning and facing orientation
 * - Relative angle calculation and sector categorization with hysteresis
 * - Horizontal sprite flipping for bilateral symmetry
 * - AnimatedSprite creation and texture management
 * - Zero-allocation camera projection, per-column wall occlusion masking, and depth sorting
 */
export class RaycastDirectionalObject {
  public id: number;
  public x: number;
  public y: number;
  public dirX: number = 0;
  public dirY: number = 1;

  public scale: number = 1;
  public scaleX?: number;
  public scaleY?: number;
  public referenceHeight: number = 64;
  public anchor: string = "floor";
  public currentVOffset: number = 0;
  public z?: number;
  public floatingBob: boolean = false;
  public hitRadius: number = 0.5;
  public blocksMovement: boolean = true;

  // Pixi render objects
  public animatedSprite!: AnimatedSprite;
  public occlusionMask: Graphics | null = null;
  public isFlipped: boolean = false;
  public lastAnimDir: string = "";

  // Screen coordinates (updated each frame in render3D)
  public screenX: number = -9999;
  public screenY: number = -9999;

  // Animations dictionary
  public animations: Record<string, Texture[]> = {};
  public currentAnimKey: string = "";
  public prefix: string = "";

  constructor(
    id: number,
    x: number,
    y: number,
    dirX: number = 0,
    dirY: number = 1,
    scale: number = 1,
    referenceHeight: number = 64
  ) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.dirX = dirX;
    this.dirY = dirY;
    this.scale = scale;
    this.referenceHeight = referenceHeight;
  }

  /**
   * Calculates the relative angle between this object's facing direction and the vector to the player,
   * categorizing into standard 8-directional sectors with hysteresis:
   * - "towards"
   * - "towards_left_diagonal"
   * - "left"
   * - "away_left_diagonal"
   * - "away"
   * and setting `isFlipped` to true when viewed from the object's right side.
   */
  public getDirectionSector(
    playerX: number,
    playerY: number,
    hysteresis: number = 5.0
  ): DirectionalSectorResult {
    const toPlayerAngle = Math.atan2(playerY - this.y, playerX - this.x);
    const facingAngle = Math.atan2(this.dirY, this.dirX);

    let diff = toPlayerAngle - facingAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const deg = (diff * 180) / Math.PI;

    const isTowards = this.lastAnimDir === "towards";
    const isTowardsDiag = this.lastAnimDir === "towards_left_diagonal";
    const isLeft = this.lastAnimDir === "left";
    const isAwayDiag = this.lastAnimDir === "away_left_diagonal";
    const isAway = this.lastAnimDir === "away";

    const clampedHysteresis = Math.min(10.0, Math.max(0.0, hysteresis));

    // Standard 8-directional sectors with symmetric 45° widths:
    // Sector 1: towards               (centered at 0°,   nominal span: 0° - 22.5°)
    // Sector 2: towards_left_diagonal (centered at 45°,  nominal span: 22.5° - 67.5°)
    // Sector 3: left                  (centered at 90°,  nominal span: 67.5° - 112.5°)
    // Sector 4: away_left_diagonal    (centered at 135°, nominal span: 112.5° - 157.5°)
    // Sector 5: away                  (centered at 180°, nominal span: 157.5° - 180°)

    // Transition boundary 1: between towards (0°) and towards_left_diagonal (45°)
    const bound1 = isTowards ? 22.5 + clampedHysteresis : isTowardsDiag ? 22.5 - clampedHysteresis : 22.5;

    // Transition boundary 2: between towards_left_diagonal (45°) and left (90°)
    const bound2 = isTowardsDiag ? 67.5 + clampedHysteresis : isLeft ? 67.5 - clampedHysteresis : 67.5;

    // Transition boundary 3: between left (90°) and away_left_diagonal (135°)
    const bound3 = isLeft ? 112.5 + clampedHysteresis : isAwayDiag ? 112.5 - clampedHysteresis : 112.5;

    // Transition boundary 4: between away_left_diagonal (135°) and away (180°)
    const bound4 = isAwayDiag ? 157.5 + clampedHysteresis : isAway ? 157.5 - clampedHysteresis : 157.5;

    const absDeg = Math.abs(deg);

    let dirName: string;
    if (absDeg < bound1) {
      dirName = "towards";
    } else if (absDeg < bound2) {
      dirName = "towards_left_diagonal";
    } else if (absDeg < bound3) {
      dirName = "left";
    } else if (absDeg < bound4) {
      dirName = "away_left_diagonal";
    } else {
      dirName = "away";
    }

    this.lastAnimDir = dirName;
    const isFlipped = dirName !== "towards" && dirName !== "away" && deg > 0;
    this.isFlipped = isFlipped;

    return { dirName, isFlipped, deg, absDeg };
  }

  public playAnimation(key: string, loop: boolean = true, speed: number = 0.16): void {
    if (this.currentAnimKey === key) return;

    const textures = this.animations[key];
    if (!textures || textures.length === 0) return;

    const prevFrame = this.animatedSprite?.currentFrame ?? 0;
    this.currentAnimKey = key;
    this.animatedSprite.textures = textures;
    this.animatedSprite.animationSpeed = speed;
    this.animatedSprite.loop = loop;

    if (loop && textures.length > 1) {
      const targetFrame = prevFrame < textures.length ? prevFrame : 0;
      this.animatedSprite.gotoAndPlay(targetFrame);
    } else {
      this.animatedSprite.gotoAndStop(0);
    }
  }

  /**
   * Default direction update for stationary objects or idle state.
   */
  public updateAnimation(playerX: number, playerY: number): void {
    if (!this.animatedSprite) return;

    const { dirName } = this.getDirectionSector(playerX, playerY);

    const candidates = [
      dirName,
      dirName.replace("_diagonal", ""),
      `${this.prefix}_${dirName}`,
      `${this.prefix}_${dirName.replace("_diagonal", "")}`,
      `standing_${dirName}`,
      `idle_${dirName}`,
      `default_${dirName}`,
    ];

    for (const key of candidates) {
      if (this.animations[key]) {
        this.playAnimation(key, false);
        return;
      }
    }
  }

  /**
   * Full 3D raycaster camera transformation, frustum culling, occlusion masking, and rendering.
   */
  public render3D(
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
  ): boolean {
    const sprite = this.animatedSprite;
    if (!sprite) return false;

    const dx = this.x - playerX;
    const dy = this.y - playerY;

    // Transform into camera space
    const invDet = 1.0 / (planeX * dirY - dirX * planeY);
    const transformX = invDet * (dirY * dx - dirX * dy);
    const transformY = invDet * (-planeY * dx + planeX * dy);

    // Frustum culling: must be in front of player and within max render distance
    if (transformY <= 0.1 || transformY > maxRenderDistance) {
      sprite.visible = false;
      this.screenX = -9999;
      this.screenY = -9999;
      return false;
    }

    // Update orientation frame before screen projection
    this.updateAnimation(playerX, playerY);

    const screenW = gameConfig.width;
    const screenH = gameConfig.height;

    const spriteScreenX = Math.floor((screenW / 2) * (1 + transformX / transformY));
    const baseHeight = Math.abs(Math.floor(screenH / transformY));
    const refHeight = this.referenceHeight ?? 64;

    const curTex = sprite.texture;
    const texW = curTex ? (curTex.orig?.width || curTex.width || 32) : 32;
    const texH = curTex ? (curTex.orig?.height || curTex.height || 64) : 64;

    const effectiveScaleX = this.scaleX ?? this.scale;
    const effectiveScaleY = this.scaleY ?? this.scale;

    const spriteHeight = Math.max(1, Math.floor(baseHeight * effectiveScaleY * (texH / refHeight)));
    const spriteWidth = Math.max(1, Math.floor(baseHeight * effectiveScaleX * (texW / refHeight)));

    const floorY = Math.floor(screenH / 2 + baseHeight / 2);
    const halfW = spriteWidth / 2;

    const drawStartX = Math.max(0, Math.floor(spriteScreenX - halfW));
    const drawEndX = Math.min(screenW - 1, Math.floor(spriteScreenX + halfW));

    if (drawStartX > drawEndX) {
      sprite.visible = false;
      this.screenX = -9999;
      this.screenY = -9999;
      return false;
    }

    // Per-column occlusion mask: draw only columns where object is in front of wall or under opening door
    const mask = this.occlusionMask;
    if (mask) {
      mask.clear();

      let runStart = -1;
      let runTopY = -1;
      let hasDrawnAnyRun = false;

      for (let col = drawStartX; col <= drawEndX; col++) {
        if (transformY < zBuffer[col]) {
          let topY = 0;
          if (doorDistBuffer && doorBottomBuffer && doorDistBuffer[col] < transformY) {
            topY = Math.max(0, Math.floor(doorBottomBuffer[col]));
          }
          if (topY < screenH) {
            if (runStart >= 0 && topY === runTopY) {
              // Continue current run
            } else {
              if (runStart >= 0) {
                mask.beginFill(0xffffff);
                mask.drawRect(runStart, runTopY, col - runStart, screenH - runTopY);
                mask.endFill();
                hasDrawnAnyRun = true;
              }
              runStart = col;
              runTopY = topY;
            }
          } else {
            // Door panel completely covers column down to floor
            if (runStart >= 0) {
              mask.beginFill(0xffffff);
              mask.drawRect(runStart, runTopY, col - runStart, screenH - runTopY);
              mask.endFill();
              hasDrawnAnyRun = true;
              runStart = -1;
            }
          }
        } else {
          // Occluded by solid wall
          if (runStart >= 0) {
            mask.beginFill(0xffffff);
            mask.drawRect(runStart, runTopY, col - runStart, screenH - runTopY);
            mask.endFill();
            hasDrawnAnyRun = true;
            runStart = -1;
          }
        }
      }

      if (runStart >= 0) {
        mask.beginFill(0xffffff);
        mask.drawRect(runStart, runTopY, drawEndX - runStart + 1, screenH - runTopY);
        mask.endFill();
        hasDrawnAnyRun = true;
      }

      if (!hasDrawnAnyRun && drawStartX <= drawEndX) {
        sprite.visible = false;
        this.screenX = -9999;
        this.screenY = -9999;
        return false;
      }
    }

    sprite.visible = true;
    sprite.x = spriteScreenX;

    let renderY = floorY;
    if (this.anchor === "center") {
      renderY = Math.floor(screenH / 2 + spriteHeight / 2);
    }
    if (this.currentVOffset !== 0) {
      renderY -= this.currentVOffset * baseHeight;
    }
    if (this.floatingBob) {
      renderY -= Math.sin((Date.now() + this.id * 500) / 350) * 0.03 * baseHeight;
    }

    sprite.y = Math.floor(renderY);
    sprite.width = spriteWidth;
    sprite.height = spriteHeight;
    this.screenX = spriteScreenX;
    this.screenY = Math.floor(renderY - spriteHeight * 0.55);

    // Re-apply horizontal flip scale after dimension updates
    if (this.isFlipped) {
      sprite.scale.x = -Math.abs(sprite.scale.x);
    } else {
      sprite.scale.x = Math.abs(sprite.scale.x);
    }

    // Distance-based atmospheric depth dimming
    const shade = Math.max(0.18, Math.min(1.0, 1.0 - (transformY / maxRenderDistance) * 0.75));
    const shadeInt = (shade * 255) | 0;
    sprite.tint = (shadeInt << 16) | (shadeInt << 8) | shadeInt;

    // Depth sorting
    sprite.zIndex = Math.floor((maxRenderDistance - transformY) * 1000);
    if (this.occlusionMask) {
      this.occlusionMask.zIndex = sprite.zIndex;
    }

    return true;
  }

  public dispose(): void {
    if (this.animatedSprite) {
      this.animatedSprite.destroy();
    }
    if (this.occlusionMask) {
      this.occlusionMask.destroy();
      this.occlusionMask = null;
    }
  }
}
