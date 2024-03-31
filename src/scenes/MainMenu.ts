import { BitmapText, Container, Graphics, RoundedRectangle } from "pixi.js";
import { gameConfig } from "../configs/GameConfig";
import { BaseScene } from "./BaseScene";
import { Scene } from "../Scene";
import { Button } from "../Button";

export class MainMenu extends BaseScene {
    private _playButton: Button;
    constructor(stage: Container) {
        super(stage)

        this._playButton = new Button(new RoundedRectangle(0, 0, 210, 55, 15), "Play Endless");
        
        this._playButton.x = gameConfig.width / 2 - this._playButton.width / 2;
        this._playButton.y = gameConfig.height / 2 - this._playButton.height / 2;

        this._playButton.eventMode = 'static';
        this._playButton.on("pointerdown", () => {
           this.emit(Scene.Change, Scene.Endless);
        })

        this.addChild(this._playButton);
    }

    public dispose(): void {
        this.destroy({children: true})
    }
}
