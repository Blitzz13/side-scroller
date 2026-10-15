import { AnimatedSprite, Graphics, MIPMAP_MODES, SCALE_MODES, Spritesheet, Texture } from "pixi.js";
import { sound, IMediaInstance } from "@pixi/sound";
import { IRaycastEnemyConfig } from "../../configs/interfaces/IRaycastEnemyConfig";
import { RaycastEnemyType } from "../../enums/RaycastEnemyType";
import { RaycastDirectionalObject } from "./RaycastDirectionalObject";
import { IEnemyItemDrop } from "./types";
import { AStarPathFollower } from "../../plugins/pathfinding";

export type EnemyAIState = "idle" | "chase" | "attack" | "dead";
export type DiagonaPhase =
  | "hidden"
  | "emerging"
  | "peeking"
  | "stalking"
  | "hiding"
  | "full_emerging"
  | "surfaced"
  | "biting";

export class RaycastEnemy extends RaycastDirectionalObject {
  public config: IRaycastEnemyConfig;
  public health: number;
  public maxHealth: number;
  public state: EnemyAIState = "idle";
  public isMoving: boolean = false;
  public itemDrop?: IEnemyItemDrop;
  public triggerAlert: boolean = false;
  public onAlertTriggered?: (enemy: RaycastEnemy) => void;

  // A* Pathfinding agent properties
  public pathFollower: AStarPathFollower = new AStarPathFollower();
  public pathTargetX: number = -1;
  public pathTargetY: number = -1;
  public pathCooldown: number = 0;
  public isWaitingForDoor: boolean = false;
  public isWaitingForAlly: boolean = false;
  public isNearDoor: boolean = false;
  public nearestDoorDist: number = Infinity;
  public nearestDoorCell: { x: number; y: number } | null = null;
  public doorOnSightLine: { x: number; y: number } | null = null;
  public shoulderVisibilityLostTimer: number = 0;
  public advanceTimer: number = 0;

  // Vision cone settings (degrees) - adjustable per enemy, except Viper Probe Droid (always 360)
  public static defaultVisionConeAngle: number = 120;
  private _visionConeAngle: number = 120;

  public get visionConeAngle(): number {
    if (this.config.type === RaycastEnemyType.VIPER_DROID) {
      return 360; // Viper Probe Droid has 360-degree omnidirectional sensor vision
    }
    return this._visionConeAngle;
  }

  public set visionConeAngle(angle: number) {
    if (this.config.type === RaycastEnemyType.VIPER_DROID) {
      return; // Viper Droid is exempt from cone restriction and retains 360-degree vision
    }
    this._visionConeAngle = Math.max(0, Math.min(360, angle));
  }

  public get fov(): number {
    return this.visionConeAngle;
  }

  public set fov(angle: number) {
    this.visionConeAngle = angle;
  }

  public setVisionCone(angleDegrees: number): void {
    this.visionConeAngle = angleDegrees;
  }

  /**
   * Checks whether the target position lies within this enemy's forward vision cone.
   * For the Viper Probe Droid, this always returns true as it has 360-degree omnidirectional vision.
   */
  public isPointInVisionCone(targetX: number, targetY: number): boolean {
    if (this.config.type === RaycastEnemyType.VIPER_DROID) {
      return true; // Viper Probe Droid has 360-degree omnidirectional vision
    }

    const angle = this.visionConeAngle;
    if (angle >= 360) {
      return true;
    }
    if (angle <= 0) {
      return false;
    }

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < 0.000001) {
      return true;
    }

    const dist = Math.sqrt(distSq);
    const toTargetX = dx / dist;
    const toTargetY = dy / dist;

    const dirLen = Math.hypot(this.dirX, this.dirY);
    const fx = dirLen > 0.0001 ? this.dirX / dirLen : 0;
    const fy = dirLen > 0.0001 ? this.dirY / dirLen : 1;

    // Dot product gives cos(theta) between enemy facing direction and vector to target
    const dot = fx * toTargetX + fy * toTargetY;

    // Half of the total cone angle in radians
    const halfAngleRad = ((angle / 2) * Math.PI) / 180;
    const minDot = Math.cos(halfAngleRad);

