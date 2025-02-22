import { Container, Graphics, RoundedRectangle, Sprite } from "pixi.js";
import { Button } from "../Button";
import { Inspector } from "./Inspector";
import { AssetsTab } from "./AssetsTab";
import { MapMakerEvent } from "../../enums/MapMakerEvent";

export class Sidebar extends Container {
    private inspector: Inspector;
    private assetTab: AssetsTab;

    constructor(assets: string[]) {
        super();
        this.createPanel();
        this.inspector = new Inspector();
        this.assetTab = new AssetsTab(assets);
        
        this.assetTab.on(MapMakerEvent.SELECTED_SPRITE, (selectedAsset: Sprite) => {
            this.emit(MapMakerEvent.SELECTED_SPRITE, selectedAsset);
        });

        this.inspector.visible = false;

        this.addChild(this.assetTab);
        this.addChild(this.inspector);
    }

    public updateInspector(asset: Sprite): void {
        this.inspector.updateInspector(asset);
    }

    private createPanel(): void {
        const sidebar = new Graphics();
        sidebar.beginFill(0x333333);
        sidebar.drawRect(0, 0, 200, 720);
        sidebar.endFill();

        const assetTabButton = new Button(
            new RoundedRectangle(0, 0, 60, 30, 10),
            "Assets",
            16,
        );

        const inspectorTabButton = new Button(
            new RoundedRectangle(0, 0, 80, 30, 10),
            "Inspector",
            16,
        );

        assetTabButton.eventMode = "static";
        inspectorTabButton.eventMode = "static";

        inspectorTabButton.y = assetTabButton.y;
        inspectorTabButton.x = assetTabButton.x + assetTabButton.width;

        assetTabButton.on("pointerdown", () => {
            this.assetTab.visible = true;
            this.inspector.visible = false;
        });

        inspectorTabButton.on("pointerdown", () => {
            this.assetTab.visible = false;
            this.inspector.visible = true;
        });
        
        // Export Button
        const exportBtn = new Graphics();
        exportBtn.beginFill(0xffcc00);
        exportBtn.drawRect(20, 650, 160, 40);
        exportBtn.endFill();
        exportBtn.interactive = true;
        exportBtn.cursor = "pointer";
        exportBtn.on("pointerdown", () => {
           this.emit(MapMakerEvent.EXPORT_BUTTON_CLICKED)
        });
        
        this.addChild(sidebar)
        this.addChild(assetTabButton)
        this.addChild(inspectorTabButton)
        this.addChild(exportBtn);
    }
}
