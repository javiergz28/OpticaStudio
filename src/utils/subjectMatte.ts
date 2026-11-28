/** Temporal matte for one aligned camera stream; no media or DOM dependencies. */
export class SubjectMatte {
  private previous: Float32Array | null = null;
  private key = '';
  private lastTime = -Infinity;
  reset() { this.previous = null; this.key = ''; this.lastTime = -Infinity; }
  update(conf: Float32Array, width: number, height: number, sensitivity: number,
    softness: number, invert: boolean, timestamp: number): Float32Array | null {
    const n = width * height;
    if (!Number.isSafeInteger(n) || n <= 0 || conf.length < n ||
        ![sensitivity, softness, timestamp].every(Number.isFinite)) { this.reset(); return null; }
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(conf[i])) { this.reset(); return null; }
    }
    const key = [width, height, sensitivity, softness, invert].join(':');
    const fresh = !this.previous || this.key !== key || timestamp - this.lastTime > 250 || timestamp < this.lastTime;
    if (fresh || this.previous!.length !== n) this.previous = new Float32Array(n);
    const out = this.previous!;
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const mid = 0.84 - Math.max(0.1, Math.min(0.9, sensitivity / 100)) * 0.64;
    const band = 0.06 + clamp(softness / 100) * 0.18;
    const lo = Math.max(0.02, mid - band), hi = Math.min(0.98, mid + band);
    for (let i = 0; i < n; i++) {
      const prob = clamp(invert ? 1 - conf[i] : conf[i]);
      const t = clamp((prob - lo) / (hi - lo));
      const matte = t * t * (3 - 2 * t);
      const delta = Math.abs(matte - out[i]);
      // Stable hair/border alpha at rest, fast motion-adaptive convergence for hand gestures.
      const response = delta > 0.25 ? Math.min(1, 0.88 + (delta - 0.25) * 0.35) : 0.44;
      out[i] = fresh || matte === 0 || matte === 1 ? matte : out[i] + (matte - out[i]) * response;
    }
    this.key = key; this.lastTime = timestamp;
    return out;
  }
}

/** Applies real alpha to the isolated camera surface, never to ProgramCanvas. */
export function applySubjectAlpha(ctx: CanvasRenderingContext2D, mask: CanvasImageSource,
  width: number, height: number, softness: number): void {
  ctx.save();
  try {
    ctx.globalCompositeOperation = 'destination-in';
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const safeSoft = Math.max(0, Math.min(100, softness));
    const feather =
      safeSoft <= 20 ? 0 : ((safeSoft - 20) / 80) * 1.15 * Math.min(1.25, width / 1280);
    ctx.filter = feather > 0.25 ? `blur(${feather.toFixed(2)}px)` : 'none';
    ctx.drawImage(mask, 0, 0, width, height);
  } finally { ctx.restore(); }
}

/** Reusable Float32 scratch buffers to keep O(N) guided filtering zero-allocation per frame. */
let scratchCapacity = 0;
let pBuf = new Float32Array(0);
let yBuf = new Float32Array(0);
let cbBuf = new Float32Array(0);
let crBuf = new Float32Array(0);
let mPBuf = new Float32Array(0);
let mYBuf = new Float32Array(0);
let mCbBuf = new Float32Array(0);
let mCrBuf = new Float32Array(0);
let prodBuf = new Float32Array(0);
let meanProdBuf = new Float32Array(0);
let varSumBuf = new Float32Array(0);
let covYPBuf = new Float32Array(0);
let covCbPBuf = new Float32Array(0);
let covCrPBuf = new Float32Array(0);
let aYBuf = new Float32Array(0);
let aCbBuf = new Float32Array(0);
let aCrBuf = new Float32Array(0);
let bBuf = new Float32Array(0);
let maYBuf = new Float32Array(0);
let maCbBuf = new Float32Array(0);
let maCrBuf = new Float32Array(0);
let mbBuf = new Float32Array(0);
let tmpBuf = new Float32Array(0);
let columnSums = new Float64Array(0);

