import { AnimatedSprite, Graphics, SCALE_MODES, Spritesheet, Texture } from "pixi.js";
import { sound, IMediaInstance } from "@pixi/sound";
import { IRaycastEnemyConfig } from "../../configs/interfaces/IRaycastEnemyConfig";

export type EnemyAIState = "idle" | "chase" | "attack" | "dead";

export class RaycastEnemy {
  public id: number;
  public config: IRaycastEnemyConfig;
  public x: number;
  public y: number;
  public dirX: number = 0;
  public dirY: number = 1;
  public health: number;
  public maxHealth: number;
  public state: EnemyAIState = "idle";
  public isMoving: boolean = false;

  // Animated sprite
  public animatedSprite!: AnimatedSprite;
  public occlusionMask: Graphics | null = null;
  public isFlipped: boolean = false;
  private animations: Record<string, Texture[]> = {};
  private currentAnimKey: string = "";

  // Timing
  public shootingTimer: number = 0;
  public painTimer: number = 0;
  public lastShotTime: number = 0;
  public hasDroppedLoot: boolean = false;

  // Voiceline & awareness tracking
  public wasSeeingPlayer: boolean = false;
  public lastSpottedTime: number = 0;
  public lastSuspiciousTime: number = 0;

  // Target tracking & repositioning
  public lastKnownPlayerX: number = 0;
  public lastKnownPlayerY: number = 0;
  public hasTarget: boolean = false;
  public searchTimer: number = 0;
  public repositionCooldown: number = 0;
  public wanderDirX: number = 0;
  public wanderDirY: number = 0;
  public stuckFrames: number = 0;
  public stepOutFrames: number = 0;
  public currentVOffset: number = 0;

  // Sound instance tracking to allow immediate stopping on death
  public onDeathCallback?: (enemy: RaycastEnemy) => void;
  private activeSoundInstances: Set<IMediaInstance> = new Set();
  private hoverSoundInstance: IMediaInstance | null = null;
  private isHoverSoundPlaying: boolean = false;

  public stopActiveSounds(): void {
    if (this.hoverSoundInstance) {
      try {
        this.hoverSoundInstance.stop();
      } catch {}
      this.hoverSoundInstance = null;
    }
    this.isHoverSoundPlaying = false;

    for (const inst of Array.from(this.activeSoundInstances)) {
      try {
        inst.stop();
      } catch {}
    }
    this.activeSoundInstances.clear();
  }

  private startHoverSound(hoverConfig: { src: string; volume?: number; loop?: boolean }): void {
    if (this.isDead || this.isHoverSoundPlaying) return;
    try {
      if (!sound.exists(hoverConfig.src)) return;
      this.isHoverSoundPlaying = true;
      const res = sound.play(hoverConfig.src, {
        volume: hoverConfig.volume ?? 0.5,
        loop: true,
      }) as IMediaInstance | Promise<IMediaInstance>;
      if (res) {
        if (res instanceof Promise) {
          res
            .then((inst: IMediaInstance) => {
              if (this.isDead) {
                inst?.stop?.();
              } else if (inst) {
                this.hoverSoundInstance = inst;
                this.trackSoundInstance(inst);
              }
            })
            .catch(() => {
              this.isHoverSoundPlaying = false;
            });
        } else {
          this.hoverSoundInstance = res;
          this.trackSoundInstance(res);
        }
      }
    } catch {
      this.isHoverSoundPlaying = false;
    }
  }

  private trackSoundInstance(res: IMediaInstance | Promise<IMediaInstance>): void {
    if (!res) return;
    if (res instanceof Promise) {
      res
        .then((inst: IMediaInstance) => {
          if (this.isDead) {
            inst?.stop?.();
          } else if (inst) {
            this.activeSoundInstances.add(inst);
          }
        })
        .catch(() => {});
    } else {
      if (this.isDead) {
        res.stop();
      } else {
        this.activeSoundInstances.add(res);
      }
    }
  }

