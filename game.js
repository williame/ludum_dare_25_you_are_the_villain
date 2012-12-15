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

function Section(asset,x,y,scale) {
	assert(asset);
	var	undefined,
		section = {
		scale: scale||1,
		asset: asset,
		setPos: function(x,y) {
			section.x = x;
			section.y = y;
			if(!asset.art.ready) {
				asset.art.readyCallbacks.push(function() {
					section.setPos(x,y);
				});
				return;
			}
			var	bounds = asset.art.bounds,
				size = vec3_sub(bounds[1],bounds[0]);
			section.mvMatrix = mat4_multiply(
				mat4_translation([section.x,section.y,0]),
				mat4_multiply(mat4_scale(section.scale*winScale),
					mat4_translation([-bounds[0][0],-bounds[0][1],-size[2]/2])));
			saveLevel();
		},
		toJSON: function() {
			return {
				scale: section.scale,
				asset: section.asset.filename,
				x: section.x,
				y: section.y,
			};
		},
	};
	sections.push(section);
	if(endsWith(asset.filename,".png"))
		section.scale = 1/winScale; // back to 1:1 scale
	section.setPos(x===undefined? winOrigin[0]+canvas.width*0.2: x,
		y===undefined? winOrigin[1]+canvas.height*0.2: y);
	return section;
}

var	ceiling = [], floor = [], 
	levelLoaded = false, levelFilename = "data/level1.json";

function saveLevel() {
	setFile("json","data/level1.json",{
		ceiling: ceiling,
		floor: floor,
		sections: sections,
	});
}

function reloadLevel() {
	loadLevel(levelFilename);
}

function loadLevel(filename) {
	levelFilename = filename;
	levelLoaded = false;
	ceiling = [];
	floor = [];
	sections = [];
	loadFile("json",filename,function(data) {
		ceiling = data.ceiling || [];
		floor = data.floor || [];
		sections = [];
		modMenu.newLine = null;
		modMenu.active = null;
		modMenu.linesCtx.clear();
		modMenu.drawLines();
		modMenu.linesCtx.finish();
		var incomplete = false;
		for(var section in data.sections) {
			section = data.sections[section];
			var asset = getAsset(section.asset);
			if(asset)
				Section(asset,section.x,section.y,section.scale);
			else {
				console.log("cannot get "+section.asset);
				incomplete = true;
			}
		}
		if(incomplete)
			setTimeout(reloadLevel,1000);
		else
			levelLoaded = true;
	});
}

var modMenu = UIWindow(false,UIPanel([
		UIButton("add",function() {
			modMenu.setMode("add");
			assetManager.pick(function(asset) {
				modMenu.active = Section(asset);
			});
		},"add"),
		UIButton("ceiling",function() { modMenu.setMode("ceiling"); },"ceiling"),
		UIButton("floor",function() { modMenu.setMode("floor"); },"floor"),
	],UILayoutRows));
modMenu.setMode = function(mode) {
	modMenu.mode = mode;
	modMenu.walk(function(ctrl) {
		if(ctrl.tag)
			ctrl.bgColour = ctrl.tag == mode? [1,0,0,1]: UIDefaults.btn.bgColour;
		return true;
	});
	modMenu.dirty();
	modMenu.active = null;
	modMenu.newLine = null;
};
modMenu.setMode("add");
modMenu.linesCtx = UIContext();
modMenu.drawLines = function() {
	for(var line in ceiling) {
		line = ceiling[line];
		modMenu.linesCtx.drawLine([0,0,1,1],line[0][0],line[0][1],line[1][0],line[1][1]);
	}
	for(var line in floor) {
		line = floor[line];
		modMenu.linesCtx.drawLine([0,1,0,1],line[0][0],line[0][1],line[1][0],line[1][1]);
	}
};

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
		modMenu.newLine = null;
		var	pin = winMousePos(evt),
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
	modMenu.newLine = null;
	if(modding) {
		console.log("mode",modMenu.mode);
		var pin = winMousePos(evt);
		if(modMenu.mode == "add") {
			var hit = pickSection(pin[0],pin[1]);
			modMenu.active= hit;
			if(hit)
				modMenu.pin = [pin[0]-hit.x,pin[1]-hit.y];
		} else if(modMenu.mode == "floor" || modMenu.mode == "ceiling") {
			modMenu.newLine = [pin,pin];
		}
	}
}

function onMouseMove(evt,keys) {
	if(modding) {
		if(modMenu.mode == "add") {
			if(!modMenu.pin)
				return;
			if(modMenu.active) {
				var pos = winMousePos(evt);
				modMenu.active.setPos(
					(pos[0]-modMenu.pin[0]),
					(pos[1]-modMenu.pin[1]));
			}
		} else if(modMenu.newLine && (modMenu.mode == "floor" || modMenu.mode == "ceiling")) {
			modMenu.newLine[1] = winMousePos(evt);
			modMenu.linesCtx.clear();
			modMenu.drawLines();
			var colour = modMenu.mode == "floor"? [0,1,0,1]: [0,0,1,1];
			modMenu.linesCtx.drawLine(colour,modMenu.newLine[0][0],modMenu.newLine[0][1],modMenu.newLine[1][0],modMenu.newLine[1][1]);
			modMenu.linesCtx.finish();
		}
	}
}

function onMouseUp(evt,keys) {
	modMenu.pin = null;
	if(modding) {
		if(modMenu.newLine && (modMenu.mode == "floor" || modMenu.mode == "ceiling")) {
			modMenu.newLine[1] = winMousePos(evt);
			if(!float_zero(vec2_distance_sqrd(modMenu.newLine[0],modMenu.newLine[1])))
				(modMenu.mode == "floor"? floor: ceiling).push(modMenu.newLine);
			saveLevel();
		}
	}
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
		if(!section.asset.art.ready)
			continue;
		mvMatrix = section.mvMatrix;
		nMatrix = mat4_inverse(mat4_transpose(mvMatrix));
		colour = section == modMenu.active? [1,0,0,0.8]: [1,1,1,1];
		section.asset.art.draw((now()-startTime)%1,pMatrix,mvMatrix,nMatrix,false,false,colour);
	}
	if(modding)
		modMenu.linesCtx.draw(pMatrix);
}
