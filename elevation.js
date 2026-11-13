// Optional radar/user altitude correction in metres above mean sea level.
// This augments the existing rendering shaders so it works in both 2-D and volume mode.
const elevationInput = document.createElement('input');
elevationInput.type = 'number';
elevationInput.step = '1';
elevationInput.inputMode = 'decimal';
elevationInput.placeholder = 'GPS altitude';
elevationInput.setAttribute('aria-label', 'User elevation above mean sea level in metres');
elevationInput.title = 'Optional override; otherwise use GPS altitude when available';
elevationInput.style.cssText = 'width:96px;flex:none;background:var(--fill);color:#fff;border:0;border-radius:8px;padding:6px;font:inherit;text-align:right';
const elevationRow = document.createElement('div');
elevationRow.className = 'row';
const elevationLabel = document.createElement('span');
elevationLabel.textContent = 'User elevation MSL (m)';
elevationRow.append(elevationLabel, elevationInput);
$('sheet').append(elevationRow);
try { elevationInput.value = localStorage.getItem('ar1:userElevationM') || ''; } catch (_) {}

elevationInput.addEventListener('change', () => {
  try { localStorage.setItem('ar1:userElevationM', elevationInput.value); } catch (_) {}
  say(elevationInput.value === '' ? 'Using GPS altitude when available' : 'Manual user elevation set');
});

let gpsElevationMeters = null;
function userElevationMeters(){
  const manualValue = elevationInput.value.trim();
  if(manualValue !== '' && Number.isFinite(Number(manualValue))) return Number(manualValue);
  return Number.isFinite(gpsElevationMeters) ? gpsElevationMeters : 0;
}
function radarElevationOffsetMeters(){
  const site = ST[$('stn').value];
  const radarElevation = site && Number.isFinite(site.elevationMeters) ? site.elevationMeters : 0;
  return radarElevation - userElevationMeters();
}

// Capture a valid GPS MSL altitude from the app's existing location watch without
// changing its latitude/longitude behavior. GPS altitude is usually null or noisy,
// so accept it only when the reported vertical accuracy is reasonable.
if(navigator.geolocation && navigator.geolocation.watchPosition){
  const nativeWatch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
  navigator.geolocation.watchPosition = (success, error, options) => nativeWatch(position => {
    const coords = position.coords;
    if(Number.isFinite(coords.altitude) && coords.altitude !== null &&
       (coords.altitudeAccuracy == null || coords.altitudeAccuracy <= 100)){
      gpsElevationMeters = coords.altitude;
    }
    success(position);
  }, error, options);
}

// NWS station metadata contains site elevation. Keep the existing built-in station
// list as a fallback if the service is unavailable or a station omits elevation.
(async function loadRadarElevations(){
  try{
    const response = await fetch('https://api.weather.gov/radar/stations?stationType=WSR-88D');
    if(!response.ok) return;
    const data = await response.json();
    for(const feature of data.features || []){
      const props = feature.properties || {};
      const id = props.id || String(feature.id || '').split('/').pop();
      const elevation = props.elevation;
      if(!id || !ST[id] || !elevation || !Number.isFinite(elevation.value)) continue;
      let meters = elevation.value;
      const unit = String(elevation.unitCode || '').toLowerCase();
      if(unit.includes('ft')) meters *= 0.3048;
      ST[id].elevationMeters = meters;
    }
  }catch(_){ /* Preserve built-in stations and zero-offset fallback. */ }
})();

// Replace the already-compiled shaders with equivalent versions that include the
// radar-site-to-user MSL height difference. This preserves the existing radar
// geometry and applies the correction to every range gate / volumetric sample.
function compileElevationProgram(oldProgram, changedStage, editSource){
  const replacement = gl.createProgram();
  for(const oldShader of gl.getAttachedShaders(oldProgram) || []){
    const type = gl.getShaderParameter(oldShader, gl.SHADER_TYPE);
    let source = gl.getShaderSource(oldShader);
    if(type === changedStage) source = editSource(source);
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
      console.warn('Elevation shader compile failed:', gl.getShaderInfoLog(shader));
      return null;
    }
    gl.attachShader(replacement, shader);
  }
  gl.linkProgram(replacement);
  if(!gl.getProgramParameter(replacement, gl.LINK_STATUS)){
    console.warn('Elevation shader link failed:', gl.getProgramInfoLog(replacement));
    return null;
  }
  return replacement;
}

if(typeof gl !== 'undefined' && gl && typeof prog !== 'undefined' && prog){
  const updated = compileElevationProgram(prog, gl.VERTEX_SHADER, source => {
    if(!source.includes('p.z=h-dot(p.xy,p.xy)/12742.;')) return source;
    return source
      .replace('uniform float E;', 'uniform float E,RadarOffset;')
      .replace('p.z=h-dot(p.xy,p.xy)/12742.;', 'p.z=h-dot(p.xy,p.xy)/12742.+RadarOffset;');
  });
  if(updated){
    prog = updated;
    for(const name of Object.keys(loc)) loc[name] = gl.getUniformLocation(prog, name);
    var coneElevationLocation = gl.getUniformLocation(prog, 'RadarOffset');
    const originalDrawCones = drawCones;
    drawCones = function(...args){
      gl.useProgram(prog);
      gl.uniform1f(coneElevationLocation, radarElevationOffsetMeters() / 1000);
      return originalDrawCones.apply(this, args);
    };
  }

  if(typeof vprog !== 'undefined' && vprog){
    const volumeUpdated = compileElevationProgram(vprog, gl.FRAGMENT_SHADER, source => {
      if(!source.includes('float hg=p.z+dot(p.xy,p.xy)/12742.;')) return source;
      return source
        .replace('uniform float F,Mn,Op,K,NT,TM;', 'uniform float F,Mn,Op,K,NT,TM,RadarOffset;')
        .replace('float hg=p.z+dot(p.xy,p.xy)/12742.;', 'float hg=p.z+dot(p.xy,p.xy)/12742.-RadarOffset;');
    });
    if(volumeUpdated){
      vprog = volumeUpdated;
      for(const name of Object.keys(vloc)) vloc[name] = gl.getUniformLocation(vprog, name);
      var volumeElevationLocation = gl.getUniformLocation(vprog, 'RadarOffset');
      const originalDrawVolume = drawVolume;
      drawVolume = function(...args){
        gl.useProgram(vprog);
        gl.uniform1f(volumeElevationLocation, radarElevationOffsetMeters() / 1000);
        return originalDrawVolume.apply(this, args);
      };
    }
  }
}
