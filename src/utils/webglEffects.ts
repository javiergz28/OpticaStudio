import type { ColorAdjustments, FilterPresetId, VisualEffectId } from '../types/camera';

interface WebglPipelineState {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  vao: WebGLVertexArrayObject;
  texture: WebGLTexture;
  effectProgram: WebGLProgram;
  uEffect: WebGLUniformLocation | null;
  uIntensity: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  colorProgram: WebGLProgram;
  uFilter: WebGLUniformLocation | null;
  uBrightness: WebGLUniformLocation | null;
  uContrast: WebGLUniformLocation | null;
  uSaturation: WebGLUniformLocation | null;
  uTemperature: WebGLUniformLocation | null;
  uSoftSkin: WebGLUniformLocation | null;
  uColorRes: WebGLUniformLocation | null;
  uColorTime: WebGLUniformLocation | null;
}

let state: WebglPipelineState | null = null;
let webglUnavailable = false;

const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// GPU Color Grading & Instagram / Cinema Film LUT Fragment Shader
const COLOR_FRAG_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_tex;
uniform int u_filter;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_temperature;
uniform float u_softSkin;
uniform vec2 u_resolution;
uniform float u_time;

out vec4 outColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 setSat(vec3 c, float s) {
  float g = luma(c);
  return mix(vec3(g), c, s);
}

vec3 sCurve(vec3 c, float strength) {
  vec3 curved = c * c * (3.0 - 2.0 * c);
  return mix(c, curved, strength);
}

vec3 splitTone(vec3 c, vec3 shadowTint, vec3 midTint, vec3 highTint, float shadowAmt, float midAmt, float highAmt) {
  float lum = clamp(luma(c), 0.0, 1.0);
  float sW = smoothstep(0.55, 0.0, lum) * shadowAmt;
  float hW = smoothstep(0.45, 1.0, lum) * highAmt;
  float mW = (1.0 - abs(lum - 0.5) * 2.0) * midAmt;
  vec3 res = mix(c, c * 0.72 + shadowTint * 0.28, sW);
  res = mix(res, res * 0.8 + midTint * 0.2, mW);
  res = mix(res, res * 0.72 + highTint * 0.28, hW);
  return res;
}

vec3 liftGammaGain(vec3 c, vec3 lift, vec3 gamma, vec3 gain) {
  vec3 res = c * gain + lift * (1.0 - c);
  res = pow(max(res, vec3(0.0)), 1.0 / max(gamma, vec3(0.2)));
  return clamp(res, 0.0, 1.0);
}

