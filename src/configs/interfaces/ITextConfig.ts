import { IBitmapTextStyle, Point } from "pixi.js";

export interface ITextConfig {
    textConfig: Partial<IBitmapTextStyle>;
    position: Point;
    anchor: Point;
}