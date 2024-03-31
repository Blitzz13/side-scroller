import { BitmapText, Container, Graphics, RoundedRectangle, Sprite } from "pixi.js";
import { gameConfig } from "../configs/GameConfig";
import { BaseScene } from "./BaseScene";
import { Scene } from "../enums/Scene";
import { Button } from "../misc/Button";
import { retrieveScore } from "../Utils";
import { EnemyType } from "../enums/EnemyType";


export class EndGame extends BaseScene {
    private _mainMenuButton: Button;
    constructor(stage: Container) {
        super(stage)

        const scoreContainer = this.createCurrentScore("currentScore", "Current Casualties");
        scoreContainer.y = 100;
        const highScoreContainer = this.createCurrentScore("highScore", "Best run");
        highScoreContainer.y = scoreContainer.y + scoreContainer.height + 10;
        this._mainMenuButton = new Button(new RoundedRectangle(0, 0, 210, 55, 15), "Main Menu");
        this._mainMenuButton.x = gameConfig.width / 2 - this._mainMenuButton.width / 2;
        this._mainMenuButton.y = highScoreContainer.y + highScoreContainer.height + 10;
        this._mainMenuButton.eventMode = 'static';
        this._mainMenuButton.on("pointerdown", () => {
            this.emit(Scene.Change, Scene.MainMenu);
        })

        this.addChild(this._mainMenuButton);
    }

    public dispose(): void {
        this.destroy({ children: true });
    }

    private createCurrentScore(scoreKey: string, text: string): Container {
        const currentScore = retrieveScore(scoreKey);
        const casualtiesText = new BitmapText(text, {
            fontName: "arial32",
        });

        let lastText: BitmapText;

        const scoreContainer = new Container();
        scoreContainer.addChild(casualtiesText);
        scoreContainer.x = gameConfig.width / 2 - scoreContainer.width / 2;
        for (const key in EnemyType) {
            const type = EnemyType[key as keyof typeof EnemyType];
            const kills = currentScore?.get(type) || 0;
            const text = new BitmapText(kills.toString(), {
                fontName: "arial32",
            });

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
            spriteTextContainer.y = casualtiesText.height + 10;

            if (sprite) {
                
                text.position.x = sprite.x + sprite.width + 10;
                spriteTextContainer.addChild(sprite);
            }

            spriteTextContainer.addChild(text);
            spriteTextContainer.y = scoreContainer.height; 
            scoreContainer.addChild(spriteTextContainer);
            spriteTextContainer.x = scoreContainer.width / 2 - spriteTextContainer.width / 2; 
            lastText = text;
        }

        this.addChild(scoreContainer);
        return scoreContainer;
    }
}
