import { AnimatedSprite, Container, Sprite, Texture, Ticker } from "pixi.js";
import { GameEvent } from "../enums/GameEvent";
import { IEnemyConfig } from "../configs/interfaces/IEnemyConfig";
import { IBullet } from "./interfaces/IBullet";
import { gameConfig } from "../configs/GameConfig";
import { IDisposable } from "./interfaces/IDisposable";
import { EnemyType } from "../enums/EnemyType";
import { ISpawnRange } from "../configs/interfaces/ISpawnRange";
import { sound } from "@pixi/sound";
import { getRandomInt } from "../Utils";

export class Enemy extends Container implements IDisposable {
    private _sprite: Sprite;
    private _deathAnimation?: AnimatedSprite;
    private _target: Container;
    private _stage: Container;
    private _bullets: IBullet[];
    private _speed: number;
    private _config: IEnemyConfig;
    private _isShooting: boolean;
    private _damage: number;
    private _meleeDamage: number;
    private _timeSinceLastShot: number;
    private _isDead: boolean;
    private _isMoving: boolean;
    private _type: EnemyType;
    private _health: number;

    constructor(target: Container, stage: Container, config: IEnemyConfig) {
        super();
        this._type = config.type;
        this._health = config.health;
        this._isShooting = true;
        this._isMoving = true;
        this._isDead = false;
        this._timeSinceLastShot = 0;
        this._damage = config.damage;
        this._meleeDamage = config.meleeDamage;

        if (config.death) {
            const textures = [];
            const deathAnim = config.death.animation;
            for (const texture of deathAnim) {
                textures.push(Texture.from(texture));
            }

            this._deathAnimation = new AnimatedSprite(textures);
            this._deathAnimation.anchor.set(0.5);
            this._deathAnimation.loop = false;
            this._deathAnimation.animationSpeed = 0.2;
            this._deathAnimation.visible = false;
            this.addChild(this._deathAnimation);
        }

        this._config = config;
        this._bullets = [];
        this._target = target;
        this._stage = stage;
        this._speed = config.speed;
        this._sprite = Sprite.from(config.characterTextures.left);
        this._sprite.anchor.set(0.5, 0.5);
        this.addChild(this._sprite);

        Ticker.shared.add(this.updateBulletPosition, this);
        Ticker.shared.add(this.move, this);

        if (config.faceTarget) {
            Ticker.shared.add(this.updateSpriteTexture, this);
        }

        if (config.projectile) {
            Ticker.shared.add(this.shoot, this);
        }
    }

    public get spawnRange(): ISpawnRange {
        return this._config.spawnRange;
    }

    public get collider(): Sprite {
        return this._sprite;
    }

    public get damage(): number {
        return this._damage;
    }

    public set isMoving(value: boolean) {
        this._isMoving = value;
    }

    public get type(): EnemyType {
        return this._type;
    }

    public get meleeDamage(): number {
        return this._meleeDamage;
    }

    public get isDead(): boolean {
        return this._isDead;
    }

    public takeDamage(damage: number): void {
        this._health -= damage;
        if (this._health <= 0) {
            const deathSound = this._config.soundConfig.deathSound;
            sound.play(deathSound.src, {
                volume: deathSound.volume,
                loop: deathSound.loop,
            });
            
            this._isDead = true;
            this._isShooting = false;
            if (this._deathAnimation) {
                this._sprite.visible = false;
                this._deathAnimation.visible = true;
                this._deathAnimation.play();
                this._deathAnimation.onComplete = () => setTimeout(() => this.visible = false, 800);
            } else {
                this.visible = false;
            }
        }
    }

    public dispose(force?: boolean): void {
        if (force) {
            Ticker.shared.remove(this.updateBulletPosition, this);
        }

        if (this._config.faceTarget) {
            Ticker.shared.remove(this.updateSpriteTexture, this);
        }

        if (this._config.projectile) {
            Ticker.shared.remove(this.shoot, this);
        }

        Ticker.shared.remove(this.move, this);
        this.destroy({ children: true });
    }

