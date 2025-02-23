import { Container, Sprite, Rectangle, FederatedPointerEvent } from "pixi.js";
import { BaseScene } from "./BaseScene";
import { manifest } from "../configs/GameConfig";
import { Sidebar } from "../misc/MapMaker/Sidebar";
import { MapMakerEvent } from "../enums/MapMakerEvent";
import { KeyboardControls } from "../misc/MapMaker/KeyboardControls";

export class MapMaker extends BaseScene {
    private _assets: string[] = [];
    private _selectedAssetToPlace: Sprite | null = null;
    private _selectedMapAssets: Set<Sprite> = new Set();
    private _mapContainer: Container;
    private _uiContainer: Container;
    private _keyboradControls: KeyboardControls;
    private _sidebar!: Sidebar;
    private _isDragging: boolean = false;
    private _dragOffsets: Map<Sprite, { x: number; y: number }> = new Map();

    constructor(stage: Container, scale: number) {
        super(stage, scale);

        this._mapContainer = new Container();
        this._mapContainer.name = "MapContainer";
        this._mapContainer.hitArea = new Rectangle(0, 0, 2000, 2000);
        this._uiContainer = new Container();
        this._keyboradControls = new KeyboardControls(this);
        this.stage.addChild(this._mapContainer);
        this.stage.addChild(this._uiContainer);

        this.loadAssets();
        this.setupInteraction();
    }

    public get currStage(): Container {
        return this.stage;
    }

    public get mapContainer(): Container {
        return this._mapContainer;
    }

    public get selectedMapAssets(): Set<Sprite> {
        return this._selectedMapAssets;
    }

    public set selectedMapAssets(value: Set<Sprite>) {
        this._selectedMapAssets = value;
    }

    private loadAssets() {
        const envAssets = manifest.bundles.find(
            (bundle) => bundle.name === "environment",
        );

        if (envAssets && Array.isArray(envAssets.assets)) {
            this._assets = envAssets.assets
                .map((asset) =>
                    typeof asset === "object" && "name" in asset
                        ? asset.name
                        : null,
                )
                .filter((name) => name !== null) as string[];

            this._sidebar = new Sidebar(this._assets);
            this._sidebar.on(
                MapMakerEvent.SELECTED_SPRITE,
                (selectedAsset: Sprite) => {
                    this._selectedAssetToPlace = selectedAsset;
                },
            );

            this._sidebar.on(
                MapMakerEvent.EXPORT_BUTTON_CLICKED,
                (selectedAsset: Sprite) => {
                    this.exportMap();
                },
            );

            this.stage.addChild(this._sidebar);
        } else {
            console.warn("No environment assets found in manifest.");
        }
    }

    private setupInteraction() {
        this._mapContainer.interactive = true;
        this._mapContainer.on("pointerdown", (event: FederatedPointerEvent) => {
            if (!this._isDragging) {
                // Prevent placing assets while dragging
                this.onMapClick(event);
            }
        });
    }

    private onMapClick(event: FederatedPointerEvent) {
        const position = event.data.getLocalPosition(this._mapContainer);

        // If an asset is selected, place it on the map
        if (this._selectedAssetToPlace) {
            this.addAssetToMap(position.x, position.y);
        }
    }

    private addAssetToMap(x: number, y: number) {
        if (!this._selectedAssetToPlace) {
            return;
        }

        const sprite = Sprite.from(this._selectedAssetToPlace.texture);
        sprite.scale.set(0.2);
        sprite.x = x;
        sprite.y = y;
        sprite.interactive = true;
        sprite.cursor = "pointer";

        // Stop propagation to prevent map click from triggering
        sprite.on("pointerdown", (event) => {
            event.stopPropagation(); // Prevent the map from handling this click
            this.onExistingAssetDown(sprite);
            this.startDragging(event);
        });

        sprite.on("pointerup", () => this.stopDragging());
        sprite.on("pointerupoutside", () => this.stopDragging());
        sprite.on("pointermove", (event) => this.onDrag(event));

        this._mapContainer.addChild(sprite);
    }

