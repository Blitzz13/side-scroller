// pixi-raycast.ts
import { Container, Graphics } from 'pixi.js';
import { BaseScene } from './BaseScene';
import { gameConfig } from '../configs/GameConfig';

export class RaycastScene extends BaseScene {
    private playerX: number;
    private playerY: number;
    private playerAngle: number;
    private map: number[][];
    private rayCount: number;
    private rayStep: number;
    private wallHeight: number;
    private moveSpeed: number;
    private turnSpeed: number;
    private rays: Graphics;
    private walls: Graphics;
    private mapDisplay: Graphics;
    private gameConfig: { width: number, height: number };

    constructor(stage: Container, scale: number) {
        super(stage, scale);

        this.gameConfig = {
            width: gameConfig.width,
            height: gameConfig.height,
        };
        this.playerX = 3;
        this.playerY = 3;
        this.playerAngle = 0;
        this.map = [
            [1, 1, 1, 1, 1, 1, 1, 1],
            [1, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 1, 0, 1, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 1, 0, 1],
            [1, 0, 1, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 1],
            [1, 1, 1, 1, 1, 1, 1, 1],
        ];
        this.rayCount = this.gameConfig.width * 2;
        this.rayStep = 0.5;
        this.wallHeight = 64;
        this.moveSpeed = 0.1;
        this.turnSpeed = 0.05;

        this.rays = new Graphics();
        this.walls = new Graphics();
        this.mapDisplay = new Graphics();

        this.addChild(this.rays);
        this.addChild(this.walls);
        this.addChild(this.mapDisplay);

        this.setupInput();
        this.update();
    }

    private setupInput(): void {
        window.addEventListener("keydown", (e) => {
            switch (e.key) {
                case "ArrowUp":
                    this.moveForward();
                    break;
                case "ArrowDown":
                    this.moveBackward();
                    break;
                case "ArrowLeft":
                    this.turnLeft();
                    break;
                case "ArrowRight":
                    this.turnRight();
                    break;
            }
        });
    }

    private moveForward(): void {
        this.playerX += Math.cos(this.playerAngle) * this.moveSpeed;
        this.playerY += Math.sin(this.playerAngle) * this.moveSpeed;
        this.checkWallCollision();
        this.update();
    }

    private moveBackward(): void {
        this.playerX -= Math.cos(this.playerAngle) * this.moveSpeed;
        this.playerY -= Math.sin(this.playerAngle) * this.moveSpeed;
        this.checkWallCollision();
        this.update();
    }

    private turnLeft(): void {
        this.playerAngle -= this.turnSpeed;
        this.update();
    }

    private turnRight(): void {
        this.playerAngle += this.turnSpeed;
        this.update();
    }

    private checkWallCollision(): void {
        const mapX = Math.floor(this.playerX);
        const mapY = Math.floor(this.playerY);
        if (this.map[mapY][mapX] === 1) {
            this.playerX -= Math.cos(this.playerAngle) * this.moveSpeed * 2;
            this.playerY -= Math.sin(this.playerAngle) * this.moveSpeed * 2;
        }
    }

    private update(): void {
        this.rays.clear();
        this.walls.clear();
        this.mapDisplay.clear();

        this.drawMap();
        this.castRays();
    }

    private drawMap(): void {
        const cellSize = 16;
        for (let y = 0; y < this.map.length; y++) {
            for (let x = 0; x < this.map[y].length; x++) {
                if (this.map[y][x] === 1) {
                    this.mapDisplay.beginFill(0x888888);
                    this.mapDisplay.drawRect(x * cellSize, y * cellSize, cellSize, cellSize);
                    this.mapDisplay.endFill();
                }
            }
        }
        this.mapDisplay.beginFill(0xFF0000);
        this.mapDisplay.drawCircle(this.playerX * cellSize, this.playerY * cellSize, 4);
        this.mapDisplay.endFill();
    }

    private castRays(): void {
        const rayStep = 0.05;
        const wallWidth = 2;
        const verticalSegments = 10;
        const blurAmount = 2;

        for (let ray = 0; ray < this.rayCount; ray++) {
            const rayAngle = this.playerAngle + (ray / this.rayCount - 0.5) * Math.PI / 2;
            let rayX = this.playerX;
            let rayY = this.playerY;
            let distance = 0;
            let hitWall = false;

            while (!hitWall && distance < 20) {
                rayX += Math.cos(rayAngle) * rayStep;
                rayY += Math.sin(rayAngle) * rayStep;
                distance += rayStep;

                const mapX = Math.floor(rayX);
                const mapY = Math.floor(rayY);

                if (mapX >= 0 && mapX < this.map[0].length && mapY >= 0 && mapY < this.map.length) {
                    if (this.map[mapY][mapX] === 1) {
                        hitWall = true;
                    }
                } else {
                    hitWall = true;
                }
            }

            if (hitWall) {
                const correctedDistance = distance * Math.cos(rayAngle - this.playerAngle);
                const wallHeight = Math.min(this.wallHeight / (correctedDistance + 0.001), this.gameConfig.height);
                const wallTop = this.gameConfig.height / 2 - wallHeight / 2;

                const segmentHeight = wallHeight / verticalSegments;
                for (let i = 0; i < verticalSegments; i++) {
                    const segmentTop = wallTop + i * segmentHeight;
                    const alpha = 0.8 - (i / verticalSegments) * 0.4;

                    this.walls.beginFill(0x999999, alpha);
                    this.walls.drawRect(ray * wallWidth - 1, segmentTop, wallWidth + 2, segmentHeight);
                    this.walls.endFill();
                }

                // this.walls.filters = [new PIXIfilters.BlurFilter(blurAmount)];

                this.rays.lineStyle(1, 0xFFFF00);
                this.rays.moveTo(this.playerX * 16, this.playerY * 16);
                this.rays.lineTo(rayX * 16, rayY * 16);
            }
        }
    }

    public dispose(): void {
        window.removeEventListener("keydown", () => {});
    }
}