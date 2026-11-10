/*
 * Load the pinned radar application, then add device-orientation fixes,
 * selectable Level-II elevation cuts, and a 3D sampled-beam mesh.
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
      // Match the same source while tolerating formatting/line-ending changes.
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

    // Use the asynchronously loaded station archive when available; the pinned
    // source's built-in catalog remains a fallback for offline startup.
    source = replaceRequired(
      source,
      "const ST={};RAW.split(';').forEach(s=>{const [i,a,o]=s.split(' ');ST[i]={lat:+a,lon:+o};$('stn').add(new Option(i,i))});",
      "const ST=window.RADAR_STATIONS||(function(){const stations={};RAW.split(';').forEach(s=>{const [i,a,o]=s.split(' ');stations[i]={lat:+a,lon:+o}});return stations})();",
      'the station archive integration'
    );

    // Capture every valid ray elevation independently of whether that ray has
    // reflectivity gates that survive the display filters.
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

    // Apply optional volume rendering patches atomically so a mismatch can
    // never prevent the base radar application or its tilt controls from loading.
    try {
      let volumeSource = source;
      volumeSource = replaceRequired(volumeSource,
        'layout(location=0) in vec2 c; layout(location=1) in vec4 A; layout(location=2) in vec2 Bw;',
        'layout(location=0) in vec3 c; layout(location=1) in vec4 A; layout(location=2) in vec2 Bw;',
        'the 3D radar-beam vertex format');
      volumeSource = replaceRequired(volumeSource,
        'float az=radians(A.x+(c.x-.5)*Bw.x), r=A.y+(c.y-.5)*Bw.y, el=radians(A.z);',
        'float az=radians(A.x+c.x*Bw.x), r=A.y+c.y*Bw.y, el=radians(A.z+c.z*.95);',
        'the physical beam-volume geometry');
      volumeSource = replaceRequired(volumeSource, 'p.z=h-dot(p.xy,p.xy)/12742.;', 'p.z=h;', 'the radar beam earth-curvature model');
      volumeSource = replacePattern(volumeSource,
        /const cb=gl\.createBuffer\(\);gl\.bindBuffer\(gl\.ARRAY_BUFFER,cb\);gl\.bufferData\(gl\.ARRAY_BUFFER,new Float32Array\(\[0,0,1,0,0,1,1,1\]\),gl\.STATIC_DRAW\);\s*gl\.enableVertexAttribArray\(0\);gl\.vertexAttribPointer\(0,2,gl\.FLOAT,false,0,0\);/,
        `const cb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,cb);
  const cubeFaces=[
   [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5]],
   [[-.5,-.5,.5],[.5,.5,.5],[.5,-.5,.5],[-.5,-.5,.5],[-.5,.5,.5],[.5,.5,.5]],
   [[-.5,-.5,-.5],[-.5,.5,-.5],[-.5,.5,.5],[-.5,-.5,-.5],[-.5,.5,.5],[-.5,-.5,.5]],
   [[.5,-.5,-.5],[.5,.5,.5],[.5,.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[.5,.5,.5]],
   [[-.5,-.5,-.5],[.5,-.5,.5],[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,-.5,.5],[.5,-.5,.5]],
   [[-.5,.5,-.5],[.5,.5,-.5],[.5,.5,.5],[-.5,.5,-.5],[.5,.5,.5],[-.5,.5,.5]]
  ];
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(cubeFaces.flat()),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);`,
        'the 3D beam-cell mesh');
      volumeSource = replaceRequired(volumeSource, 'gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,nCells);', 'gl.drawArraysInstanced(gl.TRIANGLES,0,36,nCells);', 'the 3D beam-cell draw call');
      volumeSource = replaceRequired(volumeSource, 'o=vec4(K[i]*.62,.62);', 'o=vec4(K[i]*.24,.24);', 'the translucent beam-cell rendering');
      source = volumeSource;
    } catch (error) {
      console.warn('3D beam mesh unavailable; using the original polar-cell renderer.', error);
    }

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
    source = replaceRequired(source,
      'const {cells,s1}=parseL2(buf);\n   if(gl)upload(cells);',
      'const {cells,s1,tilts}=parseL2(buf);\n   radarCells=cells;setTiltOptions(tilts);\n   if(gl)upload(filterSelectedTilts(cells));',
      'elevation selection in the radar scan');

    const script = document.createElement('script');
    script.textContent = source;
    document.body.appendChild(script);
  })
  .catch((error) => {
    const status = document.getElementById('st');
    if (status) status.textContent = `Unable to start radar: ${error.message}`;
    console.error(error);
  });
