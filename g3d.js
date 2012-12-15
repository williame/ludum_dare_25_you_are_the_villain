
function G3D(filename,readyCallback) {
	if(readyCallback && readyCallback.wait) // using a Waiter?
		readyCallback = readyCallback.wait(filename);
	var g3d = {};
	g3d.readyCallbacks = [];
	g3d.done = function() {
		for(var callback in g3d.readyCallbacks)
			g3d.readyCallbacks[callback](g3d);
	};
	if(readyCallback)
		g3d.readyCallbacks.push(readyCallback);
	g3d.filename = filename;
	g3d.meshes = [];
	g3d.textureFilenames = [];
	G3D.program = null;
	g3d.ready = false;
	g3d.showNormals = false;
	g3d.boundingSphere = [0,0,0,0];
	g3d._fileLoaded = function(arrayBuffer) {
		var	pow2 = new Float32Array(24), // massive speedup if precomputed
			one_over_pow2 = new Float32Array(24),
			reader = {
			array: arrayBuffer,
			buffer: new Uint8Array(arrayBuffer),
			ofs: 0,
			_read: function(Type,numElements) {
				if(!numElements) {
					var ret = 0;
					for(var i=0; i<Type.BYTES_PER_ELEMENT; i++)
						ret |= reader.buffer[reader.ofs++] << (i*8);
					return ret;
				}
				var raw = new Type(numElements),
					stop = reader.ofs + raw.byteLength;
				raw.set(reader.buffer.subarray(reader.ofs,stop));
				reader.ofs = stop;
				return raw;
			},
			uint8: function(len) { return reader._read(Uint8Array,len); },
			uint16: function(len) { return reader._read(Uint16Array,len); },
			uint32: function(len) { return reader._read(Uint32Array,len); },
			str64: function() {
				var s = "";
				for(var i=0; i<64; i++) {
					var b = reader.buffer[reader.ofs++];
					if(b) s += String.fromCharCode(b);
				}
				return s;
			},
			float32: function(len) {
				// do our own unpacking (http://www.terrybutler.co.uk/downloads/web/webgl-md2.htm adapted, speeded up 1000x)
				len = len || 1;
				var as_float = new Float32Array(len);
				for(var j=0; j<len; j++) {
					var value = reader.uint32();
					var sign = (value >> 31) & 0x1;
					var nonZero = false;
					var mantissa = 0;
					var exponent = -127;
					// Mantissa
					for(var i = 22; i > -1; i--)
						if((value >> i & 0x1) == 1) {
							mantissa += one_over_pow2[23-i];
							nonZero = true;
						}	
					if(nonZero) mantissa += 1;		
					// Exponent
					for(var i = 30; i > 22; i--)
						if((value >> i & 0x1) == 1)
							exponent += pow2[i-23];
					var total = Math.pow(2, exponent) * mantissa;		
					if(sign) total = -total;		
					as_float[j] = total;
				}
				if(len>1) return as_float;
				return as_float[0];
			},
		};
		for(var i=0; i<pow2.length; i++) {
			pow2[i] = Math.pow(2,i);
			one_over_pow2[i] = 1 / pow2[i];
		}
		console.log("loaded G3D",g3d.filename,arrayBuffer.byteLength,"bytes");
		if(reader.uint32()>>24 != 4) throw "unsupported G3D version";
		var meshCount = reader.uint16();
		if(!meshCount) throw "has no meshes";
		if(reader.uint8()) throw "is not a mtMorphMesh";
		g3d.bounds = [[1000,1000,1000],[-1000,-1000,-1000]];
		for(var i=0; i<meshCount; i++) {
			var mesh = G3DMesh(g3d,reader);
			for(var c=0; c<3; c++) { // bounds
				g3d.bounds[0][c] = Math.min(mesh.bounds[0][c],g3d.bounds[0][c]);
				g3d.bounds[1][c] = Math.max(mesh.bounds[1][c],g3d.bounds[1][c]);
			}
			g3d.meshes.push(mesh);
			// work out what textures we have to load
			if(mesh.textureFilename) {
				if(!g3d.textureFilenames[mesh.textureFilename])
					g3d.textureFilenames[mesh.textureFilename] = [];
				g3d.textureFilenames[mesh.textureFilename].push(mesh);
			}
		}
		g3d.boundingSphere = vec3_add(g3d.bounds[0],vec3_scale(vec3_sub(g3d.bounds[1],g3d.bounds[0]),0.5));
		g3d.boundingSphere.push(vec3_length(vec3_sub(g3d.bounds[1],g3d.bounds[0])));
		if(reader.ofs != arrayBuffer.byteLength)
			throw "not all bytes consumed by G3D loader!";
		g3d.ready = (0 == g3d.textureFilenames.length);
		for(var texture in g3d.textureFilenames)
			(function(filename,meshes) {
				filename = g3d.filename.substring(0,g3d.filename.lastIndexOf("/")+1) + filename;
				loadFile("image",filename,function(tex) {
					for(var mesh in meshes)
						meshes[mesh].texture = tex;
					g3d.textureFilenames = g3d.textureFilenames.slice(
						g3d.textureFilenames.indexOf(filename),1);
					g3d.ready = (0 == g3d.textureFilenames.length);
					if(g3d.ready && g3d.readyCallbacks)
						setTimeout(g3d.done,0);
				});
			})(texture,g3d.textureFilenames[texture]);
		if(g3d.ready && g3d.readyCallbacks)
			setTimeout(g3d.done,0);
	};
	g3d.draw = function(t,pMatrix,mvMatrix,nMatrix,normals,invert,colour) {
		if(!g3d.ready) return;
		if(!G3D.program) {
			G3D.program = createProgram(
				"precision mediump float;\n"+
				"varying vec3 lighting;\n"+
				"varying vec2 texel;\n"+
				"attribute vec3 vertex0, vertex1;\n"+
				"attribute vec3 normal0, normal1;\n"+
				"attribute vec2 texCoord;\n"+
				"uniform float lerp;\n"+
				"uniform mat4 mvMatrix, pMatrix, nMatrix;\n"+
				"void main() {\n"+
				"	texel = vec2(texCoord.x,1.0-texCoord.y);\n"+
				"	vec3 normal = mix(normal0,normal1,lerp);\n"+
				"	vec3 vertex = mix(vertex0,vertex1,lerp);\n"+
				"	gl_Position = pMatrix * mvMatrix * vec4(vertex,1.0);\n"+
				"	vec3 ambientLight = vec3(0.6,0.6,0.6);\n"+
				"	vec3 lightColour = vec3(0.8,0.9,0.75);\n"+
				"	vec3 lightDir = vec3(0.85,0.8,0.75);\n"+
				"	vec3 transformed = normalize(nMatrix * vec4(normal,1.0)).xyz;\n"+
				"	float directional = clamp(dot(transformed,lightDir),0.0,1.0);\n"+
				"	lighting = ambientLight + (lightColour*directional);\n"+
				"}\n",
				"precision mediump float;\n"+
				"varying vec3 lighting;\n"+
				"varying vec2 texel;\n"+
				"uniform sampler2D texture;\n"+
				"uniform vec4 teamColour;\n"+
				"uniform vec4 colour;\n"+
				"void main() {\n"+
				"	vec4 tex = texture2D(texture,texel);\n"+
				"	if(1.0 != tex.a && 0.0 != teamColour.a) {\n"+
				"		tex.rgb *= tex.a;\n"+
				"		tex.rgb += teamColour.rgb * teamColour.a * (1.0-tex.a);\n"+
				"		tex.a = 1.0;\n"+
				"	}\n"+
				"	tex *= colour;\n"+
				"	gl_FragColor = vec4(tex.rgb*lighting,tex.a);\n"+
				"}");
			G3D.program.vertex0 = gl.getAttribLocation(G3D.program,"vertex0");
			G3D.program.vertex1 = gl.getAttribLocation(G3D.program,"vertex1");
			G3D.program.normal0 = gl.getAttribLocation(G3D.program,"normal0");
			G3D.program.normal1 = gl.getAttribLocation(G3D.program,"normal1");
			G3D.program.texCoord = gl.getAttribLocation(G3D.program,"texCoord");
			G3D.program.lerp = gl.getUniformLocation(G3D.program,"lerp");
			G3D.program.mvMatrix = gl.getUniformLocation(G3D.program,"mvMatrix");
			G3D.program.pMatrix = gl.getUniformLocation(G3D.program,"pMatrix");
			G3D.program.nMatrix = gl.getUniformLocation(G3D.program,"nMatrix");
			G3D.program.teamColour = gl.getUniformLocation(G3D.program,"teamColour");
			G3D.program.colour = gl.getUniformLocation(G3D.program,"colour");
			G3D.program.texture = gl.getUniformLocation(G3D.program,"texture");
		}
		gl.useProgram(G3D.program);
		gl.uniformMatrix4fv(G3D.program.pMatrix,false,pMatrix);
		gl.uniformMatrix4fv(G3D.program.mvMatrix,false,mvMatrix);
		gl.uniformMatrix4fv(G3D.program.nMatrix,false,nMatrix);
		gl.activeTexture(gl.TEXTURE0);
		gl.uniform1i(G3D.program.texture,0);
		gl.frontFace(invert?gl.CW:gl.CCW);
		gl.uniform4fv(G3D.program.colour,colour||[1,1,1,1]);
		t = Math.max(0,Math.min(t,1));
		var showNormals = normals || g3d.showNormals || false;
		for(var i=0; i<g3d.meshes.length; i++) {
			var mesh = g3d.meshes[i];
			if(!invert || !mesh.twoSided) {
				mesh.draw(G3D.program,t);
				showNormals |= mesh.showNormals || false;
			}
		}
		if(showNormals && !invert) {
			if(!G3D.programNormals) {
				G3D.programNormals = createProgram(
					"precision mediump float;\n"+
					"attribute vec3 vertex;\n"+
					"uniform mat4 mvMatrix, pMatrix;\n"+
					"void main() {\n"+
					"	gl_Position = pMatrix * mvMatrix * vec4(vertex,1.0);\n"+
					"}\n",
					"precision mediump float;\n"+
					"uniform vec4 colour;\n"+
					"void main() {\n"+
					"	gl_FragColor = colour;\n"+
					"}");
				G3D.programNormals.vertex = gl.getAttribLocation(G3D.programNormals,"vertex");
				G3D.programNormals.mvMatrix = gl.getUniformLocation(G3D.programNormals,"mvMatrix");
				G3D.programNormals.pMatrix = gl.getUniformLocation(G3D.programNormals,"pMatrix");
				G3D.programNormals.colour = gl.getUniformLocation(G3D.programNormals,"colour");	
			}
			gl.useProgram(G3D.programNormals);
			gl.uniformMatrix4fv(G3D.programNormals.pMatrix,false,pMatrix);
			gl.uniformMatrix4fv(G3D.programNormals.mvMatrix,false,mvMatrix);
			gl.uniform4fv(G3D.programNormals.colour,[1,1,1,1]);
			for(var i=0; i<g3d.meshes.length; i++) {
				var mesh = g3d.meshes[i];
				if(normals || g3d.showNormals || mesh.showNormals)
					mesh.drawNormals(G3D.programNormals,t);
			}
		}
		gl.useProgram(null);
	};
	g3d.lineIntersection = function(lineOrigin,lineDir,t) {
		var	lineLen = vec3_length(lineDir),
			lineSphere = vec3_add(lineOrigin,vec3_scale(lineDir,lineLen/2)),
			hit, k, l, n;
		lineSphere.push(lineLen/2);
		for(var mesh in g3d.meshes) {
			mesh = g3d.meshes[mesh];
			mesh.lineIntersection(lineOrigin,lineDir,lineSphere,function(i,I,N) {
				if(!hit || k > i) {
					n = N;
					l = I;
					k = i;
					hit = mesh;
				}
			},Math.floor((t||0)*mesh.frameCount));
		}
		return hit?[hit,k,l,n]:null;
	};
	g3d.yAt = function(x,z,t) {
		var y = -10, n, hit;
		for(var mesh in g3d.meshes) {
			mesh = g3d.meshes[mesh];
			if(x >= mesh.bounds[0][0]-mesh.loci && x <= mesh.bounds[1][0]+mesh.loci &&
				y <= mesh.bounds[1][1] &&
				z >= mesh.bounds[0][2]-mesh.loci && z <= mesh.bounds[1][2]+mesh.loci)
				mesh.rayIntersection([x,y,z],[0,20,0],true,function(i,I,N) {
					if(!n || I[1] > y) {
						y = I[1];
						n = N;
						hit = mesh;
					}
				},Math.floor((t||0)*mesh.frameCount));
		}
		return hit?[y,n,hit]:null;
	};
	g3d.zAt = function(rayOrigin,rayDir,t) {
		var z, n, hit;
		for(var mesh in g3d.meshes) {
			mesh = g3d.meshes[mesh];
			mesh.rayIntersection(rayOrigin,rayDir,function(i,I,N) {
				var d = vec3_length(vec3_sub(I,rayOrigin));
				if(!n || d < z) {
					z = d;
					n = N;
					hit = mesh;
				}
			},Math.floor((t||0)*mesh.frameCount));
		}
		return hit?[z,n,hit]:null;
	};
	g3d.autoNormals = function() {
		for(var mesh in g3d.meshes)
			g3d.meshes[mesh].autoNormals();
	};
	loadFile("ArrayBuffer",g3d.filename,g3d._fileLoaded);
	return g3d;
};

