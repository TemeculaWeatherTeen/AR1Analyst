/*
 * The original radar application is kept at this immutable source revision
 * while it is being migrated into this file. This loader preserves the
 * existing behavior without dropping any of the radar parsing or rendering
 * logic during the split.
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

    // iPad Safari can expose a stale Screen Orientation angle in landscape.
    // When iOS provides its legacy orientation value, use it to rotate the
    // sensor axes into the screen's coordinate system (matching the compass
    // heading events used below).
    const oldScreenAngle =
      'const th=((screen.orientation&&screen.orientation.angle!=null?screen.orientation.angle:window.orientation)||0)*r,ct=Math.cos(th),st=Math.sin(th);';
    const screenAngleFix =
      "const angle=e.webkitCompassHeading!=null&&typeof window.orientation==='number'?window.orientation:(screen.orientation&&screen.orientation.angle!=null?screen.orientation.angle:window.orientation),th=(angle==null?0:angle)*r,ct=Math.cos(th),st=Math.sin(th);";
    if (!originalScript.textContent.includes(oldScreenAngle)) {
      throw new Error('Could not apply the iPad screen-orientation fix.');
    }

    const script = document.createElement('script');
    script.textContent = originalScript.textContent.replace(oldScreenAngle, screenAngleFix);
    document.body.appendChild(script);
  })
  .catch((error) => {
    const status = document.getElementById('st');
    if (status) status.textContent = `Unable to start radar: ${error.message}`;
    console.error(error);
  });
