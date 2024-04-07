import { Container, Rectangle, Ticker } from "pixi.js";
import { Player } from "../characters/Player";
import { Enemy } from "../characters/Enemy";
import { enemyConfigs } from "../configs/EnemyConfigs";
import { Environment } from "../misc/Environment";
import { BaseScene } from "./BaseScene";
import { GameEvent } from "../enums/GameEvent";
import { Scene } from "../enums/Scene";
import { EnemyType } from "../enums/EnemyType";
import { HUD } from "../ui/HUD";
import { saveScore, retrieveScore, getRandomInt } from "../Utils";
import { InGameMenu } from "../ui/InGameMenu";
import { commonHudConfig } from "../configs/HUDConfigs";
import { PickUp } from "../misc/PickUp";
import { PickUpType } from "../enums/PickUpType";
import { pickUps } from "../configs/PickUpConfigs";
import { sound } from "@pixi/sound";
import { IPlayerConfig } from "../configs/interfaces/IPlayerConfig";

export class EndlessLevel extends BaseScene {
    private _player: Player;
    private _corridor: Environment;
    private _enemies: Enemy[];
    private _pickUps: PickUp[];
    private _enemySpawnInterval: NodeJS.Timeout;
    private _pickUpSpawnInterval: NodeJS.Timeout;
    private _score: Map<EnemyType, number>;
    private _hud: HUD;
    private _inGameMenu: InGameMenu;
    private _isPaused: boolean;
    private _gameContainer: Container;
    private _keyboardHandler = this.handleKeyboardEvents.bind(this);

    constructor(stage: Container, scale: number, shipConfig: IPlayerConfig) {
        super(stage, scale)
        this._enemies = [];
        this._pickUps = [];
        this._isPaused = false;
        this._score = new Map();
        this._hud = new HUD(shipConfig.icon, shipConfig.projectile, commonHudConfig);
        this._gameContainer = new Container();
        this._inGameMenu = new InGameMenu();
        this._player = new Player(this._gameContainer, shipConfig);
        this._player.on(GameEvent.PLAYER_SHOT, () => {
            this._hud.ammo = this._player.ammo;
        });

        this._corridor = new Environment("outdoors_area", 3);

        this._hud.ammo = this._player.ammo;
        this._corridor.y = 0;
        this._corridor.scale.set(0.75);
        this._corridor.startScrolling(2.9);
        this._hud.health = this._player.health;
        this._enemySpawnInterval = this.spawnEnemies();
        this._pickUpSpawnInterval = this.spawnPickUps();
        this.initTickerOperations();

        this._gameContainer.addChild(this._player);

        this.addChild(this._corridor);
        this.addChild(this._gameContainer);
        this.addChild(this._hud);
        this.addChild(this._inGameMenu);
        sound.play("battle_theme", { loop: true });
        this.addEvents();
    }

    public dispose(): void {
        sound.stopAll();
        clearInterval(this._enemySpawnInterval);
        clearInterval(this._pickUpSpawnInterval);
        this.removeTickerOperations();

        this._enemies.forEach(function (enemy: Enemy) {
            enemy.dispose(true);
        }.bind(this));

        this._pickUps.forEach(function (pickUp: PickUp) {
            pickUp.dispose();
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
            const numberOfEnemies = getRandomInt(1, 3);

            for (let i = 0; i < numberOfEnemies; i++) {
                const enemyId = Math.floor(Math.random() * enemyConfigs.length);
                let enemy: Enemy = new Enemy(this._player, this._gameContainer, enemyConfigs[enemyId]);

                enemy.x = getRandomInt(enemy.spawnRange.min.x, enemy.spawnRange.max.x);
                enemy.y = getRandomInt(enemy.spawnRange.min.y, enemy.spawnRange.max.y);

                this._gameContainer.addChild(enemy);
                this._enemies.push(enemy);

                enemy.on(GameEvent.PLAYER_HIT, () => {
                    this._hud.health = this._player.takeDamage(enemy.damage)
                });
            }
        }, getRandomInt(2000, 4000));
    }

    private spawnPickUps(): NodeJS.Timeout {
        return setInterval(() => {
            const pickUpIndex = getRandomInt(0, pickUps.length);
            const pickUp = new PickUp(pickUps[pickUpIndex]);

            pickUp.x = getRandomInt(pickUp.spawnRange.min.x, pickUp.spawnRange.max.x);
            pickUp.y = getRandomInt(pickUp.spawnRange.min.y, pickUp.spawnRange.max.y);

            this._pickUps.push(pickUp);

            this._gameContainer.addChild(pickUp);
        }, getRandomInt(10000, 20000));
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
                enemy.takeDamage(this._player.damage);
                if (enemy.isDead) {
                    this.setKill(enemy);
                }
                return;
            }
        }
    }

    private checkForPickUp(): void {
        for (const pickUp of this._pickUps) {
            if (pickUp.getBounds().intersects(this._player.getBounds())) {
                switch (pickUp.type) {
                    case PickUpType.AMMO:
                        this._player.ammo += pickUp.pickUp();
                        this._hud.ammo = this._player.ammo;
                        break;
                    case PickUpType.HEALTH:
                        this._hud.health = this._player.heal(pickUp.pickUp());
                    default:
                        break;
                }

                const pickUpSound = pickUp.sound;

                sound.play(pickUpSound.src, {
                    loop: pickUpSound.loop,
                    volume: pickUpSound.volume
                });
                
                this._pickUps.splice(this._pickUps.indexOf(pickUp), 1);
                pickUp.dispose();
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

    private checkIfPickUpIsOutOfBounds(): void {
        for (const pickUp of this._pickUps) {
            if (pickUp.x + pickUp.width <= 0) {
                pickUp.dispose();
                this._pickUps.splice(this._pickUps.indexOf(pickUp), 1);
                return;
            }
        }
    }


    private initTickerOperations(): void {
        Ticker.shared.add(this.checkForPlayerKills, this);
        Ticker.shared.add(this.checkIfEnemyOutOfBounds, this);
        Ticker.shared.add(this.checkForEnemyPlayerCollision, this);
        Ticker.shared.add(this.checkForPickUp, this);
        Ticker.shared.add(this.checkIfPickUpIsOutOfBounds, this);
    }

    private removeTickerOperations(): void {
        Ticker.shared.remove(this.checkForPlayerKills, this);
        Ticker.shared.remove(this.checkIfEnemyOutOfBounds, this);
        Ticker.shared.remove(this.checkForEnemyPlayerCollision, this);
        Ticker.shared.remove(this.checkForPickUp, this);
        Ticker.shared.remove(this.checkIfPickUpIsOutOfBounds, this);
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
            clearInterval(this._enemySpawnInterval);
            clearInterval(this._pickUpSpawnInterval);
        } else {
            this._enemySpawnInterval = this.spawnEnemies();
            this._pickUpSpawnInterval = this.spawnPickUps();
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

        for (const pickUp of this._pickUps) {
            pickUp.isMoving = false;
        }

        this._corridor.startScrolling(0);
        setTimeout(() => this.emit(Scene.Change, Scene.EndGame), 1500);
    }
}