  constructor(
    id: number,
    config: IRaycastEnemyConfig,
    x: number,
    y: number,
    spritesheet?: Spritesheet
  ) {
    this.id = id;
    this.config = config;
    this.x = x;
    this.y = y;
    this.health = config.maxHealth;
    this.maxHealth = config.maxHealth;
    this.dirX = 0;
    this.dirY = 1;
    this.currentVOffset = config.vOffset ?? 0;

    if (spritesheet) {
      this.initAnimatedSprite(spritesheet);
    }
  }

  public initAnimatedSprite(spritesheet: Spritesheet): void {
    if (spritesheet.baseTexture) {
      spritesheet.baseTexture.scaleMode = SCALE_MODES.NEAREST;
    }

    const texs = spritesheet.textures;

    // Helper to get frame array
    const getFrames = (prefix: string, count: number): Texture[] => {
      const frames: Texture[] = [];
      for (let i = 1; i <= count; i++) {
        const t =
          texs[`${prefix}_${i}.png`] ||
          texs[`${prefix}_${i}`] ||
          texs[`${prefix}${i}.png`] ||
          texs[`${prefix}${i}`];
        if (t) {
          frames.push(t);
        }
      }
      return frames.length > 0 ? frames : [texs[`${prefix}.png`] || texs[prefix] || Texture.WHITE];
    };

    // Helper for single frame
    const getSingle = (name: string): Texture[] => {
      const t = texs[`${name}.png`] || texs[name];
      if (t) {
        return [t];
      }
      return [Texture.WHITE];
    };

    const animConfig = this.config.animationConfig;

    if (animConfig?.omniDirectional) {
      const def = animConfig.defaultAnimation;
      const shoot = animConfig.shootingAnimation;
      const death = animConfig.deathAnimation;

      this.animations = {
        default: def ? getFrames(def.prefix, def.count) : [Texture.WHITE],
        shooting: shoot ? getFrames(shoot.prefix, shoot.count) : [Texture.WHITE],
        death_1: death ? getFrames(death.prefix, death.count) : [Texture.WHITE],
      };

      const initialTextures = this.animations.default || [Texture.WHITE];
      const initialSpeed = def?.speed ?? 0.16;
      this.animatedSprite = new AnimatedSprite(initialTextures);
      this.animatedSprite.anchor.set(0.5, 1.0);
      this.animatedSprite.animationSpeed = initialSpeed;
      this.animatedSprite.roundPixels = true;
      this.animatedSprite.visible = false;
      this.currentAnimKey = "default";
      if (def?.loop !== false) {
        this.animatedSprite.loop = true;
        this.animatedSprite.play();
      }
      return;
    }

    const walkPrefix = animConfig?.walkingPrefix ?? "storm_trooper/walking";
    const standPrefix = animConfig?.standingPrefix ?? "storm_trooper/standing";
    const deathPrefix = animConfig?.deathPrefix ?? "storm_trooper/death_1";
    const shootName = animConfig?.shootingPrefix ?? "storm_trooper/shooting";
    const deathCount = animConfig?.deathAnimation?.count ?? 8;
    const shootCount = animConfig?.shootingAnimation?.count ?? 6;

    const hasSingleShoot = Boolean(texs[`${shootName}.png`] || texs[shootName]);

    this.animations = {
      // 1. Walking animations (up to 6 frames each)
      walking_towards: getFrames(`${walkPrefix}_towards`, 6),
      walking_towards_left_diagonal: getFrames(`${walkPrefix}_left_diagonal`, 6),
      walking_left: getFrames(`${walkPrefix}_left`, 6),
      walking_away_left_diagonal: getFrames(`${walkPrefix}_away_left_diagonal`, 6),
      walking_away: getFrames(`${walkPrefix}_away`, 6),

      // 2. Standing / Idle poses (1 frame each)
      standing_towards: getSingle(`${standPrefix}_towards`),
      standing_towards_left_diagonal: getSingle(`${standPrefix}_towards_left_diagonal`),
      standing_left: getSingle(`${standPrefix}_left`),
      standing_away_left_diagonal: getSingle(`${standPrefix}_away_left_diagonal`),
      standing_away: getSingle(`${standPrefix}_away`),

      // 3. Shooting pose (supports single frame or multi-frame sequence)
      shooting: hasSingleShoot ? getSingle(shootName) : getFrames(shootName, shootCount),

      // 4. Death animations (supports up to deathCount frames)
      death_1: getFrames(deathPrefix, deathCount),
      death_2: getFrames(deathPrefix.replace("_1", "_2"), deathCount),

      // 5. Optional damage / hit reaction pose
      ...((texs["damage.png"] || texs["damage"]) ? { damage: getSingle("damage") } : {}),
    };

    const initialTextures = this.animations.standing_towards || [Texture.WHITE];
    this.animatedSprite = new AnimatedSprite(initialTextures);
    this.animatedSprite.anchor.set(0.5, 1.0); // Pivot at bottom center on the floor
    this.animatedSprite.animationSpeed = 0.16;
    this.animatedSprite.roundPixels = true; // Avoid subpixel interpolation blur
    this.animatedSprite.visible = false;
    this.currentAnimKey = "standing_towards";
  }

