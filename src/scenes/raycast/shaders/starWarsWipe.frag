precision mediump float;

varying vec2 vTextureCoord;

uniform sampler2D uPrevTexture;
uniform float uProgress;
uniform vec2 uWipeDir;
uniform float uWipeType;
uniform float uSoftness;
uniform float uLineWidth;
uniform vec3 uLineColor;

void main(void) {
    float threshold = 0.0;
    
    if (uWipeType < 0.5) {
        // Linear directional wipe (horizontal, vertical, or diagonal)
        vec2 dir = length(uWipeDir) > 0.0001 ? normalize(uWipeDir) : vec2(1.0, 0.0);
        vec2 p = vTextureCoord - vec2(0.5);
        float d = dot(p, dir);
        float maxExtent = 0.5 * (abs(dir.x) + abs(dir.y));
        threshold = clamp((d + maxExtent) / (2.0 * maxExtent), 0.0, 1.0);
    } else if (uWipeType < 1.5) {
        // Radial clock wipe (clockwise from 12 o'clock)
        vec2 p = vTextureCoord - vec2(0.5);
        float angle = atan(-p.x, p.y);
        threshold = (angle + 3.1415926535) / (2.0 * 3.1415926535);
    } else {
        // Iris / Circle wipe (16:9 aspect ratio corrected)
        vec2 p = (vTextureCoord - vec2(0.5)) * vec2(1.7777778, 1.0);
        threshold = clamp(length(p) / 0.9, 0.0, 1.0);
    }

    vec4 prevColor = texture2D(uPrevTexture, vTextureCoord);

    // Glowing Star Wars wipe separator line along the leading edge
    float edgeDist = abs(threshold - uProgress);
    if (edgeDist < uLineWidth && uProgress > 0.008 && uProgress < 0.992) {
        float lineFactor = 1.0 - (edgeDist / uLineWidth);
        vec3 glowCol = mix(prevColor.rgb, uLineColor, lineFactor);
        gl_FragColor = vec4(glowCol, max(prevColor.a, lineFactor));
        return;
    }

    // Alpha blending:
    // If threshold < uProgress, the wipe has cleared this pixel -> transparent!
    float soft = max(0.001, uSoftness);
    float alpha = smoothstep(uProgress - soft, uProgress + soft, threshold);

    if (alpha <= 0.001) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    } else {
        gl_FragColor = vec4(prevColor.rgb, prevColor.a * alpha);
    }
}
