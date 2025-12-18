
export interface Point {
  x: number; // Time in minutes
  y: number; // Distance in meters
}

// Added missing Extent interface
export interface Extent {
  spatial: number;
  temporal: number;
}

export interface Trajectory {
  id: number;
  points: Point[];
}

export enum AnalysisMode {
  LINE = 'LINE',
  POLYGON = 'POLYGON',
  PLATOON = 'PLATOON',
  LOOP_DETECTOR = 'LOOP_DETECTOR'
}

export interface AnalysisVisual {
  mode: AnalysisMode;
  points: Point[];
  intersections?: Point[];
}

export interface AnalysisResult {
  mode: AnalysisMode;
  flow: number;      // Internal: veh/min
  density: number;   // Internal: veh/m
  speed: number;     // Internal: m/min
  area: number;
  ttd: number;
  ttt: number;
  count?: number;
  waveSpeed?: number;
}