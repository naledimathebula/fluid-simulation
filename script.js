const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
if (!gl) { document.body.innerHTML = '<p style" color :#fff ; padding :40px">webGL not supported.</p>';}

const extLinear = gl.getExtension('OES_texture_half_float_linear');
const extHalfFloat = gl.getExtension('OES_texture_half_float');
const textType = extHalfFloat ? extHalfFloat.Half_FLOAT_OES : gl.UNSIGNED_BYTE;

function resize() {
    canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
 
function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
  }
  return s;
}