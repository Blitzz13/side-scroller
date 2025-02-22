import { Rectangle } from "pixi.js";
import { MapMaker } from "../../scenes/MapMaker";

export class KeyboardControls {
    private mapMaker: MapMaker;
    private SCROLL_SPEED = 20;
    private _shiftDown: boolean;

    constructor(mapEditor: MapMaker) {
        this._shiftDown = false;
        this.mapMaker = mapEditor;
        this.attachEventListeners();
    }

    public get shiftDown(): boolean {
        return this._shiftDown;
    }

    public dispose() {
        window.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("keyup", this.onKeyUp);
    }

    private attachEventListeners() {
        window.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("keyup", this.onKeyUp);
    }

    private onKeyUp = (event: KeyboardEvent) => {
        if (event.key === "Shift") {
            this._shiftDown = false;
        }
    };

    private onKeyDown = (event: KeyboardEvent) => {
        const currStage = this.mapMaker.currStage;
        const selectedMapAsset = this.mapMaker.selectedMapAsset;
        const mapContainer = this.mapMaker.mapContainer;

        if (event.key === "Delete" && selectedMapAsset) {
            mapContainer.removeChild(selectedMapAsset);
            console.log("Deleted selected asset.");
            this.mapMaker.selectedMapAsset = null;
        }

        if (event.key === "Shift") {
            this._shiftDown = true;
        }

        if (event.key === "Escape" && selectedMapAsset) {
            selectedMapAsset.tint = 0xffffff;
            this.mapMaker.selectedMapAsset = null;
        }

        if (selectedMapAsset) {
            // Move the selected asset instead of the map
            if (event.key === "ArrowUp")
                selectedMapAsset.y -= this.SCROLL_SPEED;
            if (event.key === "ArrowDown")
                selectedMapAsset.y += this.SCROLL_SPEED;
            if (event.key === "ArrowLeft")
                selectedMapAsset.x -= this.SCROLL_SPEED;
            if (event.key === "ArrowRight")
                selectedMapAsset.x += this.SCROLL_SPEED;
        } else {
            // Move the mapContainer when nothing is selected
            let newX = mapContainer.x;
            let newY = mapContainer.y;

            if (event.key === "ArrowUp") newY += this.SCROLL_SPEED;
            if (event.key === "ArrowDown") newY -= this.SCROLL_SPEED;
            if (event.key === "ArrowLeft") newX += this.SCROLL_SPEED;
            if (event.key === "ArrowRight") newX -= this.SCROLL_SPEED;

            // Constrain scrolling within the hitArea
            const hitArea = mapContainer.hitArea as Rectangle;
            const maxX = 0;
            const maxY = 0;
            const minX = -hitArea.width + currStage.width;
            const minY = -hitArea.height + currStage.height;

            mapContainer.x = Math.min(maxX, Math.max(minX, newX));
            mapContainer.y = Math.min(maxY, Math.max(minY, newY));
        }
    };
}
