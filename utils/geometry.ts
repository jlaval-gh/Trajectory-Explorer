
import { Point } from '../types';

export const isPointInPolygon = (point: Point, polygon: Point[]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

export const getLineIntersection = (p1: Point, p2: Point, p3: Point, p4: Point): Point | null => {
  const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
  if (denom === 0) return null;
  const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
  const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;
  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return {
      x: p1.x + ua * (p2.x - p1.x),
      y: p1.y + ua * (p2.y - p1.y)
    };
  }
  return null;
};

export const calculatePolygonArea = (polygon: Point[]): number => {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  return Math.abs(area) / 2;
};

// Clips a trajectory segment to a polygon and returns TTD and TTT for that segment
export const getClippedSegmentMetrics = (p1: Point, p2: Point, polygon: Point[]): { ttd: number, ttt: number } => {
  const isP1In = isPointInPolygon(p1, polygon);
  const isP2In = isPointInPolygon(p2, polygon);

  // Simple clipping: if both in, full length. If one in, partial. If both out, check intersections.
  // Real implementation would use Sutherland-Hodgman, but for time-space diagrams, 
  // sampling segments is often sufficient and more robust for arbitrary non-convex polygons.
  
  const segments = 10;
  let inTTD = 0;
  let inTTT = 0;
  
  for (let i = 0; i < segments; i++) {
    const start = {
      x: p1.x + (p2.x - p1.x) * (i / segments),
      y: p1.y + (p2.y - p1.y) * (i / segments)
    };
    const end = {
      x: p1.x + (p2.x - p1.x) * ((i + 1) / segments),
      y: p1.y + (p2.y - p1.y) * ((i + 1) / segments)
    };
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    
    if (isPointInPolygon(mid, polygon)) {
      inTTD += Math.abs(end.y - start.y);
      inTTT += Math.abs(end.x - start.x);
    }
  }
  
  return { ttd: inTTD, ttt: inTTT };
};
