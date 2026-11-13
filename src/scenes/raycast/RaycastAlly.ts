import { AnimatedSprite, MIPMAP_MODES, SCALE_MODES, Spritesheet, Texture } from "pixi.js";
import { RaycastDirectionalObject } from "./RaycastDirectionalObject";
import { AStarPathfinder, AStarPathFollower } from "../../plugins/pathfinding";

export interface AllyOptions {
  name?: string;
  scale?: number;
  referenceHeight?: number;
  hitRadius?: number;
  speed?: number;
}

/**
 * Friendly NPC companion (e.g. the rescued Imperial Prisoner).
 * Follows the player when liberated from detention, navigates corridors & doors,
 * and responds to player commands via the interaction key ("e/E").
 */
export class RaycastAlly extends RaycastDirectionalObject {
  public name: string = "Prisoner";
  public tileId: number;

  // State flags
  public isFollowing: boolean = false;
  public isMoving: boolean = false;

  // Movement & navigation tuning
  public speed: number = 0.016;
  public catchupSpeed: number = 0.022;
  public stopDistance: number = 1.8;
  public resumeDistance: number = 2.6;

  // A* Pathfinding follower
  public pathFollower: AStarPathFollower = new AStarPathFollower();
  public pathTargetX: number = -1;
  public pathTargetY: number = -1;
  public pathCooldown: number = 0;
  public stuckFrames: number = 0;

  constructor(
    id: number,
    tileId: number,
    x: number,
    y: number,
    dirX: number = 0,
    dirY: number = 1,
    spritesheet?: Spritesheet,
    options?: AllyOptions
  ) {
    const scale = options?.scale ?? 0.7;
    const refHeight = options?.referenceHeight ?? 69;
    super(id, x, y, dirX, dirY, scale, refHeight);

    this.tileId = tileId;
    this.name = options?.name ?? "Prisoner";
    this.hitRadius = options?.hitRadius ?? 0.25;
    this.speed = options?.speed ?? 0.016;
    this.blocksMovement = false; // Soft yield rather than rigid immovable collision
    this.prefix = "prisoner";

    if (spritesheet) {
      this.initFromSpritesheet(spritesheet);
    }
  }

  public initFromSpritesheet(spritesheet: Spritesheet): void {
    if (spritesheet.baseTexture) {
      spritesheet.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      spritesheet.baseTexture.mipmap = MIPMAP_MODES.OFF;
      spritesheet.baseTexture.update();
    }

    const texs = spritesheet.textures;

    const getSequence = (candidatePrefixes: string[]): Texture[] => {
      for (const prefix of candidatePrefixes) {
        const frames: Texture[] = [];
        let i = 1;
        while (true) {
          const t =
            texs[`${prefix}_${i}.png`] ||
            texs[`${prefix}_${i}`] ||
            texs[`${prefix}${i}.png`] ||
            texs[`${prefix}${i}`];
          if (!t) break;
          frames.push(t);
          i++;
        }
        if (frames.length > 0) return frames;

        const single =
          texs[`${prefix}.png`] ||
          texs[prefix] ||
          texs[`${prefix}_1.png`] ||
          texs[`${prefix}_1`];
        if (single) return [single];
      }
      return [Texture.WHITE];
    };

    this.animations = {
      standing_towards: getSequence(["standing_towards", "standing_down"]),
      standing_towards_left_diagonal: getSequence(["standing_towards_left_diagonal", "standing_left_diagonal"]),
      standing_left: getSequence(["standing_left"]),
      standing_away_left_diagonal: getSequence(["standing_away_left_diagonal"]),
      standing_away: getSequence(["standing_away", "standing_up"]),

      walking_towards: getSequence(["walking_towards", "walking_down"]),
      walking_towards_left_diagonal: getSequence(["walking_left_diagonal", "walking_towards_left_diagonal"]),
      walking_left: getSequence(["walking_left"]),
      walking_away_left_diagonal: getSequence(["walking_away_left_diagonal"]),
      walking_away: getSequence(["walking_away", "walking_up"]),
    };

    const initialTextures = this.animations.standing_towards || [Texture.WHITE];
    this.animatedSprite = new AnimatedSprite(initialTextures);
    this.animatedSprite.anchor.set(0.5, 1.0);
    this.animatedSprite.animationSpeed = 0.16;
    this.animatedSprite.roundPixels = true;
    this.animatedSprite.visible = false;
    this.currentAnimKey = "standing_towards";
  }

