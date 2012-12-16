function winMousePos(evt) {
	var pos = [(evt.clientX-canvas.offsetLeft)+winOrigin[0],
		((canvas.height+canvas.offsetTop)-evt.clientY)+winOrigin[1]];
	return pos;
}

var	modding = false,
	surfaceColours = {
		ceiling: [0.6,0.8,1,1],
		floor: [0.8,0.6,1,1],
		wall: [1,0.6,0.6,1],
	},
	modMenuMode = UIPanel([UILabel("tool"),
			UIButton("add",function() {
				modMenu.setMode("add");
				assetManager.pick(function(asset) {
					if(modMenu.section == "player") // only one ever
						sections["player"] = [];
					modMenu.active = Section(modMenu.section,asset);
				});
			},"mode:add"),
		],UILayoutRows),
	modMenuSections = UIPanel([UILabel("section")],UILayoutRows),
	modMenu = UIWindow(false,UIPanel([
		modMenuMode,
		modMenuSections,
		UIButton("play",function() {
			modMenu.setMode(modding?"play":"add");
			if(modding) start();
			if(modding) modMenu.setMode("add"); },"tool:play"),
	],UILayoutRows));
modMenu.setMode = function(mode) {
	modMenu.mode = mode;
	console.log("mode "+mode);
	modMenu.walk(function(ctrl) {
		if(ctrl.tag && startsWith(ctrl.tag,"mode:"))
			ctrl.bgColour = ctrl.tag == "mode:"+mode? [1,0,0,1]: UIDefaults.btn.bgColour;
		return true;
	});
	modMenu.dirty();
	modMenu.active = null;
	modMenu.newLineStart = null;
	modMenu.editLinePoint = null;
	modMenu.modeLine = surfaceNames.indexOf(mode) >= 0;
	if(mode != "play")
		modding = true;
};
for(var mode in surfaceNames) {
	mode = surfaceNames[mode];
	assert(surfaceColours[mode]);
	modMenuMode.addChild(UIButton(mode,function() {
		assert(this.tag && startsWith(this.tag,"mode:"));
		modMenu.setMode(this.tag.substring(5));
	},"mode:"+mode));
}
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
	for(var surface in surfaces)
		for(var line in surfaces[surface]) {
			line = surfaces[surface][line];
			modMenu.linesCtx.drawLine(surfaceColours[surface],line[0][0],line[0][1],line[1][0],line[1][1]);
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

function pickPoint(x,y) {
	var pt = [x,y], threshold = 5, best;
	for(var array in surfaces)
		for(var line in surfaces[array]) {
			line = surfaces[array][line];
			for(var i=0; i<2; i++)
				if(float_equ(line[i][0],x,threshold) && float_equ(line[i][1],y,threshold))
					if(!best || vec2_distance_sqrd(line[i],pt) < vec2_distance_sqrd(best,pt))
						best = line[i];
		}
	return best;
}

function linesForPoint(pt) {
	var lines = [];
	for(var array in surfaces)
		for(var line in surfaces[array]) {
			line = surfaces[array][line];
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
		} else if(modMenu.mode in surfaces) {
			var lines = linesForPoint(pickPoint(pin[0],pin[1]));
			if(lines.length > 0) {
				var	menu = UIPanel([
							UILabel(""+lines.length+" line(s)"),
							UIButton("remove",function() {
								for(var line in lines) {
									for(var surface in surfaces) {
										surface = surfaces[surface];
										var idx = surface.indexOf(lines[line]);
										if(idx >= 0)
											surface.splice(idx,1);
									}
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
		var pin = winMousePos(evt);
		if(modMenu.mode == "add") {
			var hit = pickSection(pin[0],pin[1]);
			modMenu.active = hit;
			if(hit)
				modMenu.pin = [pin[0]-hit.x,pin[1]-hit.y];
		} else if(modMenu.modeLine) {
			pin = pickPoint(pin[0],pin[1]) || pin;
			if(linesForPoint(pin).length > 1)
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
		} else if(modMenu.newLineStart && modMenu.modeLine) {
			var pin = winMousePos(evt), newPos = pin;
			pin = pickPoint(pin[0],pin[1]) || pin;
			modMenu.linesCtx.clear();
			modMenu.drawLines();
			var colour = surfaceColours[modMenu.mode];
			modMenu.linesCtx.drawLine(colour,modMenu.newLineStart[0],modMenu.newLineStart[1],pin[0],pin[1]);
			modMenu.linesCtx.finish();
		} else if(modMenu.editLinePoint && modMenu.modeLine) {
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
		if(modMenu.newLineStart && modMenu.modeLine) {
			var pin = winMousePos(evt);
			pin = pickPoint(pin[0],pin[1]) || pin;
			if(!float_zero(vec2_distance_sqrd(modMenu.newLineStart,pin)))
				surfaces[modMenu.mode].push([modMenu.newLineStart,pin]);
			saveLevel();
		}
		modMenu.newLineStart = null;
		modMenu.editLinePoint = null;
	}
}
