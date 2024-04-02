import { Point } from "pixi.js";
import { IEnemyConfig } from "./interfaces/IEnemyConfig";
import { EnemyType } from "../enums/EnemyType";


export const atStConfig: IEnemyConfig = {
    health: 1,
    type: EnemyType.AT_ST,
    rateOfFire: 300,
    damage: 1,
    meleeDamage: 1,
    speed: 2.16,
    characterTextures: {
        left: "at_st_left.png",
        down: "at_st_down.png",
        up: "at_st_up.png",
    },
    projectile: {
        speed: 8,
        texture: "laser",
        anchor: new Point(0.5),
        scale: new Point(0.2, 0.2),
        startPosOffset: new Point(-10, -5),
    },
    death: {
        animation: [
            "at_st_death_1.png",
            "at_st_death_2.png",
            "at_st_death_3.png",
            "at_st_death_4.png",
            "at_st_death_5.png",
        ],
        animationSpeed: 0.1,
        loop: false,
    }
}