
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  AnalysisMode, 
  AnalysisResult, 
  Extent, 
  Trajectory, 
  Point,
  AnalysisVisual
} from './types';
import { extractTrajectoriesFromCanvas } from './services/imageProcessor';
import { 
  calculatePolygonArea, 
  getClippedSegmentMetrics,
  getLineIntersection
} from './utils/geometry';
import FundamentalDiagram from './components/FundamentalDiagram';
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
  Target
} from 'lucide-react';

const toFlowH = (q: number) => q * 60;
const toDensityKm = (k: number) => k * 1000;
const toSpeedKmh = (u: number) => (u * 60) / 1000;

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
  const [platoonHeight, setPlatoonHeight] = useState<number>(10);
  const [loopInterval, setLoopInterval] = useState<number>(0.5); 
  const [loopLength, setLoopLength] = useState<number>(2.0);
  const [zoom, setZoom] = useState<number>(1.0);
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [mouseCoord, setMouseCoord] = useState<Point | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("Ready. Upload a trajectory BMP to begin analysis.");

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  // Canvas Initialization Effect
  useEffect(() => {
    if (image && imgDimensions && canvasRef.current && imgRef.current) {
      const canvas = canvasRef.current;
      canvas.width = imgDimensions.width;
      canvas.height = imgDimensions.height;
      
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
         ctx.drawImage(imgRef.current, 0, 0);
         
         setIsProcessing(true);
         setStatusMessage("Processing image data...");
         
         // Allow paint before heavy processing
         setTimeout(() => {
           const extracted = extractTrajectoriesFromCanvas(canvas, extent);
           setTrajectories(extracted);
           setIsProcessing(false);
           setStatusMessage(`Analysis Ready: ${extracted.length} trajectories identified.`);
         }, 50);
      }
    }
  }, [image, imgDimensions]); // eslint-disable-line react-hooks/exhaustive-deps

  const toPixel = useCallback((point: Point) => {
    if (!imgDimensions) return { x: 0, y: 0 };
    return {
      x: (point.x / extent.temporal) * imgDimensions.width,
      y: imgDimensions.height - (point.y / extent.spatial) * imgDimensions.height
    };
  }, [extent, imgDimensions]);

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

  const redraw = useCallback(() => {
    if (!canvasRef.current || !imgRef.current || !imgDimensions) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgRef.current, 0, 0);

    ctx.lineWidth = 1.5;
    trajectories.forEach(t => {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(79, 70, 229, 0.5)';
      t.points.forEach((p, i) => {
        const pix = toPixel(p);
        if (i === 0) ctx.moveTo(pix.x, pix.y); else ctx.lineTo(pix.x, pix.y);
      });
      ctx.stroke();
    });

    visuals.forEach(v => {
      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#f43f5e';
      ctx.fillStyle = 'rgba(244, 63, 94, 0.2)';
      v.points.forEach((p, i) => {
        const pix = toPixel(p);
        if (i === 0) ctx.moveTo(pix.x, pix.y); else ctx.lineTo(pix.x, pix.y);
      });
      if (v.mode !== AnalysisMode.LINE) { ctx.closePath(); ctx.fill(); }
      ctx.stroke();

      if (v.intersections) {
        ctx.fillStyle = '#10b981';
        v.intersections.forEach(p => {
          const pix = toPixel(p);
          ctx.beginPath(); ctx.arc(pix.x, pix.y, 5, 0, Math.PI * 2); ctx.fill();
        });
      }
    });

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
  }, [trajectories, drawingPoints, visuals, toPixel, imgDimensions]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!image || trajectories.length === 0) return;
    const worldPoint = getMousePosOnCanvas(e);

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
        setResults(prev => [...prev, {
          mode: AnalysisMode.LINE, flow: 0, density: 0, speed: 0, area: 0, ttd: 0, ttt: 0,
          count: intersects.length, waveSpeed: slope
        }]);
        setVisuals(prev => [...prev, { mode: AnalysisMode.LINE, points: newPoints, intersections: intersects }]);
        setDrawingPoints([]);
        setStatusMessage(`Line Analysis: ${intersects.length} trajectories crossed.`);
      } else {
        setDrawingPoints(newPoints);
        setStatusMessage("Select end point.");
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
          area, ttd, ttt
        };
        setResults(prev => [...prev, res]);
        setVisuals(prev => [...prev, { mode: AnalysisMode.POLYGON, points: newPoints }]);
        setDrawingPoints([]);
        setStatusMessage(`Edie's Definition: q=${toFlowH(res.flow).toFixed(0)}, k=${toDensityKm(res.density).toFixed(1)}`);
      } else {
        setDrawingPoints(newPoints);
      }
    } else if (mode === AnalysisMode.LOOP_DETECTOR) {
      const interval = loopInterval;
      const h = loopLength;
      const endT = extent.temporal;
      const newResults: AnalysisResult[] = [];
      const newVisuals: AnalysisVisual[] = [];
      for (let t = 0; t < endT; t += interval) {
        const poly = [
          { x: t, y: worldPoint.y - h/2 },
          { x: t + interval, y: worldPoint.y - h/2 },
          { x: t + interval, y: worldPoint.y + h/2 },
          { x: t, y: worldPoint.y + h/2 },
        ];
        let ttd = 0, ttt = 0;
        const area = calculatePolygonArea(poly);
        trajectories.forEach(tr => {
          for (let i = 0; i < tr.points.length - 1; i++) {
            const m = getClippedSegmentMetrics(tr.points[i], tr.points[i+1], poly);
            ttd += m.ttd; ttt += m.ttt;
          }
        });
        newResults.push({ mode: AnalysisMode.LOOP_DETECTOR, flow: area > 0 ? ttd/area : 0, density: area > 0 ? ttt/area : 0, speed: ttt > 0 ? ttd/ttt : 0, area, ttd, ttt });
        newVisuals.push({ mode: AnalysisMode.POLYGON, points: poly });
      }
      setResults(prev => [...prev, ...newResults]);
      setVisuals(prev => [...prev, ...newVisuals]);
      setStatusMessage(`Simulated loop detectors at y=${worldPoint.y.toFixed(1)}m`);
    } else if (mode === AnalysisMode.PLATOON) {
      const h = platoonHeight;
      const N = platoonN;
      const activeAtT = trajectories
        .map(t => ({ traj: t, yAtT: getYAtTime(t, worldPoint.x) }))
        .filter(item => item.yAtT !== null) as { traj: Trajectory, yAtT: number }[];
      
      if (activeAtT.length === 0) return;
      activeAtT.sort((a, b) => a.yAtT - b.yAtT);
      let closestIdx = 0, minD = Infinity;
      activeAtT.forEach((item, idx) => {
        const d = Math.abs(item.yAtT - worldPoint.y);
        if (d < minD) { minD = d; closestIdx = idx; }
      });
      let startIdx = Math.max(0, Math.min(closestIdx, activeAtT.length - N));
      const platoon = activeAtT.slice(startIdx, startIdx + N).map(item => item.traj);
      const newResults: AnalysisResult[] = [];
      const newVisuals: AnalysisVisual[] = [];
      for (let currentY = worldPoint.y; currentY <= extent.spatial - h; currentY += h) {
        const t1_y1 = getTimeAtY(platoon[0], currentY);
        const t1_y2 = getTimeAtY(platoon[0], currentY + h);
        const tN_y1 = getTimeAtY(platoon[platoon.length-1], currentY);
        const tN_y2 = getTimeAtY(platoon[platoon.length-1], currentY + h);
        if (t1_y1 === null || t1_y2 === null || tN_y1 === null || tN_y2 === null) break;
        const poly = [{x:t1_y1, y:currentY}, {x:tN_y1, y:currentY}, {x:tN_y2, y:currentY+h}, {x:t1_y2, y:currentY+h}];
        let ttd = 0, ttt = 0;
        const area = calculatePolygonArea(poly);
        trajectories.forEach(tr => {
          for (let i = 0; i < tr.points.length - 1; i++) {
            const m = getClippedSegmentMetrics(tr.points[i], tr.points[i+1], poly);
            ttd += m.ttd; ttt += m.ttt;
          }
        });
        newResults.push({ mode: AnalysisMode.PLATOON, flow: area > 0 ? ttd/area : 0, density: area > 0 ? ttt/area : 0, speed: ttt > 0 ? ttd/ttt : 0, area, ttd, ttt });
        newVisuals.push({ mode: AnalysisMode.POLYGON, points: poly });
      }
      setResults(prev => [...prev, ...newResults]);
      setVisuals(prev => [...prev, ...newVisuals]);
      setStatusMessage(`Platoon N=${N} tracked over space.`);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          imgRef.current = img;
          setImgDimensions({ width: img.width, height: img.height });
          setImage(dataUrl);
          // Reset
          setTrajectories([]);
          setResults([]);
          setVisuals([]);
          setDrawingPoints([]);
          setZoom(1.0);
          setMouseCoord(null);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col lg:flex-row transition-colors duration-200 ${darkMode ? 'dark bg-[#0a0f1d] text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <aside className="w-full lg:w-96 bg-white dark:bg-[#111827] border-r border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-6 shadow-xl z-20 overflow-y-auto shrink-0">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg"><Activity className="text-white w-6 h-6" /></div>
            <h1 className="text-xl font-black tracking-tight uppercase">TFA v3.1</h1>
          </div>
          <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            {darkMode ? <Sun size={20} className="text-amber-400" /> : <Moon size={20} className="text-indigo-600" />}
          </button>
        </header>

        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Settings size={14} /> Domain Parameters</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border dark:border-slate-700">
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Time (min)</label>
                <input type="number" value={extent.temporal} onChange={(e) => setExtent({...extent, temporal: Number(e.target.value)})} className="w-full bg-transparent font-bold text-sm focus:outline-none" />
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border dark:border-slate-700">
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Space (m)</label>
                <input type="number" value={extent.spatial} onChange={(e) => setExtent({...extent, spatial: Number(e.target.value)})} className="w-full bg-transparent font-bold text-sm focus:outline-none" />
              </div>
            </div>
            <button onClick={() => {
              if (imgRef.current && canvasRef.current) {
                setIsProcessing(true);
                setTimeout(() => {
                  setTrajectories(extractTrajectoriesFromCanvas(canvasRef.current!, extent));
                  setIsProcessing(false);
                  redraw();
                }, 50);
              }
            }} className="w-full py-2 bg-slate-100 dark:bg-slate-800 border dark:border-slate-700 text-xs font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700">
              <Activity size={14} /> Recalculate Vectors
            </button>
          </section>

          <section className="space-y-3">
            <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><ZoomIn size={14} /> Viewport</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setZoom(prev => Math.max(0.1, prev - 0.1))} className="flex-1 py-2 px-3 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><ZoomOut size={16} className="mx-auto" /></button>
              <div className="px-4 text-xs font-black min-w-[60px] text-center bg-indigo-50 dark:bg-indigo-900/20 py-2 rounded-lg text-indigo-600 dark:text-indigo-400">{Math.round(zoom * 100)}%</div>
              <button onClick={() => setZoom(prev => Math.min(10, prev + 0.1))} className="flex-1 py-2 px-3 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><ZoomIn size={16} className="mx-auto" /></button>
              <button onClick={() => setZoom(1.0)} className="py-2 px-3 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><Maximize size={16} /></button>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><MousePointer2 size={14} /> Analysis Suite</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: AnalysisMode.LINE, label: 'Alignment', icon: PenTool },
                { id: AnalysisMode.POLYGON, label: 'Polygon', icon: Layers },
                { id: AnalysisMode.PLATOON, label: 'Platoon', icon: Move },
                { id: AnalysisMode.LOOP_DETECTOR, label: 'Loop Detect', icon: Target },
              ].map(m => (
                <button key={m.id} onClick={() => { setMode(m.id); setDrawingPoints([]); }} className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${mode === m.id ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-500 hover:border-slate-200'}`}>
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
                  <div><label className="text-[9px] font-bold text-slate-400 uppercase">Vehicles (N)</label><input type="number" value={platoonN} onChange={e => setPlatoonN(Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg font-bold" /></div>
                  <div><label className="text-[9px] font-bold text-slate-400 uppercase">Segment H (m)</label><input type="number" value={platoonHeight} onChange={e => setPlatoonHeight(Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg font-bold" /></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[9px] font-bold text-slate-400 uppercase">Window (min)</label><input type="number" step="0.1" value={loopInterval} onChange={e => setLoopInterval(Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg font-bold" /></div>
                  <div><label className="text-[9px] font-bold text-slate-400 uppercase">Aperture (m)</label><input type="number" step="0.5" value={loopLength} onChange={e => setLoopLength(Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg font-bold" /></div>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="mt-auto pt-6 space-y-3">
          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border dark:border-slate-800">
            <div className="flex items-center gap-2 mb-2"><MessageSquare size={14} className="text-indigo-500" /><span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Console</span></div>
            <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 min-h-[40px] italic font-semibold">"{statusMessage}"</p>
          </div>
          <button onClick={() => { setResults([]); setVisuals([]); setDrawingPoints([]); setStatusMessage("Workspace reset."); }} className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black text-xs uppercase tracking-widest rounded-2xl border dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2">
            <Trash2 size={16} /> Flush Workspace
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 lg:p-6 flex flex-col gap-6 overflow-hidden">
        <div className="bg-white dark:bg-[#111827] rounded-[32px] shadow-2xl border dark:border-slate-800 flex flex-col flex-1 relative overflow-hidden">
          <header className="bg-slate-50/90 dark:bg-slate-950/70 backdrop-blur-md border-b dark:border-slate-800 px-8 py-4 flex justify-between items-center z-10">
            <div className="flex items-center gap-3">
              <span className="px-4 py-1.5 bg-indigo-600 text-white text-[10px] font-black rounded-full uppercase tracking-[0.2em] flex items-center gap-2 shadow-lg shadow-indigo-500/20"><Move size={12} /> Worksurface</span>
              {image && <span className="text-sm font-bold text-slate-500 dark:text-slate-400 tabular-nums">{extent.temporal} min × {extent.spatial} m</span>}
            </div>
            <div className="flex items-center gap-6">
              {mouseCoord && <div className="hidden sm:flex text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 gap-6 bg-white dark:bg-slate-900 border dark:border-slate-800 px-5 py-2 rounded-full shadow-sm"><span>T: {mouseCoord.x.toFixed(2)}</span><span>X: {mouseCoord.y.toFixed(1)}</span></div>}
              {isProcessing && <div className="flex items-center gap-2 text-indigo-600 animate-pulse"><Activity size={16} /><span className="text-[10px] font-black uppercase tracking-tighter">Processing</span></div>}
              <button onClick={() => fileInputRef.current?.click()} className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border dark:border-slate-700 shadow-sm hover:text-indigo-600 hover:border-indigo-400 transition-all"><Upload size={20} /></button>
            </div>
          </header>
          
          <div className="relative flex-1 overflow-auto bg-slate-100/50 dark:bg-[#080c14] custom-scrollbar flex">
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
                        className="cursor-crosshair block"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-[340px] shrink-0">
          <FundamentalDiagram results={results} />
          
          <div className="bg-white dark:bg-[#111827] p-8 rounded-[32px] shadow-xl border dark:border-slate-800 flex flex-col overflow-hidden">
            <h3 className="text-xl font-black mb-6 flex items-center gap-3 text-slate-800 dark:text-white uppercase tracking-tight">
              <div className="w-2 h-7 bg-indigo-600 rounded-full"></div> 
              Numerical Ledger 
              <span className="text-[10px] font-black text-slate-400 ml-auto uppercase tracking-widest">(Metric Data)</span>
            </h3>
            <div className="flex-1 overflow-y-auto space-y-4 pr-3 custom-scrollbar">
              {results.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm font-bold opacity-40"><MousePointer2 size={32} className="mb-4" /> Awaiting Analysis Triggers</div>
              ) : (
                results.slice().reverse().map((res, i) => (
                  <div key={i} className="p-5 rounded-3xl border dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 transition-all shadow-sm group">
                    <div className="flex justify-between items-center mb-4"><span className="text-[10px] font-black uppercase text-indigo-600 tracking-[0.2em]">{res.mode}</span><span className="px-3 py-1 bg-slate-200 dark:bg-slate-700 text-[10px] font-black rounded-full tabular-nums">ENTRY {(results.length - i).toString().padStart(2, '0')}</span></div>
                    {res.mode === AnalysisMode.LINE ? (
                      <div className="grid grid-cols-2 gap-8">
                        <div className="flex flex-col"><span className="text-4xl font-black text-slate-900 dark:text-slate-100 tabular-nums">{toSpeedKmh(res.waveSpeed || 0).toFixed(1)}</span><span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Wave Speed (km/h)</span></div>
                        <div className="flex flex-col"><span className="text-4xl font-black text-slate-900 dark:text-slate-100 tabular-nums">{res.count}</span><span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Vehicle Crossings</span></div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-6">
                        <div className="flex flex-col"><span className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">{toFlowH(res.flow).toFixed(1)}</span><span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">q (veh/h)</span></div>
                        <div className="flex flex-col"><span className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">{toDensityKm(res.density).toFixed(1)}</span><span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">k (veh/km)</span></div>
                        <div className="flex flex-col"><span className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">{toSpeedKmh(res.speed).toFixed(1)}</span><span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">u (km/h)</span></div>
                      </div>
                    )}
                  </div>
                ))
              )}
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
