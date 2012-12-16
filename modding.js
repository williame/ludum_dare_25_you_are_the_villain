function winMousePos(evt) {
	var pos = [(evt.clientX-canvas.offsetLeft)+winOrigin[0],
		((canvas.height+canvas.offsetTop)-evt.clientY)+winOrigin[1]];
	return pos;
}

var	modding = false,
	modMenuSections = UIPanel([UILabel("section")],UILayoutRows),
	modMenu = UIWindow(false,UIPanel([
		UIPanel([UILabel("tool"),
			UIButton("add",function() {
				modMenu.setMode("add");
				assetManager.pick(function(asset) {
					modMenu.active = Section(modMenu.section,asset);
				});
			},"tool:add"),
			UIButton("ceiling",function() { modMenu.setMode("ceiling"); },"tool:ceiling"),
			UIButton("floor",function() { modMenu.setMode("floor"); },"tool:floor"),
		],UILayoutRows),
		modMenuSections,
		UIButton("play",function() { modding = !modding; modMenu.setMode(modding?"add":"play"); if(!modding) start(); },"tool:play"),
	],UILayoutRows));
modMenu.setMode = function(mode) {
	modMenu.mode = mode;
	console.log("mode "+mode);
	modMenu.walk(function(ctrl) {
		if(ctrl.tag && startsWith(ctrl.tag,"tool:"))
			ctrl.bgColour = ctrl.tag == "tool:"+mode? [1,0,0,1]: UIDefaults.btn.bgColour;
		return true;
	});
	modMenu.dirty();
	modMenu.active = null;
	modMenu.newLineStart = null;
	modMenu.editLinePoint = null;
	modMenu.modeLinesArray = mode == "ceiling"? ceiling: mode == "floor"? floor: null;
	modding = mode != "play";
};
modMenu.setMode("add");
for(var layer in layerNames) {
	layer = layerNames[layer];
	modMenuSections.addChild(UIButton(layer,function() {
		assert(this.tag && startsWith(this.tag,"section:"));
		modMenu.setSection(this.tag.substring(8));
	},"section:"+layer));
}
modMenu.setSection = function(section) {
	modMenu.section = section;
	console.log("section "+section);
	modMenu.walk(function(ctrl) {
		if(ctrl.tag && startsWith(ctrl.tag,"section:"))
			ctrl.bgColour = ctrl.tag == "section:"+section? [1,0,0,1]: UIDefaults.btn.bgColour;
		return true;
	});
	modMenu.dirty();
	modMenu.active = null;
	modMenu.newLineStart = null;
	modMenu.editLinePoint = null;
};
modMenu.setSection("scene");
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
modMenu.ctrl.setPos([10,60]);

