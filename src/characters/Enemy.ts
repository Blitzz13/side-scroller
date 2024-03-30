import { Container, Sprite, Texture, Ticker } from "pixi.js";
import { GameEvent } from "../GameEvent";
import { IEnemyConfig } from "./interfaces/IEnemyConfig";
import { IBullet } from "./interfaces/IBullet";
import { gameConfig } from "../configs/GameConfig";

export class Enemy extends Container {
    private _sprite: Sprite;
    private _target: Container;
    private _stage: Container;
    private _bullets: IBullet[];
    private _speed: number;
    private _updateTextureInterval: NodeJS.Timeout;
    private _shootingInterval: NodeJS.Timeout;
    private _config: IEnemyConfig;

    constructor(target: Container, stage: Container, config: IEnemyConfig) {
        super();

        this._config = config;
        this._bullets = [];
        this._target = target;
        this._stage = stage;
        this._speed = config.speed;
        this._sprite = Sprite.from(config.characterTextures.left);
        this._sprite.anchor.set(0.5, 0.5);
        this.addChild(this._sprite);
        this._shootingInterval = setInterval(() => this.shoot(), config.rateOfFireMs);
        this._updateTextureInterval = this.updateSpriteTexture();
        // Add the updateBulletPosition function to the ticker
        Ticker.shared.add(this.updateBulletPosition, this);
        Ticker.shared.add(this.moove, this);
    }

    public dispose():void {
        Ticker.shared.remove(this.moove, this);
        clearInterval(this._updateTextureInterval);
        clearInterval(this._shootingInterval);
        this.destroy();
    }

    private moove(dt: number): void {
        this.x -= this._speed * dt;
        if (this.x + this.width <= 0) {
            this.dispose();
        }
    }

    private updateSpriteTexture(): NodeJS.Timeout {
        return setInterval(() => {
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
            // console.log(angle)
        }, 100);
    }

    private shoot(): void {
        if (this.x > gameConfig.width) {
            return;
        }

        // Calculate the angle between the enemy and the target
        const distanceX = this._target.x - this.x;
        const distanceY = this._target.y + this._target.height / 2 - this.y;
        const angle = Math.atan2(distanceY, distanceX);

        const shot = Sprite.from(this._config.projectile.texture);
        shot.anchor.copyFrom(this._config.projectile.anchor);
        shot.rotation = angle;
        shot.scale.copyFrom(this._config.projectile.scale);
        shot.position.set(this.x, this.y);
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