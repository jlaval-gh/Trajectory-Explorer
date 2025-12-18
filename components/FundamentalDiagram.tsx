
import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label } from 'recharts';
import { AnalysisResult } from '../types';

interface FundamentalDiagramProps {
  results: AnalysisResult[];
}

const FundamentalDiagram: React.FC<FundamentalDiagramProps> = ({ results }) => {
  const data = results
    .filter(r => r.density >= 0 && r.flow >= 0)
    .map((r, i) => ({
      k: r.density * 1000, // veh/m -> veh/km
      q: r.flow * 60,      // veh/min -> veh/h
      id: i,
      mode: r.mode
    }));

  const isDarkMode = document.documentElement.classList.contains('dark');
  const textColor = isDarkMode ? '#94a3b8' : '#64748b';
  const gridColor = isDarkMode ? '#1e293b' : '#e2e8f0';

  return (
    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 transition-colors flex flex-col h-[340px]">
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
            <Scatter name="Analysis Points" data={data} fill="#6366f1" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FundamentalDiagram;
