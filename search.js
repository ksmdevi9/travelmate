export function bfs(graph, start, goal) {
  const queue = [[start]], visited = new Set([start]);
  while (queue.length) {
    const path = queue.shift(), node = path[path.length - 1];
    if (node === goal) return path;
    for (const next of (graph[node] || [])) if (!visited.has(next)) { visited.add(next); queue.push([...path, next]); }
  }
  return null;
}

// A* over a small demonstration graph. Edge cost and heuristic must use the same unit.
export function aStar(graph, start, goal, heuristic = () => 0) {
  const open = new Set([start]), cameFrom = new Map(), g = new Map([[start, 0]]), f = new Map([[start, heuristic(start, goal)]]);
  while (open.size) {
    let current = null, best = Infinity;
    for (const node of open) if ((f.get(node) ?? Infinity) < best) { best = f.get(node); current = node; }
    if (current === goal) {
      const path = [current]; while (cameFrom.has(current)) { current = cameFrom.get(current); path.unshift(current); } return { path, cost: g.get(goal) };
    }
    open.delete(current);
    for (const edge of (graph[current] || [])) {
      const tentative = g.get(current) + edge.cost;
      if (tentative < (g.get(edge.to) ?? Infinity)) { cameFrom.set(edge.to, current); g.set(edge.to, tentative); f.set(edge.to, tentative + heuristic(edge.to, goal)); open.add(edge.to); }
    }
  }
  return null;
}

export function buildRouteGraph(routes) {
  const graph = {};
  for (const r of routes) {
    (graph[r.from] ||= []).push({to:r.to, cost:r.distance, mode:r.mode, hours:r.hours});
    (graph[r.to] ||= []).push({to:r.from, cost:r.distance, mode:r.mode, hours:r.hours});
  }
  return graph;
}
