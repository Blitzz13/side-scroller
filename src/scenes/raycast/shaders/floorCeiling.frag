precision mediump float;

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

void main(void) {
    bool isCeiling = vTextureCoord.y < 0.5;
    float p = isCeiling ? (0.5 - vTextureCoord.y) : (vTextureCoord.y - 0.5);
    
    float skyT = clamp(vTextureCoord.y / 0.5, 0.0, 1.0);
    vec3 skyColor = mix(vec3(40.0 / 255.0, 70.0 / 255.0, 120.0 / 255.0), vec3(135.0 / 255.0, 206.0 / 255.0, 235.0 / 255.0), skyT);
    vec3 floorFog = vec3(0.036);

    if (p <= 0.0001) {
        if (isCeiling) {
            gl_FragColor = vec4(skyColor, 1.0);
        } else {
            gl_FragColor = vec4(floorFog, 1.0);
        }
        return;
    }
    
    float rowDist = 0.5 / p;
    float shade = clamp(1.0 - rowDist * (0.75 / uMaxDist), 0.18, 1.0);
    vec2 rayDir = uDir + (2.0 * vTextureCoord.x - 1.0) * uPlane;
    vec2 worldPos = uPlayerPos + rowDist * rayDir;
    vec2 cell = floor(worldPos);
    
    if (isCeiling) {
        if (rowDist > uMaxDist || cell.x < 0.0 || cell.x >= uMapSize.x || cell.y < 0.0 || cell.y >= uMapSize.y) {
            gl_FragColor = vec4(skyColor, 1.0);
            return;
        }
        
        vec2 mapUv = (cell + 0.5) / uMapSize;
        vec4 mapSample = texture2D(uMapTexture, mapUv);
        float tileVal = floor(mapSample.g * 255.0 + 0.5);
        
        if (tileVal <= 0.0) {
            gl_FragColor = vec4(skyColor, 1.0);
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
