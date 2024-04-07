import { Container } from "pixi.js";
import { IDisposable } from "../characters/interfaces/IDisposable";
import { Button } from "../misc/Button";
import { GameEvent } from "../enums/GameEvent";
import { defaultButtonSize, gameConfig } from "../configs/GameConfig";

export class InGameMenu extends Container implements IDisposable {

    constructor() {
        super();
        const resume = new Button(defaultButtonSize, "Resume");
        const quit = new Button(defaultButtonSize, "Quit");

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