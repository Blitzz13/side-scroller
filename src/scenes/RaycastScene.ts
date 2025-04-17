// pixi-raycast.ts
import { BlurFilter, Container, Graphics } from 'pixi.js';
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
        const wallWidth = this.gameConfig.width / this.rayCount; // Dynamic width
    
        for (let ray = 0; ray < this.rayCount; ray++) {
            // Calculate ray angle with field of view
            const rayAngle = this.playerAngle + (ray / this.rayCount - 0.5) * Math.PI / 3;
    
            // DDA setup
            let rayX = this.playerX;
            let rayY = this.playerY;
    
            // Direction of the ray
            const rayDirX = Math.cos(rayAngle);
            const rayDirY = Math.sin(rayAngle);
    
            // Map position
            let mapX = Math.floor(rayX);
            let mapY = Math.floor(rayY);
    
            // Length of ray from one x or y-side to next x or y-side
            const deltaDistX = Math.abs(1 / (rayDirX === 0 ? 1e-30 : rayDirX));
            const deltaDistY = Math.abs(1 / (rayDirY === 0 ? 1e-30 : rayDirY));
    
            // Calculate step and initial sideDist
            let stepX, stepY;
            let sideDistX, sideDistY;
    
            if (rayDirX < 0) {
                stepX = -1;
                sideDistX = (rayX - mapX) * deltaDistX;
            } else {
                stepX = 1;
                sideDistX = (mapX + 1 - rayX) * deltaDistX;
            }
    
            if (rayDirY < 0) {
                stepY = -1;
                sideDistY = (rayY - mapY) * deltaDistY;
            } else {
                stepY = 1;
                sideDistY = (mapY + 1 - rayY) * deltaDistY;
            }
    
            // Perform DDA
            let hitWall = false;
            let side; // Was a NS or a EW wall hit?
            let distance;
    
            while (!hitWall) {
                // Jump to next map square, either in x-direction or y-direction
                if (sideDistX < sideDistY) {
                    sideDistX += deltaDistX;
                    mapX += stepX;
                    side = 0; // Hit vertical wall
                } else {
                    sideDistY += deltaDistY;
                    mapY += stepY;
                    side = 1; // Hit horizontal wall
                }
    
                // Check if ray has hit a wall
                if (mapX >= 0 && mapX < this.map[0].length && mapY >= 0 && mapY < this.map.length) {
                    if (this.map[mapY][mapX] === 1) {
                        hitWall = true;
                    }
                } else {
                    break; // Ray out of bounds
                }
            }
    
            if (hitWall) {
                // Calculate distance to the wall
                if (side === 0) {
                    distance = (mapX - rayX + (1 - stepX) / 2) / rayDirX;
                } else {
                    distance = (mapY - rayY + (1 - stepY) / 2) / rayDirY;
                }
    
                // Apply fisheye correction
                const correctedDistance = Math.abs(distance * Math.cos(rayAngle - this.playerAngle));
                
                // Calculate wall height and position
                const wallHeight = Math.min(this.wallHeight / (correctedDistance + 0.001), this.gameConfig.height);
                const wallTop = this.gameConfig.height / 2 - wallHeight / 2;
    
                // Adjust shading based on side (optional, for visual distinction)
                const alpha = side === 0 ? Math.max(0.4, 0.8 - correctedDistance / 20) : Math.max(0.3, 0.6 - correctedDistance / 20);
    
                // Draw the wall
                this.walls.beginFill(0x999999, alpha);
                this.walls.drawRect(Math.floor(ray * wallWidth), wallTop, Math.ceil(wallWidth), wallHeight);
                this.walls.endFill();
    
                // Draw the ray on the minimap
                const endX = this.playerX + rayDirX * distance;
                const endY = this.playerY + rayDirY * distance;
                this.rays.lineStyle(1, 0xFFFF00);
                this.rays.moveTo(this.playerX * 16, this.playerY * 16);
                this.rays.lineTo(endX * 16, endY * 16);
            }
        }
    }
    
    public dispose(): void {
        window.removeEventListener("keydown", () => {});
    }
}