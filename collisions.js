
function aabb(a,b) {
	return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];
}

function aabb_join(a,b) {
	return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];
}

function aabb_intersects(a,b) {
	return a[0]<=b[2] && a[1]<=b[3] && a[2]>b[0] && a[3]>b[1];
}

function aabb_contains(a,b) {
	return a[0]<=b[0] && a[1]<=b[1] && a[2]>=b[2] && a[3]>=b[3];
}


