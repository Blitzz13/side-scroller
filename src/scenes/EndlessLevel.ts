import { Container, Ticker } from "pixi.js";
import { Player } from "../characters/Player";
import { Enemy } from "../characters/Enemy";
import { gruntConfig } from "../configs/EnemyConfigs";
import { Environment } from "../Environment";
import { gameConfig } from "../configs/GameConfig";
import { BaseScene } from "./BaseScene";
import { GameEvent } from "../enums/GameEvent";
import { Scene } from "../Scene";
import { EnemyType } from "../enums/EnemyType";
import { saveScore, retrieveScore } from "../Utils";

export class EndlessScene extends BaseScene {
    private _player: Player;
    private _background: Environment;
    private _corridor: Environment;
    private _enemies: Enemy[];
    private _spawnInterval: NodeJS.Timeout;
    private _score: Map<EnemyType, number>;

    constructor(stage: Container) {
        super(stage)
        this._enemies = [];
        this._score = new Map();

        this._background = new Environment([
            "frame_0.png",
            "frame_1.png",
            "frame_2.png",
            "frame_3.png",
            "frame_5.png",
            "frame_6.png",
            "frame_7.png"
        ], 4);

        this._corridor = new Environment("corridor", 2);
        this._corridor.y = 230;
        this._corridor.scale.set(0.7);

        this.addChild(this._background);
        this.addChild(this._corridor);

        this._background.startScrolling(0.6);
        this._corridor.startScrolling(1.2);

        this._player = new Player(this);

        this._player.on(GameEvent.PLAYER_DIED, () => {
            for (const key in EnemyType) {
                const type = EnemyType[key as keyof typeof EnemyType];
                const savedScore = retrieveScore("highScore")?.get(type) || 0;
                const currentScore = this._score.get(type) || 0;
                if (currentScore > savedScore) {
                    saveScore("highScore",this._score);
                }

                saveScore("currentScore", this._score);
            }

            this.emit(Scene.Change, Scene.EndGame);
        });

        this.addChild(this._player);

        this._spawnInterval = this.spawnEnemies();
        this.initTickerOperations();

        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                this.emit(Scene.Change, Scene.MainMenu);
            }
        });
    }

    public dispose(): void {
        clearInterval(this._spawnInterval);

        this.removeTickerOperations();

        this._enemies.forEach(function (enemy: Enemy) {
            enemy.dispose(true);
        }.bind(this));
        this._player.dispose();
        this._background.dispose();
        this._corridor.dispose();

        this.destroy({ children: true });
    }

    private spawnEnemies(): NodeJS.Timeout {
        return setInterval(() => {
            const numberOfEnemies = Math.floor(Math.random() * 3) + 1;

            for (let i = 0; i < numberOfEnemies; i++) {
                const y = Math.floor(Math.random() * (650 - 300 + 1)) + 300;
                const x = Math.floor(Math.random() * (2000 - gameConfig.width)) + gameConfig.width;
                const grunt = new Enemy(this._player, this, gruntConfig);
                grunt.x = x;
                grunt.y = y;
                this.addChild(grunt);
                this._enemies.push(grunt);
                grunt.on(GameEvent.PLAYER_HIT, () => this._player.takeDamage(grunt.damage));
            }
        }, 2000);
    }

    private checkForPlayerKills(): void {
        for (const pBullet of this._player.bullets) {
            for (const enemy of this._enemies) {
                if (enemy.isDead) {
                    continue;
                }

                if (!enemy.destroyed && pBullet.sprite.getBounds().intersects(enemy.getBounds())) {
                    enemy.kill();
                    this._player.bullets.splice(this._player.bullets.indexOf(pBullet), 1);
                    pBullet.sprite.destroy();
                    this.setKill(enemy);
                    return;
                }
            }
        }
    }

    private checkForEnemyPlayerCollision(): void {
        for (const enemy of this._enemies) {
            if (enemy.isDead) {
                continue;
            }

            if (enemy.getBounds().intersects(this._player.getBounds())) {
                this._player.takeDamage(enemy.meleeDamage);
                enemy.kill();
                this.setKill(enemy);
                return;
            }
        }
    }

    private checkIfEnemyOutOfBounds(): void {
        for (const enemy of this._enemies) {
            if (enemy.x + enemy.width <= 0) {
                enemy.dispose();
                this._enemies.splice(this._enemies.indexOf(enemy), 1);
                return;
            }
        }
    }


    private initTickerOperations(): void {
        Ticker.shared.add(this.checkForPlayerKills, this);
        Ticker.shared.add(this.checkIfEnemyOutOfBounds, this);
        Ticker.shared.add(this.checkForEnemyPlayerCollision, this);
    }

    private removeTickerOperations(): void {
        Ticker.shared.remove(this.checkForPlayerKills, this);
        Ticker.shared.remove(this.checkIfEnemyOutOfBounds, this);
        Ticker.shared.remove(this.checkForEnemyPlayerCollision, this);
    }

    private setKill(enemy: Enemy): void {
        if (!this._score.has(enemy.type)) {
            this._score.set(enemy.type, 1);
        } else {
            const currentValue = this._score.get(enemy.type) as number;
            this._score.set(enemy.type, currentValue + 1);
        }
    }
}

//auto moove player
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
