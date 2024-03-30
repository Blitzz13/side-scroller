import { AnimatedSprite, Container, Sprite, Texture, Ticker } from "pixi.js";

export class Environment extends Container {
    // private bg!: AnimatedSprite;
    private instances: Container[] = [];

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
                this.instances.push(animatedSprite);
            }
        } else {
            for (let i = 0; i < numEnvironments; i++) {
                const sprite = Sprite.from(texture);
                sprite.x = i * sprite.width;
                this.addChild(sprite);
                this.instances.push(sprite);
            }
        }
    }

    public startScrolling(speed: number): void {
            Ticker.shared.add((dt: number) => {
                for (const env of this.instances) {
                    env.x -= speed * dt;
    
                    if (env.x + env.width <= 0) {
                        let farthestX = 0;
                        this.instances.forEach(e => {
                            farthestX = Math.max(farthestX, e.x + e.width);
                        });
                        env.x = farthestX - 10;
                    }
                }
            });
    }
}