    private move(dt: number): void {
        if (this._isMoving) {
            this.x -= this._speed * dt;
        }
    }

    private updateSpriteTexture(): void {
        const distanceX = this._target.x - this.x;
        const distanceY = this._target.y + this._target.height / 2 - this.y;
        let angle = Math.atan2(distanceY, distanceX) * 180 / Math.PI;
        angle = (angle + 360) % 360;

        if (angle >= 270 || (angle > 0 && angle <= 90)) {
            if (this._sprite.scale.x > 0) {
                this._sprite.scale.x *= -1;
            }
        } else if (angle < 270 && angle > 90) {
            if (this._sprite.scale.x < 0) {
                this._sprite.scale.x *= -1;
            }
        }

        if (angle >= 60 && angle <= 130) {
            this._sprite.texture = Texture.from(this._config.characterTextures.down);
            this._sprite.texture.update();
        } else if (angle >= 220 && angle <= 320) {
            this._sprite.texture = Texture.from(this._config.characterTextures.up);
            this._sprite.texture.update();
        } else if (angle >= 320 || (angle > 0 && angle < 60) || (angle < 220 && angle > 130)) {
            this._sprite.texture = Texture.from(this._config.characterTextures.left);
            this._sprite.texture.update();
        }
    }

    private shoot(dt: number): void {
        if (this._config.projectile) {
            this._timeSinceLastShot += dt;

            if (this._timeSinceLastShot < this._config.rateOfFire) {
                return;
            }

            if (this.x > gameConfig.width || !this._isShooting) {
                return;
            }

            if (this._config.soundConfig.shootSounds) {
                const index = getRandomInt(0, this._config.soundConfig.shootSounds.length);
                const soundToPlay = this._config.soundConfig.shootSounds[index];
                sound.play(soundToPlay.src, {
                    volume: soundToPlay.volume,
                    loop: soundToPlay.loop,
                });
            }

            // Calculate the angle between the enemy and the target
            const distanceX = this._target.x - this.x;
            const distanceY = this._target.y + this._target.height / 2 - this.y;
            const angle = Math.atan2(distanceY, distanceX);

            const shot = Sprite.from(this._config.projectile.texture);
            shot.anchor.copyFrom(this._config.projectile.anchor);
            shot.rotation = angle;
            shot.scale.copyFrom(this._config.projectile.scale);
            shot.position.set(this.x + this._config.projectile.startPosOffset.x, this.y + this._config.projectile.startPosOffset.y);
            this._stage.addChild(shot);

            // Calculate velocity components based on the angle
            const bulletSpeed = this._config.projectile.speed;
            const velocityX = bulletSpeed * Math.cos(angle);
            const velocityY = bulletSpeed * Math.sin(angle);

            const bullet: IBullet = {
                sprite: shot,
                velocityX: velocityX,
                velocityY: velocityY
            }

            this._bullets.push(bullet);
            this._timeSinceLastShot = 0;
        }
    }

    private updateBulletPosition(dt: number): void {
        for (const bullet of this._bullets) {
            bullet.sprite.x += bullet.velocityX * dt;
            bullet.sprite.y += bullet.velocityY * dt;

            // Remove the bullet if it goes off the screen
            if (bullet.sprite.x < 0 || bullet.sprite.y < 0 || bullet.sprite.x > gameConfig.width || bullet.sprite.y > gameConfig.height) {
                this._stage.removeChild(bullet.sprite);
                this._bullets.splice(this._bullets.indexOf(bullet), 1);
            }

            if (bullet.sprite.getBounds().intersects(this._target.getBounds())) {
                this._stage.removeChild(bullet.sprite);
                this._bullets.splice(this._bullets.indexOf(bullet), 1);
                this.emit(GameEvent.PLAYER_HIT);
            }
        }

        if (this.destroyed && this._bullets.length === 0) {
            Ticker.shared.remove(this.updateBulletPosition, this);
        }
    };
}