const recordBtn = $('record');
let recordIsActive = false;
let recordRecorder = null;
let recordChunks = [];
let captureCanvas = null;
let captureCtx = null;
let micStream = null;

function ensureRecordingCanvas(){
  if(captureCanvas) return;
  captureCanvas = document.createElement('canvas');
  captureCtx = captureCanvas.getContext('2d');
}

function drawCardinalMarkers(ctx, W, H){
  ctx.save();
  ctx.font = 'bold 26px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,.9)';
  ctx.fillStyle = '#ffffff';
  const pts = [
    ['N', W / 2, 28],
    ['E', W - 28, H / 2],
    ['S', W / 2, H - 28],
    ['W', 28, H / 2]
  ];
  for(const [label,x,y] of pts){
    ctx.strokeText(label, x, y);
    ctx.fillText(label, x, y);
  }
  ctx.restore();
}

function compositeRecordingFrame(){
  if(!captureCanvas || !captureCtx) return;
  const W = innerWidth;
  const H = innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.max(1, Math.round(W * dpr));
  const ch = Math.max(1, Math.round(H * dpr));
  if(captureCanvas.width !== cw || captureCanvas.height !== ch){
    captureCanvas.width = cw;
    captureCanvas.height = ch;
  }

  captureCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  captureCtx.clearRect(0, 0, W, H);

  if($('cam') && $('cam').videoWidth && $('cam').videoHeight){
    const vw = $('cam').videoWidth;
    const vh = $('cam').videoHeight;
    const scale = Math.max(W / vw, H / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2;
    captureCtx.drawImage($('cam'), dx, dy, dw, dh);
  }

  if(cv && cv.width && cv.height){
    captureCtx.drawImage(cv, 0, 0, W, H);
  }

  drawCardinalMarkers(captureCtx, W, H);
}

async function startMicrophone(){
  if(micStream) return micStream;
  try{
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
  } catch (e) {
    micStream = null;
  }
  return micStream;
}

async function toggleRecording(){
  if(!recordBtn) return;

  if(recordIsActive){
    if(recordRecorder && recordRecorder.state !== 'inactive') recordRecorder.stop();
    return;
  }

  if(!camStream){
    await startCam();
  }
  if(!camStream) return;

  ensureRecordingCanvas();
  compositeRecordingFrame();

  const audioStream = await startMicrophone();
  const canvasStream = captureCanvas.captureStream(30);
  const tracks = [...canvasStream.getVideoTracks()];
  if(audioStream){
    for(const track of audioStream.getAudioTracks()) tracks.push(track);
  }

  const combinedStream = new MediaStream(tracks);
  recordChunks = [];
  recordRecorder = new MediaRecorder(combinedStream, {
    mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
  });

  recordRecorder.ondataavailable = ev => {
    if(ev.data && ev.data.size) recordChunks.push(ev.data);
  };

  recordRecorder.onstop = () => {
    if(!recordChunks.length) return;
    const blob = new Blob(recordChunks, { type: recordRecorder.mimeType || 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AR1Analyst-recording.webm';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  recordRecorder.start();
  recordIsActive = true;
  recordBtn.classList.add('recording');
  recordBtn.textContent = '■';
  recordBtn.title = 'Stop recording';

  const tick = () => {
    if(!recordIsActive) return;
    compositeRecordingFrame();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

if(recordBtn){
  recordBtn.addEventListener('click', toggleRecording);
  recordBtn.addEventListener('dblclick', e => e.preventDefault());
}

const oldStop = () => {
  if(recordRecorder && recordRecorder.state !== 'inactive'){
    recordRecorder.stop();
  }
  recordIsActive = false;
  recordBtn.classList.remove('recording');
  recordBtn.textContent = '●';
  recordBtn.title = 'Record';
};

Object.defineProperty(window, 'stopRecording', {
  value: oldStop,
  configurable: true
});

recordRecorder = null;

if(recordBtn){
  const orig = recordBtn.onclick;
  recordBtn.onclick = function(evt){
    if(orig) orig(evt);
    if(recordIsActive){
      oldStop();
      return;
    }
    toggleRecording();
  };
}
