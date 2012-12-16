var	winOrigin = [0,0],
	winScale = 20,
	startTime = now(),
	lastTick = 0,
	tickFps = 30,
	tickMillis = 1000/tickFps,
	debugCtx = UIContext(),
	layerNames = ["parallax1","parallax0","scene","treasure","enemy","player"],
	sections,
	surfaceNames = ["ceiling","floor","wall"],
	surfaces,
	player = null;

function Section(layer,asset,x,y,scale,animSpeed) {
	assert(asset);
	var	undefined,
		section = {
		layer: layer,
		scale: scale||1,
		animSpeed: animSpeed||1000,
		asset: asset,
		ready: false,
		setPos: function(x,y) {
			section.x = x;
			section.y = y;
			section.ready = asset.art && asset.art.ready;
			if(!section.ready) {
				var retry = function() {
						section.setPos(x,y);
						if(section.ready)
							console.log("asset",asset.filename,"now ready");
					};
				if(asset.art)
					asset.art.readyCallbacks.push(retry);
				else {
					console.log("asset",asset.filename,"has no art!");
					setTimeout(retry,200);
				}	
				return;
			}
			var	scale = section.scale*winScale,
				bounds = asset.art.bounds,
				size = vec3_sub(bounds[1],bounds[0]);
			section.w = size[0] * scale;
			section.h = size[1] * scale;
			section.aabb = [x,y,x+section.w,y+section.h];
			section.mvMatrix = mat4_multiply(
				mat4_translation([section.x,section.y,0]),
				mat4_multiply(mat4_scale(scale),
					mat4_translation([-bounds[0][0],-bounds[0][1],-size[2]/2])));
			if(modding)
				saveLevel();
		},
		getMvMatrix: function(pathTime) {
			if(!section.path || float_zero(pathTime))
				return section.mvMatrix;
			assert(pathTime >= 0 && pathTime < 1);
			var start = section.path[0], prev = start, mvMatrix = null;
			assert(start[0] == 0);
			assert(section.path[section.path.length-1][0] == 1);
			for(var path in section.path) {
				path = section.path[path];
				if(path[0] > pathTime) {
					pathTime = 1- ((pathTime-prev[0]) / (path[0]-prev[0]));
					var translation = [
						prev[1]+(path[1]-prev[1])*pathTime,
						prev[2]+(path[2]-prev[2])*pathTime,
					0];
					var	scale = section.scale*winScale,
						bounds = asset.art.bounds,
						size = vec3_sub(bounds[1],bounds[0]);
					return mat4_multiply(
						mat4_translation(translation),
						mat4_multiply(mat4_scale(scale),
							mat4_translation([-bounds[0][0],-bounds[0][1],-size[2]/2])));
				}
				prev = path;
			}
		},
		move: function(vector) {
			assert(section.path);
			var pos = section.path[section.path.length-1];
			pos = [pos[1],pos[2]]; // easier to have a proper naked vec2 rather than the prefix with the time
			// start from whereever we last were
			section.setPos(pos[0],pos[1]); // we have now reached previous destination
			section.path = [[0,pos[0],pos[1]]];
			// which axis are we going to iterate on?
			var	steps = Math.max(0,Math.ceil(Math.max(Math.abs(vector[0]),Math.abs(vector[1])))),
				xstep = vector[0] / steps,
				ystep = vector[1] / steps;
			for(var step = 0; step<steps; step++) {
				pos[0] += xstep;
				pos[1] += ystep;
				var	aabb = [pos[0],pos[1],pos[0]+section.w,pos[1]+section.h],
					stopped = false;
				for(var type in surfaces) { // cache aabbs, quadtree etc?
					if((type == "ceiling" && ystep < 0) || // can fall through ceilings
						(type == "floor" && ystep > 0)) // can jump up through floors
						continue;
					var array = surfaces[type];
					for(var line in array) {
						line = array[line];
						if(aabb_line_intersects(aabb,line)) {
							pos[0] -= xstep;
							pos[1] -= ystep;
							section.path.push([step/steps,pos[0],pos[1]]);
							stopped = true;
							break;
						}
					}
					if(stopped)
						break;
				}
			}
			// and go to the new place
			section.path.push([1,pos[0],pos[1]]);
		},
		toJSON: function() {
			return {
				scale: section.scale,
				animSpeed: section.animSpeed,
				asset: section.asset.filename,
				x: section.x,
				y: section.y,
			};
		},
	};
	sections[layer].push(section);
	if(endsWith(asset.filename,".png"))
		section.scale = 1/winScale; // back to 1:1 scale
	section.setPos(x===undefined? winOrigin[0]+canvas.width*0.2: x,
		y===undefined? winOrigin[1]+canvas.height*0.2: y);
	return section;
}

