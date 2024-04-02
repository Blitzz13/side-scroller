import { Point } from "pixi.js";
import { IScoreBoardConfig } from "./interfaces/IScoreboardConfig";

export const commonScoreboardConfig: IScoreBoardConfig = {
    fontName: "arial32",
    radius: 12,
    textSpritegGap: 6,
    backgroundAlpha: 0.7,
    backgroundColor: 0x000000,
    scoreTextAnchor: new Point(1, 0),
    backgroundOffset: new Point(10, 0),
    backgroundLineStyles: {
        width: 2,
        color: 0x919191
    },
}