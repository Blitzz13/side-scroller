import { AnimatedSprite, BitmapText, Container, Graphics, RoundedRectangle, Sprite, Texture } from "pixi.js";
import { gameConfig } from "../configs/GameConfig";
import { BaseScene } from "./BaseScene";
import { Scene } from "../enums/Scene";
import { Button } from "../misc/Button";

export class MainMenu extends BaseScene {
    private _playButton: Button;
    constructor(stage: Container) {
        super(stage)

        this._playButton = new Button(new RoundedRectangle(0, 0, 210, 55, 15), "Play Endless");

        const background = Sprite.from("menu_background");
        background.position.set(-3, -3);
        background.scale.set(1.2);
        this.addChild(background);

        this._playButton.x = gameConfig.width / 2 - this._playButton.width / 2;
        this._playButton.y = gameConfig.height / 1.5 - this._playButton.height / 2;

        this._playButton.eventMode = 'static';
        this._playButton.on("pointerdown", () => {
            this.emit(Scene.Change, Scene.Endless);
        })

        this.addChild(this._playButton);
    }

    public dispose(): void {
        this.destroy({ children: true });
    }
}
