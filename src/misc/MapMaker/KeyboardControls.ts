import { Rectangle } from "pixi.js";
import { MapMaker } from "../../scenes/MapMaker";

export class KeyboardControls {
    private mapMaker: MapMaker;
    private SCROLL_SPEED = 20;
    private _shiftDown: boolean;
    private _ctrlDown: boolean;

    constructor(mapEditor: MapMaker) {
        this._shiftDown = false;
        this._ctrlDown = false;
        this.mapMaker = mapEditor;
        this.attachEventListeners();
    }

    public get shiftDown(): boolean {
        return this._shiftDown;
    }

    public get ctrlDown(): boolean {
        return this._ctrlDown;
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

        if (event.key === "Control") {
            this._ctrlDown = false;
        }
    };

    private onKeyDown = (event: KeyboardEvent) => {
        const currStage = this.mapMaker.currStage;
        const mapContainer = this.mapMaker.mapContainer;

        if (event.key === "Delete" && this.mapMaker.selectedMapAssets.size > 0) {
            this.mapMaker.selectedMapAssets.forEach((asset) => {
                mapContainer.removeChild(asset);
            });
        
            console.log(`Deleted ${this.mapMaker.selectedMapAssets.size} assets.`);
            
            // Clear selection after deleting
            this.mapMaker.selectedMapAssets.clear();
        }

        if (event.key === "Shift") {
            this._shiftDown = true;
        }

        if (event.key === "Control") {
            this._ctrlDown = true;
        }

        if (event.key === "Escape" && this.mapMaker.selectedMapAssets.size > 0) {
            this.mapMaker.selectedMapAssets.forEach((asset) => (asset.tint = 0xffffff));
            this.mapMaker.selectedMapAssets.clear();
            console.log("Deselected all assets.");
        }
        
        if (this.mapMaker.selectedMapAssets.size > 0) {
            // Move all selected assets
            this.mapMaker.selectedMapAssets.forEach((asset) => {
                if (event.key === "ArrowUp") asset.y -= this.SCROLL_SPEED;
                if (event.key === "ArrowDown") asset.y += this.SCROLL_SPEED;
                if (event.key === "ArrowLeft") asset.x -= this.SCROLL_SPEED;
                if (event.key === "ArrowRight") asset.x += this.SCROLL_SPEED;
            });
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
