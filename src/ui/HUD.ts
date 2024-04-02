import { AnimatedSprite, BitmapText, Container, Sprite, Texture } from "pixi.js";
import { IEntity } from "../characters/interfaces/IEntity";
import { gameConfig } from "../configs/GameConfig";
import { Scoreboard } from "../misc/Scoreboard";
import { EnemyType } from "../enums/EnemyType";
import { commonScoreboardConfig } from "../configs/ScoreboardConfig";
import { IHUDConfig } from "../configs/interfaces/IHUDConfig";

export class HUD extends Container implements IEntity {
    private _healthText: BitmapText;
    private _config: IHUDConfig;
    private _ammoText: BitmapText;
    private _score: Scoreboard;
    private _icon: Sprite;
    private _ammoIcon: Sprite;
    constructor(playerIcon: string, ammoIcon: string, config: IHUDConfig) {
        super();
        this._config = config;
        this._healthText = new BitmapText("0", {
            fontName: config.fontName
        });

        this._ammoText = new BitmapText("0", {
            fontName: config.fontName
        });

        this._icon = Sprite.from(playerIcon);
        this._icon.scale.copyFrom(config.playerIconScale);
        this._icon.position.copyFrom(config.iconPosition);

        this._ammoIcon = Sprite.from(ammoIcon);
        this._ammoIcon.scale.copyFrom(config.ammoIconScale);

        this._score = new Scoreboard("Casualties", commonScoreboardConfig);
        this._score.position.copyFrom(config.scorePosition);

        this.addChild(this._healthText);
        this.addChild(this._ammoText);
        this.addChild(this._icon);
        this.addChild(this._ammoIcon);
        this.addChild(this._score);
        this.setPositions();
    }

    public set health(health: number) {
        this._healthText.text = `${health}`;
    }

    public set ammo(ammo: number) {
        this._ammoText.text = `${ammo}`;
    }

    public dispose(): void {
        this.destroy({ children: true });
    }

    public updateKills(enemy: EnemyType, kills: number) {
        this._score.updateKills(enemy, kills);
    }


    private setPositions(): void {
        this._healthText.x = this._icon.x + this._icon.width + this._config.iconTextGap.x;
        this._healthText.y = this._icon.y + this._icon.height / 2 - this._healthText.textHeight / 2 + this._config.iconTextGap.y;
        this._ammoIcon.x = this._icon.x;
        this._ammoIcon.y = this._icon.y + this._icon.height + this._config.distanceBetweenRows;
        this._ammoText.x = this._healthText.x;
        this._ammoText.y = this._ammoIcon.y;
    }
}