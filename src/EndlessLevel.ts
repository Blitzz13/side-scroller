import { Container, Ticker } from "pixi.js";
import { Player } from "./characters/Player";
import { Enemy } from "./characters/Enemy";
import { gruntConfig } from "./configs/EnemyConfigs";
import { Environment } from "./Environment";
import { gameConfig } from "./configs/GameConfig";

export class EndlessLevel {
    private _stage: Container;
    private _player: Player;
    private _enemies: Enemy[];

    constructor(stage: Container) {
        this._stage = stage;
        this._enemies = [];

        const background = new Environment([
            "frame_0.png",
            "frame_1.png",
            "frame_2.png",
            "frame_3.png",
            "frame_5.png",
            "frame_6.png",
            "frame_7.png"
        ], 4);

        const corridor = new Environment("corridor", 2);
        corridor.y = 230;
        corridor.scale.set(0.7);
        stage.addChild(background);
        stage.addChild(corridor);

        background.startScrolling(0.6);
        corridor.startScrolling(1.2);
        this._player = new Player(stage);
        // let moveright = true;
        // let movedown = true;
        // Ticker.shared.add((dt: number) => {
        //     if (this._player.x >= 400) {
        //         moveright = false;
        //     } else if (this._player.x <= 70) {
        //         moveright = true;
        //     }

        //     if (this._player.y <= 320) {
        //         movedown = true;
        //     } else if (this._player.y >= 470) {
        //         movedown = false;
        //     }

        //     if (moveright) {
        //         this._player.x += 6 * dt;
        //     } else {
        //         this._player.x -= 6 * dt;
        //     }

        //     if (movedown) {
        //         this._player.y += 6 * dt;
        //     } else {
        //         this._player.y -= 6 * dt;
        //     }
        // })
        // const grunt = new Grunt(this._player, stage, 0.85);
        // grunt.x = 400;
        // grunt.y = 650;
        // grunt.on(GameEvent.PLAYER_HIT, this._player.takeDamage, this);
        this._stage.addChild(this._player);
        // this._stage.addChild(grunt);
        //300-650x
        setInterval(() => {
            const numberOfEnemies = Math.floor(Math.random() * 3) + 1;

            for (let i = 0; i < numberOfEnemies; i++) {
                const y = Math.floor(Math.random() * (650 - 300 + 1)) + 300;
                const x = Math.floor(Math.random() * (2000 - gameConfig.width)) + gameConfig.width;
                const grunt = new Enemy(this._player, stage, gruntConfig);
                grunt.x = x;
                grunt.y = y;
                stage.addChild(grunt);
                this._enemies.push(grunt);
            }
        }, 2000);

        Ticker.shared.add(this.checkForPlayerKills, this);

        // console.log(stage.width)
    }

    private checkForPlayerKills(): void {
        for (const pBullet of this._player.bullets) {
            for (const grunt of this._enemies) {
                if (pBullet.sprite.getBounds().intersects(grunt.getBounds())) {
                    grunt.dispose();
                    this._enemies.splice(this._enemies.indexOf(grunt), 1);
                    this._player.bullets.splice(this._player.bullets.indexOf(pBullet), 1);
                    this._stage.removeChild(pBullet.sprite);
                    // pBullet.sprite.destroy();
                    return;
                }
            }
        }
    }
}
