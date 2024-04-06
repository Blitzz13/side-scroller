import { Point } from "pixi.js";
import { IEnemyConfig } from "./interfaces/IEnemyConfig";
import { EnemyType } from "../enums/EnemyType";
import { IEntitySoundConfig } from "./interfaces/IEntitySoundConfig";
import { IAnimationConfig } from "./interfaces/IAnimationConfig";

const walkersSoundConfig: IEntitySoundConfig = {
    deathSound: {
        src: "explosion_sound",
        loop: false,
        volume: 1
    },
    shootSounds: [
        {
            src: "blaster_1",
            loop: false,
            volume: 1
        },
        {
            src: "blaster_2",
            loop: false,
            volume: 1
        },
        {
            src: "blaster_3",
            loop: false,
            volume: 1
        },
        {
            src: "blaster_4",
            loop: false,
            volume: 1
        },
    ],
}

const atStConfig: IEnemyConfig = {
    faceTarget: true,
    health: 2,
    type: EnemyType.AT_ST,
    rateOfFire: 300,
    damage: 1,
    meleeDamage: 2,
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
        frames: [
            "at_st_death_1.png",
            "at_st_death_2.png",
            "at_st_death_3.png",
            "at_st_death_4.png",
            "at_st_death_5.png",
        ],
        speed: 0.2,
        loop: false,
        scale: new Point(1, 1),
        position: new Point(),
    },
    spawnRange: {
        min: new Point(1280, 650),
        max: new Point(2000, 650),
    },
    soundConfig: walkersSoundConfig
}

const atAtConfig: IEnemyConfig = {
    faceTarget: true,
    health: 8,
    type: EnemyType.AT_AT,
    rateOfFire: 500,
    damage: 4,
    meleeDamage: 6,
    speed: 2.16,
    characterTextures: {
        left: "at_at_left.png",
        down: "at_at_down.png",
        up: "at_at_up.png",
    },
    projectile: {
        speed: 12,
        texture: "laser",
        anchor: new Point(0.5),
        scale: new Point(0.4, 0.4),
        startPosOffset: new Point(-10, 8),
    },
    death: {
        frames: [
            "at_at_death_1.png",
            "at_at_death_2.png",
            "at_at_death_3.png",
            "at_at_death_4.png",
            "at_at_death_5.png",
            "at_at_death_6.png",
            "at_at_death_7.png",
            "at_at_death_8.png",
            "at_at_death_9.png",
            "at_at_death_10.png",
            "at_at_death_11.png",
            "at_at_death_12.png",
        ],
        speed: 0.2,
        loop: false,
        scale: new Point(1, 1),
        position: new Point(),
    },
    spawnRange: {
        min: new Point(1280, 610),
        max: new Point(2000, 610),
    },
    soundConfig: walkersSoundConfig,
}

const viperDroidConfig: IEnemyConfig = {
    type: EnemyType.VIPER_DROID,
    removeAfterDeath: true,
    health: 1,
    rateOfFire: 0,
    damage: 0,
    meleeDamage: 1,
    speed: 6,
    characterTextures: {
        left: "viper_droid_1.png",
        down: "viper_droid_1.png",
        up: "viper_droid_1.png",
    },
    spawnRange: {
        min: new Point(1280, 100),
        max: new Point(2000, 580),
    },
    soundConfig: {
        deathSound: {
            src: "explosion_sound",
            loop: false,
            volume: 1
        },
    },
    death: getExplosionConfig(),
}

function getExplosionConfig(): IAnimationConfig {
    const frames = [];
    for (let i = 0; i <= 16; i++) {
        const element = `explosion_${i.toString().padStart(2, "0")}.png`;
        frames.push(element);
    }

    return {
        frames: frames,
        loop: false,
        position: new Point(0, -10),
        scale: new Point(0.3, 0.3),
        speed: 0.4,
    };
}

export const enemyConfigs: IEnemyConfig[] = [
    atStConfig,
    viperDroidConfig,
    atAtConfig
]
