import { Container } from "pixi.js";

export abstract class BaseScene extends Container {
    private _stage: Container;
    constructor(stage: Container) {
        super();
        this._stage = stage;
        stage.addChild(this);
    }

    public abstract dispose(): void;

    protected get stage() {
        return this._stage;
    }
}