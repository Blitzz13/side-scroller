import { Point } from "pixi.js";
import { DeathType } from "../../DeathType";

export interface IEnemyConfig {
    speed: number;
    damage: number;
    meleeDamage: number;
    rateOfFire: number;
    characterTextures: {
        up: string;
        down: string;
        left: string;
    }
    projectile: {
        speed: number;
        texture: string;
        scale: Point;
        anchor: Point;
    };
    death?: {
        types: Map<DeathType, string[]>;
        animationSpeed: number;
        loop: boolean;
    }
}