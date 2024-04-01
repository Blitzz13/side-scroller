import { Container, RoundedRectangle } from "pixi.js";
import { IEntity } from "../characters/interfaces/IEntity";
import { Button } from "../misc/Button";
import { GameEvent } from "../enums/GameEvent";
import { gameConfig } from "../configs/GameConfig";

export class InGameMenu extends Container implements IEntity {

    constructor() {
        super();
        const resume = new Button(new RoundedRectangle(0, 0, 210, 55, 15), "Resume");
        const quit = new Button(new RoundedRectangle(0, 0, 210, 55, 15), "Quit");

        resume.eventMode = 'static';
        quit.eventMode = 'static';

        resume.on("pointerdown", () => {
            this.emit(GameEvent.RESUME_GAME);
        });

        quit.on("pointerdown", () => {
            this.emit(GameEvent.QUIT_GAME);
        });

        const x = gameConfig.width / 2 - resume.width / 2
        resume.x = x;
        resume.y = gameConfig.height / 2;
        quit.x = x;
        quit.y = resume.y + resume.height + 10;

        this.addChild(resume);
        this.addChild(quit);
        this.visible = false;
    }

    dispose(): void {
        this.destroy({ children: true });
    }
}