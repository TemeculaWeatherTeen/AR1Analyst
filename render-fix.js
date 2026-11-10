/*
 * The sampled 3D beam volumes were made almost invisible by the reduced
 * fragment color/alpha. Keep the NEXRAD colors intact and use a high alpha so
 * overlapping beam cells remain visible over the camera feed on iPad Safari.
 */
(() => {
  const prototype = window.WebGL2RenderingContext?.prototype;
  if (!prototype) {
    console.warn('3D radar renderer: WebGL2 is not available.');
    return;
  }

  const originalShaderSource = prototype.shaderSource;
  prototype.shaderSource = function (shader, source) {
    if (typeof source === 'string') {
      source = source.replace(
        'o=vec4(K[i]*.24,.24);',
        'o=vec4(K[i],.78);'
      );
    }
    return originalShaderSource.call(this, shader, source);
  };
})();