  public get isDead(): boolean {
    return this.state === "dead";
  }

  public takeDamage(
    amount: number,
    onDeath?: (enemy: RaycastEnemy) => void,
    sourceX?: number,
    sourceY?: number
  ): boolean {
    if (this.isDead) return false;

    this.health = Math.max(0, this.health - amount);
    this.painTimer = 8; // Flash red for ~8 frames

    // Instantly alert enemy to player / attacker
    if (this.state === "idle") {
      this.state = "chase";
    }
    if (sourceX !== undefined && sourceY !== undefined) {
      this.lastKnownPlayerX = sourceX;
      this.lastKnownPlayerY = sourceY;
      this.hasTarget = true;
      this.searchTimer = 600;
    }

    if (this.health <= 0) {
      this.state = "dead";
      this.isMoving = false;

      // Stop any active sounds (voicelines, attacks, pain) immediately
      this.stopActiveSounds();

      if (this.onDeathCallback) {
        this.onDeathCallback(this);
      }

      if (onDeath) {
        onDeath(this);
      }

      // Play death animation
      const deathSpeed = this.config.animationConfig?.deathAnimation?.speed ?? 0.14;
      this.playAnimation("death_1", false, deathSpeed);

      // Play death sound from config
      if (this.config.deathSounds && this.config.deathSounds.length > 0) {
        const snd = this.config.deathSounds[
          Math.floor(Math.random() * this.config.deathSounds.length)
        ];
        try {
          sound.play(snd.src, { volume: snd.volume, loop: snd.loop });
        } catch (e) {
          console.warn("Failed to play enemy death sound:", e);
        }
      }

      return true;
    }

    // Play pain sound (only if alive)
    if (this.config.painSounds && this.config.painSounds.length > 0) {
      const snd = this.config.painSounds[
        Math.floor(Math.random() * this.config.painSounds.length)
      ];
      try {
        const res = sound.play(snd.src, { volume: snd.volume, loop: snd.loop });
        this.trackSoundInstance(res);
      } catch (e) {
        console.warn("Failed to play enemy pain sound:", e);
      }
    }

    return false;
  }

