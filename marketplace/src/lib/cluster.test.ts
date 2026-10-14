import { describe, expect, it } from 'vitest'
import { clusterByDistance } from './cluster'

describe('clusterByDistance', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 30, y: 0 }, { x: 300, y: 300 }, { x: 600, y: 0 }]
  it('merges nearby points and keeps distant ones apart', () => {
    const c = clusterByDistance(pts, (p) => p, 56)
    expect(c.map((x) => x.items.length).sort()).toEqual([1, 1, 3])
  })
  it('keeps every point when the radius is tiny', () => {
    expect(clusterByDistance(pts, (p) => p, 1)).toHaveLength(5)
  })
})