function ensureGuidedScratch(n: number): void {
  if (scratchCapacity >= n) return;
  scratchCapacity = n;
  pBuf = new Float32Array(n);
  yBuf = new Float32Array(n);
  cbBuf = new Float32Array(n);
  crBuf = new Float32Array(n);
  mPBuf = new Float32Array(n);
  mYBuf = new Float32Array(n);
  mCbBuf = new Float32Array(n);
  mCrBuf = new Float32Array(n);
  prodBuf = new Float32Array(n);
  meanProdBuf = new Float32Array(n);
  varSumBuf = new Float32Array(n);
  covYPBuf = new Float32Array(n);
  covCbPBuf = new Float32Array(n);
  covCrPBuf = new Float32Array(n);
  aYBuf = new Float32Array(n);
  aCbBuf = new Float32Array(n);
  aCrBuf = new Float32Array(n);
  bBuf = new Float32Array(n);
  maYBuf = new Float32Array(n);
  maCbBuf = new Float32Array(n);
  maCrBuf = new Float32Array(n);
  mbBuf = new Float32Array(n);
  tmpBuf = new Float32Array(n);
}

/** O(N) separable sliding-window box filter with clamp-to-edge boundaries. */
function boxMean2D(
  src: Float32Array,
  dst: Float32Array,
  tmp: Float32Array,
  w: number,
  h: number,
  rx: number,
  ry: number
): void {
  const n = w * h;
  if (rx <= 0 && ry <= 0) {
    dst.set(src.subarray(0, n));
    return;
  }

  const hDst = ry > 0 ? tmp : dst;
  if (rx > 0) {
    const winW = 2 * rx + 1;
    const invW = 1 / winW;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let k = -rx; k <= rx; k++) {
        const cx = k < 0 ? 0 : k >= w ? w - 1 : k;
        sum += src[row + cx];
      }
      hDst[row] = sum * invW;
      for (let x = 1; x < w; x++) {
        const addIdx = x + rx < w ? x + rx : w - 1;
        const subIdx = x - rx - 1 >= 0 ? x - rx - 1 : 0;
        sum += src[row + addIdx] - src[row + subIdx];
        hDst[row + x] = sum * invW;
      }
    }
  } else {
    hDst.set(src.subarray(0, n));
  }

  if (ry > 0) {
    const winH = 2 * ry + 1;
    const invH = 1 / winH;
    if(columnSums.length<w)columnSums=new Float64Array(w);
    columnSums.fill(0,0,w);
    for(let k=-ry;k<=ry;k++){
      const row=Math.max(0,Math.min(h-1,k))*w;
      for(let x=0;x<w;x++)columnSums[x]+=hDst[row+x];
    }
    for(let x=0;x<w;x++)dst[x]=columnSums[x]*invH;
    for(let y=1;y<h;y++){
      const add=Math.min(h-1,y+ry)*w,sub=Math.max(0,y-ry-1)*w,row=y*w;
      for(let x=0;x<w;x++){
        const sum=columnSums[x]+(hDst[add+x]-hDst[sub+x]);
        columnSums[x]=sum;dst[row+x]=sum*invH;
      }
    }
  }
}

/**
 * O(N) Fast Edge-Aware YCbCr Guided Filter for upsampling a confidence matte onto the aligned camera guide.
 * Interior definite foreground (>=0.996) and background (<=0.004) are locked; uniform guide produces no synthetic edge.
 */
