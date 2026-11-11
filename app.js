/*
 * Load the pinned radar data application and replace its cone/beam renderer
 * with a flat, textured polar radar disc drawn by WebGL2.
 */
const originalSource =
  'https://raw.githubusercontent.com/TemeculaWeatherTeen/AR1Analyst/3659f88840c59743b65feacaca944bc0bc965364/index.html';

fetch(originalSource)
  .then((response) => {
    if (!response.ok) throw new Error(`Could not load radar app (${response.status})`);
    return response.text();
  })
  .then((html) => {
    const originalDocument = new DOMParser().parseFromString(html, 'text/html');
    const originalScript = originalDocument.querySelector('script');
    if (!originalScript) throw new Error('Radar application script was not found.');

    const replaceRequired = (source, before, after, label) => {
      if (source.includes(before)) return source.replace(before, after);
      const escaped = before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const pattern = new RegExp(escaped, 'm');
      if (pattern.test(source)) return source.replace(pattern, after);
      throw new Error(`Could not apply ${label}.`);
    };
    const replacePattern = (source, pattern, after, label) => {
      if (!pattern.test(source)) throw new Error(`Could not apply ${label}.`);
      return source.replace(pattern, after);
    };

    let source = originalScript.textContent.replace(/\r\n?/g, '\n');

    source = replaceRequired(
      source,
      'const th=((screen.orientation&&screen.orientation.angle!=null?screen.orientation.angle:window.orientation)||0)*r,ct=Math.cos(th),st=Math.sin(th);',
      "const angle=e.webkitCompassHeading!=null&&typeof window.orientation==='number'?window.orientation:(screen.orientation&&screen.orientation.angle!=null?screen.orientation.angle:window.orientation),th=(angle==null?0:angle)*r,ct=Math.cos(th),st=Math.sin(th);",
      'the iPad screen-orientation fix'
    );
    source = replaceRequired(source, 'corr=corr+sa(t-corr)*.08;', 'corr=corr+sa(t-corr)*.35;', 'the compass responsiveness fix');
    source = replaceRequired(
      source,
      "const ST={};RAW.split(';').forEach(s=>{const [i,a,o]=s.split(' ');ST[i]={lat:+a,lon:+o};$('stn').add(new Option(i,i))});",
      "const ST=window.RADAR_STATIONS||(function(){const stations={};RAW.split(';').forEach(s=>{const [i,a,o]=s.split(' ');stations[i]={lat:+a,lon:+o}});return stations})();",
      'the station archive integration'
    );

    source = replaceRequired(
      source,
      'function parseL2(buf){\n  const u8=new Uint8Array(buf),dv=new DataView(buf),cells=[],s1=[],seen={};let p=24;',
      'function parseL2(buf){\n  const u8=new Uint8Array(buf),dv=new DataView(buf),cells=[],s1=[],seen={},tilts=[];let p=24;',
      'the Level-II tilt metadata collector'
    );
    source = replaceRequired(
      source,
      'const m=o+28,az=v.getFloat32(m+12),el=v.getFloat32(m+24),en=d[m+22],nb=v.getUint16(m+30),aw=d[m+20]==1?0.5:1,k=Math.round(el*10);',
      'const m=o+28,az=v.getFloat32(m+12),el=v.getFloat32(m+24),en=d[m+22],nb=v.getUint16(m+30),aw=d[m+20]==1?0.5:1,k=Math.round(el*10);if(Number.isFinite(el))tilts.push(el);',
      'the Level-II ray elevation capture'
    );
    source = replaceRequired(
      source,
      'return {cells:new Float32Array(cells),s1};',
      'return {cells:new Float32Array(cells),s1,tilts:[...new Set(tilts)]};',
      'the tilt metadata export'
    );

    const renderer = `// ---- WebGL2 flat billboard with a polar reflectivity texture
const cv=$('ar'),hud=$('hud'),hx=hud.getContext('2d'),pc=$('ppi').getContext('2d');
const gl=cv.getContext('webgl2',{premultipliedAlpha:true,alpha:true});
let prog,vao,vbuf,texture,loc={},nCells=0;
const polarCanvas=document.createElement('canvas');polarCanvas.width=polarCanvas.height=512;
const polarContext=polarCanvas.getContext('2d');
if(!gl)throw new Error('WebGL2 is required to display the radar overlay.');
{
 const compile=(type,text)=>{const shader=gl.createShader(type);gl.shaderSource(shader,text);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'WebGL2 shader compilation failed');return shader};
 prog=gl.createProgram();
 gl.attachShader(prog,compile(gl.VERTEX_SHADER,
  '#version 300 es\\n'+
  'layout(location=0) in vec2 corner; uniform vec2 center; uniform vec2 radius; out vec2 uv;\\n'+
  'void main(){uv=corner+vec2(0.5);gl_Position=vec4(center+corner*radius,0.0,1.0);}'
 ));
 gl.attachShader(prog,compile(gl.FRAGMENT_SHADER,
  '#version 300 es\\nprecision mediump float; in vec2 uv; uniform sampler2D radar; uniform float rotation; out vec4 color;\\n'+
  'void main(){vec2 p=uv-vec2(0.5);float c=cos(rotation),s=sin(rotation);vec2 q=vec2(c*p.x-s*p.y,s*p.x+c*p.y)+vec2(0.5);if(length(p)>0.5)discard;color=texture(radar,q);}'
 ));
 gl.linkProgram(prog);
 if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(prog)||'WebGL2 program link failed');
 for(const name of ['center','radius','rotation','radar'])loc[name]=gl.getUniformLocation(prog,name);
 vao=gl.createVertexArray();gl.bindVertexArray(vao);
 vbuf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vbuf);
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
 gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
 texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.useProgram(prog);gl.uniform1i(loc.radar,0);
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
}
function upload(cells){
 nCells=cells.length/6;
 polarContext.clearRect(0,0,512,512);
 const center=256,scale=256/230,rad=Math.PI/180;
 for(let i=0;i<cells.length;i+=6){
  const az=cells[i],range=cells[i+1],dbz=cells[i+3],width=cells[i+4],gate=cells[i+5];
  if(!Number.isFinite(az)||!Number.isFinite(range)||range<0||!Number.isFinite(dbz))continue;
  const r0=Math.max(0,(range-gate/2)*scale),r1=Math.min(255,(range+gate/2)*scale);
  if(r0>=255||r1<=r0)continue;
  const a0=(az-width/2)*rad-Math.PI/2,a1=(az+width/2)*rad-Math.PI/2;
  polarContext.beginPath();polarContext.moveTo(center+r0*Math.cos(a0),center+r0*Math.sin(a0));
  polarContext.lineTo(center+r1*Math.cos(a0),center+r1*Math.sin(a0));
  polarContext.arc(center,center,r1,a0,a1,false);
  polarContext.lineTo(center+r0*Math.cos(a1),center+r0*Math.sin(a1));
  if(r0>0)polarContext.arc(center,center,r0,a1,a0,true);
  else polarContext.lineTo(center,center);
  polarContext.closePath();polarContext.fillStyle=COL[bin(dbz)];polarContext.fill();
 }
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
 gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,0);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,polarCanvas);
}
`;
    source = replacePattern(
      source,
      /\/\/ ---- WebGL2:[\s\S]*?(?=async function load\(\)\{)/,
      `${renderer}\n`,
      'the flat polar WebGL2 renderer'
    );

    const tiltCode = `
const tiltHost=document.getElementById('tilt-options');
let activeTilts=new Set(),tiltValues=[],radarCells=new Float32Array(0);
const tiltKey=angle=>Math.round(angle*10)/10;
function filterSelectedTilts(cells){
 const selected=[];
 for(let i=0;i<cells.length;i+=6)if(activeTilts.has(tiltKey(cells[i+2])))selected.push(cells.subarray(i,i+6));
 return new Float32Array(selected.flatMap(v=>Array.from(v)));
}
function setTiltOptions(tilts){
 if(!tiltHost)return;
 const values=[...new Set((tilts||[]).filter(Number.isFinite).map(tiltKey))].sort((a,b)=>a-b);
 if(!values.length){tiltHost.textContent='No scan angles available';return;}
 const previous=activeTilts;
 activeTilts=tiltValues.length?new Set(values.filter(v=>previous.has(v))):new Set(values);
 if(!activeTilts.size)activeTilts=new Set(values);
 tiltValues=values;tiltHost.replaceChildren();
 for(const angle of values){
  const label=document.createElement('label'),box=document.createElement('input');
  box.type='checkbox';box.value=String(angle);box.checked=activeTilts.has(angle);
  box.addEventListener('change',()=>{
   if(box.checked)activeTilts.add(angle);else activeTilts.delete(angle);
   if(!activeTilts.size){activeTilts=new Set(tiltValues);for(const input of tiltHost.querySelectorAll('input'))input.checked=true;}
   if(gl&&radarCells.length)upload(filterSelectedTilts(radarCells));
  });
  label.append(box,document.createTextNode(angle.toFixed(1)+'°'));tiltHost.append(label);
 }
}
`;
    source = replaceRequired(source, 'async function load(){', `${tiltCode}\nasync function load(){`, 'the tilt selector logic');
    source = replaceRequired(
      source,
      'const {cells,s1}=parseL2(buf);\n   if(gl)upload(cells);',
      'const {cells,s1,tilts}=parseL2(buf);\n   radarCells=cells;setTiltOptions(tilts);\n   if(gl)upload(filterSelectedTilts(cells));',
      'elevation selection in the radar scan'
    );

    source = replacePattern(
      source,
      /if\(gl&&nCells\)\{[\s\S]*?gl\.drawArraysInstanced\(gl\.TRIANGLE_STRIP,0,4,nCells\);\n  \}/,
      `if(gl&&nCells){
   gl.viewport(0,0,cv.width,cv.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
   gl.useProgram(prog);gl.bindVertexArray(vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
   const depth=dot([dE,dN,0],f),focal=Math.max(W,H)/(2*Math.tan($('fov').value*Math.PI/360));
   if(depth>0.01){
    const cx=2*focal*dot([dE,dN,0],r)/(W*depth),cy=2*focal*dot([dE,dN,0],up)/(H*depth);
    const maxRange=230,angularRadius=Math.max(0.08,Math.min(0.55,Math.atan(maxRange/Math.max(1,Math.hypot(dE,dN)))));
    gl.uniform2f(loc.center,cx,cy);gl.uniform2f(loc.radius,2*focal*Math.tan(angularRadius)/W,2*focal*Math.tan(angularRadius)/H);
    gl.uniform1f(loc.rotation,Math.atan2(f[0],f[1]));gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
   }
  }`,
      'the flat sky texture projection'
    );

    const script = document.createElement('script');
    script.textContent = source;
    document.body.appendChild(script);
  })
  .catch((error) => {
    const status = document.getElementById('st');
    if (status) status.textContent = `Unable to start radar: ${error.message}`;
    console.error(error);
  });
