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
					//if(!float_zero(translation[0])||!float_zero(translation[1]))
						//console.log("section",section.asset.filename,"pathtime",pathTime,prev,path,translation);
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
					Section(layer,asset,section.x,section.y,section.scale);
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

function start() {
	if(!sections.player.length) {
		addMessage(10,null,"cannot play: we don\'t have a player!");
		return;
	}
	assert(sections.player.length == 1);
	player = sections.player[0];
	player.path = [[0,player.x,player.y],[1,player.x,player.y]];
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
			player.setPos(player.path[player.path.length-1][1],player.path[player.path.length-1][2]);
			player.path = [[0,player.x,player.y]];
			var	speed = 10, newPos = [player.x,player.y];
			if(keys[37] && !keys[39]) // left
				newPos[0] -= speed;
			else if(keys[39] && !keys[37]) // right
				newPos[0] += speed;
			if(keys[38] && !keys[40]) // up
				newPos[1] += speed;
			else if(keys[40] && !keys[38]) // down
				newPos[1] -= speed;
			var 	playerPos = [player.x,player.y],
				playerSize = [player.w,player.h],
				playerBox = aabb_join(player.aabb,aabb(newPos,vec2_add(newPos,playerSize)));
			if(debugCtx) {
				debugCtx.clear();
				debugCtx.drawBox([0,1,0,1],playerBox[0],playerBox[1],playerBox[2],playerBox[3]);
			}
			var hits = {}, hitCount = 0;
			for(var surface in surfaces) {
				for(var line in surfaces[surface]) {
					line = surfaces[surface][line];
					var box = aabb(line[0],line[1]);
					if(aabb_intersects(box,playerBox)) {
						hitCount++;
						hits[surface] = hits[surface] || [];
						hits[surface].push([line,box]);
						if(debugCtx) {
							var colour = [1,1,0,1];
							if(aabb_line_intersects(playerBox,line))
								colour = [1,0,0,1];
							debugCtx.drawBox(colour,box[0],box[1],box[2],box[3]);
						}
					}
				}
			}
			if(hitCount) {
			} //else
				player.path.push([1,newPos[0],newPos[1]]);
			if(debugCtx)
				debugCtx.finish();
		}
		lastTick += tickMillis;
	}
	var pathTime = 1 - ((t-lastTick) / tickMillis); // now as fraction of next step
	gl.clearColor(0,0,0,1);
	gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
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
