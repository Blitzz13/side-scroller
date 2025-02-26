import { Container, Graphics, Text } from "pixi.js";
import { gameConfig } from "../../configs/GameConfig";

export class Hierarchy extends Container {
    private _targetContainer: Container | null = null;
    private _nodeContainers: Map<Container, Graphics> = new Map();

    constructor() {
        super();
        this.createBackground();
    }

    public setTargetContainer(container: Container) {
        this._targetContainer = container;
        this.refresh();
    }

    public refresh() {
        if (!this._targetContainer) {
            return;
        }
        
        if (this.children.length > 1) {
            this.removeChildren(1);
        }

        this.renderHierarchy(this._targetContainer, 10, 10, 0);
    }

    private createBackground() {
        const bg = new Graphics();
        bg.beginFill(0x222222, 0.9);
        bg.drawRect(0, 0, 250, gameConfig.height);
        bg.endFill();
        this.addChild(bg);
    }

    private renderHierarchy(
        container: Container,
        x: number,
        y: number,
        depth: number,
    ) {
        const nodeContainer = new Graphics();
        nodeContainer.beginFill(0x444444, 0.8);
        nodeContainer.drawRoundedRect(0, 0, 230, 25, 5);
        nodeContainer.endFill();
        nodeContainer.x = x + depth * 20; // Indentation
        nodeContainer.y = y;
        nodeContainer.interactive = true;
        nodeContainer.cursor = "pointer";

        const label = new Text(container.name || "Unnamed", {
            fill: 0xffffff,
            fontSize: 14,
        });
        label.x = 10;
        label.y = 5;
        nodeContainer.addChild(label);

        nodeContainer.on("pointerdown", () =>
            this.selectNode(container, nodeContainer),
        );

        this.addChild(nodeContainer);
        this._nodeContainers.set(container, nodeContainer);

        let currentY = y + 30;

        container.children.forEach((child, index) => {
            if (child instanceof Container) {
                currentY = this.renderHierarchy(child, x, currentY, depth + 1);
            }
        });

        return currentY;
    }

    private selectNode(container: Container, node: Graphics) {
        this._nodeContainers.forEach((n) => (n.alpha = 1)); // Reset all
        node.alpha = 0.5; // Highlight selected
        console.log("Selected container:", container.name || "Unnamed");
    }
}
