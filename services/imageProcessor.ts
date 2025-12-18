
import { Trajectory, Extent, Point } from '../types';

/**
 * Shared Binarization Logic
 * Modifies the data array in-place.
 * 
 * STRATEGY: 
 * Assume Background is WHITE (255, 255, 255).
 * Any pixel that is NOT white (with small tolerance) becomes BLACK.
 */
const binarizeData = (data: Uint8ClampedArray, width: number, height: number) => {
  // Hardcoded White Background Reference
  const bgR = 255;
  const bgG = 255;
  const bgB = 255;

  // Threshold to account for JPEG compression artifacts on "white" background
  // 30 covers slightly noisy whites while preserving colored lines.
  const threshold = 30; 
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i+1];
    const b = data[i+2];

    // Calculate distance from Pure White
    const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);

    if (diff > threshold) {
      // It is NOT white -> It is a Trajectory -> Force Black
      data[i] = 0;
      data[i+1] = 0;
      data[i+2] = 0;
      data[i+3] = 255; // Fully Opaque
    } else {
      // It is effectively white -> Force Background
      data[i] = 255;
      data[i+1] = 255;
      data[i+2] = 255;
      data[i+3] = 255;
    }
  }
};

/**
 * Generates a visual representation of the binarized image for debugging.
 */
export const getBinarizedImageData = (
  canvas: HTMLCanvasElement
): ImageData | null => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  
  // Apply the shared logic
  binarizeData(imageData.data, width, height);
  
  return imageData;
};

/**
 * Enhanced trajectory extraction using strict binarization.
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
  
  // 1. Apply Strict Binarization in-place
  binarizeData(data, width, height);

  // 2. Extraction Scan
  const trajectories: Trajectory[] = [];
  const columnStep = 1; 
  const visited = new Uint8Array(width * height);
  let idCounter = 1;

  // Helper to check if pixel is Black (Foreground)
  const isForeground = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const idx = (y * width + x) * 4;
    return data[idx] === 0; 
  };

  const toWorld = (px: number, py: number): Point => ({
    x: (px / width) * extent.temporal,
    y: ((height - py) / height) * extent.spatial
  });

  // HIGH SPEED KERNEL UPDATE
  // We include dx=0 to allow "climbing" vertical lines (infinite/very high speed).
  // We also extend dy range significantly.
  const searchSpace = [
    // 1. Vertical Climbing (Critical for high speed)
    {dx: 0, dy: 1}, {dx: 0, dy: -1},
    
    // 2. Standard Forward Connectivity
    {dx: 1, dy: 0}, 
    {dx: 1, dy: 1}, {dx: 1, dy: -1},
    {dx: 1, dy: 2}, {dx: 1, dy: -2},
    {dx: 1, dy: 3}, {dx: 1, dy: -3},
    {dx: 1, dy: 4}, {dx: 1, dy: -4},
    {dx: 1, dy: 5}, {dx: 1, dy: -5},

    // 3. Gap Jumping (Broken lines)
    {dx: 2, dy: 0}, 
    {dx: 2, dy: 1}, {dx: 2, dy: -1},
    {dx: 2, dy: 2}, {dx: 2, dy: -2},
    
    // 4. Aggressive Vertical Reach for Gap Jumping
    {dx: 2, dy: 3}, {dx: 2, dy: -3},
    {dx: 2, dy: 4}, {dx: 2, dy: -4},
    
    // 5. Long Range Gap
    {dx: 3, dy: 0}, {dx: 3, dy: 1}, {dx: 3, dy: -1}
  ];

  for (let x = 0; x < width; x += columnStep) {
    for (let y = 0; y < height; y += 1) {
      if (!visited[y * width + x] && isForeground(x, y)) {
        const points: Point[] = [];
        let currX = x;
        let currY = y;
        
        while (currX < width && currY < height && currY >= 0) {
          if (visited[currY * width + currX]) break;
          visited[currY * width + currX] = 1;
          points.push(toWorld(currX, currY));
          
          let foundNext = false;
          
          for (const s of searchSpace) {
            const nx = currX + s.dx;
            const ny = currY + s.dy;
            
            // Boundary Check + Not Visited + Is Black
            if (nx < width && ny >= 0 && ny < height && !visited[ny * width + nx] && isForeground(nx, ny)) {
              currX = nx;
              currY = ny;
              foundNext = true;
              break; // Greedy: Take first valid neighbor
            }
          }
          if (!foundNext) break;
        }

        // Filter out tiny noise (must be > 5 pixels long)
        if (points.length > 5) { 
          trajectories.push({ id: idCounter++, points });
        }
      }
    }
  }

  return trajectories;
};
