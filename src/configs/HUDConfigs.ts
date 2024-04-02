import { Point } from "pixi.js";
import { IHUDConfig } from "./interfaces/IHUDConfig";
export const commonHudConfig: IHUDConfig = {
    distanceBetweenRows: 10,
    fontName: "arial32",
    iconPosition: new Point(10, 10),
    iconTextGap: new Point(6, 2),
    playerIconScale: new Point(0.4, 0.4),
    ammoIconScale: new Point(0.14, 0.14),
    scorePosition: new Point(1100, 0),
}