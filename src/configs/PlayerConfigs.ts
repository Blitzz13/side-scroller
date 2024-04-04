import { Point } from "pixi.js";
import { IPlayerConfig } from "../configs/interfaces/IPlayerConfig";
import { gameConfig } from "./GameConfig";

export const xWingConfig: IPlayerConfig = {
    damage: 1,
    timeBetweenShots: 10,
    moving: "x_wing",
    icon: "x_wing",
    startingProjectilesNumber: 6,
    canShoot: true,
    health: 8,
    movementSpeed: 8,
    projectile: "green_ball",
    projectileVelocity: new Point(1, 0),
    projectileSpawnOffset: new Point(30, 14),
    projectileScale: new Point(0.1, 0.1),
    projectileGravity: 0.5,
    spawnCoords: new Point(20, gameConfig.height / 2),
    playerScale: new Point(0.8, 0.8),
    playerMaxBoundaries: new Point(gameConfig.width, 580),
    playerMinBoundaries: new Point(0, 100),
}

export const yWingConfig: IPlayerConfig = {
    damage: 1,
    timeBetweenShots: 10,
    startingProjectilesNumber: 15,
    canShoot: true,
    health: 15,
    movementSpeed: 5,
    projectile: "green_ball",
    moving: "y_wing",
    icon: "y_wing",
    projectileSpawnOffset: new Point(30, 14),
    projectileVelocity: new Point(1, 0),
    projectileScale: new Point(0.1, 0.1),
    projectileGravity: 0.5,
    spawnCoords: new Point(20, gameConfig.height / 2),
    playerScale: new Point(0.8, 0.8),
    playerMaxBoundaries: new Point(gameConfig.width, 580),
    playerMinBoundaries: new Point(0, 100),
}