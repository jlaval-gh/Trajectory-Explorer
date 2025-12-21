import React, { useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label, ReferenceLine, ReferenceDot, Customized } from 'recharts';
import { AnalysisResult, AnalysisMode } from '../types';
import { Ruler, Trash2, ChevronDown } from 'lucide-react';

interface FundamentalDiagramProps {
  results: AnalysisResult[];
  onRecordLog?: (msg: string) => void;
}

// Darker colors as requested
const COLORS = [
  '#991b1b', // Red 800
  '#9a3412', // Orange 800
  '#92400e', // Amber 800
  '#3f6212', // Lime 800
  '#065f46', // Emerald 800
  '#155e75', // Cyan 800
  '#1e40af', // Blue 800
  '#3730a3', // Indigo 800
  '#5b21b6', // Violet 800
  '#86198f', // Fuchsia 800
  '#9f1239', // Rose 800
];

type ChartMode = 'k-q' | 'k-v' | 's-v' | 'q-v' | 'q-p' | 'p-h' | 's-h';

const axisConfig: Record<ChartMode, { x: string; y: string; xName: string; yName: string; xUnit: string; yUnit: string }> = {
    'k-q': { x: 'k', y: 'q', xName: 'Density', yName: 'Flow', xUnit: 'veh/km', yUnit: 'veh/h' },
    'k-v': { x: 'k', y: 'v', xName: 'Density', yName: 'Speed', xUnit: 'veh/km', yUnit: 'km/h' },
    's-v': { x: 's', y: 'v', xName: 'Spacing', yName: 'Speed', xUnit: 'm', yUnit: 'km/h' },
    'q-v': { x: 'q', y: 'v', xName: 'Flow', yName: 'Speed', xUnit: 'veh/h', yUnit: 'km/h' },
    'q-p': { x: 'q', y: 'p', xName: 'Flow', yName: 'Pace', xUnit: 'veh/h', yUnit: 'min/km' },
    'p-h': { x: 'p', y: 'h', xName: 'Pace', yName: 'Headway', xUnit: 'min/km', yUnit: 's' },
    's-h': { x: 's', y: 'h', xName: 'Spacing', yName: 'Headway', xUnit: 'm', yUnit: 's' },
};

// Robust Overlay Component to capture clicks via SVG coordinates and invert D3 scales
const SlopeClickLayer = (props: any) => {
    const { xAxisMap, yAxisMap, offset, onChartClick, isSlopeMode } = props;
    
    // If not in slope mode, don't render the blocking overlay
    if (!isSlopeMode || !xAxisMap || !yAxisMap || !offset) return null;

    return (
        <rect
            x={offset.left}
            y={offset.top}
            width={offset.width}
            height={offset.height}
            fill="rgba(255,255,255,0)" 
            style={{ cursor: 'crosshair', pointerEvents: 'all' }}
            onClick={(e) => {
                 const svgNode = (e.target as Element).closest('svg');
                 if (svgNode) {
                    const pt = svgNode.createSVGPoint();
                    pt.x = e.clientX;
                    pt.y = e.clientY;
                    // Transform screen coordinate to SVG coordinate
                    const svgP = pt.matrixTransform(svgNode.getScreenCTM()?.inverse());
                    
                    // Access D3 scales from Recharts internals
                    const xScale = Object.values(xAxisMap)[0] as any;
                    const yScale = Object.values(yAxisMap)[0] as any;
                    
                    if (xScale?.scale && yScale?.scale) {
                        const k = xScale.scale.invert(svgP.x);
                        const val = yScale.scale.invert(svgP.y);
                        onChartClick(k, val);
                    }
                 }
            }}
        />
    )
};

const renderCustomPoint = (props: any) => {
  const { cx, cy, fill, payload } = props;

  // Use ID 0 for the start of the platoon measurement series
  if (payload && payload.mode === AnalysisMode.PLATOON && payload.id === 0) {
    const s = 5; 
    return (
      <path
        d={`M ${cx - s} ${cy - s} L ${cx + s} ${cy + s} M ${cx + s} ${cy - s} L ${cx - s} ${cy + s}`}
        stroke={fill}
        strokeWidth={2.5}
        fill="none"
      />
    );
  }
  return <circle cx={cx} cy={cy} r={5} fill={fill} />;
};

