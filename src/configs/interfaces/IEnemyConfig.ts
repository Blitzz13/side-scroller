import { Point } from "pixi.js";
import { EnemyType } from "../../enums/EnemyType";

export interface IEnemyConfig {
    health: number;
    type: EnemyType;
    speed: number;
    damage: number;
    meleeDamage: number;
    rateOfFire: number;
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
    death?: {
        animation: string[];
        animationSpeed: number;
        loop: boolean;
    }
}