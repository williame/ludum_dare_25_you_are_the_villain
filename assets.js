function AssetManager() {
	var	title = UILabel("<active asset name>"),
		prev = UIButton("prev",function() { mgr._prev(); }),
		next = UIButton("next",function() { mgr._next(); }),
		ok = UIButton("OK",function() { mgr.ok(); }),
		active = UIComponent(),
		win = UIWindow(true,UIPanel([
				UIPanel([UILabel("asset:"),title]),
				active,
				UIPanel([prev,next,ok])],
				UILayoutRows)),
		mgr = {
			show: function(idx) {
				mgr.ok = function() { win.hide(); }
				mgr.refresh(idx);
				win.show();
			},
			refresh: function(idx) {
				var undefined;
				if(idx !== undefined)
					mgr.active = idx;
				mgr.active = Math.max(0,Math.min(assets.length-1,mgr.active));
				active.asset = assets[mgr.active];
				title.text = active.asset?
					"["+(mgr.active+1)+"/"+assets.length+"] "+active.asset.filename:
					"<no assets>";
				win.layout();
			},
			active: 0,			
			_prev: function() {
				mgr.active--;
				mgr.refresh();
			},
			_next: function() {
				mgr.active++;
				mgr.refresh();
			},
		};
	win.bgColour = [0.8,0.8,1,1];
	active.setSize([400,400]);
	active.startTime = now();
	active.render = function(ctx) {
		if(!active.asset || !active.asset.art || !active.asset.art.ready) return;
		var	oldViewport = gl.getParameter(gl.VIEWPORT),
			viewport = [active.x1,ctx.height-active.y1-active.height(),active.width(),active.height()]; 
		gl.viewport(viewport[0],viewport[1],viewport[2],viewport[3]);
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(viewport[0],viewport[1],viewport[2],viewport[3]);
		gl.clearColor(1,1,1,1);
		gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
		var	bounds = active.asset.art.bounds,
			size = vec3_sub(bounds[1],bounds[0]),
			dim = Math.max(size[0],size[1])*1.1,
			padX = (dim-size[0])/2,
			padY = (dim-size[1])/2,
			pMatrix = createOrtho2D(bounds[0][0]-padX,padX+bounds[1][0],
				bounds[0][1]-padY,padY+bounds[1][1],
				0,size[2]),
			mvMatrix = mat4_translation([0,0,-bounds[1][2]]),
			nMatrix = mat4_inverse(mat4_transpose(mvMatrix));
		active.asset.art.draw((now()-active.startTime)%1,pMatrix,mvMatrix,nMatrix);
		gl.disable(gl.SCISSOR_TEST);
		gl.viewport(oldViewport[0],oldViewport[1],oldViewport[2],oldViewport[3]);
	};
	active.draw = function(ctx) { if(active.asset) ctx.inject(active.render); };
	return mgr;
}

function Asset(filename,art) {
	if(!art) {
		if(filename.indexOf(".g3d",filename.length-4) != -1)
			loadFile("g3d",filename,function(art) { asset.art = art; });
		else
			fail("unsupported file extension: "+filename);
	}
	var asset = {
		filename: filename,
		art: art,
	};
	addAsset(asset);
	return asset;
}

var assets = [], assetManager = AssetManager();

function getAsset(filename) {
	for(var a in assets) {
		var asset = assets[a];
		if(asset.filename == filename)
			return asset;
	}
	return null;
}

function addAsset(asset) {
	for(var a in assets)
		if(assets[a].filename == asset.filename) {
			assets.splice(a,1,asset);
			assert.idx = a;
			assetManager.refresh();
			return;
		}
	assets.push(asset);
	asset.idx = assets.length-1;
	assetManager.refresh();
}

function removeAsset(asset) {
	for(var a in assets)
		if(assets[a] === asset) {
			assets.splice(a,1);
			assetManager.refresh();
			break;
		}
}

function reloadAllData() {
	assets = [];
	assetManager.refresh();
	loadFile("json","data/assets.json",function(assets) {
			for(var a in assets)
				Asset(assets[a]);
	});
}

reloadAllData();

function uploadAsset() {
	uploadAsset.pending = uploadAsset.pending || [];
	if(uploadAsset.pending.length) {
		alert("cannot perform upload while previous upload still underway");
		return;
	}
	uploadAsset.assetFilenames = [];
	for(var a in assets)
		uploadAsset.assetFilenames.push(assets[a].filename);
	var files = document.getElementById("uploadFiles").files,
		active = assetManager.active;
	for(var i=0; i<files.length; i++) {
		var file = files[i], type, filename = "data/"+file.name;
		console.log("uploading",filename);
		if(filename.indexOf(".g3d",filename.length-4) != -1)
			type = "g3d";
		else {
			alert("unsupported upload type:\n"+filename);
			continue;
		}
		uploadAsset.pending.push(filename);
		var reader = new FileReader();
		reader.filename = filename;
		reader.type = type;
		reader.onload = function(e) {
			setFile(this.type,this.filename,e.target.result);
			active = Asset(this.filename).idx;
			if(uploadAsset.assetFilenames.indexOf(this.filename) == -1)
				uploadAsset.assetFilenames.push(this.filename);
			uploadAsset.pending.splice(uploadAsset.pending.indexOf(this.filename),1);
			if(!uploadAsset.pending.length) {
				console.log("assets now:",uploadAsset.assetFilenames);
				setFile("json","data/assets.json",uploadAsset.assetFilenames);
				reloadAllData();
				assetManager.show(active);
			}
		};
		reader.readAsArrayBuffer(file);
	}
}

if(document.getElementById("uploadButton"))
	document.getElementById("uploadButton").onclick = uploadAsset;

function uploadAssets() {
	var	dirty = getDirtyFiles(),
		numFiles = 0,
		form = new FormData();
	for(var filename in dirty) {
		var bytes = dirty[filename];
		form.append(new Blob([bytes]));
		numFiles++;
	}
	if(!numFiles) {
		alert("nothing to upload to server!");
		return;
	}
	form.append("folder","/data");
	form.append("message",prompt("commit message for log") || "(edited online)");
	var req = new XMLHttpRequest();
	req.open("POST","/upload");
	req.send(form);
	clearCachedFiles();
	reloadAllAssets();
}

if(document.getElementById("saveButton"))
	document.getElementById("saveButton").onclick = uploadAssets;

