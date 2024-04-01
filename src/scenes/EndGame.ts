import { BitmapText, Container, Graphics, RoundedRectangle, Sprite } from "pixi.js";
import { gameConfig } from "../configs/GameConfig";
import { BaseScene } from "./BaseScene";
import { Scene } from "../enums/Scene";
import { Button } from "../misc/Button";
import { getDoomguyAnimation, retrieveScore } from "../Utils";
import { EnemyType } from "../enums/EnemyType";
import { Scoreboard } from "../misc/Scoreboard";


export class EndGame extends BaseScene {
    constructor(stage: Container) {
        super(stage)
        const animation = getDoomguyAnimation();
        const currentScore = retrieveScore("currentScore");
        const highScore = retrieveScore("highScore");
        const scoreContainer = new Scoreboard("Current Run");
        const highScoreContainer = new Scoreboard("Best run");

        this.setScore(currentScore, scoreContainer);
        this.setScore(highScore, highScoreContainer);

        highScoreContainer.y = 100;
        highScoreContainer.x = gameConfig.width / 2 - highScoreContainer.width / 2;
        scoreContainer.x = gameConfig.width / 2 - scoreContainer.width / 2;
        scoreContainer.y = highScoreContainer.y + highScoreContainer.height + 10;

        const retryButton = new Button(new RoundedRectangle(0, 0, 210, 55, 15), "Retry");
        const mainMenuButton = new Button(new RoundedRectangle(0, 0, 210, 55, 15), "Main Menu");

        retryButton.x = gameConfig.width / 2 - retryButton.width / 2;
        retryButton.y = scoreContainer.y + scoreContainer.height + 10;
        mainMenuButton.x = retryButton.x;
        mainMenuButton.y = retryButton.y + retryButton.height + 10;

        retryButton.eventMode = 'static';
        mainMenuButton.eventMode = 'static';

        mainMenuButton.on("pointerdown", () => {
            this.emit(Scene.Change, Scene.MainMenu);
        });

        retryButton.on("pointerdown", () => {
            this.emit(Scene.Change, Scene.Endless);
        });

        this.addChild(animation);
        this.addChild(scoreContainer);
        this.addChild(highScoreContainer);
        this.addChild(retryButton);
        this.addChild(mainMenuButton);
    }

    public dispose(): void {
        this.destroy({ children: true });
    }

    private setScore(score: Map<EnemyType, number> | null, scoreboard: Scoreboard): void {
        if (!score) {
            return;
        }

        for (const key in EnemyType) {
            const type = EnemyType[key as keyof typeof EnemyType];
            scoreboard.updateKills(type, score.get(type) || 0);
        }
    }
}
