
import { Trajectory, Extent, Point } from '../types';

/**
 * Enhanced trajectory extraction using adaptive contrast and smarter neighbor searching.
 */
export const extractTrajectoriesFromCanvas = (
  canvas: HTMLCanvasElement,
  extent: Extent
): Trajectory[] => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const trajectories: Trajectory[] = [];
  
  // Adaptive background detection by sampling corners and edges
  const sampleIndices = [
    0, (width / 2) * 4, (width - 1) * 4,
    ((height / 2) * width) * 4, (((height / 2) * width) + width - 1) * 4,
    (height - 1) * width * 4, ((height - 1) * width + (width / 2)) * 4, ((height - 1) * width + width - 1) * 4
  ];
  
  let totalBgLum = 0;
  let count = 0;
  sampleIndices.forEach(idx => {
    if (idx < data.length) {
      totalBgLum += (data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114);
      count++;
    }
  });
  const avgBgLum = totalBgLum / count;

  const columnStep = 2; // High density scan
  const visited = new Uint8Array(width * height);
  let idCounter = 1;

  const getLum = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    return data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114;
  };

  const isForeground = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const lum = getLum(x, y);
    // Trajectories are usually darker than background in original BMPs (ink on paper style)
    // or significantly different in brightness.
    return Math.abs(lum - avgBgLum) > 25; 
  };

  const toWorld = (px: number, py: number): Point => ({
    x: (px / width) * extent.temporal,
    y: ((height - py) / height) * extent.spatial
  });

  for (let x = 0; x < width; x += columnStep) {
    for (let y = 0; y < height; y += 4) {
      if (!visited[y * width + x] && isForeground(x, y)) {
        const points: Point[] = [];
        let currX = x;
        let currY = y;
        
        while (currX < width && currY < height && currY >= 0) {
          if (visited[currY * width + currX]) break;
          visited[currY * width + currX] = 1;
          points.push(toWorld(currX, currY));
          
          let foundNext = false;
          // Search forward-looking neighborhood
          const searchSpace = [
            {dx: 1, dy: 0}, {dx: 1, dy: 1}, {dx: 1, dy: -1},
            {dx: 2, dy: 1}, {dx: 2, dy: -1}, {dx: 2, dy: 0},
            {dx: 3, dy: 0}, {dx: 3, dy: 2}, {dx: 3, dy: -2},
            {dx: 1, dy: 2}, {dx: 1, dy: -2}
          ];

          for (const s of searchSpace) {
            const nx = currX + s.dx;
            const ny = currY + s.dy;
            if (nx < width && ny >= 0 && ny < height && !visited[ny * width + nx] && isForeground(nx, ny)) {
              currX = nx;
              currY = ny;
              foundNext = true;
              break;
            }
          }
          if (!foundNext) break;
        }

        if (points.length > 4) { // Filter noise
          trajectories.push({ id: idCounter++, points });
        }
      }
    }
  }

  return trajectories;
};
