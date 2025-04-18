import { Container, Sprite, Texture, Graphics, Ticker, Rectangle, Assets, SCALE_MODES, Matrix, MIPMAP_MODES, BaseTexture } from "pixi.js"; // Added BaseTexture import
import { BaseScene } from "./BaseScene";
import { gameConfig } from "../configs/GameConfig";

export class RaycastScene extends BaseScene {
    private player = {
        x: 1.5,
        y: 1.5,
        angle: 0,
        speed: 0.05,
        rotSpeed: 0.03
    };

    private map = [
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 2, 0, 2, 0, 0, 1],
        [1, 0, 0, 0, 0, 2, 0, 1],
        [1, 0, 2, 0, 0, 2, 0, 1],
        [1, 0, 2, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 2, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 1]
    ];

    private textures: { [key: number]: Texture } = {};
    private keys: { [key: string]: boolean } = {};
    private renderer: Container;
    private fov = Math.PI / 3;
    // Ensure rays calculation results in an integer if needed, though width/2 is likely fine.
    private rays = Math.floor(gameConfig.width / 2);
    private sliceWidth = gameConfig.width / this.rays; // Calculate slice width once
    private isInitialized = false;

    constructor(stage: Container, scale: number) {
        super(stage, scale);
        this.renderer = new Container();
        this.addChild(this.renderer);

        // Initialize textures asynchronously
        this.initTextures().then(() => {
            this.isInitialized = true;
            // Start game loop
            Ticker.shared.add(this.update, this);
            console.log("RaycastScene initialized successfully (using Sprite slices)");
        }).catch((error) => {
            console.error("Failed to initialize textures:", error);
        });

        // Setup input
        window.addEventListener("keydown", (e) => (this.keys[e.key.toLowerCase()] = true));
        window.addEventListener("keyup", (e) => (this.keys[e.key.toLowerCase()] = false));
    }

    private async initTextures(): Promise<void> {
        try {
            // Preload textures
            await Assets.load([
                "./assets/dark_gray_wall.jpg",
                "./assets/gray_brick_wall.jpg"
            ]);

            // Use Texture.from with preloaded assets
            // Store the BaseTexture reference as well if needed, but Texture should be enough
            this.textures[1] = Texture.from("dark_gray_wall");
            this.textures[2] = Texture.from("gray_brick_wall");

            // --- Use LINEAR filtering (Still recommended for smoothing) ---
            if (this.textures[1]?.baseTexture) {
                this.textures[1].baseTexture.scaleMode = SCALE_MODES.LINEAR;
                this.textures[1].baseTexture.mipmap = MIPMAP_MODES.OFF;
            }
             if (this.textures[2]?.baseTexture) {
                this.textures[2].baseTexture.scaleMode = SCALE_MODES.LINEAR;
                this.textures[2].baseTexture.mipmap = MIPMAP_MODES.OFF;
            }

            console.log("Textures loaded:", {
                 darkGrayWall: {
                     valid: this.textures[1]?.valid,
                     width: this.textures[1]?.width,
                     height: this.textures[1]?.height,
                     scaleMode: this.textures[1]?.baseTexture?.scaleMode === SCALE_MODES.LINEAR ? 'LINEAR' : 'NEAREST',
                     mipmapEnabled: this.textures[1]?.baseTexture?.mipmap
                 },
                 grayBrickWall: {
                    valid: this.textures[2]?.valid,
                    width: this.textures[2]?.width,
                    height: this.textures[2]?.height,
                    scaleMode: this.textures[2]?.baseTexture?.scaleMode === SCALE_MODES.LINEAR ? 'LINEAR' : 'NEAREST',
                    mipmapEnabled: this.textures[2]?.baseTexture?.mipmap
                 }
             });

            // Validate textures
            if (!this.textures[1]?.valid || !this.textures[2]?.valid) {
                throw new Error("One or more textures are invalid or failed to load");
            }
        } catch (error) {
            console.error("Texture loading failed:", error);
            throw error; // Re-throw to stop initialization if textures fail
        }
    }

    private update(delta: number): void {
        if (!this.isInitialized) return; // Skip updates until initialized

        this.handleInput(delta);

        // Clear previous frame
        this.renderer.removeChildren();

        // Draw floor and ceiling
        const floor = new Graphics();
        floor.beginFill(0x333333); // Dark gray floor
        floor.drawRect(0, gameConfig.height / 2, gameConfig.width, gameConfig.height / 2);
        floor.endFill();

        const ceiling = new Graphics();
        ceiling.beginFill(0x666666); // Lighter gray ceiling
        ceiling.drawRect(0, 0, gameConfig.width, gameConfig.height / 2);
        ceiling.endFill();

        this.renderer.addChild(floor, ceiling);

        // Cast rays and render walls using Sprites
        for (let i = 0; i < this.rays; i++) {
            const rayAngle = this.player.angle - this.fov / 2 + (i / this.rays) * this.fov; // Correct angle calculation

            let hit = false;
            let distance = 0;
            let mapX = Math.floor(this.player.x);
            let mapY = Math.floor(this.player.y);

            const rayDirX = Math.cos(rayAngle);
            const rayDirY = Math.sin(rayAngle);

            // Handle potential division by zero more robustly
            const deltaDistX = (rayDirX === 0) ? Infinity : Math.abs(1 / rayDirX);
            const deltaDistY = (rayDirY === 0) ? Infinity : Math.abs(1 / rayDirY);

            let sideDistX: number, sideDistY: number;
            let stepX: number, stepY: number;
            let side: number = 0; // 0 for X-side hit, 1 for Y-side hit

            // Setup DDA step and initial side distances
            if (rayDirX < 0) {
                stepX = -1;
                sideDistX = (this.player.x - mapX) * deltaDistX;
            } else {
                stepX = 1;
                sideDistX = (mapX + 1 - this.player.x) * deltaDistX;
            }

            if (rayDirY < 0) {
                stepY = -1;
                sideDistY = (this.player.y - mapY) * deltaDistY;
            } else {
                stepY = 1;
                sideDistY = (mapY + 1 - this.player.y) * deltaDistY;
            }

            // Perform DDA
            let hitX = 0, hitY = 0; // Store exact hit coordinates if needed
            while (!hit) {
                if (sideDistX < sideDistY) {
                    sideDistX += deltaDistX;
                    mapX += stepX;
                    side = 0; // Hit an X boundary (vertical wall)
                } else {
                    sideDistY += deltaDistY;
                    mapY += stepY;
                    side = 1; // Hit a Y boundary (horizontal wall)
                }

                // Check map boundaries
                if (mapX < 0 || mapX >= this.map[0].length || mapY < 0 || mapY >= this.map.length) {
                     // Optionally set a max distance or break
                     distance = Infinity; // Or some large number
                     break;
                }

                // Check for wall hit
                if (this.map[mapY][mapX] > 0) {
                    hit = true;
                    // Calculate distance based on the side hit
                    if (side === 0) {
                        distance = (mapX - this.player.x + (1 - stepX) / 2) / rayDirX;
                        hitY = this.player.y + distance * rayDirY; // Calculate Y hit coord
                    } else {
                        distance = (mapY - this.player.y + (1 - stepY) / 2) / rayDirY;
                        hitX = this.player.x + distance * rayDirX; // Calculate X hit coord
                    }
                }
            } // End DDA loop

            if (!hit || distance <= 0 || distance === Infinity) continue; // Skip if no valid hit

            // Correct fish-eye effect
            const correctedDistance = distance * Math.cos(rayAngle - this.player.angle);

            // Calculate wall height (prevent division by zero/Infinity)
            const lineHeight = (correctedDistance > 0) ? Math.min(gameConfig.height / correctedDistance, gameConfig.height * 2) : gameConfig.height * 2; // Allow walls taller than screen
            const drawStart = Math.max(0, Math.floor((gameConfig.height - lineHeight) / 2));
            const drawEnd = Math.min(gameConfig.height, Math.floor((gameConfig.height + lineHeight) / 2));
            const actualDrawHeight = drawEnd - drawStart; // Use this for sprite height

            // Get the correct wall texture
             const wallType = this.map[mapY][mapX];
             const wallTexture = this.textures[wallType];

             if (!wallTexture || !wallTexture.valid || !wallTexture.baseTexture.valid) {
                 console.warn(`Invalid texture state for wall type ${wallType} at (${mapX}, ${mapY})`);
                 continue; // Skip if texture is bad
             }

            // Calculate texture coordinate (wallX: 0.0 to 1.0)
            let wallX: number;
            if (side === 0) { // Hit vertical wall
                wallX = this.player.y + correctedDistance * rayDirY; // Use corrected distance? Check LodeV tutorial
            } else { // Hit horizontal wall
                wallX = this.player.x + correctedDistance * rayDirX; // Use corrected distance? Check LodeV tutorial
            }
            wallX -= Math.floor(wallX); // Get fractional part

            // Calculate texture X coordinate (pixel column)
            const texWidth = wallTexture.width;
            let texX = Math.floor(wallX * texWidth);

            // --- Optional: Texture Flipping ---
            // Flip texture horizontally if necessary based on ray direction hitting the wall face
             if (side === 0 && rayDirX > 0) { // Hit vertical wall face from left
                 texX = texWidth - 1 - texX;
             }
             if (side === 1 && rayDirY < 0) { // Hit horizontal wall face from bottom
                 texX = texWidth - 1 - texX;
             }
            // --- End Optional Flipping ---

            // Clamp texX to ensure it's within valid bounds [0, texWidth - 1]
            texX = Math.max(0, Math.min(texX, texWidth - 1));


            // --- Render using Sprite ---
            const wallSliceSprite = new Sprite(); // Create Sprite

            // Define the 1-pixel wide frame within the base texture
            const frameRect = new Rectangle(texX, 0, 1, wallTexture.height);

            // Create a specific Texture view using the frame
            // Cache these Texture objects if performance becomes an issue
            wallSliceSprite.texture = new Texture(wallTexture.baseTexture, frameRect);

            // Position and scale the sprite
            wallSliceSprite.x = i * this.sliceWidth;
            wallSliceSprite.y = drawStart;
            wallSliceSprite.width = Math.ceil(this.sliceWidth); // Use ceiling to prevent gaps
            wallSliceSprite.height = actualDrawHeight; // Scale the 1-pixel texture column vertically

            // Apply tinting for pseudo-shading
            if (side === 1) { // Make horizontal walls darker
                wallSliceSprite.tint = 0xBBBBBB; // Slightly darker than 0xFFFFFF
            } else {
                 wallSliceSprite.tint = 0xFFFFFF; // Full brightness for vertical walls
            }

            this.renderer.addChild(wallSliceSprite);
            // --- End Sprite Rendering ---
        } // End ray loop

        // Add test sprites (optional, remove if not needed)
        if (this.isInitialized && this.textures[1] && this.textures[2]) {
            const testSprite1 = Sprite.from(this.textures[1]);
            testSprite1.x = 50;
            testSprite1.y = 50;
            testSprite1.width = 100;
            testSprite1.height = 100;
            testSprite1.alpha = 0.5;
            this.renderer.addChild(testSprite1);

            const testSprite2 = Sprite.from(this.textures[2]);
            testSprite2.x = 160;
            testSprite2.y = 50;
            testSprite2.width = 100;
            testSprite2.height = 100;
            testSprite2.alpha = 0.5;
            this.renderer.addChild(testSprite2);
        }
    } // End update method

    private handleInput(delta: number): void {
        // Scale movement speed by delta for frame-rate independence (optional but good practice)
        // Note: Your speeds are very low, multiply delta or increase base speed if movement is too slow
        const effectiveMoveSpeed = this.player.speed; // * delta * 60; // Example scaling
        const effectiveRotSpeed = this.player.rotSpeed; // * delta * 60; // Example scaling

        let dx = 0;
        let dy = 0;

        // Rotation
        if (this.keys["a"]) this.player.angle -= effectiveRotSpeed;
        if (this.keys["d"]) this.player.angle += effectiveRotSpeed;

        // Normalize angle
        this.player.angle = (this.player.angle + 2 * Math.PI) % (2 * Math.PI);

        // Forward/Backward Movement
        if (this.keys["w"]) {
            dx += Math.cos(this.player.angle) * effectiveMoveSpeed;
            dy += Math.sin(this.player.angle) * effectiveMoveSpeed;
        }
        if (this.keys["s"]) {
            dx -= Math.cos(this.player.angle) * effectiveMoveSpeed;
            dy -= Math.sin(this.player.angle) * effectiveMoveSpeed;
        }

        // Basic Collision Detection (Check target cell)
        const nextX = this.player.x + dx;
        const nextY = this.player.y + dy;
        const mapCheckX = Math.floor(nextX);
        const mapCheckY = Math.floor(nextY);

        // Check if the target map cell is valid and empty (0)
        if (mapCheckX >= 0 && mapCheckX < this.map[0].length &&
            mapCheckY >= 0 && mapCheckY < this.map.length &&
            this.map[mapCheckY][mapCheckX] === 0)
        {
            this.player.x = nextX;
            this.player.y = nextY;
        }
        // Optional: Implement sliding collision for smoother movement
    }

    public dispose(): void {
        Ticker.shared.remove(this.update, this);
        // Clean up event listeners correctly
        const keyDownHandler = (e: KeyboardEvent) => (this.keys[e.key.toLowerCase()] = true);
        const keyUpHandler = (e: KeyboardEvent) => (this.keys[e.key.toLowerCase()] = false);
        window.removeEventListener("keydown", keyDownHandler);
        window.removeEventListener("keyup", keyUpHandler);

        this.renderer.destroy({ children: true, texture: true, baseTexture: true }); // Thorough cleanup
        // super.dispose(); // Call base class dispose if it exists
    }
}