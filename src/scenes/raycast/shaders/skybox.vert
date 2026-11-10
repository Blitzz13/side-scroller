attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;

uniform vec2 uDir;
uniform vec2 uPlane;
uniform float uSkyboxZoom;
uniform float uSkyboxVFactor;
uniform vec2 uSkyboxYawCS;

varying vec2 vTextureCoord;
varying vec3 vSkyDir;
varying vec2 vRayDir;

void main(void) {
    gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
    vRayDir = uDir + (2.0 * aTextureCoord.x - 1.0) * uPlane;

    vec2 horizDir = uDir + (2.0 * aTextureCoord.x - 1.0) * uPlane * uSkyboxZoom;
    float vComp = (0.5 - aTextureCoord.y) * (uSkyboxVFactor * uSkyboxZoom);
    vec3 rawDir = vec3(horizDir.x, vComp, -horizDir.y);
    vSkyDir = vec3(
        rawDir.x * uSkyboxYawCS.x - rawDir.z * uSkyboxYawCS.y,
        rawDir.y,
        rawDir.x * uSkyboxYawCS.y + rawDir.z * uSkyboxYawCS.x
    );
}