function pickSection(x,y,layer) {
	layer = layer || modMenu.section;
	var hit = null;
	for(var section in sections[layer]) {
		section = sections[layer][section];
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

function pickPoint(array,x,y) {
	var pt = [x,y], threshold = 5, best;
	for(var line in array) {
		line = array[line];
		for(var i=0; i<2; i++)
			if(float_equ(line[i][0],x,threshold) && float_equ(line[i][1],y,threshold))
				if(!best || vec2_distance_sqrd(line[i],pt) < vec2_distance_sqrd(best,pt))
					best = line[i];
	}
	return best;
}

function linesForPoint(array,pt) {
	var lines = [];
	for(var line in array) {
		line = array[line];
		if(line[0] === pt || line[1] === pt)
			lines.push(line);
	}
	return lines;
}

function onContextMenu(evt,keys) {
	if(modding) {
		modMenu.newLineStart = null;
		modMenu.editLinePoint = null;
		var pin = winMousePos(evt);
		if(modMenu.mode == "add") {
			var hit = pickSection(pin[0],pin[1]);
				modMenu.active = hit;
			if(hit) {
				var	menu = UIPanel([
							UILabel(hit.asset.filename),
							UILabel(hit.layer),
							UIButton("bring forward",function() {
								var idx = sections[hit.layer].indexOf(hit);
								if(idx >= 0 && idx < sections[hit.layer].length-1) {
									sections[hit.layer].splice(idx,1);
									sections[hit.layer].splice(idx+1,0,hit);
								}
								saveLevel();
							}),
							UIButton("send backward",function() {
								var idx = sections[hit.layer].indexOf(hit);
								if(idx > 0) {
									sections[hit.layer].splice(idx,1);
									sections[hit.layer].splice(idx-1,0,hit);
								}
								saveLevel();
							}),
							UIButton("remove",function() {
								var idx = sections[hit.layer].indexOf(hit);
								if(idx >= 0)
									sections[hit.layer].splice(idx,1);
								saveLevel();
								contextMenu.dismiss();
							}),
						],UILayoutRows),
					contextMenu = UIWindow(true,menu);
				contextMenu.layout();
				menu.setPosVisible([(evt.clientX-canvas.offsetLeft)-menu.width(),(evt.clientY-canvas.offsetTop)-menu.height()]);
				contextMenu.show();
			}
		} else if(modMenu.modeLinesArray) {
			var lines = linesForPoint(modMenu.modeLinesArray,pickPoint(modMenu.modeLinesArray,pin[0],pin[1]));
			if(lines.length > 0) {
				var	menu = UIPanel([
							UILabel(""+lines.length+" line(s)"),
							UIButton("remove",function() {
								for(var line in lines) {
									var idx = modMenu.modeLinesArray.indexOf(lines[line]);
									if(idx >= 0)
										modMenu.modeLinesArray.splice(idx,1);
								}
								modMenu.linesCtx.clear();
								modMenu.drawLines();
								modMenu.linesCtx.finish();
								saveLevel();
								contextMenu.dismiss();
							}),
						],UILayoutRows),
					contextMenu = UIWindow(true,menu);
				contextMenu.layout();
				menu.setPosVisible([(evt.clientX-canvas.offsetLeft)-menu.width(),(evt.clientY-canvas.offsetTop)-menu.height()]);
				contextMenu.show();
			} else
				console.log("miss!");
		}
	}
}

function onMouseDown(evt,keys) {
	modMenu.pin = null;
	modMenu.newLineStart = null;
	modMenu.editLinePoint = null;
	if(modding) {
		console.log("mode",modMenu.mode);
		var pin = winMousePos(evt);
		if(modMenu.mode == "add") {
			var hit = pickSection(pin[0],pin[1]);
			modMenu.active= hit;
			if(hit)
				modMenu.pin = [pin[0]-hit.x,pin[1]-hit.y];
		} else if(modMenu.modeLinesArray) {
			pin = pickPoint(modMenu.modeLinesArray,pin[0],pin[1]) || pin;
			if(linesForPoint(modMenu.modeLinesArray,pin).length > 1)
				modMenu.editLinePoint = pin;
			else
				modMenu.newLineStart = pin;
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
		} else if(modMenu.newLineStart && modMenu.modeLinesArray) {
			var pin = winMousePos(evt), newPos = pin;
			pin = pickPoint(modMenu.modeLinesArray,pin[0],pin[1]) || pin;
			modMenu.linesCtx.clear();
			modMenu.drawLines();
			var colour = modMenu.mode == "floor"? [0,1,0,1]: [0,0,1,1];
			modMenu.linesCtx.drawLine(colour,modMenu.newLineStart[0],modMenu.newLineStart[1],pin[0],pin[1]);
			modMenu.linesCtx.finish();
		} else if(modMenu.editLinePoint && modMenu.modeLinesArray) {
			var pin = winMousePos(evt);
			modMenu.editLinePoint[0] = pin[0];
			modMenu.editLinePoint[1] = pin[1];
			modMenu.linesCtx.clear();
			modMenu.drawLines();
			modMenu.linesCtx.finish();
			saveLevel();
		}
	}
}

function onMouseUp(evt,keys) {
	modMenu.pin = null;
	if(modding) {
		if(modMenu.newLineStart && modMenu.modeLinesArray) {
			var pin = winMousePos(evt);
			pin = pickPoint(modMenu.modeLinesArray,pin[0],pin[1]) || pin;
			if(!float_zero(vec2_distance_sqrd(modMenu.newLineStart,pin)))
				modMenu.modeLinesArray.push([modMenu.newLineStart,pin]);
			saveLevel();
		}
		modMenu.newLineStart = null;
		modMenu.editLinePoint = null;
	}
}
