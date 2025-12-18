import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label } from 'recharts';
import { AnalysisResult, AnalysisMode } from '../types';

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

const renderCustomPoint = (props: any) => {
  const { cx, cy, fill, payload } = props;

  // Check if it is the first point (id === 0) of a Platoon mode series
  if (payload && payload.mode === AnalysisMode.PLATOON && payload.id === 0) {
    // Draw a star shape centered at (cx, cy)
    // Star path relative to center 0,0 then translated
    return (
      <path
        d={`M ${cx} ${cy - 6} L ${cx + 1.5} ${cy - 2} L ${cx + 6} ${cy - 2} L ${cx + 2.5} ${cy + 1.5} L ${cx + 4} ${cy + 6} L ${cx} ${cy + 3.5} L ${cx - 4} ${cy + 6} L ${cx - 2.5} ${cy + 1.5} L ${cx - 6} ${cy - 2} L ${cx - 1.5} ${cy - 2} Z`}
        fill={fill}
        stroke={fill}
        strokeWidth={1}
      />
    );
  }

  // Default circle for other points
  return <circle cx={cx} cy={cy} r={5} fill={fill} />;
};

const FundamentalDiagram: React.FC<FundamentalDiagramProps> = ({ results }) => {
  const isDarkMode = document.documentElement.classList.contains('dark');
  const textColor = isDarkMode ? '#94a3b8' : '#64748b';
  const gridColor = isDarkMode ? '#1e293b' : '#e2e8f0';

  // Group results by Experiment ID to handle connected scatter plots (Platoons)
  const groupedResults = results.reduce((acc, r) => {
    if (!acc[r.experimentId]) acc[r.experimentId] = [];
    acc[r.experimentId].push(r);
    return acc;
  }, {} as Record<number, AnalysisResult[]>);

  return (
    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 transition-colors flex flex-col h-[400px]">
      <h3 className="text-xl font-bold mb-6 text-slate-800 dark:text-white flex items-center gap-2">
        <div className="w-1.5 h-6 bg-indigo-600 rounded-full mr-2"></div>
        Fundamental Diagram (q-k)
      </h3>
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis 
              type="number" 
              dataKey="k" 
              name="Density" 
              unit=" veh/km" 
              stroke={textColor}
              fontSize={10}
              tick={{ fontWeight: 600 }}
            >
              <Label value="Density (veh/km)" offset={-15} position="insideBottom" fill={textColor} style={{ fontWeight: 700, fontSize: '10px', textTransform: 'uppercase' }} />
            </XAxis>
            <YAxis 
              type="number" 
              dataKey="q" 
              name="Flow" 
              unit=" veh/h" 
              stroke={textColor}
              fontSize={10}
              tick={{ fontWeight: 600 }}
            >
              <Label value="Flow (veh/h)" angle={-90} position="insideLeft" offset={0} fill={textColor} style={{ fontWeight: 700, fontSize: '10px', textTransform: 'uppercase' }} />
            </YAxis>
            <Tooltip 
              cursor={{ strokeDasharray: '3 3' }} 
              contentStyle={{ 
                backgroundColor: isDarkMode ? '#0f172a' : '#ffffff', 
                border: '1px solid #334155', 
                borderRadius: '12px', 
                color: isDarkMode ? '#f1f5f9' : '#0f172a',
                fontSize: '12px',
                fontWeight: 'bold',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
              }}
            />
            {Object.values(groupedResults).map((group: AnalysisResult[], idx) => {
               // Filter valid points only
               const validGroup = group.filter(r => r.density >= 0 && r.flow >= 0);
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
                 />
               );
            })}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FundamentalDiagram;