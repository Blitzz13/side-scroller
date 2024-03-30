import { AnimatedSprite, Container, Sprite, Texture, Ticker } from "pixi.js";
import { IBullet } from "./interfaces/IBullet";
import { gameConfig } from "../configs/GameConfig";

export class Player extends Container {
    private _dirextionX: -1 | 0 | 1 = 0;
    private _dirextionY: -1 | 0 | 1 = 0;
    private _speed = 6;
    private _isShooting = false;
    private _sprite: AnimatedSprite;
    private _muzzleFlash: AnimatedSprite;
    private _stage: Container;
    private _bullets: IBullet[];

    constructor(stage: Container) {
        super();
        this._stage = stage;
        this._bullets = [];
        this._sprite = new AnimatedSprite([
            Texture.from("tile000.png"),
            Texture.from("tile001.png"),
            Texture.from("tile002.png"),
            Texture.from("tile003.png"),
            Texture.from("tile005.png"),
        ]);

        this._sprite.scale.set(0.6);
        this._sprite.loop = true;
        this._sprite.animationSpeed = 0.1;
        this._sprite.play();

        this._muzzleFlash = new AnimatedSprite([
            Texture.from("m_9.png"),
            Texture.from("m_15.png"),
            Texture.from("m_10.png"),
            Texture.from("m_13.png"),
            Texture.from("m_5.png"),
        ]);

        this._muzzleFlash.animationSpeed = 0.2;
        this._muzzleFlash.scale.set(0.1);
        this._muzzleFlash.position.set(50, 5);
        this._muzzleFlash.visible = false;

        this.addChild(this._sprite);
        this.addChild(this._muzzleFlash);
        this.addEvents();

        this.y = 720 / 2 - this._sprite.height / 2;
        this.enableShooting();
        this.moveBullets();
        this.handlePlayerMovement();
    }

    public get isShooting(): boolean {
        return this._isShooting;
    }

    public get bullets():IBullet[]{
        return this._bullets;
    }

    public takeDamage(): void {
        // console.log("Player Damaged");
    }

    private handlePlayerMovement(): void {
        Ticker.shared.add((dt: number) => {
            this.x += this._dirextionX * this._speed * dt;

            if (this.y < 237) {
                this.y = 237;
            } else if (this.y > 611) {
                this.y = 611;
            } else {
                this.y += this._dirextionY * this._speed * dt;
            }
        });
    }

    private enableShooting(): void {
        let shootingTimer = 0;
        Ticker.shared.add((dt: number) => {
            shootingTimer += dt;

            if (this._isShooting && shootingTimer >= 10) {
                shootingTimer = 0;

                const bullet = Sprite.from("bullet");
                bullet.scale.set(0.1, 0.1);
                bullet.position.set(this.position.x + 30, this.position.y + 14);

                this._stage.addChild(bullet);
                this._bullets.push({
                    sprite: bullet,
                    velocityX: 18,
                    velocityY: 0,
                });
            }
        });
    }

    private moveBullets() {
         Ticker.shared.add((dt: number) => {
            for (const bullet of this._bullets) {
                bullet.sprite.x += bullet.velocityX * dt;
    
                // Remove the bullet when it goes off the screen
                if (bullet.sprite.position.x > gameConfig.width) {
                    this._stage.removeChild(bullet.sprite);
                }
            }
        });
    }

    private addEvents(): void {
        window.addEventListener("keydown", (e) => {
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

            if (e.key === " " && !this._isShooting) {
                this._isShooting = true;
                this._muzzleFlash.play();
                this._muzzleFlash.loop = true;
                this._muzzleFlash.visible = true;
            }

            // if (this._dirextionX !== 0 || this._dirextionY !== 0) {
            //     this._sprite.play();
            // }
        });

        window.addEventListener("keyup", (e) => {
            if (e.key === "d" || e.key === "a") {
                this._dirextionX = 0;
            }

            if (e.key === "w" || e.key === "s") {
                this._dirextionY = 0;
            }

            if (e.key === " ") {
                this._isShooting = false;
                this._muzzleFlash.stop();
                this._muzzleFlash.loop = false;
                this._muzzleFlash.currentFrame = 0;
                this._muzzleFlash.visible = false;
            }

            // if (this._dirextionX === 0 || this._dirextionY === 0) {
            //     this._sprite.stop();
            //     this._sprite.currentFrame = 0;
            // }
        });
    }
}
