import { Point } from "pixi.js";
import { PickUpType } from "../../enums/PickUpType";
import { ISpawnRange } from "./ISpawnRange";
import { ISoundConfig } from "./ISoundConfig";

export interface IPickUpConfig {
    scale: Point;
    pickUpSound: ISoundConfig;    
    type: PickUpType;
    amount: number;
    texture: string;
    spawnRange: ISpawnRange;
    speed: number;
}