void main() {
  vec2 uv = v_uv;
  vec2 px = 1.0 / max(u_resolution, vec2(1.0));
  vec3 c = texture(u_tex, uv).rgb;

  // Soft-skin subtle portrait smoothing (edge-preserving 5-tap blend)
  if (u_softSkin > 0.01) {
    vec3 n = texture(u_tex, clamp(uv + vec2(0.0, px.y * 2.0), 0.0, 1.0)).rgb;
    vec3 s = texture(u_tex, clamp(uv - vec2(0.0, px.y * 2.0), 0.0, 1.0)).rgb;
    vec3 e = texture(u_tex, clamp(uv + vec2(px.x * 2.0, 0.0), 0.0, 1.0)).rgb;
    vec3 w = texture(u_tex, clamp(uv - vec2(px.x * 2.0, 0.0), 0.0, 1.0)).rgb;
    vec3 avg = (c + n + s + e + w) * 0.2;
    float edgeMask = 1.0 - smoothstep(0.04, 0.16, length(c - avg));
    c = mix(c, avg, u_softSkin * 0.72 * edgeMask);
  }

  // Base exposure, contrast, saturation & temperature adjustments
  c = c * (1.0 + u_brightness * 0.65) + u_brightness * 0.12;
  c = (c - 0.5) * (1.0 + u_contrast * 0.85) + 0.5;
  c = setSat(c, max(0.0, 1.0 + u_saturation));
  c.r += u_temperature * 0.16;
  c.g += u_temperature * 0.04;
  c.b -= u_temperature * 0.16;
  c = clamp(c, 0.0, 1.0);

  // Subtle organic grain seed (used gently in film & IG vintage presets)
  float grain = (hash12(gl_FragCoord.xy + fract(u_time * 24.0) * 60.0) - 0.5);
  float radialDist = length(uv - vec2(0.5));

  // 1: ig-clarendon (Crisp cool highlights, punchy shadows, vibrant colors)
  if (u_filter == 1) {
    c = sCurve(c, 0.55);
    c = setSat(c, 1.24);
    c = splitTone(c, vec3(0.06, 0.14, 0.28), vec3(0.95, 0.98, 1.02), vec3(0.75, 0.94, 1.0), 0.42, 0.15, 0.36);
    c = liftGammaGain(c, vec3(0.0, 0.01, 0.03), vec3(1.03, 1.04, 1.06), vec3(1.04, 1.05, 1.08));
  }
  // 2: ig-juno (Warm vibrant reds/yellows, rich emerald greens, contrast pop)
  else if (u_filter == 2) {
    c = sCurve(c, 0.48);
    c = setSat(c, 1.28);
    c.r *= 1.07;
    c.g *= 1.03;
    c.b *= 0.95;
    c = splitTone(c, vec3(0.04, 0.16, 0.15), vec3(1.0, 0.92, 0.84), vec3(1.0, 0.88, 0.72), 0.35, 0.22, 0.35);
  }
  // 3: ig-lark (Bright airy exposure, cool teal blues, soft desaturated reds)
  else if (u_filter == 3) {
    c = liftGammaGain(c, vec3(0.04, 0.05, 0.06), vec3(1.12, 1.13, 1.14), vec3(1.04, 1.05, 1.06));
    float redExcess = max(0.0, c.r - max(c.g, c.b));
    c.r -= redExcess * 0.22;
    c = setSat(c, 0.92);
    c = splitTone(c, vec3(0.12, 0.20, 0.28), vec3(0.92, 0.98, 0.96), vec3(0.94, 0.99, 1.0), 0.32, 0.18, 0.25);
  }
  // 4: ig-valencia (Golden warm glow, creamy fade, vintage IG warmth)
  else if (u_filter == 4) {
    c = liftGammaGain(c, vec3(0.05, 0.04, 0.02), vec3(1.06, 1.04, 0.98), vec3(1.08, 1.03, 0.92));
    c = splitTone(c, vec3(0.24, 0.18, 0.10), vec3(1.0, 0.90, 0.72), vec3(1.0, 0.94, 0.76), 0.38, 0.28, 0.42);
    c = setSat(c, 1.08);
    c += grain * 0.022;
  }
  // 5: ig-nashville (Rosy peach highlights, cool violet/indigo shadows)
  else if (u_filter == 5) {
    c = liftGammaGain(c, vec3(0.05, 0.03, 0.12), vec3(1.08, 1.02, 0.98), vec3(1.06, 0.98, 0.92));
    c = splitTone(c, vec3(0.12, 0.10, 0.36), vec3(0.98, 0.84, 0.80), vec3(1.0, 0.84, 0.78), 0.45, 0.22, 0.46);
    c = sCurve(c, 0.25);
  }
  // 6: ig-aden (Pastel matte aesthetic, soft contrast, lavender-rose tint)
  else if (u_filter == 6) {
    c = mix(c, vec3(0.5), -0.14);
    c = liftGammaGain(c, vec3(0.08, 0.06, 0.09), vec3(1.06, 1.03, 1.05), vec3(0.96, 0.94, 0.95));
    c = setSat(c, 0.80);
    c = splitTone(c, vec3(0.22, 0.18, 0.26), vec3(0.94, 0.88, 0.90), vec3(1.0, 0.92, 0.88), 0.35, 0.24, 0.32);
  }
  // 7: ig-hudson (Icy arctic blue cast, crisp radial center highlight)
  else if (u_filter == 7) {
    float centerGlow = smoothstep(0.75, 0.0, radialDist) * 0.12;
    c += centerGlow;
    c = sCurve(c, 0.35);
    c = splitTone(c, vec3(0.05, 0.14, 0.30), vec3(0.84, 0.92, 1.0), vec3(0.88, 0.96, 1.0), 0.48, 0.25, 0.35);
    c *= 1.0 - smoothstep(0.35, 0.85, radialDist) * 0.22;
  }
  // 8: ig-slumber (Dreamy faded amber, lifted matte shadows, nostalgic haze)
  else if (u_filter == 8) {
    c = liftGammaGain(c, vec3(0.09, 0.07, 0.05), vec3(1.02, 1.00, 0.96), vec3(0.95, 0.92, 0.86));
    c = setSat(c, 0.78);
    c = splitTone(c, vec3(0.24, 0.18, 0.14), vec3(0.94, 0.88, 0.78), vec3(1.0, 0.92, 0.80), 0.45, 0.25, 0.35);
    c *= 1.0 - smoothstep(0.38, 0.9, radialDist) * 0.25;
  }
  // 9: teal-orange (Hollywood blockbuster split-tone preserving warm skin)
  else if (u_filter == 9) {
    c = sCurve(c, 0.62);
    c = setSat(c, 1.18);
    c = splitTone(c, vec3(0.02, 0.22, 0.28), vec3(0.96, 0.84, 0.72), vec3(1.0, 0.74, 0.48), 0.56, 0.20, 0.46);
    c = liftGammaGain(c, vec3(0.0, 0.02, 0.03), vec3(1.0, 0.99, 0.97), vec3(1.05, 1.01, 0.96));
  }
  // 10: kodak-portra (Creamy skin tones, gentle warmth, fine analog grain)
  else if (u_filter == 10) {
    c = liftGammaGain(c, vec3(0.03, 0.025, 0.02), vec3(1.05, 1.03, 1.0), vec3(1.04, 1.02, 0.98));
    c = setSat(c, 1.12);
    c = splitTone(c, vec3(0.14, 0.13, 0.16), vec3(1.0, 0.90, 0.80), vec3(1.0, 0.93, 0.82), 0.25, 0.22, 0.32);
    c += grain * 0.026;
  }
  // 11: cine-2383 (Kodak 2383 Print Film: deep rich blacks, dense filmic contrast)
  else if (u_filter == 11) {
    c = sCurve(c, 0.72);
    c = liftGammaGain(c, vec3(0.0, 0.01, 0.02), vec3(0.96, 0.97, 0.95), vec3(1.08, 1.04, 0.98));
    c = setSat(c, 1.16);
    c = splitTone(c, vec3(0.02, 0.12, 0.16), vec3(0.98, 0.92, 0.86), vec3(1.0, 0.90, 0.74), 0.42, 0.16, 0.34);
    c += grain * 0.024;
  }
  // 12: cine-dune (Desert sci-fi golden ochre atmosphere, bronze shadows)
  else if (u_filter == 12) {
    c = sCurve(c, 0.46);
    c = setSat(c, 0.74);
    c = splitTone(c, vec3(0.20, 0.12, 0.06), vec3(0.96, 0.76, 0.48), vec3(1.0, 0.90, 0.64), 0.54, 0.42, 0.48);
    c += grain * 0.025;
  }
  // 13: cine-matrix (1999 sci-fi phosphor green tint, cold contrast)
  else if (u_filter == 13) {
    c = sCurve(c, 0.58);
    c = setSat(c, 0.76);
    c = splitTone(c, vec3(0.02, 0.14, 0.07), vec3(0.55, 1.0, 0.65), vec3(0.84, 1.0, 0.88), 0.55, 0.44, 0.34);
  }
  // 14: cine-neon (Cyber noir: electric cyan shadows & magenta/violet highlights)
  else if (u_filter == 14) {
    c = sCurve(c, 0.60);
    c = setSat(c, 1.28);
    c = splitTone(c, vec3(0.02, 0.24, 0.38), vec3(0.75, 0.48, 0.96), vec3(1.0, 0.36, 0.82), 0.58, 0.26, 0.48);
  }
  // 15: leica-bw (High-contrast silver gelatin monochrome + fine grain)
  else if (u_filter == 15) {
    float bw = dot(c, vec3(0.32, 0.56, 0.12));
    bw = mix(bw, bw * bw * (3.0 - 2.0 * bw), 0.68);
    c = vec3(bw) + grain * 0.032;
  }
  // 16: matte-film (A24 indie cinema: lifted soft blacks, olive-slate shadows, cream highlights)
  else if (u_filter == 16) {
    c = liftGammaGain(c, vec3(0.08, 0.085, 0.075), vec3(1.02, 1.02, 0.99), vec3(0.92, 0.91, 0.87));
    c = setSat(c, 0.82);
    c = splitTone(c, vec3(0.14, 0.18, 0.15), vec3(0.94, 0.92, 0.86), vec3(1.0, 0.96, 0.88), 0.36, 0.20, 0.28);
    c += grain * 0.028;
  }
  // 17: vivid-pro (Studio crisp clarity & punchy balanced color)
  else if (u_filter == 17) {
    c = sCurve(c, 0.38);
    c = setSat(c, 1.32);
    c *= 1.03;
  }
  // 18: sepia-vintage (Warm 1968 archival sepia emulsion)
  else if (u_filter == 18) {
    float lum = luma(c);
    vec3 sep = vec3(lum * 1.12 + 0.05, lum * 0.92 + 0.02, lum * 0.68);
    c = mix(c, sep, 0.88);
    c = liftGammaGain(c, vec3(0.04, 0.03, 0.02), vec3(1.0, 0.98, 0.94), vec3(1.0, 0.98, 0.94));
    c += grain * 0.035;
  }
  // 19: cyanotype (Prussian blue editorial print)
  else if (u_filter == 19) {
    float lum = luma(c);
    lum = mix(lum, lum * lum * (3.0 - 2.0 * lum), 0.45);
    c = mix(vec3(0.03, 0.14, 0.34), vec3(0.80, 0.92, 1.0), lum);
  }
  // 20: document-scan (Clean high-contrast B&W document/whiteboard capture)
  else if (u_filter == 20) {
    float lum = luma(c);
    float crisp = smoothstep(0.24, 0.74, lum * 1.12);
    c = vec3(crisp);
  }

  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

// GPU Real-Time Visual Effects Fragment Shader (Simpsons, Anime, Halftone, Halation, Glitch, etc.)
const EFFECT_FRAG_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_tex;
uniform int u_effect;
uniform float u_intensity;
uniform vec2 u_resolution;
uniform float u_time;

out vec4 outColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 smoothSample9(vec2 uv, vec2 px) {
  vec3 sum = vec3(0.0);
  sum += texture(u_tex, clamp(uv + vec2(-px.x, -px.y), 0.0, 1.0)).rgb * 1.0;
  sum += texture(u_tex, clamp(uv + vec2(0.0,   -px.y), 0.0, 1.0)).rgb * 2.0;
  sum += texture(u_tex, clamp(uv + vec2(px.x,  -px.y), 0.0, 1.0)).rgb * 1.0;
  sum += texture(u_tex, clamp(uv + vec2(-px.x,  0.0),  0.0, 1.0)).rgb * 2.0;
  sum += texture(u_tex, uv).rgb * 4.0;
  sum += texture(u_tex, clamp(uv + vec2(px.x,   0.0),  0.0, 1.0)).rgb * 2.0;
  sum += texture(u_tex, clamp(uv + vec2(-px.x,  px.y), 0.0, 1.0)).rgb * 1.0;
  sum += texture(u_tex, clamp(uv + vec2(0.0,    px.y), 0.0, 1.0)).rgb * 2.0;
  sum += texture(u_tex, clamp(uv + vec2(px.x,   px.y), 0.0, 1.0)).rgb * 1.0;
  return sum / 16.0;
}

float sobelEdge(vec2 uv, vec2 px) {
  float tl = luma(texture(u_tex, clamp(uv + vec2(-px.x,  px.y), 0.0, 1.0)).rgb);
  float tc = luma(texture(u_tex, clamp(uv + vec2(0.0,    px.y), 0.0, 1.0)).rgb);
  float tr = luma(texture(u_tex, clamp(uv + vec2(px.x,   px.y), 0.0, 1.0)).rgb);
  float ml = luma(texture(u_tex, clamp(uv + vec2(-px.x,  0.0),  0.0, 1.0)).rgb);
  float mr = luma(texture(u_tex, clamp(uv + vec2(px.x,   0.0),  0.0, 1.0)).rgb);
  float bl = luma(texture(u_tex, clamp(uv + vec2(-px.x, -px.y), 0.0, 1.0)).rgb);
  float bc = luma(texture(u_tex, clamp(uv + vec2(0.0,   -px.y), 0.0, 1.0)).rgb);
  float br = luma(texture(u_tex, clamp(uv + vec2(px.x,  -px.y), 0.0, 1.0)).rgb);
  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  return sqrt(gx * gx + gy * gy);
}

void main() {
  vec2 uv = v_uv;
  vec2 px = 1.0 / max(u_resolution, vec2(1.0));
  vec3 color = texture(u_tex, uv).rgb;

  // 1: kaleidoscope-2
  if (u_effect == 1) {
    vec2 suv = uv;
    if (suv.x > 0.5) suv.x = 1.0 - suv.x;
    outColor = vec4(texture(u_tex, suv).rgb, 1.0);
    return;
  }

  // 2: kaleidoscope-4
  if (u_effect == 2) {
    vec2 suv = uv;
    if (suv.x > 0.5) suv.x = 1.0 - suv.x;
    if (suv.y < 0.5) suv.y = 1.0 - suv.y;
    outColor = vec4(texture(u_tex, suv).rgb, 1.0);
    return;
  }

  // 3: pixelate
  if (u_effect == 3) {
    float block = max(4.0, floor(6.0 + u_intensity * 26.0));
    vec2 grid = max(vec2(8.0), floor(u_resolution / block));
    vec2 puv = (floor(uv * grid) + 0.5) / grid;
    outColor = vec4(texture(u_tex, puv).rgb, 1.0);
    return;
  }

  // 4: pop-art 2x2
  if (u_effect == 4) {
    vec2 q = floor(uv * 2.0);
    vec2 subUv = fract(uv * 2.0);
    vec3 c = texture(u_tex, subUv).rgb;
    c = clamp((c - 0.5) * 1.65 + 0.5, 0.0, 1.0);
    float g = luma(c);
    vec3 tint = vec3(1.0);
    if (q.x < 0.5 && q.y > 0.5) tint = vec3(1.0, 0.35, 0.68);
    else if (q.x >= 0.5 && q.y > 0.5) tint = vec3(0.98, 0.80, 0.22);
    else if (q.x < 0.5 && q.y <= 0.5) tint = vec3(0.14, 0.82, 0.92);
    else tint = vec3(0.28, 0.90, 0.52);
    vec3 mixed = mix(c, mix(c * tint, tint * g * 1.35, 0.45), 0.72);
    outColor = vec4(clamp(mixed, 0.0, 1.0), 1.0);
    return;
  }

  // 5: thermal
  if (u_effect == 5) {
    float lum = luma(color);
    float t = clamp(lum * (0.85 + u_intensity * 0.35), 0.0, 1.0);
    vec3 therm;
    if (t < 0.25) {
      float k = t / 0.25;
      therm = vec3(0.06 + k * 0.29, 0.04, 0.24 + k * 0.55);
    } else if (t < 0.50) {
      float k = (t - 0.25) / 0.25;
      therm = vec3(0.35 + k * 0.57, 0.04 + k * 0.12, 0.79 - k * 0.55);
    } else if (t < 0.78) {
      float k = (t - 0.50) / 0.28;
      therm = vec3(0.92 + k * 0.08, 0.16 + k * 0.65, 0.24 - k * 0.22);
    } else {
      float k = (t - 0.78) / 0.22;
      therm = vec3(1.0, 0.81 + k * 0.19, 0.02 + k * 0.86);
    }
    outColor = vec4(therm, 1.0);
    return;
  }

  // 6: night-vision
  if (u_effect == 6) {
    float lum = luma(color);
    float boosted = clamp(lum * (1.25 + u_intensity * 0.48), 0.0, 1.0);
    float grain = (hash12(gl_FragCoord.xy + fract(u_time * 43.0) * 100.0) - 0.5) * (0.07 + u_intensity * 0.11);
    vec3 nv = vec3(
      clamp(boosted * 0.18 + grain * 0.3, 0.0, 1.0),
      clamp(boosted * 1.08 + grain, 0.0, 1.0),
      clamp(boosted * 0.25 + grain * 0.3, 0.0, 1.0)
    );
    float scan = mod(floor(gl_FragCoord.y), 3.0) < 1.0 ? 0.78 : 1.0;
    outColor = vec4(nv * scan, 1.0);
    return;
  }

  // 7: vhs-retro
  if (u_effect == 7) {
    float shiftPx = max(2.0, 3.0 + u_intensity * 9.0);
    float rowBand = floor(gl_FragCoord.y / 3.0);
    float jitterGate = step(0.95, hash12(vec2(rowBand, floor(u_time * 18.0))));
    float jitterPx = jitterGate * (hash12(vec2(floor(u_time * 30.0), rowBand)) - 0.5) * shiftPx * 2.2;
    float dx = (shiftPx + jitterPx) / u_resolution.x;
    float jx = jitterPx / u_resolution.x;

    float r = texture(u_tex, clamp(vec2(uv.x + dx, uv.y), 0.0, 1.0)).r;
    float g = texture(u_tex, clamp(vec2(uv.x + jx, uv.y), 0.0, 1.0)).g * 0.96;
    float b = texture(u_tex, clamp(vec2(uv.x - dx, uv.y), 0.0, 1.0)).b;

    float scan = mod(floor(gl_FragCoord.y), 3.0) < 1.0 ? 0.82 : 1.0;
    float tapeGrain = (hash12(gl_FragCoord.xy + fract(u_time * 60.0) * 90.0) - 0.5) * 0.04;
    outColor = vec4(clamp(vec3(r, g, b) * scan + tapeGrain, 0.0, 1.0), 1.0);
    return;
  }

  // 8: sketch-ink
  if (u_effect == 8) {
    float lc = luma(color);
    float lr = luma(texture(u_tex, clamp(uv + vec2(px.x, 0.0), 0.0, 1.0)).rgb);
    float ld = luma(texture(u_tex, clamp(uv + vec2(0.0, px.y), 0.0, 1.0)).rgb);
    float edge = abs(lc - lr) + abs(lc - ld);
    float ink = clamp(0.98 - edge * (3.2 + u_intensity * 3.8), 0.07, 0.98);
    float threshold = (240.0 - u_intensity * 80.0) / 255.0;
    float paper = ink > threshold ? 0.972 : ink;
    outColor = vec4(paper, max(0.0, paper - 0.008), max(0.0, paper - 0.024), 1.0);
    return;
  }

  // 9: simpson-toon (Los Simpson: Springfield Yellow skin cel-shading + bold black cartoon ink)
  if (u_effect == 9) {
    vec3 sm = smoothSample9(uv, px * 2.2);
    float lum = luma(sm);

    // Detect warm skin & peach midtones cleanly in RGB space
    float skinRG = smoothstep(0.02, 0.14, sm.r - sm.b) * smoothstep(-0.02, 0.08, sm.r - sm.g);
    float skinLum = smoothstep(0.16, 0.35, lum) * smoothstep(0.95, 0.72, lum);
    float isSkin = clamp(skinRG * skinLum * 1.45, 0.0, 1.0);

    // Quantize luminance into crisp 3-step cartoon cel bands
    float celLum = floor(lum * 3.6 + 0.35) / 3.6;
    celLum = clamp(mix(lum, celLum, 0.72), 0.08, 1.0);

    // Boost vibrant Matt Groening cartoon colors for clothing & background
    vec3 vivid = mix(vec3(lum), sm, 1.55);
    vivid = floor(vivid * 4.5 + 0.3) / 4.5;
    vivid = mix(vivid, vec3(0.44, 0.82, 1.0), smoothstep(0.15, 0.45, sm.b - sm.r) * 0.45);

    // Map detected skin/warm midtones to iconic Springfield Yellow (#FED90F) with cel shadow
    vec3 springfieldYellow = vec3(0.996, 0.851, 0.059);
    vec3 springfieldShadow = vec3(0.88, 0.67, 0.04);
    vec3 yellowShade = mix(springfieldShadow, springfieldYellow, smoothstep(0.28, 0.62, celLum));

    vec3 toonColor = mix(vivid, yellowShade, isSkin * (0.68 + u_intensity * 0.32));

    // Bold black cartoon outlines around facial & object contours
    float edge = sobelEdge(uv, px * 1.35);
    float inkMask = smoothstep(0.18 - u_intensity * 0.08, 0.34 - u_intensity * 0.10, edge);
    vec3 finalToon = mix(toonColor, vec3(0.04, 0.04, 0.05), inkMask * 0.94);

    outColor = vec4(clamp(finalToon, 0.0, 1.0), 1.0);
    return;
  }

  // 10: anime-cel (Crisp cel-shaded color bands + vibrant anime contrast + fine ink linework)
  if (u_effect == 10) {
    vec3 sm = smoothSample9(uv, px * 1.8);
    float lum = luma(sm);
    float qLum = floor(lum * 4.5 + 0.3) / 4.5;
    vec3 cel = sm * (qLum / max(0.05, lum));
    cel = mix(vec3(qLum), cel, 1.38);
    cel = clamp(cel * 1.06, 0.0, 1.0);

    float edge = sobelEdge(uv, px * 1.1);
    float ink = smoothstep(0.20 - u_intensity * 0.08, 0.38 - u_intensity * 0.10, edge);
    vec3 outAnime = mix(cel, vec3(0.06, 0.05, 0.09), ink * 0.88);
    outColor = vec4(outAnime, 1.0);
    return;
  }

  // 11: comic-halftone (Printed Ben-Day halftone dot screen + graphic black ink)
  if (u_effect == 11) {
    vec3 sm = smoothSample9(uv, px * 1.4);
    float lum = luma(sm);
    float dotScale = max(4.0, 6.0 + (1.0 - u_intensity) * 6.0);
    float angle = 0.52; // ~30 deg screen angle
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec2 cell = fract((rot * gl_FragCoord.xy) / dotScale) - 0.5;
    float d = length(cell);
    float radius = clamp((1.0 - lum) * 0.62, 0.05, 0.56);
    float halftone = smoothstep(radius + 0.06, radius - 0.06, d);

    vec3 popPaper = mix(vec3(0.98, 0.95, 0.88), sm * 1.35, 0.68);
    vec3 inkCol = mix(popPaper, vec3(0.08, 0.08, 0.12), halftone * 0.65);

    float edge = sobelEdge(uv, px * 1.2);
    float outline = smoothstep(0.20, 0.36, edge);
    inkCol = mix(inkCol, vec3(0.04), outline * 0.92);
    outColor = vec4(clamp(inkCol, 0.0, 1.0), 1.0);
    return;
  }

  // 12: dream-bloom (Instagram / Cinema Black Pro-Mist soft highlight glow)
  if (u_effect == 12) {
    vec3 glow = vec3(0.0);
    float spread = 3.5 + u_intensity * 7.5;
    for (int i = -2; i <= 2; i++) {
      for (int j = -2; j <= 2; j++) {
        vec2 off = vec2(float(i), float(j)) * px * spread;
        vec3 s = texture(u_tex, clamp(uv + off, 0.0, 1.0)).rgb;
        float hl = smoothstep(0.55, 1.0, luma(s));
        glow += s * hl;
      }
    }
    glow /= 25.0;
    vec3 soft = mix(color, smoothSample9(uv, px * 2.0), u_intensity * 0.28);
    vec3 bloomed = 1.0 - (1.0 - soft) * (1.0 - glow * (0.45 + u_intensity * 0.55));
    outColor = vec4(clamp(bloomed, 0.0, 1.0), 1.0);
    return;
  }

  // 13: cinema-halation (35mm film red-orange highlight halation + organic film grain)
  if (u_effect == 13) {
    vec3 halo = vec3(0.0);
    float spread = 4.0 + u_intensity * 8.0;
    for (int i = -2; i <= 2; i++) {
      for (int j = -2; j <= 2; j++) {
        vec2 off = vec2(float(i), float(j)) * px * spread;
        vec3 s = texture(u_tex, clamp(uv + off, 0.0, 1.0)).rgb;
        float bright = smoothstep(0.66, 1.0, luma(s));
        halo += s * bright;
      }
    }
    halo /= 25.0;
    vec3 redHalation = halo * vec3(1.25, 0.34, 0.12) * (0.55 + u_intensity * 0.75);
    float grain = (hash12(gl_FragCoord.xy + fract(u_time * 24.0) * 80.0) - 0.5) * (0.04 + u_intensity * 0.03);
    vec3 outHal = color + redHalation + grain;
    outColor = vec4(clamp(outHal, 0.0, 1.0), 1.0);
    return;
  }

  // 14: cyberpunk-glitch (Neon cyan/magenta RGB split + animated glitch blocks)
  if (u_effect == 14) {
    float band = floor(uv.y * 26.0);
    float tick = floor(u_time * 12.0);
    float trig = step(0.86, hash12(vec2(band, tick)));
    float blockShift = trig * (hash12(vec2(tick, band)) - 0.5) * (0.04 + u_intensity * 0.07);
    float split = (2.5 + u_intensity * 8.0) * px.x;

    float r = texture(u_tex, clamp(vec2(uv.x + blockShift + split, uv.y), 0.0, 1.0)).r;
    float g = texture(u_tex, clamp(vec2(uv.x + blockShift, uv.y), 0.0, 1.0)).g;
    float b = texture(u_tex, clamp(vec2(uv.x + blockShift - split, uv.y), 0.0, 1.0)).b;

    vec3 cyber = vec3(r * 1.12, g * 0.90, b * 1.18);
    float lum = luma(cyber);
    cyber = mix(cyber, mix(vec3(0.04, 0.85, 0.98), vec3(0.98, 0.16, 0.72), lum), 0.24 + u_intensity * 0.20);
    float scan = mod(floor(gl_FragCoord.y), 4.0) < 1.0 ? 0.86 : 1.0;
    outColor = vec4(clamp(cyber * scan, 0.0, 1.0), 1.0);
    return;
  }

  // 15: vaporwave (80s synthwave duotone gradient + CRT glow)
  if (u_effect == 15) {
    float lum = luma(color);
    vec3 deepPurple = vec3(0.11, 0.04, 0.28);
    vec3 neonPink = vec3(0.98, 0.22, 0.68);
    vec3 electricCyan = vec3(0.18, 0.94, 0.98);
    vec3 grad = lum < 0.5
      ? mix(deepPurple, neonPink, lum * 2.0)
      : mix(neonPink, electricCyan, (lum - 0.5) * 2.0);
    vec3 vap = mix(color, grad, 0.55 + u_intensity * 0.42);
    float scan = mod(floor(gl_FragCoord.y), 3.0) < 1.0 ? 0.88 : 1.0;
    outColor = vec4(clamp(vap * scan, 0.0, 1.0), 1.0);
    return;
  }

  outColor = vec4(color, 1.0);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

function ensureWebglPipeline(): WebglPipelineState | null {
  if (webglUnavailable) return null;
  if (state && !state.gl.isContextLost()) return state;

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      webglUnavailable = true;
      return null;
    }

    const effectProgram = linkProgram(gl, VERT_SRC, EFFECT_FRAG_SRC);
    const colorProgram = linkProgram(gl, VERT_SRC, COLOR_FRAG_SRC);
    if (!effectProgram || !colorProgram) {
      webglUnavailable = true;
      return null;
    }

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const texture = gl.createTexture();
    if (!vao || !vbo || !texture) {
      webglUnavailable = true;
      return null;
    }

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLocEffect = gl.getAttribLocation(effectProgram, 'a_pos');
    if (posLocEffect >= 0) {
      gl.enableVertexAttribArray(posLocEffect);
      gl.vertexAttribPointer(posLocEffect, 2, gl.FLOAT, false, 0, 0);
    }
    const posLocColor = gl.getAttribLocation(colorProgram, 'a_pos');
    if (posLocColor >= 0 && posLocColor !== posLocEffect) {
      gl.enableVertexAttribArray(posLocColor);
      gl.vertexAttribPointer(posLocColor, 2, gl.FLOAT, false, 0, 0);
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    state = {
      canvas,
      gl,
      vao,
      texture,
      effectProgram,
      uEffect: gl.getUniformLocation(effectProgram, 'u_effect'),
      uIntensity: gl.getUniformLocation(effectProgram, 'u_intensity'),
      uResolution: gl.getUniformLocation(effectProgram, 'u_resolution'),
      uTime: gl.getUniformLocation(effectProgram, 'u_time'),
      colorProgram,
      uFilter: gl.getUniformLocation(colorProgram, 'u_filter'),
      uBrightness: gl.getUniformLocation(colorProgram, 'u_brightness'),
      uContrast: gl.getUniformLocation(colorProgram, 'u_contrast'),
      uSaturation: gl.getUniformLocation(colorProgram, 'u_saturation'),
      uTemperature: gl.getUniformLocation(colorProgram, 'u_temperature'),
      uSoftSkin: gl.getUniformLocation(colorProgram, 'u_softSkin'),
      uColorRes: gl.getUniformLocation(colorProgram, 'u_resolution'),
      uColorTime: gl.getUniformLocation(colorProgram, 'u_time'),
    };
    return state;
  } catch {
    webglUnavailable = true;
    return null;
  }
}

const FILTER_INDEX: Record<FilterPresetId, number> = {
  none: 0,
  'ig-clarendon': 1,
  'ig-juno': 2,
  'ig-lark': 3,
  'ig-valencia': 4,
  'ig-nashville': 5,
  'ig-aden': 6,
  'ig-hudson': 7,
  'ig-slumber': 8,
  'teal-orange': 9,
  'kodak-portra': 10,
  'cine-2383': 11,
  'cine-dune': 12,
  'cine-matrix': 13,
  'cine-neon': 14,
  'leica-bw': 15,
  'matte-film': 16,
  'vivid-pro': 17,
  'sepia-vintage': 18,
  cyanotype: 19,
  'document-scan': 20,
};

const EFFECT_INDEX: Record<VisualEffectId, number> = {
  none: 0,
  'kaleidoscope-2': 1,
  'kaleidoscope-4': 2,
  pixelate: 3,
  'pop-art': 4,
  thermal: 5,
  'night-vision': 6,
  'vhs-retro': 7,
  'sketch-ink': 8,
  'simpson-toon': 9,
  'anime-cel': 10,
  'comic-halftone': 11,
  'dream-bloom': 12,
  'cinema-halation': 13,
  'cyberpunk-glitch': 14,
  vaporwave: 15,
};

/**
 * Renders Instagram / Cinema / Film color grading LUTs & adjustments on the GPU via WebGL2.
 */
export function applyWebglColorFilter(
  srcCanvas: HTMLCanvasElement,
  dstCtx: CanvasRenderingContext2D,
  filterId: FilterPresetId,
  adjustments: ColorAdjustments,
  width: number,
  height: number
): boolean {
  const pipe = ensureWebglPipeline();
  if (!pipe) return false;

  const {
    canvas,
    gl,
    vao,
    texture,
    colorProgram,
    uFilter,
    uBrightness,
    uContrast,
    uSaturation,
    uTemperature,
    uSoftSkin,
    uColorRes,
    uColorTime,
  } = pipe;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  gl.viewport(0, 0, width, height);
  gl.useProgram(colorProgram);
  gl.bindVertexArray(vao);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);

  gl.uniform1i(uFilter, FILTER_INDEX[filterId] ?? 0);
  gl.uniform1f(uBrightness, adjustments.brightness / 50);
  gl.uniform1f(uContrast, adjustments.contrast / 50);
  gl.uniform1f(uSaturation, adjustments.saturation / 100);
  gl.uniform1f(uTemperature, adjustments.temperature / 50);
  gl.uniform1f(uSoftSkin, adjustments.softSkin / 100);
  gl.uniform2f(uColorRes, width, height);
  gl.uniform1f(uColorTime, performance.now() / 1000);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  dstCtx.save();
  dstCtx.clearRect(0, 0, width, height);
  dstCtx.drawImage(canvas, 0, 0, width, height);
  dstCtx.restore();

  return true;
}

