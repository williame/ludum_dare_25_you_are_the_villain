
function game() {
	assetManager.show();
}

function render() {
	gl.clearColor(0,0,0,1);
	gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
	var	zoom = 2,
		pMatrix = createPerspective(60.0,canvas.offsetWidth/canvas.offsetHeight,0.1,zoom*2),
		mvMatrix = createLookAt([zoom,zoom*0.8,zoom],[0,0,0],[0,1,0]),
		nMatrix = mat4_inverse(mat4_transpose(mvMatrix));
}
