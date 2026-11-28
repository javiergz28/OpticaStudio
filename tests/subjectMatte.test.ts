import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SubjectMatte,
  applySubjectAlpha,
  decontaminateEdgeColors,
  refineGuidedAlpha,
} from '../src/utils/subjectMatte';

test('CP-P02-C3: first frame preserves definite foreground/background and partial edge', () => {
  const m = new SubjectMatte();
  const a = m.update(new Float32Array([0, .52, 1]), 3, 1, 50, 55, false, 1)!;
  assert.equal(a[0], 0); assert.equal(a[2], 1); assert.ok(a[1] > .35 && a[1] < .65);
});
test('CP-P02-C3: temporal smoothing and immediate clearing of definite background', () => {
  const m = new SubjectMatte();
  const a = m.update(new Float32Array([.52]), 1, 1, 50, 55, false, 1)![0];
  const b = m.update(new Float32Array([.55]), 1, 1, 50, 55, false, 33)![0];
  const fresh = new SubjectMatte().update(new Float32Array([.55]), 1, 1, 50, 55, false, 33)![0];
  assert.ok(b > a && b < fresh);
  assert.equal(m.update(new Float32Array([0]), 1, 1, 50, 55, false, 65)![0], 0);
});
test('CP-P02-C3: source reset, geometry, settings and elapsed time invalidate history', () => {
  const m = new SubjectMatte();
  const fresh = new SubjectMatte().update(new Float32Array([.55]), 1, 1, 50, 55, false, 1)![0];
  m.update(new Float32Array([.48]), 1, 1, 50, 55, false, 1);
  assert.equal(m.update(new Float32Array([.55]), 1, 1, 50, 55, false, 300)![0], fresh);
  m.reset(); assert.equal(m.update(new Float32Array([.55]), 1, 1, 50, 55, false, 1)![0], fresh);
  assert.deepEqual([...m.update(new Float32Array([1, 0]), 2, 1, 50, 55, true, 2)!], [0, 1]);
});
test('CP-P02-C3: invalid confidence returns no mask and resets history', () => {
  const m = new SubjectMatte();
  assert.equal(m.update(new Float32Array([NaN]), 1, 1, 50, 55, false, 1), null);
  assert.equal(m.update(new Float32Array([]), 1, 1, 50, 55, false, 2), null);
  assert.equal(m.update(new Float32Array([1]), 1, 1, 50, 55, false, 3)![0], 1);
});
test('CP-P02-C3: alpha application isolates compositing state even on failure', () => {
  const calls: string[] = [];
  const ctx = {save(){calls.push('save')}, restore(){calls.push('restore')},
    drawImage(this: CanvasRenderingContext2D){calls.push('draw'); assert.equal(this.globalCompositeOperation, 'destination-in'); throw Error('test');},
    globalCompositeOperation: 'source-over'} as unknown as CanvasRenderingContext2D;
  assert.throws(() => applySubjectAlpha(ctx, {} as HTMLCanvasElement, 100, 100, 0));
  assert.deepEqual(calls, ['save','draw','restore']);
});

test('C3-R1: guided upsampling aligns soft mask with the real RGB edge', () => {
  const w=8,h=1,guide=new Uint8ClampedArray(w*h*4),out=new Uint8ClampedArray(w*h*4);
  for(let x=0;x<w;x++){const v=x<4?0:255;guide.set([v,v,v,255],x*4);}
  refineGuidedAlpha(new Float32Array([0,1]),2,1,guide,w,h,out);
  assert.equal(out[3],0);assert.equal(out[31],255);
  assert.ok(out[3*4+3]<70);assert.ok(out[4*4+3]>185);
  assert.ok(out[3*4+3]>0 && out[4*4+3]<255);
});
test('C3-R1: flat guide preserves partial alpha and does not invent a silhouette',()=>{
  const guide=new Uint8ClampedArray(32).fill(100),out=new Uint8ClampedArray(32);
  refineGuidedAlpha(new Float32Array([.5,.5]),2,1,guide,8,1,out);
  for(let x=0;x<8;x++)assert.equal(out[x*4+3],128);
});

