
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
