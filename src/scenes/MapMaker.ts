import { Container, Sprite, Application, Graphics, Rectangle, FederatedPointerEvent } from "pixi.js";
import { BaseScene } from "./BaseScene";
import { manifest } from "../configs/GameConfig";

export class MapEditor extends BaseScene {
    private assets: string[] = [];
    private selectedAsset: Sprite | null = null;
    private mapContainer: Container;
    private uiContainer: Container;
    private isDragging: boolean = false;
    private dragOffset = { x: 0, y: 0 };
    private SCROLL_SPEED = 20; // Pixels per key press
    constructor(stage: Container, scale: number) {
        super(stage, scale);

        this.mapContainer = new Container();
        this.mapContainer.name = "MapContainer";
        this.mapContainer.hitArea = new Rectangle(0, 0, 2000, 2000);
        this.uiContainer = new Container();
        this.stage.addChild(this.mapContainer);
        this.stage.addChild(this.uiContainer);

        this.loadAssets();
        this.createUI();
        this.setupInteraction();

        // Listen for keypress events (for deletion)
        window.addEventListener("keydown", (e) => this.onKeyDown(e));
    }

    private loadAssets() {
        const envAssets = manifest.bundles.find(bundle => bundle.name === "environment");

        if (envAssets && Array.isArray(envAssets.assets)) {
            this.assets = envAssets.assets
                .map(asset => (typeof asset === "object" && "name" in asset ? asset.name : null))
                .filter(name => name !== null) as string[];
        } else {
            console.warn("No environment assets found in manifest.");
        }
    }

    private createUI() {
        const sidebar = new Graphics();
        sidebar.beginFill(0x333333);
        sidebar.drawRect(0, 0, 200, 720);
        sidebar.endFill();
        this.uiContainer.addChild(sidebar);

        this.assets.forEach((assetName, index) => {
            const sprite = Sprite.from(assetName);
            sprite.width = 70;
            sprite.height = 70;
            sprite.y = index * 70 + 10;
            sprite.x = 10;
            sprite.interactive = true;
            sprite.cursor = "pointer";

            sprite.on("pointerdown", () => {
                this.selectedAsset = Sprite.from(assetName);
                this.selectedAsset.tint = 0xff0000;
                console.log("Selected asset:", assetName);
            });

            this.uiContainer.addChild(sprite);
        });

        // Export Button
        const exportBtn = new Graphics();
        exportBtn.beginFill(0xffcc00);
        exportBtn.drawRect(20, 650, 160, 40);
        exportBtn.endFill();
        exportBtn.interactive = true;
        exportBtn.cursor = "pointer";
        exportBtn.on("pointerdown", () => this.exportMap());

        this.uiContainer.addChild(exportBtn);
    }

    private setupInteraction() {
        this.mapContainer.interactive = true;
        this.mapContainer.on("pointerdown", (event: FederatedPointerEvent) => {
            if (!this.isDragging) { // Prevent placing assets while dragging
                this.onMapClick(event);
            }
        });
    }
    

    private onMapClick(event: FederatedPointerEvent) {
        const position = event.data.getLocalPosition(this.mapContainer);

        // If an asset is selected, place it on the map
        if (this.selectedAsset) {
            this.addAssetToMap(position.x, position.y);
        } else {
            // Select existing sprite if clicked
            this.selectExistingAsset(position.x, position.y);
        }
    }

    private addAssetToMap(x: number, y: number) {
        if (!this.selectedAsset) return;
    
        const sprite = Sprite.from(this.selectedAsset.texture);
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
                return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
            }
            return false;
        }) as Sprite | undefined;
    
        if (clickedSprite) {
            if (this.selectedAsset !== null) {
                this.selectedAsset.tint = 0xFFFFFF; // Reset previous selection tint
            }
            this.selectedAsset = clickedSprite;
            this.selectedAsset.tint = 0xff0000; // Tint the new selection
            console.log("Selected existing asset.");
        }
    }    

    private startDragging(event: FederatedPointerEvent, sprite: Sprite) {
        this.isDragging = true;
        if (this.selectedAsset !== null) {
            this.selectedAsset.tint = 0xFFFFFF; // Reset previous selection tint
        }
        
        this.selectedAsset = sprite;
        this.selectedAsset.tint = 0xff0000; // Tint the new selection
        sprite.alpha = 0.7; // Visual cue for dragging

        // Calculate the offset between the mouse and the sprite's position
        const position = event.data.getLocalPosition(this.mapContainer);
        this.dragOffset.x = sprite.x - position.x;
        this.dragOffset.y = sprite.y - position.y;

        // Start listening for movement on the mapContainer
        this.mapContainer.on("pointermove", this.onDrag, this);
    }

    private stopDragging() {
        if (!this.selectedAsset) return;
    
        this.isDragging = false;
        this.selectedAsset.alpha = 1; // Reset transparency
    
        // Stop listening for movement
        this.mapContainer.off("pointermove", this.onDrag, this);
    
        // Snap to nearby assets
        this.snapToClosest(this.selectedAsset);
    }    

    private onDrag(event: FederatedPointerEvent) {
        if (!this.isDragging || !this.selectedAsset) return;
    
        const newPosition = event.data.getLocalPosition(this.mapContainer);
        
        // Apply the offset so the sprite stays in place
        this.selectedAsset.x = newPosition.x + this.dragOffset.x;
        this.selectedAsset.y = newPosition.y + this.dragOffset.y;
    }
    
    private snapToClosest(sprite: Sprite) {
        const SNAP_THRESHOLD = 10; // Pixels for snapping
        let closest: Sprite | null = null;
        let minDistance = SNAP_THRESHOLD;

        for (const child of this.mapContainer.children) {
            if (child === sprite || !(child instanceof Sprite)) continue;

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
                sprite.x = closest.x; // Align X-axis
            }
            if (Math.abs(sprite.y - closest.y) < SNAP_THRESHOLD) {
                sprite.y = closest.y; // Align Y-axis
            }
            console.log("Snapped to closest asset.");
        }
    }

    private onKeyDown(event: KeyboardEvent) {
        if (event.key === "Delete" && this.selectedAsset) {
            this.mapContainer.removeChild(this.selectedAsset);
            console.log("Deleted selected asset.");
            this.selectedAsset = null;
        }
    
        if (event.key === "Escape" && this.selectedAsset) {
            this.selectedAsset.tint = 0xffffff;
            this.selectedAsset = null;
        }
    
        if (this.selectedAsset) {
            // Move the selected asset instead of the map
            if (event.key === "ArrowUp") {
                this.selectedAsset.y -= this.SCROLL_SPEED;
            }
            
            if (event.key === "ArrowDown") {
                this.selectedAsset.y += this.SCROLL_SPEED;
            }
            
            if (event.key === "ArrowLeft") {
                this.selectedAsset.x -= this.SCROLL_SPEED;
            }
            
            if (event.key === "ArrowRight") {
                this.selectedAsset.x += this.SCROLL_SPEED;
            }
        } 
        else {
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
        const exportData = this.mapContainer.children.map(child => ({
            name: (child as Sprite).texture.textureCacheIds[0],
            x: child.x,
            y: child.y,
            scale: child.scale.x
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
        window.removeEventListener("keydown", (e) => this.onKeyDown(e));
    }
}
