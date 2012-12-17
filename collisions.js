
function aabb(a,b) {
	return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];
}

function aabb_join(a,b) {
	return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];
}

function aabb_intersects(a,b) {
	return !(a[0]>b[2] || a[1]>b[3] || a[2]<b[0] || a[3]<b[1]);
}

function aabb_contains(a,b) {
	return a[0]<=b[0] && a[1]<=b[1] && a[2]>=b[2] && a[3]>=b[3];
}

function aabb_line_intersects(aabb,line) {
	var	x1 = line[0][0], y1 = line[0][1], x2 = line[1][0], y2 = line[1][1],
		ax1 = aabb[0], ay1 = aabb[1], ax2 = aabb[2], ay2 = aabb[3],
		minX = Math.max(Math.min(x1,x2),ax1),
		maxX = Math.min(Math.max(x1,x2),ax2);
	if(minX > maxX)
		return false;
	var	minY = y1,
		maxY = y2,
		dx = x2 - x1;
	if(!float_zero(dx)) {
		var	a = (y2 - y1) / dx,
			b = y1 - a * x1;
		minY = a * minX + b;
		maxY = a * maxX + b;
	}
	if(minY > maxY) {
		var tmp = maxY;
		maxY = minY;
		minY = tmp;
	}
	return Math.max(minY,ay1) <= Math.min(maxY,ay2);
}

function line_normal(line) {
	var dir = vec2_sub(line[1],line[0]);
	return vec2_normalise([dir[1],-dir[0]]);
}

function tree_node(box) {
	assert(this != window);
	this.box = box;
	this.items = [];
	this.children = false;
	this.add = function(item,box) {
		assert(aabb_contains(this.box,box));
		if(this.children) {
			for(var child in this.children) {
				child = this.children[child];
				if(aabb_contains(child.box,box)) {
					child.add(item,box);
					return;
				}
			}
		}
		this.items.push(item,box);
		if(this.items.length > 11 && !this.children) {
			var	x1 = this.box[0], y1 = this.box[1],
				x2 = this.box[2], y2 = this.box[3],
				hx = (x1+x2)/2, hy = (y1+y2)/2;
			this.children = [
				new tree_node([x1,y1,hx,hy]),
				new tree_node([x1,hy,hx,y2]),
				new tree_node([hx,y1,x2,hy]),
				new tree_node([hx,hy,x2,y2])];
			var items = this.items;
			this.items = [];
			for(var i=0; i<items.length; i+=2)
				this.add(items[i],items[i+1]);
		}
	};
	this.freeze = function() {
		this.box = null;
		var i, box, child;
		for(i=0; i<this.items.length; i+=2) {
			box = this.items[i+1];
			this.box = this.box == null? box: aabb_join(this.box,box);
		}
		if(this.children) {
			for(i=this.children.length-1; i>=0; i--) {
				child = this.children[i];
				if(child.freeze())
					this.children.splice(i,1);
				else
					this.box = this.box == null? child.box: aabb_join(this.box,child.box);
			}
			if(this.children.length == 0)
				this.children = false;
		}
		return !this.items.length && !this.children; 
	};
	this.find = function(box,results) {
		var i, items = this.items, child, children = this.children;
		for(i=0; i<items.length; i+= 2)
			if(aabb_intersects(box,items[i+1]))
				results.push(items[i]);
		if(children)
			for(child in children) {
				child = children[child];
				if(aabb_intersects(box,child.box))
					child.find(box,results);
			}
	};
	this.findOne = function(box,visit) {
		var i, items = this.items, child, children = this.children, ret;
		for(i=0; i<items.length; i+= 2)
			if(aabb_intersects(box,items[i+1])) {
				ret = visit(items[i],items[i+1]);
				if(ret)
					return ret;
			}
		if(children)
			for(child in children) {
				child = children[child];
				if(aabb_intersects(box,child.box)) {
					ret = child.findOne(box,visit);
					if(ret)
						return ret;
				}
			}
		return null;
	};
}

function make_tree(lines) {
	var	box = aabb(lines[0][0],lines[0][1]),
		boxes = [], line_box;
	for(var line in lines) {
		line = lines[line];
		line_box = aabb(line[0],line[1]);
		boxes.push(line_box);
		box = aabb_join(box,line_box);
	}
	var tree = new tree_node(box);
	for(var line in lines) {
		line_box = boxes[line];
		line = lines[line];
		tree.add(line,line_box);
	}
	tree.freeze();
	return tree;
}
