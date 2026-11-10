/*
 * The original radar application remains at this immutable source revision.
 * This loader applies the AR/iPad fixes and adds user-selectable elevation
 * tilts plus 3D radar-beam sample volumes before running its script.
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
      if (!source.includes(before)) throw new Error(`Could not apply ${label}.`);
      return source.replace(before, after);
    };

    let source = originalScript.textContent;

    // Keep iPad Safari's sensor axes aligned to the screen and respond promptly
    // to compass corrections.
    source = replaceRequired(
      source,
      'const th=((screen.orientation&&screen.orientation.angle!=null?screen.orientation.angle:window.orientation)||0)*r,ct=Math.cos(th),st=Math.sin(th);',
      "const angle=e.webkitCompassHeading!=null&&typeof window.orientation==='number'?window.orientation:(screen.orientation&&screen.orientation.angle!=null?screen.orientation.angle:window.orientation),th=(angle==null?0:angle)*r,ct=Math.cos(th),st=Math.sin(th);",
      'the iPad screen-orientation fix'
    );
    source = replaceRequired(
      source,
      'corr=corr+sa(t-corr)*.08;',
      'corr=corr+sa(t-corr)*.35;',
      'the compass responsiveness fix'
    );

    // Use a 3D mesh for every sampled radar gate. Azimuth width comes from
    // the scan's sampling mode, range width from the gate spacing, and the
    // vertical span uses the nominal 0.95-degree NEXRAD beamwidth.
    source = replaceRequired(
      source,
      'layout(location=0) in vec2 c; layout(location=1) in vec4 A; layout(location=2) in vec2 Bw;',
      'layout(location=0) in vec3 c; layout(location=1) in vec4 A; layout(location=2) in vec2 Bw;',
      'the 3D radar-beam vertex format'
    );
    source = replaceRequired(
      source,
      'float az=radians(A.x+(c.x-.5)*Bw.x), r=A.y+(c.y-.5)*Bw.y, el=radians(A.z);',
      'float az=radians(A.x+c.x*Bw.x), r=A.y+c.y*Bw.y, el=radians(A.z+c.z*.95);',
      'the physical beam-volume geometry'
    );
    // Height above the radar in a standard 4/3-Earth-refraction model is
    // range*sin(elevation) + range^2/(2*k*EarthRadius). Do not subtract a
    // second curvature term: that incorrectly bent the beam below the radar.
    source = replaceRequired(
      source,
      'p.z=h-dot(p.xy,p.xy)/12742.;',
      'p.z=h;',
      'the radar beam earth-curvature model'
    );
    source = replaceRequired(
      source,
      'const cb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,cb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),gl.STATIC_DRAW);\n  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);',
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
      'the 3D beam-cell mesh'
    );
    source = replaceRequired(
      source,
      'gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,nCells);',
      'gl.drawArraysInstanced(gl.TRIANGLES,0,36,nCells);',
      'the 3D beam-cell draw call'
    );
    source = replaceRequired(
      source,
      'o=vec4(K[i]*.62,.62);',
      'o=vec4(K[i]*.24,.24);',
      'the translucent beam-cell rendering'
    );

    // Add a multiple-choice tilt selector backed by the elevation angles in
    // the Level-II scan. The default is all available tilts; changing a box
    // immediately re-uploads only those elevation sweeps.
    const tiltCode = `
const tiltHost=document.getElementById('tilt-options');
let activeTilts=new Set(),tiltValues=[],radarCells=new Float32Array(0);
function filterSelectedTilts(cells){
 const selected=[];
 for(let i=0;i<cells.length;i+=6)if(activeTilts.has(Math.round(cells[i+2]*10)/10))selected.push(cells.subarray(i,i+6));
 return new Float32Array(selected.flatMap(v=>Array.from(v)));
}
function setTiltOptions(cells){
 const values=[...new Set(Array.from({length:cells.length/6},(_,i)=>Math.round(cells[i*6+2]*10)/10))].sort((a,b)=>a-b);
 if(!values.length)return;
 const changed=values.length!==tiltValues.length||values.some((v,i)=>v!==tiltValues[i]);
 if(!changed)return;
 if(tiltValues.length){activeTilts=new Set(values.filter(v=>activeTilts.has(v)));if(!activeTilts.size)activeTilts=new Set(values)}
 else activeTilts=new Set(values);
 tiltValues=values;
 tiltHost.replaceChildren();
 for(const angle of values){
  const label=document.createElement('label'),box=document.createElement('input');
  box.type='checkbox';box.value=String(angle);box.checked=activeTilts.has(angle);
  box.addEventListener('change',()=>{
   if(box.checked)activeTilts.add(angle);else activeTilts.delete(angle);
   if(!activeTilts.size){activeTilts=new Set(tiltValues);for(const input of tiltHost.querySelectorAll('input'))input.checked=true}
   if(gl)upload(filterSelectedTilts(radarCells));
  });
  label.append(box,document.createTextNode(angle.toFixed(1)+'°'));tiltHost.append(label);
 }
}
`;
    source = replaceRequired(source, 'async function load(){', `${tiltCode}\nasync function load(){`, 'the tilt selector logic');
    source = replaceRequired(
      source,
      'const {cells,s1}=parseL2(buf);\n   if(gl)upload(cells);',
      'const {cells,s1}=parseL2(buf);\n   radarCells=cells;setTiltOptions(cells);\n   if(gl)upload(filterSelectedTilts(cells));',
      'elevation selection in the radar scan'
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
