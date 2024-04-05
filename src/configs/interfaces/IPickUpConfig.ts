import { Point } from "pixi.js";
import { PickUpType } from "../../enums/PickUpType";
import { ISpawnRange } from "./ISpawnRange";

export interface IPickUpConfig {
    scale: Point;
    type: PickUpType;
    amount: number;
    texture: string;
    spawnRange: ISpawnRange;
    speed: number;
}