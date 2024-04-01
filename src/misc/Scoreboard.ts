import { BitmapText, Container, Graphics, Sprite } from "pixi.js";
import { EnemyType } from "../enums/EnemyType";

export class Scoreboard extends Container {
    private _scoreMap: Map<EnemyType, BitmapText>;

    constructor(title: string) {
        super();
        this._scoreMap = new Map();
        const titleText = new BitmapText(title, {
            fontName: "arial32",
        });

        const scoreContainer = new Container();
        scoreContainer.addChild(titleText);
        let biggestSprite: Sprite = new Sprite();
        for (const key in EnemyType) {
            const type = EnemyType[key as keyof typeof EnemyType];
            const text = new BitmapText("0", {
                fontName: "arial32",
            });

            text.anchor.set(1, 0);

            this._scoreMap.set(type, text);

            let sprite: Sprite | null = null;
            switch (type) {
                case EnemyType.GRUNT:
                    sprite = Sprite.from("grunt_down.png");
                    sprite.scale.set(0.7);
                    break;
                case EnemyType.CACODEMON:
                    sprite = Sprite.from("cacodemon_idle_down.png");
                    sprite.scale.set(0.44);
                    break;
                default:
                    break;
            }

            const spriteTextContainer = new Container();
            spriteTextContainer.y = titleText.height + 10;

            if (sprite) {
                if (biggestSprite.width < sprite.width) {
                    biggestSprite = sprite;
                }

                sprite.x = titleText.textWidth - sprite.width;
                spriteTextContainer.addChild(sprite);
            }

            spriteTextContainer.addChild(text);
            spriteTextContainer.y = scoreContainer.height;
            scoreContainer.addChild(spriteTextContainer);
            spriteTextContainer.x = scoreContainer.width / 2 - spriteTextContainer.width / 2;
        }

        const graphics = new Graphics();
        graphics.beginFill(0x000000, 0.7);
        graphics.lineStyle({ width: 2, color: 0x919191 });
        graphics.drawRoundedRect(0, 0, scoreContainer.width, scoreContainer.height, 12);
        graphics.x -= 10;
        this.addChild(graphics);
        this.addChild(scoreContainer);
        this.updateTextPos(biggestSprite);
    }

    public updateKills(enemy: EnemyType, kills: number) {
        const textToUpdate = this._scoreMap.get(enemy);
        if (textToUpdate) {
            textToUpdate.text = kills.toString();
        }
    }

    private updateTextPos(sprite: Sprite) {
        for (const key in EnemyType) {
            const type = EnemyType[key as keyof typeof EnemyType];
            const text = this._scoreMap.get(type);
            if (text) {
                text.x = sprite.x;
            }
        }
    }
}