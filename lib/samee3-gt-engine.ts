import { timeoutSignal } from '@/lib/abort-signals'

// Samee3 adapter for GT-SQR (SalehGNUTUX), AGPL-3.0.
// The original renderer and WebCodecs engine remain available via /api/gt-sqr/.

export const ENGINE_CSS = `
html,body{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:#102b24!important}
body>*{display:none!important}
body>#preview{display:flex!important;position:fixed!important;inset:0!important;padding:0!important;align-items:center!important;justify-content:center!important;background:transparent!important;border:0!important}
#preview>.pbar-wrap,#fmt-lbl{display:none!important}
#cw{max-height:none!important;max-width:none!important;box-shadow:none!important;border-radius:0!important;display:flex!important;width:100%!important;height:100%!important;padding:0!important;align-items:center!important;justify-content:center!important;overflow:hidden!important}
#cv{display:block!important;max-width:100%!important;max-height:100%!important;width:auto!important;height:auto!important;object-fit:contain!important;box-shadow:none!important;border-radius:0!important}
`

export const ENGINE_JS = String.raw`
(function(){
'use strict';

if(new URLSearchParams(location.search).get('engine')!=='1')return;

var booted=false,busy=false,prepared=null,active=null,sources=[],tick=0,backgroundUrl='',timeline=null,mediaSeq=0,preparing=0,backgroundCache=new Map();
var opts={template:'emerald',speed:1,intensity:55,color:'#fff9e9',accent:'#d3b77c',translationColor:'#eee8db',size:110,darkness:40,font:'amiri',signature:'مصحف سميع',frame:true,gc1:'#174d40',gc2:'#09231e',ratio:'9:16',quality:720};

function send(event,data,id){
 window.parent.postMessage({channel:'samee3-visual-v2',event:event,data:data||{},id:id},location.origin);
}

function number(v,lo,hi,fallback){
 v=Number(v);
 return Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):fallback;
}

function set(id,value){
 var el=$(id);
 if(!el)return;
 if(el.tagName==='SELECT'&&!Array.from(el.options).some(function(o){return o.value===String(value)})){
  el.add(new Option(String(value),String(value)));
 }
 if(el.type==='checkbox')el.checked=Boolean(value);
 else el.value=String(value);
}

function radio(name,value){
 document.querySelectorAll('input[name="'+name+'"]').forEach(function(el){
  el.checked=el.value===value;
 });
}

function stop(){
 timeline=null;
 sources.forEach(function(node){
  try{node.onended=null;node.stop();node.disconnect()}catch(_){}
 });
 sources=[];
 pausePlayer();
 clearInterval(tick);
 tick=0;
 if(S.bgVid)S.bgVid.pause();
}

function elapsed(){
 return prepared?prepared.starts[S.currentAya]+S.elapsed:0;
}

function at(t){
 var i=prepared.starts.length-1;
 while(i>0&&t<prepared.starts[i])i--;
 S.currentAya=i;
 S.elapsed=Math.max(0,t-prepared.starts[i]);
 S.bgMotionT=t;
}

function frame(t){
 at(Math.max(0,Math.min(t,prepared.duration-.001)));
 drawFrame(t);
}

function view(){
 if(!prepared)return;
 send('playback',{
  playing:S.playing,
  time:Math.min(prepared.duration,elapsed()),
  duration:prepared.duration
 });
}

function style(value){
 if(busy)return;
 Object.assign(opts,value||{});
 opts.size=number(opts.size,65,145,110);
 opts.darkness=number(opts.darkness,0,80,40);
 opts.speed=number(opts.speed,.25,2,1);
 opts.intensity=number(opts.intensity,0,100,55);

 ['color','accent','translationColor','gc1','gc2'].forEach(function(k){
  if(!/^#[0-9a-f]{6}$/i.test(opts[k]))opts[k]='#ffffff';
 });

 set('txt-col',opts.color);
 set('orn-col',opts.accent);
 set('sname-col',opts.accent);
 set('gold-col',opts.accent);
 set('trans-col',opts.translationColor);
 set('gc1',opts.gc1);
 set('gc2',opts.gc2);
 set('dim',opts.darkness);
 set('fsize',opts.size);
 set('lh',1.8);
 set('sname-on',true);
 set('sname-y',5);
 set('sname-size',80);
 set('wave-on',false);
 set('wm-on',false);
 set('vtitle-on',false);
 set('fx-gold',opts.frame);
 set('fx-vig',false);
 set('basmala-on',false);
 set('aya-gap',0);
 set('rec-vol',100);
 set('export-fps',25);
 set('export-vbr',opts.quality===1080?5:3);
 set('trans-dur',.25);
 set('tfs',55);

 radio('orn','none');
 radio('te','shadow');
 radio('tanim','none');
 radio('tpos','center');
 radio('fmt',['9:16','1:1','16:9'].includes(opts.ratio)?opts.ratio:'9:16');
 radio('bgm','static');
 radio('font',(S.allFonts.find(function(f){return f.id===opts.font})||S.allFonts[0]).css);

 set('export-res',opts.ratio==='1:1'?opts.quality:Math.round(opts.quality*16/9));
 applyCanvasSize();

 if(!S.playing&&!busy){
  S.elapsed=Math.max(.3,S.elapsed);
  drawFrame(1);
 }
}

function catalog(){
 return {
  chapters:S.surahs.map(function(s){
   return {id:s.number,name:s.name,count:s.numberOfAyahs};
  }),
  reciters:S.reciters.filter(function(r){
   return !r.folder.startsWith('warsh/');
  }).map(function(r){
   return {id:r.id,name:r.name};
  }),
  fonts:S.allFonts.filter(function(f){
   return ['Amiri Quran','Uthmanic Hafs','Scheherazade New (Quranic SIL)'].includes(f.name);
  }).map(function(f){
   return {id:f.id,name:f.name};
  })
 };
}

async function waitFor(test,ms){
 var start=Date.now();
 while(!test()){
  if(Date.now()-start>ms)throw Error('استغرق تحميل المحرر وقتًا طويلًا. أعد المحاولة.');
  await new Promise(function(r){setTimeout(r,80);});
 }
}

async function prepare(data,id){
 var gen=++preparing;
 stop();
 prepared=null;
 send('invalidated');

 var chapter=S.surahs.find(function(s){return s.number===Number(data.surah);});
 var reader=S.reciters.find(function(r){
  return r.id===data.reciter&&!r.folder.startsWith('warsh/');
 });

 if(!chapter||!reader||!Number.isInteger(data.from)||!Number.isInteger(data.to)||data.from<1||data.to<data.from||data.to>chapter.numberOfAyahs||data.to-data.from>=10){
  throw Error('اختر نطاقًا صحيحًا حتى ١٠ آيات.');
 }

 if(!['none','en.sahih','fr.hamidullah'].includes(data.translation)){
  throw Error('الترجمة غير مدعومة.');
 }

 set('surah-sel',data.surah);
 set('from-aya',data.from);
 set('to-aya',data.to);
 set('trans-sel',data.translation);
 set('basmala-on',false);
 radio('reciter',data.reciter);

 await loadVerses();
 if(gen!==preparing)return;

 if(S.verses.length!==data.to-data.from+1||
    S.verses.some(function(v,i){return v.numberInSurah!==data.from+i;})){
  throw Error('تعذر جلب الآيات المختارة. تحقق من الاتصال.');
 }

 if(data.translation!=='none'&&(!S.translations.length||S.translations.some(function(t){return !t;}))){
  throw Error('تعذر تحميل الترجمة. جرّب بدون ترجمة.');
 }

 var context=await resumeAudioCtx();
 var buffers=[],starts=[],duration=0;

 for(var i=0;i<S.verses.length;i++){
  send('preparing',{current:i+1,total:S.verses.length},id);

  var response=await fetch(ayaAudioUrl(reader.folder,data.surah,S.verses[i]),{
   signal:timeoutSignal(25000),
   cache:'force-cache'
  });

  if(!response.ok)throw Error('تعذر تحميل تلاوة '+reader.name+'. جرّب قارئًا آخر.');

  var bytes=await response.arrayBuffer();
  if(bytes.byteLength>12*1024*1024)throw Error('ملف التلاوة كبير جدًا.');

  var buffer=await context.decodeAudioData(bytes);
  if(gen!==preparing)return;

  starts.push(duration);
  duration+=buffer.duration;
  buffers.push(buffer);

  if(duration>90)throw Error('اختر آيات مدتها أقل من ٩٠ ثانية لتصديرها على الهاتف.');
 }

 prepared={
  buffers:buffers,
  starts:starts,
  duration:duration,
  reader:reader.name,
  surah:data.surah,
  from:data.from,
  to:data.to
 };

 S.ayaDurations=buffers.map(function(b){return b.duration;});
 S.currentAya=0;
 S.elapsed=0;
 drawFrame(1);

 send('prepared',{
  duration:duration,
  count:buffers.length,
  chapter:chapter.name,
  reciter:reader.name
 },id);
 view();
}

async function play(){
 if(!prepared||busy)return;

 if(S.playing){
  stop();
  view();
  return;
 }

 var context=await resumeAudioCtx();
 var offset=Math.max(0,Math.min(elapsed(),prepared.duration));
 if(offset>=prepared.duration-.03)offset=0;

 var start=context.currentTime+.06;

 prepared.buffers.forEach(function(b,i){
  if(prepared.starts[i]+b.duration<=offset)return;
  var node=context.createBufferSource();
  node.buffer=b;
  node.connect(context.destination);
  node.start(
   start+Math.max(0,prepared.starts[i]-offset),
   Math.max(0,offset-prepared.starts[i])
  );
  sources.push(node);
 });

 timeline={context:context,start:start,offset:offset};
 S.playing=true;

 if(S.bgVid)await S.bgVid.play().catch(function(){});

 tick=setInterval(function(){
  var t=Math.max(0,offset+context.currentTime-start);
  at(Math.min(t,prepared.duration-.001));

  if(t>=prepared.duration){
   stop();
   at(0);
   S.elapsed=.5;
   drawFrame(1);
  }
  view();
 },120);

 view();
}

function disposeBackground(){
 if(S.bgVid){
  S.bgVid.pause();
  S.bgVid.removeAttribute('src');
  S.bgVid.load();
 }
 S.bgVid=null;
 S.bgVidNext=null;
 S.bgVidItems=[];
 S.bgImg=null;
 if(backgroundUrl)URL.revokeObjectURL(backgroundUrl);
 backgroundUrl='';
}

async function background(data,id){
 var seq=++mediaSeq;

 stop();
 disposeBackground();
 useUploadedBackground=false;
 radio('bgt','gradient');

 if(!data.file&&!data.asset){
  S.bgMotionT=0;
  drawFrame(0);
  send('background',{},id);
  return;
 }

 var blob=data.file||backgroundCache.get(data.asset);

 if(!blob){
  var response=await fetch('/api/gt-sqr/backgrounds/'+encodeURIComponent(data.asset),{
   signal:timeoutSignal(30000)
  });
  if(!response.ok)throw Error('تعذر تحميل الخلفية. اختر أخرى أو ارفع ملفًا من جهازك.');
  blob=await response.blob();
 }

 if(!(blob instanceof Blob)||
    blob.size>30*1024*1024||
    !/^image\/(jpeg|png|webp|avif)$|^video\/(mp4|webm|quicktime)$/.test(blob.type)){
  throw Error('اختر صورة أو فيديو صالحًا أصغر من ٣٠ ميجابايت.');
 }

 if(!data.file&&data.asset)backgroundCache.set(data.asset,blob);

 var url=URL.createObjectURL(blob);
 var isVideo=blob.type.startsWith('video/');
 var element=isVideo?document.createElement('video'):new Image();

 if(isVideo){
  element.muted=true;
  element.loop=true;
  element.playsInline=true;
  element.preload='auto';
 }

 try{
  await new Promise(function(resolve,reject){
   var timer=setTimeout(function(){
    reject(Error('تعذر فتح الخلفية. جرّب ملفًا آخر.'));
   },20000);

   element[isVideo?'onloadeddata':'onload']=function(){
    clearTimeout(timer);
    resolve();
   };
   element.onerror=function(){
    clearTimeout(timer);
    reject(Error('صيغة الخلفية غير مدعومة في متصفحك.'));
   };
   element.src=url;
   if(isVideo)element.load();
  });

  if(seq!==mediaSeq){
   URL.revokeObjectURL(url);
   return;
  }

  backgroundUrl=url;
  useUploadedBackground=true;
  radio('bgm',isVideo?'static':'zoom');

  if(isVideo){
   S.bgVid=element;
   S.bgVidItems=[{
    vid:element,
    file:blob,
    url:url,
    dur:element.duration,
    name:'Samee3',
    hidden:false,
    trimStart:0,
    trimEnd:element.duration
   }];
   radio('bgt','video');
  }else{
   S.bgImg=element;
   radio('bgt','image');
  }

  drawFrame(1);
  send('background',{},id);
 }catch(error){
  URL.revokeObjectURL(url);
  throw error;
 }
}

async function fallback(context,job){
 var recording;
 var canvas=$('cv');
 var types=[
  'video/mp4;codecs="avc1.42E01F,mp4a.40.2"',
  'video/mp4;codecs="avc1,mp4a.40.2"',
  'video/webm;codecs="vp8,opus"',
  'video/webm;codecs="vp9,opus"'
 ];

 var mime=types.find(function(t){
  return typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(t);
 });

 if(!mime||!canvas.captureStream){
  throw Error('التصدير غير مدعوم في هذا المتصفح. استخدم إصدارًا حديثًا.');
 }

 var dest=context.createMediaStreamDestination();
 var capture=canvas.captureStream(25);
 var stream=new MediaStream(
  capture.getVideoTracks().concat(dest.stream.getAudioTracks())
 );
 var nodes=[],timer,watch;

 try{
  return await new Promise(function(resolve,reject){
   var chunks=[];
   var recorder=new MediaRecorder(stream,{
    mimeType:mime,
    videoBitsPerSecond:opts.quality===1080?5000000:3000000,
    audioBitsPerSecond:128000
   });

   recording=recorder;

   job.abort=function(){
    reject(new DOMException('تم الإلغاء','AbortError'));
    if(recorder.state!=='inactive')recorder.stop();
   };

   recorder.ondataavailable=function(e){
    if(e.data.size)chunks.push(e.data);
   };
   recorder.onerror=function(){
    reject(Error('تعذر إكمال الفيديو. جرّب جودة 720p.'));
   };
   recorder.onstop=function(){
    if(!job.canceled)resolve(new Blob(chunks,{type:mime.split(';')[0]}));
   };

   frame(0);
   recorder.start(500);
   var start=context.currentTime+.08;

   prepared.buffers.forEach(function(b,i){
    var node=context.createBufferSource();
    node.buffer=b;
    node.connect(dest);
    node.start(start+prepared.starts[i]);
    nodes.push(node);
   });

   function update(){
    if(job.canceled)return;
    var t=Math.max(0,context.currentTime-start);
    frame(t);

    send('progress',{
     value:Math.min(1,t/prepared.duration)
    });

    if(context.state!=='running'){
     reject(Error('توقف الصوت. أعد الإنشاء مع إبقاء الصفحة مفتوحة.'));
     return;
    }

    if(t>=prepared.duration+.1){
     recorder.stop();
     return;
    }

    timer=setTimeout(update,40);
   }

   timer=setTimeout(update,10);
   watch=setTimeout(function(){
    reject(Error('انتهت مهلة إنشاء الفيديو.'));
   },(prepared.duration+20)*1000);
  });
 }finally{
  clearTimeout(timer);
  clearTimeout(watch);

  if(recording&&recording.state!=='inactive'){
   try{recording.stop();}catch(_){}
  }

  nodes.forEach(function(n){
   try{n.stop();n.disconnect();}catch(_){}
  });

  stream.getTracks().forEach(function(t){t.stop();});
  capture.getTracks().forEach(function(t){t.stop();});
  dest.disconnect();
 }
}

async function exportVideo(id){
 if(!prepared)throw Error('جهّز الآيات أولًا.');

 stop();
 busy=true;

 var job={canceled:false};
 active=job;
 S.exporting=true;
 var blob;

 try{
  var context=await resumeAudioCtx();
  await document.fonts.ready;

  if(typeof isWebCodecsSupported==='function'&&isWebCodecsSupported()){
   try{
    var result=await startWebExportV2({
     canvas:$('cv'),
     drawFrame:drawFrame,
     setStateForTime:at,
     totalDuration:prepared.duration,
     fps:25,
     audioBuffers:prepared.buffers,
     ayaStarts:prepared.starts,
     bgBuffer:null,
     bgGain:0,
     bgLoop:false,
     recGain:1,
     bgVideo:S.bgVid,
     codecKey:'mp4-h264',
     videoBitrate:opts.quality===1080?5:3,
     audioBitrate:'128k',
     cancelRef:job,
     onProgress:function(p){
      send('progress',{value:Math.min(1,p/100)},id);
     }
    });

    blob=result.blob;
   }catch(error){
    if(job.canceled)throw error;
    S._exportingV2=false;
    blob=await fallback(context,job);
   }
  }else{
   blob=await fallback(context,job);
  }

  if(job.canceled)return;
  if(!blob||blob.size<1000)throw Error('لم يتكوّن فيديو صالح.');

  blob=new Blob([blob],{type:blob.type.split(';')[0]});

  send('result',{
   blob:blob,
   name:'samee3-'+prepared.surah+'-'+prepared.from+'-'+prepared.to+
    (blob.type.includes('mp4')?'.mp4':'.webm')
  },id);
 }catch(error){
  if(!job.canceled)throw error;
 }finally{
  busy=false;
  active=null;
  S.exporting=false;
  S.playing=false;
  S._exportingV2=false;

  if(S.bgVid){
   S.bgVid.pause();
   S.bgVid.playbackRate=1;
  }

  S.currentAya=0;
  S.elapsed=0;
  drawFrame(1);
  view();

  if(job.canceled)send('canceled',{},id);
 }
}

function cancel(){
 preparing++;
 if(active){
  active.canceled=true;
  if(active.abort)active.abort();
 }
 stop();
 S.exporting=false;
}

// Animated Canvas backgrounds are rendered in preview and export.

var useUploadedBackground=false;
var originalBackgroundRenderer=drawBg;

function alpha(hex,a){
 var m=/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)||[];
 return 'rgba('+
  parseInt(m[1]||'99',16)+','+
  parseInt(m[2]||'99',16)+','+
  parseInt(m[3]||'99',16)+','+a+')';
}

function motionBackground(ctx,W,H,ts){
 var id=String(opts.template||'emerald');
 var t=Math.max(0,Number(S.bgMotionT)||0)*number(opts.speed,.25,2,1);
 var amp=number(opts.intensity,0,100,50)/100;
 var w=W,h=H,edge=Math.max(w,h),tau=Math.PI*2;

 var g=ctx.createLinearGradient(
  w*(.20+.15*Math.sin(t*.08)),0,
  w*(.80+.15*Math.cos(t*.08)),h
 );
 g.addColorStop(0,opts.gc1);
 g.addColorStop(1,opts.gc2);
 ctx.fillStyle=g;
 ctx.fillRect(0,0,w,h);
 ctx.save();

 for(var j=0;j<3;j++){
  var cx=w*(j===0?.05:j===1?.95:.5)+Math.sin(t*(.12+j*.03)+j*1.8)*w*.10;
  var cy=h*(j===2?.85:.18+j*.25)+Math.cos(t*(.1+j*.02)+j*2.2)*h*.1;
  var radius=edge*(j===2?.36:.28);
  var gl=ctx.createRadialGradient(cx,cy,0,cx,cy,radius);

  gl.addColorStop(0,alpha(opts.accent,(.065+amp*.075)*(j===2?.7:1)));
  gl.addColorStop(1,alpha(opts.accent,0));
  ctx.fillStyle=gl;
  ctx.fillRect(cx-radius,cy-radius,radius*2,radius*2);
 }

 var kind=(function(){
  if(['rain','snow','stars','night','moonlight','sky'].includes(id))return 'particles';
  if(['river','blue','waterfall','pearl','olive'].includes(id))return 'waves';
  if(['dunes','sand','desert','sunrise'].includes(id))return 'dunes';
  if(['aurora','emerald','bokeh','lanterns'].includes(id))return 'lights';
  if(['flower','rose','clouds','silk'].includes(id))return 'petals';
  return 'geometry';
 })();

 if(kind==='waves'||kind==='dunes'){
  var count=kind==='waves'?6:5;

  for(var k=0;k<count;k++){
   ctx.beginPath();

   var y=h*(.58+k*.085);
   var offset=t*(kind==='waves'?.15:.05)+k;

   ctx.moveTo(0,h);
   ctx.lineTo(0,y);

   for(var x=0;x<=w+24;x+=24){
    var phase=x/w*tau*(kind==='waves'?1.6:.85)+offset;
    var dy=Math.sin(phase)*h*(kind==='waves'?.017:.027)*(amp*.6+.3);
    ctx.lineTo(x,y+dy);
   }

   ctx.lineTo(w,h);
   ctx.closePath();
   ctx.fillStyle=alpha(opts.accent,(kind==='waves'?.045:.065)+k*.009);
   ctx.fill();
  }
 }else if(kind==='particles'||kind==='lights'||kind==='petals'){
  var count=id==='rain'?56:id==='snow'?34:
   id==='stars'||id==='night'?34:26;

  for(var n=0;n<count;n++){
   var seed=(n*73.345)%1;
   var a=(n*37.719)%1;
   var b=(n*17.419)%1;

   var x=(a*w+Math.sin(t*(.13+seed*.15)+n)*w*.025+w)%w;
   var y=((b+1-(t*(id==='rain'?.19:id==='snow'?.035:.012)*(1+seed))%1)%1)*h;

   var r=edge*(id==='rain'?.0009:id==='snow'?.0025:.002)*(0.6+seed);

   ctx.globalAlpha=Math.min(.7,(.12+amp*.34)*(0.5+seed));
   ctx.strokeStyle=alpha(opts.accent,.85);
   ctx.fillStyle=alpha(opts.accent,.9);

   if(id==='rain'){
    ctx.lineWidth=Math.max(1,w*.0012);
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(x-w*.006,y+h*.022);
    ctx.stroke();
   }else if(id==='flower'||id==='rose'||id==='silk'||id==='clouds'){
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(t*.1+n);
    ctx.beginPath();
    ctx.ellipse(0,0,r*3,r*1.2,Math.PI/4,0,tau);
    ctx.fill();
    ctx.restore();
   }else{
    ctx.beginPath();
    ctx.arc(x,y,Math.max(1.2,r*(kind==='lights'?3:1)),0,tau);
    ctx.fill();
   }
  }

  ctx.globalAlpha=1;

  if(id==='moonlight'||id==='night'||id==='sky'){
   var mx=w*.80+Math.sin(t*.1)*w*.02;
   var my=h*.14;

   ctx.globalAlpha=.18+amp*.15;
   ctx.fillStyle=alpha(opts.accent,.95);
   ctx.beginPath();
   ctx.arc(mx,my,w*.085,0,tau);
   ctx.fill();
   ctx.globalAlpha=1;
  }
 }else{
  ctx.translate(w/2,h/2);
  ctx.rotate(Math.sin(t*.08)*.07);

  for(var q=0;q<5;q++){
   ctx.strokeStyle=alpha(opts.accent,.09+amp*.07);
   ctx.lineWidth=Math.max(1.2,w*.0017);

   var r0=w*(.30+q*.08);
   var rot=t*.02*(q%2?-1:1)+q*tau/10;

   ctx.save();
   ctx.rotate(rot);
   ctx.strokeRect(-r0/2,-r0/2,r0,r0);
   ctx.restore();
  }
 }

 var vig=ctx.createRadialGradient(
  w/2,h*.46,w*.12,
  w/2,h*.46,edge*.72
 );
 vig.addColorStop(0,'rgba(0,0,0,0)');
 vig.addColorStop(1,'rgba(0,0,0,.22)');
 ctx.fillStyle=vig;
 ctx.fillRect(0,0,w,h);
 ctx.restore();
}

drawBg=function(ctx,W,H,ts){
 if(useUploadedBackground){
  originalBackgroundRenderer(ctx,W,H,ts);
 }else{
  motionBackground(ctx,W,H,ts);
 }
};

function start(){
 if(booted)return;

 if(S.surahs.length!==114){
  send('error',{message:'تعذر تحميل السور. تحقق من الاتصال واضغط إعادة المحاولة.'});
  return;
 }

 booted=true;

 S.reciters=S.reciters.filter(function(r){
  return !r.folder.startsWith('warsh/');
 }).concat([
  {id:'basit_h',name:'عبد الباسط عبد الصمد',folder:'Abdul_Basit_Murattal_64kbps'},
  {id:'hudhaify',name:'علي الحذيفي',folder:'Hudhaify_128kbps'}
 ]);

 renderReciters();
 radio('reciter','husary');

 var preview=$('preview');
 document.body.appendChild(preview);

 FMT_SIZES['9:16']={w:1080,h:1920};
 FMT_SIZES['16:9']={w:1920,h:1080};

 $('fsize').min='10';
 $('tfs').min='10';

 cancelAnimationFrame(S.rafId);

 var original=drawFrame;
 var fitKey='',fitSize=110,fitTrans=55;

 drawFrame=function(t){
  var canvas=$('cv');
  var context=canvas.getContext('2d');
  var font=fontVal();
  var size=opts.size;
  var text=S.verses[S.currentAya]?.text||'';
  var translation=S.translations[S.currentAya]||'';

  function rows(text,size){
   context.font=size+'px '+font;
   var count=1,line='';

   text.split(/\s+/).forEach(function(w){
    if(context.measureText(line+' '+w).width>canvas.width*.8){
     count++;
     line=w;
    }else{
     line+=' '+w;
    }
   });

   return count;
  }

  var key=[text,translation,canvas.width,canvas.height,opts.size,opts.font].join('|');

  if(key!==fitKey){
   while(size>15&&rows(text,canvas.width*.062*size/100)*canvas.width*.062*size/100*1.8>canvas.height*(translation?.30:.46)){
    size-=3;
   }

   set('fsize',size);

   var transSize=55;

   while(transSize>12&&rows(translation,canvas.width*.03*transSize/100*1.6)*canvas.width*.03*transSize/100*1.6*1.4>canvas.height*.15){
    transSize-=3;
   }

   fitKey=key;
   fitSize=size;
   fitTrans=transSize;
  }

  set('fsize',fitSize);
  set('tfs',fitTrans);
  original(t);
  set('fsize',opts.size);

  context.save();
  context.textAlign='center';
  context.direction='rtl';
  context.fillStyle=opts.color;
  context.font='bold '+canvas.width*.028+'px Tajawal';

  context.fillText(
   'القارئ '+(prepared?prepared.reader:(S.reciters.find(function(r){
    return r.id===radioVal('reciter');
   })||S.reciters[0]).name),
   canvas.width/2,
   canvas.height*.865
  );

  context.strokeStyle=opts.accent;
  context.beginPath();
  context.moveTo(canvas.width*.35,canvas.height*.89);
  context.lineTo(canvas.width*.65,canvas.height*.89);
  context.stroke();

  context.font=canvas.width*.024+'px Tajawal';
  context.fillStyle=opts.accent;
  context.fillText(
   String(opts.signature??'مصحف سميع').slice(0,60),
   canvas.width/2,
   canvas.height*.93
  );
  context.restore();
 };

 if(window.PIO){
  window.PIO.deliverFile=async function(blob,name){
   return {method:'samee3',path:name,bytes:blob.size};
  };
 }

 window.samee3StudioUnlock=function(){
  return resumeAudioCtx();
 };

 style(opts);

 var lastPreviewFrame=-1000;

 (function render(t){
  var gap=S.playing?40:65;

  if(!busy&&t-lastPreviewFrame>=gap){
   lastPreviewFrame=t;

   if(S.playing&&timeline&&prepared){
    at(Math.max(0,Math.min(
     prepared.duration-.001,
     timeline.offset+timeline.context.currentTime-timeline.start
    )));
   }else if(!S.playing){
    S.bgMotionT=t/1000;
   }

   drawFrame(t/1000);
  }

  S.rafId=requestAnimationFrame(render);
 })(0);

 send('ready',catalog());
}

window.addEventListener('message',function(event){
 if(event.source!==window.parent||
    event.origin!==location.origin||
    event.data?.channel!=='samee3-visual-v2')return;

 var m=event.data;

 if(m.action==='hello'){
  if(booted)send('ready',catalog());
  return;
 }

 if(!booted)return;

 if(m.action==='cancel'||m.action==='stop'){
  cancel();
  return;
 }

 if(busy){
  send('error',{message:'انتظر اكتمال إنشاء الفيديو.'},m.id);
  return;
 }

 Promise.resolve().then(async function(){
  switch(m.action){
   case 'style':
    style(m.data);
    break;
   case 'prepare':
    await prepare(m.data,m.id);
    break;
   case 'play':
    await play();
    break;
   case 'restart':
    stop();
    if(prepared){
     at(0);
     S.elapsed=.5;
     drawFrame(1);
     view();
    }
    break;
   case 'background':
    await background(m.data,m.id);
    break;
   case 'invalidate':
    preparing++;
    stop();
    prepared=null;
    send('invalidated');
    break;
   case 'export':
    await exportVideo(m.id);
    break;
  }
 }).catch(function(error){
  send('error',{message:error.message||'تعذر إكمال العملية.'},m.id);
 });
});

window.addEventListener('pagehide',cancel);

document.addEventListener('visibilitychange',function(){
 if(document.hidden){
  if(busy){
   cancel();
   send('error',{
    message:'توقف الإنشاء عند مغادرة الصفحة. اترك الشاشة مفتوحة وأعد المحاولة.'
   });
  }else{
   stop();
  }
 }
});

waitFor(function(){
 return typeof samee3Ready!=='undefined'&&samee3Ready;
},60000).then(start).catch(function(e){
 send('error',{message:e.message});
});

})();
`
