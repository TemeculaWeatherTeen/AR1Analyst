/*
 * The app patches the pinned source's shader before compiling it. Keep the
 * 3D beam/cone geometry and elevation calculation, but emit correctly
 * premultiplied translucent colors so the WebGL canvas can composite visibly
 * over the iPad camera feed.
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
        'o=vec4(K[i],.72);'
      );
    }
    return originalShaderSource.call(this, shader, source);
  };
})();
