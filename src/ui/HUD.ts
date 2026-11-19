import { BitmapText, Container, Graphics, Sprite } from "pixi.js";
import { IDisposable } from "../characters/interfaces/IDisposable";
import { Scoreboard } from "../misc/Scoreboard";
import { EnemyType } from "../enums/EnemyType";
import { commonScoreboardConfig } from "../configs/ScoreboardConfig";
import { IHUDConfig } from "../configs/interfaces/IHUDConfig";

export class HUD extends Container implements IDisposable {
    private _healthText: BitmapText;
    private _config: IHUDConfig;
    private _ammoText: BitmapText;
    private _score: Scoreboard;
    private _icon: Sprite;
    private _ammoIcon: Sprite;
    private _mapButton?: Container;
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

    public get mapButton(): Container | undefined {
        return this._mapButton;
    }

    public addMapButton(onToggle?: () => void): Container {
        if (this._mapButton) return this._mapButton;

        const btn = new Container();
        btn.eventMode = "static";
        btn.cursor = "pointer";

        const bg = new Graphics();
        const drawBg = (pressed: boolean) => {
            bg.clear();
            const bgColor = pressed ? 0x004466 : 0x091929;
            const borderColor = pressed ? 0x00ffff : 0x00e5ff;
            bg.beginFill(bgColor, pressed ? 0.95 : 0.85);
            bg.lineStyle(2, borderColor, pressed ? 1.0 : 0.85);
            bg.drawCircle(0, 0, 22);
            bg.lineStyle(1, borderColor, pressed ? 0.6 : 0.35);
            bg.drawCircle(0, 0, 18);
            bg.endFill();
        };
        drawBg(false);
        btn.addChild(bg);

        let mapIcon: Sprite;
        try {
            mapIcon = Sprite.from("assets/common/map_icon.png");
        } catch {
            mapIcon = Sprite.from("map_icon");
        }
        mapIcon.anchor.set(0.5);
        mapIcon.width = 28;
        mapIcon.height = 28;
        mapIcon.position.set(0, 0);
        mapIcon.tint = 0xffffff;
        btn.addChild(mapIcon);

        btn.on("pointerdown", (e) => {
            if (e && typeof e.stopPropagation === "function") e.stopPropagation();
            drawBg(true);
            btn.scale.set(0.92);
        });
        btn.on("pointerup", (e) => {
            if (e && typeof e.stopPropagation === "function") e.stopPropagation();
            drawBg(false);
            btn.scale.set(1.0);
            if (onToggle) onToggle();
            (this as any).emit("toggleMinimap");
        });
        btn.on("pointerupoutside", () => {
            drawBg(false);
            btn.scale.set(1.0);
        });

        btn.position.set(this._config.scorePosition.x - 60, this._config.scorePosition.y);
        this.addChild(btn);
        this._mapButton = btn;
        return btn;
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