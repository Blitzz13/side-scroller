import { Point } from "pixi.js";
import { IEnemyConfig } from "../characters/interfaces/IEnemyConfig";
import { DeathType } from "../enums/DeathType";
import { EnemyType } from "../enums/EnemyType";

export const gruntConfig: IEnemyConfig = {
    type: EnemyType.GRUNT,
    rateOfFire: 100,
    damage: 1,
    meleeDamage: 3,
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
    },
    death: {
        types: new Map([
            [DeathType.SHOT, [
                "grunt_death_1.png",
                "grunt_death_2.png",
                "grunt_death_3.png",
                "grunt_death_4.png",
                "grunt_death_5.png",
            ]],
        ]),
        animationSpeed: 0.2,
        loop: false,
    }
}