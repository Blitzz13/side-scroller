import { Point } from "pixi.js";

export interface IHUDConfig {
    distanceBetweenRows: number;
    ammoIconScale: Point;
    playerIconScale: Point;
    scorePosition: Point;
    iconPosition: Point;
    fontName: string;
    iconTextGap: Point;
}