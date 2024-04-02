import { Point } from "pixi.js";
import { IAnimationConfig } from "./IAnimationConfig";

export interface IPlayerConfig {
    timeBetweenShots: number;
    health: number;
    startingProjectilesNumber: number;
    moving: string | IAnimationConfig;
    icon: string;
    movementSpeed: number;
    canShoot: boolean;
    spawnCoords: Point;
    playerScale: Point;
    projectileVelocity: Point;
    projectileSpawnOffset: Point;
    projectileGravity: number; 
    projectile: string;
    projectileScale: Point;
    playerMaxBoundaries: Point;
    playerMinBoundaries: Point;
    deathAnimation?: IAnimationConfig;
}