test('CP-P02-C3-R2: 3D YCbCr guided filter refines isoluminant color edges and locks definite interiors', () => {
  const w = 16, h = 16;
  const guide = new Uint8ClampedArray(w * h * 4);
  const out = new Uint8ClampedArray(w * h * 4);
  // Isoluminant green vs magenta edge along x = 8, plus strong texture in definite bg (x < 2)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (x < 8) {
        guide.set([x < 2 ? (y % 2 === 0 ? 10 : 240) : 60, 175, 60, 255], idx);
      } else {
        guide.set([195, 70, 195, 255], idx);
      }
    }
  }
  const mask = new Float32Array(4 * 4);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      mask[y * 4 + x] = x < 2 ? 0 : 1;
    }
  }
  refineGuidedAlpha(mask, 4, 4, guide, w, h, out);

  // Definite background interior stays strictly 0 despite heavy checkerboard texture
  assert.equal(out[(8 * w + 0) * 4 + 3], 0);
  // Definite foreground interior stays strictly 255
  assert.equal(out[(8 * w + 15) * 4 + 3], 255);
  // Chroma edge alignment: x=7 (green side) has lower alpha than x=8 (magenta side)
  const leftEdge = out[(8 * w + 7) * 4 + 3];
  const rightEdge = out[(8 * w + 8) * 4 + 3];
  assert.ok(rightEdge > leftEdge + 60, `Expected chroma alignment (${leftEdge} vs ${rightEdge})`);
});

test('CP-P02-C3-R2: decontaminateEdgeColors removes dark fringe from semi-transparent borders without altering opaque interior', () => {
  const w = 3, h = 3;
  const rgba = new Uint8ClampedArray(w * h * 4);
  // Center (1,1) = dark-contaminated edge pixel at alpha 128 (~0.5)
  // Top (1,0) & Right (2,1) = pure solid red foreground (220, 40, 60, 255)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (x === 1 && y === 1) {
        rgba.set([10, 10, 10, 128], i);
      } else if (x >= 1 && y <= 1) {
        rgba.set([220, 40, 60, 255], i);
      } else {
        rgba.set([0, 0, 0, 0], i);
      }
    }
  }
  decontaminateEdgeColors(rgba, w, h);
  const centerIdx = (1 * w + 1) * 4;
  assert.ok(rgba[centerIdx] >= 140, `Red channel should recover toward foreground (${rgba[centerIdx]})`);
  assert.ok(rgba[centerIdx + 1] < 60);
  assert.equal(rgba[centerIdx + 3], 128);
  // Solid foreground pixel remains untouched
  const fgIdx = (0 * w + 2) * 4;
  assert.deepEqual([rgba[fgIdx], rgba[fgIdx + 1], rgba[fgIdx + 2], rgba[fgIdx + 3]], [220, 40, 60, 255]);
});

test('CP-P02-C3-R2: SubjectMatte boosts temporal responsiveness during fast subject motion', () => {
  const m = new SubjectMatte();
  m.update(new Float32Array([0.15]), 1, 1, 50, 55, false, 1);
  const moved = m.update(new Float32Array([0.85]), 1, 1, 50, 55, false, 34)![0];
  const target = new SubjectMatte().update(new Float32Array([0.85]), 1, 1, 50, 55, false, 34)![0];
  // With fast motion delta > 0.25, blend >= 0.88 means at least 85% of the jump happens immediately
  assert.ok(moved > 0.72 && moved <= target, `Expected responsive jump (${moved} vs target ${target})`);
});


test('CP-P02-C3-R3: sparse guided regions match full-frame YCbCr across tile seams and image borders', () => {
  const w=247,h=151,mw=91,mh=55;
  const guide=new Uint8ClampedArray(w*h*4);
  const actual=new Uint8ClampedArray(guide.length),reference=new Uint8ClampedArray(guide.length);
  const matte=new Float32Array(mw*mh);
  for(const center of [.1,.48,.88]){
    const shape=(x:number,y:number)=>Math.max(0,Math.min(1,.5+(1-((x-center)/.25)**2-((y-.5)/.38)**2)*9));
    for(let y=0;y<mh;y++)for(let x=0;x<mw;x++)matte[y*mw+x]=shape(x/mw,y/mh);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4,fg=shape(x/w,y/h)>.5;
      guide[i]=fg?180+x%23:40+y%29;guide[i+1]=fg?90:130;guide[i+2]=fg?100:190;guide[i+3]=255;
    }
    refineGuidedAlpha(matte,mw,mh,guide,w,h,reference,true);
    refineGuidedAlpha(matte,mw,mh,guide,w,h,actual);
    for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]-reference[i])<=1,'Tile mismatch at '+i);
  }
});
test('CP-P02-C3-R3: empty and constant-alpha masks overwrite previous refined results',()=>{
  const w=101,h=97,mw=17,mh=15,guide=new Uint8ClampedArray(w*h*4).fill(127);
  const alpha=new Float32Array(mw*mh),out=new Uint8ClampedArray(guide.length).fill(255);
  for(const value of [0,.5,1,0]){
    alpha.fill(value);refineGuidedAlpha(alpha,mw,mh,guide,w,h,out);
    for(let i=3;i<out.length;i+=4)assert.equal(out[i],Math.round(value*255));
  }
});
