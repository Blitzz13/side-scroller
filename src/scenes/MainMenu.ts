import { AnimatedSprite, BitmapText, Container, Graphics, RoundedRectangle, Texture } from "pixi.js";
import { gameConfig } from "../configs/GameConfig";
import { BaseScene } from "./BaseScene";
import { Scene } from "../Scene";
import { Button } from "../Button";

export class MainMenu extends BaseScene {
    private _playButton: Button;
    constructor(stage: Container) {
        super(stage)

        this._playButton = new Button(new RoundedRectangle(0, 0, 210, 55, 15), "Play Endless");

        const textures: Texture[] = [];
        for (let i = 0; i < 100; i++) {
            const texture = Texture.from(`frame_${i.toString().padStart(3, "0")}.png`);
            textures.push(texture);
        }

        const animation = new AnimatedSprite(textures);
        animation.play();
        animation.loop = true;
        animation.animationSpeed = 0.4;
        animation.scale.set(1.6);
        this.addChild(animation);
        
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
