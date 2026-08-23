import { AnimatedSprite, Spritesheet, Texture } from "pixi.js";
import { sound } from "@pixi/sound";
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

  // Animated sprite
  public animatedSprite!: AnimatedSprite;
  public isFlipped: boolean = false;
  private animations: Record<string, Texture[]> = {};
  private currentAnimKey: string = "";

  // Timing
  public shootingTimer: number = 0;
  public painTimer: number = 0;
  public lastShotTime: number = 0;
  public hasDroppedLoot: boolean = false;

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

    if (spritesheet) {
      this.initAnimatedSprite(spritesheet);
    }
  }

  public initAnimatedSprite(spritesheet: Spritesheet): void {
    const texs = spritesheet.textures;

    // Helper to get frame array
    const getFrames = (prefix: string, count: number): Texture[] => {
      const frames: Texture[] = [];
      for (let i = 1; i <= count; i++) {
        const t = texs[`${prefix}_${i}.png`];
        if (t) frames.push(t);
      }
      return frames.length > 0 ? frames : [texs[`${prefix}.png`] || Texture.WHITE];
    };

    // Helper for single frame
    const getSingle = (name: string): Texture[] => {
      const t = texs[`${name}.png`] || texs[name];
      return t ? [t] : [Texture.WHITE];
    };

    this.animations = {
      // 1. Walking animations (6 frames each)
      walking_towards: getFrames("storm_trooper/walking_towards", 6),
      walking_towards_left_diagonal: getFrames("storm_trooper/walking_left_diagonal", 6),
      walking_left: getFrames("storm_trooper/walking_left", 6),
      walking_away_left_diagonal: getFrames("storm_trooper/walking_away_left_diagonal", 6),
      walking_away: getFrames("storm_trooper/walking_away", 6),

      // 2. Standing / Idle poses (1 frame each)
      standing_towards: getSingle("storm_trooper/standing_towards"),
      standing_towards_left_diagonal: getSingle("storm_trooper/standing_towards_left_diagonal"),
      standing_left: getSingle("storm_trooper/standing_left"),
      standing_away_left_diagonal: getSingle("storm_trooper/standing_away_left_diagonal"),
      standing_away: getSingle("storm_trooper/standing_away"),

      // 3. Shooting pose
      shooting: getSingle("storm_trooper/shooting"),

      // 4. Death animations (6 frames each)
      death_1: getFrames("storm_trooper/death_1", 6),
      death_2: getFrames("storm_trooper/death_2", 6),
    };

    const initialTextures = this.animations.standing_towards || [Texture.WHITE];
    this.animatedSprite = new AnimatedSprite(initialTextures);
    this.animatedSprite.anchor.set(0.5, 1.0); // Pivot at bottom center on the floor
    this.animatedSprite.animationSpeed = 0.16;
    this.animatedSprite.visible = false;
    this.currentAnimKey = "standing_towards";
  }

  public get isDead(): boolean {
    return this.state === "dead";
  }

  public takeDamage(
    amount: number,
    onDeath?: (enemy: RaycastEnemy) => void
  ): boolean {
    if (this.isDead) return false;

    this.health = Math.max(0, this.health - amount);
    this.painTimer = 8; // Flash red for ~8 frames

    // Instantly alert enemy to player
    if (this.state === "idle") {
      this.state = "chase";
    }

    if (this.health <= 0) {
      this.state = "dead";

      // Play death animation
      this.playAnimation("death_1", false, 0.14);

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

      if (onDeath) {
        onDeath(this);
      }
      return true;
    }

    // Play pain sound
    if (this.config.painSounds && this.config.painSounds.length > 0) {
      const snd = this.config.painSounds[
        Math.floor(Math.random() * this.config.painSounds.length)
      ];
      try {
        sound.play(snd.src, { volume: snd.volume, loop: snd.loop });
      } catch (e) {
        console.warn("Failed to play enemy pain sound:", e);
      }
    }

    return false;
  }

  public update(
    delta: number,
    playerX: number,
    playerY: number,
    hasLineOfSight: (x1: number, y1: number, x2: number, y2: number) => boolean,
    tryMoveEnemy: (enemy: RaycastEnemy, newX: number, newY: number) => boolean,
    onShootPlayer: (damage: number, accuracy: number, distance: number) => void
  ): void {
    if (this.state === "dead") {
      return;
    }

    if (this.painTimer > 0) {
      this.painTimer = Math.max(0, this.painTimer - delta);
    }

    if (this.shootingTimer > 0) {
      this.shootingTimer = Math.max(0, this.shootingTimer - delta);
    }

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0.001) {
      // Face towards player when active
      if (this.state !== "idle") {
        this.dirX = dx / dist;
        this.dirY = dy / dist;
      }
    }

    const los = hasLineOfSight(this.x, this.y, playerX, playerY);

    // State Machine
    if (this.state === "idle") {
      if (dist <= this.config.sightRange && los) {
        this.state = dist <= this.config.attackRange ? "attack" : "chase";
      }
    } else if (this.state === "chase") {
      if (dist <= this.config.attackRange && los) {
        this.state = "attack";
      } else {
        // Move towards player
        const speed = this.config.speed * delta;
        const moveX = (dx / dist) * speed;
        const moveY = (dy / dist) * speed;

        const moved = tryMoveEnemy(this, this.x + moveX, this.y + moveY);
        if (!moved) {
          // Try sliding along walls
          if (!tryMoveEnemy(this, this.x + moveX, this.y)) {
            tryMoveEnemy(this, this.x, this.y + moveY);
          }
        }
      }
    } else if (this.state === "attack") {
      if (dist > this.config.attackRange + 1.2 || !los) {
        this.state = "chase";
      } else {
        // Maintain stopping distance
        if (dist < this.config.minDistance) {
          const stepBackSpeed = this.config.speed * 0.7 * delta;
          const backX = -(dx / dist) * stepBackSpeed;
          const backY = -(dy / dist) * stepBackSpeed;
          tryMoveEnemy(this, this.x + backX, this.y + backY);
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
              sound.play(snd.src, { volume: snd.volume, loop: snd.loop });
            } catch (e) {
              console.warn("Failed to play enemy attack sound:", e);
            }
          }

          onShootPlayer(this.config.damage, this.config.accuracy, dist);
        }
      }
    }
  }

  public updateAnimation(playerX: number, playerY: number): void {
    if (!this.animatedSprite) return;

    if (this.state === "dead") {
      this.isFlipped = false;
      this.playAnimation("death_1", false, 0.14);
      // Stay on last frame if complete
      if (this.animatedSprite.currentFrame >= this.animatedSprite.totalFrames - 1) {
        this.animatedSprite.gotoAndStop(this.animatedSprite.totalFrames - 1);
      }
      return;
    }

    if (this.shootingTimer > 0) {
      this.isFlipped = false;
      this.playAnimation("shooting", false);
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

    if (this.state === "chase") {
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
    if (this.animatedSprite) {
      this.animatedSprite.stop();
      this.animatedSprite.destroy();
    }
  }
}