    return dot >= minDot;
  }

  /**
   * Checks whether this enemy can visually detect the player, taking into account
   * distance, vision cone FOV, and map geometry line-of-sight.
   */
  public canSeePlayer(
    playerX: number,
    playerY: number,
    hasLineOfSight: (x1: number, y1: number, x2: number, y2: number) => boolean,
    distance?: number
  ): boolean {
    const dist = distance !== undefined ? distance : Math.hypot(playerX - this.x, playerY - this.y);
    const sightRange = this.config.sightRange ?? 12;
    if (dist > sightRange) {
      return false;
    }
    if (!this.isPointInVisionCone(playerX, playerY)) {
      return false;
    }
    return hasLineOfSight(this.x, this.y, playerX, playerY);
  }

  /**
   * Tactical combat formation slot matrix.
   * Defines staggered firing positions so enemies naturally split into
   * front row, middle row, and rear row, with left/center/right lateral offsets.
   * Distances are scaled relative to enemy attack range so all slots stay inside firing range.
   */
  public static readonly COMBAT_FORMATION_SLOTS: Array<{ distRatio: number; lateral: number }> = [
    { distRatio: 0.58, lateral: -1.0 }, // Slot 0: Front Row, Left Flank (~3.2 tiles for range 5.5)
    { distRatio: 0.78, lateral: +0.0 }, // Slot 1: Mid Row, Center Corridor (~4.3 tiles for range 5.5)
    { distRatio: 0.92, lateral: +1.1 }, // Slot 2: Back Row, Right Flank (~5.0 tiles for range 5.5)
    { distRatio: 0.62, lateral: +0.9 }, // Slot 3: Front Row, Right Flank (~3.4 tiles for range 5.5)
    { distRatio: 0.82, lateral: -1.1 }, // Slot 4: Mid Row, Left Flank (~4.5 tiles for range 5.5)
    { distRatio: 0.90, lateral: -0.6 }, // Slot 5: Back Row, Left-Center (~4.9 tiles for range 5.5)
  ];

  /**
   * Checks that a straight walk from (x1,y1) to (x2,y2) is free of walls, testing the center
   * line plus two parallel lines offset by roughly the enemy's body radius.
   */
  private isStraightLineClear(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    lineCheck: (x1: number, y1: number, x2: number, y2: number) => boolean
  ): boolean {
    if (!lineCheck(x1, y1, x2, y2)) return false;
    const segDx = x2 - x1;
    const segDy = y2 - y1;
    const segLen = Math.hypot(segDx, segDy);
    if (segLen < 0.001) return true;
    const off = 0.3;
    const offX = (-segDy / segLen) * off;
    const offY = (segDx / segLen) * off;
    return (
      lineCheck(x1 + offX, y1 + offY, x2 + offX, y2 + offY) &&
      lineCheck(x1 - offX, y1 - offY, x2 - offX, y2 - offY)
    );
  }

  /**
   * Calculates the designated tactical combat target position and preferred shooting distance.
   * Ensures the formation slot is within attack range and maintains line of fire.
   */
  public getCombatTargetPosition(
    playerX: number,
    playerY: number,
    hasLineOfSight: (x1: number, y1: number, x2: number, y2: number) => boolean,
    hasLineOfFire?: (x1: number, y1: number, x2: number, y2: number) => boolean
  ): { x: number; y: number; preferredDist: number } {
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const currentDist = Math.hypot(dx, dy);

    const isMelee = Boolean(this.config.isMelee);
    const attackRange = this.config.attackRange ?? (isMelee ? 1.2 : 5.5);

    if (currentDist < 0.001) {
      return { x: this.x, y: this.y, preferredDist: isMelee ? 1.0 : attackRange * 0.75 };
    }

    const fromPlayerX = -dx / currentDist;
    const fromPlayerY = -dy / currentDist;
    const perpX = -fromPlayerY;
    const perpY = fromPlayerX;

    let preferredDist: number;
    let preferredLateral: number;

    if (isMelee) {
      preferredDist = 1.0;
      const meleeOffsets = [-0.7, 0.0, +0.7, -0.4, +0.4, 0.0];
      preferredLateral = meleeOffsets[this.id % meleeOffsets.length];
    } else {
      const slot = RaycastEnemy.COMBAT_FORMATION_SLOTS[this.id % RaycastEnemy.COMBAT_FORMATION_SLOTS.length];
      preferredDist = Math.max(2.6, Math.min(attackRange - 0.35, attackRange * slot.distRatio));
      preferredLateral = slot.lateral;
    }

    const checkClear = (x: number, y: number): boolean => {
      if (!hasLineOfSight(playerX, playerY, x, y)) return false;
      if (hasLineOfFire && !hasLineOfFire(playerX, playerY, x, y)) return false;
      return true;
    };

    // 1. Full lateral offset
    const fullX = playerX + fromPlayerX * preferredDist + perpX * preferredLateral;
    const fullY = playerY + fromPlayerY * preferredDist + perpY * preferredLateral;
    if (checkClear(fullX, fullY)) {
      return { x: fullX, y: fullY, preferredDist };
    }

    // 2. Half lateral offset
    const halfX = playerX + fromPlayerX * preferredDist + perpX * (preferredLateral * 0.5);
    const halfY = playerY + fromPlayerY * preferredDist + perpY * (preferredLateral * 0.5);
    if (checkClear(halfX, halfY)) {
      return { x: halfX, y: halfY, preferredDist };
    }

    // 3. Direct radial line at preferred distance
    const directX = playerX + fromPlayerX * preferredDist;
    const directY = playerY + fromPlayerY * preferredDist;
    if (checkClear(directX, directY)) {
      return { x: directX, y: directY, preferredDist };
    }

    // 4. If preferred distance is blocked behind the enemy by a wall, test current distance
    if (preferredDist > currentDist && currentDist >= (this.config.minDistance ?? 2.0)) {
      const curFullX = playerX + fromPlayerX * currentDist + perpX * preferredLateral;
      const curFullY = playerY + fromPlayerY * currentDist + perpY * preferredLateral;
      if (checkClear(curFullX, curFullY)) {
        return { x: curFullX, y: curFullY, preferredDist: currentDist };
      }
      if (checkClear(this.x, this.y)) {
        return { x: this.x, y: this.y, preferredDist: currentDist };
      }
    }

    // 5. Fallback: maintain distance along line to player
    return {
      x: playerX + fromPlayerX * preferredDist,
      y: playerY + fromPlayerY * preferredDist,
      preferredDist,
    };
  }

  public triggerAlertEvent(): void {
    if (!this.triggerAlert) return;
    this.onAlertTriggered?.(this);
    const customSound = (this.config as any).alertSound || `alert_${this.config.type}`;
    if (sound.exists(customSound)) {
      try {
        sound.play(customSound, { volume: 0.6 });
      } catch {}
    } else if (sound.exists("enemy_alert")) {
      try {
        sound.play("enemy_alert", { volume: 0.6 });
      } catch {}
    }
  }

  /**
   * Alerts the enemy to suspicious noise, gunfire, or projectile near-misses/impacts.
   * Wakes the enemy from idle into chase/search state and turns towards the source of the disturbance.
   */
  public alert(sourceX: number, sourceY: number, forceFaceSource: boolean = true): void {
    if (this.isDead) return;
    this.triggerAlertEvent();

    if (this.config.type === RaycastEnemyType.DIAGONA) {
      if (this.diagonaPhase === "hidden" || this.diagonaPhase === "peeking") {
        this.diagonaPhase = "emerging";
        this.state = "chase";
        this.diagonaAnimTimer = 0.6;
        this.playAnimation("coming_out", false, 0.11);
        const dist = Math.hypot(sourceX - this.x, sourceY - this.y);
        this.playDiagonaSound("diagona_coming_out", dist);
      }
    } else if (this.state === "idle") {
      this.state = "chase";
    }

    this.lastKnownPlayerX = sourceX;
    this.lastKnownPlayerY = sourceY;
    this.hasTarget = true;
    this.searchTimer = this.lostSightDuration;

    if (forceFaceSource) {
      const dx = sourceX - this.x;
      const dy = sourceY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) {
        this.dirX = dx / dist;
        this.dirY = dy / dist;
      }
    }
  }

  // Diagona specific state
  public diagonaPhase: DiagonaPhase = "hidden";
  public diagonaBlinkTimer: number = 0;
  public diagonaBlinkDuration: number = 0;
  public diagonaAnimTimer: number = 0;
  public diagonaSubmergedTimer: number = 0;
  public diagonaResetToIdleAfterHide: boolean = false;
  private diagonaHasPlayedEmergeSound: boolean = false;

  // Timing
  public shootingTimer: number = 0;
  public painTimer: number = 0;
  public lastShotTime: number = 0;
  public hasDroppedLoot: boolean = false;

  // Melee & Shield state
  public isShielding: boolean = false;
  public shieldTimer: number = 0;
  public shieldCooldownTimer: number = 0;
  public meleeTimer: number = 0;
  public stepSoundTimer: number = 0;

  // Voiceline & awareness tracking
  public wasSeeingPlayer: boolean = false;
  public justSpottedPlayer: boolean = false;
  public lastSpottedTime: number = 0;
  public lastSuspiciousTime: number = 0;
  public lastGrenadeTime: number = 0;

  // Target acquisition and initial sight accuracy ramp tracking
  public timeTargetVisible: number = 0; // Duration in ms the enemy has maintained sight of the player
  public sightLostTimer: number = 0; // Duration in ms since enemy lost sight of the player
  public shotsFiredAtTarget: number = 0; // Number of shots fired since last acquiring player

  /**
   * Calculates the current accuracy multiplier for this enemy based on how long
   * the player has been continuously visible and how many shots have been fired.
   * Returns a multiplier between initialAccuracyMultiplier (default ~0.35) and 1.0.
   */
  public getTargetAcquisitionMultiplier(): { multiplier: number; rampProgress: number } {
    const initialMultiplier = this.config.initialAccuracyMultiplier ?? 0.35;
    const rampDuration = this.config.accuracyRampTime ?? 2500;
    const rampProgress = Math.min(1.0, Math.max(0, this.timeTargetVisible / rampDuration));

    let multiplier = initialMultiplier + (1.0 - initialMultiplier) * rampProgress;

    const firstShotsCount = this.config.firstShotsInaccuracyCount ?? 2;
    if (this.shotsFiredAtTarget <= 0) {
      multiplier = Math.min(multiplier, initialMultiplier);
    } else if (this.shotsFiredAtTarget < firstShotsCount) {
      const intermediate = initialMultiplier + (1.0 - initialMultiplier) * 0.5;
      multiplier = Math.min(multiplier, intermediate);
    }

    return { multiplier, rampProgress };
  }

  // Target tracking & repositioning
  public lastKnownPlayerX: number = 0;
  public lastKnownPlayerY: number = 0;
  public hasTarget: boolean = false;
  public searchTimer: number = 0;
  public get lostSightDuration(): number {
    const raw =
      this.config.lostSightDuration ??
      (this.config.lostSightDurationFrames ? this.config.lostSightDurationFrames / 60 : 4.0);
    return raw > 30 ? raw / 60 : raw;
  }
  public repositionCooldown: number = 0;
  public wanderDirX: number = 0;
  public wanderDirY: number = 0;
  public stuckFrames: number = 0;
  public stepOutTimer: number = 0;
  public get stepOutFrames(): number {
    return this.stepOutTimer * 60;
  }
  public set stepOutFrames(val: number) {
    this.stepOutTimer = val > 10 ? val / 60 : val;
  }
  public clearanceDir: number = 0;
  public clearanceTimer: number = 0;
  public attackStanceFrames: number = 0;

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

  private playDiagonaSound(name: string, dist?: number): void {
    const alias = name.startsWith("diagona_") ? name : `diagona_${name}`;
    try {
      const targetSound = sound.exists(alias) ? alias : sound.exists(name) ? name : null;
      if (!targetSound) return;

      let volume = 0.85;
      if (dist !== undefined) {
        const maxDist = Math.max(14, this.config.sightRange || 14);
        const falloff = Math.max(0.1, Math.min(1.0, 1.0 - dist / maxDist));
        volume *= falloff;
      }

      const res = sound.play(targetSound, { volume, loop: false });
      this.trackSoundInstance(res);
    } catch (e) {
      console.warn(`Failed to play diagona sound ${alias}:`, e);
    }
  }

  constructor(
    id: number,
    config: IRaycastEnemyConfig,
    x: number,
    y: number,
    spritesheet?: Spritesheet,
    visionConeAngle?: number
  ) {
    super(id, x, y, 0, 1, config.scale ?? 1, config.referenceHeight ?? 67);
    this.config = config;
    this.health = config.maxHealth;
    this.maxHealth = config.maxHealth;
    if (config.type === RaycastEnemyType.VIPER_DROID) {
      this._visionConeAngle = 360; // Viper Probe Droid is exempt from cone restriction
    } else {
      this._visionConeAngle =
        visionConeAngle ??
        config.visionConeAngle ??
        config.fov ??
        RaycastEnemy.defaultVisionConeAngle;
    }
    this.currentVOffset = config.vOffset ?? 0;
    if (config.shieldInterval) {
      this.shieldCooldownTimer = config.shieldInterval * (0.8 + Math.random() * 0.4);
    }
    if (config.type === RaycastEnemyType.DIAGONA) {
      this.diagonaPhase = "hidden";
      this.diagonaAnimTimer = 0;
      this.diagonaBlinkTimer = 150 + Math.random() * 150;
    }

    if (spritesheet) {
      this.initAnimatedSprite(spritesheet);
    }
  }

  public initAnimatedSprite(spritesheet: Spritesheet): void {
    if (spritesheet.baseTexture) {
      spritesheet.baseTexture.scaleMode = SCALE_MODES.NEAREST;
      spritesheet.baseTexture.mipmap = MIPMAP_MODES.OFF;
      spritesheet.baseTexture.update();
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

    if (this.config.type === RaycastEnemyType.DIAGONA) {
      const hidingFrames = getFrames("hiding", 2);
      this.animations = {
        coming_out: getFrames("coming_out", 4),
        idle_1: getSingle("idle_1"),
        idle_2: getSingle("idle_2"),
        hiding: hidingFrames,
        hiding_last: [hidingFrames[hidingFrames.length - 1] || getSingle("hiding_2")[0] || Texture.WHITE],
        full_come_out: getFrames("full_come_out", 4),
        full_idle: getSingle("full_idle"),
        attack: getSingle("attack"),
        death_1: getFrames("death", 7),
      };

      const initialTextures = this.animations.hiding_last || [Texture.WHITE];
      this.animatedSprite = new AnimatedSprite(initialTextures);
      this.animatedSprite.anchor.set(0.5, 1.0);
      this.animatedSprite.animationSpeed = 0.08;
      this.animatedSprite.roundPixels = true;
      this.animatedSprite.visible = false;
      this.currentAnimKey = "hiding_last";
      this.diagonaPhase = "hidden";
      this.diagonaAnimTimer = 0;
      this.diagonaBlinkTimer = 120 + Math.random() * 120;
      this.diagonaBlinkDuration = 0;
      this.animatedSprite.loop = false;
      this.animatedSprite.gotoAndStop(0);
      return;
    }

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
    const meleePrefix = animConfig?.meleePrefix ?? "melee_attack";
    const meleeCount = animConfig?.meleeAnimation?.count ?? 5;
    const shieldName = animConfig?.shieldFrame ?? "shield";
    const deathCount = animConfig?.deathAnimation?.count ?? 8;
    const shootCount = animConfig?.shootingAnimation?.count ?? 6;

    const hasSingleShoot = Boolean(texs[`${shootName}.png`] || texs[shootName]);
    const hasMelee = Boolean(
      texs[`${meleePrefix}_1.png`] ||
      texs[`${meleePrefix}_1`] ||
      texs[`${meleePrefix}1.png`] ||
      texs[`${meleePrefix}1`]
    );
    const hasShield = Boolean(texs[`${shieldName}.png`] || texs[shieldName]);

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

      // 4. Melee attack animation
      ...(hasMelee ? { melee_attack: getFrames(meleePrefix, meleeCount) } : {}),

      // 5. Shield stance
      ...(hasShield ? { shield: getSingle(shieldName) } : {}),

      // 6. Death animations (supports up to deathCount frames)
      death_1: getFrames(deathPrefix, deathCount),
      death_2: getFrames(deathPrefix.replace("_1", "_2"), deathCount),

      // 7. Optional damage / hit reaction pose
      ...((texs["damage.png"] || texs["damage"] || texs["damage_1.png"] || texs["damage_1"])
        ? { damage: (texs["damage.png"] || texs["damage"]) ? getSingle("damage") : getFrames("damage", 2) }
        : (texs["damage_towards.png"] || texs["damage_towards"])
        ? {
            damage: getSingle("damage_towards"),
            damage_towards: getSingle("damage_towards"),
            damage_towards_left_diagonal: getSingle("damage_left_diagonal"),
            damage_left: getSingle("damage_left"),
            damage_away_left_diagonal: getSingle("damage_away_left_diagonal"),
            damage_away: getSingle("damage_away"),
          }
        : {}),
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

    // Diagona is immune to damage while submerged or coming out
    if (this.config.type === RaycastEnemyType.DIAGONA) {
      if (
        this.diagonaPhase === "hidden" ||
        this.diagonaPhase === "full_emerging" ||
        this.diagonaPhase === "emerging" ||
        this.diagonaPhase === "hiding"
      ) {
        return false;
      }
    }

    this.health = Math.max(0, this.health - amount);
    this.painTimer = 0.13; // Flash red for ~0.13s

    if (this.config.type === RaycastEnemyType.DIAGONA) {
      if (this.health <= 0) {
        this.state = "dead";
        this.diagonaPhase = "surfaced";
        this.isMoving = false;
        this.stopActiveSounds();

        if (this.onDeathCallback) {
          this.onDeathCallback(this);
        }
        if (onDeath) {
          onDeath(this);
        }

        this.playAnimation("death_1", false, 0.14);
        this.playDiagonaSound("diagona_die");
        return true;
      }

      if (this.diagonaPhase === "peeking" || this.diagonaPhase === "stalking") {
        this.state = "chase";
        const distToSource =
          sourceX !== undefined && sourceY !== undefined
            ? Math.hypot(sourceX - this.x, sourceY - this.y)
            : 999;
        if (distToSource <= 2.2) {
          this.diagonaPhase = "full_emerging";
          this.diagonaAnimTimer = 0.73;
          this.playAnimation("full_come_out", false, 0.09);
          this.playDiagonaSound("diagona_coming_out", distToSource);
        } else {
          this.diagonaPhase = "stalking";
          this.diagonaSubmergedTimer = 4.0;
        }
      }
      if (sourceX !== undefined && sourceY !== undefined) {
        this.lastKnownPlayerX = sourceX;
        this.lastKnownPlayerY = sourceY;
        this.hasTarget = true;
        this.searchTimer = this.lostSightDuration;
      }

      this.playDiagonaSound("diagona_damage_1");
      return false;
    }

    if (sourceX !== undefined && sourceY !== undefined) {
      this.alert(sourceX, sourceY, true);
    } else if (this.state === "idle") {
      this.state = "chase";
    }

    if (this.health <= 0) {
      this.state = "dead";
      this.isMoving = false;
      this.isShielding = false;
      this.shieldTimer = 0;
      this.meleeTimer = 0;

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
    this.isWaitingForDoor = false;
    this.isWaitingForAlly = false;
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

    // If waiting for a door to finish opening, or queued behind an ally, wait patiently without feeling walls
    if (this.isWaitingForDoor || this.isWaitingForAlly) {
      this.stuckFrames = 0;
      return false;
    }

    // 2. Multi-angle feelers for fluid diagonal steering around corners, allies, and obstacles
    // When approaching or passing through a doorway, suppress wide angles (>= 60 deg) to prevent sliding sideways along door walls
    const angleDeviations = this.nearestDoorDist < 1.6
      ? [
          Math.PI / 12, -Math.PI / 12,
          Math.PI / 6, -Math.PI / 6,
          Math.PI / 4, -Math.PI / 4,
          Math.PI / 3, -Math.PI / 3,
        ]
      : [
          Math.PI / 12, -Math.PI / 12,
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
    }

    // 3. Sliding on axes with dominant axis evaluated first to avoid rigid Manhattan stepping
    const absX = Math.abs(baseDirX);
    const absY = Math.abs(baseDirY);

    if (absX >= absY) {
      if (tryMoveEnemy(this, this.x + baseDirX * speed, this.y)) {
        this.stuckFrames = 0;
        this.dirX = baseDirX;
        this.dirY = 0;
        return true;
      }
      if (tryMoveEnemy(this, this.x, this.y + baseDirY * speed)) {
        this.stuckFrames = 0;
        this.dirX = 0;
        this.dirY = baseDirY;
        return true;
      }
    } else {
      if (tryMoveEnemy(this, this.x, this.y + baseDirY * speed)) {
        this.stuckFrames = 0;
        this.dirX = 0;
        this.dirY = baseDirY;
        return true;
      }
      if (tryMoveEnemy(this, this.x + baseDirX * speed, this.y)) {
        this.stuckFrames = 0;
        this.dirX = baseDirX;
        this.dirY = 0;
        return true;
      }
    }

    // Secondary single-axis feelers if both primary axes were blocked (suppressed near doorways to prevent lateral wall sliding)
    if (this.nearestDoorDist >= 1.6) {
      for (const dev of angleDeviations) {
        const testAngle = baseAngle + dev;
        const testDirX = Math.cos(testAngle);
        const testDirY = Math.sin(testAngle);

        if (tryMoveEnemy(this, this.x + testDirX * speed, this.y)) {
          this.stuckFrames = 0;
          this.dirX = testDirX;
          this.dirY = 0;
          return true;
        }
        if (tryMoveEnemy(this, this.x, this.y + testDirY * speed)) {
          this.stuckFrames = 0;
          this.dirX = 0;
          this.dirY = testDirY;
          return true;
        }
      }
    }

    // 4. If stuck against a corner or obstacle, nudge towards the center of the current cell or doorway opening
    if (this.stuckFrames >= 2) {
      let cellCenterX = Math.floor(this.x) + 0.5;
      let cellCenterY = Math.floor(this.y) + 0.5;

      // If near a doorway, nudge towards the doorway opening center to clear door jamb corners
      if (this.nearestDoorCell && this.nearestDoorDist < 1.8) {
        cellCenterX = this.nearestDoorCell.x + 0.5;
        cellCenterY = this.nearestDoorCell.y + 0.5;
      }

      const toCenterX = cellCenterX - this.x;
      const toCenterY = cellCenterY - this.y;
      const centerDist = Math.hypot(toCenterX, toCenterY);
      if (centerDist > 0.04) {
        const nudgeSpeed = Math.min(speed, centerDist);
        const nudgeX = (toCenterX / centerDist) * nudgeSpeed;
        const nudgeY = (toCenterY / centerDist) * nudgeSpeed;
        if (tryMoveEnemy(this, this.x + nudgeX, this.y + nudgeY)) {
          this.dirX = toCenterX / centerDist;
          this.dirY = toCenterY / centerDist;
          this.stuckFrames = 0;
          return true;
        }
      }
    }

    if (this.stuckFrames >= 25) {
      this.pathFollower.clear();
      this.pathCooldown = 0;
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
    hasLineOfFire?: (x1: number, y1: number, x2: number, y2: number) => boolean,
    playerDirX?: number,
    playerDirY?: number,
    activeGrenades?: readonly { x: number; y: number; radius?: number }[],
    pathNextStep?: { x: number; y: number } | null
  ): void {
    const dt = delta / 60;

    if (this.painTimer > 0) {
      this.painTimer = Math.max(0, this.painTimer - dt);
    }

    if (this.state === "dead") {
      if (this.currentVOffset > 0) {
        this.currentVOffset = Math.max(0, this.currentVOffset - 0.015 * delta);
      }
      return;
    }

    if (this.config.type === RaycastEnemyType.DIAGONA) {
      this.updateDiagona(
        delta,
        playerX,
        playerY,
        hasLineOfSight,
        tryMoveEnemy,
        onShootPlayer,
        hasLineOfFire,
        playerDirX,
        playerDirY,
        activeGrenades
      );
      return;
    }

    if (this.shootingTimer > 0) {
      this.shootingTimer = Math.max(0, this.shootingTimer - dt);
    }
    if (this.meleeTimer > 0) {
      this.meleeTimer = Math.max(0, this.meleeTimer - dt);
    }

    // Update periodic shield logic
    const hasShield = Boolean(this.animations.shield || this.config.shieldDuration);
    if (hasShield) {
      const rawShieldDuration = this.config.shieldDuration ?? 2.0;
      const shieldDuration = rawShieldDuration > 20 ? rawShieldDuration / 60 : rawShieldDuration;
      const rawInterval = this.config.shieldInterval ?? 3.0;
      const baseInterval = rawInterval > 20 ? rawInterval / 60 : rawInterval;

      if (this.isShielding) {
        this.shieldTimer -= dt;
        this.isMoving = false;
        if (this.shieldTimer <= 0) {
          this.isShielding = false;
          this.shieldCooldownTimer = baseInterval * (0.8 + Math.random() * 0.4);
        }
      } else if (this.state === "chase" || this.state === "attack") {
        this.shieldCooldownTimer -= dt;
        if (this.shieldCooldownTimer <= 0 && this.meleeTimer <= 0) {
          this.isShielding = true;
          this.shieldTimer = shieldDuration;
          this.isMoving = false;
        }
      }
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
    const inCone = this.isPointInVisionCone(playerX, playerY);
    const hasCombatAwareness = this.state === "chase" || this.state === "attack" || this.hasTarget;
    const seesPlayer = los && (inCone || (hasCombatAwareness && dist <= (this.config.sightRange ?? 12))) && dist <= (this.config.sightRange ?? 12);

    const dirToPlayerX = dist > 0.001 ? dx / dist : 0;
    const dirToPlayerY = dist > 0.001 ? dy / dist : 1;
    const perpX = -dirToPlayerY;
    const perpY = dirToPlayerX;

    // Check visibility from left and right shoulders to ensure enemy emerges fully from corner edges
    const shoulderOffset = this.config.shoulderOffset ?? 0.35;
    const clearanceMultiplier = this.config.coverClearanceOffset ?? 1.5;
    const rawStepOut = this.config.stepOutDuration ?? (this.config.stepOutFrames ? this.config.stepOutFrames / 60 : 0.5);
    const defaultStepOut = rawStepOut > 10 ? rawStepOut / 60 : rawStepOut;

    const losLeft = hasLineOfSight(this.x - perpX * shoulderOffset, this.y - perpY * shoulderOffset, playerX, playerY);
    const losRight = hasLineOfSight(this.x + perpX * shoulderOffset, this.y + perpY * shoulderOffset, playerX, playerY);
    const lofLeft = hasLineOfFire ? hasLineOfFire(this.x - perpX * shoulderOffset, this.y - perpY * shoulderOffset, playerX, playerY) : losLeft;
    const lofRight = hasLineOfFire ? hasLineOfFire(this.x + perpX * shoulderOffset, this.y + perpY * shoulderOffset, playerX, playerY) : losRight;

    const fullVisibility = los && losLeft && losRight && lof && lofLeft && lofRight;

    if (seesPlayer && !this.wasSeeingPlayer) {
      this.stepOutTimer = dist <= this.config.attackRange ? 0 : defaultStepOut;
      this.justSpottedPlayer = true;
      this.triggerAlertEvent();
      this.timeTargetVisible = 0;
      this.shotsFiredAtTarget = 0;
      this.sightLostTimer = 0;

      // Small natural reaction delay before first shot so enemy does not instagib on frame 0
      const reactionDelay = Math.min(180, this.config.initialReactionDelay ?? 180);
      const now = Date.now();
      this.lastShotTime = Math.max(this.lastShotTime, now - this.config.rateOfFire + reactionDelay);
    } else if (this.wasSeeingPlayer && !seesPlayer) {
      // Just lost direct sight of the player around a corner or door!
      // Immediately reset path cooldown so enemy repaths around the corner next frame
      this.pathCooldown = 0;
      this.hasTarget = true;
      this.lastKnownPlayerX = playerX;
      this.lastKnownPlayerY = playerY;
      this.searchTimer = this.lostSightDuration;
      if (this.state === "idle" || this.state === "attack") {
        this.state = "chase";
      }
    }
    this.wasSeeingPlayer = seesPlayer;

    if (this.stepOutTimer > 0) {
      this.stepOutTimer = Math.max(0, this.stepOutTimer - dt);
    }

    // Track sight / target knowledge
    if (seesPlayer) {
      this.timeTargetVisible += delta * (1000 / 60);
      this.sightLostTimer = 0;
      this.lastKnownPlayerX = playerX;
      this.lastKnownPlayerY = playerY;
      this.hasTarget = true;
      this.searchTimer = this.lostSightDuration;
    } else {
      this.sightLostTimer += delta * (1000 / 60);
      if (this.sightLostTimer > 1000) {
        // Player broke line of sight for >1.0s -> reset target tracking and accuracy ramp
        this.timeTargetVisible = 0;
        this.shotsFiredAtTarget = 0;
      }
      if (this.searchTimer > 0) {
        this.searchTimer = Math.max(0, this.searchTimer - dt);
        if (this.searchTimer <= 0) {
          this.hasTarget = false;
          this.pathFollower.clear();
          if (this.state === "chase") {
            this.state = "idle";
            this.isMoving = false;
          }
        }
      }
    }

    if (dist > 0.001) {
      // Face towards player when active and not actively moving
      if (this.state !== "idle" && !this.isMoving) {
        if (seesPlayer || (hasCombatAwareness && los)) {
          this.dirX = dx / dist;
          this.dirY = dy / dist;
        } else if (this.hasTarget) {
          const targetCoordX = pathNextStep ? pathNextStep.x : this.lastKnownPlayerX;
          const targetCoordY = pathNextStep ? pathNextStep.y : this.lastKnownPlayerY;
          const tdx = targetCoordX - this.x;
          const tdy = targetCoordY - this.y;
          const tdist = Math.hypot(tdx, tdy);
          if (tdist > 0.001) {
            this.dirX = tdx / tdist;
            this.dirY = tdy / tdist;
          }
        }
      }
    }

    // While shielding, enemy stops moving and continuously faces player
    if (this.isShielding) {
      this.isMoving = false;
      this.stepSoundTimer = 0;
      if (dist > 0.001) {
        this.dirX = dx / dist;
        this.dirY = dy / dist;
      }
      return;
    }

    // Footstep audio while moving
    if (this.isMoving && this.config.stepSounds && this.config.stepSounds.length > 0 && !this.isDead) {
      this.stepSoundTimer += dt;
      if (this.stepSoundTimer >= 0.36) {
        this.stepSoundTimer = 0;
        const snd = this.config.stepSounds[
          Math.floor(Math.random() * this.config.stepSounds.length)
        ];
        try {
          const falloff = Math.max(0.1, Math.min(0.65, (1 - dist / 14) * 0.65));
          sound.play(snd.src, { volume: falloff, loop: false });
        } catch {}
      }
    } else {
      this.stepSoundTimer = 0;
    }

    // Scan for nearby active thermal detonators threatening this enemy
    let closestThreatGrenade: { x: number; y: number; radius: number; dist: number } | null = null;
    let closestThreatDist = Infinity;

    if (activeGrenades && activeGrenades.length > 0) {
      for (const g of activeGrenades) {
        const gRadius = g.radius ?? 3.5;
        const dangerRadius = gRadius + 1.2;
        const gDist = Math.hypot(this.x - g.x, this.y - g.y);
        if (gDist <= dangerRadius && gDist < closestThreatDist) {
          // Check line of sight: only panic/flee if not protected behind a solid wall or closed door
          const hasLosToGrenade = hasLineOfSight(this.x, this.y, g.x, g.y);
          if (hasLosToGrenade) {
            closestThreatDist = gDist;
            closestThreatGrenade = { x: g.x, y: g.y, radius: gRadius, dist: gDist };
          }
        }
      }
    }

    // State Machine
    if (closestThreatGrenade) {
      // Immediate emergency alert: wake up from idle or break out from stationary attack into motion
      if (this.state === "idle" || this.state === "attack") {
        this.state = "chase";
        this.hasTarget = true;
        this.lastKnownPlayerX = playerX;
        this.lastKnownPlayerY = playerY;
        this.searchTimer = this.lostSightDuration;
        if (dist > 0.001) {
          this.dirX = dx / dist;
          this.dirY = dy / dist;
        }
      }
    }

    const inAttackRange = dist <= this.config.attackRange && los && lof;
    const inDoorway = this.nearestDoorDist < 1.2;
    const shootingThroughDoor = this.doorOnSightLine !== null;

    // Ranged enemies stop and shoot when within attackRange with direct line of sight and line of fire,
    // outside of door thresholds. Melee enemies stop to attack when within melee attack range.
    const canStopAndAttack =
      inAttackRange &&
      !shootingThroughDoor &&
      !inDoorway &&
      (this.config.isMelee ? dist <= (this.config.attackRange ?? 1.25) : true);

    if (this.state === "idle") {
      this.isMoving = false;
      this.shoulderVisibilityLostTimer = 0;
      // Alerted by direct sight within forward vision cone OR target memory
      if (seesPlayer || this.hasTarget) {
        if (canStopAndAttack && !closestThreatGrenade) {
          this.state = "attack";
          this.isMoving = false;
          this.pathFollower.clear();
          this.shoulderVisibilityLostTimer = 0;
        } else {
          this.state = "chase";
        }
      }
    } else if (this.state === "chase") {
      if (this.advanceTimer > 0) {
        this.advanceTimer = Math.max(0, this.advanceTimer - dt);
      }
      this.attackStanceFrames = 0;

      if (canStopAndAttack && !closestThreatGrenade) {
        this.state = "attack";
        this.isMoving = false;
        this.pathFollower.clear();
        this.shoulderVisibilityLostTimer = 0;
      } else {
        // Suppressive fire on the move: enemies breaching through doors or repositioning
        // fire with slightly lowered accuracy (0.6x) to pressure the player without stopping
        if (seesPlayer && lof && dist <= this.config.attackRange && !closestThreatGrenade) {
          this.tryFireAtPlayer(dist, 0.6, onShootPlayer);
        }

        // Move / reposition towards player, or flee from / attack around grenade
        let speed = this.config.speed * delta;
        let tx = playerX;
        let ty = playerY;

        if (closestThreatGrenade) {
          // Panic sprint speed when escaping or rushing around grenade
          speed *= 1.35;

          const gDx = this.x - closestThreatGrenade.x;
          const gDy = this.y - closestThreatGrenade.y;
          const gDist = Math.max(0.01, closestThreatGrenade.dist);
          const awayX = gDx / gDist;
          const awayY = gDy / gDist;

          // Enemies decide to run from the grenade or aggressively attack the player:
          // 1. Melee enemies (e.g. Dark Trooper) always charge towards the player to attack.
          // 2. If stuck against a wall while fleeing, turn and rush the player.
          // 3. If very close to grenade (<= 2.6 tiles), prioritize running away from it.
          // 4. Otherwise, alternate between fleeing away from the blast and charging the player.
          const isStuck = this.stuckFrames > 2;
          const shouldAttackPlayer =
            this.config.isMelee ||
            isStuck ||
            (closestThreatDist > 2.6 && (this.id % 2 === 1) && seesPlayer);

          if (shouldAttackPlayer) {
            // Aggressively charge towards player to attack
            tx = playerX;
            ty = playerY;
          } else {
            // Run away from the grenade to clear the blast radius
            tx = this.x + awayX * 4.0;
            ty = this.y + awayY * 4.0;
          }
        } else if (this.clearanceTimer > 0) {
          this.clearanceTimer = Math.max(0, this.clearanceTimer - dt);
        }

        if (!closestThreatGrenade) {
          if (!seesPlayer && this.hasTarget) {
            const distToLast = Math.hypot(this.x - this.lastKnownPlayerX, this.y - this.lastKnownPlayerY);
            if (distToLast < 0.6) {
              // Arrived at last known player position: halt and search the area
              this.isMoving = false;
              this.pathFollower.clear();
              return;
            }
          }

          if (seesPlayer && lof && !inDoorway) {
            if (dist < this.config.minDistance && !this.config.isMelee) {
              tx = this.x;
              ty = this.y;
            } else {
              tx = playerX;
              ty = playerY;
            }
          } else if (pathNextStep) {
            tx = pathNextStep.x;
            ty = pathNextStep.y;
          } else if (seesPlayer && lof) {
            if (dist < this.config.minDistance && !this.config.isMelee) {
              tx = this.x;
              ty = this.y;
            } else {
              tx = playerX;
              ty = playerY;
            }
          } else if (this.hasTarget) {
            tx = this.lastKnownPlayerX;
            ty = this.lastKnownPlayerY;
          } else {
            // Lost target completely and search timer expired -> return to idle
            this.state = "idle";
            this.isMoving = false;
            return;
          }
        }

        const oldX = this.x;
        const oldY = this.y;
        const moved = this.moveTowards(tx, ty, speed, tryMoveEnemy);
        const actualMovedDist = Math.hypot(this.x - oldX, this.y - oldY);
        this.isMoving = moved && actualMovedDist > 0.0001;
      }
    } else if (this.state === "attack") {
      this.isMoving = false;
      if (dist > 0.001) {
        this.dirX = dx / dist;
        this.dirY = dy / dist;
      }
      const maxAttackDist = this.config.attackRange + (this.config.isMelee ? 0.35 : 0.5);

      if (
        dist > maxAttackDist ||
        !los ||
        !lof ||
        closestThreatGrenade ||
        shootingThroughDoor ||
        inDoorway
      ) {
        this.state = "chase";
      } else {
        // Maintain stopping distance
        if (dist < this.config.minDistance) {
          const stepBackSpeed = this.config.speed * 0.7 * delta;
          const backX = -dirToPlayerX * stepBackSpeed;
          const backY = -dirToPlayerY * stepBackSpeed;

          const oldX = this.x;
          const oldY = this.y;

          if (!tryMoveEnemy(this, this.x + backX, this.y + backY)) {
            if (!tryMoveEnemy(this, this.x + backX, this.y)) {
              tryMoveEnemy(this, this.x, this.y + backY);
            }
          }

          const movedDist = Math.hypot(this.x - oldX, this.y - oldY);
          this.isMoving = movedDist > 0.0001;
        }
      }

      // Fire or strike at player on cooldown (full accuracy)
      this.tryFireAtPlayer(dist, 1.0, onShootPlayer);
    }
  }

  private tryFireAtPlayer(
    dist: number,
    accuracyMultiplier: number,
    onShootPlayer: (enemy: RaycastEnemy, damage: number, accuracy: number, distance: number) => void
  ): void {
    const now = Date.now();
    if (now - this.lastShotTime >= this.config.rateOfFire) {
      this.lastShotTime = now;
      if (this.config.isMelee) {
        this.meleeTimer = 0.36; // Show melee frame for ~0.36s (was 22 frames)
      } else {
        this.shootingTimer = 0.20; // Show shooting frame for ~0.20s (was 12 frames)
      }

      // Play blaster or sword attack sound
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

      const effectiveAccuracy = this.config.accuracy * accuracyMultiplier;
      onShootPlayer(this, this.config.damage, effectiveAccuracy, dist);
    }
  }

  private updateDiagona(
    delta: number,
    playerX: number,
    playerY: number,
    hasLineOfSight: (x1: number, y1: number, x2: number, y2: number) => boolean,
    tryMoveEnemy: (enemy: RaycastEnemy, newX: number, newY: number) => boolean,
    onShootPlayer: (enemy: RaycastEnemy, damage: number, accuracy: number, distance: number) => void,
    hasLineOfFire?: (x1: number, y1: number, x2: number, y2: number) => boolean,
    playerDirX?: number,
    playerDirY?: number,
    activeGrenades?: readonly { x: number; y: number; radius?: number }[]
  ): void {
    const dt = delta / 60;
    if (this.shootingTimer > 0) {
      this.shootingTimer = Math.max(0, this.shootingTimer - dt);
    }
    if (this.meleeTimer > 0) {
      this.meleeTimer = Math.max(0, this.meleeTimer - dt);
    }

    // Scan for nearby active thermal detonators threatening Diagona
    let closestThreatGrenade: { x: number; y: number; radius: number; dist: number } | null = null;
    if (activeGrenades && activeGrenades.length > 0) {
      for (const g of activeGrenades) {
        const gRadius = g.radius ?? 3.5;
        const dangerRadius = gRadius + 1.2;
        const gDist = Math.hypot(this.x - g.x, this.y - g.y);
        if (gDist <= dangerRadius) {
          const hasLosToGrenade = hasLineOfSight(this.x, this.y, g.x, g.y);
          if (hasLosToGrenade) {
            closestThreatGrenade = { x: g.x, y: g.y, radius: gRadius, dist: gDist };
            break;
          }
        }
      }
    }

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    const los = hasLineOfSight(this.x, this.y, playerX, playerY);
    const lof = hasLineOfFire ? hasLineOfFire(this.x, this.y, playerX, playerY) : los;
    const inCone = this.isPointInVisionCone(playerX, playerY);
    const seesPlayer = los && inCone && dist <= (this.config.sightRange ?? 6.0);

    if (seesPlayer) {
      this.timeTargetVisible += delta * (1000 / 60);
      this.sightLostTimer = 0;
    } else {
      this.sightLostTimer += delta * (1000 / 60);
      if (this.sightLostTimer > 1000) {
        this.timeTargetVisible = 0;
        this.shotsFiredAtTarget = 0;
      }
    }

    if (dist > 0.001 && this.diagonaPhase !== "hidden" && this.diagonaPhase !== "peeking") {
      this.dirX = dx / dist;
      this.dirY = dy / dist;
    }

    switch (this.diagonaPhase) {
      case "hidden": {
        this.isMoving = false;
        this.state = "idle";
        this.playAnimation("hiding_last", false);

        // Spotting player or nearby grenade triggers coming out
        let playerLookingAtEnemy = true;
        if (playerDirX !== undefined && playerDirY !== undefined && dist > 0.001) {
          const toEnemyX = this.x - playerX;
          const toEnemyY = this.y - playerY;
          const dot = (toEnemyX * playerDirX + toEnemyY * playerDirY) / dist;
          playerLookingAtEnemy = dot > 0.15; // Within forward ~150-degree field of view
        }

        const inCone = this.isPointInVisionCone(playerX, playerY);
        const effectiveSightRange = this.config.sightRange ?? 6.0;
        const canSpotPlayer =
          ((dist <= effectiveSightRange && los && inCone && playerLookingAtEnemy) ||
           (dist <= 2.8 && los && inCone) ||
           Boolean(closestThreatGrenade) ||
           this.painTimer > 0);

        if (canSpotPlayer) {
          if (dist > 0.001) {
            this.dirX = dx / dist;
            this.dirY = dy / dist;
          }
          this.justSpottedPlayer = true;
          this.triggerAlertEvent();
          this.timeTargetVisible = 0;
          this.shotsFiredAtTarget = 0;
          this.sightLostTimer = 0;
          const reactionDelay = this.config.initialReactionDelay ?? 400;
          const now = Date.now();
          this.lastShotTime = Math.max(this.lastShotTime, now - this.config.rateOfFire + reactionDelay);

          this.hasTarget = true;
          this.lastKnownPlayerX = playerX;
          this.lastKnownPlayerY = playerY;
          this.searchTimer = this.lostSightDuration;

          // Stop playing hiding animation and play coming out!
          this.diagonaPhase = "emerging";
          this.state = "chase";
          this.diagonaAnimTimer = 0.6; // ~600ms to rise out of water (was 36 frames)
          this.playAnimation("coming_out", false, 0.11);
          this.playDiagonaSound("diagona_coming_out", dist);
        }
        break;
      }

      case "emerging": {
        this.isMoving = false;
        this.state = "chase";
        this.diagonaAnimTimer = Math.max(0, this.diagonaAnimTimer - dt);
        if (this.diagonaAnimTimer <= 0) {
          if (dist <= 2.2) {
            // Already close to player -> fully come out!
            this.diagonaPhase = "full_emerging";
            this.diagonaAnimTimer = 0.73; // (was 44 frames)
            this.playAnimation("full_come_out", false, 0.09);
            this.playDiagonaSound("diagona_coming_out", dist);
          } else {
            // Approaches player with head out
            this.diagonaPhase = "stalking";
            this.diagonaSubmergedTimer = 4.0; // (was 240 frames)
            this.diagonaBlinkTimer = 2.3 + Math.random() * 2.0;
            this.diagonaBlinkDuration = 0;
            this.playAnimation("idle_1", false);
          }
        }
        break;
      }

      case "peeking": {
        this.isMoving = false;
        this.state = "idle";

        // Handle blinking: idle_1 (open eye) to idle_2 (blink) spaced out
        if (this.diagonaBlinkDuration > 0) {
          this.diagonaBlinkDuration -= dt;
          if (this.diagonaBlinkDuration <= 0) {
            this.playAnimation("idle_1", false);
            this.diagonaBlinkTimer = 2.6 + Math.random() * 3.0; // was 160 + Math.random() * 180 frames
          } else {
            this.playAnimation("idle_2", false);
          }
        } else {
          this.diagonaBlinkTimer -= dt;
          if (this.diagonaBlinkTimer <= 0) {
            this.playAnimation("idle_2", false);
            this.diagonaBlinkDuration = 0.27; // ~270ms blink (was 16 frames)
          } else {
            this.playAnimation("idle_1", false);
          }
        }

        const inCone = this.isPointInVisionCone(playerX, playerY);
        const effectiveSightRange = this.config.sightRange ?? 6.0;
        const canSpotPlayer =
          ((dist <= effectiveSightRange && los && inCone) ||
           (dist <= 2.8 && los && inCone) ||
           Boolean(closestThreatGrenade) ||
           this.painTimer > 0);

        if (canSpotPlayer) {
          if (dist > 0.001) {
            this.dirX = dx / dist;
            this.dirY = dy / dist;
          }
          this.justSpottedPlayer = true;
          this.timeTargetVisible = 0;
          this.shotsFiredAtTarget = 0;
          this.sightLostTimer = 0;
          const reactionDelay = this.config.initialReactionDelay ?? 400;
          const now = Date.now();
          this.lastShotTime = Math.max(this.lastShotTime, now - this.config.rateOfFire + reactionDelay);

          this.hasTarget = true;
          this.lastKnownPlayerX = playerX;
          this.lastKnownPlayerY = playerY;
          this.searchTimer = this.lostSightDuration;

          if (dist <= 2.2) {
            this.diagonaPhase = "full_emerging";
            this.diagonaAnimTimer = 0.73; // (was 44 frames)
            this.playAnimation("full_come_out", false, 0.09);
            this.playDiagonaSound("diagona_coming_out", dist);
          } else {
            this.diagonaPhase = "stalking";
            this.state = "chase";
            this.diagonaSubmergedTimer = 4.0; // (was 240 frames)
          }
        }
        break;
      }

      case "stalking": {
        this.state = "chase";

        // Head/eyestalk is out while moving: keep showing idle_1 with spaced out blinks
        if (this.diagonaBlinkDuration > 0) {
          this.diagonaBlinkDuration -= dt;
          if (this.diagonaBlinkDuration <= 0) {
            this.playAnimation("idle_1", false);
            this.diagonaBlinkTimer = 2.6 + Math.random() * 3.0;
          } else {
            this.playAnimation("idle_2", false);
          }
        } else {
          this.diagonaBlinkTimer -= dt;
          if (this.diagonaBlinkTimer <= 0) {
            this.playAnimation("idle_2", false);
            this.diagonaBlinkDuration = 0.27;
          } else {
            this.playAnimation("idle_1", false);
          }
        }

        this.diagonaSubmergedTimer = Math.max(0, this.diagonaSubmergedTimer - dt);

        const stalkSpeed = (closestThreatGrenade ? 0.038 : 0.026) * delta;
        const oldX = this.x;
        const oldY = this.y;
        const moved = this.moveTowards(playerX, playerY, stalkSpeed, tryMoveEnemy);
        this.isMoving = moved && Math.hypot(this.x - oldX, this.y - oldY) > 0.0001;

        // When it approaches the player, it fully comes out!
        const reachedCloseRange = dist <= 2.2;
        const stuckNearPlayer = !moved && dist <= 3.2;
        const stalkTimeout = this.diagonaSubmergedTimer <= 0;

        if (reachedCloseRange || stuckNearPlayer || stalkTimeout) {
          this.diagonaPhase = "full_emerging";
          this.diagonaAnimTimer = 0.73; // ~730ms dramatic full emergence sequence (was 44 frames)
          this.playAnimation("full_come_out", false, 0.09);
          this.playDiagonaSound("diagona_coming_out", dist);
          this.isMoving = false;
        }
        break;
      }

      case "hiding": {
        this.isMoving = false;
        this.diagonaAnimTimer = Math.max(0, this.diagonaAnimTimer - dt);
        if (this.diagonaAnimTimer <= 0) {
          this.diagonaPhase = "hidden";
          this.state = "idle";
          this.diagonaResetToIdleAfterHide = false;
          this.playAnimation("hiding_last", false);
        }
        break;
      }

      case "full_emerging": {
        this.isMoving = false;
        this.diagonaAnimTimer = Math.max(0, this.diagonaAnimTimer - dt);
        if (this.diagonaAnimTimer <= 0) {
          this.diagonaPhase = "surfaced";
          this.state = "chase";
          this.playAnimation("full_idle", true);
        }
        break;
      }

      case "surfaced": {
        this.state = "chase";

        if (dist <= this.config.attackRange && los && lof) {
          this.diagonaPhase = "biting";
          this.state = "attack";
          this.isMoving = false;
          return;
        }

        if (los) {
          this.lastKnownPlayerX = playerX;
          this.lastKnownPlayerY = playerY;
          this.hasTarget = true;
          this.searchTimer = this.lostSightDuration;
        } else if (this.hasTarget) {
          this.searchTimer = Math.max(0, this.searchTimer - dt);
          if (this.searchTimer <= 0) {
            // Lost player, duck down into hiding then return to idle
            this.diagonaPhase = "hiding";
            this.diagonaResetToIdleAfterHide = true;
            this.diagonaAnimTimer = 0.3; // (was 18 frames)
            this.playAnimation("hiding", false, 0.12);
            this.hasTarget = false;
            this.isMoving = false;
            return;
          }
        } else {
          this.diagonaPhase = "hiding";
          this.diagonaResetToIdleAfterHide = true;
          this.diagonaAnimTimer = 0.3; // (was 18 frames)
          this.playAnimation("hiding", false, 0.12);
          this.isMoving = false;
          return;
        }

        const tx = los ? playerX : this.lastKnownPlayerX;
        const ty = los ? playerY : this.lastKnownPlayerY;
        const speed = this.config.speed * delta;
        const oldX = this.x;
        const oldY = this.y;
        const moved = this.moveTowards(tx, ty, speed, tryMoveEnemy);
        this.isMoving = moved && Math.hypot(this.x - oldX, this.y - oldY) > 0.0001;
        this.playAnimation("full_idle", true);
        break;
      }

      case "biting": {
        this.isMoving = false;
        this.state = "attack";

        const attackExitDist = this.config.attackRange + 0.45;
        if (dist > attackExitDist || !los || !lof) {
          this.diagonaPhase = "surfaced";
          this.state = "chase";
          return;
        }

        const now = Date.now();
        if (now - this.lastShotTime >= this.config.rateOfFire) {
          this.lastShotTime = now;
          this.meleeTimer = 0.3; // ~300ms showing attack frame (was 18 frames)
          this.playAnimation("attack", false);
          this.playDiagonaSound("diagona_attack", dist);
          onShootPlayer(this, this.config.damage, this.config.accuracy, dist);
        }

        if (this.meleeTimer > 0) {
          this.playAnimation("attack", false);
        } else {
          this.playAnimation("full_idle", true);
        }
        break;
      }
    }
  }

  public updateAnimation(playerX: number, playerY: number): void {
    if (!this.animatedSprite) return;

    if (this.config.type === RaycastEnemyType.DIAGONA) {
      this.isFlipped = false;
      this.animatedSprite.anchor.set(0.5, 1.0);

      if (this.state === "dead") {
        this.playAnimation("death_1", false, 0.14);
        const isLastFrame =
          this.animatedSprite.currentFrame >= this.animatedSprite.totalFrames - 1;
        if (isLastFrame) {
          this.animatedSprite.gotoAndStop(this.animatedSprite.totalFrames - 1);
        }
        return;
      }

      switch (this.diagonaPhase) {
        case "hidden":
          this.playAnimation("hiding_last", false);
          break;
        case "emerging":
          this.playAnimation("coming_out", false, 0.11);
          if (
            this.animatedSprite &&
            this.animatedSprite.currentFrame >= this.animatedSprite.totalFrames - 1
          ) {
            this.animatedSprite.gotoAndStop(this.animatedSprite.totalFrames - 1);
          }
          break;
        case "peeking":
        case "stalking":
          if (this.diagonaBlinkDuration > 0) {
            this.playAnimation("idle_2", false);
          } else {
            this.playAnimation("idle_1", false);
          }
          break;
        case "hiding":
          this.playAnimation("hiding", false, 0.08);
          if (
            this.animatedSprite &&
            this.animatedSprite.currentFrame >= this.animatedSprite.totalFrames - 1
          ) {
            this.animatedSprite.gotoAndStop(this.animatedSprite.totalFrames - 1);
          }
          break;
        case "full_emerging":
          this.playAnimation("full_come_out", false, 0.09);
          if (
            this.animatedSprite &&
            this.animatedSprite.currentFrame >= this.animatedSprite.totalFrames - 1
          ) {
            this.animatedSprite.gotoAndStop(this.animatedSprite.totalFrames - 1);
          }
          break;
        case "surfaced":
          this.playAnimation("full_idle", true);
          break;
        case "biting":
          if (this.meleeTimer > 0) {
            this.playAnimation("attack", false);
          } else {
            this.playAnimation("full_idle", true);
          }
          break;
      }
      return;
    }

    if (this.config.animationConfig?.omniDirectional) {
      this.isFlipped = false;
      if (this.state === "dead") {
        const deathSpeed = this.config.animationConfig.deathAnimation?.speed ?? 0.14;
        this.playAnimation("death_1", false, deathSpeed);
        const isLastFrame = this.animatedSprite.currentFrame >= this.animatedSprite.totalFrames - 1;
        if (isLastFrame) {
          this.animatedSprite.gotoAndStop(this.animatedSprite.totalFrames - 1);
        }
        const targetAnchorY = (isLastFrame && this.config.deathAnchorY !== undefined)
          ? this.config.deathAnchorY
          : 1.0;
        this.animatedSprite.anchor.set(0.5, targetAnchorY);
        return;
      }

      this.animatedSprite.anchor.set(0.5, 1.0);

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
      const isLastFrame = this.animatedSprite.currentFrame >= this.animatedSprite.totalFrames - 1;
      if (isLastFrame) {
        this.animatedSprite.gotoAndStop(this.animatedSprite.totalFrames - 1);
      }
      const targetAnchorY = (isLastFrame && this.config.deathAnchorY !== undefined)
        ? this.config.deathAnchorY
        : 1.0;
      this.animatedSprite.anchor.set(0.5, targetAnchorY);
      return;
    }

    this.animatedSprite.anchor.set(0.5, 1.0);

    if (this.isShielding && this.animations.shield) {
      this.isFlipped = false;
      this.playAnimation("shield", false);
      return;
    }

    if (this.meleeTimer > 0 && this.animations.melee_attack) {
      const meleeSpeed = this.config.animationConfig?.meleeAnimation?.speed ?? 0.18;
      this.isFlipped = false;
      this.playAnimation("melee_attack", false, meleeSpeed);
      return;
    }

    if (this.shootingTimer > 0) {
      const shootSpeed = this.config.animationConfig?.shootingAnimation?.speed ?? 0.16;
      this.isFlipped = false;
      this.playAnimation("shooting", false, shootSpeed);
      return;
    }

    // Relative 8-directional sector and flip calculation from base RaycastDirectionalObject
    const { dirName } = this.getDirectionSector(playerX, playerY);

    if (this.painTimer > 0) {
      if (this.animations[`damage_${dirName}`]) {
        this.playAnimation(`damage_${dirName}`, false);
        return;
      } else if (this.animations.damage && this.animations.damage[0] !== Texture.WHITE) {
        this.playAnimation("damage", false);
        return;
      }
    }

    if (this.state === "chase" && this.isMoving) {
      this.playAnimation(`walking_${dirName}`, true, 0.16);
    } else {
      this.playAnimation(`standing_${dirName}`, false);
    }
  }

  public override playAnimation(key: string, loop: boolean = true, speed: number = 0.16): void {
    if (this.currentAnimKey === key) return;

    const textures = this.animations[key];
    if (!textures || textures.length === 0) return;

    const prevFrame = this.animatedSprite.currentFrame;
    const wasWalking = this.currentAnimKey.startsWith("walking_");
    const isWalking = key.startsWith("walking_");

    this.currentAnimKey = key;
    this.animatedSprite.textures = textures;
    this.animatedSprite.loop = loop;
    this.animatedSprite.animationSpeed = speed;

    if (textures.length > 1) {
      if (wasWalking && isWalking) {
        const nextFrame = prevFrame % textures.length;
        this.animatedSprite.gotoAndPlay(nextFrame);
      } else {
        this.animatedSprite.gotoAndPlay(0);
      }
    } else {
      this.animatedSprite.gotoAndStop(0);
    }
  }

  public override render3D(
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
    this.currentVOffset = this.isDead
      ? (this.config.deathVOffset !== undefined ? -this.config.deathVOffset : 0)
      : (this.config.vOffset ?? 0);
    this.floatingBob = Boolean(this.config.floatingBob && !this.isDead);

    const visible = super.render3D(
      playerX,
      playerY,
      dirX,
      dirY,
      planeX,
      planeY,
      zBuffer,
      maxRenderDistance,
      doorDistBuffer,
      doorBottomBuffer
    );
    if (visible && this.painTimer > 0 && this.animatedSprite) {
      this.animatedSprite.tint = 0xff4444;
    }
    return visible;
  }

  public override dispose(): void {
    this.stopActiveSounds();
    if (this.animatedSprite) {
      this.animatedSprite.mask = null;
      this.animatedSprite.stop();
    }
    super.dispose();
  }
}