import { Container } from "pixi.js";

export abstract class BaseScene extends Container {
    private _stage: Container;
    private _scale: number;
    constructor(stage: Container, scale: number) {
        super();
        this._scale = scale;
        this._stage = stage;
        stage.addChild(this);
    }

    public abstract dispose(): void;

    protected get stage() {
        return this._stage;
    }

    public get appScale(): number {
        return this._scale;
    }

    public set appScale(asd: number) { 
        this._scale = asd;
    }
}