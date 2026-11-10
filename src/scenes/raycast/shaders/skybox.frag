#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 vTextureCoord;
varying vec3 vSkyDir;
varying vec2 vRayDir;

uniform sampler2D uSkyboxTexture;
uniform samplerCube uSkyboxCube;
uniform float uHasSkybox;
uniform float uHasCubeMap;
uniform vec2 uSkyboxRepeat;
uniform vec2 uSkyboxOffset;
uniform vec2 uWallBand; // [globalMaxWallTop / screenH, globalMinWallBottom / screenH]

void main(void) {
    // 1. Early-out for horizon band 100% occluded by solid walls across all columns
    if (uWallBand.y > uWallBand.x && vTextureCoord.y >= uWallBand.x && vTextureCoord.y <= uWallBand.y) {
        discard;
    }

    // 2. 3D CubeMap Skybox sampling
    if (uHasCubeMap > 0.5) {
        gl_FragColor = vec4(textureCube(uSkyboxCube, vSkyDir).rgb, 1.0);
        return;
    }

    // 3. 2D Panoramic Skybox sampling
    if (uHasSkybox > 0.5) {
        float angle = atan(vRayDir.y, vRayDir.x);
        float skyU = fract((angle / 6.28318530718 + 0.5) * uSkyboxRepeat.x + uSkyboxOffset.x);
        float skyV = clamp((vTextureCoord.y - 0.5) * uSkyboxRepeat.y + 0.5 + uSkyboxOffset.y, 0.0, 1.0);
        gl_FragColor = vec4(texture2D(uSkyboxTexture, vec2(skyU, skyV)).rgb, 1.0);
        return;
    }

    // 4. Fallback atmospheric gradient
    float skyT = clamp(vTextureCoord.y / 0.5, 0.0, 1.0);
    vec3 col = mix(vec3(40.0 / 255.0, 70.0 / 255.0, 120.0 / 255.0), vec3(135.0 / 255.0, 206.0 / 255.0, 235.0 / 255.0), skyT);
    gl_FragColor = vec4(col, 1.0);
}