  public setFollowing(following: boolean): void {
    this.isFollowing = following;
    if (!following) {
      this.isMoving = false;
      this.pathFollower.clear();
    }
  }

  public toggleFollowing(): boolean {
    this.setFollowing(!this.isFollowing);
    return this.isFollowing;
  }

  /**
   * Overrides direction update to toggle between walking animations and static idle standing frames.
   */
  public override updateAnimation(playerX: number, playerY: number): void {
    if (!this.animatedSprite) return;

    const { dirName } = this.getDirectionSector(playerX, playerY);
    const animPrefix = this.isMoving ? "walking" : "standing";
    const targetKey = `${animPrefix}_${dirName}`;

    if (this.animations[targetKey]) {
      const hasMultipleFrames = this.animations[targetKey].length > 1;
      this.playAnimation(targetKey, hasMultipleFrames && this.isMoving, 0.16);
    } else {
      const fallbackKey = `${animPrefix}_${dirName.replace("_diagonal", "")}`;
      if (this.animations[fallbackKey]) {
        const hasMultiple = this.animations[fallbackKey].length > 1;
        this.playAnimation(fallbackKey, hasMultiple && this.isMoving, 0.16);
      }
    }
  }

  /**
   * Main per-frame AI and navigation update for following the player.
   */
  public update(
    delta: number,
    playerX: number,
    playerY: number,
    mapFlat: Int32Array,
    mapWidth: number,
    mapHeight: number,
    doorStatesFlat: Float64Array,
    tileTypeFlags: Uint8Array,
    thinWalls: Array<{ x1: number; y1: number; x2: number; y2: number }>,
    astar: AStarPathfinder | null,
    openDoorCallback?: (cellX: number, cellY: number) => boolean
  ): void {
    const dt = delta / 60;
    const distToPlayer = Math.hypot(playerX - this.x, playerY - this.y);

    if (this.pathCooldown > 0) {
      this.pathCooldown -= dt;
    }

    // Commanded to wait: hold position and face player
    if (!this.isFollowing) {
      this.isMoving = false;
      this.pathFollower.clear();
      if (distToPlayer < 3.5 && distToPlayer > 0.01) {
        this.dirX = (playerX - this.x) / distToPlayer;
        this.dirY = (playerY - this.y) / distToPlayer;
      }
      return;
    }

    // Direct clearance check with full body radius (0.25)
    const directClear = this.isThickLineClear(
      this.x,
      this.y,
      playerX,
      playerY,
      0.25,
      mapFlat,
      mapWidth,
      mapHeight,
      doorStatesFlat,
      tileTypeFlags,
      thinWalls
    );

    // 3. Movement state management with hysteresis to prevent animation jitter
    if (this.isMoving) {
      // While currently moving, stay in moving state until reaching stopDistance
      if (distToPlayer <= this.stopDistance) {
        this.isMoving = false;
        this.pathFollower.clear();
        this.stuckFrames = 0;
      }
    } else {
      // While stopped, resume only when player moves beyond resumeDistance,
      // or if player breaks line of sight (e.g. turned a corner or went through a door)
      const shouldResume =
        distToPlayer >= this.resumeDistance ||
        (!directClear && distToPlayer > this.stopDistance + 0.2);
      if (shouldResume) {
        this.isMoving = true;
        this.stuckFrames = 0;
      }
    }

    if (!this.isMoving) {
      // Idle / waiting near player: smoothly face player
      if (distToPlayer > 0.01) {
        this.dirX = (playerX - this.x) / distToPlayer;
        this.dirY = (playerY - this.y) / distToPlayer;
      }

      // If player pushes directly into ally (< 0.75), yield backward slightly if clear
      if (distToPlayer < 0.75 && distToPlayer > 0.01) {
        const yieldDirX = (this.x - playerX) / distToPlayer;
        const yieldDirY = (this.y - playerY) / distToPlayer;
        const step = 0.012 * delta;
        this.tryMove(yieldDirX * step, yieldDirY * step, mapFlat, mapWidth, mapHeight, doorStatesFlat, tileTypeFlags, thinWalls);
      }
      return;
    }

    // 4. Moving state: Paced companion speed (slower than player so he trails smoothly)
    // Only use catchup speed if player is far away (> 4.8 tiles)
    const currentSpeed = distToPlayer > 4.8 ? this.catchupSpeed : this.speed;
    const moveDist = currentSpeed * delta;

    // 5. Navigation pathfinding vs direct step:
    let nextStepX = playerX;
    let nextStepY = playerY;

    // Walk direct only if close and completely unobstructed with full clearance
    const canWalkDirect = directClear && distToPlayer <= 2.2;

    const isSegmentClear = (x1: number, y1: number, x2: number, y2: number): boolean => {
      return this.isThickLineClear(x1, y1, x2, y2, 0.25, mapFlat, mapWidth, mapHeight, doorStatesFlat, tileTypeFlags, thinWalls);
    };

    if (canWalkDirect) {
      this.pathFollower.clear();
      nextStepX = playerX;
      nextStepY = playerY;
    } else {
      // Always use A* pathfinding around corners, walls, and through doors
      const targetDistFromLastPath = Math.hypot(playerX - this.pathTargetX, playerY - this.pathTargetY);
      const needsRepath =
        !this.pathFollower.hasPath() ||
        (this.pathCooldown <= 0 && targetDistFromLastPath > 1.2) ||
        this.stuckFrames > 8;

      if (needsRepath && astar) {
        const rawPath = astar.findPath(this.x, this.y, playerX, playerY);
        if (rawPath.length > 0) {
          const isDoorNode = (node: { x: number; y: number }): boolean => {
            const idx = node.y * mapWidth + node.x;
            return this.isDoorTile(idx, tileTypeFlags, doorStatesFlat);
          };
          const smoothed = AStarPathfinder.smoothPath(rawPath, isSegmentClear, isDoorNode);
          this.pathFollower.setPath(smoothed, true);
          this.pathTargetX = playerX;
          this.pathTargetY = playerY;
          this.pathCooldown = 0.45;
          this.stuckFrames = 0;
        }
      }

      const wp = this.pathFollower.advance(this.x, this.y, 0.35, isSegmentClear);
      if (wp) {
        nextStepX = wp.x;
        nextStepY = wp.y;
      } else {
        nextStepX = playerX;
        nextStepY = playerY;
      }
    }

    // 6. Check and open any doors ahead along path
    this.checkAndOpenDoorAhead(nextStepX, nextStepY, mapWidth, mapHeight, tileTypeFlags, doorStatesFlat, openDoorCallback);

    // 7. Execute movement step with collision and axis sliding
    const toStepX = nextStepX - this.x;
    const toStepY = nextStepY - this.y;
    const stepDist = Math.hypot(toStepX, toStepY);

    if (stepDist > 0.02) {
      const stepNormX = toStepX / stepDist;
      const stepNormY = toStepY / stepDist;
      this.dirX = stepNormX;
      this.dirY = stepNormY;

      const stepSize = Math.min(moveDist, stepDist);

      const moved = this.tryMove(
        stepNormX * stepSize,
        stepNormY * stepSize,
        mapFlat,
        mapWidth,
        mapHeight,
        doorStatesFlat,
        tileTypeFlags,
        thinWalls
      );

      if (!moved) {
        this.stuckFrames++;
        if (this.stuckFrames > 15) {
          this.pathFollower.clear();
          this.pathCooldown = 0;
        }
      } else {
        this.stuckFrames = 0;
      }
    }
  }