var levelLoaded = false, levelFilename = "data/level1.json";

function saveLevel() {
	setFile("json","data/level1.json",{
		surfaces: surfaces,
		sections: sections,
	});
}

function reloadLevel() {
	loadLevel(levelFilename);
}

function loadLevel(filename) {
	levelFilename = filename;
	levelLoaded = false;
	sections = null;
	loadFile("json",filename,function(data) {
		modMenu.newLineStart = null;
		modMenu.editLinePoint = null;
		modMenu.active = null;
		modMenu.linesCtx.clear();
		modMenu.drawLines();
		modMenu.linesCtx.finish();
		surfaces = {};
		for(var surface in surfaceNames) {
			surface = surfaceNames[surface];
			surfaces[surface] = [];
			surfaces[surface] = (data.surfaces? data.surfaces[surface]: null) || [];
		}
		var incomplete = false;
		sections = {};
		for(var layer in layerNames) {
			layer = layerNames[layer];
			sections[layer] = [];
			if(!data.sections)
				continue;
			for(var section in data.sections[layer]) {
				section = data.sections[layer][section];
				var asset = getAsset(section.asset);
				if(asset)
					Section(layer,asset,section.x,section.y,section.scale,section.animSpeed);
				else {
					console.log("cannot get "+section.asset);
					incomplete = true;
				}
			}
		}
		if(incomplete)
			setTimeout(reloadLevel,1000);
		else {
			levelLoaded = true;
			modOnLevelLoaded();
		}
	});
}

function isLoadingComplete() {
	if(!levelLoaded) return false;
	for(var layer in sections)
		for(var section in sections[layer])
			if(!sections[layer][section].ready)
				return false;
	return true;
}

function game() {
	modding = true;
	modMenu.show();
}

var walking = true;

function start() {
	if(!sections.player.length) {
		addMessage(10,null,"cannot play: we don\'t have a player!");
		return;
	}
	assert(sections.player.length == 1);
	player = sections.player[0];
	player.path = [[0,player.x,player.y],[1,player.x,player.y]]; // start stationary
	modding = false;
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
		} else {
			var	speed = 10, vector = [0,0];
			if(keys[37] && !keys[39]) // left
				vector[0] -= speed;
			else if(keys[39] && !keys[37]) // right
				vector[0] += speed;
			if(keys[38] && !keys[40]) // up
				vector[1] += speed;
			else if(keys[40] && !keys[38]) // down
				vector[1] -= speed;

			player.move(vector);
			
			if(debugCtx) {
				var playerBox = player.aabb.slice(0);
				debugCtx.clear();
				debugCtx.drawBox([0,1,0,1],playerBox[0],playerBox[1],playerBox[2],playerBox[3]);
				debugCtx.finish();
			}
		}
		lastTick += tickMillis;
	}
	var pathTime = 1 - ((t-lastTick) / tickMillis); // now as fraction of next step
	gl.clearColor(0,0,0,1);
	gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
	if(player && !modding) {
		winOrigin[0] = player.x+player.w/2-canvas.width/2;
		winOrigin[1] = player.y+player.h/2-canvas.height/2;
	}
	var	pMatrix = createOrtho2D(winOrigin[0],winOrigin[0]+canvas.width,winOrigin[1],winOrigin[1]+canvas.height,-100,800),
		mvMatrix, nMatrix, colour, animTime,
		screenAabb = aabb(winOrigin[0],winOrigin[1],winOrigin[0]+canvas.width,winOrigin[1]+canvas.height);
	for(var layer in sections) {
		layer = sections[layer];
		for(var section in layer) {
			section = layer[section];
			if(!section.ready || !aabb_intersects(screenAabb,section.aabb))
				continue;
			mvMatrix = section.getMvMatrix(pathTime);
			nMatrix = mat4_inverse(mat4_transpose(mvMatrix));
			colour = section == modMenu.active? [1,0,0,0.8]: [1,1,1,1];
			animTime = (t % section.animSpeed) / section.animSpeed;
			section.asset.art.draw(animTime,pMatrix,mvMatrix,nMatrix,false,false,colour);
		}
	}
	//###if(modding)
		modMenu.linesCtx.draw(pMatrix);
	if(debugCtx)
		debugCtx.draw(pMatrix);
}
