import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface ChargingCountdownProps {
  startTimeStr: string;
  startSOC: number;
  staticSOC: number;
}

export default function ChargingCountdown({ startTimeStr, startSOC, staticSOC }: ChargingCountdownProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const startTime = new Date(startTimeStr);
  
  // time (minutes) = (endSOC - startSOC) * 1.45
  // so current SOC = startSOC + elapsedMinutes / 1.45
  const elapsedMinutes = Math.max(0, (now.getTime() - startTime.getTime()) / 60000);
  
  let currentEstimatedSOC = startSOC + elapsedMinutes / 1.45;
  if (currentEstimatedSOC > 100) currentEstimatedSOC = 100;
  
  const remainingMinutes = Math.max(0, (100 - startSOC) * 1.45 - elapsedMinutes);
  const completionTime = new Date(startTime.getTime() + (100 - startSOC) * 1.45 * 60000);
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  };
  
  const formatDuration = (mins: number) => {
    const hours = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    const s = Math.floor((mins * 60) % 60);
    if (hours > 0) return `${hours}ชม ${m}น ${s}วิ`;
    return `${m}น ${s}วิ`;
  };

  return (
    <div className="space-y-1.5 md:space-y-2">
      <div className="flex justify-between items-center">
        <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 md:text-slate-500 font-mono">
          SOC ปัจจุบัน
          <span className="relative flex h-2 w-2 ml-0.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </span>
        <span className="text-emerald-400 font-mono font-bold text-xs md:text-sm">{currentEstimatedSOC.toFixed(1)}%</span>
      </div>
      
      {/* Battery Animation Progress */}
      <div className="flex items-center w-full">
        <div className="relative flex-1 h-4 md:h-6 bg-slate-950 border md:border-2 border-slate-700 rounded md:rounded-md p-0.5 overflow-hidden shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-xs md:rounded-sm transition-all duration-1000 ease-linear relative flex items-center overflow-hidden"
            style={{ width: `${currentEstimatedSOC}%` }}
          >
            <div className="absolute inset-0 bg-[length:10px_10px] opacity-30" 
                 style={{ backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.2) 50%, rgba(255,255,255,.2) 75%, transparent 75%, transparent)' }}>
            </div>
            <div className="absolute inset-0 bg-white/10 animate-pulse"></div>
          </div>
        </div>
        <div className="w-1 md:w-1.5 h-2 md:h-2.5 bg-slate-600 rounded-r-sm border-y md:border-y-2 border-r md:border-r-2 border-slate-700"></div>
      </div>

      <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono bg-slate-900/60 px-2 py-1 md:p-1.5 rounded border border-slate-800/50">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-amber-500 animate-pulse shrink-0" />
          <span>เหลือ {formatDuration(remainingMinutes)}</span>
        </span>
        <span className="text-emerald-400 font-semibold">เต็ม ~{formatTime(completionTime)} น.</span>
      </div>
    </div>
  );
}
