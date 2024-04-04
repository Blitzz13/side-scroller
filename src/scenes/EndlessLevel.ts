import { Container, Rectangle, Ticker } from "pixi.js";
import { Player } from "../characters/Player";
import { Enemy } from "../characters/Enemy";
import { atStConfig, viperDroidConfig } from "../configs/EnemyConfigs";
import { Environment } from "../misc/Environment";
import { gameConfig } from "../configs/GameConfig";
import { BaseScene } from "./BaseScene";
import { GameEvent } from "../enums/GameEvent";
import { Scene } from "../enums/Scene";
import { EnemyType } from "../enums/EnemyType";
import { HUD } from "../ui/HUD";
import { saveScore, retrieveScore } from "../Utils";
import { InGameMenu } from "../ui/InGameMenu";
import { yWingConfig } from "../configs/PlayerConfigs";
import { commonHudConfig } from "../configs/HUDConfigs";

export class EndlessLevel extends BaseScene {
    private _player: Player;
    private _corridor: Environment;
    private _enemies: Enemy[];
    private _spawnInterval: NodeJS.Timeout;
    private _score: Map<EnemyType, number>;
    private _hud: HUD;
    private _inGameMenu: InGameMenu;
    private _isPaused: boolean;
    private _gameContainer: Container;
    private _keyboardHandler = this.handleKeyboardEvents.bind(this);
    constructor(stage: Container, scale: number) {
        super(stage, scale)
        this._enemies = [];
        this._isPaused = false;
        this._score = new Map();
        this._hud = new HUD(yWingConfig.icon, yWingConfig.projectile, commonHudConfig);
        this._gameContainer = new Container();
        this._inGameMenu = new InGameMenu();
        this._player = new Player(this._gameContainer, yWingConfig);
        this._player.on(GameEvent.PLAYER_SHOT, () => {
            this._hud.ammo = this._player.ammo;
        });

        this._corridor = new Environment("outdoors_area", 3);

        this._hud.ammo = this._player.ammo;
        this._corridor.y = 0;
        this._corridor.scale.set(0.75);
        this._corridor.startScrolling(2.9);
        this._hud.health = this._player.health;
        this._spawnInterval = this.spawnEnemies();
        this.initTickerOperations();

        this._gameContainer.addChild(this._player);

        this.addChild(this._corridor);
        this.addChild(this._gameContainer);
        this.addChild(this._hud);
        this.addChild(this._inGameMenu);
        this.addEvents();
    }

    public dispose(): void {
        clearInterval(this._spawnInterval);
        this.removeTickerOperations();

        this._enemies.forEach(function (enemy: Enemy) {
            enemy.dispose(true);
        }.bind(this));

        this._player.dispose();
        this._corridor.dispose();
        this._hud.dispose();
        this._inGameMenu.dispose();
        window.removeEventListener("keydown", this._keyboardHandler);
        this.destroy({ children: true });
    }

    private spawnEnemies(): NodeJS.Timeout {
        return setInterval(() => {
            const numberOfEnemies = Math.floor(Math.random() * 1) + 1;

            for (let i = 0; i < numberOfEnemies; i++) {
                const y = 650;
                const x = Math.floor(Math.random() * (2000 - gameConfig.width)) + gameConfig.width;
                let enemy: Enemy;
                const num = Math.floor(Math.random() * 2) + 1;

                if (num === 1) {
                    enemy = new Enemy(this._player, this._gameContainer, atStConfig);
                    enemy.y = y;
                } else {
                    enemy = new Enemy(this._player, this._gameContainer, viperDroidConfig);
                    enemy.y = Math.floor(Math.random() * 501);
                }

                enemy.x = x;

                this._gameContainer.addChild(enemy);
                this._enemies.push(enemy);

                enemy.on(GameEvent.PLAYER_HIT, () => {
                    this._hud.health = this._player.takeDamage(enemy.damage)
                });
            }
        }, 2000);
    }

    private handleKeyboardEvents(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            this.handlePauseGame();
        }
    }

    private checkForPlayerKills(): void {
        for (const pBullet of this._player.bullets) {
            for (const enemy of this._enemies) {
                if (enemy.isDead) {
                    continue;
                }

                // Fixes an issue with getBounds when scaling the stage
                const bulletBounds = new Rectangle(
                    pBullet.sprite.x * this.appScale,
                    pBullet.sprite.y * this.appScale,
                    pBullet.sprite.width * this.appScale,
                    pBullet.sprite.height * this.appScale);

                if (!enemy.destroyed && bulletBounds.intersects(enemy.getBounds())) {
                    enemy.takeDamage(this._player.damage);
                    this._player.bullets.splice(this._player.bullets.indexOf(pBullet), 1);
                    pBullet.sprite.destroy();

                    if (enemy.isDead) {
                        this.setKill(enemy);
                    }
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
                this._hud.health = this._player.takeDamage(enemy.meleeDamage);
                enemy.takeDamage(1);
                if (enemy.isDead) {
                    this.setKill(enemy);
                }
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

        this._hud.updateKills(enemy.type, this._score.get(enemy.type) || 0);
    }

    private handlePauseGame(): void {
        this._isPaused = !this._isPaused;
        this._inGameMenu.visible = this._isPaused;
        Ticker.shared.speed = this._isPaused ? 0 : 1;
        if (this._isPaused) {
            clearInterval(this._spawnInterval);
        } else {
            this._spawnInterval = this.spawnEnemies();
        }
    }

    private addEvents(): void {
        this._inGameMenu.on(GameEvent.QUIT_GAME, () => {
            this.emit(Scene.Change, Scene.MainMenu);
            Ticker.shared.speed = 1;
        });

        this._inGameMenu.on(GameEvent.RESUME_GAME, this.handlePauseGame, this);

        this._player.on(GameEvent.PLAYER_DIED, this.setScore, this);

        window.addEventListener("keydown", this._keyboardHandler);
    }

    private setScore(): void {
        for (const key in EnemyType) {
            const type = EnemyType[key as keyof typeof EnemyType];
            const savedScore = retrieveScore("highScore")?.get(type) || 0;
            const currentScore = this._score.get(type) || 0;
            if (currentScore > savedScore) {
                saveScore("highScore", this._score);
            }

            saveScore("currentScore", this._score);
        }

        for (const enemy of this._enemies) {
            enemy.isMoving = false;
        }

        this._corridor.startScrolling(0);
        setTimeout(() => this.emit(Scene.Change, Scene.EndGame), 1500);
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