  private moveTowards(
    targetX: number,
    targetY: number,
    speed: number,
    tryMoveEnemy: (enemy: RaycastEnemy, newX: number, newY: number) => boolean
  ): boolean {
    const tdx = targetX - this.x;
    const tdy = targetY - this.y;
    const dist = Math.hypot(tdx, tdy);
    if (dist < 0.001) return false;

    const baseDirX = tdx / dist;
    const baseDirY = tdy / dist;

    // 1. Direct move attempt
    if (tryMoveEnemy(this, this.x + baseDirX * speed, this.y + baseDirY * speed)) {
      this.stuckFrames = 0;
      this.dirX = baseDirX;
      this.dirY = baseDirY;
      return true;
    }

    // 2. Sliding on axes
    if (tryMoveEnemy(this, this.x + baseDirX * speed, this.y)) {
      this.stuckFrames = 0;
      this.dirX = baseDirX;
      return true;
    }
    if (tryMoveEnemy(this, this.x, this.y + baseDirY * speed)) {
      this.stuckFrames = 0;
      this.dirY = baseDirY;
      return true;
    }

    // 3. Multi-angle feelers for steering around corners and obstacles
    const angleDeviations = [
      Math.PI / 6, -Math.PI / 6,
      Math.PI / 4, -Math.PI / 4,
      Math.PI / 3, -Math.PI / 3,
      Math.PI / 2, -Math.PI / 2,
      (2 * Math.PI) / 3, -(2 * Math.PI) / 3,
      (3 * Math.PI) / 4, -(3 * Math.PI) / 4,
    ];

    const baseAngle = Math.atan2(baseDirY, baseDirX);

    for (const dev of angleDeviations) {
      const testAngle = baseAngle + dev;
      const testDirX = Math.cos(testAngle);
      const testDirY = Math.sin(testAngle);

      if (tryMoveEnemy(this, this.x + testDirX * speed, this.y + testDirY * speed)) {
        this.stuckFrames = 0;
        this.dirX = testDirX;
        this.dirY = testDirY;
        return true;
      }
      if (tryMoveEnemy(this, this.x + testDirX * speed, this.y)) {
        this.stuckFrames = 0;
        this.dirX = testDirX;
        return true;
      }
      if (tryMoveEnemy(this, this.x, this.y + testDirY * speed)) {
        this.stuckFrames = 0;
        this.dirY = testDirY;
        return true;
      }
    }

    this.stuckFrames++;
    return false;
  }

