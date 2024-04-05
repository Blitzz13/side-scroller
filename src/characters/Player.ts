import { AnimatedSprite, Container, Sprite, Ticker } from "pixi.js";
import { IBullet } from "./interfaces/IBullet";
import { IEntity } from "./interfaces/IEntity";
import { gameConfig } from "../configs/GameConfig";
import { GameEvent } from "../enums/GameEvent";
import { IPlayerConfig } from "../configs/interfaces/IPlayerConfig";
import { getTextureArrayFromStrings } from "../Utils";

export class Player extends Container implements IEntity {
    private _dirextionX: -1 | 0 | 1 = 0;
    private _dirextionY: -1 | 0 | 1 = 0;
    private _speed: number;
    private _isShooting: boolean;
    private _playerAnimation: AnimatedSprite | Sprite;
    private _deathAnimation?: AnimatedSprite;
    private _stage: Container;
    private _bullets: IBullet[];
    private _shootingTimer: number;
    private _health: number;
    private _ammo: number;
    private _damage: number;
    private _config: IPlayerConfig;
    private _ammoTimeout!: NodeJS.Timeout;
    private _healthTimeout!: NodeJS.Timeout;
    private _damageTimeout!: NodeJS.Timeout;
    private _keydownHandlerBound = this.handleKeydown.bind(this);
    private _keyupHandlerBound = this.handleKeyup.bind(this);

    constructor(sceneStage: Container, config: IPlayerConfig) {
        super();
        this._config = config;
        this._stage = sceneStage;
        this._ammo = config.startingProjectilesNumber;
        this._damage = config.damage;
        this._health = config.health;
        this._speed = config.movementSpeed;
        this._isShooting = false;
        this._bullets = [];
        this._shootingTimer = 0;

        if (config.deathAnimation) {
            this._deathAnimation = new AnimatedSprite(getTextureArrayFromStrings(config.deathAnimation.frames));

            this._deathAnimation.scale.copyFrom(config.deathAnimation.scale);
            this._deathAnimation.loop = config.deathAnimation.loop;
            this._deathAnimation.animationSpeed = config.deathAnimation.speed;
            this._deathAnimation.visible = false;
            this.addChild(this._deathAnimation);
        }

        if (typeof config.moving !== "string") {
            this._playerAnimation = new AnimatedSprite(getTextureArrayFromStrings(config.moving.frames));
            this._playerAnimation.scale.copyFrom(config.playerScale);
            if (this._playerAnimation instanceof AnimatedSprite) {
                this._playerAnimation.loop = config.moving.loop;
                this._playerAnimation.animationSpeed = config.moving.speed;
                this._playerAnimation.play();
            }
        } else {
            this._playerAnimation = Sprite.from(config.moving);
        }

        this.addEvents();
        this.addChild(this._playerAnimation);

        this.position.copyFrom(config.spawnCoords);
        Ticker.shared.add(this.moveProjectiles, this);
        Ticker.shared.add(this.handlePlayerMovement, this);
        if (config.canShoot) {
            Ticker.shared.add(this.shoot, this);
        }
    }

    public get isShooting(): boolean {
        return this._isShooting;
    }

    public get damage(): number {
        return this._damage;
    }

    public get bullets(): IBullet[] {
        return this._bullets;
    }

    public get health(): number {
        return this._health;
    }

    public get ammo(): number {
        return this._ammo;
    }

    public set ammo(value: number) {
        this._playerAnimation.tint = 0x0000ff;
        this._ammoTimeout = setTimeout(() => {
            this._playerAnimation.tint = 0xffffff; // Reset tint to original color
        }, 200);
        this._ammo = value;
    }

    public dispose(): void {
        if (this._ammoTimeout) {
            clearTimeout(this._ammoTimeout);
        }

        if (this._damageTimeout) {
            clearTimeout(this._damageTimeout);
        }

        if (this._healthTimeout) {
            clearTimeout(this._healthTimeout);
        }
        Ticker.shared.remove(this.moveProjectiles, this);
        Ticker.shared.remove(this.shoot, this);
        Ticker.shared.remove(this.handlePlayerMovement, this);
        this.removeEvents();
        this.destroy({ children: true });
    }

