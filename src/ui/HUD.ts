import { AnimatedSprite, BitmapText, Container, Texture } from "pixi.js";
import { IEntity } from "../characters/interfaces/IEntity";
import { gameConfig } from "../configs/GameConfig";
import { Scoreboard } from "../misc/Scoreboard";
import { EnemyType } from "../enums/EnemyType";

export class HUD extends Container implements IEntity {
    private _health: BitmapText;
    private _score: Scoreboard;
    private _head: AnimatedSprite;
    constructor() {
        super();
        this._health = new BitmapText("0", {
            fontName: "arial32"
        });

        this._head = new AnimatedSprite([
            Texture.from("gh_straight.png"),
            Texture.from("gh_left.png"),
            Texture.from("gh_right.png"),
        ]);

        this._head.animationSpeed = 0.007;
        this._head.loop = true;
        this._head.scale.set(0.5);
        this._head.play();

        this._score = new Scoreboard("Casualties");
        this._score.x = 1100;

        this.addChild(this._health);
        this.addChild(this._head);
        this.addChild(this._score);
        this.setPositions();
    }
    
    public set health(health: number) {
        this._health.text = `${health}`;
        // this.setPositions();
        if (health <= 75 && health > 50) {
            this._head.textures = [
                Texture.from("h_straight.png"),
                Texture.from("h_left.png"),
                Texture.from("h_right.png"),
            ];

            this._head.gotoAndPlay(0);
        } else if (health <= 50 && health > 25) {
            this._head.textures = [
                Texture.from("uh_straight.png"),
                Texture.from("uh_left.png"),
                Texture.from("uh_right.png"),
            ];

            this._head.gotoAndPlay(0);
        }
        else if (health <= 25 && health > 10) {
            this._head.textures = [
                Texture.from("bh_straight.png"),
                Texture.from("bh_left.png"),
                Texture.from("bh_right.png"),
            ];

            this._head.gotoAndPlay(0);
        } else if (health <= 10) {
            this._head.textures = [
                Texture.from("vbh_straight.png"),
                Texture.from("vbh_left.png"),
                Texture.from("vbh_right.png"),
            ];

            this._head.gotoAndPlay(0);
        }
    }

    public dispose(): void {
        this.destroy({ children: true });
    }

    public updateKills(enemy: EnemyType, kills: number) {
        this._score.updateKills(enemy, kills);
    }


    private setPositions(): void {
        this._health.x = this._head.x + this._head.width;
        this._health.y = this._head.y + this._head.height / 2 - this._health.height / 2;
    }
}