    private startDragging(event: FederatedPointerEvent) {
        this._isDragging = true;

        const position = event.data.getLocalPosition(this._mapContainer);

        // Store offsets for all selected assets
        this._dragOffsets.clear();
        this._selectedMapAssets.forEach((asset) => {
            this._dragOffsets.set(asset, {
                x: asset.x - position.x,
                y: asset.y - position.y,
            });
            asset.tint = 0xff0000; // Highlight selection
            asset.alpha = 0.7; // Visual cue for dragging
        });

        this._mapContainer.on("pointermove", this.onDrag, this);
    }

    private stopDragging() {
        if (!this._isDragging) {
            return;
        }

        this._isDragging = false;

        if (this._selectedMapAssets.size === 1) {
            const asset = this._selectedMapAssets.values().next().value;
            if (asset) {
                this.snapToClosest(asset);
            }
        }

        this._selectedMapAssets.forEach((asset) => {
            asset.alpha = 1;
        });

        this._mapContainer.off("pointermove", this.onDrag, this);
        this._dragOffsets.clear();
    }

    private onDrag(event: FederatedPointerEvent) {
        if (!this._isDragging) {
            return;
        }

        const newPosition = event.data.getLocalPosition(this._mapContainer);

        this._selectedMapAssets.forEach((asset) => {
            const offset = this._dragOffsets.get(asset);
            if (offset) {
                asset.x = newPosition.x + offset.x;
                asset.y = newPosition.y + offset.y;
            }
        });
    }

    private onExistingAssetDown(sprite: Sprite): void {
        if (this._keyboradControls.ctrlDown) {
            // Toggle selection: deselect if selected, otherwise add
            if (this._selectedMapAssets.has(sprite)) {
                sprite.tint = 0xffffff; // Reset tint
                this._selectedMapAssets.delete(sprite);
            } else {
                this._selectedMapAssets.add(sprite);
                sprite.tint = 0xff0000; // Highlight selection
            }

            return;
        } else if (!this._selectedMapAssets.has(sprite)) {
            // If Ctrl is NOT held and sprite is NOT already selected, select only this sprite
            this._selectedMapAssets.forEach(asset => asset.tint = 0xffffff);
            this._selectedMapAssets.clear();
            this._selectedMapAssets.add(sprite);
            sprite.tint = 0xff0000;
            return;
        }
    
        // if (!this._isDragging) {
        //     sprite.once("pointerup",() => {
        //         this._selectedMapAssets.forEach(asset => {
        //             if (asset !== sprite) {
        //                 asset.tint = 0xffffff; // Reset tint for others
        //             }
        //         });
            
        //         this._selectedMapAssets.clear();
        //         this._selectedMapAssets.add(sprite);
        //     });
        // }
    }
    

    private snapToClosest(sprite: Sprite) {
        const SNAP_THRESHOLD = 10; // Pixels for snapping
        let closest: Sprite | null = null;
        let minDistance = SNAP_THRESHOLD;

        for (const child of this._mapContainer.children) {
            if (child === sprite || !(child instanceof Sprite)) {
                continue;
            }

            const dx = Math.abs(sprite.x - child.x);
            const dy = Math.abs(sprite.y - child.y);

            // Check if it's close enough to snap
            if (dx < minDistance || dy < minDistance) {
                closest = child as Sprite;
                minDistance = Math.min(dx, dy);
            }
        }

        if (closest) {
            // Snap the sprite to the closest edge
            if (Math.abs(sprite.x - closest.x) < SNAP_THRESHOLD) {
                sprite.x = closest.x; // snaps to the left of the asset
            }
            if (
                Math.abs(sprite.y - closest.y + closest.height) < SNAP_THRESHOLD
            ) {
                sprite.y = closest.y - closest.height; // snaps right above the asset
            }
            if (
                Math.abs(sprite.y - closest.y - closest.height) < SNAP_THRESHOLD
            ) {
                sprite.y = closest.y + closest.height; // snaps right bellow the asset
            }
            console.log("Snapped to closest asset.");
        }
    }

    private exportMap() {
        const exportData = this._mapContainer.children.map((child) => ({
            name: (child as Sprite).texture.textureCacheIds[0],
            x: child.x,
            y: child.y,
            scale: child.scale.x,
        }));

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "map_data.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    public dispose(): void {
        this._mapContainer.removeChildren();
        this._uiContainer.removeChildren();
        this._keyboradControls.dispose();
    }
}