  /**
   * Robustly checks whether a tile is a door (RaycastScene.TILE_DOOR = 2 or non-NaN doorStatesFlat).
   */
  public isDoorTile(flatIdx: number, tileTypeFlags: Uint8Array, doorStatesFlat: Float64Array): boolean {
    if (flatIdx < 0) return false;
    if (tileTypeFlags && flatIdx < tileTypeFlags.length) {
      if (tileTypeFlags[flatIdx] === 2) return true; // RaycastScene.TILE_DOOR = 2
    }
    if (doorStatesFlat && flatIdx < doorStatesFlat.length) {
      const dVal = doorStatesFlat[flatIdx];
      return !Number.isNaN(dVal) && dVal !== undefined;
    }
    return false;
  }

  /**
   * Checks whether a door is open enough (>= 0.5) to walk through.
   */
  public isDoorOpen(flatIdx: number, doorStatesFlat: Float64Array): boolean {
    if (!doorStatesFlat || flatIdx < 0 || flatIdx >= doorStatesFlat.length) return false;
    const dVal = doorStatesFlat[flatIdx];
    return !Number.isNaN(dVal) && Math.abs(dVal) >= 0.5;
  }

  /**
   * Attempts movement with circle-to-AABB collision against walls, closed doors, and thin walls,
   * supporting axis sliding when diagonal movements encounter obstacles.
   */
  private tryMove(
    dx: number,
    dy: number,
    mapFlat: Int32Array,
    mapWidth: number,
    mapHeight: number,
    doorStatesFlat: Float64Array,
    tileTypeFlags: Uint8Array,
    thinWalls?: Array<{ x1: number; y1: number; x2: number; y2: number }>
  ): boolean {
    const r = this.hitRadius;

    const canPass = (tx: number, ty: number): boolean => {
      // Bounds check
      if (tx - r < 0 || tx + r >= mapWidth || ty - r < 0 || ty + r >= mapHeight) {
        return false;
      }

      const minGX = Math.floor(tx - r);
      const maxGX = Math.floor(tx + r);
      const minGY = Math.floor(ty - r);
      const maxGY = Math.floor(ty + r);

      for (let gy = minGY; gy <= maxGY; gy++) {
        for (let gx = minGX; gx <= maxGX; gx++) {
          const idx = gy * mapWidth + gx;
          const isDoor = this.isDoorTile(idx, tileTypeFlags, doorStatesFlat);
          const isDoorOpen = isDoor && this.isDoorOpen(idx, doorStatesFlat);

          if (!isDoorOpen && (mapFlat[idx] !== 0 || isDoor)) {
            // Circle-to-AABB collision check
            const clampX = Math.max(gx, Math.min(tx, gx + 1));
            const clampY = Math.max(gy, Math.min(ty, gy + 1));
            const cdx = tx - clampX;
            const cdy = ty - clampY;
            if (cdx * cdx + cdy * cdy < r * r) {
              return false;
            }
          }
        }
      }

      // Thin walls collision check
      if (thinWalls && thinWalls.length > 0) {
        for (const wall of thinWalls) {
          const wallThickness = 0.08;
          const minX = Math.min(wall.x1, wall.x2) - wallThickness;
          const maxX = Math.max(wall.x1, wall.x2) + wallThickness;
          const minY = Math.min(wall.y1, wall.y2) - wallThickness;
          const maxY = Math.max(wall.y1, wall.y2) + wallThickness;

          if (
            tx + r >= minX &&
            tx - r <= maxX &&
            ty + r >= minY &&
            ty - r <= maxY
          ) {
            return false;
          }
        }
      }

      return true;
    };

    // 1. Try full diagonal move
    if (canPass(this.x + dx, this.y + dy)) {
      this.x += dx;
      this.y += dy;
      return true;
    }

    // 2. Try horizontal sliding
    if (Math.abs(dx) > 1e-4 && canPass(this.x + dx, this.y)) {
      this.x += dx;
      return true;
    }

    // 3. Try vertical sliding
    if (Math.abs(dy) > 1e-4 && canPass(this.x, this.y + dy)) {
      this.y += dy;
      return true;
    }

    return false;
  }

