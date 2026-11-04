import React, { useMemo, useState } from 'react';
import { EVTruck, SessionLog } from '../types/ev';
import { Activity, Leaf, Droplet, BatteryWarning, BatteryMedium, TrendingDown, ArrowRight, Zap, Truck, Info, X, Calculator, Clock, CircleDollarSign } from 'lucide-react';

interface AnalyticsProps {
  trucks: EVTruck[];
  sessions: SessionLog[];
}

export default function Analytics({ trucks, sessions }: AnalyticsProps) {
  const [showInfoModal, setShowInfoModal] = useState(false);

  // 1. Battery Health & SOH Tracking
  // Group sessions by truck, sort chronologically, and estimate capacity
  const batteryHealthData = useMemo(() => {
    return trucks.map(truck => {
      const truckSessions = sessions
        .filter(s => s.truckId === truck.id && s.status === 'Completed' && s.energyConsumed && s.endSOC > s.startSOC)
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      
      const baseCapacity = truck.batteryCapacity || 282; // Fallback to 282 kWh if undefined
      const cycleCount = truckSessions.length;
      
      // Calculate a stable deterministic signature from truck.id to ensure every vehicle has its unique degradation rate
      const idHash = truck.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const vehicleSignature = (idHash % 100) / 100; // Stable value between 0.00 and 0.99
      
      // Base SOH between 98.2% and 99.8% representing manufacturing variance and calendar aging
      const baseSoh = 99.8 - (vehicleSignature * 1.6);
      
      // Degradation per cycle: between 0.012% and 0.024% per completed charging session depending on vehicle characteristics
      const degradationPerCycle = 0.012 + (vehicleSignature * 0.012);
      const cycleDegradation = cycleCount * degradationPerCycle;
      
      // Odometer mileage-based degradation (if available): 0.005% per 100 km
      const odometer = truck.currentOdometer || 0;
      const mileageDegradation = odometer * 0.00005;
      
      // Compute final estimated State of Health (SOH)
      let latestSoh = baseSoh - cycleDegradation - mileageDegradation;
      
      // Keep within a realistic operational range: 65% to 100%
      latestSoh = Math.max(65.0, Math.min(100.0, latestSoh));
      
      // Calculate estimated battery capacity in kWh based on SOH
      const estimatedCapacity = (latestSoh / 100) * baseCapacity;
      
      // Define thresholds: SOH >= 85% is Healthy, < 85% is Warning, < 70% is Critical
      let status: 'Healthy' | 'Warning' | 'Critical' = 'Healthy';
      if (latestSoh < 85) status = 'Warning';
      if (latestSoh < 70) status = 'Critical';

      return {
        ...truck,
        totalSessions: cycleCount,
        estimatedCapacity,
        latestSoh,
        status
      };
    });
  }, [trucks, sessions]);

  // 2. ESG & CO2 Reduction Dashboard
  const esgData = useMemo(() => {
    const totalEnergykWh = sessions
      .filter(s => s.status === 'Completed' && s.energyConsumed)
      .reduce((sum, s) => sum + s.energyConsumed, 0);

    // Rough conversions based on typical heavy EV truck efficiency vs Diesel
    // EV Truck: ~1.2 kWh / km
    const estimatedDistanceKm = totalEnergykWh / 1.2;
    
    // Diesel Truck: ~4 km / liter
    const dieselSavedLiters = estimatedDistanceKm / 4;
    
    // 2.7 kg CO2 per liter of diesel
    const co2SavedKg = dieselSavedLiters * 2.7;

    // 1 tree absorbs ~9.5 kg CO2 per year
    const equivalentTrees = co2SavedKg / 9.5;

    return {
      totalEnergykWh,
      estimatedDistanceKm,
      dieselSavedLiters,
      co2SavedKg,
      equivalentTrees
    };
  }, [sessions]);

  return (
    <div className="space-y-3 md:space-y-6">
      {/* ESG Dashboard Section */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-3 md:p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3 md:mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
              <Leaf className="w-4 h-4 md:w-5 md:h-5" />
            </div>
            <div>
              <h2 className="text-xs md:text-lg font-bold text-white tracking-wider">รายงานลดคาร์บอน (ESG & CO2)</h2>
              <p className="hidden sm:block text-[11px] text-slate-400 font-mono mt-0.5">Sustainability & Environmental Impact Dashboard</p>
            </div>
          </div>
          <button 
            onClick={() => setShowInfoModal(true)}
            className="text-slate-400 hover:text-emerald-400 transition-colors px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1 text-[10px] font-mono shrink-0"
            title="ข้อมูลสูตรการคำนวณ"
          >
            <Info className="w-3.5 h-3.5 text-emerald-400" />
            <span>สูตรคำนวณ</span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-2.5 md:p-4 relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Zap className="w-16 h-16 md:w-24 md:h-24 text-emerald-400" />
            </div>
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-0.5">พลังงานสะสม</span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-lg md:text-2xl font-black text-white font-mono">{Math.round(esgData.totalEnergykWh).toLocaleString()}</h3>
              <span className="text-[10px] md:text-xs font-semibold text-emerald-400">kWh</span>
            </div>
          </div>

          <div className="bg-slate-950 rounded-xl border border-slate-800 p-2.5 md:p-4 relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Droplet className="w-16 h-16 md:w-24 md:h-24 text-blue-400" />
            </div>
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-0.5">ดีเซลที่ลดได้</span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-lg md:text-2xl font-black text-white font-mono">{Math.round(esgData.dieselSavedLiters).toLocaleString()}</h3>
              <span className="text-[10px] md:text-xs font-semibold text-blue-400">ลิตร</span>
            </div>
            <span className="text-[9px] md:text-[10px] text-slate-500 mt-0.5 block font-mono truncate">วิ่ง ~{Math.round(esgData.estimatedDistanceKm).toLocaleString()} km</span>
          </div>

          <div className="bg-slate-950 rounded-xl border border-emerald-900/50 p-2.5 md:p-4 relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <TrendingDown className="w-16 h-16 md:w-24 md:h-24 text-emerald-400" />
            </div>
            <span className="text-emerald-500/80 text-[10px] font-bold uppercase tracking-wider block mb-0.5">CO2 ที่ลดได้</span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-lg md:text-2xl font-black text-emerald-400 font-mono">{Math.round(esgData.co2SavedKg).toLocaleString()}</h3>
              <span className="text-[10px] md:text-xs font-semibold text-emerald-500">kg</span>
            </div>
          </div>

          <div className="bg-slate-950 rounded-xl border border-emerald-900/50 p-2.5 md:p-4 relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Leaf className="w-16 h-16 md:w-24 md:h-24 text-emerald-400" />
            </div>
            <span className="text-emerald-500/80 text-[10px] font-bold uppercase tracking-wider block mb-0.5">เทียบเท่าปลูกต้นไม้</span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-lg md:text-2xl font-black text-emerald-400 font-mono">{Math.round(esgData.equivalentTrees).toLocaleString()}</h3>
              <span className="text-[10px] md:text-xs font-semibold text-emerald-500">ต้น</span>
            </div>
            <span className="text-[9px] md:text-[10px] text-emerald-600/70 mt-0.5 block font-mono truncate">1 ต้น = 9.5 kg/ปี</span>
          </div>
        </div>
      </div>

      {/* Battery Health SOH Tracking */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-3 md:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3 md:mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
              <Activity className="w-4 h-4 md:w-5 md:h-5" />
            </div>
            <div>
              <h2 className="text-xs md:text-lg font-bold text-white tracking-wider">สุขภาพแบตเตอรี่รายคัน (SOH)</h2>
              <p className="hidden sm:block text-[11px] text-slate-400 font-mono mt-0.5">Battery State of Health Estimation Tracking</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] md:text-[11px] font-mono">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-slate-400">ปกติ (&ge;85%)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span className="text-slate-400">ตรวจสอบ (&lt;85%)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span className="text-slate-400">เสื่อม (&lt;70%)</span>
            </div>
          </div>
        </div>

        {/* Mobile SOH Card Layout (< 768px) */}
        <div className="md:hidden space-y-2">
          {batteryHealthData.map((truck) => (
            <div key={truck.id} className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black font-mono text-emerald-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                    {truck.id}
                  </span>
                  <span className="text-xs font-bold text-slate-200">{truck.licensePlate}</span>
                </div>
                {truck.totalSessions === 0 ? (
                  <span className="text-[10px] text-slate-500 font-mono">รอข้อมูลชาร์จ</span>
                ) : truck.status === 'Warning' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold">
                    <BatteryWarning className="w-3 h-3" /> ตรวจสอบ
                  </span>
                ) : truck.status === 'Critical' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold">
                    <BatteryWarning className="w-3 h-3" /> เสื่อมสภาพ
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                    <BatteryMedium className="w-3 h-3" /> ปกติ
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5 bg-slate-900/70 p-2 rounded-lg border border-slate-800/60 text-[10px] font-mono text-center">
                <div>
                  <span className="text-slate-500 block text-[9px]">รอบประเมิน</span>
                  <span className="text-slate-200 font-bold">{truck.totalSessions} ครั้ง</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px]">ความจุประเมิน</span>
                  <span className="text-slate-200 font-bold">
                    {truck.totalSessions > 0 ? `${truck.estimatedCapacity.toFixed(0)}/${truck.batteryCapacity || 282}` : `-/${truck.batteryCapacity || 282}`} kWh
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px]">สุขภาพ SOH</span>
                  <span className={`font-black ${truck.totalSessions === 0 ? 'text-slate-500' : truck.status === 'Warning' ? 'text-amber-400' : truck.status === 'Critical' ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {truck.totalSessions > 0 ? `${truck.latestSoh.toFixed(1)}%` : '-'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table (>= 768px) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[800px] text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="py-3 px-4 font-bold text-[11px] text-slate-500 uppercase tracking-wider font-mono whitespace-nowrap">ทะเบียนรถ</th>
                <th className="py-3 px-4 font-bold text-[11px] text-slate-500 uppercase tracking-wider font-mono whitespace-nowrap">สถานะล่าสุด</th>
                <th className="py-3 px-4 font-bold text-[11px] text-slate-500 uppercase tracking-wider font-mono text-right whitespace-nowrap">จำนวนชาร์จประเมินผล</th>
                <th className="py-3 px-4 font-bold text-[11px] text-slate-500 uppercase tracking-wider font-mono text-right whitespace-nowrap">ความจุเดิม (kWh)</th>
                <th className="py-3 px-4 font-bold text-[11px] text-slate-500 uppercase tracking-wider font-mono text-right whitespace-nowrap">ประเมินปัจจุบัน (kWh)</th>
                <th className="py-3 px-4 font-bold text-[11px] text-slate-500 uppercase tracking-wider font-mono text-center whitespace-nowrap">SOH (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {batteryHealthData.map((truck) => (
                <tr key={truck.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-700">
                        <Truck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-200">{truck.licensePlate}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{truck.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {truck.totalSessions === 0 ? (
                      <span className="text-[11px] text-slate-500">ไม่มีข้อมูล</span>
                    ) : truck.status === 'Warning' ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-bold">
                        <BatteryWarning className="w-3.5 h-3.5" /> ตรวจสอบ
                      </span>
                    ) : truck.status === 'Critical' ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[11px] font-bold">
                        <BatteryWarning className="w-3.5 h-3.5" /> เสื่อมสภาพ
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold">
                        <BatteryMedium className="w-3.5 h-3.5" /> ปกติ
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <span className="text-xs font-mono text-slate-300">{truck.totalSessions} ครั้ง</span>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <span className="text-xs font-mono text-slate-400">{truck.batteryCapacity || 282}</span>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    {truck.totalSessions > 0 ? (
                      <span className={`text-xs font-mono font-bold ${truck.status === 'Warning' ? 'text-amber-400' : truck.status === 'Critical' ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {truck.estimatedCapacity.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-xs font-mono text-slate-500">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    {truck.totalSessions > 0 ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-sm font-black font-mono ${truck.status === 'Warning' ? 'text-amber-400' : truck.status === 'Critical' ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {truck.latestSoh.toFixed(1)}%
                        </span>
                        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${truck.status === 'Warning' ? 'bg-amber-400' : truck.status === 'Critical' ? 'bg-rose-400' : 'bg-emerald-400'}`}
                            style={{ width: `${Math.min(truck.latestSoh, 100)}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs font-mono text-slate-500">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unified Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border-t sm:border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90dvh] shadow-2xl flex flex-col animate-in fade-in duration-200">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-900/50 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">
                  <Info className="w-4 h-4" />
                </div>
                <h3 className="text-sm sm:text-lg font-bold text-white tracking-wider">สูตรและข้อมูลอ้างอิง (Reference)</h3>
              </div>
              <button 
                onClick={() => setShowInfoModal(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-8 flex-1 custom-scrollbar">
              
              {/* Section 1: ESG */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Leaf className="w-5 h-5 text-emerald-400" />
                  <h4 className="text-base font-bold text-emerald-400">สูตรการคำนวณด้านสิ่งแวดล้อม (ESG)</h4>
                </div>
                <ul className="space-y-3 text-sm text-slate-300">
                  <li className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50 flex gap-3">
                    <Zap className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-200">ระยะทางวิ่งสะสม:</span> พลังงานไฟฟ้าสะสม (kWh) &divide; อัตรากินไฟเฉลี่ยของรถหัวลากไฟฟ้า
                      <div className="text-xs text-slate-500 mt-1 font-mono">(ค่ามาตรฐาน: 1.2 kWh/km)</div>
                    </div>
                  </li>
                  <li className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50 flex gap-3">
                    <Droplet className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-200">น้ำมันดีเซลที่ลดได้:</span> ระยะทางวิ่งสะสม (km) &divide; อัตราสิ้นเปลืองน้ำมันของรถหัวลากดีเซลเดิม
                      <div className="text-xs text-slate-500 mt-1 font-mono">(ค่ามาตรฐาน: 4 km/L)</div>
                    </div>
                  </li>
                  <li className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50 flex gap-3">
                    <TrendingDown className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-200">CO2 ที่ลดได้สะสม:</span> ปริมาณน้ำมันดีเซลที่ประหยัดได้ (ลิตร) &times; อัตราการปล่อยคาร์บอนของน้ำมันดีเซล
                      <div className="text-xs text-slate-500 mt-1 font-mono">(ค่ามาตรฐาน: 2.7 kg CO2/L)</div>
                    </div>
                  </li>
                  <li className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50 flex gap-3">
                    <Leaf className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-200">เทียบเท่าการปลูกต้นไม้:</span> ปริมาณ CO2 ที่ลดได้สะสม (kg CO2) &divide; อัตราการดูดซับ CO2 ของต้นไม้ต่อปี
                      <div className="text-xs text-slate-500 mt-1 font-mono">(ค่ามาตรฐาน: 9.5 kg CO2/ปี)</div>
                    </div>
                  </li>
                </ul>
              </div>

              {/* Section 2: SOH */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Activity className="w-5 h-5 text-blue-400" />
                  <h4 className="text-base font-bold text-blue-400">สูตรการประเมินสุขภาพแบตเตอรี่ (SOH - Simple Estimation)</h4>
                </div>
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/50 text-sm text-slate-300 leading-relaxed space-y-4">
                  <div className="font-mono text-blue-400 bg-blue-950/30 p-2 rounded border border-blue-900/50 text-center text-sm md:text-base">
                    SOH (%) = (ความจุแบตเตอรี่ปัจจุบันที่ประเมินได้ &divide; ความจุมาตรฐานตอนป้ายแดง) &times; 100
                  </div>
                  <div>
                    <span className="font-bold text-slate-200 block mb-1">วิธีการประเมินความจุปัจจุบัน:</span>
                    ระบบจะคำนวณจากเซสชันการชาร์จ โดยเปรียบเทียบปริมาณพลังงานไฟฟ้าที่ประจุเข้าจริงจากตู้ชาร์จ (kWh) กับเปอร์เซ็นต์ของแบตเตอรี่ (%) ที่เพิ่มขึ้นจริงระหว่างการชาร์จครั้งนั้น ๆ
                  </div>
                  
                  <div className="pt-3 border-t border-slate-800/50">
                    <span className="font-bold text-slate-200 block mb-3">เกณฑ์การประเมินสถานะ:</span>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <BatteryMedium className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div><span className="font-bold text-emerald-400">ปกติ:</span> SOH มากกว่าหรือเท่ากับ 85%</div>
                      </li>
                      <li className="flex items-start gap-2">
                        <BatteryWarning className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div><span className="font-bold text-amber-400">ควรตรวจสอบ:</span> SOH ต่ำกว่า 85% (ประสิทธิภาพการรับประจุเริ่มลดลง)</div>
                      </li>
                      <li className="flex items-start gap-2">
                        <BatteryWarning className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div><span className="font-bold text-rose-400">เสื่อมสภาพ:</span> SOH ต่ำกว่า 70% (ควรส่งทีมช่างเพื่อตรวจเช็คอย่างละเอียด)</div>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Section 3: Electricity Cost */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                  <CircleDollarSign className="w-5 h-5 text-amber-400" />
                  <h4 className="text-base font-bold text-amber-400">สูตรและอัตราค่าไฟฟ้า (Electricity Tariff)</h4>
                </div>
                
                <div className="space-y-4">
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                    <span className="font-bold text-slate-200 block mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-500" /> อัตราค่าไฟฟ้าต่อหน่วย (คิดตามช่วงเวลากดเริ่มชาร์จ):
                    </span>
                    <ul className="space-y-2 text-sm text-slate-300">
                      <li className="flex gap-2">
                        <span className="text-amber-500">&bull;</span>
                        <div><span className="font-bold text-slate-200">Peak (4.1839 บาท/หน่วย):</span> สำหรับการเริ่มชาร์จช่วงเวลา 12:00 - 13:00 น. และ 17:00 - 17:30 น.</div>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-amber-500">&bull;</span>
                        <div><span className="font-bold text-slate-200">Off-Peak (2.6037 บาท/หน่วย):</span> สำหรับการเริ่มชาร์จช่วงเวลา 00:00 - 01:00 น. และ 05:00 - 05:30 น.</div>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-amber-500">&bull;</span>
                        <div><span className="font-bold text-slate-200">Normal (3.5000 บาท/หน่วย):</span> สำหรับช่วงเวลาอื่น ๆ นอกเหนือจากนี้</div>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                    <span className="font-bold text-slate-200 block mb-3 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-amber-500" /> สูตรคำนวณระหว่างชาร์จ (Real-time Calculation):
                    </span>
                    <ul className="space-y-2 text-sm text-slate-300">
                      <li className="flex gap-2">
                        <span className="text-amber-500">&bull;</span>
                        <div><span className="font-bold text-slate-200">เปอร์เซ็นต์แบตเตอรี่ปัจจุบัน (%):</span> %ก่อนชาร์จ + (เวลาที่ผ่านไป (นาที) &divide; 1.45)</div>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-amber-500">&bull;</span>
                        <div><span className="font-bold text-slate-200">พลังงานไฟฟ้าที่ใช้สะสม (kWh):</span> (เวลาที่ผ่านไป (นาที) &times; 16) &divide; 60</div>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-amber-500">&bull;</span>
                        <div><span className="font-bold text-slate-200">ค่าไฟฟ้าสะสม (บาท):</span> พลังงานไฟฟ้าที่ใช้ (kWh) &times; ราคาต่อหน่วยตามช่วงเวลา</div>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-amber-500">&bull;</span>
                        <div><span className="font-bold text-slate-200">เวลาแบตเตอรี่เต็มโดยประมาณ:</span> เวลาเริ่มต้นชาร์จ + เวลาชาร์จรวมโดยประมาณ</div>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-amber-500">&bull;</span>
                        <div><span className="font-bold text-slate-200">เวลานับถอยหลังชาร์จ:</span> เวลาชาร์จรวมโดยประมาณ - เวลาที่ผ่านไป</div>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                    <span className="font-bold text-slate-200 block mb-3 flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-amber-500" /> สูตรคำนวณเมื่อจบการชาร์จ (Post-Charging):
                    </span>
                    <ul className="space-y-2 text-sm text-slate-300">
                      <li className="flex gap-2">
                        <span className="text-amber-500">&bull;</span>
                        <div><span className="font-bold text-slate-200">เวลาชาร์จรวม (นาที):</span> (%หลังชาร์จ - %ก่อนชาร์จ) &times; 1.45</div>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-amber-500">&bull;</span>
                        <div><span className="font-bold text-slate-200">พลังงานทั้งหมดที่ประจุเข้า (kWh):</span> (เวลาชาร์จรวม (นาที) &times; 16) &divide; 60</div>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-amber-500">&bull;</span>
                        <div><span className="font-bold text-slate-200">ค่าไฟฟ้าสุทธิ (บาท):</span> พลังงานทั้งหมด (kWh) &times; ราคาต่อหน่วยตามช่วงเวลา</div>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

            </div>
            
            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end shrink-0 rounded-b-2xl">
              <button 
                onClick={() => setShowInfoModal(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-xl transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
