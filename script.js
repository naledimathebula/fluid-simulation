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
function program(vsSrc, fsSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
  const uniforms = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name;
    uniforms[name] = gl.getUniformLocation(p, name);
  }
  return { program: p, uniforms };
}
 
const baseVertex = `
  precision highp float;
  attribute vec2 aPos;
  varying vec2 vUv;
  void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`;
 

const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

const splatShader = program(baseVertex, `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTarget;
  uniform float aspectRatio;
  uniform vec3 color;
  uniform vec2 point;
  uniform float radius;
  void main () {
    vec2 p = vUv - point.xy;
    p.x *= aspectRatio;
    vec3 splat = exp(-dot(p, p) / radius) * color;
    vec3 base = texture2D(uTarget, vUv).xyz;
    gl_FragColor = vec4(base + splat, 1.0);
  }
`);
 
const advectionShader = program(baseVertex, `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 texelSize;
  uniform float dt;
  uniform float dissipation;
  void main () {
    vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
    vec4 result = texture2D(uSource, coord);
    gl_FragColor = dissipation * result;
  }
`);
 
const divergenceShader = program(baseVertex, `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform vec2 texelSize;
  void main () {
    float L = texture2D(uVelocity, vUv - vec2(texelSize.x, 0.0)).x;
    float R = texture2D(uVelocity, vUv + vec2(texelSize.x, 0.0)).x;
    float B = texture2D(uVelocity, vUv - vec2(0.0, texelSize.y)).y;
    float T = texture2D(uVelocity, vUv + vec2(0.0, texelSize.y)).y;
    float div = 0.5 * (R - L + T - B);
    gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
  }
`);
 
const pressureShader = program(baseVertex, `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  uniform vec2 texelSize;
  void main () {
    float L = texture2D(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
    float R = texture2D(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
    float B = texture2D(uPressure, vUv - vec2(0.0, texelSize.y)).x;
    float T = texture2D(uPressure, vUv + vec2(0.0, texelSize.y)).x;
    float div = texture2D(uDivergence, vUv).x;
    float pressure = (L + R + B + T - div) * 0.25;
    gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
  }
`);
 
const gradientSubtractShader = program(baseVertex, `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  uniform vec2 texelSize;
  void main () {
    float L = texture2D(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
    float R = texture2D(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
    float B = texture2D(uPressure, vUv - vec2(0.0, texelSize.y)).x;
    float T = texture2D(uPressure, vUv + vec2(0.0, texelSize.y)).x;
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity -= vec2(R - L, T - B);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
  }
`);
 
const curlShader = program(baseVertex, `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform vec2 texelSize;
  void main () {
    float L = texture2D(uVelocity, vUv - vec2(texelSize.x, 0.0)).y;
    float R = texture2D(uVelocity, vUv + vec2(texelSize.x, 0.0)).y;
    float B = texture2D(uVelocity, vUv - vec2(0.0, texelSize.y)).x;
    float T = texture2D(uVelocity, vUv + vec2(0.0, texelSize.y)).x;
    float vorticity = R - L - T + B;
    gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
  }
`);
 
const vorticityShader = program(baseVertex, `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform float curlStrength;
  uniform vec2 texelSize;
  uniform float dt;
  void main () {
    float L = texture2D(uCurl, vUv - vec2(texelSize.x, 0.0)).x;
    float R = texture2D(uCurl, vUv + vec2(texelSize.x, 0.0)).x;
    float B = texture2D(uCurl, vUv - vec2(0.0, texelSize.y)).x;
    float T = texture2D(uCurl, vUv + vec2(0.0, texelSize.y)).x;
    float C = texture2D(uCurl, vUv).x;
    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 0.0001;
    force *= curlStrength * C;
    vec2 vel = texture2D(uVelocity, vUv).xy;
    gl_FragColor = vec4(vel + force * dt, 0.0, 1.0);
  }
`);
 
const displayShader = program(baseVertex, `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  void main () {
    vec3 c = texture2D(uTexture, vUv).rgb;
    // gentle tonemap + vignette to sell the "liquid in glass" look
    vec2 d = vUv - 0.5;
    float vig = smoothstep(0.9, 0.35, length(d));
    c *= mix(0.55, 1.0, vig);
    c = c / (c + vec3(0.9));
    gl_FragColor = vec4(c, 1.0);
  }
`);
 
// ---- STEP 2: framebuffers (ping-pong texture pairs) ----
function createFBO(w, h) {
  gl.activeTexture(gl.TEXTURE0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, extLinear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, extLinear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, texType, null);
 
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.viewport(0, 0, w, h);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return { fbo, tex, w, h };
}
function createDoubleFBO(w, h) {
  let fbo1 = createFBO(w, h);
  let fbo2 = createFBO(w, h);
  return {
    get read() { return fbo1; },
    get write() { return fbo2; },
    swap() { const t = fbo1; fbo1 = fbo2; fbo2 = t; }
  };
}
 
const SIM_RES = 128;
const DYE_RES = 512;
let velocity = createDoubleFBO(SIM_RES, SIM_RES);
let dye = createDoubleFBO(DYE_RES, DYE_RES);
let divergence = createFBO(SIM_RES, SIM_RES);
let curl = createFBO(SIM_RES, SIM_RES);
let pressure = createDoubleFBO(SIM_RES, SIM_RES);
 
