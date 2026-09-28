const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
if (!gl) { document.body.innerHTML = '<p style" color :#fff ; padding :40px">webGL not supported.</p>';}