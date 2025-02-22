import { Container, Sprite, Rectangle, FederatedPointerEvent } from "pixi.js";
import { BaseScene } from "./BaseScene";
import { manifest } from "../configs/GameConfig";
import { Sidebar } from "../misc/MapMaker/Sidebar";
import { MapMakerEvent } from "../enums/MapMakerEvent";

export class MapEditor extends BaseScene {
    private assets: string[] = [];
    private selectedAssetToPlace: Sprite | null = null;
    private selectedMapAsset: Sprite | null = null;
    private mapContainer: Container;
    private uiContainer: Container;
    private sidebar!: Sidebar;
    private isDragging: boolean = false;
    private dragOffset = { x: 0, y: 0 };
    private SCROLL_SPEED = 20;

    constructor(stage: Container, scale: number) {
        super(stage, scale);

        this.mapContainer = new Container();
        this.mapContainer.name = "MapContainer";
        this.mapContainer.hitArea = new Rectangle(0, 0, 2000, 2000);
        this.uiContainer = new Container();
        this.stage.addChild(this.mapContainer);
        this.stage.addChild(this.uiContainer);

        this.loadAssets();
        this.setupInteraction();

        // Listen for keypress events (for deletion)
        window.addEventListener("keydown", (e) => this.attachControls(e));
    }

    private loadAssets() {
        const envAssets = manifest.bundles.find(
            (bundle) => bundle.name === "environment",
        );

        if (envAssets && Array.isArray(envAssets.assets)) {
            this.assets = envAssets.assets
                .map((asset) =>
                    typeof asset === "object" && "name" in asset
                        ? asset.name
                        : null,
                )
                .filter((name) => name !== null) as string[];

            this.sidebar = new Sidebar(this.assets);
            this.sidebar.on(
                MapMakerEvent.SELECTED_SPRITE,
                (selectedAsset: Sprite) => {
                    this.selectedAssetToPlace = selectedAsset;
                },
            );

            this.sidebar.on(
                MapMakerEvent.EXPORT_BUTTON_CLICKED,
                (selectedAsset: Sprite) => {
                    this.exportMap();
                },
            );

            this.stage.addChild(this.sidebar);
        } else {
            console.warn("No environment assets found in manifest.");
        }
    }

    private setupInteraction() {
        this.mapContainer.interactive = true;
        this.mapContainer.on("pointerdown", (event: FederatedPointerEvent) => {
            if (!this.isDragging) {
                // Prevent placing assets while dragging
                this.onMapClick(event);
            }
        });
    }

    private onMapClick(event: FederatedPointerEvent) {
        const position = event.data.getLocalPosition(this.mapContainer);

        // If an asset is selected, place it on the map
        if (this.selectedAssetToPlace) {
            this.addAssetToMap(position.x, position.y);
        } else {
            // Select existing sprite if clicked
            this.selectExistingAsset(position.x, position.y);
        }
    }

    private addAssetToMap(x: number, y: number) {
        if (!this.selectedAssetToPlace) {
            return;
        }

        const sprite = Sprite.from(this.selectedAssetToPlace.texture);
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

        this.mapContainer.addChild(sprite);
    }

