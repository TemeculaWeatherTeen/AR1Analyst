const recordButton = $('record');
let recordingActive = false;
let mediaRecorder = null;
let recordingParts = [];
let recordingCanvas = null;
let recordingContext = null;
let recordingMic = null;
let recordingStream = null;
let recordingFrame = 0;

// The recorder has its own canvas so app controls and HUD never enter the export.
const recordingStyle = document.createElement('style');
recordingStyle.textContent = `
#record{position:fixed;right:16px;bottom:calc(var(--sb) + 88px);z-index:12;width:56px;height:56px;border-radius:50%;border:2px solid rgba(255,255,255,.8);background:#d11a1a;color:#fff;font-size:20px;font-weight:700;box-shadow:0 10px 26px #0007}
#record.recording{background:#7d0f0f;box-shadow:0 0 0 4px #f003,0 10px 30px #f005}
#record:active{transform:scale(.97)}
`;
document.head.append(recordingStyle);

function ensureRecordingCanvas(){
  if(recordingCanvas) return;
  recordingCanvas = document.createElement('canvas');
  recordingContext = recordingCanvas.getContext('2d');
}

function drawCardinalMarks(ctx, width, height){
  ctx.save();
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,.9)';
  ctx.fillStyle = '#fff';
  const marks = [
    ['N', width / 2, 28],
    ['E', width - 28, height / 2],
    ['S', width / 2, height - 28],
    ['W', 28, height / 2]
  ];
  for(const [letter, x, y] of marks){
    ctx.strokeText(letter, x, y);
    ctx.fillText(letter, x, y);
  }
  ctx.restore();
}

function drawRecordingFrame(){
  if(!recordingCanvas || !recordingContext) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if(recordingCanvas.width !== pixelWidth || recordingCanvas.height !== pixelHeight){
    recordingCanvas.width = pixelWidth;
    recordingCanvas.height = pixelHeight;
  }

  recordingContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  recordingContext.clearRect(0, 0, width, height);

  const camera = $('cam');
  if(camera && camera.videoWidth && camera.videoHeight){
    const scale = Math.max(width / camera.videoWidth, height / camera.videoHeight);
    const drawWidth = camera.videoWidth * scale;
    const drawHeight = camera.videoHeight * scale;
    recordingContext.drawImage(camera, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  }

  // #ar contains only the transparent radar render; do not capture #hud or interface elements.
  if(cv && cv.width && cv.height){
    recordingContext.drawImage(cv, 0, 0, width, height);
  }
  drawCardinalMarks(recordingContext, width, height);
}

function stopRecording(){
  if(!recordingActive) return;
  recordingActive = false;
  cancelAnimationFrame(recordingFrame);
  if(mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  if(recordButton){
    recordButton.classList.remove('recording');
    recordButton.textContent = '●';
    recordButton.setAttribute('aria-label', 'Start recording');
    recordButton.title = 'Start recording';
  }
}

async function startRecording(){
  if(recordingActive || !recordButton) return;
  if(!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream){
    say('Video recording is not supported by this browser');
    return;
  }
  if(!camStream){
    say('Camera is not ready yet');
    return;
  }

  ensureRecordingCanvas();
  drawRecordingFrame();
  const canvasStream = recordingCanvas.captureStream(30);
  const tracks = [...canvasStream.getVideoTracks()];

  // Audio is recorded from the microphone (not from the muted camera preview).
  try{
    recordingMic = await navigator.mediaDevices.getUserMedia({audio:true});
    tracks.push(...recordingMic.getAudioTracks());
  }catch(_){
    say('Microphone unavailable; recording video without audio');
  }

  recordingStream = new MediaStream(tracks);
  const mimeType = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']
    .find(type => MediaRecorder.isTypeSupported(type));
  try{
    mediaRecorder = new MediaRecorder(recordingStream, mimeType ? {mimeType} : undefined);
  }catch(error){
    recordingStream.getTracks().forEach(track => track.stop());
    recordingStream = null;
    if(recordingMic){recordingMic.getTracks().forEach(track => track.stop());recordingMic = null;}
    say('Could not start recording: ' + error.message);
    return;
  }

  recordingParts = [];
  mediaRecorder.addEventListener('dataavailable', event => {
    if(event.data && event.data.size) recordingParts.push(event.data);
  });
  mediaRecorder.addEventListener('stop', () => {
    const type = mediaRecorder.mimeType || 'video/webm';
    if(recordingParts.length){
      const blob = new Blob(recordingParts, {type});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `AR1Analyst-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    if(recordingStream) recordingStream.getTracks().forEach(track => track.stop());
    if(recordingMic){recordingMic.getTracks().forEach(track => track.stop());recordingMic = null;}
    recordingStream = null;
  });

  try{
    mediaRecorder.start(1000);
    recordingActive = true;
    recordButton.classList.add('recording');
    recordButton.textContent = '■';
    recordButton.setAttribute('aria-label', 'Stop recording');
    recordButton.title = 'Stop recording';
    const update = () => {
      if(!recordingActive) return;
      drawRecordingFrame();
      recordingFrame = requestAnimationFrame(update);
    };
    recordingFrame = requestAnimationFrame(update);
    say('Recording camera and radar');
  }catch(error){
    recordingActive = false;
    say('Could not start recording: ' + error.message);
  }
}

if(recordButton){
  recordButton.hidden = true;
  recordButton.addEventListener('click', () => {
    if(recordingActive) stopRecording();
    else startRecording();
  });
  // Reveal only in response to Start AR; script.js handles the actual AR startup.
  $('go').addEventListener('click', () => { recordButton.hidden = false; });
}