function refineGuidedRegion(
  alpha: Float32Array, mw: number, mh: number,
  guide: Uint8ClampedArray, fullW: number, fullH: number, out: Uint8ClampedArray,
  left: number, top: number, right: number, bottom: number,
  writeLeft: number, writeTop: number, writeRight: number, writeBottom: number,
  radius: number
): void {
  const w=right-left,h=bottom-top;
  if (mw < 1 || mh < 1 || w < 1 || h < 1 ||
      alpha.length < mw * mh || guide.length < fullW * fullH * 4 || out.length < fullW * fullH * 4) {
    throw new Error('Dimensiones de máscara y guía incompatibles');
  }

  const n = w * h;
  ensureGuidedScratch(n);

  // 1. Bilinear base upsample P + normalized YCbCr guide extraction
  const inv255 = 1 / 255;
  for (let y = 0; y < h; y++) {
    const my = Math.max(0, Math.min(mh - 1, (y + top + 0.5) * mh / fullH - 0.5));
    const y0 = Math.floor(my);
    const y1 = Math.min(mh - 1, y0 + 1);
    const fy = my - y0;
    const row0 = y0 * mw;
    const row1 = y1 * mw;
    for (let x = 0; x < w; x++) {
      const mx = Math.max(0, Math.min(mw - 1, (x + left + 0.5) * mw / fullW - 0.5));
      const x0 = Math.floor(mx);
      const x1 = Math.min(mw - 1, x0 + 1);
      const fx = mx - x0;
      const a = alpha[row0 + x0];
      const b = alpha[row0 + x1];
      const c = alpha[row1 + x0];
      const d = alpha[row1 + x1];
      const p = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;

      const idx = y * w + x;
      const i4 = ((y+top)*fullW+x+left)*4;
      const r = guide[i4] * inv255;
      const g = guide[i4 + 1] * inv255;
      const bl = guide[i4 + 2] * inv255;

      pBuf[idx] = p;
      yBuf[idx] = 0.299 * r + 0.587 * g + 0.114 * bl;
      cbBuf[idx] = -0.168736 * r - 0.331264 * g + 0.5 * bl;
      crBuf[idx] = 0.5 * r - 0.418688 * g - 0.081312 * bl;
    }
  }

  const rBase = radius;
  const rx = w > 1 ? Math.min(rBase, w - 1) : 0;
  const ry = h > 1 ? Math.min(rBase, h - 1) : 0;

  // 2. Local means
  boxMean2D(pBuf, mPBuf, tmpBuf, w, h, rx, ry);
  boxMean2D(yBuf, mYBuf, tmpBuf, w, h, rx, ry);
  boxMean2D(cbBuf, mCbBuf, tmpBuf, w, h, rx, ry);
  boxMean2D(crBuf, mCrBuf, tmpBuf, w, h, rx, ry);

  // 3. Variances + cross-covariances (isotropic 3D color-edge formulation avoids 3x overshoot)
  for (let i = 0; i < n; i++) prodBuf[i] = yBuf[i] * yBuf[i];
  boxMean2D(prodBuf, meanProdBuf, tmpBuf, w, h, rx, ry);
  for (let i = 0; i < n; i++) varSumBuf[i] = Math.max(0, meanProdBuf[i] - mYBuf[i] * mYBuf[i]);

  for (let i = 0; i < n; i++) prodBuf[i] = cbBuf[i] * cbBuf[i];
  boxMean2D(prodBuf, meanProdBuf, tmpBuf, w, h, rx, ry);
  for (let i = 0; i < n; i++) varSumBuf[i] += Math.max(0, meanProdBuf[i] - mCbBuf[i] * mCbBuf[i]);

  for (let i = 0; i < n; i++) prodBuf[i] = crBuf[i] * crBuf[i];
  boxMean2D(prodBuf, meanProdBuf, tmpBuf, w, h, rx, ry);
  for (let i = 0; i < n; i++) varSumBuf[i] += Math.max(0, meanProdBuf[i] - mCrBuf[i] * mCrBuf[i]);

  for (let i = 0; i < n; i++) prodBuf[i] = yBuf[i] * pBuf[i];
  boxMean2D(prodBuf, meanProdBuf, tmpBuf, w, h, rx, ry);
  for (let i = 0; i < n; i++) covYPBuf[i] = meanProdBuf[i] - mYBuf[i] * mPBuf[i];

  for (let i = 0; i < n; i++) prodBuf[i] = cbBuf[i] * pBuf[i];
  boxMean2D(prodBuf, meanProdBuf, tmpBuf, w, h, rx, ry);
  for (let i = 0; i < n; i++) covCbPBuf[i] = meanProdBuf[i] - mCbBuf[i] * mPBuf[i];

  for (let i = 0; i < n; i++) prodBuf[i] = crBuf[i] * pBuf[i];
  boxMean2D(prodBuf, meanProdBuf, tmpBuf, w, h, rx, ry);
  for (let i = 0; i < n; i++) covCrPBuf[i] = meanProdBuf[i] - mCrBuf[i] * mPBuf[i];

  // 4. Linear coefficients a, b
  const eps = 0.0022;
  for (let i = 0; i < n; i++) {
    const denom = varSumBuf[i] + eps;
    const ay = covYPBuf[i] / denom;
    const acb = covCbPBuf[i] / denom;
    const acr = covCrPBuf[i] / denom;
    aYBuf[i] = ay;
    aCbBuf[i] = acb;
    aCrBuf[i] = acr;
    bBuf[i] = mPBuf[i] - ay * mYBuf[i] - acb * mCbBuf[i] - acr * mCrBuf[i];
  }

  // 5. Average coefficients across overlapping windows
  boxMean2D(aYBuf, maYBuf, tmpBuf, w, h, rx, ry);
  boxMean2D(aCbBuf, maCbBuf, tmpBuf, w, h, rx, ry);
  boxMean2D(aCrBuf, maCrBuf, tmpBuf, w, h, rx, ry);
  boxMean2D(bBuf, mbBuf, tmpBuf, w, h, rx, ry);

  // 6. Edge-banded reconstruction preserving locked interiors and preventing silhouette hallucination
  for (let y = writeTop-top; y < writeBottom-top; y++) {
    const my = Math.max(0, Math.min(mh - 1, (y + top + 0.5) * mh / fullH - 0.5));
    const y0 = Math.floor(my);
    const y1 = Math.min(mh - 1, y0 + 1);
    const row0 = y0 * mw;
    const row1 = y1 * mw;
    for (let x = writeLeft-left; x < writeRight-left; x++) {
      const idx = y * w + x;
      const base = pBuf[idx];
      let value = base;

      if (base > 0.004 && base < 0.996) {
        const mx = Math.max(0, Math.min(mw - 1, (x + left + 0.5) * mw / fullW - 0.5));
        const x0 = Math.floor(mx);
        const x1 = Math.min(mw - 1, x0 + 1);
        const a = alpha[row0 + x0];
        const b = alpha[row0 + x1];
        const c = alpha[row1 + x0];
        const d = alpha[row1 + x1];
        const localMin = Math.min(a, b, c, d);
        const localMax = Math.max(a, b, c, d);

        if (localMax - localMin > 0.015) {
          const guided =
            maYBuf[idx] * yBuf[idx] +
            maCbBuf[idx] * cbBuf[idx] +
            maCrBuf[idx] * crBuf[idx] +
            mbBuf[idx];
          const loClamp = Math.max(0, localMin - 0.02);
          const hiClamp = Math.min(1, localMax + 0.02);
          value = Math.max(loClamp, Math.min(hiClamp, guided));
        }
      }

      const i4 = ((y+top)*fullW+x+left)*4;
      out[i4] = 255;
      out[i4 + 1] = 255;
      out[i4 + 2] = 255;
      out[i4 + 3] = Math.round(Math.max(0, Math.min(1, value)) * 255);
    }
  }
}