    private selectExistingAsset(x: number, y: number) {
        const clickedSprite = this.mapContainer.children.find((child) => {
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
            if (this.selectedMapAsset !== null) {
                this.selectedMapAsset.tint = 0xffffff; // Reset previous selection tint
            }

            this.selectedMapAsset = clickedSprite;
            this.selectedMapAsset.tint = 0xff0000; // Tint the new selection
            this.sidebar.updateInspector(this.selectedMapAsset);
            console.log("Selected existing asset.");
        }
    }

    private startDragging(event: FederatedPointerEvent, sprite: Sprite) {
        this.isDragging = true;
        if (this.selectedMapAsset !== null) {
            this.selectedMapAsset.tint = 0xffffff; // Reset previous selection tint
        }

        this.selectedMapAsset = sprite;
        this.selectedMapAsset.tint = 0xff0000; // Tint the new selection
        sprite.alpha = 0.7; // Visual cue for dragging
        this.sidebar.updateInspector(this.selectedMapAsset);
        // Calculate the offset between the mouse and the sprite's position
        const position = event.data.getLocalPosition(this.mapContainer);
        this.dragOffset.x = sprite.x - position.x;
        this.dragOffset.y = sprite.y - position.y;

        // Start listening for movement on the mapContainer
        this.mapContainer.on("pointermove", this.onDrag, this);
    }

    private stopDragging() {
        if (!this.selectedMapAsset) {
            return;
        }

        this.isDragging = false;
        this.selectedMapAsset.alpha = 1;

        // Stop listening for movement
        this.mapContainer.off("pointermove", this.onDrag, this);

        // Snap to nearby assets
        this.snapToClosest(this.selectedMapAsset);
    }

    private onDrag(event: FederatedPointerEvent) {
        if (!this.isDragging || !this.selectedMapAsset) return;

        const newPosition = event.data.getLocalPosition(this.mapContainer);

        // Apply the offset so the sprite stays in place
        this.selectedMapAsset.x = newPosition.x + this.dragOffset.x;
        this.selectedMapAsset.y = newPosition.y + this.dragOffset.y;
    }

    private snapToClosest(sprite: Sprite) {
        const SNAP_THRESHOLD = 10; // Pixels for snapping
        let closest: Sprite | null = null;
        let minDistance = SNAP_THRESHOLD;

        for (const child of this.mapContainer.children) {
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
            if (Math.abs(sprite.y - closest.y + closest.height) < SNAP_THRESHOLD) {
                sprite.y = closest.y - closest.height; // snaps right above the asset
            }
            if (Math.abs(sprite.y - closest.y - closest.height) < SNAP_THRESHOLD) {
                sprite.y = closest.y + closest.height; // snaps right above the asset
            }
            console.log("Snapped to closest asset.");
        }
    }

    private attachControls(event: KeyboardEvent) {
        if (event.key === "Delete" && this.selectedMapAsset) {
            this.mapContainer.removeChild(this.selectedMapAsset);
            console.log("Deleted selected asset.");
            this.selectedMapAsset = null;
        }

        if (event.key === "Escape" && this.selectedMapAsset) {
            this.selectedMapAsset.tint = 0xffffff;
            this.selectedMapAsset = null;
        }

        if (this.selectedMapAsset) {
            // Move the selected asset instead of the map
            if (event.key === "ArrowUp") {
                this.selectedMapAsset.y -= this.SCROLL_SPEED;
            }

            if (event.key === "ArrowDown") {
                this.selectedMapAsset.y += this.SCROLL_SPEED;
            }

            if (event.key === "ArrowLeft") {
                this.selectedMapAsset.x -= this.SCROLL_SPEED;
            }

            if (event.key === "ArrowRight") {
                this.selectedMapAsset.x += this.SCROLL_SPEED;
            }
        } else {
            // Move the mapContainer when nothing is selected
            let newX = this.mapContainer.x;
            let newY = this.mapContainer.y;

            if (event.key === "ArrowUp") {
                newY += this.SCROLL_SPEED;
            }

            if (event.key === "ArrowDown") {
                newY -= this.SCROLL_SPEED;
            }

            if (event.key === "ArrowLeft") {
                newX += this.SCROLL_SPEED;
            }

            if (event.key === "ArrowRight") {
                newX -= this.SCROLL_SPEED;
            }

            // Constrain scrolling within the hitArea
            const hitArea = this.mapContainer.hitArea as Rectangle;
            const maxX = 0;
            const maxY = 0;
            const minX = -hitArea.width + this.stage.width;
            const minY = -hitArea.height + this.stage.height;

            this.mapContainer.x = Math.min(maxX, Math.max(minX, newX));
            this.mapContainer.y = Math.min(maxY, Math.max(minY, newY));
        }
    }

    private exportMap() {
        const exportData = this.mapContainer.children.map((child) => ({
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
        this.mapContainer.removeChildren();
        this.uiContainer.removeChildren();
        window.removeEventListener("keydown", (e) => this.attachControls(e));
    }
}