  public update(
    delta: number,
    playerX: number,
    playerY: number,
    hasLineOfSight: (x1: number, y1: number, x2: number, y2: number) => boolean,
    tryMoveEnemy: (enemy: RaycastEnemy, newX: number, newY: number) => boolean,
    onShootPlayer: (enemy: RaycastEnemy, damage: number, accuracy: number, distance: number) => void,
    hasLineOfFire?: (x1: number, y1: number, x2: number, y2: number) => boolean
  ): void {
    if (this.painTimer > 0) {
      this.painTimer = Math.max(0, this.painTimer - delta);
    }

    if (this.state === "dead") {
      if (this.currentVOffset > 0) {
        this.currentVOffset = Math.max(0, this.currentVOffset - 0.015 * delta);
      }
      return;
    }

    if (this.shootingTimer > 0) {
      this.shootingTimer = Math.max(0, this.shootingTimer - delta);
    }

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Update looping hover / idle sound with distance attenuation
    const hoverConfig = this.config.hoverSound || this.config.idleSound;
    if (hoverConfig && !this.isDead) {
      if (!this.isHoverSoundPlaying) {
        this.startHoverSound(hoverConfig);
      }
      if (this.hoverSoundInstance) {
        const baseVol = hoverConfig.volume ?? 0.5;
        const maxDist = Math.max(12, this.config.sightRange || 12);
        const falloff = Math.max(0, 1 - dist / maxDist);
        const effectiveVol = baseVol * falloff;
        try {
          if (typeof this.hoverSoundInstance.volume === "number") {
            this.hoverSoundInstance.volume = effectiveVol;
          } else if (typeof this.hoverSoundInstance.set === "function") {
            this.hoverSoundInstance.set("volume", effectiveVol);
          }
        } catch {}
      }
    }

    const los = hasLineOfSight(this.x, this.y, playerX, playerY);
    const lof = hasLineOfFire ? hasLineOfFire(this.x, this.y, playerX, playerY) : los;

    const dirToPlayerX = dist > 0.001 ? dx / dist : 0;
    const dirToPlayerY = dist > 0.001 ? dy / dist : 1;
    const perpX = -dirToPlayerY;
    const perpY = dirToPlayerX;

    // Check visibility from left and right shoulders to ensure enemy emerges fully from corner edges
    const shoulderOffset = this.config.shoulderOffset ?? 0.35;
    const clearanceMultiplier = this.config.coverClearanceOffset ?? 1.5;
    const defaultStepOut = this.config.stepOutFrames ?? 30;

    const losLeft = hasLineOfSight(this.x - perpX * shoulderOffset, this.y - perpY * shoulderOffset, playerX, playerY);
    const losRight = hasLineOfSight(this.x + perpX * shoulderOffset, this.y + perpY * shoulderOffset, playerX, playerY);
    const lofLeft = hasLineOfFire ? hasLineOfFire(this.x - perpX * shoulderOffset, this.y - perpY * shoulderOffset, playerX, playerY) : losLeft;
    const lofRight = hasLineOfFire ? hasLineOfFire(this.x + perpX * shoulderOffset, this.y + perpY * shoulderOffset, playerX, playerY) : losRight;

    const fullVisibility = los && losLeft && losRight && lof && lofLeft && lofRight;

    if (los && !this.wasSeeingPlayer) {
      this.stepOutFrames = defaultStepOut; // Step forward/out into open room/hallway when first acquiring target
    }
    this.wasSeeingPlayer = los;

    if (this.stepOutFrames > 0) {
      this.stepOutFrames = Math.max(0, this.stepOutFrames - delta);
    }

    // Track sight / target knowledge
    if (los) {
      this.lastKnownPlayerX = playerX;
      this.lastKnownPlayerY = playerY;
      this.hasTarget = true;
      this.searchTimer = 600; // Search/reposition for ~10 seconds at 60fps
    } else if (this.searchTimer > 0) {
      this.searchTimer = Math.max(0, this.searchTimer - delta);
      if (this.searchTimer <= 0) {
        this.hasTarget = false;
      }
    }

    if (dist > 0.001) {
      // Face towards player when active and visible
      if (this.state !== "idle" && (los || !this.isMoving)) {
        this.dirX = dx / dist;
        this.dirY = dy / dist;
      }
    }

    // State Machine
    if (this.state === "idle") {
      this.isMoving = false;
      // Alerted by direct sight or close proximity
      if ((dist <= this.config.sightRange && los) || (dist <= 3.2 && los)) {
        this.state = dist <= this.config.attackRange && lof ? "attack" : "chase";
      }
    } else if (this.state === "chase") {
      if (dist <= this.config.attackRange && fullVisibility && this.stepOutFrames <= 0) {
        this.state = "attack";
        this.isMoving = false;
      } else {
        // Move / reposition towards player or out of cover
        const speed = this.config.speed * delta;
        let tx = playerX;
        let ty = playerY;

        if (los) {
          // If we see player but are partially covered behind a corner, steer towards the clear shoulder
          if (!losLeft && losRight) {
            tx = this.x + perpX * clearanceMultiplier + dirToPlayerX * 0.8;
            ty = this.y + perpY * clearanceMultiplier + dirToPlayerY * 0.8;
          } else if (losLeft && !losRight) {
            tx = this.x - perpX * clearanceMultiplier + dirToPlayerX * 0.8;
            ty = this.y - perpY * clearanceMultiplier + dirToPlayerY * 0.8;
          } else {
            tx = playerX;
            ty = playerY;
          }
        } else if (this.hasTarget) {
          const toLastDist = Math.hypot(this.lastKnownPlayerX - this.x, this.lastKnownPlayerY - this.y);
          if (toLastDist > 0.4) {
            tx = this.lastKnownPlayerX;
            ty = this.lastKnownPlayerY;
          } else {
            // Reached last known position without spotting player -> reposition / sweep around corner
            if (this.repositionCooldown <= 0) {
              const randAngle = Math.random() * Math.PI * 2;
              this.wanderDirX = Math.cos(randAngle);
              this.wanderDirY = Math.sin(randAngle);
              this.repositionCooldown = 60 + Math.random() * 60;
            } else {
              this.repositionCooldown -= delta;
            }
            tx = this.x + this.wanderDirX * 2.5;
            ty = this.y + this.wanderDirY * 2.5;
          }
        } else {
          // Lost target completely and search timer expired -> return to idle
          this.state = "idle";
          this.isMoving = false;
          return;
        }

        const oldX = this.x;
        const oldY = this.y;
        const moved = this.moveTowards(tx, ty, speed, tryMoveEnemy);
        const actualMovedDist = Math.hypot(this.x - oldX, this.y - oldY);
        this.isMoving = moved && actualMovedDist > 0.0001;

        // While stepping out from cover into full view, can fire if within attack range
        if (los && lof && dist <= this.config.attackRange) {
          const now = Date.now();
          if (now - this.lastShotTime >= this.config.rateOfFire) {
            this.lastShotTime = now;
            this.shootingTimer = 12;

            if (this.config.attackSounds && this.config.attackSounds.length > 0) {
              const snd = this.config.attackSounds[
                Math.floor(Math.random() * this.config.attackSounds.length)
              ];
              try {
                const res = sound.play(snd.src, { volume: snd.volume, loop: snd.loop });
                this.trackSoundInstance(res);
              } catch (e) {
                console.warn("Failed to play enemy attack sound:", e);
              }
            }

            onShootPlayer(this, this.config.damage, this.config.accuracy, dist);
          }
        }
      }
    } else if (this.state === "attack") {
      this.isMoving = false;
      if (dist > this.config.attackRange + 1.2 || !los || !lof) {
        this.state = "chase";
      } else if (!fullVisibility) {
        // Partially occluded by corner cover -> step out into the open
        const speed = this.config.speed * delta * 0.8;
        let stepX = 0;
        let stepY = 0;
        if (!losLeft && losRight) {
          stepX = perpX * speed;
          stepY = perpY * speed;
        } else if (losLeft && !losRight) {
          stepX = -perpX * speed;
          stepY = -perpY * speed;
        } else {
          stepX = dirToPlayerX * speed;
          stepY = dirToPlayerY * speed;
        }
        const oldX = this.x;
        const oldY = this.y;
        tryMoveEnemy(this, this.x + stepX, this.y + stepY);
        const movedDist = Math.hypot(this.x - oldX, this.y - oldY);
        this.isMoving = movedDist > 0.0001;
      } else {
        // Maintain stopping distance
        if (dist < this.config.minDistance) {
          const stepBackSpeed = this.config.speed * 0.7 * delta;
          const backX = -dirToPlayerX * stepBackSpeed;
          const backY = -dirToPlayerY * stepBackSpeed;

          const oldX = this.x;
          const oldY = this.y;

          tryMoveEnemy(this, this.x + backX, this.y + backY);

          const movedDist = Math.hypot(this.x - oldX, this.y - oldY);
          this.isMoving = movedDist > 0.0001;
        }
      }

      // Fire at player on cooldown
      const now = Date.now();
      if (now - this.lastShotTime >= this.config.rateOfFire) {
        this.lastShotTime = now;
        this.shootingTimer = 12; // Show shooting frame for ~12 ticks

        // Play blaster attack sound
        if (this.config.attackSounds && this.config.attackSounds.length > 0) {
          const snd = this.config.attackSounds[
            Math.floor(Math.random() * this.config.attackSounds.length)
          ];
          try {
            const res = sound.play(snd.src, { volume: snd.volume, loop: snd.loop });
            this.trackSoundInstance(res);
          } catch (e) {
            console.warn("Failed to play enemy attack sound:", e);
          }
        }

        onShootPlayer(this, this.config.damage, this.config.accuracy, dist);
      }
    }
  }