const FundamentalDiagram: React.FC<FundamentalDiagramProps> = ({ results, onRecordLog }) => {
  const isDarkMode = document.documentElement.classList.contains('dark');
  const textColor = isDarkMode ? '#94a3b8' : '#64748b';
  const gridColor = isDarkMode ? '#1e293b' : '#e2e8f0';

  const [chartMode, setChartMode] = useState<ChartMode>('k-q');
  const [isSlopeMode, setIsSlopeMode] = useState(false);
  
  // Current incomplete line points
  const [currentPoints, setCurrentPoints] = useState<{x: number, y: number}[]>([]);
  // Completed lines
  const [savedLines, setSavedLines] = useState<{p1: {x: number, y: number}, p2: {x: number, y: number}}[]>([]);

  const groupedResults = results.reduce((acc, r) => {
    if (!acc[r.experimentId]) acc[r.experimentId] = [];
    acc[r.experimentId].push(r);
    return acc;
  }, {} as Record<number, AnalysisResult[]>);

  const config = axisConfig[chartMode];

  // Callback for the robust overlay
  const handleOverlayClick = (x: number, y: number) => {
    // Validate bounds
    if (x < 0 || y < 0) return; // Basic sanity check

    const newPoint = { x, y };
    
    if (currentPoints.length === 0) {
        setCurrentPoints([newPoint]);
    } else {
        // Complete the line
        const newLine = { p1: currentPoints[0], p2: newPoint };
        setSavedLines(prev => [...prev, newLine]);
        setCurrentPoints([]); // Reset current
        
        // Log slope
        const slope = calculateSlope(newLine.p1, newLine.p2);
        if (slope !== null && onRecordLog) {
           let msg = `Chart Measurement: Slope = ${slope.toFixed(2)}`;
           if (chartMode === 'k-q') msg += ` km/h (Wave Speed)`;
           else msg += ` [${config.yUnit}/${config.xUnit}]`;
           onRecordLog(msg);
        }
    }
  };

  const calculateSlope = (p1: {x: number, y: number}, p2: {x: number, y: number}) => {
     if (Math.abs(p2.x - p1.x) < 0.0001) return null;
     return (p2.y - p1.y) / (p2.x - p1.x);
  };

  return (
    <div className={`w-full h-full flex flex-col p-4`}>
      <div className="flex justify-between items-center mb-2 gap-2">
        <div className="relative min-w-[140px]">
           <select 
             value={chartMode} 
             onChange={(e) => {
                 setChartMode(e.target.value as ChartMode);
                 setSavedLines([]); // Clear lines on mode switch to avoid confusion
                 setCurrentPoints([]);
             }}
             className="appearance-none w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 pl-3 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
           >
              <option value="k-q">Flow-Density (q-k)</option>
              <option value="k-v">Speed-Density (v-k)</option>
              <option value="s-v">Speed-Spacing (v-s)</option>
              <option value="q-v">Speed-Flow (v-q)</option>
              <option value="q-p">Pace-Flow (p-q)</option>
              <option value="p-h">Pace-Headway (p-h)</option>
              <option value="s-h">Headway-Spacing (h-s)</option>
           </select>
           <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        <div className="flex items-center gap-1">
           <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1"></div>

           {/* Tool Controls */}
           <button
             onClick={() => { 
                setIsSlopeMode(!isSlopeMode); 
                setCurrentPoints([]); 
             }}
             className={`p-1.5 rounded-md transition-all border flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${isSlopeMode ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 border-indigo-200 dark:border-indigo-800' : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-400 hover:text-slate-600'}`}
             title={isSlopeMode ? "Exit Drawing Mode" : "Draw Reference Lines"}
           >
             <Ruler size={12} />
             {isSlopeMode ? "Active" : "Draw"}
           </button>
           
           {(savedLines.length > 0 || currentPoints.length > 0) && (
               <button
                 onClick={() => { setSavedLines([]); setCurrentPoints([]); }}
                 className="p-1.5 rounded-md bg-red-50 dark:bg-red-900/20 text-red-500 hover:text-red-600 transition-colors"
                 title="Clear all lines"
               >
                 <Trash2 size={12} />
               </button>
           )}
        </div>
      </div>
      
      <div className="flex-1 w-full min-h-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis 
              type="number" 
              dataKey="x" 
              name={config.xName} 
              stroke={textColor}
              fontSize={9}
              tick={{ fontWeight: 600 }}
              allowDataOverflow={false}
              domain={['auto', 'auto']}
            >
              <Label value={`${config.xName} (${config.xUnit})`} offset={-5} position="insideBottom" fill={textColor} style={{ fontWeight: 700, fontSize: '9px', textTransform: 'uppercase' }} />
            </XAxis>
            <YAxis 
              type="number" 
              dataKey="y" 
              name={config.yName}
              stroke={textColor}
              fontSize={9}
              tick={{ fontWeight: 600 }}
              allowDataOverflow={false}
              domain={['auto', 'auto']}
            >
              <Label 
                 value={`${config.yName} (${config.yUnit})`} 
                 angle={-90} 
                 position="insideLeft" 
                 offset={10} 
                 fill={textColor} 
                 style={{ fontWeight: 700, fontSize: '9px', textTransform: 'uppercase' }} 
              />
            </YAxis>
            
            {!isSlopeMode && (
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }} 
                contentStyle={{ 
                  backgroundColor: isDarkMode ? '#0f172a' : '#ffffff', 
                  border: '1px solid #334155', 
                  borderRadius: '8px', 
                  color: isDarkMode ? '#f1f5f9' : '#0f172a',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
                formatter={(value: number, name: string) => [
                    value.toFixed(1), 
                    name === 'x' ? config.xName : config.yName
                ]}
              />
            )}

            {Object.values(groupedResults).map((group: AnalysisResult[], idx) => {
               const validGroup = group.filter(r => r.density > 0 || r.flow > 0);
               if (validGroup.length === 0) return null;

               const data = validGroup.map((r, i) => {
                 const k = r.density * 1000; // veh/km
                 const q = r.flow * 60; // veh/h
                 const v = k > 0.001 ? q / k : 0; // km/h
                 const s = k > 0.001 ? 1000 / k : 0; // m
                 const h = q > 0.001 ? 3600 / q : 0; // s
                 const p = v > 0.001 ? 60 / v : 0; // min/km

                 let xVal = 0, yVal = 0;
                 switch(chartMode) {
                     case 'k-q': xVal = k; yVal = q; break;
                     case 'k-v': xVal = k; yVal = v; break;
                     case 's-v': xVal = s; yVal = v; break;
                     case 'q-v': xVal = q; yVal = v; break;
                     case 'q-p': xVal = q; yVal = p; break;
                     case 'p-h': xVal = p; yVal = h; break;
                     case 's-h': xVal = s; yVal = h; break;
                 }
                 
                 return {
                   x: xVal,
                   y: yVal,
                   id: i,
                   mode: r.mode,
                   experimentId: r.experimentId
                 };
               });

               const isPlatoon = validGroup[0].mode === AnalysisMode.PLATOON;
               const color = COLORS[validGroup[0].experimentId % COLORS.length];

               return (
                 <Scatter 
                    key={validGroup[0].experimentId}
                    name={`Exp ${validGroup[0].experimentId}`}
                    data={data}
                    fill={color}
                    line={isPlatoon ? { stroke: color, strokeWidth: 2 } : false}
                    lineType="joint"
                    shape={renderCustomPoint}
                    isAnimationActive={false}
                    onClick={(e: any) => {
                         if(isSlopeMode && e.payload) handleOverlayClick(e.payload.x, e.payload.y);
                    }}
                    style={{ cursor: isSlopeMode ? 'crosshair' : 'default' }}
                 />
               );
            })}
            
            <Scatter 
                data={[{x: 0, y: 0}]}
                fill={textColor}
                line={false}
                shape="circle"
                isAnimationActive={false}
                name="Origin"
                tooltipType="none"
            />
            
            {/* Draw Saved Lines */}
            {savedLines.map((line, i) => {
                const slope = calculateSlope(line.p1, line.p2);
                return (
                   <React.Fragment key={`saved-${i}`}>
                        <ReferenceLine 
                            segment={[line.p1, line.p2]} 
                            stroke="#6366f1" 
                            strokeWidth={2} 
                            strokeDasharray="4 4"
                            isFront={true}
                        >
                            <Label 
                               value={slope !== null ? `${slope.toFixed(1)}` : ''} 
                               position="insideTop" 
                               fill={isDarkMode ? '#818cf8' : '#4f46e5'} 
                               fontWeight={900}
                               fontSize={10}
                            />
                        </ReferenceLine>
                        <ReferenceDot x={line.p1.x} y={line.p1.y} r={3} fill="#6366f1" />
                        <ReferenceDot x={line.p2.x} y={line.p2.y} r={3} fill="#6366f1" />
                   </React.Fragment>
                );
            })}

            {/* Draw Current In-Progress Point */}
            {isSlopeMode && currentPoints.map((p, i) => (
               <ReferenceDot key={`curr-${i}`} x={p.x} y={p.y} r={4} fill="#f43f5e" stroke="white" strokeWidth={2} />
            ))}
            
            <Customized component={<SlopeClickLayer onChartClick={handleOverlayClick} isSlopeMode={isSlopeMode} />} />

          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FundamentalDiagram;