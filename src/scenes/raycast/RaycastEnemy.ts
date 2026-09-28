import { AnimatedSprite, Graphics, SCALE_MODES, Spritesheet, Texture } from "pixi.js";
import { sound, IMediaInstance } from "@pixi/sound";
import { IRaycastEnemyConfig } from "../../configs/interfaces/IRaycastEnemyConfig";
import { RaycastEnemyType } from "../../enums/RaycastEnemyType";

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
   * Alerts the enemy to suspicious noise, gunfire, or projectile near-misses/impacts.
   * Wakes the enemy from idle into chase/search state and turns towards the source of the disturbance.
   */
  public alert(sourceX: number, sourceY: number, forceFaceSource: boolean = true): void {
    if (this.isDead) return;

    if (this.config.type === RaycastEnemyType.DIAGONA) {
      if (this.diagonaPhase === "hidden" || this.diagonaPhase === "peeking") {
        this.diagonaPhase = "emerging";
        this.state = "chase";
        this.diagonaAnimTimer = 36;
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
    this.searchTimer = 600; // ~10 seconds of active searching / investigation

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
  public repositionCooldown: number = 0;
  public wanderDirX: number = 0;
  public wanderDirY: number = 0;
  public stuckFrames: number = 0;
  public stepOutFrames: number = 0;
  public currentVOffset: number = 0;
  public clearanceDir: number = 0;
  public clearanceTimer: number = 0;
  private lastAnimDir: string = "";

  // Screen projection coordinates (updated each frame by RaycastEnemyManager.render)
  public screenX: number = -9999;
  public screenY: number = -9999;

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
    this.id = id;
    this.config = config;
    this.x = x;
    this.y = y;
    this.health = config.maxHealth;
    this.maxHealth = config.maxHealth;
    this.dirX = 0;
    this.dirY = 1;
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
    this.painTimer = 8; // Flash red for ~8 frames

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
          this.diagonaAnimTimer = 44;
          this.playAnimation("full_come_out", false, 0.09);
          this.playDiagonaSound("diagona_coming_out", distToSource);
        } else {
          this.diagonaPhase = "stalking";
          this.diagonaSubmergedTimer = 240;
        }
      }
      if (sourceX !== undefined && sourceY !== undefined) {
        this.lastKnownPlayerX = sourceX;
        this.lastKnownPlayerY = sourceY;
        this.hasTarget = true;
        this.searchTimer = 600;
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
      this.dirY = 0;
      return true;
    }
    if (tryMoveEnemy(this, this.x, this.y + baseDirY * speed)) {
      this.stuckFrames = 0;
      this.dirX = 0;
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
    playerDirY?: number
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
        playerDirY
      );
      return;
    }

    if (this.shootingTimer > 0) {
      this.shootingTimer = Math.max(0, this.shootingTimer - delta);
    }
    if (this.meleeTimer > 0) {
      this.meleeTimer = Math.max(0, this.meleeTimer - delta);
    }

    // Update periodic shield logic
    const hasShield = Boolean(this.animations.shield || this.config.shieldDuration);
    if (hasShield) {
      if (this.isShielding) {
        this.shieldTimer -= delta;
        this.isMoving = false;
        if (this.shieldTimer <= 0) {
          this.isShielding = false;
          const baseInterval = this.config.shieldInterval ?? 240;
          this.shieldCooldownTimer = baseInterval * (0.8 + Math.random() * 0.4);
        }
      } else if (this.state === "chase" || this.state === "attack") {
        this.shieldCooldownTimer -= delta;
        if (this.shieldCooldownTimer <= 0 && this.meleeTimer <= 0) {
          this.isShielding = true;
          this.shieldTimer = this.config.shieldDuration ?? 120;
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
    const seesPlayer = los && inCone && dist <= (this.config.sightRange ?? 12);

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

    if (seesPlayer && !this.wasSeeingPlayer) {
      this.stepOutFrames = defaultStepOut; // Step forward/out into open room/hallway when first acquiring target
      this.justSpottedPlayer = true;
      this.timeTargetVisible = 0;
      this.shotsFiredAtTarget = 0;
      this.sightLostTimer = 0;

      // Delay initial shot after first spotting player so enemy does not instantly fire on frame 0
      const reactionDelay = this.config.initialReactionDelay ?? 400;
      const now = Date.now();
      this.lastShotTime = Math.max(this.lastShotTime, now - this.config.rateOfFire + reactionDelay);
    }
    this.wasSeeingPlayer = seesPlayer;

    if (this.stepOutFrames > 0) {
      this.stepOutFrames = Math.max(0, this.stepOutFrames - delta);
    }

    // Track sight / target knowledge
    if (seesPlayer) {
      this.timeTargetVisible += delta * (1000 / 60);
      this.sightLostTimer = 0;
      this.lastKnownPlayerX = playerX;
      this.lastKnownPlayerY = playerY;
      this.hasTarget = true;
      this.searchTimer = 600; // Search/reposition for ~10 seconds at 60fps
    } else {
      this.sightLostTimer += delta * (1000 / 60);
      if (this.sightLostTimer > 1000) {
        // Player broke line of sight for >1.0s -> reset target tracking and accuracy ramp
        this.timeTargetVisible = 0;
        this.shotsFiredAtTarget = 0;
      }
      if (this.searchTimer > 0) {
        this.searchTimer = Math.max(0, this.searchTimer - delta);
        if (this.searchTimer <= 0) {
          this.hasTarget = false;
        }
      }
    }

    if (dist > 0.001) {
      // Face towards player when active and not actively moving
      if (this.state !== "idle" && !this.isMoving) {
        if (seesPlayer) {
          this.dirX = dx / dist;
          this.dirY = dy / dist;
        } else if (this.hasTarget) {
          const tdx = this.lastKnownPlayerX - this.x;
          const tdy = this.lastKnownPlayerY - this.y;
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
      this.stepSoundTimer += delta;
      if (this.stepSoundTimer >= 22) {
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

    // State Machine
    if (this.state === "idle") {
      this.isMoving = false;
      // Alerted by direct sight within forward vision cone
      if (seesPlayer) {
        this.state = dist <= this.config.attackRange && lof ? "attack" : "chase";
      }
    } else if (this.state === "chase") {
      if (dist <= this.config.attackRange && fullVisibility && inCone && this.stepOutFrames <= 0) {
        this.state = "attack";
        this.isMoving = false;
      } else {
        // Move / reposition towards player or out of cover
        const speed = this.config.speed * delta;
        let tx = playerX;
        let ty = playerY;

        if (this.clearanceTimer > 0) {
          this.clearanceTimer = Math.max(0, this.clearanceTimer - delta);
        }

        if (seesPlayer) {
          // If we see player but are partially covered behind a corner, steer smoothly towards the clear shoulder
          if (!losLeft && losRight) {
            this.clearanceDir = 1;
            this.clearanceTimer = 20;
          } else if (losLeft && !losRight) {
            this.clearanceDir = -1;
            this.clearanceTimer = 20;
          } else if (losLeft && losRight && this.clearanceTimer <= 0) {
            this.clearanceDir = 0;
          }

          if (this.clearanceTimer > 0 && this.clearanceDir !== 0) {
            // Diagonal steering: blend forward and lateral clearance at balanced 45-degree angle
            const steerLateral = 0.95 * this.clearanceDir;
            tx = this.x + (perpX * steerLateral + dirToPlayerX) * 1.5;
            ty = this.y + (perpY * steerLateral + dirToPlayerY) * 1.5;
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

        // While stepping out from cover into full view, can fire or strike if within attack range
        if (seesPlayer && lof && dist <= this.config.attackRange) {
          const now = Date.now();
          if (now - this.lastShotTime >= this.config.rateOfFire) {
            this.lastShotTime = now;
            if (this.config.isMelee) {
              this.meleeTimer = 22;
            } else {
              this.shootingTimer = 12;
            }

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
      const attackExitDist = this.config.attackRange + (this.config.isMelee ? 0.35 : 1.2);
      if (dist > attackExitDist || !seesPlayer || !lof) {
        this.state = "chase";
      } else if (!fullVisibility && !this.config.isMelee) {
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

      // Fire or strike at player on cooldown
      const now = Date.now();
      if (now - this.lastShotTime >= this.config.rateOfFire) {
        this.lastShotTime = now;
        if (this.config.isMelee) {
          this.meleeTimer = 22;
        } else {
          this.shootingTimer = 12; // Show shooting frame for ~12 ticks
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

        onShootPlayer(this, this.config.damage, this.config.accuracy, dist);
      }
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
    playerDirY?: number
  ): void {
    if (this.shootingTimer > 0) {
      this.shootingTimer = Math.max(0, this.shootingTimer - delta);
    }
    if (this.meleeTimer > 0) {
      this.meleeTimer = Math.max(0, this.meleeTimer - delta);
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

        // Spotting player triggers coming out
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
          this.searchTimer = 600;

          // Stop playing hiding animation and play coming out!
          this.diagonaPhase = "emerging";
          this.state = "chase";
          this.diagonaAnimTimer = 36; // ~600ms to rise out of water
          this.playAnimation("coming_out", false, 0.11);
          this.playDiagonaSound("diagona_coming_out", dist);
        }
        break;
      }

      case "emerging": {
        this.isMoving = false;
        this.state = "chase";
        this.diagonaAnimTimer = Math.max(0, this.diagonaAnimTimer - delta);
        if (this.diagonaAnimTimer <= 0) {
          if (dist <= 2.2) {
            // Already close to player -> fully come out!
            this.diagonaPhase = "full_emerging";
            this.diagonaAnimTimer = 44;
            this.playAnimation("full_come_out", false, 0.09);
            this.playDiagonaSound("diagona_coming_out", dist);
          } else {
            // Approaches player with head out
            this.diagonaPhase = "stalking";
            this.diagonaSubmergedTimer = 240;
            this.diagonaBlinkTimer = 140 + Math.random() * 120;
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
          this.diagonaBlinkDuration -= delta;
          if (this.diagonaBlinkDuration <= 0) {
            this.playAnimation("idle_1", false);
            this.diagonaBlinkTimer = 160 + Math.random() * 180;
          } else {
            this.playAnimation("idle_2", false);
          }
        } else {
          this.diagonaBlinkTimer -= delta;
          if (this.diagonaBlinkTimer <= 0) {
            this.playAnimation("idle_2", false);
            this.diagonaBlinkDuration = 16; // ~260ms blink
          } else {
            this.playAnimation("idle_1", false);
          }
        }

        const inCone = this.isPointInVisionCone(playerX, playerY);
        const effectiveSightRange = this.config.sightRange ?? 6.0;
        const canSpotPlayer =
          ((dist <= effectiveSightRange && los && inCone) ||
           (dist <= 2.8 && los && inCone) ||
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
          this.searchTimer = 600;

          if (dist <= 2.2) {
            this.diagonaPhase = "full_emerging";
            this.diagonaAnimTimer = 44;
            this.playAnimation("full_come_out", false, 0.09);
            this.playDiagonaSound("diagona_coming_out", dist);
          } else {
            this.diagonaPhase = "stalking";
            this.state = "chase";
            this.diagonaSubmergedTimer = 240;
          }
        }
        break;
      }

      case "stalking": {
        this.state = "chase";

        // Head/eyestalk is out while moving: keep showing idle_1 with spaced out blinks
        if (this.diagonaBlinkDuration > 0) {
          this.diagonaBlinkDuration -= delta;
          if (this.diagonaBlinkDuration <= 0) {
            this.playAnimation("idle_1", false);
            this.diagonaBlinkTimer = 160 + Math.random() * 180;
          } else {
            this.playAnimation("idle_2", false);
          }
        } else {
          this.diagonaBlinkTimer -= delta;
          if (this.diagonaBlinkTimer <= 0) {
            this.playAnimation("idle_2", false);
            this.diagonaBlinkDuration = 16;
          } else {
            this.playAnimation("idle_1", false);
          }
        }

        this.diagonaSubmergedTimer = Math.max(0, this.diagonaSubmergedTimer - delta);

        const stalkSpeed = 0.026 * delta;
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
          this.diagonaAnimTimer = 44; // ~730ms dramatic full emergence sequence
          this.playAnimation("full_come_out", false, 0.09);
          this.playDiagonaSound("diagona_coming_out", dist);
          this.isMoving = false;
        }
        break;
      }

      case "hiding": {
        this.isMoving = false;
        this.diagonaAnimTimer = Math.max(0, this.diagonaAnimTimer - delta);
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
        this.diagonaAnimTimer = Math.max(0, this.diagonaAnimTimer - delta);
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
          this.searchTimer = 600;
        } else if (this.hasTarget) {
          this.searchTimer = Math.max(0, this.searchTimer - delta);
          if (this.searchTimer <= 0) {
            // Lost player, duck down into hiding then return to idle
            this.diagonaPhase = "hiding";
            this.diagonaResetToIdleAfterHide = true;
            this.diagonaAnimTimer = 18;
            this.playAnimation("hiding", false, 0.12);
            this.hasTarget = false;
            this.isMoving = false;
            return;
          }
        } else {
          this.diagonaPhase = "hiding";
          this.diagonaResetToIdleAfterHide = true;
          this.diagonaAnimTimer = 18;
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
          this.meleeTimer = 18; // ~300ms showing attack frame
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

    // Relative angle between enemy facing direction and vector to player
    const toPlayerAngle = Math.atan2(playerY - this.y, playerX - this.x);
    const facingAngle = Math.atan2(this.dirY, this.dirX);

    let diff = toPlayerAngle - facingAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const deg = (diff * 180) / Math.PI;

    // Direction hysteresis to prevent rapid flickering at sector boundaries
    const hysteresis = 5.0;
    const isDiag = this.lastAnimDir.includes("diagonal");
    const isTowards = this.lastAnimDir === "towards";
    const isLeft = this.lastAnimDir === "left";
    const isAway = this.lastAnimDir === "away";

    const towardsBound = isTowards ? 22.5 + hysteresis : isDiag ? 22.5 - hysteresis : 22.5;
    const leftBound = isLeft ? 67.5 - hysteresis : isDiag ? 67.5 + hysteresis : 67.5;
    const awayBound = isAway ? 157.5 - hysteresis : isDiag ? 157.5 + hysteresis : 157.5;

    const absDeg = Math.abs(deg);

    let dirName: string;
    if (absDeg < towardsBound) {
      dirName = "towards";
    } else if (absDeg < leftBound) {
      dirName = "towards_left_diagonal";
    } else if (absDeg < awayBound) {
      dirName = "left";
    } else if (absDeg < 165) {
      dirName = "away_left_diagonal";
    } else {
      dirName = "away";
    }

    this.lastAnimDir = dirName;
    this.isFlipped = dirName !== "towards" && dirName !== "away" && deg < 0;

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

  private playAnimation(key: string, loop: boolean = true, speed: number = 0.16): void {
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