function G3DMesh(g3d,reader) {
	var mesh = {};
	mesh.g3d = g3d;
	mesh.name = reader.str64();
	mesh.textureFilename = null;
	mesh.frameCount = reader.uint32();  if(!mesh.frameCount) throw "no frames "+mesh.name+","+mesh.frameCount;
	mesh.vertexCount = reader.uint32();  if(!mesh.vertexCount) throw "no vertices "+mesh.name+","+mesh.vertexCount;
	mesh.indexCount = reader.uint32();  if(!mesh.indexCount) throw "no indices "+mesh.name+","+mesh.indexCount;
	if(mesh.indexCount%3) throw "bad number of indices "+mesh.name+","+mesh.indexCount;
	mesh.faceCount = mesh.indexCount/3;
	reader.ofs += 8*4;
	var properties = reader.uint32();
	mesh.teamColour = properties&1 == 1;
	mesh.twoSided = properties&2 == 2;
	mesh.texture = null;
	mesh.textures = reader.uint32();
	for(var t=0; t<5; t++) {
		if((1<<t)&mesh.textures) {
			var textureFilename = reader.str64();
			if(t==0)
				mesh.textureFilename = textureFilename;
		}
	}
	mesh.vnVbo = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER,mesh.vnVbo);
	mesh.vnData = reader.float32(mesh.frameCount*mesh.vertexCount*3*2);
	mesh.bounds = [[1000,1000,1000],[-1000,-1000,-1000]];
	for(var f=0; f<mesh.frameCount; f++)
		for(var v=0; v<mesh.vertexCount; v++)
			for(var i=0; i<3; i++) { // bounds
				mesh.bounds[0][i] = Math.min(mesh.bounds[0][i],mesh.vnData[f*mesh.vertexCount+v*3+i]);
				mesh.bounds[1][i] = Math.max(mesh.bounds[1][i],mesh.vnData[f*mesh.vertexCount+v*3+i]);
			}
	mesh.boundingSphere = vec3_add(mesh.bounds[0],vec3_scale(vec3_sub(mesh.bounds[1],mesh.bounds[0]),0.5));
	mesh.boundingSphere.push(vec3_length(vec3_sub(mesh.bounds[1],mesh.bounds[0]))/2);
	gl.bufferData(gl.ARRAY_BUFFER,mesh.vnData,gl.STATIC_DRAW);
	if(mesh.textures) {
		mesh.tVbo = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER,mesh.tVbo);
		mesh.texData = reader.float32(mesh.vertexCount*2);
		gl.bufferData(gl.ARRAY_BUFFER,mesh.texData,gl.STATIC_DRAW);
	}
	mesh.iVbo = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.iVbo);
	mesh.iData = new Uint16Array(mesh.indexCount);
	for(var i=0; i<mesh.indexCount; i++)
		mesh.iData[i] = reader.uint32();
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.iData,gl.STATIC_DRAW);
	mesh.faceSpheres = new Float32Array(mesh.faceCount*4*mesh.frameCount);
	mesh.faceNormals = new Float32Array(mesh.faceCount*3*mesh.frameCount);
	var ofs = 0;
	for(var f=0; f<mesh.frameCount; f++) {
		for(var face=0; face<mesh.faceCount; face++) {
			var	i = face*3,
				A = f*mesh.vertexCount*3+mesh.iData[i]*3,
				B = f*mesh.vertexCount*3+mesh.iData[i+1]*3,
				C = f*mesh.vertexCount*3+mesh.iData[i+2]*3,
				a = [mesh.vnData[A],mesh.vnData[A+1],mesh.vnData[A+2]],
				b = [mesh.vnData[B],mesh.vnData[B+1],mesh.vnData[B+2]],
				c = [mesh.vnData[C],mesh.vnData[C+1],mesh.vnData[C+2]],
				u = vec3_sub(b,a),
				v = vec3_sub(c,a),
				n = vec3_cross(u,v),
				min = [], max = [];
			for(var j=0; j<3; j++) {
				min.push(Math.min(a[j],b[j],c[j]));
				max.push(Math.max(a[j],b[j],c[j]));
			}
			var centre = vec3_scale(vec3_sub(max,min),0.5),
				radius = Math.sqrt(vec3_dot(centre,centre));
			mesh.faceSpheres[f*mesh.faceCount*4+face*4+0] = min[0]+centre[0];
			mesh.faceSpheres[f*mesh.faceCount*4+face*4+1] = min[1]+centre[1];
			mesh.faceSpheres[f*mesh.faceCount*4+face*4+2] = min[2]+centre[2];
			mesh.faceSpheres[f*mesh.faceCount*4+face*4+3] = radius;
			mesh.faceNormals[f*mesh.faceCount*3+face*3+0] = n[0];
			mesh.faceNormals[f*mesh.faceCount*3+face*3+1] = n[1];
			mesh.faceNormals[f*mesh.faceCount*3+face*3+2] = n[2];
		}
	}
	mesh.draw = function(program,t) {
		var frame0 = Math.floor(t*mesh.frameCount),
			frame1 = (frame0+1)%mesh.frameCount,
			lerp = t*mesh.frameCount - frame0;
		gl.uniform1f(program.lerp,lerp);
		if(mesh.teamColour)
			gl.uniform4f(program.teamColour,1,0,0,1);
		else
			gl.uniform4f(program.teamColour,0,0,0,0);
		if(mesh.twoSided)
			gl.disable(gl.CULL_FACE);
		else
			gl.enable(gl.CULL_FACE);
		gl.bindTexture(gl.TEXTURE_2D,mesh.texture);
		gl.enableVertexAttribArray(program.vertex0);
		gl.enableVertexAttribArray(program.vertex1);
		gl.enableVertexAttribArray(program.normal0);
		gl.enableVertexAttribArray(program.normal1);
		gl.bindBuffer(gl.ARRAY_BUFFER,mesh.vnVbo);
		gl.vertexAttribPointer(program.normal0,3,gl.FLOAT,false,3*4,(frame0+mesh.frameCount)*mesh.vertexCount*3*4);
		gl.vertexAttribPointer(program.normal1,3,gl.FLOAT,false,3*4,(frame1+mesh.frameCount)*mesh.vertexCount*3*4);
		gl.vertexAttribPointer(program.vertex0,3,gl.FLOAT,false,3*4,frame0*mesh.vertexCount*3*4);
		gl.vertexAttribPointer(program.vertex1,3,gl.FLOAT,false,3*4,frame1*mesh.vertexCount*3*4);			
		gl.bindBuffer(gl.ARRAY_BUFFER,mesh.tVbo);
		gl.enableVertexAttribArray(program.texCoord);
		gl.vertexAttribPointer(program.texCoord,2,gl.FLOAT,false,0,0);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.iVbo);
		gl.drawElements(gl.TRIANGLES,mesh.indexCount,gl.UNSIGNED_SHORT,0);
		gl.disableVertexAttribArray(program.texCoord);
		gl.disableVertexAttribArray(program.normal1);
		gl.disableVertexAttribArray(program.vertex1);
		gl.disableVertexAttribArray(program.normal0);
		gl.disableVertexAttribArray(program.vertex0);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,null);
		gl.bindBuffer(gl.ARRAY_BUFFER,null);
		gl.bindTexture(gl.TEXTURE_2D,null);
	};
	mesh.drawNormals = function(program,t) {
		var frame = Math.floor(t*mesh.frameCount);
		if(!mesh.drawNormalsVbo) {
			mesh.drawNormalsVbo = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER,mesh.drawNormalsVbo);
			var normalsData = new Float32Array(mesh.frameCount*mesh.vertexCount*3*2),
				p = 0;
			for(var f=0; f<mesh.frameCount; f++)
				for(var v=0; v<mesh.vertexCount; v++) {
					var n = [0,0,0];
					for(var i=0; i<3; i++) {
						normalsData[p*2+i] = mesh.vnData[p+i];
						n[i] = mesh.vnData[mesh.frameCount*mesh.vertexCount*3+p+i];
					}
					n = vec3_normalise(n);
					for(var i=0; i<3; i++)
						normalsData[p*2+3+i] = mesh.vnData[p+i] + n[i];
					p += 3;
				}
			gl.bufferData(gl.ARRAY_BUFFER,normalsData,gl.STATIC_DRAW);
		}
		gl.bindBuffer(gl.ARRAY_BUFFER,mesh.drawNormalsVbo);
		gl.enableVertexAttribArray(program.vertex);
		gl.vertexAttribPointer(program.vertex,3,gl.FLOAT,false,3*4,frame*mesh.vertexCount*3*4*2);
		gl.drawArrays(gl.LINES,0,mesh.vertexCount*2);
		gl.disableVertexAttribArray(program.vertex);	
		gl.bindBuffer(gl.ARRAY_BUFFER,null);
		
	};
	mesh.lineIntersection = function(lineOrigin,lineDir,lineSphere,intersects,frame) {
		if(!sphere_sphere_intersects(mesh.boundingSphere,lineSphere))
			return;
		for(var face=0; face<mesh.faceCount; face++) {
			if(!sphere_sphere_intersects(lineSphere,mesh.faceSpheres,frame*mesh.faceCount*4+face*4))
				continue;
			var	A = frame*mesh.vertexCount*3+mesh.iData[face*3]*3,
				B = frame*mesh.vertexCount*3+mesh.iData[face*3+1]*3,
				C = frame*mesh.vertexCount*3+mesh.iData[face*3+2]*3,
				a = [mesh.vnData[A],mesh.vnData[A+1],mesh.vnData[A+2]],
				b = [mesh.vnData[B],mesh.vnData[B+1],mesh.vnData[B+2]],
				c = [mesh.vnData[C],mesh.vnData[C+1],mesh.vnData[C+2]],
				n = [	mesh.faceNormals[frame*mesh.faceCount*3+face*3+0],
					mesh.faceNormals[frame*mesh.faceCount*3+face*3+1],
					mesh.faceNormals[frame*mesh.faceCount*3+face*3+2]],
				hit = triangle_ray_intersection(a,b,c,lineOrigin,lineDir,n,true);
			if(hit) intersects(hit[0],hit[1],hit[2]);
		}
	};
	mesh.sphereSweepIntersection = function(lineStart,lineStop,lineSphere,lineWidth,frame,callback,ignoreFace) {
		if(!sphere_sphere_intersects(mesh.boundingSphere,lineSphere))
			return;
		for(var face=0; face<mesh.faceCount; face++) {
			if(face==ignoreFace)
				continue;
			if(!sphere_sphere_intersects(lineSphere,mesh.faceSpheres,frame*mesh.faceCount*4+face*4))
				continue;
			var	A = frame*mesh.vertexCount*3+mesh.iData[face*3]*3,
				B = frame*mesh.vertexCount*3+mesh.iData[face*3+1]*3,
				C = frame*mesh.vertexCount*3+mesh.iData[face*3+2]*3,
				a = vec3(mesh.vnData,A),
				b = vec3(mesh.vnData,B),
				c = vec3(mesh.vnData,C),
				hit = triangle_sphere_sweep(c,b,a,lineStart,lineStop,lineWidth); //CCW->CW
			if(hit)
				callback(mesh,face,[hit[0],vec3_lerp(lineStart,lineStop,hit[0]),hit[1]]);
		}
	}
	mesh.rayIntersection = function(rayOrigin,rayDir,intersects,frame) {
		var vertices = mesh.vnData;
		for(var i=0; i<mesh.indexCount; i+=3) {
			var	A = frame*mesh.vertexCount*3+mesh.iData[i]*3,
				B = frame*mesh.vertexCount*3+mesh.iData[i+1]*3,
				C = frame*mesh.vertexCount*3+mesh.iData[i+2]*3,
				a = [vertices[A],vertices[A+1],vertices[A+2]],
				b = [vertices[B],vertices[B+1],vertices[B+2]],
				c = [vertices[C],vertices[C+1],vertices[C+2]];
			var hit = triangle_ray_intersection(a,b,c,rayOrigin,rayDir);
			if(hit)
				intersects(hit[0],hit[1],hit[2]);
		}
	};
	mesh.autoNormals = function() {
		// explode-up unjoining shared vertices and giving each face a flat normal
		var vnData = new Float32Array(mesh.frameCount*mesh.indexCount*3*2); // 3 indices -> 3 components
		for(var f=0; f<mesh.frameCount; f++) {
			for(var i=0; i<mesh.indexCount; i+=3) {
				var	A = f*mesh.vertexCount*3+mesh.iData[i]*3,
					B = f*mesh.vertexCount*3+mesh.iData[i+1]*3,
					C = f*mesh.vertexCount*3+mesh.iData[i+2]*3,
					a = [mesh.vnData[A],mesh.vnData[A+1],mesh.vnData[A+2]],
					b = [mesh.vnData[B],mesh.vnData[B+1],mesh.vnData[B+2]],
					c = [mesh.vnData[C],mesh.vnData[C+1],mesh.vnData[C+2]],
					n = vec3_cross(vec3_sub(b,a),vec3_sub(c,a));
				for(var j=0; j<3; j++) {
					vnData[f*mesh.indexCount*3+i*3+j] = a[j];
					vnData[f*mesh.indexCount*3+i*3+3+j] = b[j];
					vnData[f*mesh.indexCount*3+i*3+6+j] = c[j];
					vnData[mesh.frameCount*mesh.indexCount*3+f*mesh.indexCount*3+i*3+j] = n[j];
					vnData[mesh.frameCount*mesh.indexCount*3+f*mesh.indexCount*3+i*3+3+j] = n[j];
					vnData[mesh.frameCount*mesh.indexCount*3+f*mesh.indexCount*3+i*3+6+j] = n[j];
				}
			}
		}
		if(mesh.textures) {
			var texData = new Float32Array(mesh.indexCount*2);
			for(var i=0; i<mesh.indexCount; i++) {
				texData[i*2] = mesh.texData[mesh.iData[i]*2];
				texData[i*2+1] = mesh.texData[mesh.iData[i]*2+1];
			}
			mesh.texData = texData;
			gl.bindBuffer(gl.ARRAY_BUFFER,mesh.tVbo);
			gl.bufferData(gl.ARRAY_BUFFER,mesh.texData,gl.STATIC_DRAW);
		}
		for(var i=0; i<mesh.indexCount; i++)
			mesh.iData[i] = i;
		mesh.vnData = vnData;
		mesh.vertexCount = mesh.indexCount;
		gl.bindBuffer(gl.ARRAY_BUFFER,mesh.vnVbo);
		gl.bufferData(gl.ARRAY_BUFFER,mesh.vnData,gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER,null);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.iVbo);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.iData,gl.STATIC_DRAW);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,null);
		if(mesh.drawNormalsVbo) {
			gl.deleteBuffer(mesh.drawNormalsVbo);
			mesh.drawNormalsVbo = null;
		}
	}
	return mesh;
}
