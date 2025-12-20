import React, { useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label, ReferenceLine, ReferenceDot, Customized } from 'recharts';
import { AnalysisResult, AnalysisMode } from '../types';
import { Ruler, Trash2, Gauge, Activity } from 'lucide-react';

interface FundamentalDiagramProps {
  results: AnalysisResult[];
}

const COLORS = [
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

type ChartMode = 'flow' | 'speed';

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

  if (payload && payload.mode === AnalysisMode.PLATOON && payload.id === 0) {
    return (
      <path
        d={`M ${cx} ${cy - 6} L ${cx + 1.5} ${cy - 2} L ${cx + 6} ${cy - 2} L ${cx + 2.5} ${cy + 1.5} L ${cx + 4} ${cy + 6} L ${cx} ${cy + 3.5} L ${cx - 4} ${cy + 6} L ${cx - 2.5} ${cy + 1.5} L ${cx - 6} ${cy - 2} L ${cx - 1.5} ${cy - 2} Z`}
        fill={fill}
        stroke={fill}
        strokeWidth={1}
      />
    );
  }
  return <circle cx={cx} cy={cy} r={5} fill={fill} />;
};

const FundamentalDiagram: React.FC<FundamentalDiagramProps> = ({ results }) => {
  const isDarkMode = document.documentElement.classList.contains('dark');
  const textColor = isDarkMode ? '#94a3b8' : '#64748b';
  const gridColor = isDarkMode ? '#1e293b' : '#e2e8f0';

  const [chartMode, setChartMode] = useState<ChartMode>('flow');
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

  // Callback for the robust overlay
  const handleOverlayClick = (x: number, y: number) => {
    // Validate bounds
    if (x < 0 || y < 0) return; // Basic sanity check

    const newPoint = { x, y };
    
    if (currentPoints.length === 0) {
        setCurrentPoints([newPoint]);
    } else {
        // Complete the line
        setSavedLines(prev => [...prev, { p1: currentPoints[0], p2: newPoint }]);
        setCurrentPoints([]); // Reset current
    }
  };

  const calculateSlope = (p1: {x: number, y: number}, p2: {x: number, y: number}) => {
     if (Math.abs(p2.x - p1.x) < 0.0001) return null;
     return (p2.y - p1.y) / (p2.x - p1.x);
  };

  return (
    <div className={`w-full h-full flex flex-col p-4`}>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <div className="w-1 h-4 bg-indigo-600 rounded-full mr-1"></div>
          {chartMode === 'flow' ? 'Flow-Density' : 'Speed-Density'}
        </h3>
        <div className="flex items-center gap-1">
           {/* Chart Mode Toggle */}
           <button
             onClick={() => {
                 setChartMode(prev => prev === 'flow' ? 'speed' : 'flow');
                 setSavedLines([]); // Clear lines on mode switch to avoid confusion
                 setCurrentPoints([]);
             }}
             className="p-1.5 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-600 transition-colors"
             title={chartMode === 'flow' ? "Switch to Speed vs Density" : "Switch to Flow vs Density"}
           >
              {chartMode === 'flow' ? <Gauge size={12} /> : <Activity size={12} />}
           </button>

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
              dataKey="k" 
              name="Density" 
              stroke={textColor}
              fontSize={9}
              tick={{ fontWeight: 600 }}
              allowDataOverflow={false}
              domain={['auto', 'auto']}
            >
              <Label value="Density (veh/km)" offset={-5} position="insideBottom" fill={textColor} style={{ fontWeight: 700, fontSize: '9px', textTransform: 'uppercase' }} />
            </XAxis>
            <YAxis 
              type="number" 
              dataKey="val" 
              name={chartMode === 'flow' ? "Flow" : "Speed"}
              stroke={textColor}
              fontSize={9}
              tick={{ fontWeight: 600 }}
              allowDataOverflow={false}
              domain={['auto', 'auto']}
            >
              <Label 
                 value={chartMode === 'flow' ? "Flow (veh/h)" : "Speed (km/h)"} 
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
                    name === 'val' ? (chartMode === 'flow' ? 'Flow' : 'Speed') : name
                ]}
              />
            )}

            {Object.values(groupedResults).map((group: AnalysisResult[], idx) => {
               const validGroup = group.filter(r => r.density > 0 || r.flow > 0);
               if (validGroup.length === 0) return null;

               const data = validGroup.map((r, i) => {
                 const k = r.density * 1000;
                 const q = r.flow * 60;
                 // Prevent division by zero if density is 0
                 const v = k > 0.1 ? q / k : 0; 
                 
                 return {
                   k: k,
                   val: chartMode === 'flow' ? q : v,
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
                         if(isSlopeMode && e.payload) handleOverlayClick(e.payload.k, e.payload.val);
                    }}
                    style={{ cursor: isSlopeMode ? 'crosshair' : 'default' }}
                 />
               );
            })}
            
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
                               value={chartMode === 'flow' ? `${slope?.toFixed(1)} km/h` : ''} 
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