import { AnimatedSprite, Container, Sprite, Texture, Ticker } from "pixi.js";
import { IBullet } from "./interfaces/IBullet";
import { IEntity } from "./interfaces/IEntity";
import { gameConfig } from "../configs/GameConfig";
import { GameEvent } from "../GameEvent";

export class Player extends Container implements IEntity{
    private _dirextionX: -1 | 0 | 1 = 0;
    private _dirextionY: -1 | 0 | 1 = 0;
    private _speed = 6;
    private _isShooting = false;
    private _walkingAnimation: AnimatedSprite;
    private _deathAnimation: AnimatedSprite;
    private _muzzleFlash: AnimatedSprite;
    private _stage: Container;
    private _bullets: IBullet[];
    private _shootingTimer;
    private _health;
    constructor(stage: Container) {
        super();
        this._stage = stage;
        this._health = 100;
        this._bullets = [];
        this._shootingTimer = 0;

        this._deathAnimation = new AnimatedSprite([
            Texture.from("doomguy_death_1.png"),
            Texture.from("doomguy_death_2.png"),
            Texture.from("doomguy_death_3.png"),
            Texture.from("doomguy_death_4.png"),
            Texture.from("doomguy_death_5.png"),
        ]);

        this._deathAnimation.scale.set(0.6);
        this._deathAnimation.loop = false;
        this._deathAnimation.animationSpeed = 0.1;
        this._deathAnimation.visible = false;

        this._walkingAnimation = new AnimatedSprite([
            Texture.from("tile000.png"),
            Texture.from("tile001.png"),
            Texture.from("tile002.png"),
            Texture.from("tile003.png"),
            Texture.from("tile005.png"),
        ]);

        this._walkingAnimation.scale.set(0.6);
        this._walkingAnimation.loop = true;
        this._walkingAnimation.animationSpeed = 0.1;
        this._walkingAnimation.play();

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

        this.addChild(this._walkingAnimation);
        this.addChild(this._deathAnimation);
        this.addChild(this._muzzleFlash);
        this.addEvents();

        this.y = 720 / 2 - this._walkingAnimation.height / 2;
        Ticker.shared.add(this.moveBullets, this);
        Ticker.shared.add(this.enableShooting, this);
        Ticker.shared.add(this.handlePlayerMovement, this);
    }

    public dispose(): void {
        Ticker.shared.remove(this.moveBullets, this);
        Ticker.shared.remove(this.enableShooting, this);
        Ticker.shared.remove(this.handlePlayerMovement, this);
        this.removeEvents();
        this.destroy({children: true});
    }

    public get isShooting(): boolean {
        return this._isShooting;
    }

    public get bullets(): IBullet[] {
        return this._bullets;
    }

    public takeDamage(damage: number): void {
        this._health -= damage;

        if (this._health <= 0) {
            this._walkingAnimation.visible = false;
            this._deathAnimation.visible = true;
            this._deathAnimation.play();
            this.removeEvents();
            this.emit(GameEvent.PLAYER_DIED);
        }
    }

    private handlePlayerMovement(dt: number): void {
        this.x += this._dirextionX * this._speed * dt;

        if (this.y < 237) {
            this.y = 237;
        } else if (this.y > 611) {
            this.y = 611;
        } else {
            this.y += this._dirextionY * this._speed * dt;
        }
    }

    private enableShooting(dt: number): void {
            this._shootingTimer += dt;

            if (this._isShooting && this._shootingTimer >= 10) {
                this._shootingTimer = 0;

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
    }

    private moveBullets(dt: number) {
        for (const bullet of this._bullets) {
            bullet.sprite.x += bullet.velocityX * dt;

            // Remove the bullet when it goes off the screen
            if (bullet.sprite.position.x > gameConfig.width) {
                this._stage.removeChild(bullet.sprite);
            }
        }
    }

    private addEvents(): void {
        window.addEventListener("keydown", this.keydownHandler.bind(this));
        window.addEventListener("keyup", this.keyupHandler.bind(this));
    }

    private removeEvents(): void {
        window.removeEventListener("keydown", this.keydownHandler);
        window.removeEventListener("keyup", this.keyupHandler);
    }

    private keydownHandler(e: KeyboardEvent) {
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
    }
    
    private keyupHandler(e: KeyboardEvent) {
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
    }
}
