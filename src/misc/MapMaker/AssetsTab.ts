import { Container, Sprite } from "pixi.js";
import { MapMakerEvent } from "../../enums/MapMakerEvent";

export class AssetsTab extends Container {
    private assetSprites: Sprite[] = [];
    private selectedAsset: Sprite;

    constructor(assets: string[]) {
        super();
        this.selectedAsset = new Sprite();
        this.createUI(assets);
    }

    private createUI(assets: string[]) {
        const assetContainer = new Container();
        assets.forEach((assetName, index) => {
            const sprite = Sprite.from(assetName);
            sprite.width = 70;
            sprite.height = 70;
            sprite.y = index * 70 + 70;
            sprite.x = 10;
            sprite.interactive = true;
            sprite.cursor = "pointer";

            sprite.on("pointerdown", () =>
                this.selectAssetTabItem(sprite, assetName),
            );

            this.assetSprites.push(sprite);

            assetContainer.addChild(sprite);
        });

        this.addChild(assetContainer);
    }

    private selectAssetTabItem(sprite: Sprite, assetName: string) {
        this.selectedAsset.tint = 0xffffff;

        this.selectedAsset = Sprite.from(assetName);
        this.selectedAsset.tint = 0xff0000;

        // Highlight selected asset in the asset tab
        this.highlightSelectedAssetTabItem(sprite);
        this.emit(MapMakerEvent.SELECTED_SPRITE, sprite)
    }

    private highlightSelectedAssetTabItem(selectedSprite: Sprite) {
        this.assetSprites.forEach((sprite) => {
            sprite.tint = sprite === selectedSprite ? 0xff0000 : 0xffffff;
        });
    }
}
