import { Point } from "pixi.js";

export interface IAnimationConfig {
    loop: boolean;
    frames: string[]
    scale: Point;
    speed: number;
    position: Point;
}