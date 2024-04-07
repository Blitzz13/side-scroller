import { Point } from "pixi.js";
import { IAnimationConfig } from "./IAnimationConfig";
import { IEntitySoundConfig } from "./IEntitySoundConfig";

export interface IPlayerConfig {
    damage: number;
    timeBetweenShots: number;
    health: number;
    startingProjectilesNumber: number;
    moving: string;
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
    soundConfig: IEntitySoundConfig;
    deathAnimation: IAnimationConfig;
}