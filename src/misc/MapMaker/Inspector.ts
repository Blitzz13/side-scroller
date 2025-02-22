import { Input } from "@pixi/ui";
import { Container, Graphics, TextStyle, Text, Sprite } from "pixi.js";

export class Inspector extends Container {
    private selectedAsset: Sprite | null = null;

    constructor() {
        super();
    }

    public updateInspector(asset?: Sprite): void {
        this.removeChildren();
        this.selectedAsset = asset || null;

        if (!asset) return;

        const style = new TextStyle({ fill: "white", fontSize: 12 });

        const labels = ["X", "Y", "ScaleX", "ScaleY", "Width", "Height", "Angle"];
        const values = [
            asset.x.toFixed(1),
            asset.y.toFixed(1),
            asset.scale.x.toFixed(2),
            asset.scale.y.toFixed(2),
            asset.width.toFixed(1),
            asset.height.toFixed(1),
            asset.angle.toFixed(2),
        ];

        labels.forEach((labelText, index) => {
            // Label text
            const label = new Text(labelText + ":", style);
            label.x = 6;
            label.y = 40 + index * 30;
            this.addChild(label);

            // Input field using PIXI UI's Input component
            const input = new Input({
                bg: new Graphics()
                    .beginFill(0xffffff)
                    .drawRoundedRect(0, 0, 60, 20, 4),
                textStyle: {
                    fill: 0x000000,
                    fontSize: 12,
                    fontWeight: "bold",
                },
                value: values[index],
                maxLength: 6,
                padding: [2, 5, 2, 5],
            });

            input.x = 60;
            input.y = 40 + index * 30;
            input.interactive = true;
            input.cursor = "pointer";

            // Update asset property when user enters new value
            input.onEnter.connect((newValue) =>
                this.onInputChange(labelText, newValue),
            );

            this.addChild(input);
        });
    }

    private onInputChange(property: string, value: string): void {
        if (!this.selectedAsset) return;

        const newValue = parseFloat(value);
        if (isNaN(newValue)) return;

        switch (property) {
            case "X":
                this.selectedAsset.x = newValue;
                break;
            case "Y":
                this.selectedAsset.y = newValue;
                break;
            case "ScaleX":
                this.selectedAsset.scale.x = newValue;
                break;
            case "ScaleY":
                this.selectedAsset.scale.y = newValue;
                break;
            case "Width":
                this.selectedAsset.width = newValue;
                break;
            case "Height":
                this.selectedAsset.height = newValue;
                break;
            case "Angle":
                this.selectedAsset.angle = newValue;
                break;
        }
    }
}