/**
 * Renders visual effects on the GPU via WebGL2 at full native resolution.
 * Returns true if rendered via WebGL2, or false so caller can fall back to Canvas 2D.
 */
export function applyWebglVisualEffect(
  srcCanvas: HTMLCanvasElement,
  dstCtx: CanvasRenderingContext2D,
  effectId: VisualEffectId,
  width: number,
  height: number,
  intensity: number
): boolean {
  const idx = EFFECT_INDEX[effectId] ?? 0;
  if (idx === 0) return false;

  const pipe = ensureWebglPipeline();
  if (!pipe) return false;

  const {
    canvas,
    gl,
    effectProgram,
    vao,
    texture,
    uEffect,
    uIntensity,
    uResolution,
    uTime,
  } = pipe;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  gl.viewport(0, 0, width, height);
  gl.useProgram(effectProgram);
  gl.bindVertexArray(vao);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);

  gl.uniform1i(uEffect, idx);
  gl.uniform1f(uIntensity, intensity / 100);
  gl.uniform2f(uResolution, width, height);
  gl.uniform1f(uTime, performance.now() / 1000);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  dstCtx.drawImage(canvas, 0, 0, width, height);

  // Crisp VHS date stamp overlay on 2D context
  if (effectId === 'vhs-retro') {
    const now = new Date();
    const stamp = `PLAY ►  ${now.toLocaleDateString('es-ES')}  ${now.toLocaleTimeString('es-ES')}`;
    dstCtx.save();
    dstCtx.font = `600 ${Math.max(14, Math.round(height * 0.032))}px "JetBrains Mono", monospace`;
    dstCtx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    dstCtx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    dstCtx.shadowBlur = 4;
    dstCtx.fillText(stamp, Math.round(width * 0.04), Math.round(height * 0.92));
    dstCtx.restore();
  }

  return true;
}