// One tile can be skipped entirely if no output pixel can enter the guided branch.
// The two box-filter stages have a total support of 2r; the halo makes tiled
// processing equivalent to the original full-frame filter, including global borders.
const GUIDED_TILE=48;
let guidedTiles=new Uint8Array(0);
let axisX0=new Int32Array(0),axisX1=new Int32Array(0),axisFx=new Float64Array(0);
let axisY0=new Int32Array(0),axisY1=new Int32Array(0),axisFy=new Float64Array(0);
let axisKey='';
export function refineGuidedAlpha(
  alpha: Float32Array, mw: number, mh: number,
  guide: Uint8ClampedArray, w: number, h: number, out: Uint8ClampedArray,
  fullFrameReference = false
): void {
  if (mw<1 || mh<1 || w<1 || h<1 || alpha.length<mw*mh || guide.length<w*h*4 || out.length<w*h*4)
    throw new Error('Dimensiones de máscara y guía incompatibles');
  const r=Math.max(2,Math.min(5,Math.round(Math.min(w,h)/110)));
  // Full-frame reference path is also useful for deterministic diagnostic comparisons.
  if(fullFrameReference){
    refineGuidedRegion(alpha,mw,mh,guide,w,h,out,0,0,w,h,0,0,w,h,r);return;
  }
  const cols=Math.ceil(w/GUIDED_TILE), rows=Math.ceil(h/GUIDED_TILE), count=cols*rows;
  if(guidedTiles.length<count) guidedTiles=new Uint8Array(count);
  guidedTiles.fill(0,0,count);
  const key=[mw,mh,w,h].join(':');
  if(axisKey!==key) {
    axisX0=new Int32Array(w);axisX1=new Int32Array(w);axisFx=new Float64Array(w);
    axisY0=new Int32Array(h);axisY1=new Int32Array(h);axisFy=new Float64Array(h);
    for(let x=0;x<w;x++){const f=Math.max(0,Math.min(mw-1,(x+.5)*mw/w-.5));axisX0[x]=Math.floor(f);axisX1[x]=Math.min(mw-1,axisX0[x]+1);axisFx[x]=f-axisX0[x];}
    for(let y=0;y<h;y++){const f=Math.max(0,Math.min(mh-1,(y+.5)*mh/h-.5));axisY0[y]=Math.floor(f);axisY1[y]=Math.min(mh-1,axisY0[y]+1);axisFy[y]=f-axisY0[y];}
    axisKey=key;
  }
  let active=0;
  for(let y=0;y<h;y++){
    const row0=axisY0[y]*mw,row1=axisY1[y]*mw,fy=axisFy[y];
    const tileRow=Math.floor(y/GUIDED_TILE)*cols;
    for(let x=0;x<w;x++){
      const a=alpha[row0+axisX0[x]],b=alpha[row0+axisX1[x]],c=alpha[row1+axisX0[x]],d=alpha[row1+axisX1[x]],fx=axisFx[x];
      const base=Math.fround((a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy);
      const idx=(y*w+x)*4;
      out[idx]=out[idx+1]=out[idx+2]=255;
      out[idx+3]=Math.round(Math.max(0,Math.min(1,base))*255);
      if(base>.004&&base<.996&&Math.max(a,b,c,d)-Math.min(a,b,c,d)>.015){
        const tile=tileRow+Math.floor(x/GUIDED_TILE);
        if(!guidedTiles[tile]){guidedTiles[tile]=1;active++;}
      }
    }
  }
  if(!active)return;
  // Dense/fully uncertain masks are cheaper as one region; same visual algorithm.
  if(active/count>=.65){
    refineGuidedRegion(alpha,mw,mh,guide,w,h,out,0,0,w,h,0,0,w,h,r);return;
  }
  const halo=2*r;
  for(let ty=0;ty<rows;ty++)for(let tx=0;tx<cols;tx++){
    if(!guidedTiles[ty*cols+tx])continue;
    const l=tx*GUIDED_TILE,t=ty*GUIDED_TILE,rr=Math.min(w,l+GUIDED_TILE),bb=Math.min(h,t+GUIDED_TILE);
    refineGuidedRegion(alpha,mw,mh,guide,w,h,out,Math.max(0,l-halo),Math.max(0,t-halo),
      Math.min(w,rr+halo),Math.min(h,bb+halo),l,t,rr,bb,r);
  }
}

/**
 * Pure CPU foreground edge color decontamination for semi-transparent border pixels (0 < alpha < 235).
 * Replaces background spill (dark/bright wall tint) with nearest opaque interior foreground RGB.
 */
export function decontaminateEdgeColors(rgba: Uint8ClampedArray, w: number, h: number): void {
  if (w < 1 || h < 1 || rgba.length < w * h * 4) return;
  const copy = new Uint8ClampedArray(rgba);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const a = copy[idx + 3];
      if (a <= 1 || a >= 235) continue;

      let sumW = 0;
      let accR = 0;
      let accG = 0;
      let accB = 0;

      for (let dy = -2; dy <= 2; dy++) {
        const ny = Math.max(0, Math.min(h - 1, y + dy));
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = Math.max(0, Math.min(w - 1, x + dx));
          const nIdx = (ny * w + nx) * 4;
          const na = copy[nIdx + 3];
          const weight = Math.max(0, na - a * 0.5);
          if (weight > 0) {
            sumW += weight;
            accR += copy[nIdx] * weight;
            accG += copy[nIdx + 1] * weight;
            accB += copy[nIdx + 2] * weight;
          }
        }
      }

      if (sumW > 0) {
        const fgR = accR / sumW;
        const fgG = accG / sumW;
        const fgB = accB / sumW;
        const mix = Math.min(0.92, ((235 - a) / 235) * 1.4);
        rgba[idx] = Math.round(copy[idx] + (fgR - copy[idx]) * mix);
        rgba[idx + 1] = Math.round(copy[idx + 1] + (fgG - copy[idx + 1]) * mix);
        rgba[idx + 2] = Math.round(copy[idx + 2] + (fgB - copy[idx + 2]) * mix);
      }
    }
  }
}
