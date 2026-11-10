#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 vTextureCoord;

uniform vec2 uPlayerPos;
uniform vec2 uDir;
uniform vec2 uPlane;
uniform float uMaxDist;
uniform vec2 uMapSize;
uniform sampler2D uMapTexture;
uniform sampler2D uAtlas;
uniform vec2 uAtlasGrid;
uniform float uTileSize;
uniform vec4 uCeilingBounds; // [minCeilX, minCeilY, maxCeilX, maxCeilY]
uniform sampler2D uWallBoundsTex; // 1280x1 RGBA: R = wallTop/screenH, G = wallBottom/screenH
uniform float uSkyActive; // 1.0 when the skybox mesh is rendered behind this mesh

// Output for ceiling cells with no ceiling tile: keep the skybox behind (transparent) or opaque fallback
vec4 openCeiling() {
    if (uSkyActive > 0.5) {
        return vec4(0.0);
    }
    return vec4(vec3(211.0 / 255.0), 1.0);
}

void main(void) {
    // Per-column early-out for pixels 100% occluded by solid opaque walls
    vec2 wallBounds = texture2D(uWallBoundsTex, vec2(vTextureCoord.x, 0.5)).rg;
    if (vTextureCoord.y >= wallBounds.r && vTextureCoord.y <= wallBounds.g) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    bool isCeiling = vTextureCoord.y < 0.5;
    float p = isCeiling ? (0.5 - vTextureCoord.y) : (vTextureCoord.y - 0.5);
    vec2 rayDir = uDir + (2.0 * vTextureCoord.x - 1.0) * uPlane;
    vec3 floorFog = vec3(0.036);

    if (p <= 0.0001) {
        gl_FragColor = isCeiling ? openCeiling() : vec4(floorFog, 1.0);
        return;
    }

    float rowDist = 0.5 / p;
    vec2 worldPos = uPlayerPos + rowDist * rayDir;
    float shade = clamp(1.0 - rowDist * (0.75 / uMaxDist), 0.18, 1.0);

    if (isCeiling) {
        if (
            rowDist > uMaxDist ||
            uCeilingBounds.z <= uCeilingBounds.x ||
            worldPos.x < uCeilingBounds.x ||
            worldPos.y < uCeilingBounds.y ||
            worldPos.x >= uCeilingBounds.z ||
            worldPos.y >= uCeilingBounds.w
        ) {
            gl_FragColor = openCeiling();
            return;
        }

        vec2 cell = floor(worldPos);
        vec2 mapUv = (cell + 0.5) / uMapSize;
        vec4 mapSample = texture2D(uMapTexture, mapUv);
        float tileVal = floor(mapSample.g * 255.0 + 0.5);

        if (tileVal <= 0.0) {
            gl_FragColor = openCeiling();
            return;
        }

        float slotIndex = tileVal - 1.0;
        vec2 slot = vec2(mod(slotIndex, uAtlasGrid.x), floor(slotIndex / uAtlasGrid.x));
        vec2 uvInTile = clamp(fract(worldPos), 0.5 / uTileSize, (uTileSize - 0.5) / uTileSize);
        vec2 atlasUv = (slot + uvInTile) / uAtlasGrid;
        vec4 texColor = texture2D(uAtlas, atlasUv);
        gl_FragColor = vec4(texColor.rgb * shade, 1.0);
    } else {
        if (rowDist > uMaxDist) {
            gl_FragColor = vec4(floorFog, 1.0);
            return;
        }

        vec2 cell = floor(worldPos);
        if (cell.x < 0.0 || cell.x >= uMapSize.x || cell.y < 0.0 || cell.y >= uMapSize.y) {
            gl_FragColor = vec4(vec3(0.2) * shade, 1.0);
            return;
        }

        vec2 mapUv = (cell + 0.5) / uMapSize;
        vec4 mapSample = texture2D(uMapTexture, mapUv);
        float tileVal = floor(mapSample.r * 255.0 + 0.5);

        if (tileVal <= 0.0) {
            gl_FragColor = vec4(vec3(0.2) * shade, 1.0);
            return;
        }

        float slotIndex = tileVal - 1.0;
        vec2 slot = vec2(mod(slotIndex, uAtlasGrid.x), floor(slotIndex / uAtlasGrid.x));
        vec2 uvInTile = clamp(fract(worldPos), 0.5 / uTileSize, (uTileSize - 0.5) / uTileSize);
        vec2 atlasUv = (slot + uvInTile) / uAtlasGrid;
        vec4 texColor = texture2D(uAtlas, atlasUv);
        gl_FragColor = vec4(texColor.rgb * shade, 1.0);
    }
}