  /**
   * Opens doors in front of the ally or along the current path if within interaction range.
   */
  private checkAndOpenDoorAhead(
    targetX: number,
    targetY: number,
    mapWidth: number,
    mapHeight: number,
    tileTypeFlags: Uint8Array,
    doorStatesFlat: Float64Array,
    openDoorCallback?: (cellX: number, cellY: number) => boolean
  ): void {
    if (!openDoorCallback) return;

    // Check tiles near ally (ahead in movement direction and target cell)
    const candidates: Array<{ cx: number; cy: number }> = [];

    // Target waypoint cell
    candidates.push({ cx: Math.floor(targetX), cy: Math.floor(targetY) });

    // Lookahead in direction of movement (up to 1.3 units)
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.01) {
      candidates.push({
        cx: Math.floor(this.x + (dx / len) * 0.9),
        cy: Math.floor(this.y + (dy / len) * 0.9),
      });
      candidates.push({
        cx: Math.floor(this.x + (dx / len) * 1.3),
        cy: Math.floor(this.y + (dy / len) * 1.3),
      });
    }

    // Orthogonal neighbors within 1 tile
    const currentCX = Math.floor(this.x);
    const currentCY = Math.floor(this.y);
    const offsets = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [ox, oy] of offsets) {
      candidates.push({ cx: currentCX + ox, cy: currentCY + oy });
    }

    for (const { cx, cy } of candidates) {
      if (cx >= 0 && cx < mapWidth && cy >= 0 && cy < mapHeight) {
        const idx = cy * mapWidth + cx;
        if (this.isDoorTile(idx, tileTypeFlags, doorStatesFlat)) {
          const dState = doorStatesFlat[idx];
          if (Number.isNaN(dState) || Math.abs(dState) < 0.6) {
            openDoorCallback(cx, cy);
          }
        }
      }
    }
  }

  /**
   * Checks whether a cylindrical capsule of radius `radius` between (x1, y1) and (x2, y2)
   * has complete clearance from solid walls, closed doors, and thin walls.
   */
  public isThickLineClear(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    radius: number,
    mapFlat: Int32Array,
    mapWidth: number,
    mapHeight: number,
    doorStatesFlat: Float64Array,
    tileTypeFlags: Uint8Array,
    thinWalls: Array<{ x1: number; y1: number; x2: number; y2: number }>
  ): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.05) return true;

    // Step at intervals of 0.2 tiles
    const numSteps = Math.ceil(dist / 0.2);
    for (let i = 0; i <= numSteps; i++) {
      const t = i / numSteps;
      const testX = x1 + dx * t;
      const testY = y1 + dy * t;

      const minGX = Math.floor(testX - radius);
      const maxGX = Math.floor(testX + radius);
      const minGY = Math.floor(testY - radius);
      const maxGY = Math.floor(testY + radius);

      if (minGX < 0 || maxGX >= mapWidth || minGY < 0 || maxGY >= mapHeight) {
        return false;
      }

      for (let gy = minGY; gy <= maxGY; gy++) {
        for (let gx = minGX; gx <= maxGX; gx++) {
          const idx = gy * mapWidth + gx;
          const isDoor = this.isDoorTile(idx, tileTypeFlags, doorStatesFlat);
          const isWall = !isDoor && mapFlat[idx] !== 0;

          if (isWall || (isDoor && !this.isDoorOpen(idx, doorStatesFlat))) {
            const clampX = Math.max(gx, Math.min(testX, gx + 1));
            const clampY = Math.max(gy, Math.min(testY, gy + 1));
            const cdx = testX - clampX;
            const cdy = testY - clampY;
            if (cdx * cdx + cdy * cdy < radius * radius) {
              return false; // Intersects solid wall or closed door
            }
          }
        }
      }
    }

    // Check intersection with thin walls
    if (thinWalls && thinWalls.length > 0) {
      for (const w of thinWalls) {
        const wallThickness = 0.08;
        const minX = Math.min(w.x1, w.x2) - wallThickness;
        const maxX = Math.max(w.x1, w.x2) + wallThickness;
        const minY = Math.min(w.y1, w.y2) - wallThickness;
        const maxY = Math.max(w.y1, w.y2) + wallThickness;

        for (let i = 0; i <= numSteps; i++) {
          const t = i / numSteps;
          const testX = x1 + dx * t;
          const testY = y1 + dy * t;
          if (
            testX + radius >= minX &&
            testX - radius <= maxX &&
            testY + radius >= minY &&
            testY - radius <= maxY
          ) {
            return false;
          }
        }
      }
    }

    return true;
  }
}
