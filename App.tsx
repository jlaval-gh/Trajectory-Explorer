import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  AnalysisMode, 
  AnalysisResult, 
  Extent, 
  Trajectory, 
  Point,
  AnalysisVisual
} from './types';
import { extractTrajectoriesFromCanvas, getBinarizedImageData } from './services/imageProcessor';
import { 
  calculatePolygonArea, 
  getClippedSegmentMetrics,
  getLineIntersection,
  getSegmentLineIntersection
} from './utils/geometry';
import FundamentalDiagram from './components/FundamentalDiagram';
import { DraggableWindow } from './components/DraggableWindow';
import { 
  Activity, 
  Layers, 
  MousePointer2, 
  PenTool, 
  Upload, 
  Settings, 
  Trash2, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Moon, 
  Sun,
  MessageSquare,
  Move,
  Target,
  Palette,
  SlidersHorizontal,
  X,
  Eye,
  Scan,
  Circle,
  Table as TableIcon,
  Copy,
  FileDown,
  Terminal,
  RefreshCw
} from 'lucide-react';

const toFlowH = (q: number) => q * 60;
const toDensityKm = (k: number) => k * 1000;
const toSpeedKmh = (u: number) => (u * 60) / 1000;

// Default wave speed: -17 km/h converted to m/min
const DEFAULT_WAVE_SPEED = -283.33; 

// Shared Color Palette for FD and Visuals
export const EXPERIMENT_COLORS = [
  '#ef4444', // Red 500
  '#f97316', // Orange 500
  '#f59e0b', // Amber 500
  '#84cc16', // Lime 500
  '#10b981', // Emerald 500
  '#06b6d4', // Cyan 500
  '#3b82f6', // Blue 500
  '#6366f1', // Indigo 500
  '#8b5cf6', // Violet 500
  '#d946ef', // Fuchsia 500
  '#f43f5e', // Rose 500
];

const TRAJ_COLORS = {
  indigo: 'rgba(79, 70, 229, 0.7)',
  emerald: 'rgba(16, 185, 129, 0.7)',
  amber: 'rgba(245, 158, 11, 0.7)',
  rose: 'rgba(244, 63, 94, 0.7)',
  white: 'rgba(255, 255, 255, 0.8)',
  slate: 'rgba(148, 163, 184, 0.7)',
};

enum ViewMode {
  ORIGINAL = 0,
  BINARY = 1,
  VECTORS = 2
}

