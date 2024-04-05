import { BitmapText, Container, Graphics, Sprite } from "pixi.js";
import { EnemyType } from "../enums/EnemyType";
import { IScoreBoardConfig } from "../configs/interfaces/IScoreboardConfig";

export class Scoreboard extends Container {
    private _scoreMap: Map<EnemyType, BitmapText>;
    private _config: IScoreBoardConfig;

    constructor(title: string, config: IScoreBoardConfig) {
        super();
        this._config = config;
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

            text.anchor.copyFrom(config.scoreTextAnchor);

            this._scoreMap.set(type, text);

            let sprite: Sprite | null = null;
            switch (type) {
                case EnemyType.AT_ST:
                    sprite = Sprite.from("at_st_down.png");
                    sprite.scale.set(0.34);
                    break;
                case EnemyType.VIPER_DROID:
                    sprite = Sprite.from("viper_droid_1.png");
                    sprite.scale.set(0.64);
                    break;
                case EnemyType.AT_AT:
                    sprite = Sprite.from("at_at_down.png");
                    sprite.scale.set(0.15);
                    break;
                default:
                    break;
            }

            const spriteTextContainer = new Container();
            spriteTextContainer.y = titleText.height;

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
        graphics.beginFill(config.backgroundColor, config.backgroundAlpha);
        graphics.lineStyle(config.backgroundLineStyles);
        const size = config.backgroundSize;

        graphics.drawRoundedRect(0, 0,
            size?.width ? size.width : scoreContainer.width,
            size?.height ? size.height : scoreContainer.height,
            config.radius);

        graphics.x -= config.backgroundOffset.x;
        graphics.y -= config.backgroundOffset.y;
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
                text.x = sprite.x - this._config.textSpritegGap;
            }
        }
    }
}