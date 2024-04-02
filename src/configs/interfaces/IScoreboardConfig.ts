import { ILineStyleOptions, Point, Rectangle, RoundedRectangle } from "pixi.js";

export interface IScoreBoardConfig {
    fontName: string;
    scoreTextAnchor: Point;
    backgroundColor: number;
    backgroundAlpha: number;
    backgroundLineStyles: ILineStyleOptions;
    backgroundOffset: Point;
    textSpritegGap: number;
    radius: number;
    backgroundSize?: Rectangle;
}