/**
 * Greedy screen-space clustering for map markers: points closer than `cellPx`
 * (in pixels at the current zoom) are merged into one bubble with a count.
 */
export interface Cluster<T> {
  items: T[]
  x: number
  y: number
}

export function clusterByDistance<T>(items: T[], project: (item: T) => { x: number; y: number }, cellPx = 56): Cluster<T>[] {
  const clusters: Cluster<T>[] = []
  const grid = new Map<string, Cluster<T>[]>()
  for (const item of items) {
    const { x, y } = project(item)
    const gx = Math.floor(x / cellPx)
    const gy = Math.floor(y / cellPx)
    let target: Cluster<T> | undefined
    for (let dx = -1; dx <= 1 && !target; dx++) {
      for (let dy = -1; dy <= 1 && !target; dy++) {
        target = grid.get(`${gx + dx}:${gy + dy}`)?.find((c) => Math.hypot(c.x - x, c.y - y) < cellPx)
      }
    }
    if (target) {
      const n = target.items.length
      target.x = (target.x * n + x) / (n + 1)
      target.y = (target.y * n + y) / (n + 1)
      target.items.push(item)
    } else {
      const c = { items: [item], x, y }
      clusters.push(c)
      const key = `${gx}:${gy}`
      grid.set(key, [...(grid.get(key) ?? []), c])
    }
  }
  return clusters
}
