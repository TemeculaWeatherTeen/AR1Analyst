/*
 * The 3D volume renderer uses standard (non-premultiplied) WebGL blending.
 * Keep radar colors unscaled and use alpha only for translucency; scaling both
 * the RGB values and alpha makes the volume nearly invisible after blending.
 */
(() => {
  const prototype = window.WebGL2RenderingContext?.prototype;
  if (!prototype) return;

  const originalShaderSource = prototype.shaderSource;
  prototype.shaderSource = function (shader, source) {
    if (typeof source === 'string') {
      source = source.replace(
        'o=vec4(K[i]*.24,.24);',
        'o=vec4(K[i],.32);'
      );
    }
    return originalShaderSource.call(this, shader, source);
  };
})();