function drawQuad(prog, setup) {
  gl.useProgram(prog.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  const loc = gl.getAttribLocation(prog.program, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  if (setup) setup(prog.uniforms);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
function bindFBO(target, w, h) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
  gl.viewport(0, 0, w, h);
}
 
// ---- STEP 3: splats (mouse injects color + velocity) ----
function splat(x, y, dx, dy, color) {
  bindFBO(velocity.write, SIM_RES, SIM_RES);
  drawQuad(splatShader, (u) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.uniform1i(u.uTarget, 0);
    gl.uniform1f(u.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(u.point, x, y);
    gl.uniform3f(u.color, dx, dy, 0.0);
    gl.uniform1f(u.radius, 0.0025);
  });
  velocity.swap();
 
  bindFBO(dye.write, DYE_RES, DYE_RES);
  drawQuad(splatShader, (u) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
    gl.uniform1i(u.uTarget, 0);
    gl.uniform1f(u.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(u.point, x, y);
    gl.uniform3f(u.color, color[0], color[1], color[2]);
    gl.uniform1f(u.radius, 0.002);
  });
  dye.swap();
}
 
// wine palette: deep red or acid green splats
const palette = [[0.75,0.05,0.15],[0.75,0.05,0.15],[0.15,0.55,0.15],[0.35,0.65,0.1]];
let lastX = 0.5, lastY = 0.5;
function pointerSplat(x, y) {
  const dx = (x - lastX) * 12;
  const dy = (y - lastY) * 12;
  lastX = x; lastY = y;
  const c = palette[Math.floor(Math.random() * palette.length)];
  splat(x, y, dx, dy, c);
}
 
canvas.addEventListener('mousemove', (e) => {
  pointerSplat(e.clientX / canvas.width, 1.0 - e.clientY / canvas.height);
});
canvas.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  pointerSplat(t.clientX / canvas.width, 1.0 - t.clientY / canvas.height);
}, { passive: true });
 
// kick off some motion automatically, like the wine settling into the glass
function randomSplats(n) {
  for (let i = 0; i < n; i++) {
    const x = 0.3 + Math.random() * 0.4;
    const y = 0.3 + Math.random() * 0.4;
    const c = palette[Math.floor(Math.random() * palette.length)];
    splat(x, y, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, c);
  }
}
 
// ---- STEP 4: the per-frame solver pipeline ----
const texelSim = [1 / SIM_RES, 1 / SIM_RES];
let lastTime = Date.now();
 
function step() {
  const now = Date.now();
  const dt = Math.min((now - lastTime) / 1000, 0.016);
  lastTime = now;
 
  gl.disable(gl.BLEND);
 
  // 1) curl
  bindFBO(curl, SIM_RES, SIM_RES);
  drawQuad(curlShader, (u) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.uniform1i(u.uVelocity, 0);
    gl.uniform2f(u.texelSize, texelSim[0], texelSim[1]);
  });
 
  // 2) vorticity confinement (keeps swirls from smoothing out)
  bindFBO(velocity.write, SIM_RES, SIM_RES);
  drawQuad(vorticityShader, (u) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.uniform1i(u.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, curl.tex);
    gl.uniform1i(u.uCurl, 1);
    gl.uniform1f(u.curlStrength, 22.0);
    gl.uniform2f(u.texelSize, texelSim[0], texelSim[1]);
    gl.uniform1f(u.dt, dt);
  });
  velocity.swap();
 
  // 3) divergence
  bindFBO(divergence, SIM_RES, SIM_RES);
  drawQuad(divergenceShader, (u) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.uniform1i(u.uVelocity, 0);
    gl.uniform2f(u.texelSize, texelSim[0], texelSim[1]);
  });
 
  // 4) pressure solve (Jacobi iterations)
  for (let i = 0; i < 20; i++) {
    bindFBO(pressure.write, SIM_RES, SIM_RES);
    drawQuad(pressureShader, (u) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pressure.read.tex);
      gl.uniform1i(u.uPressure, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, divergence.tex);
      gl.uniform1i(u.uDivergence, 1);
      gl.uniform2f(u.texelSize, texelSim[0], texelSim[1]);
    });
    pressure.swap();
  }
 
  // 5) subtract pressure gradient -> divergence-free velocity
  bindFBO(velocity.write, SIM_RES, SIM_RES);
  drawQuad(gradientSubtractShader, (u) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pressure.read.tex);
    gl.uniform1i(u.uPressure, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.uniform1i(u.uVelocity, 1);
    gl.uniform2f(u.texelSize, texelSim[0], texelSim[1]);
  });
  velocity.swap();
 
  // 6) advect velocity through itself
  bindFBO(velocity.write, SIM_RES, SIM_RES);
  drawQuad(advectionShader, (u) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.uniform1i(u.uVelocity, 0);
    gl.uniform1i(u.uSource, 0);
    gl.uniform2f(u.texelSize, texelSim[0], texelSim[1]);
    gl.uniform1f(u.dt, dt);
    gl.uniform1f(u.dissipation, 0.992);
  });
  velocity.swap();
 
  // 7) advect dye through the velocity field
  bindFBO(dye.write, DYE_RES, DYE_RES);
  drawQuad(advectionShader, (u) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.uniform1i(u.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
    gl.uniform1i(u.uSource, 1);
    gl.uniform2f(u.texelSize, texelSim[0], texelSim[1]);
    gl.uniform1f(u.dt, dt);
    gl.uniform1f(u.dissipation, 0.985);
  });
  dye.swap();
 
  // 8) render dye to the visible canvas
  bindFBO(null, canvas.width, canvas.height);
  drawQuad(displayShader, (u) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
    gl.uniform1i(u.uTexture, 0);
  });
 
  requestAnimationFrame(step);
}
 
resize();
randomSplats(6);
step();
 