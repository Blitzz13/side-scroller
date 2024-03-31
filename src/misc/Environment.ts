import { AnimatedSprite, Container, Sprite, Texture, Ticker } from "pixi.js";
import { IEntity } from "../characters/interfaces/IEntity";

export class Environment extends Container implements IEntity {
    // private bg!: AnimatedSprite;
    private _instances: Container[] = [];
    private _speed: number = 0;

    constructor(texture: string | string[], numEnvironments: number) {
        super();

        if (Array.isArray(texture)) {
            const textures: Texture[] = [];
            for (const txtr of texture) {
                textures.push(Texture.from(txtr));
            }

            for (let i = 0; i < numEnvironments; i++) {
                const animatedSprite = new AnimatedSprite(textures);
                animatedSprite.loop = true;
                animatedSprite.animationSpeed = 0.2;
                animatedSprite.play();
                animatedSprite.x = i * animatedSprite.width;
                this.addChild(animatedSprite);
                this._instances.push(animatedSprite);
            }
        } else {
            for (let i = 0; i < numEnvironments; i++) {
                const sprite = Sprite.from(texture);
                sprite.x = i * sprite.width;
                this.addChild(sprite);
                this._instances.push(sprite);
            }
        }
    }

    public dispose(): void {
        Ticker.shared.remove(this.moveSprite, this);
        this.destroy({children: true});
    }

    public startScrolling(speed: number): void {
        this._speed = speed;
        Ticker.shared.add(this.moveSprite, this);
    }

    private moveSprite(dt: number): void {
        for (const env of this._instances) {
            env.x -= this._speed * dt;

            if (env.x + env.width <= 0) {
                let farthestX = 0;
                this._instances.forEach(e => {
                    farthestX = Math.max(farthestX, e.x + e.width);
                });
                env.x = farthestX - 10;
            }
        }

    }
}