    public takeDamage(damage: number): number {
        this._health -= damage;

        if (this._health <= 0) {
            this._playerAnimation.visible = false;
            if (this._deathAnimation) {
                this._deathAnimation.visible = true;
                this._deathAnimation.play();
            }

            this.removeEvents();
            this._speed = 0;
            this._isShooting = false;
            this.emit(GameEvent.PLAYER_DIED);
            this._health = 0;
        } else {
            this._playerAnimation.tint = 0xff0000;
            this._damageTimeout = setTimeout(() => {
                this._playerAnimation.tint = 0xffffff; // Reset tint to original color
            }, 100);
        }

        return this._health;
    }

    public heal(hp: number): number {
        this._health += hp;
        this._playerAnimation.tint = 0x00ff00;
        this._healthTimeout = setTimeout(() => {
            this._playerAnimation.tint = 0xffffff; // Reset tint to original color
        }, 200);
        return this._health;
    }

    private handlePlayerMovement(dt: number): void {
        const x = this._dirextionX * this._speed * dt;
        const y = this._dirextionY * this._speed * dt;

        if (this.x + x > this._config.playerMaxBoundaries.x - this._playerAnimation.width) {
            this.x = this._config.playerMaxBoundaries.x - this._playerAnimation.width;
        } else if (this.x + x < this._config.playerMinBoundaries.x) {
            this.x = this._config.playerMinBoundaries.x;
        } else {
            this.x += x;
        }

        if (this.y + y < this._config.playerMinBoundaries.y) {
            this.y = this._config.playerMinBoundaries.y;
        } else if (this.y + y > this._config.playerMaxBoundaries.y) {
            this.y = this._config.playerMaxBoundaries.y;
        } else {
            this.y += y;
        }
    }

    private shoot(dt: number): void {
        this._shootingTimer += dt;

        if (this._isShooting && this._shootingTimer >= this._config.timeBetweenShots && this._ammo > 0) {
            this._shootingTimer = 0;

            const bullet = Sprite.from(this._config.projectile);
            bullet.scale.copyFrom(this._config.projectileScale);
            bullet.position.set(this.position.x + this._config.projectileSpawnOffset.x, this.position.y + this._config.projectileSpawnOffset.y);

            this._stage.addChild(bullet);

            this._bullets.push({
                sprite: bullet,
                velocityX: this._config.projectileVelocity.x,
                velocityY: this._config.projectileVelocity.y,
            });

            this._ammo -= 1;
            this.emit(GameEvent.PLAYER_SHOT);
        }
    }


    private moveProjectiles(dt: number) {
        for (const bullet of this._bullets) {
            bullet.sprite.x += bullet.velocityX * dt;
            bullet.sprite.y += bullet.velocityY * dt;

            bullet.velocityY += this._config.projectileGravity * Ticker.shared.speed;

            if (bullet.sprite.position.x > gameConfig.width || bullet.sprite.position.y > gameConfig.height) {
                this._stage.removeChild(bullet.sprite);
            }
        }
    }

    private addEvents(): void {
        window.addEventListener("keydown", this._keydownHandlerBound);
        window.addEventListener("keyup", this._keyupHandlerBound);
    }

    private removeEvents(): void {
        window.removeEventListener("keydown", this._keydownHandlerBound);
        window.removeEventListener("keyup", this._keyupHandlerBound);
    }

    private handleKeydown(e: KeyboardEvent) {
        if (e.key === "d") {
            this._dirextionX = 1;
        }

        if (e.key === "a") {
            this._dirextionX = -1;
        }

        if (e.key === "w") {
            this._dirextionY = -1;
        }

        if (e.key === "s") {
            this._dirextionY = 1;
        }

        if (this._config.canShoot) {
            if (e.key === " " && !this._isShooting && Ticker.shared.speed > 0) {
                this._isShooting = true;
            }
        }
    }

    private handleKeyup(e: KeyboardEvent) {
        if (e.key === "d" || e.key === "a") {
            this._dirextionX = 0;
        }

        if (e.key === "w" || e.key === "s") {
            this._dirextionY = 0;
        }

        if (this._config.canShoot) {
            if (e.key === " ") {
                this._isShooting = false;
            }
        }
    }
}