const App: React.FC = () => {
  const [image, setImage] = useState<string | null>(null);
  const [imgDimensions, setImgDimensions] = useState<{width: number, height: number} | null>(null);
  const [extent, setExtent] = useState<Extent>({ spatial: 640, temporal: 15 });
  const [mode, setMode] = useState<AnalysisMode>(AnalysisMode.LINE);
  const [trajectories, setTrajectories] = useState<Trajectory[]>([]);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [visuals, setVisuals] = useState<AnalysisVisual[]>([]);
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [platoonN, setPlatoonN] = useState<number>(5);
  // Default Segment Height 30m
  const [platoonHeight, setPlatoonHeight] = useState<number>(30);
  const [loopInterval, setLoopInterval] = useState<number>(0.5); 
  const [loopLength, setLoopLength] = useState<number>(2.0);
  const [zoom, setZoom] = useState<number>(1.0);
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [mouseCoord, setMouseCoord] = useState<Point | null>(null);
  
  // Console Logs State
  const [logs, setLogs] = useState<string[]>(["System initialized. Waiting for input..."]);
  
  // Changed default color to slate
  const [trajColor, setTrajColor] = useState<keyof typeof TRAJ_COLORS>('slate');
  
  // Image Corrections & UI State
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.ORIGINAL);
  
  // Intersection Dots Default: Hidden
  const [showDots, setShowDots] = useState<boolean>(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const touchDist = useRef<number | null>(null);

  // Helper to add logs with timestamp
  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
    setLogs(prev => [`[${time}] ${msg}`, ...prev]);
  }, []);

  // Capture global clicks
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      let label = target.tagName.toLowerCase();
      // Try to find a meaningful label
      const closestButton = target.closest('button');
      if (closestButton) {
          label = `button:${closestButton.innerText || closestButton.title || 'unlabeled'}`;
      } else if (target.getAttribute('title')) {
          label = target.getAttribute('title')!;
      } else if (target.innerText && target.innerText.length < 20) {
          label = `"${target.innerText}"`;
      }
      
      // Clean up newlines
      label = label.replace(/\n/g, ' ').trim();

      addLog(`Click: ${label} @ (${e.clientX}, ${e.clientY})`);
    };

    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [addLog]);

  // Generate random Experiment ID to ensure color variety
  const generateExperimentId = () => Math.floor(Math.random() * 100000000);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  const toPixel = useCallback((point: Point) => {
    if (!imgDimensions) return { x: 0, y: 0 };
    return {
      x: (point.x / extent.temporal) * imgDimensions.width,
      y: imgDimensions.height - (point.y / extent.spatial) * imgDimensions.height
    };
  }, [extent, imgDimensions]);

  // Core Analysis Logic
  const runAnalysis = useCallback(() => {
    if (!imgRef.current || !imgDimensions) return;
    addLog("Starting image processing...");
    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = imgDimensions.width;
    rawCanvas.height = imgDimensions.height;
    const ctx = rawCanvas.getContext('2d', { willReadFrequently: true });
    
    if (ctx) {
      ctx.drawImage(imgRef.current, 0, 0);
      setIsProcessing(true);
      setTimeout(() => {
        const extracted = extractTrajectoriesFromCanvas(rawCanvas, extent);
        setTrajectories(extracted);
        setIsProcessing(false);
        addLog(`Analysis complete: ${extracted.length} trajectories identified.`);
      }, 50);
    }
  }, [imgDimensions, extent, addLog]);

  // Canvas Display Effect
  const redraw = useCallback(() => {
    if (!canvasRef.current || !imgRef.current || !imgDimensions) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (viewMode === ViewMode.VECTORS) {
       ctx.fillStyle = darkMode ? '#0f172a' : '#f8fafc';
       ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (viewMode === ViewMode.BINARY) {
       const tempCanvas = document.createElement('canvas');
       tempCanvas.width = imgDimensions.width;
       tempCanvas.height = imgDimensions.height;
       const tempCtx = tempCanvas.getContext('2d');
       if (tempCtx) {
           tempCtx.drawImage(imgRef.current, 0, 0);
           const binData = getBinarizedImageData(tempCanvas);
           if (binData) ctx.putImageData(binData, 0, 0);
       }
    } else {
       ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
       ctx.drawImage(imgRef.current, 0, 0);
       ctx.filter = 'none';
    }

    // Draw Vectors
    ctx.lineWidth = 1.5;
    const overrideColor = viewMode === ViewMode.BINARY ? '#ef4444' : undefined;
    trajectories.forEach(t => {
      ctx.beginPath();
      ctx.strokeStyle = overrideColor || TRAJ_COLORS[trajColor];
      t.points.forEach((p, i) => {
        const pix = toPixel(p);
        if (i === 0) ctx.moveTo(pix.x, pix.y); else ctx.lineTo(pix.x, pix.y);
      });
      ctx.stroke();
    });

    // Draw Analysis Tools
    visuals.forEach((v, idx) => {
      // Use random experiment ID for color
      const experimentId = results[idx]?.experimentId || 0;
      const color = EXPERIMENT_COLORS[experimentId % EXPERIMENT_COLORS.length] || '#f43f5e';
      
      ctx.beginPath();
      ctx.lineWidth = 2; 
      ctx.strokeStyle = color;
      ctx.fillStyle = `${color}33`; 
      
      v.points.forEach((p, i) => {
        const pix = toPixel(p);
        if (i === 0) ctx.moveTo(pix.x, pix.y); else ctx.lineTo(pix.x, pix.y);
      });
      
      if (v.mode !== AnalysisMode.LINE) { 
        ctx.closePath(); 
        ctx.fill(); 
      }
      ctx.stroke();

      // Draw Slope Text for Line Mode
      if (v.mode === AnalysisMode.LINE && v.points.length === 2) {
        const p1 = toPixel(v.points[0]);
        const p2 = toPixel(v.points[1]);
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const slopeVal = results[idx]?.waveSpeed || 0;
        const speedKmh = toSpeedKmh(slopeVal).toFixed(1);
        
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = "bold 12px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.shadowColor = darkMode ? "black" : "white";
        ctx.shadowBlur = 4;
        ctx.fillText(`v = ${speedKmh} km/h`, mid.x + 8, mid.y - 8);
        ctx.restore();
      }

      // Intersection Dots (Conditional)
      if (v.intersections && showDots) {
        ctx.fillStyle = '#10b981'; // Green
        v.intersections.forEach(p => {
          const pix = toPixel(p);
          ctx.beginPath(); ctx.arc(pix.x, pix.y, 4, 0, Math.PI * 2); ctx.fill();
        });
      }

      if (v.anchor) {
        const pix = toPixel(v.anchor);
        const s = 6;
        ctx.beginPath();
        ctx.strokeStyle = '#00ffff'; 
        ctx.lineWidth = 2.5;
        ctx.moveTo(pix.x - s, pix.y - s);
        ctx.lineTo(pix.x + s, pix.y + s);
        ctx.moveTo(pix.x + s, pix.y - s);
        ctx.lineTo(pix.x - s, pix.y + s);
        ctx.stroke();
      }
    });

    // Current Drawing State
    if (drawingPoints.length > 0) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      drawingPoints.forEach((p, i) => {
        const pix = toPixel(p);
        if (i === 0) ctx.moveTo(pix.x, pix.y); else ctx.lineTo(pix.x, pix.y);
      });
      ctx.stroke();
      ctx.fillStyle = '#f59e0b';
      drawingPoints.forEach(p => {
        const pix = toPixel(p);
        ctx.beginPath(); ctx.arc(pix.x, pix.y, 6, 0, Math.PI * 2); ctx.fill();
      });
    }
  }, [trajectories, drawingPoints, visuals, results, toPixel, imgDimensions, trajColor, brightness, contrast, viewMode, darkMode, showDots]);

  useEffect(() => {
    if (image && imgDimensions && imgRef.current) {
       if (canvasRef.current) {
         canvasRef.current.width = imgDimensions.width;
         canvasRef.current.height = imgDimensions.height;
       }
       runAnalysis();
    }
  }, [image, imgDimensions]);

  useEffect(() => { redraw(); }, [redraw]);

  // --- Touch Handling for Pinch Zoom ---
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchDist.current = d;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchDist.current !== null) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = d - touchDist.current;
      const sensitivity = 0.005;
      setZoom(prev => Math.max(0.1, Math.min(10, prev + delta * sensitivity)));
      touchDist.current = d;
    }
  };

  const handleTouchEnd = () => {
    touchDist.current = null;
  };

  // --- Calculation & Interaction Helpers ---

  const getWaveSpeed = useCallback(() => {
    const lineResults = results.filter(r => r.mode === AnalysisMode.LINE);
    if (lineResults.length > 0) return lineResults[lineResults.length - 1].waveSpeed || DEFAULT_WAVE_SPEED;
    return DEFAULT_WAVE_SPEED;
  }, [results]);

  const getMousePosOnCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !imgDimensions) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    return {
      x: (px / imgDimensions.width) * extent.temporal,
      y: ((imgDimensions.height - py) / imgDimensions.height) * extent.spatial
    };
  };

  // ... (Trajectory Math helpers omitted for brevity but retained in logic)
  const getTimeAtY = (traj: Trajectory, y: number) => {
    for (let i = 0; i < traj.points.length - 1; i++) {
      const p1 = traj.points[i], p2 = traj.points[i+1];
      if ((p1.y <= y && p2.y >= y) || (p1.y >= y && p2.y <= y)) {
        const ratio = Math.abs(p2.y - p1.y) < 0.0001 ? 0 : (y - p1.y) / (p2.y - p1.y);
        return p1.x + ratio * (p2.x - p1.x);
      }
    }
    return null;
  };

  const getYAtTime = (traj: Trajectory, t: number) => {
    for (let i = 0; i < traj.points.length - 1; i++) {
      const p1 = traj.points[i], p2 = traj.points[i+1];
      if ((p1.x <= t && p2.x >= t)) {
        const ratio = Math.abs(p2.x - p1.x) < 0.0001 ? 0 : (t - p1.x) / (p2.x - p1.x);
        return p1.y + ratio * (p2.y - p1.y);
      }
    }
    return null;
  };

  const findClosestTrajectory = (mousePx: {x: number, y: number}) => {
    let minDist = Infinity;
    let closestTraj: Trajectory | null = null;
    let closestPoint: Point | null = null; 
    trajectories.forEach(traj => {
      for (let i = 0; i < traj.points.length - 1; i++) {
        const p1 = toPixel(traj.points[i]);
        const p2 = toPixel(traj.points[i+1]);
        const l2 = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
        if (l2 === 0) continue;
        let t = ((mousePx.x - p1.x) * (p2.x - p1.x) + (mousePx.y - p1.y) * (p2.y - p1.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projX = p1.x + t * (p2.x - p1.x);
        const projY = p1.y + t * (p2.y - p1.y);
        const dist = Math.sqrt((mousePx.x - projX) ** 2 + (mousePx.y - projY) ** 2);
        if (dist < minDist) {
          minDist = dist;
          closestTraj = traj;
          closestPoint = {
            x: traj.points[i].x + t * (traj.points[i+1].x - traj.points[i].x),
            y: traj.points[i].y + t * (traj.points[i+1].y - traj.points[i].y)
          };
        }
      }
    });
    return { traj: closestTraj, dist: minDist, point: closestPoint };
  };

  const getTrajectoryIntersectionWithLine = (traj: Trajectory, m: number, c: number): Point | null => {
    for (let i = 0; i < traj.points.length - 1; i++) {
      const intersection = getSegmentLineIntersection(traj.points[i], traj.points[i+1], m, c);
      if (intersection) return intersection;
    }
    return null;
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!image || trajectories.length === 0) return;
    const worldPoint = getMousePosOnCanvas(e);
    if (!canvasRef.current || !imgDimensions) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const clickPx = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };

    const experimentId = generateExperimentId(); // Random ID
    const waveSpeed = getWaveSpeed();

    if (mode === AnalysisMode.LINE) {
      const newPoints = [...drawingPoints, worldPoint];
      if (newPoints.length === 2) {
        const [p1, p2] = newPoints;
        const slope = (p2.y - p1.y) / (p2.x - p1.x);
        const intersects: Point[] = [];
        trajectories.forEach(t => {
          for (let i = 0; i < t.points.length - 1; i++) {
            const inter = getLineIntersection(p1, p2, t.points[i], t.points[i+1]);
            if (inter) intersects.push(inter);
          }
        });

        // Calculate Relative Flow (N/dt) and Density (N/dx)
        // Note: dt is in min, dx is in meters
        const dt = Math.abs(p2.x - p1.x);
        const dx = Math.abs(p2.y - p1.y);
        const count = intersects.length;
        
        // Avoid division by zero, use 0 if undefined
        const flow = dt > 0.01 ? count / dt : 0; 
        const density = dx > 1 ? count / dx : 0;

        setResults(prev => [...prev, {
          mode: AnalysisMode.LINE, 
          flow: flow, 
          density: density, 
          speed: 0, 
          area: 0, ttd: 0, ttt: 0,
          count: count, 
          waveSpeed: slope, 
          experimentId
        }]);
        setVisuals(prev => [...prev, { mode: AnalysisMode.LINE, points: newPoints, intersections: intersects }]);
        setDrawingPoints([]);
        
        addLog(`Line: N=${count} | v=${toSpeedKmh(slope).toFixed(1)} km/h | q=${toFlowH(flow).toFixed(0)} veh/h | k=${toDensityKm(density).toFixed(1)} veh/km`);
      } else {
        addLog("Line point set. Click endpoint.");
        setDrawingPoints(newPoints);
      }
    } else if (mode === AnalysisMode.POLYGON) {
      const newPoints = [...drawingPoints, worldPoint];
      if (newPoints.length === 4) {
        let ttd = 0, ttt = 0;
        const area = calculatePolygonArea(newPoints);
        trajectories.forEach(t => {
          for (let i = 0; i < t.points.length - 1; i++) {
            const m = getClippedSegmentMetrics(t.points[i], t.points[i+1], newPoints);
            ttd += m.ttd; ttt += m.ttt;
          }
        });
        const res: AnalysisResult = {
          mode: AnalysisMode.POLYGON, flow: area > 0 ? ttd / area : 0, 
          density: area > 0 ? ttt / area : 0, speed: ttt > 0 ? ttd / ttt : 0,
          area, ttd, ttt, experimentId
        };
        setResults(prev => [...prev, res]);
        setVisuals(prev => [...prev, { mode: AnalysisMode.POLYGON, points: newPoints }]);
        setDrawingPoints([]);
        addLog(`Polygon: Area=${area.toFixed(0)} | q=${toFlowH(res.flow).toFixed(0)} | k=${toDensityKm(res.density).toFixed(1)} | v=${toSpeedKmh(res.speed).toFixed(1)}`);
      } else {
        addLog(`Polygon corner ${newPoints.length}/4 set.`);
        setDrawingPoints(newPoints);
      }
    } else if (mode === AnalysisMode.LOOP_DETECTOR) {
      addLog("Generating Loop Detector samples...");
      const interval = loopInterval;
      const h = loopLength;
      const endT = extent.temporal;
      const newResults: AnalysisResult[] = [];
      const newVisuals: AnalysisVisual[] = [];
      
      for (let t = 0; t < endT; t += interval) {
        const t_center = t + interval / 2;
        // Fix: Apply offsetY correctly to calculate top/bottom edges of the parallelogram
        const calcY = (time: number, offsetY: number) => waveSpeed * (time - t_center) + worldPoint.y + offsetY;
        
        const poly = [
          { x: t, y: calcY(t, -h/2) },
          { x: t + interval, y: calcY(t + interval, -h/2) },
          { x: t + interval, y: calcY(t + interval, h/2) },
          { x: t, y: calcY(t, h/2) },
        ];
        
        let ttd = 0, ttt = 0;
        const area = calculatePolygonArea(poly);
        trajectories.forEach(tr => {
          for (let i = 0; i < tr.points.length - 1; i++) {
            const m = getClippedSegmentMetrics(tr.points[i], tr.points[i+1], poly);
            ttd += m.ttd; ttt += m.ttt;
          }
        });
        newResults.push({ mode: AnalysisMode.LOOP_DETECTOR, flow: area > 0 ? ttd/area : 0, density: area > 0 ? ttt/area : 0, speed: ttt > 0 ? ttd/ttt : 0, area, ttd, ttt, experimentId });
        newVisuals.push({ mode: AnalysisMode.POLYGON, points: poly });
      }
      setResults(prev => [...prev, ...newResults]);
      setVisuals(prev => [...prev, ...newVisuals]);
      addLog(`Loop Detector created ${newResults.length} samples.`);
    } else if (mode === AnalysisMode.PLATOON) {
      const { traj: anchorTraj, point: anchorPoint } = findClosestTrajectory(clickPx);
      if (!anchorTraj || !anchorPoint) {
         addLog("Platoon Error: No vehicles detected.");
         return;
      }
      const t_ref = anchorPoint.x;
      const activeNeighbors = trajectories
        .map(t => ({ traj: t, yAtT: getYAtTime(t, t_ref) }))
        .filter(item => item.yAtT !== null) as { traj: Trajectory, yAtT: number }[];
      
      activeNeighbors.sort((a, b) => a.yAtT - b.yAtT);
      const anchorIndex = activeNeighbors.findIndex(item => item.traj.id === anchorTraj.id);
      
      if (anchorIndex === -1 || activeNeighbors.length < 2) {
         addLog("Platoon Error: Insufficient vehicles.");
         return;
      }

      addLog(`Tracking Platoon (N=${platoonN}, H=${platoonHeight}m)...`);
      const platoon = activeNeighbors.slice(anchorIndex, anchorIndex + platoonN).map(item => item.traj);
      const h = platoonHeight;
      const newResults: AnalysisResult[] = [];
      const newVisuals: AnalysisVisual[] = [];
      
      let currentIntercept = anchorPoint.y - waveSpeed * anchorPoint.x;
      let stepCount = 0;

      while (true) {
        const c1 = currentIntercept;
        const c2 = currentIntercept + h;
        if ((waveSpeed * 0 + c1) > extent.spatial && (waveSpeed * extent.temporal + c1) > extent.spatial) break;

        const p1_traj1 = getTrajectoryIntersectionWithLine(platoon[0], waveSpeed, c1);
        const p1_trajN = getTrajectoryIntersectionWithLine(platoon[platoon.length-1], waveSpeed, c1);
        const p2_trajN = getTrajectoryIntersectionWithLine(platoon[platoon.length-1], waveSpeed, c2);
        const p2_traj1 = getTrajectoryIntersectionWithLine(platoon[0], waveSpeed, c2);

        if (!p1_traj1 || !p1_trajN || !p2_trajN || !p2_traj1) break;

        const poly = [p1_traj1, p1_trajN, p2_trajN, p2_traj1];
        let ttd = 0, ttt = 0;
        const area = calculatePolygonArea(poly);
        trajectories.forEach(tr => {
          for (let i = 0; i < tr.points.length - 1; i++) {
            const m = getClippedSegmentMetrics(tr.points[i], tr.points[i+1], poly);
            ttd += m.ttd; ttt += m.ttt;
          }
        });
        newResults.push({ mode: AnalysisMode.PLATOON, flow: area > 0 ? ttd/area : 0, density: area > 0 ? ttt/area : 0, speed: ttt > 0 ? ttd/ttt : 0, area, ttd, ttt, experimentId });
        
        const cutIntersections: Point[] = [];
        const collectIntersections = (m: number, c: number, startP: Point, endP: Point) => {
            const minX = Math.min(startP.x, endP.x);
            const maxX = Math.max(startP.x, endP.x);
            trajectories.forEach(t => {
                const pt = getTrajectoryIntersectionWithLine(t, m, c);
                if (pt && pt.x >= minX - 1e-4 && pt.x <= maxX + 1e-4) cutIntersections.push(pt);
            });
        };

        collectIntersections(waveSpeed, c1, p1_traj1, p1_trajN);
        collectIntersections(waveSpeed, c2, p2_traj1, p2_trajN);

        newVisuals.push({ 
          mode: AnalysisMode.POLYGON, 
          points: poly,
          anchor: stepCount === 0 ? anchorPoint : undefined,
          intersections: cutIntersections
        });
        
        stepCount++;
        currentIntercept += h;
        if (stepCount > 100) break;
      }
      
      setResults(prev => [...prev, ...newResults]);
      setVisuals(prev => [...prev, ...newVisuals]);
      addLog(`Platoon analysis finished. ${stepCount} steps.`);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      addLog(`Uploading file: ${file.name}`);
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          imgRef.current = img;
          setImgDimensions({ width: img.width, height: img.height });
          setImage(dataUrl);
          setTrajectories([]);
          setResults([]);
          setVisuals([]);
          setDrawingPoints([]);
          setZoom(1.0);
          setMouseCoord(null);
          addLog("Image loaded. Workspace initialized.");
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleViewMode = () => {
      setViewMode(prev => {
          if (prev === ViewMode.ORIGINAL) { addLog("View: Binary Mask"); return ViewMode.BINARY; }
          if (prev === ViewMode.BINARY) { addLog("View: Trajectory Vectors"); return ViewMode.VECTORS; }
          addLog("View: Original Image");
          return ViewMode.ORIGINAL;
      });
  };

  // Data Worksheet Logic
  const getLowerRightCorner = (index: number) => {
    const visual = visuals[index];
    if (!visual || !visual.points || visual.points.length === 0) return { t: 0, x: 0 };
    let maxT = -Infinity;
    let minX = Infinity;
    
    visual.points.forEach(p => {
       if (p.x > maxT) maxT = p.x;
       if (p.y < minX) minX = p.y;
    });
    return { t: maxT, x: minX };
  };

  const exportCSV = () => {
     addLog("Exporting CSV...");
     const headers = ["ID", "Type", "Time (min)", "Loc (m)", "Flow (veh/h)", "Density (veh/km)", "Speed (km/h)", "Area (m*min)", "TTD (m)", "TTT (min)"];
     const rows = results.map((r, i) => {
         const { t, x } = getLowerRightCorner(i);
         // Special handling for LINE mode
         if (r.mode === AnalysisMode.LINE) {
             return [
                 results.length - i,
                 r.mode,
                 t.toFixed(2),
                 x.toFixed(1),
                 toFlowH(r.flow).toFixed(1), // Flow
                 toDensityKm(r.density).toFixed(1), // Density
                 toSpeedKmh(r.waveSpeed || 0).toFixed(1), // Speed (Wave Speed)
                 "", // Area
                 "", // TTD
                 ""  // TTT
             ].join(",");
         }
         
         return [
             results.length - i,
             r.mode,
             t.toFixed(2),
             x.toFixed(1),
             toFlowH(r.flow).toFixed(1),
             toDensityKm(r.density).toFixed(1),
             toSpeedKmh(r.speed).toFixed(1),
             r.area.toFixed(1),
             r.ttd.toFixed(1),
             r.ttt.toFixed(2)
         ].join(",");
     });
     const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
     const encodedUri = encodeURI(csvContent);
     const link = document.createElement("a");
     link.setAttribute("href", encodedUri);
     link.setAttribute("download", "traffic_analysis_data.csv");
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
     addLog("CSV downloaded.");
  };

  const copyToClipboard = () => {
     addLog("Copying data to clipboard...");
     const headers = ["ID", "Type", "Time", "Loc", "q", "k", "v", "Area", "TTD", "TTT"];
     const rows = results.map((r, i) => {
         const { t, x } = getLowerRightCorner(i);
         if (r.mode === AnalysisMode.LINE) {
             return [
                 results.length - i,
                 r.mode,
                 t.toFixed(2),
                 x.toFixed(1),
                 toFlowH(r.flow).toFixed(1), // Flow
                 toDensityKm(r.density).toFixed(1), // Density
                 toSpeedKmh(r.waveSpeed || 0).toFixed(1), // Speed
                 "-", // Area
                 "-", // TTD
                 "-"  // TTT
             ].join("\t");
         }

         return [
             results.length - i,
             r.mode,
             t.toFixed(2),
             x.toFixed(1),
             toFlowH(r.flow).toFixed(1),
             toDensityKm(r.density).toFixed(1),
             toSpeedKmh(r.speed).toFixed(1),
             r.area.toFixed(1),
             r.ttd.toFixed(1),
             r.ttt.toFixed(2)
         ].join("\t");
     });
     const text = [headers.join("\t"), ...rows].join("\n");
     navigator.clipboard.writeText(text);
     addLog("Data copied.");
  };

  return (
    <div className={`min-h-screen flex flex-col lg:flex-row transition-colors duration-200 ${darkMode ? 'dark bg-[#0a0f1d] text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <aside className="w-full lg:w-96 bg-white dark:bg-[#111827] border-r border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-6 shadow-xl z-20 overflow-y-auto shrink-0">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg"><Activity className="text-white w-6 h-6" /></div>
            <h1 className="text-xl font-black tracking-tight uppercase">Trajectory Explorer</h1>
          </div>
          <div className="flex items-center gap-2">
             {/* Visual Settings Dropdown */}
             <div className="relative">
              <button 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)} 
                className={`p-2 rounded-lg transition-colors ${isSettingsOpen ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                title="Visual Settings"
              >
                <Settings size={20} className={isSettingsOpen ? 'text-indigo-600' : ''} />
              </button>
              
              {isSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsSettingsOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl shadow-2xl z-50 p-4 space-y-4 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                    <div className="flex justify-between items-center mb-2">
                       <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest">Visual Settings</h3>
                       <button onClick={() => setIsSettingsOpen(false)} title="Close Settings"><X size={14} className="text-slate-400 hover:text-slate-600" /></button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                          <span className="flex items-center gap-2"><Circle size={12}/> Intersections</span>
                          <button
                            onClick={() => { setShowDots(!showDots); addLog(`Intersections ${!showDots ? 'Shown' : 'Hidden'}`); }}
                            className={`w-8 h-4 rounded-full transition-colors relative ${showDots ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                            title="Toggle Intersection Dots"
                          >
                             <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${showDots ? 'left-4.5 translate-x-1' : 'left-0.5'}`}></div>
                          </button>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2 border-t dark:border-slate-800">
                      <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2"><Palette size={12}/> Trajectory Color</label>
                      <div className="grid grid-cols-6 gap-2">
                        {Object.keys(TRAJ_COLORS).map(c => (
                          <button 
                            key={c}
                            onClick={() => setTrajColor(c as any)}
                            className={`w-full aspect-square rounded-full border-2 transition-all ${trajColor === c ? 'border-indigo-500 scale-110' : 'border-transparent hover:scale-105'}`}
                            style={{ background: TRAJ_COLORS[c as keyof typeof TRAJ_COLORS] }}
                            title={`Select ${c} color`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3 pt-2 border-t dark:border-slate-800">
                      <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2"><SlidersHorizontal size={12} /> Image Correction</label>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500">
                          <span>Brightness</span>
                          <span>{brightness}%</span>
                        </div>
                        <input 
                          type="range" min="0" max="200" value={brightness} 
                          onChange={(e) => setBrightness(Number(e.target.value))} 
                          className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          title="Adjust Image Brightness" 
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500">
                          <span>Contrast</span>
                          <span>{contrast}%</span>
                        </div>
                        <input 
                          type="range" min="0" max="200" value={contrast} 
                          onChange={(e) => setContrast(Number(e.target.value))} 
                          className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          title="Adjust Image Contrast" 
                        />
                      </div>
                    </div>

                    <div className="space-y-3 pt-2 border-t dark:border-slate-800">
                       <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2"><Activity size={12}/> Processing</label>
                       <button onClick={() => runAnalysis()} className="w-full py-2 bg-slate-100 dark:bg-slate-800 border dark:border-slate-700 text-[10px] font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" title="Reprocess image to extract trajectories">
                         <RefreshCw size={12} /> Recalculate Vectors
                       </button>
                    </div>

                  </div>
                </>
              )}
            </div>

             {/* View Toggle */}
            <button 
                onClick={toggleViewMode} 
                className={`p-2 rounded-lg transition-colors border-2 ${viewMode !== ViewMode.ORIGINAL ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 border-indigo-200 dark:border-indigo-800' : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                title="Toggle View Mode"
            >
                {viewMode === ViewMode.ORIGINAL ? <Eye size={20} /> : viewMode === ViewMode.BINARY ? <Scan size={20} /> : <Activity size={20} />}
            </button>
            
            {/* Dark Mode */}
            <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Toggle Dark/Light Mode">
              {darkMode ? <Sun size={20} className="text-amber-400" /> : <Moon size={20} className="text-indigo-600" />}
            </button>
          </div>
        </header>

        {/* Controls */}
        <div className="space-y-6">
          <div className="space-y-3">
             <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border dark:border-slate-800 shadow-inner">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b dark:border-slate-800">
                <Terminal size={14} className="text-indigo-500" />
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">System Log</span>
              </div>
              <div className="max-h-[80px] overflow-y-auto font-mono text-[10px] leading-relaxed text-slate-600 dark:text-slate-400 space-y-1 custom-scrollbar pr-2">
                {logs.map((log, i) => (
                  <div key={i} className="break-words opacity-90 hover:opacity-100 transition-opacity">
                    <span className="text-slate-400 mr-2 opacity-50">{log.split(']')[0]}]</span>
                    <span className={i === 0 ? "font-bold text-indigo-600 dark:text-indigo-400" : ""}>{log.split(']')[1]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <section className="space-y-3">
            <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Settings size={14} /> Domain Parameters</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border dark:border-slate-700">
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Time (min)</label>
                <input type="number" value={extent.temporal} onChange={(e) => setExtent({...extent, temporal: Number(e.target.value)})} className="w-full bg-transparent font-bold text-sm focus:outline-none" title="Set temporal extent of the image in minutes" />
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border dark:border-slate-700">
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Space (m)</label>
                <input type="number" value={extent.spatial} onChange={(e) => setExtent({...extent, spatial: Number(e.target.value)})} className="w-full bg-transparent font-bold text-sm focus:outline-none" title="Set spatial extent of the image in meters" />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><MousePointer2 size={14} /> Analysis Suite</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: AnalysisMode.LINE, label: 'Line', icon: PenTool, tip: 'Define wave speed using two points' },
                { id: AnalysisMode.POLYGON, label: 'Polygon', icon: Layers, tip: 'Measure density/flow in a 4-point polygon' },
                { id: AnalysisMode.PLATOON, label: 'Platoon', icon: Move, tip: 'Track a platoon of N vehicles over space' },
                { id: AnalysisMode.LOOP_DETECTOR, label: 'Loop Detect', icon: Target, tip: 'Simulate loop detector data collection' },
              ].map(m => (
                <button key={m.id} onClick={() => { setMode(m.id); setDrawingPoints([]); addLog(`Mode: ${m.label}`); }} className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${mode === m.id ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-500 hover:border-slate-200'}`} title={m.tip}>
                  <m.icon size={20} className="mb-2" />
                  <span className="text-[10px] font-black uppercase tracking-tight text-center">{m.label}</span>
                </button>
              ))}
            </div>
          </section>

          {(mode === AnalysisMode.PLATOON || mode === AnalysisMode.LOOP_DETECTOR) && (
            <section className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border dark:border-slate-700 space-y-4">
              <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Configuration</h3>
              {mode === AnalysisMode.PLATOON ? (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[9px] font-bold text-slate-400 uppercase">Vehicles (N)</label><input type="number" value={platoonN} onChange={e => setPlatoonN(Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg font-bold" title="Number of vehicles in platoon" /></div>
                  <div><label className="text-[9px] font-bold text-slate-400 uppercase">Segment H (m)</label><input type="number" value={platoonHeight} onChange={e => setPlatoonHeight(Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg font-bold" title="Height of each measurement segment" /></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[9px] font-bold text-slate-400 uppercase">Window (min)</label><input type="number" step="0.1" value={loopInterval} onChange={e => setLoopInterval(Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg font-bold" title="Time interval for data aggregation" /></div>
                  <div><label className="text-[9px] font-bold text-slate-400 uppercase">Aperture (m)</label><input type="number" step="0.5" value={loopLength} onChange={e => setLoopLength(Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg font-bold" title="Length of the virtual loop detector" /></div>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="mt-auto pt-6 space-y-3">
          <button onClick={() => { setResults([]); setVisuals([]); setDrawingPoints([]); addLog("Workspace cleared."); }} className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black text-xs uppercase tracking-widest rounded-2xl border dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2" title="Clear all measurements and visuals">
            <Trash2 size={16} /> Flush Workspace
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 lg:p-6 flex flex-col gap-6 overflow-hidden">
        {/* Main Canvas Area */}
        <div className="bg-white dark:bg-[#111827] rounded-[32px] shadow-2xl border dark:border-slate-800 flex flex-col flex-1 relative overflow-hidden">
          <header className="bg-slate-50/90 dark:bg-slate-950/70 backdrop-blur-md border-b dark:border-slate-800 px-8 py-4 flex justify-between items-center z-10">
            <div className="flex items-center gap-4">
              <span className="px-4 py-1.5 bg-indigo-600 text-white text-[10px] font-black rounded-full uppercase tracking-[0.2em] flex items-center gap-2 shadow-lg shadow-indigo-500/20" title="Active Workspace"><Move size={12} /> Worksurface</span>
              
              {/* Zoom Controls Moved Here */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border dark:border-slate-700">
                <button 
                  onClick={() => setZoom(prev => Math.max(0.1, prev - 0.1))} 
                  className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400 transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut size={14} />
                </button>
                <span className="text-[10px] font-mono font-bold text-slate-400 px-1 select-none min-w-[3ch] text-center">{Math.round(zoom * 100)}%</span>
                <button 
                  onClick={() => setZoom(prev => Math.min(10, prev + 0.1))} 
                  className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400 transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn size={14} />
                </button>
              </div>

              {image && <span className="text-sm font-bold text-slate-500 dark:text-slate-400 tabular-nums ml-2 border-l pl-4 dark:border-slate-800">{extent.temporal} min × {extent.spatial} m</span>}
            </div>
            <div className="flex items-center gap-6">
              {mouseCoord && <div className="hidden sm:flex text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 gap-6 bg-white dark:bg-slate-900 border dark:border-slate-800 px-5 py-2 rounded-full shadow-sm"><span>T: {mouseCoord.x.toFixed(2)}</span><span>X: {mouseCoord.y.toFixed(1)}</span></div>}
              {isProcessing && <div className="flex items-center gap-2 text-indigo-600 animate-pulse"><Activity size={16} /><span className="text-[10px] font-black uppercase tracking-tighter">Processing</span></div>}
              <button onClick={() => fileInputRef.current?.click()} className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-sm hover:text-indigo-600 hover:border-indigo-400 transition-all" title="Upload Trajectory Image"><Upload size={20} /></button>
            </div>
          </header>
          
          <div 
            className="relative flex-1 overflow-auto bg-slate-100/50 dark:bg-[#080c14] custom-scrollbar flex touch-none"
            // Pinch-to-Zoom Event Handlers
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Fundamental Diagram Overlay in Draggable Window */}
            <DraggableWindow 
               title="Fundamental Diagram"
               initialPosition={{ x: 20, y: 20 }} 
               initialSize={{ width: 280, height: 220 }}
               defaultMinimized={true}
               className="opacity-95 hover:opacity-100"
            >
               <FundamentalDiagram results={results} />
            </DraggableWindow>

            {!image ? (
              <div onClick={() => fileInputRef.current?.click()} className="m-auto flex flex-col items-center justify-center cursor-pointer group p-12 text-center">
                <Upload className="text-slate-300 dark:text-slate-700 mb-8 group-hover:text-indigo-500 transition-all group-hover:scale-110" size={140} strokeWidth={1} />
                <h3 className="text-4xl font-black text-slate-800 dark:text-white group-hover:text-indigo-600 transition-colors uppercase tracking-tight">Import Trajectories</h3>
                <p className="text-slate-500 dark:text-slate-400 max-w-sm mt-4 font-bold text-lg">Select a time-space BMP/PNG to initialize the flow analyst.</p>
              </div>
            ) : (
              <div className="m-auto p-12">
                {imgDimensions && (
                  <div 
                    style={{ 
                      width: imgDimensions.width * zoom, 
                      height: imgDimensions.height * zoom,
                    }}
                    className="relative bg-white dark:bg-black shadow-2xl ring-1 ring-slate-200 dark:ring-slate-800"
                  >
                    <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', width: imgDimensions.width, height: imgDimensions.height }}>
                      <canvas 
                        ref={canvasRef} 
                        onClick={handleCanvasClick} 
                        onMouseMove={(e) => setMouseCoord(getMousePosOnCanvas(e))}
                        onMouseLeave={() => setMouseCoord(null)}
                        className={`cursor-crosshair block ${darkMode ? 'invert hue-rotate-180 contrast-90' : ''}`}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
          </div>
        </div>

        {/* Data & Charts Area */}
        <div className="grid grid-cols-1 gap-6 min-h-[400px] shrink-0">
          {/* Data Worksheet - Full Width */}
          <div className="bg-white dark:bg-[#111827] rounded-[32px] shadow-xl border dark:border-slate-800 flex flex-col overflow-hidden h-[400px]">
            <header className="px-8 py-5 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
              <h3 className="text-xl font-black flex items-center gap-3 text-slate-800 dark:text-white uppercase tracking-tight">
                <div className="w-2 h-7 bg-indigo-600 rounded-full"></div> 
                Worksheet
              </h3>
              <div className="flex gap-2">
                <button onClick={copyToClipboard} className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:border-indigo-400 transition-all" title="Copy to Clipboard">
                  <Copy size={14} /> Copy
                </button>
                <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:border-indigo-400 transition-all" title="Export to CSV">
                  <FileDown size={14} /> CSV
                </button>
              </div>
            </header>
            
            <div className="flex-1 overflow-auto custom-scrollbar p-0">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10 shadow-sm">
                  <tr>
                    {["ID", "Type", "Time (min)", "Loc (m)", "q (veh/h)", "k (veh/km)", "v (km/h)", "Area", "TTD (m)", "TTT (min)"].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap border-b dark:border-slate-800">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-800">
                  {results.slice().reverse().map((res, i) => {
                    const actualIdx = results.length - 1 - i;
                    const { t, x } = getLowerRightCorner(actualIdx);
                    // Use modulo for consistent row coloring based on the random experiment ID
                    const color = EXPERIMENT_COLORS[res.experimentId % EXPERIMENT_COLORS.length];
                    
                    return (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-slate-500 dark:text-slate-400 border-l-4" style={{ borderLeftColor: color }}>
                          {(results.length - i).toString().padStart(2, '0')}
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                          {res.mode}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{t.toFixed(2)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{x.toFixed(1)}</td>
                        
                        {res.mode === AnalysisMode.LINE ? (
                          <>
                            <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-slate-100 bg-indigo-50/30 dark:bg-indigo-900/10">
                              {toFlowH(res.flow).toFixed(0)}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                              {toDensityKm(res.density).toFixed(1)}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                              {toSpeedKmh(res.waveSpeed || 0).toFixed(1)}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-400 dark:text-slate-500 italic">-</td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-400 dark:text-slate-500 italic">-</td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-400 dark:text-slate-500 italic">-</td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-slate-100 bg-indigo-50/30 dark:bg-indigo-900/10">
                              {toFlowH(res.flow).toFixed(0)}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                              {toDensityKm(res.density).toFixed(1)}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                              {toSpeedKmh(res.speed).toFixed(1)}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-500">
                              {res.area.toFixed(1)}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-500">
                              {res.ttd.toFixed(1)}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-500">
                              {res.ttt.toFixed(2)}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  {results.length === 0 && (
                     <tr>
                       <td colSpan={10} className="px-6 py-12 text-center text-slate-400 text-sm font-bold italic opacity-50">
                         <TableIcon className="inline-block mb-2 opacity-50" size={24} /> <br/>
                         Worksheet Empty
                       </td>
                     </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 20px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
};

export default App;