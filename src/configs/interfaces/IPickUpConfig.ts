import { Point } from "pixi.js";
import { PickUpType } from "@game/core-types";
import { ISpawnRange } from "./ISpawnRange";
import { ISoundConfig } from "@game/core-types";

export interface IPickUpConfig {
    scale: Point;
    pickUpSound: ISoundConfig;    
    type: PickUpType;
    amount: number;
    texture: string;
    spawnRange: ISpawnRange;
    speed: number;
}