precision mediump float;

varying vec2 vScreenCoord;

uniform sampler2D uCrawlTexture;
uniform float uScroll;
uniform float uHorizonY;
uniform float uTaper;
uniform float uPerspectiveK;
uniform float uTopFade;
uniform float uBottomFade;

void main(void) {
    float y = vScreenCoord.y;
    
    // Above horizon: outside tilted plane (deep space)
    if (y <= uHorizonY) {
        gl_FragColor = vec4(0.0);
        return;
    }
    
    float h = y - uHorizonY;
    
    // 3D Perspective horizontal trapezoid projection:
    // Centered at 0.5. At horizon (h -> 0), width narrows to a point.
    // Near bottom of screen (h large), width expands to full width.
    float taperSpan = max(0.0001, h * uTaper);
    float u = 0.5 + (vScreenCoord.x - 0.5) / taperSpan;
    
    // Discard pixels outside horizontal crawl margin
    if (u < 0.0 || u > 1.0) {
        gl_FragColor = vec4(0.0);
        return;
    }
    
    // 3D Perspective vertical coordinate along the crawl scroll:
    // Distance along tilted plane is proportional to 1/h.
    // uScroll advances with time, smoothly moving the text toward the horizon.
    float v = uScroll - (uPerspectiveK / h);
    
    // Discard pixels before the start or after the end of the crawl
    if (v < 0.0 || v > 1.0) {
        gl_FragColor = vec4(0.0);
        return;
    }
    
    vec4 texColor = texture2D(uCrawlTexture, vec2(u, v));
    
    // Distance fog: smooth fade out into space as text approaches the vanishing horizon
    float fogAlpha = smoothstep(0.0, max(0.005, uTopFade), h);
    
    // Entry fade: smooth fade in at the bottom edge of the screen
    float bottomAlpha = smoothstep(1.0, 1.0 - max(0.005, uBottomFade), y);
    
    gl_FragColor = texColor * (fogAlpha * bottomAlpha);
}
