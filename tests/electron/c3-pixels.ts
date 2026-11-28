import { applySubjectAlpha } from '../../src/utils/subjectMatte';
import { ProgramCompositor } from '../../src/engine/programCompositor';
import { DEFAULT_LAYER_STYLE, DEFAULT_LAYER_TRANSFORM } from '../../src/engine/sceneEngine';
import { ensureAiSegmenter, segmentSubjectWithAi, getAiVisionStatus, resetAiSegmentationTemporalBuffer, reportAiSegmentationFailure } from '../../src/utils/aiVision';
import { renderCameraFrame } from '../../src/utils/canvasProcessor';
import { DEFAULT_ADJUSTMENTS, DEFAULT_BACKGROUND_SETTINGS, DEFAULT_FOCUS_SETTINGS, DEFAULT_STABILIZATION_SETTINGS } from '../../src/types/camera';
import type { SceneLayer, StudioScene, StudioSource } from '../../src/types/studio';
const W=96,H=64;
function canvas(w=W,h=H) {const c=document.createElement('canvas');c.width=w;c.height=h;return c}
function check(ok: unknown, msg: string) { if(!ok) throw Error(msg); }
function pixel(c:HTMLCanvasElement,x:number,y:number) {return [...c.getContext('2d')!.getImageData(x,y,1,1).data]}
function close(a:number[],b:number[],n=3) {return a.every((v,i)=>Math.abs(v-b[i])<=n)}
async function run(){
  const cam=canvas(); const ctx=cam.getContext('2d')!;
  const mask=canvas(), m=mask.getContext('2d')!;
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
  m.fillStyle='white';m.fillRect(32,0,32,H);
  m.fillStyle='rgba(255,255,255,0.5)';m.fillRect(64,0,16,H);
  applySubjectAlpha(ctx,mask,W,H,0);
  check(close(pixel(cam,10,32),[0,0,0,0]),'camera transparent');
  check(close(pixel(cam,48,32),[255,255,255,255]),'camera opaque');
  check(close(pixel(cam,70,32),[255,255,255,128]),'camera fractional alpha');
  const win=canvas();const winctx=win.getContext('2d')!;winctx.fillStyle='#2468ac';winctx.fillRect(0,0,W,H);
  const source:StudioSource[]=[{id:'win',kind:'window',name:'test window',createdAt:1,includeSystemAudio:false},{id:'cam',kind:'camera',name:'test camera',createdAt:1,deviceId:'',preferredWidth:W,preferredHeight:H,preferredFps:30}];
  const layer=(id:string,zIndex:number):SceneLayer=>({id,sourceId:id,name:id,zIndex,visible:true,locked:false,overrideSourceProcessing:false,transform:{...DEFAULT_LAYER_TRANSFORM},style:{...DEFAULT_LAYER_STYLE}});
  const scene:StudioScene={id:'test',name:'test',backgroundColor:'#000000',transition:{type:'cut',durationMs:0},layers:[layer('win',0),layer('cam',1)],audioSourceIds:[],createdAt:1,updatedAt:1};
  const results:unknown[]=[];
  for(const backend of ['canvas2d','webgl2'] as const){
    const out=canvas(); const comp=new ProgramCompositor({surface:out,width:W,height:H,preferredBackend:backend});
    check(comp.getBackendKind()===backend,'backend not available: '+backend);
    comp.setSceneData(scene,source);
    comp.setProcessedLayerSurface('win',{surface:win,width:W,height:H,alphaMode:'straight',frameVersion:1});
    comp.setProcessedLayerSurface('cam',{surface:cam,width:W,height:H,alphaMode:'straight',frameVersion:1,hasTransparentSubject:true});
    comp.renderFrameNow();
    const read=canvas();read.getContext('2d')!.drawImage(out,0,0);
    const a=pixel(read,10,32), b=pixel(read,48,32), c=pixel(read,70,32);
    check(close(a,[36,104,172,255]),backend+' unaffected window '+a);
    check(close(b,[255,255,255,255]),backend+' solid subject '+b);
    check(close(c,[146,180,214,255],5),backend+' fractional edge '+c);
    comp.setProcessedLayerSurface('cam',{surface:cam,width:W,height:H,alphaMode:'premultiplied',frameVersion:3,hasTransparentSubject:true});
    comp.renderFrameNow();read.getContext('2d')!.drawImage(out,0,0);
    const premultEdge=pixel(read,70,32);
    check(close(pixel(read,10,32),[36,104,172,255]),backend+' premult unaffected window');
    check(close(pixel(read,48,32),[255,255,255,255]),backend+' premult solid subject');
    check(close(premultEdge,[146,180,214,255],5),backend+' premult fractional edge '+premultEdge);
    results.push({backend,premultEdge});
    ctx.fillStyle='#f00000';ctx.fillRect(0,0,W,H);
    comp.setProcessedLayerSurface('cam',{surface:cam,width:W,height:H,alphaMode:'straight',frameVersion:2,hasTransparentSubject:false});
    comp.renderFrameNow();read.getContext('2d')!.drawImage(out,0,0);
    check(close(pixel(read,10,32),[240,0,0,255]),backend+' recovery original');
    comp.dispose();
    ctx.fillStyle='white';ctx.fillRect(0,0,W,H);applySubjectAlpha(ctx,mask,W,H,0);
    results.push({backend,window:a,subject:b,edge:c,recovery:true});
  }
  const raw=canvas(320,180);const rc=raw.getContext('2d')!;rc.fillStyle='#2468ac';rc.fillRect(0,0,320,180);
  const proc=canvas(320,180);const pc=proc.getContext('2d')!;
  const opts={width:320,height:180,mirror:false,flipVertical:false,fitMode:'cover' as const,zoom:1,panX:0,panY:0,filterId:'none' as const,effectId:'none' as const,adjustments:DEFAULT_ADJUSTMENTS,focus:DEFAULT_FOCUS_SETTINGS,stabilization:DEFAULT_STABILIZATION_SETTINGS,background:{...DEFAULT_BACKGROUND_SETTINGS,mode:'transparent' as const},branding:{showTimestamp:false,showLowerThird:false,lowerThirdName:'',lowerThirdTitle:'',cinemaFrame:false},abSplitEnabled:false,abSplitPosition:.5,cameraOnlyAlpha:true};
  const initial=renderCameraFrame(pc,raw,320,180,opts);
  check(initial===false,'loading must not claim alpha');
  check(pixel(proc,160,90)[3]===255,'loading retains original');
  const model=await ensureAiSegmenter();
  check(model,'local MediaPipe model unavailable: '+JSON.stringify(getAiVisionStatus()));
  resetAiSegmentationTemporalBuffer();
  const actual=segmentSubjectWithAi(raw,50,55);
  check(actual,'real model did not produce confidence mask');
  const success=renderCameraFrame(pc,raw,320,180,opts);
  check(success===true,'actual pipeline did not report alpha');
  const actualAlpha=pixel(proc,160,90)[3];
  reportAiSegmentationFailure(new Error('controlled test-only fault'));
  check(getAiVisionStatus().segmenter==='error','failure status not propagated');
  check(renderCameraFrame(pc,raw,320,180,opts)===false,'failure must not claim alpha');
  check(pixel(proc,160,90)[3]===255,'failure must retain the original background');
  await new Promise(r=>setTimeout(r,1600));
  check(await ensureAiSegmenter(),'CPU recovery failed');
  check(renderCameraFrame(pc,raw,320,180,opts)===true,'real matte did not recover');
  const guide=canvas(1280,720);const gc=guide.getContext('2d')!;gc.fillStyle='#2468ac';gc.fillRect(0,0,1280,720);
  const times:number[]=[];
  for(let i=0;i<6;i++){const start=performance.now();const matte=segmentSubjectWithAi(guide,50,55,true);
    check(matte && matte.width===960 && matte.height===540,'refined mask resolution');
    if(i>0)times.push(performance.now()-start);
  }
  results.push({model:'local MediaPipe loaded and produced mask',dimensions:[actual!.width,actual!.height],alpha:actualAlpha,loadingFallback:true,errorFallback:true,cpuRecovery:true,refinedDimensions:[960,540],maskPipelineMs:times});
  return results;
}
(window as any).c3Run=run;
