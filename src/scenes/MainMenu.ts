import { Container, Sprite, Texture } from "pixi.js";
import { defaultButtonSize, gameConfig } from "../configs/GameConfig";
import { BaseScene } from "./BaseScene";
import { Scene } from "../enums/Scene";
import { Button } from "../misc/Button";
import { sound } from "@pixi/sound";
import { Instructions } from "../ui/Instructions";
import { GameEvent } from "../enums/GameEvent";
import { allConfigs } from "../configs/PlayerConfigs";

export class MainMenu extends BaseScene {
    private _playButton: Button;
    private _instructions?: Instructions;
    private _currentVisibleShipIndex: number;
    constructor(stage: Container, scale: number, showInstructions: boolean) {
        super(stage, scale)

        this._playButton = new Button( defaultButtonSize, "Play");

        const ship = Sprite.from(allConfigs[0].moving);
        ship.x = gameConfig.width / 2 - ship.width / 2;
        ship.y = gameConfig.height / 4.5 - this._playButton.height / 2;
        this._currentVisibleShipIndex = 0;
        sound.play("menu_theme", { loop: true });

        const background = Sprite.from("menu_background");
        background.position.set(-3, -3);
        background.scale.set(1.2);
        this.addChild(background);

        this._playButton.x = gameConfig.width / 2 - this._playButton.width / 2;
        this._playButton.y = gameConfig.height / 3 - this._playButton.height / 2;

        this._playButton.eventMode = 'static';
        this._playButton.on("pointerdown", () => {
            this.emit(GameEvent.SELECT_SHIP, allConfigs[this._currentVisibleShipIndex]);
            this.emit(Scene.Change, Scene.Endless);
        });


        const changeShip = new Button(defaultButtonSize, "Change Ship");
        changeShip.x = gameConfig.width / 2 - changeShip.width / 2;
        changeShip.y = this._playButton.y + this._playButton.height + 20;

        changeShip.on("pointerdown", () => {
            if (this._currentVisibleShipIndex >= allConfigs.length - 1) {
                this._currentVisibleShipIndex = 0;
            } else {
                this._currentVisibleShipIndex++;
            }

            ship.texture = Texture.from(allConfigs[this._currentVisibleShipIndex].moving);
            ship.texture.update();
        });

        this.addChild(this._playButton);
        this.addChild(changeShip);
        this.addChild(ship);
        
        if (showInstructions) {
            this._instructions = new Instructions();
            this._instructions.x = gameConfig.width / 2 - this._instructions.width / 2;
            this._instructions.y = gameConfig.height / 2 - this._instructions.height / 2;
            this.addChild(this._instructions);
        }
    }

    public dispose(): void {
        sound.stopAll();
        this._instructions?.dispose();
        this.destroy({ children: true });
    }
}
