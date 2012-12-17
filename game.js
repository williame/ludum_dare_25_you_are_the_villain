var	winOrigin = [0,0],
	winScale = 20,
	startTime = now(),
	lastTick = 0,
	tickFps = 30,
	gravity = 5,
	maxSloop = 8,
	tickMillis = 1000/tickFps,
	newGame = false,
	modding = false,
	playing = false,
	debugCtx,
	layerNames = ["parallax1","parallax0","behind","scene","treasure","enemy","player","in-front"],
	sections,
	surfaceNames = ["ceiling","floor","wall"],
	surfaces,
	tree,
	player = null;

function Section(layer,asset,x,y,scale,animSpeed) {
	assert(asset);
	var	undefined,
		section = {
		layer: layer,
		z: layerNames.indexOf(layer),
		scale: scale||1,
		animSpeed: animSpeed||1000,
		asset: asset,
		ready: false,
		x: NaN, y:NaN,
		w: NaN, h: NaN,
		cx: NaN, cy: NaN,
		ofs: null,
		mMatrix: null, mvMatrix: null,
		setPos: function(x,y) {
			section.tx = x;
			section.ty = y;
			if(!playing) {
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
			if(!section.mMatrix) {
				var	scale = section.scale*winScale,
					bounds = asset.art.bounds,
					size = vec3_sub(bounds[1],bounds[0]);
				section.w = size[0] * scale;
				section.h = size[1] * scale;
				section.ofs = vec3_neg(vec3_add(bounds[0],vec3_scale(size,0.5)));
				section.mMatrix = mat4_multiply(mat4_scale(scale),mat4_translation([section.ofs[0],section.ofs[1],0]));
			}
			section.aabb = [x,y,x+section.w,y+section.h];
			section.cx = x+section.w/2;
			section.cy = y+section.h/2;
			section.mvMatrix = null;
			if(modding)
				saveLevel();
		},
		getMvMatrix: function(pathTime) {
			if(!section.path || float_zero(pathTime)) {
				if(!section.mvMatrix)
					section.mvMatrix = mat4_multiply(
						mat4_translation([section.cx,section.cy,0]),
						section.mMatrix);
				return section.mvMatrix;
			}
			assert(pathTime >= 0 && pathTime < 1,pathTime);
			var start = section.path[0], prev = start, mvMatrix = null, rotation;
			assert(start[0] == 0);
			assert(section.path[section.path.length-1][0] == 1,section.path);
			if(section.facing)
				rotation = mat4_rotation(section.facing*Math.PI/2,[0,1,0]);
			else
				rotation = mat4_identity();
			for(var path in section.path) {
				path = section.path[path];
				if(path[0] > pathTime) {
					pathTime = (pathTime-prev[0]) / (path[0]-prev[0]);
					var translation = [
						section.w/2+path[1]-(path[1]-prev[1])*pathTime,
						section.h/2+path[2]-(path[2]-prev[2])*pathTime,
						0];
					var	scale = section.scale*winScale,
						bounds = asset.art.bounds,
						size = vec3_sub(bounds[1],bounds[0]),
						ofs = vec3_neg(vec3_add(bounds[0],vec3_scale(size,0.5)));
					return mat4_multiply(
						mat4_multiply(
							mat4_translation(translation),
							rotation),
						section.mMatrix);
				}
				prev = path;
			}
			return section.mvMatrix; // dumb checker
		},
		defaultEffectPos: function() {
			return [section.facing<0? section.tx: section.facing>0? section.tx+section.w: section.cx,section.cy];
		},
		move: function(vector) {
			assert(section.path);
			var prev = section.path[section.path.length-1];
			var	shrink = section.w*0.25,
				from_x = prev[1],
				from_y = prev[2],
				to_x = prev[1]+vector[0],
				to_y = prev[2]+vector[1],
				toBox = [to_x+shrink,to_y,to_x+section.w-shrink,to_y+section.h];
			// start from whereever we last were
			section.setPos(from_x,from_y); // we have now reached previous destination
			section.path = [[0,from_x,from_y]];
			section.facing = float_zero(vector[0])? 0: vector[0] < 1? 1: -1;
			var splat = hitsWall([toBox[0]+1,toBox[1]+1,toBox[2]-1,toBox[3]-1]);
			if(splat) {
				doEffect("splat",section.defaultEffectPos());
				if(debugCtx)
					debugCtx.drawLine([1,0,0,1],splat[0][0],splat[0][1],splat[1][0],splat[1][1],2);
				section.vector = [0,-gravity];
				to_x = from_x;
				//to_y = from_y;
				toBox = [to_x+shrink,to_y,to_x+section.w-shrink,to_y+section.h];
			}
			section.moveBox = aabb_join([from_x+shrink,from_y,from_x+section.w-shrink,from_y+section.h],toBox);				
			var floorLevel = getFloor(section.moveBox,Math.max(from_y,to_y));
			if(floorLevel == null) {
				console.log("bad floor",section,from_x,from_y,to_x,to_y);
				restartGame();
				return;
			}
			if(section.zone == "floor") {
				if(floorLevel < to_y-gravity) {
					doEffect("falling",section.defaultEffectPos());
					section.zone = "air";
					section.vector = [vector[0]*0.2,vector[1]*0.5];
					floorLevel = to_y-gravity;
				}
				section.path.push([1,to_x,floorLevel]);
			} else {
				var ceilingLevel = getCeiling(section.moveBox,Math.min(from_y,to_y)+section.h);
				if(section.zone == "ceiling") {
					if(ceilingLevel != null)
						section.path.push([1,to_x,Math.min(ceilingLevel-section.h,to_y)]);
				} else {
					assert(section.zone == "air");
					if(floorLevel >= to_y) {
						doEffect("landing",section.defaultEffectPos());
						section.zone = "floor";
						to_y = floorLevel;
					} else if(ceilingLevel != null) {
						ceilingLevel -= section.h;
						if(ceilingLevel < to_y) {
							doEffect("bump",section.defaultEffectPos());
							to_y = ceilingLevel;
							section.vector[1] = 0;
						}
					}
					section.path.push([1,to_x,to_y]);
				}
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

function getFloor(box,y) {
	if(!tree.floor) return null;
	var	left = box[0],
		right = box[2],
		centre = (left+right)/2,
		nearest = null,
		floor = [];
	tree.floor.find([left,tree.floor.box[1],right,box[3]],floor);
	for(var line in floor) {
		line = floor[line];
		var	x1 = line[0][0],
			x2 = line[1][0],
			a = Math.min(x1,x2);
		if(a > right) continue;
		var b = Math.max(x1,x2);
		if(b < left || float_equ(a,b)) continue;
		var i = Math.min(Math.max(a,centre),b);
		i = (b-i)/(b-a);
		var	y1 = line[0][1],
			y2 = line[1][1],
			h = y1+(y2-y1)*i;
		if(h > y+maxSloop) continue;
		if(nearest == null || nearest < h)
			nearest = h;
	}
	return nearest;
}

function getCeiling(box,y) {
	if(!tree.ceiling) return null;
	var	left = box[0],
		right = box[2],
		centre = (left+right)/2,
		nearest = null,
		ceiling = [];
	tree.ceiling.find([left,tree.ceiling.box[1],right,tree.ceiling.box[3]],ceiling);
	for(var line in ceiling) {
		line = ceiling[line];
		var	x1 = line[0][0],
			x2 = line[1][0],
			a = Math.min(x1,x2);
		if(a > right) continue;
		var b = Math.max(x1,x2);
		if(b < left || float_equ(a,b)) continue;
		var i = Math.min(Math.max(a,centre),b);
		i = (b-i)/(b-a);
		var	y1 = line[0][1],
			y2 = line[1][1],
			h = y1+(y2-y1)*i;
		if(h < y-maxSloop) continue;
		if(nearest == null || nearest > h)
			nearest = h;
	}
	return nearest;
}

function hitsWall(box) {
	if(!tree.wall) return null;
	var check = function(line) { return aabb_line_intersects(box,line)? line: false; };
	return tree.wall.findOne(box,check);
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
		var ptIndex = {}; // we want them shared where possible, for modding
		for(var surface in surfaceNames) {
			surface = surfaceNames[surface];
			surfaces[surface] = [];
			surfaces[surface] = (data.surfaces? data.surfaces[surface]: null) || [];
			for(var line in surfaces[surface]) {
				line = surfaces[surface][line];
				if(!(line[0] in ptIndex))
					ptIndex[line[0]] = line[0];
				else
					line[0] = ptIndex[line[0]];
				if(!(line[1] in ptIndex))
					ptIndex[line[1]] = line[1];
				else
					line[1] = ptIndex[line[1]];
			}
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
	var	startMenu = UIPanel([
			UIButton("New Game!",function() {
					startMenuWin.hide();
					start();
			}),
			UIButton("Level Editor!",function() {
					startMenuWin.hide();
					startModding();
			}),
			UIButton("Vote for us on Ludum Dare!",function() {
				window.location.href = "http://www.ludumdare.com/compo";
			}),
		],UILayoutRows),
		startMenuWin = UIWindow(true,startMenu);
	startMenu.draw = drawLogo;
	startMenu.layout();
	startMenu.setPosVisible([(canvas.width-startMenu.width())*0.4, (canvas.height-startMenu.height())*0.75]);
	startMenuWin.show();
}

function start() {
	if(!sections.player.length ) {
		addMessage(10,null,"cannot play: we don\'t have a player!");
		return;
	}
	assert(sections.player.length == 1);
	resetLevel();
	player = sections.player[0];
	player.path = [[0,player.x,player.y],[1,player.x,player.y]]; // start stationary
	player.zone = "floor";
	tree = {};
	for(var surface in surfaces)
		if(surfaces[surface].length)
			tree[surface] = make_tree(surfaces[surface],function(line) { return aabb(line[0],line[1]); });
	for(var layer in sections)
		if(sections[layer].length && layer != "enemy" && layer != "player")
			tree[layer] = make_tree(sections[layer],function(section) { return [section.x,section.y,section.x+section.w,section.y+section.h]; });
	modding = false;
	playing = true;
	newGame = true;
}

function resetLevel() {
	for(var layer in sections)
		for(var section in sections[layer]) {
			section = sections[layer][section];
			section.setPos(section.x,section.y);
			section.path = null;
			section.vector = [0,0];
			section.dead = false;
		}
}

function restartGame() {
	console.log(player);
	alert("an embarrassing error occurred!\n"+
		"you ran out of floor, somehow...\n"+
		"(blame the level designer, not the coder ;)\n"+
		"We\'ll just restart the level and pretend\n"+
		"it never happened, shall we?");
	keys = {}; // zap all ups and downs etc
	start();
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
	newGame = false;
	if(debugCtx)
		debugCtx.clear();
	// tick
	while(lastTick <= t) {
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
		} else if(playing) {
			var	speed = 10, vector = [0,0];
			if(player.zone == "floor") {
				if(keys[37] && !keys[39]) // left
					vector[0] -= speed;
				else if(keys[39] && !keys[37]) // right
					vector[0] += speed;
				if(keys[38] && !keys[40]) { // up; jump
					player.zone = "air";
					player.vector = [vector[0],5];
				}
			}
			if(player.zone == "air") {
				if(keys[38] && !keys[40]) // up
					player.vector[1] *= 0.9;
				else if(keys[40] && !keys[38]) // down
					player.vector[1] *= 0.5;
				else
					player.vector[1] *= 0.8;
				if(keys[37] && !keys[39]) // left
					player.vector[0] = -speed;
				else if(keys[39] && !keys[37]) // right
					player.vector[0] = speed;
				vector[0] = player.vector[0];
				vector[1] = player.vector[1] * gravity - gravity;
			}

			player.move(vector);
			if(newGame) return;

			if(tree.treasure) {
				var treasure = [];
				tree.treasure.find(player.aabb,treasure);
				if(treasure.length) {
					for(var hit in treasure) {
						hit = treasure[hit];
						if(hit.dead) continue;
						var r = Math.min(hit.w/2,hit.h/2);
						if(aabb_circle_intersects(player.aabb,[hit.x+r,hit.y+r],r)) {
							console.log("took",hit);
							hit.dead = true;
						}
					}
				}
			}
			
			if(debugCtx) {
				var playerBox = player.moveBox;
				debugCtx.drawBox([0,1,0,1],playerBox[0],playerBox[1],playerBox[2],playerBox[3]);
			}
		}
		lastTick += tickMillis;
	}
	if(playing)
		updateParallax();
	var pathTime = 1 - ((lastTick-t) / tickMillis); // now as fraction of next step
	assert(pathTime >= 0 && pathTime < 1,[lastTick,t,tickMillis,pathTime]);
	gl.clearColor(0,0,0,1);
	gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
	if(playing) {
		winOrigin[0] = player.tx+player.w/2-canvas.width/2;
		winOrigin[1] = player.ty+player.h/2-canvas.height/2;
	}
	var	pMatrix = createOrtho2D(winOrigin[0],winOrigin[0]+canvas.width,winOrigin[1],winOrigin[1]+canvas.height,-100,800),
		mvMatrix, nMatrix, colour, animTime,
		screenBox = aabb([winOrigin[0],winOrigin[1]],[winOrigin[0]+canvas.width,winOrigin[1]+canvas.height]),
		array;
	for(var layer in layerNames) {
		layer = layerNames[layer];
		if(tree && tree[layer]) {
			array = [];
			tree[layer].find(screenBox,array);
		} else
			array = sections[layer]; 
		var first = true; 
		for(var section in array) {
			section = array[section];
			if(!section.ready || section.dead)
				continue;
			if(first && section.asset.art.meshes) { // infer is g3d
				gl.clear(gl.DEPTH_BUFFER_BIT);
				first = false;
			}
			mvMatrix = section.getMvMatrix(pathTime);
			nMatrix = mat4_inverse(mat4_transpose(mvMatrix));
			colour = section == modMenu.active? [1,0,0,0.8]: [1,1,1,1];
			animTime = (t % section.animSpeed) / section.animSpeed;
			section.asset.art.draw(animTime,pMatrix,mvMatrix,nMatrix,false,false,colour);
		}
	}
	if(debugCtx) {
		debugCtx.finish();
		modMenu.linesCtx.draw(pMatrix);
		debugCtx.draw(pMatrix);
	}
}

function doEffect(cause,pt) {
	console.log(cause,pt);
}
