import React, { useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label, ReferenceLine, ReferenceDot, Customized } from 'recharts';
import { AnalysisResult, AnalysisMode } from '../types';
import { Ruler, Trash2, MousePointerClick } from 'lucide-react';

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
                        const q = yScale.scale.invert(svgP.y);
                        onChartClick(k, q);
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

  const [isSlopeMode, setIsSlopeMode] = useState(false);
  const [slopePoints, setSlopePoints] = useState<{k: number, q: number}[]>([]);

  const groupedResults = results.reduce((acc, r) => {
    if (!acc[r.experimentId]) acc[r.experimentId] = [];
    acc[r.experimentId].push(r);
    return acc;
  }, {} as Record<number, AnalysisResult[]>);

  // Callback for the robust overlay
  const handleOverlayClick = (k: number, q: number) => {
    // Validate bounds
    if (k < 0 || q < 0) return; // Basic sanity check

    const newPoint = { k, q };
    setSlopePoints(prev => {
        if (prev.length >= 2) return [newPoint];
        return [...prev, newPoint];
    });
  };

  const calculateSlope = () => {
    if (slopePoints.length < 2) return null;
    const p1 = slopePoints[0];
    const p2 = slopePoints[1];
    if (Math.abs(p2.k - p1.k) < 0.0001) return null;
    return (p2.q - p1.q) / (p2.k - p1.k);
  };

  const slope = calculateSlope();

  return (
    <div className={`w-full h-full flex flex-col p-4`}>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <div className="w-1 h-4 bg-indigo-600 rounded-full mr-1"></div>
          Fundamental Diagram
        </h3>
        <div className="flex items-center gap-1">
           {isSlopeMode && slopePoints.length > 0 && (
              <span className="text-[10px] font-mono font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">
                {slopePoints.length === 1 ? 'Select P2' : `v=${slope?.toFixed(1)}`}
              </span>
           )}
           <button
             onClick={() => { 
                setIsSlopeMode(!isSlopeMode); 
                setSlopePoints([]); 
             }}
             className={`p-1.5 rounded-md transition-all border flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${isSlopeMode ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 border-indigo-200 dark:border-indigo-800' : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-400 hover:text-slate-600'}`}
             title={isSlopeMode ? "Exit Speed Tool" : "Measure Wave Speed"}
           >
             {isSlopeMode ? <Trash2 size={12} /> : <Ruler size={12} />}
             {isSlopeMode ? "Clear" : "Tool"}
           </button>
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
              dataKey="q" 
              name="Flow" 
              stroke={textColor}
              fontSize={9}
              tick={{ fontWeight: 600 }}
              allowDataOverflow={false}
              domain={['auto', 'auto']}
            >
              <Label value="Flow (veh/h)" angle={-90} position="insideLeft" offset={10} fill={textColor} style={{ fontWeight: 700, fontSize: '9px', textTransform: 'uppercase' }} />
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
              />
            )}

            {Object.values(groupedResults).map((group: AnalysisResult[], idx) => {
               const validGroup = group.filter(r => r.density > 0 || r.flow > 0);
               if (validGroup.length === 0) return null;

               const data = validGroup.map((r, i) => ({
                 k: r.density * 1000, 
                 q: r.flow * 60,
                 id: i,
                 mode: r.mode,
                 experimentId: r.experimentId
               }));

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
                         if(isSlopeMode && e.payload) handleOverlayClick(e.payload.k, e.payload.q);
                    }}
                    style={{ cursor: isSlopeMode ? 'crosshair' : 'default' }}
                 />
               );
            })}
            
            {isSlopeMode && slopePoints.map((p, i) => (
               <ReferenceDot key={i} x={p.k} y={p.q} r={4} fill="#6366f1" stroke="white" strokeWidth={2} />
            ))}
            
            {isSlopeMode && slopePoints.length === 2 && (
              <ReferenceLine 
                segment={[
                  { x: slopePoints[0].k, y: slopePoints[0].q },
                  { x: slopePoints[1].k, y: slopePoints[1].q }
                ]} 
                stroke="#6366f1" 
                strokeWidth={2} 
                strokeDasharray="4 4"
                isFront={true}
              >
                <Label 
                   value={`${slope?.toFixed(1)}`} 
                   position="insideTop" 
                   fill={isDarkMode ? '#818cf8' : '#4f46e5'} 
                   fontWeight={900}
                   fontSize={10}
                />
              </ReferenceLine>
            )}
            
            <Customized component={<SlopeClickLayer onChartClick={handleOverlayClick} isSlopeMode={isSlopeMode} />} />

          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FundamentalDiagram;