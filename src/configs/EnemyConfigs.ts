import { Point } from "pixi.js";
import { IEnemyConfig } from "../characters/interfaces/IEnemyConfig";
import { DeathType } from "../enums/DeathType";
import { EnemyType } from "../enums/EnemyType";

export const gruntConfig: IEnemyConfig = {
    health: 2,
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
        startPosOffset: new Point(),
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

export const cacodemonConfig: IEnemyConfig = {
    health: 4,
    type: EnemyType.CACODEMON,
    rateOfFire: 300,
    damage: 3,
    meleeDamage: 4,
    speed: 0.85,
    characterTextures: {
        left: "cacodemon_idle_left.png",
        down: "cacodemon_idle_down.png",
        up: "cacodemon_idle_up.png",
    },
    projectile: {
        speed: 5,
        texture: "green_ball",
        anchor: new Point(0.5),
        scale: new Point(0.1, 0.1),
        startPosOffset: new Point(0, 30),
    },
    death: {
        types: new Map([
            [DeathType.SHOT, [
                "cacodemon_death_1.png",
                "cacodemon_death_2.png",
                "cacodemon_death_3.png",
                "cacodemon_death_4.png",
                "cacodemon_death_5.png",
            ]],
        ]),
        animationSpeed: 0.2,
        loop: false,
    }
}