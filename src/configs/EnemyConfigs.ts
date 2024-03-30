import { Point } from "pixi.js";
import { IEnemyConfig } from "../characters/interfaces/IEnemyConfig";

export const gruntConfig: IEnemyConfig = {
    rateOfFireMs: 2400,
    speed: 0.85,
    characterTextures: {
        left: "grunt_left.png",
        down: "grunt_down.png",
        up: "grunt_up.png",
    },
    projectile: {
        speed: 5,
        texture: "bullet",
        anchor: new Point(0.5),
        scale: new Point(0.1, 0.1),
    }
}