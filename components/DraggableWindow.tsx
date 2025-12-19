import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, GripHorizontal } from 'lucide-react';

interface DraggableWindowProps {
  children: React.ReactNode;
  title?: string;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  defaultMinimized?: boolean;
  className?: string;
}

export const DraggableWindow: React.FC<DraggableWindowProps> = ({ 
  children, 
  title = "Window",
  initialPosition = { x: 24, y: 96 }, 
  initialSize = { width: 400, height: 300 },
  defaultMinimized = false,
  className = ""
}) => {
  const [pos, setPos] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  
  const dragStart = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const startSize = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPos({
          x: startPos.current.x + (e.clientX - dragStart.current.x),
          y: startPos.current.y + (e.clientY - dragStart.current.y)
        });
      } else if (isResizing && !isMinimized) {
        setSize({
          width: Math.max(250, startSize.current.width + (e.clientX - dragStart.current.x)),
          height: Math.max(200, startSize.current.height + (e.clientY - dragStart.current.y))
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, isMinimized]);

  return (
    <div 
      className={`absolute z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden transition-shadow ${isDragging || isResizing ? 'shadow-indigo-500/20 ring-1 ring-indigo-500/50' : ''} ${className}`}
      style={{ 
        left: pos.x, 
        top: pos.y, 
        width: size.width, 
        height: isMinimized ? 'auto' : size.height 
      }}
    >
      {/* Header / Drag Handle */}
      <div 
        className="h-8 w-full flex items-center justify-between px-2 bg-slate-100 dark:bg-slate-800 border-b dark:border-slate-800 select-none group"
        onMouseDown={(e) => {
           // Only drag if not clicking the toggle button
           if (!(e.target as HTMLElement).closest('button')) {
             e.preventDefault();
             setIsDragging(true);
             dragStart.current = { x: e.clientX, y: e.clientY };
             startPos.current = pos;
           }
        }}
      >
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 cursor-grab active:cursor-grabbing flex-1 h-full">
           <GripHorizontal size={14} className="text-slate-400" />
           <span>{title}</span>
        </div>
        
        <button 
          onClick={() => setIsMinimized(!isMinimized)}
          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 transition-colors"
          title={isMinimized ? "Expand" : "Minimize"}
        >
          {isMinimized ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {!isMinimized && (
        <>
          <div className="flex-1 min-h-0 relative">
            {children}
          </div>

          {/* Resize Handle */}
          <div 
            className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-40 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-tl-lg transition-colors"
            onMouseDown={(e) => {
               e.stopPropagation();
               e.preventDefault();
               setIsResizing(true);
               dragStart.current = { x: e.clientX, y: e.clientY };
               startSize.current = size;
            }}
            title="Drag to resize"
          >
             <div className="w-1.5 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
          </div>
        </>
      )}
    </div>
  );
};