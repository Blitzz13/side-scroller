import { BitmapText, Container, Graphics } from "pixi.js";
import { gameConfig } from "../configs/GameConfig";
import { BaseScene } from "./BaseScene";
import { Scene } from "../Scene";

export class MainMenu extends BaseScene {
    private _playButton: Graphics;
    constructor(stage: Container) {
        super(stage)

        this._playButton = new Graphics();
        this._playButton.beginFill(0x000000);
        this._playButton.lineStyle({
            width: 2,
            color: 0x919191
        })
        this._playButton.drawRoundedRect(0, 0, 210, 75, 26);
        this._playButton.x = gameConfig.width / 2 - this._playButton.width / 2;
        this._playButton.y = gameConfig.height / 2 - this._playButton.height / 2;

        const text = new BitmapText("Play Endless", {
            fontName: "arial32",
        });
        text.anchor.set(0.5);
        text.position.set(this._playButton.width / 2, this._playButton.height / 2)
        this._playButton.eventMode = 'static';
        this._playButton.on("pointerdown", () => {
           this.emit(Scene.Change, Scene.Endless);
        })
        this.addChild(this._playButton);
        this._playButton.addChild(text);
    }

    public dispose(): void {
        this.destroy({children: true})
    }
}
