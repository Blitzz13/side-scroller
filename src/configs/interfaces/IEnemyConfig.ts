import { Point } from "pixi.js";
import { EnemyType } from "@game/core-types";
import { ISpawnRange } from "./ISpawnRange";
import { IEntitySoundConfig } from "@game/core-types";
import { IAnimationConfig } from "./IAnimationConfig";

export interface IEnemyConfig {
    health: number;
    type: EnemyType;
    speed: number;
    damage: number;
    meleeDamage: number;
    rateOfFire: number;
    spawnRange: ISpawnRange;
    soundConfig: IEntitySoundConfig;
    characterTextures: {
        up: string;
        down: string;
        left: string;
    }
    faceTarget?: boolean;
    projectile?: {
        speed: number;
        texture: string;
        scale: Point;
        anchor: Point;
        startPosOffset: Point;
    };
    death: IAnimationConfig;
    removeAfterDeath?: boolean;
}