  public updateAnimation(playerX: number, playerY: number): void {
    if (!this.animatedSprite) return;

    if (this.config.animationConfig?.omniDirectional) {
      this.isFlipped = false;
      if (this.state === "dead") {
        const deathSpeed = this.config.animationConfig.deathAnimation?.speed ?? 0.14;
        this.playAnimation("death_1", false, deathSpeed);
        if (this.animatedSprite.currentFrame >= this.animatedSprite.totalFrames - 1) {
          this.animatedSprite.gotoAndStop(this.animatedSprite.totalFrames - 1);
        }
        return;
      }

      if (this.shootingTimer > 0) {
        const shootSpeed = this.config.animationConfig.shootingAnimation?.speed ?? 0.16;
        this.playAnimation("shooting", false, shootSpeed);
        return;
      }

      const defSpeed = this.config.animationConfig.defaultAnimation?.speed ?? 0.16;
      this.playAnimation("default", true, defSpeed);
      return;
    }

    if (this.state === "dead") {
      const deathSpeed = this.config.animationConfig?.deathAnimation?.speed ?? 0.14;
      this.isFlipped = false;
      this.playAnimation("death_1", false, deathSpeed);
      // Stay on last frame if complete
      if (this.animatedSprite.currentFrame >= this.animatedSprite.totalFrames - 1) {
        this.animatedSprite.gotoAndStop(this.animatedSprite.totalFrames - 1);
      }
      return;
    }

    if (this.painTimer > 0 && this.animations.damage && this.animations.damage[0] !== Texture.WHITE) {
      this.isFlipped = false;
      this.playAnimation("damage", false);
      return;
    }

    if (this.shootingTimer > 0) {
      const shootSpeed = this.config.animationConfig?.shootingAnimation?.speed ?? 0.16;
      this.isFlipped = false;
      this.playAnimation("shooting", false, shootSpeed);
      return;
    }

    // Relative angle between enemy facing direction and vector to player
    const toPlayerAngle = Math.atan2(playerY - this.y, playerX - this.x);
    const facingAngle = Math.atan2(this.dirY, this.dirX);

    let diff = toPlayerAngle - facingAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const deg = (diff * 180) / Math.PI;

    let dirName: string;
    let flipX = false;

    if (Math.abs(deg) < 22.5) {
      dirName = "towards";
    } else if (deg >= 22.5 && deg < 67.5) {
      dirName = "towards_left_diagonal";
      flipX = true;
    } else if (deg <= -22.5 && deg > -67.5) {
      dirName = "towards_left_diagonal";
      flipX = false;
    } else if (deg >= 67.5 && deg < 112.5) {
      dirName = "left";
      flipX = true;
    } else if (deg <= -67.5 && deg > -112.5) {
      dirName = "left";
      flipX = false;
    } else if (deg >= 112.5 && deg < 157.5) {
      dirName = "away_left_diagonal";
      flipX = true;
    } else if (deg <= -112.5 && deg > -157.5) {
      dirName = "away_left_diagonal";
      flipX = false;
    } else {
      dirName = "away";
    }

    this.isFlipped = flipX;

    if (this.state === "chase" && this.isMoving) {
      this.playAnimation(`walking_${dirName}`, true, 0.16);
    } else {
      this.playAnimation(`standing_${dirName}`, false);
    }
  }

  private playAnimation(key: string, loop: boolean = true, speed: number = 0.16): void {
    if (this.currentAnimKey === key) return;

    const textures = this.animations[key];
    if (!textures || textures.length === 0) return;

    this.currentAnimKey = key;
    this.animatedSprite.textures = textures;
    this.animatedSprite.loop = loop;
    this.animatedSprite.animationSpeed = speed;

    if (textures.length > 1) {
      this.animatedSprite.gotoAndPlay(0);
    } else {
      this.animatedSprite.gotoAndStop(0);
    }
  }

  public dispose(): void {
    this.stopActiveSounds();
    if (this.animatedSprite) {
      this.animatedSprite.mask = null;
      this.animatedSprite.stop();
      this.animatedSprite.destroy();
    }
    if (this.occlusionMask) {
      this.occlusionMask.destroy();
      this.occlusionMask = null;
    }
  }
}