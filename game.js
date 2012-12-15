var	winOrigin = [0,0],
	winScale = 20,
	startTime = now(),
	lastTick = 0,
	tickMillis = 1000/30,
	sections = [],
	modding = false;
	
function winMousePos(evt) {
	var pos = [(evt.clientX-canvas.offsetLeft)+winOrigin[0],
		((canvas.height+canvas.offsetTop)-evt.clientY)+winOrigin[1]];
	return pos;
}

function Section(asset) {
	var section = {
		scale: 1,
		asset: asset,
		setPos: function(x,y) {
			section.x = x;
			section.y = y;
			var	bounds = asset.art.bounds,
				size = vec3_sub(bounds[1],bounds[0]);
			section.mvMatrix = mat4_multiply(
				mat4_translation([section.x,section.y,0]),
				mat4_multiply(mat4_scale(section.scale*winScale),
					mat4_translation([-bounds[0][0],-bounds[0][1],-size[2]/2])));
		},
	};
	if(endsWith(asset.filename,".png"))
		section.scale = 1/winScale; // back to 1:1 scale
	section.setPos(winOrigin[0]+canvas.width*0.2,winOrigin[1]+canvas.height*0.2);
	sections.push(section);
	return section;
}

var modMenu = UIWindow(false,UIPanel([
		UIButton("add",function() { assetManager.pick(function(asset) { modMenu.active = Section(asset); }); }),
	],UILayoutRows));

function pickSection(x,y) {
	var hit = null;
	for(var section in sections) {
		section = sections[section];
		if(modMenu.active == section || !hit) {
			var	ray,
				bounds = section.asset.art.bounds;
			ray = [x-section.x,y-section.y,0];
			ray = vec3_scale(ray,1/(winScale*section.scale));
			ray = [ray[0]+bounds[0][0],ray[1]+bounds[0][1],-100];
			if(section.asset.art.zAt(ray,[0,0,100],0))
					hit = section;
		}
	}
	return hit;
}

function onContextMenu(evt,keys) {
	if(modding) {
		var	pin = winMousePos(evt);
			hit = pickSection(pin[0],pin[1]);
		modMenu.active = hit;
		if(hit) {
			var	menu = UIPanel([
						UILabel(hit.asset.filename),
						UIButton("bring forward",function() {
							var idx = sections.indexOf(hit);
							if(idx < sections.length-1) {
								sections.splice(idx,1);
								sections.splice(idx+1,0,hit);
							}
						}),
						UIButton("send backward",function() {
							var idx = sections.indexOf(hit);
							if(idx > 0) {
								sections.splice(idx,1);
								sections.splice(idx-1,0,hit);
							}
						}),
					],UILayoutRows),
				contextMenu = UIWindow(true,menu);
			contextMenu.layout();
			menu.setPosVisible([(evt.clientX-canvas.offsetLeft)-menu.width(),(evt.clientY-canvas.offsetTop)-menu.height()]);
			contextMenu.show();
		}
	}
}

function onMouseDown(evt,keys) {
	modMenu.pin = null;
	if(modding) {
		var	pin = winMousePos(evt);
			hit = pickSection(pin[0],pin[1]);
		modMenu.active= hit;
		if(hit)
			modMenu.pin = [pin[0]-hit.x,pin[1]-hit.y];
	}
}

function onMouseMove(evt,keys) {
	if(!modMenu.pin)
		return;
	if(modMenu.active) {
		var pos = winMousePos(evt);
		modMenu.active.setPos(
			(pos[0]-modMenu.pin[0]),
			(pos[1]-modMenu.pin[1]));
	}
}

function onMouseUp(evt,keys) {
	modMenu.pin = null;
}

function game() {
	modding = true;
	modMenu.show();
}

function render() {
	var t = now()-startTime;
	// tick
	while(lastTick+tickMillis < t) {
		if(modding) {
			var	panSpeed = 20;
			if(keys[37] && !keys[39]) // left
				winOrigin[0] -= panSpeed;
			else if(keys[39] && !keys[37]) // right
				winOrigin[0] += panSpeed;
			if(keys[38] && !keys[40]) // up
				winOrigin[1] += panSpeed;
			else if(keys[40] && !keys[38]) // down
				winOrigin[1] -= panSpeed;
		}
		lastTick += tickMillis;
	}
	gl.clearColor(0,0,0,1);
	gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
	var	pMatrix = createOrtho2D(winOrigin[0],winOrigin[0]+canvas.width,winOrigin[1],winOrigin[1]+canvas.height,-100,100),
		mvMatrix, nMatrix, colour;
	for(var section in sections) {
		section = sections[section];
		mvMatrix = section.mvMatrix;
		nMatrix = mat4_inverse(mat4_transpose(mvMatrix));
		colour = section == modMenu.active? [1,0,0,0.8]: [1,1,1,1];
		section.asset.art.draw((now()-startTime)%1,pMatrix,mvMatrix,nMatrix,false,false,colour);
	}
}
