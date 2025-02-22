import { Container, Sprite, Rectangle, FederatedPointerEvent } from "pixi.js";
import { BaseScene } from "./BaseScene";
import { manifest } from "../configs/GameConfig";
import { Sidebar } from "../misc/MapMaker/Sidebar";
import { MapMakerEvent } from "../enums/MapMakerEvent";
import { KeyboardControls } from "../misc/MapMaker/KeyboardControls";

export class MapMaker extends BaseScene {
    private _assets: string[] = [];
    private _selectedAssetToPlace: Sprite | null = null;
    private _selectedMapAsset: Sprite | null = null;
    private _mapContainer: Container;
    private _uiContainer: Container;
    private _keyboradControls: KeyboardControls;
    private _sidebar!: Sidebar;
    private _isDragging: boolean = false;
    private _dragOffset = { x: 0, y: 0 };

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

    public get selectedMapAsset(): Sprite | null {
        return this._selectedMapAsset;
    }

    public set selectedMapAsset(value: Sprite | null) {
        this._selectedMapAsset = value;
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
        } else {
            // Select existing sprite if clicked
            this.selectExistingAsset(position.x, position.y);
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
            this.startDragging(event, sprite);
        });

        sprite.on("pointerup", () => this.stopDragging());
        sprite.on("pointerupoutside", () => this.stopDragging());
        sprite.on("pointermove", (event) => this.onDrag(event));

        this._mapContainer.addChild(sprite);
    }

    private selectExistingAsset(x: number, y: number) {
        const clickedSprite = this._mapContainer.children.find((child) => {
            if (child instanceof Sprite) {
                const bounds = child.getBounds();
                return (
                    x >= bounds.x &&
                    x <= bounds.x + bounds.width &&
                    y >= bounds.y &&
                    y <= bounds.y + bounds.height
                );
            }
            return false;
        }) as Sprite | undefined;

        if (clickedSprite) {
            if (this._selectedMapAsset !== null) {
                this._selectedMapAsset.tint = 0xffffff; // Reset previous selection tint
            }

            this._selectedMapAsset = clickedSprite;
            this._selectedMapAsset.tint = 0xff0000; // Tint the new selection
            this._sidebar.updateInspector(this._selectedMapAsset);
            console.log("Selected existing asset.");
        }
    }

    private startDragging(event: FederatedPointerEvent, sprite: Sprite) {
        this._isDragging = true;
        if (this._selectedMapAsset !== null) {
            this._selectedMapAsset.tint = 0xffffff; // Reset previous selection tint
        }

        this._selectedMapAsset = sprite;
        this._selectedMapAsset.tint = 0xff0000; // Tint the new selection
        sprite.alpha = 0.7; // Visual cue for dragging
        this._sidebar.updateInspector(this._selectedMapAsset);
        // Calculate the offset between the mouse and the sprite's position
        const position = event.data.getLocalPosition(this._mapContainer);
        this._dragOffset.x = sprite.x - position.x;
        this._dragOffset.y = sprite.y - position.y;

        // Start listening for movement on the mapContainer
        this._mapContainer.on("pointermove", this.onDrag, this);
    }

    private stopDragging() {
        if (!this._selectedMapAsset) {
            return;
        }

        this._isDragging = false;
        this._selectedMapAsset.alpha = 1;

        // Stop listening for movement
        this._mapContainer.off("pointermove", this.onDrag, this);

        // Snap to nearby assets
        this.snapToClosest(this._selectedMapAsset);
    }

    private onDrag(event: FederatedPointerEvent) {
        if (!this._isDragging || !this._selectedMapAsset) return;

        const newPosition = event.data.getLocalPosition(this._mapContainer);

        // Apply the offset so the sprite stays in place
        this._selectedMapAsset.x = newPosition.x + this._dragOffset.x;
        this._selectedMapAsset.y = newPosition.y + this._dragOffset.y;
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
