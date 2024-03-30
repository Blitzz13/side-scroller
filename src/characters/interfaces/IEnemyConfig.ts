import { Point } from "pixi.js";

export interface IEnemyConfig {
    speed: number;
    rateOfFireMs: number;
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
}