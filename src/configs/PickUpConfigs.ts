import { Point } from "pixi.js";
import { PickUpType } from "../enums/PickUpType";
import { IPickUpConfig } from "./interfaces/IPickUpConfig";

const ammo: IPickUpConfig = {
    scale: new Point(0.2, 0.2),
    type: PickUpType.AMMO,
    amount: 3,
    speed: 4,
    texture: "ammo",
    spawnRange: {
        min: new Point(1280, 100),
        max: new Point(2000, 580),
    }
}

const health: IPickUpConfig = {
    scale: new Point(0.09, 0.09),
    type: PickUpType.HEALTH,
    amount: 2,
    speed: 4,
    texture: "health",
    spawnRange: {
        min: new Point(1280, 100),
        max: new Point(2000, 580),
    }
}

export const pickUps: IPickUpConfig[] = [
    ammo,
    health
];