var	winOrigin = [0,0],
	winScale = 20,
	startTime = now(),
	lastTick = 0,
	tickFps = 30,
	gravity = 5,
	maxSloop = 8,
	tickMillis = 1000/tickFps,
	debugCtx = UIContext(),
	layerNames = ["parallax1","parallax0","scene","treasure","enemy","player"],
	sections,
	surfaceNames = ["ceiling","floor","wall"],
	surfaces,
	treeCeiling,treeFloor,treeWall,
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
			section.tx = x;
			section.ty = y;
			if(modding) {
				section.x = x;
				section.y = y;
			}
			section.ready = asset.art && asset.art.ready;
			if(!section.ready) {
				var retry = function() {
						if(section.ready)
							return;
						section.setPos(x,y);
						if(section.ready)
							console.log("asset",asset.filename,"now ready");
					};
				if(asset.art) {
					if(asset.art.readyCallbacks.indexOf(retry) == -1)
						asset.art.readyCallbacks.push(retry);
					else
						console.log("asset",asset.filename,"still not ready");
				} else if(section.readyCallback)
					console.log("asset",asset.filename,"still has no art!");
				else {
					console.log("asset",asset.filename,"has no art!");
					section.readyCallback = setTimeout(function() {
						section.readyCallback = null;
						retry();
					},200);
				}
				return;
			}
			if(section.readyCallback) {
				clearTimeout(section.readyCallback);
				section.readyCallback = null;
			}
			var	scale = section.scale*winScale,
				bounds = asset.art.bounds,
				size = vec3_sub(bounds[1],bounds[0]);
			section.w = size[0] * scale;
			section.h = size[1] * scale;
			section.aabb = [x,y,x+section.w,y+section.h];
			section.mvMatrix = mat4_multiply(
				mat4_translation([x,y,0]),
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
					pathTime = 1-((pathTime-prev[0]) / (path[0]-prev[0]));
					var translation = [
						path[1]-(path[1]-prev[1])*pathTime,
						path[2]-(path[2]-prev[2])*pathTime,
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
			return null; // dumb checker
		},
		move: function(vector) {
			assert(section.path);
			var pos = section.path[section.path.length-1];
			pos = [pos[1],pos[2]]; // easier to have a proper naked vec2 rather than the prefix with the time
			// start from whereever we last were
			section.setPos(pos[0],pos[1]); // we have now reached previous destination
			section.path = [[0,pos[0],pos[1]]];
			var	left = pos[0]+vector[0],
				bottom = pos[1]+vector[1];
			if(float_zero(vector[0]) || hitsWall(left,bottom,section.w,section.h)) {
				left = pos[0];
				vector[0] = 0;
			}
			var floorLevel = getFloor(left,pos[1],section.w);
			if(section.zone == "floor") {
				if(floorLevel != null) {
					if(floorLevel < bottom-gravity) {
						console.log("falling!",floorLevel,bottom-gravity);
						section.zone = "air";
						section.vector = [vector[0],0];
						floorLevel = bottom-gravity;
					}
					pos[0] += vector[0];
					pos[1] = floorLevel;
				}
			} else {
				var ceilingLevel = getCeiling(left,pos[1]+section.h,section.w);
				if(section.zone == "ceiling") {
					if(ceilingLevel != null) {
						bottom = Math.min(ceilingLevel-section.h,bottom);
						pos[0] += vector[0];
						pos[1] = bottom;
					}
				} else {
					assert(section.zone == "air");
					if(floorLevel != null) { // something to fall onto
						if(ceilingLevel != null)
							bottom = Math.min(ceilingLevel-section.h,bottom);
						if(floorLevel >= bottom) {
							console.log("landing!",floorLevel,bottom);
							section.zone = "floor";
							bottom = floorLevel;
						}
						pos[0] += vector[0];
						pos[1] = bottom;
					}
				}
			}
			/*
			// which axis are we going to iterate on?
			var	steps = Math.max(1,Math.ceil(Math.max(Math.abs(vector[0]),Math.abs(vector[1])))),
				xstep = vector[0] / steps,
				ystep = vector[1] / steps,
				vn;
			for(var step = 0; step<steps; step++) {
				pos[0] += xstep;
				pos[1] += ystep;
				var	aabb,
					left = pos[0]+section.w*0.25,
					right = pos[0]+section.w*0.75,
					hit = null;
				for(var type in surfaces) { // cache aabbs, quadtree etc?
					if(type == "wall") {
						aabb = [left,pos[1],right,pos[1]+section.h];
					} else if(type == "ceiling") {
						aabb = [left,pos[1]+section.h*0.7,right,pos[1]+section.h]; // top bit
					} else if(type == "floor") {
						aabb = [left,pos[1],right,pos[1]+section.h*0.3]; // bottom bit
					}
					var array = surfaces[type];
					for(var line in array) {
						line = array[line];
						if(aabb_line_intersects(aabb,line)) { // hit! for now, stop dead
							vn = vn || vec2_normalise(vector);
							var	ln = line_normal(line),
								lndotv = vec2_dot(ln,vn);
							if(Math.abs(lndotv) < 0.2) continue;
							hit = hit || {};
							hit[type] = hit[type] || [];
							hit[type].push(line);
						}
					}
				}
				if(hit) { // all the things we hit
					pos[0] -= xstep;
					pos[1] -= ystep;
					section.path.push([step/steps,pos[0],pos[1]]);
				}
			}*/
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

function getFloor(x,y,w) {
	var	left = x+w*0.25,
		centre = x+w*0.5,
		right = x+w*0.75,
		nearest = null,
		floor = [];
	treeFloor.find([left,treeFloor.box[1],right,treeFloor.box[3]],floor);
	for(var line in floor) {
		line = floor[line];
		var a = Math.min(line[0][0],line[1][0]);
		if(a > right) continue;
		var b = Math.max(line[0][0],line[1][0]);
		if(b < left || float_equ(a,b)) continue;
		var i = Math.min(Math.max(a,centre),b);
		i = (b-i)/(b-a);
		var h = line[0][1]+(line[1][1]-line[0][1])*i;
		if(h > y+maxSloop) continue;
		if(nearest == null || nearest < h)
			nearest = h;
	}
	return nearest;
}

function getCeiling(x,y,w) {
	var	left = x+w*0.25,
		centre = x+w*0.5,
		right = x+w*0.75,
		nearest = null,
		ceiling = [];
	treeCeiling.find([left,treeCeiling.box[1],right,treeCeiling.box[3]],ceiling);
	for(var line in ceiling) {
		line = ceiling[line];
		var a = Math.min(line[0][0],line[1][0]);
		if(a > right) continue;
		var b = Math.max(line[0][0],line[1][0]);
		if(b < left || float_equ(a,b)) continue;
		var i = Math.min(Math.max(a,centre),b);
		i = (b-i)/(b-a);
		var h = line[0][1]+(line[1][1]-line[0][1])*i;
		if(h < y-maxSloop) continue;
		if(nearest == null || nearest > h)
			nearest = h;
	}
	return nearest;
}

function hitsWall(x,y,w,h) {
	var 	left = x+w*0.25,
		right = x+w*0.75,
		walls = surfaces.wall,
		box = [left,y,right,y+h],
		check = function(line) { return aabb_line_intersects(box,line); };
	return treeWall.findOne(box,check);
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
	startModding();
}

function start() {
	if(!sections.player.length ) {
		addMessage(10,null,"cannot play: we don\'t have a player!");
		return;
	}
	assert(sections.player.length == 1);
	player = sections.player[0];
	player.path = [[0,player.x,player.y],[1,player.x,player.y]]; // start stationary
	player.zone = "floor";
	treeFloor = make_tree(surfaces.floor || []);
	treeCeiling = make_tree(surfaces.ceiling || []);
	treeWall = make_tree(surfaces.wall || []);
	modding = false;
}

function updateParallax() {
	var	x_diff = player.x-player.tx,
		y_diff = player.y-player.ty,
        	po0_x_distance = x_diff * 0.2,
        	po1_x_distance = x_diff * 0.1,
        	po0_y_distance = y_diff * 0.2,
        	po1_y_distance = y_diff * 0.1,
        	obj;
	for(obj in sections.parallax0) {
		obj = sections.parallax0[obj];
		obj.setPos(obj.x+po0_x_distance,obj.y+po0_y_distance);
	}
	for(obj in sections.parallax1) {
		obj = sections.parallax1[obj];
		obj.setPos(obj.x+po1_x_distance,obj.y+po1_y_distance);
	}
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
			if(player.zone == "floor") {
				if(keys[37] && !keys[39]) // left
					vector[0] -= speed;
				else if(keys[39] && !keys[37]) // right
					vector[0] += speed;
				if(keys[38] && !keys[40]) { // up; jump
					player.zone = "air";
					player.vector = [vector[0],10];
				}
			}
			if(player.zone == "air") {
				if(keys[38] && !keys[40]) // up
					player.vector[1] *= 0.9;
				else if(keys[40] && !keys[38]) // down
					player.vector[1] *= 0.5;
				else
					player.vector[1] *= 0.8;
				vector[0] = player.vector[0];
				vector[1] = player.vector[1] * gravity - gravity;
			}

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
	if(!modding)
		updateParallax();
	var pathTime = 1 - ((t-lastTick) / tickMillis); // now as fraction of next step
	gl.clearColor(0,0,0,1);
	gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
	if(player && !modding) {
		winOrigin[0] = player.tx+player.w/2-canvas.width/2;
		winOrigin[1] = player.ty+player.h/2-canvas.height/2;
	}
	var	pMatrix = createOrtho2D(winOrigin[0],winOrigin[0]+canvas.width,winOrigin[1],winOrigin[1]+canvas.height,-100,800),
		mvMatrix, nMatrix, colour, animTime,
		screenAabb = aabb([winOrigin[0],winOrigin[1]],[winOrigin[0]+canvas.width,winOrigin[1]+canvas.height]);
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
