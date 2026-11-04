import React, { useState, useEffect, useMemo } from 'react';
import { EVTruck, ChargingStation, QueueItem, SessionLog } from '../types/ev';
import { UserItem } from '../data/users';
import { BatteryCharging, Truck, Zap, ZapOff, ListOrdered, CheckCircle2, ShieldAlert, ArrowUpRight, Clock, Gauge, Coins, StopCircle, RefreshCw } from 'lucide-react';
import ChargingCountdown from './ChargingCountdown';
import { getThailandDateString } from '../utils/date';
import Swal from 'sweetalert2';

interface DashboardProps {
  trucks: EVTruck[];
  stations: ChargingStation[];
  queue: QueueItem[];
  sessions: SessionLog[];
  users?: UserItem[];
  onNavigate: (tab: string) => void;
  onStopCharging?: (stationId: string, endSOC: number, energyConsumed?: number, durationMins?: number, totalCost?: number, endOdometer?: number) => Promise<void>;
}

export default function Dashboard({ trucks, stations, queue, sessions, users, onNavigate, onStopCharging }: DashboardProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Calculations
  // Real-time active charging sessions total cost & energy (Only true active sessions)
  const activeChargingSessions = useMemo(() => {
    const list: SessionLog[] = [];
    const seenTruckIds = new Set<string>();

    for (const s of sessions) {
      if (s.status?.toLowerCase() === 'charging') {
        const tId = (s.truckId || '').trim().toUpperCase();
        if (tId && !seenTruckIds.has(tId)) {
          seenTruckIds.add(tId);
          list.push(s);
        }
      }
    }

    return list;
  }, [sessions]);

  const totalTrucks = trucks.length;
  const chargingTrucksCount = activeChargingSessions.length;
  const maintenanceTrucksCount = trucks.filter(t => t.status === 'Maintenance').length;
  const availableTrucksCount = Math.max(0, totalTrucks - chargingTrucksCount - maintenanceTrucksCount);

  // Deriving stations status strictly from active charging sessions dynamically to ensure 100% sync
  const dynamicStations = stations.map(station => {
    if (station.status === 'Maintenance') {
      return station;
    }
    const stationIdClean = station.id?.trim().toUpperCase();
    
    // Match active session by station ID or occupying truck ID
    let activeSession = sessions.find(s => 
      s.status?.toLowerCase() === 'charging' && 
      (s.stationId?.trim().toUpperCase() === stationIdClean || (station.occupyingTruckId && s.truckId?.trim().toUpperCase() === station.occupyingTruckId?.trim().toUpperCase()))
    );

    const isOccupied = Boolean(activeSession);
    const dynamicStatus = isOccupied ? 'Occupied' : 'Available';
    const dynamicOccupyingTruckId = activeSession ? activeSession.truckId : '';

    return {
      ...station,
      status: dynamicStatus as any,
      occupyingTruckId: dynamicOccupyingTruckId,
    };
  });

  const totalStations = dynamicStations.length;
  const availableStationsCount = dynamicStations.filter(s => s.status === 'Available').length;
  const occupiedStationsCount = dynamicStations.filter(s => s.status === 'Occupied').length;
  const maintenanceStationsCount = dynamicStations.filter(s => s.status === 'Maintenance').length;

  const activeQueueCount = queue.filter(q => q.status === 'Waiting').length;

  const fullyChargedOngoingSessions = activeChargingSessions.filter(s => {
    const startTime = new Date(s.startTime);
    const elapsedMinutes = isNaN(startTime.getTime()) ? 0 : Math.max(0, (currentTime.getTime() - startTime.getTime()) / 60000);
    const startSOC = s.startSOC || 0;
    const currentEstimatedSOC = startSOC + elapsedMinutes / 1.45;
    return currentEstimatedSOC >= 100;
  });
  
  const totalActiveCost = activeChargingSessions
    .reduce((sum, s) => {
      if (s.status?.toLowerCase() === 'completed') {
        return sum;
      }
      const startTime = new Date(s.startTime);
      const elapsedMinutes = isNaN(startTime.getTime()) ? 0 : Math.max(0, (currentTime.getTime() - startTime.getTime()) / 60000);
      const startSOC = s.startSOC || 0;
      const maxDurationMinutes = (100 - startSOC) * 1.45;
      
      // Freeze/Stop real-time calculation when SoC >= 100%
      const computedDuration = Math.min(elapsedMinutes, maxDurationMinutes);
      const computedEnergy = (computedDuration * 16) / 60;
      const pricePerUnit = s.pricePerUnit || 3.50;
      const estimatedCost = computedEnergy * pricePerUnit;
      return sum + estimatedCost;
    }, 0);

  const totalActiveEnergy = activeChargingSessions
    .reduce((sum, s) => {
      if (s.status?.toLowerCase() === 'completed') {
        return sum;
      }
      const startTime = new Date(s.startTime);
      const elapsedMinutes = isNaN(startTime.getTime()) ? 0 : Math.max(0, (currentTime.getTime() - startTime.getTime()) / 60000);
      const startSOC = s.startSOC || 0;
      const maxDurationMinutes = (100 - startSOC) * 1.45;
      
      // Freeze/Stop real-time calculation when SoC >= 100%
      const computedDuration = Math.min(elapsedMinutes, maxDurationMinutes);
      const computedEnergy = (computedDuration * 16) / 60;
      return sum + computedEnergy;
    }, 0);

  // Get today's local date string in YYYY-MM-DD in Asia/Bangkok timezone
  const todayDateStr = getThailandDateString();

  // Today's sessions: filter sessions that started today (in Bangkok timezone)
  const todaySessions = sessions.filter(s => {
    if (!s.startTime) return false;
    const d = new Date(s.startTime);
    if (isNaN(d.getTime())) return false;
    const dStr = getThailandDateString(d);
    return dStr === todayDateStr;
  });

  // Total energy consumed today (sum of completed sessions energy + rough ongoing session energy)
  const totalEnergyToday = todaySessions
    .filter(s => s.status === 'Completed')
    .reduce((sum, s) => sum + (s.energyConsumed || 0), 0);

  const averageDuration = sessions.filter(s => s.status === 'Completed').length > 0
    ? sessions
        .filter(s => s.status === 'Completed')
        .reduce((sum, s) => sum + (s.duration || 0), 0) /
      sessions.filter(s => s.status === 'Completed').length
    : 0;

  const handleStopChargingFromDashboard = async (session: SessionLog) => {
    if (!onStopCharging) return;

    const truck = trucks.find(t => t.id === session.truckId);
    const startSOC = session.startSOC || 0;
    const startTime = new Date(session.startTime);
    const elapsedMinutes = isNaN(startTime.getTime()) ? 0 : Math.max(0, (new Date().getTime() - startTime.getTime()) / 60000);
    const estimatedSOC = Math.min(100, Math.round(startSOC + elapsedMinutes / 1.45));

    const { value: formValues } = await Swal.fire({
      title: `⚡ หยุดชาร์จรถ ${session.truckId}`,
      html: `
        <div class="text-left text-xs text-slate-300 space-y-3 font-mono">
          <p>ตู้ชาร์จ: <strong class="text-emerald-400">${session.stationId}</strong></p>
          <p>ผู้ขับขี่: <strong class="text-white">${session.operatorName || 'ไม่ระบุ'}</strong></p>
          <div class="p-2 bg-rose-500/10 border border-rose-500/20 rounded text-[11px] text-rose-300 font-sans">
            🔒 ต้องใช้รหัสพนักงาน 8 หลักของผู้ชาร์จ (คุณ ${session.operatorName || 'ผู้ชาร์จ'}) เท่านั้น ไม่อนุญาตให้ Admin หรือผู้ดูแลปลดแทน
          </div>
          <div>
            <label class="block text-slate-400 font-bold mb-1">รหัสพนักงาน 8 หลักของผู้ชาร์จ:</label>
            <input id="swal-driver-pin" type="password" maxlength="8" placeholder="กรอกรหัสพนักงาน 8 หลัก" class="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded text-sm font-mono focus:outline-none focus:border-rose-500" />
          </div>
          <div>
            <label class="block text-slate-400 font-bold mb-1">เปอร์เซ็นต์แบตเตอรี่สิ้นสุด (End SOC %):</label>
            <input id="swal-end-soc" type="number" min="0" max="100" value="${estimatedSOC}" class="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded text-sm font-mono focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label class="block text-slate-400 font-bold mb-1">เลขไมล์ล่าสุด (กม.):</label>
            <input id="swal-odometer" type="number" min="${truck?.currentOdometer || session.odometer || 0}" value="${truck?.currentOdometer || session.odometer || 0}" class="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded text-sm font-mono focus:outline-none focus:border-emerald-500" />
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'ยืนยันหยุดชาร์จ & บันทึก',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#475569',
      background: '#0f172a',
      color: '#f8fafc',
      preConfirm: () => {
        const pinVal = ((document.getElementById('swal-driver-pin') as HTMLInputElement)?.value || '').trim();
        const socVal = parseInt((document.getElementById('swal-end-soc') as HTMLInputElement)?.value || `${estimatedSOC}`);
        const odoVal = parseFloat((document.getElementById('swal-odometer') as HTMLInputElement)?.value || '0');

        if (!pinVal || pinVal.length !== 8 || !/^\d+$/.test(pinVal)) {
          Swal.showValidationMessage('กรุณากรอกรหัสพนักงาน 8 หลักของผู้ชาร์จให้ถูกต้อง');
          return false;
        }

        const driverName = String(session.operatorName || '').trim();
        const userList = users || [];
        const enteringUser = userList.find(u => String(u.employeeId).trim() === pinVal);
        const matchedUser = userList.find(u => String(u.name).trim() === driverName);

        const isAdminOrSupervisor = enteringUser && (enteringUser.role === 'Admin' || enteringUser.role === 'Supervisor');
        const isMasterAdminPin = pinVal === '685400' || pinVal === '99999999' || pinVal === '55019283';

        // Strict Rule: Admin / Supervisor / Master Admin CANNOT stop charging on behalf of another driver
        if (isAdminOrSupervisor || isMasterAdminPin) {
          const isSelfDriver = matchedUser 
            ? String(matchedUser.employeeId).trim() === pinVal
            : (enteringUser && (enteringUser.name.trim() === driverName || enteringUser.employeeId.trim() === driverName));

          if (!isSelfDriver) {
            Swal.showValidationMessage(`ไม่อนุญาตให้ Admin หรือผู้ดูแล ปลดการชาร์จแทนผู้ชาร์จในทุกกรณี ต้องใช้รหัสพนักงาน 8 หลักของผู้ชาร์จ (คุณ ${session.operatorName || 'ผู้ชาร์จ'}) เท่านั้น`);
            return false;
          }
        }

        const isCorrectDriver = matchedUser 
          ? String(matchedUser.employeeId).trim() === pinVal
          : (enteringUser && (enteringUser.name.trim() === driverName || enteringUser.employeeId.trim() === driverName));

        if (!isCorrectDriver) {
          Swal.showValidationMessage(`รหัสพนักงานไม่ถูกต้องสำหรับหยุดการชาร์จของคุณ ${session.operatorName || 'ผู้ชาร์จ'}`);
          return false;
        }

        if (isNaN(socVal) || socVal < 0 || socVal > 100) {
          Swal.showValidationMessage('กรุณาระบุเปอร์เซ็นต์แบตเตอรี่ 0 - 100%');
          return false;
        }
        return { endSOC: socVal, odometer: odoVal };
      }
    });

    if (formValues) {
      try {
        Swal.fire({
          title: 'กำลังบันทึกข้อมูล...',
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
          background: '#0f172a',
          color: '#f8fafc',
        });

        await onStopCharging(session.stationId || session.truckId, formValues.endSOC, undefined, undefined, undefined, formValues.odometer);

        Swal.fire({
          title: 'สำเร็จ!',
          text: `หยุดชาร์จรถ ${session.truckId} สำเร็จ`,
          icon: 'success',
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#10b981',
        });
      } catch (err: any) {
        Swal.fire({
          title: 'เกิดข้อผิดพลาด',
          text: err.message || 'ไม่สามารถหยุดชาร์จได้',
          icon: 'error',
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#ef4444',
        });
      }
    }
  };

  // Prepare chart data (Group energy by station today)
  const stationEnergyData = stations.map(station => {
    const stationSessionsToday = todaySessions.filter(s => s.stationId === station.id && s.status === 'Completed');
    const totalEnergy = stationSessionsToday.reduce((sum, s) => sum + (s.energyConsumed || 0), 0);
    return {
      name: station.id,
      label: station.name.split(' - ')[0],
      energy: totalEnergy,
      sessionsCount: stationSessionsToday.length
    };
  });

  const maxEnergy = Math.max(...stationEnergyData.map(d => d.energy), 50);

  // Group today's sessions by truckId and count charging frequency (sessions)
  const truckSessionsData = useMemo(() => {
    const truckMap: Record<string, { count: number; stations: Record<string, number>; totalEnergy: number }> = {};
    
    todaySessions.forEach(s => {
      const tId = s.truckId;
      if (!tId) return;
      if (!truckMap[tId]) {
        truckMap[tId] = {
          count: 0,
          stations: {},
          totalEnergy: 0
        };
      }
      truckMap[tId].count += 1;
      if (s.stationId) {
        truckMap[tId].stations[s.stationId] = (truckMap[tId].stations[s.stationId] || 0) + 1;
      }
      if (s.energyConsumed) {
        truckMap[tId].totalEnergy += s.energyConsumed;
      }
    });

    const data = Object.entries(truckMap).map(([truckId, info]) => {
      const matchingTruck = trucks.find(t => t.id === truckId);
      const label = matchingTruck ? `${truckId} (${matchingTruck.licensePlate})` : truckId;
      
      return {
        truckId,
        label,
        count: info.count,
        totalEnergy: info.totalEnergy,
        stationsList: Object.entries(info.stations).map(([stationId, count]) => ({
          stationId,
          count
        })).sort((a, b) => b.count - a.count)
      };
    });

    // Sort by session count descending, then by truckId ascending
    return data.sort((a, b) => b.count - a.count || a.truckId.localeCompare(b.truckId));
  }, [todaySessions, trucks]);

  const maxTruckSessions = Math.max(...truckSessionsData.map(d => d.count), 5);

  return (
    <div className="space-y-3 md:space-y-4">
      {/* 4 KPI Metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
        {/* Metric 1 */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-2.5 md:p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-0.5 md:space-y-1 min-w-0">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block truncate">รถหัวลากทั้งหมด</span>
            <h3 className="text-base md:text-2xl font-black text-white font-mono">{totalTrucks} <span className="text-[10px] md:text-xs font-semibold text-slate-400">คัน</span></h3>
            <div className="flex items-center gap-1 text-[10px] md:text-[11px] truncate">
              <span className="text-emerald-400 font-semibold">{availableTrucksCount} ว่าง</span>
              <span className="text-slate-700">•</span>
              <span className="text-amber-400">{maintenanceTrucksCount} ซ่อม</span>
            </div>
          </div>
          <div className="p-2 md:p-2.5 bg-slate-950 text-slate-400 border border-slate-800 rounded-lg shrink-0">
            <Truck className="w-4 h-4 md:w-5 md:h-5 text-emerald-500" />
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-2.5 md:p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-0.5 md:space-y-1 min-w-0">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block truncate">กำลังชาร์จขณะนี้</span>
            <h3 className="text-base md:text-2xl font-black text-white font-mono">{chargingTrucksCount} <span className="text-[10px] md:text-xs font-semibold text-slate-400">คัน</span></h3>
            <div className="flex items-center gap-1 text-[10px] md:text-[11px] text-slate-400 font-mono truncate">
              <span>ใช้งาน {occupiedStationsCount}/{totalStations} ตู้</span>
            </div>
          </div>
          <div className="p-2 md:p-2.5 bg-slate-950 text-slate-400 border border-slate-800 rounded-lg animate-pulse shrink-0">
            <BatteryCharging className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-2.5 md:p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-0.5 md:space-y-1 min-w-0">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block truncate">หัวชาร์จที่ว่าง</span>
            <h3 className="text-base md:text-2xl font-black text-white font-mono">{availableStationsCount} <span className="text-[10px] md:text-xs font-semibold text-slate-400">/ {totalStations} ช่อง</span></h3>
            <div className="flex items-center gap-1 text-[10px] md:text-[11px] truncate">
              <span className="text-emerald-400 font-semibold">พร้อมชาร์จด่วน</span>
            </div>
          </div>
          <div className="p-2 md:p-2.5 bg-slate-950 text-slate-400 border border-slate-800 rounded-lg shrink-0">
            <Zap className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-2.5 md:p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-0.5 md:space-y-1 min-w-0">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block truncate">ค่าชาร์จเรียลไทม์</span>
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
              <h3 className="text-base md:text-2xl font-black text-amber-400 font-mono">฿{totalActiveCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            </div>
            <div className="flex items-center gap-1 text-[10px] md:text-[11px] text-emerald-400 font-mono truncate">
              <span>{totalActiveEnergy.toFixed(1)} kWh ({activeChargingSessions.length} คัน)</span>
            </div>
          </div>
          <div className="p-2 md:p-2.5 bg-slate-950 text-slate-400 border border-slate-800 rounded-lg animate-pulse shrink-0">
            <Coins className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
          </div>
        </div>
      </div>

      {/* Active In-Progress Charging Section if any */}
      {activeChargingSessions.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-500/40 rounded-xl p-3 md:p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-amber-500/20 pb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
              <h2 className="text-xs md:text-sm font-bold text-amber-300 uppercase tracking-wider font-mono truncate">
                ⚡ รถที่กำลังชาร์จขณะนี้ ({activeChargingSessions.length} คัน)
              </h2>
            </div>
            <span className="text-[9px] font-mono font-bold bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30 shrink-0">
              LIVE
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeChargingSessions.map((session, sIdx) => {
              const truck = trucks.find(t => t.id === session.truckId || t.id?.toLowerCase() === session.truckId?.toLowerCase());
              const station = stations.find(st => st.id === session.stationId || st.occupyingTruckId === session.truckId);
              const startT = new Date(session.startTime);
              const elapsedMins = isNaN(startT.getTime()) ? 0 : Math.max(0, Math.round((currentTime.getTime() - startT.getTime()) / 60000));
              const currentSOC = Math.min(100, Math.round((session.startSOC || 20) + elapsedMins / 1.45));
              const currentEnergy = Math.round(((elapsedMins * 16) / 60) * 100) / 100;
              const currentCost = Math.round((currentEnergy * (session.pricePerUnit || 3.50)) * 100) / 100;

              return (
                <div key={`${session.id}-${sIdx}`} className="bg-slate-900 border border-amber-500/30 rounded-lg p-3.5 space-y-3 shadow">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-amber-400 font-mono">{session.truckId}</span>
                        {truck?.licensePlate && (
                          <span className="text-[10px] text-slate-400 font-mono">({truck.licensePlate})</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 font-mono">
                        <span>ตู้: <strong className="text-emerald-400">{session.stationId || station?.id || 'CS-01'}</strong></span>
                        <span className="text-slate-600">|</span>
                        <span>ผู้ขับ: <strong className="text-slate-300">{session.operatorName || 'ไม่ระบุ'}</strong></span>
                      </div>
                    </div>
                    <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded font-bold font-mono animate-pulse">
                      CHARGING
                    </span>
                  </div>

                  {/* Countdown / Gauge */}
                  <ChargingCountdown startTimeStr={session.startTime} startSOC={session.startSOC || 20} staticSOC={truck?.currentSOC} />

                  <div className="grid grid-cols-3 gap-1 bg-slate-950 p-2 rounded border border-slate-800 text-[10px] font-mono text-center">
                    <div>
                      <span className="text-slate-500 block text-[9px]">เวลา</span>
                      <span className="text-slate-200 font-bold">{elapsedMins} นาที</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">พลังงาน</span>
                      <span className="text-emerald-400 font-bold">{currentEnergy} kWh</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">ค่าไฟ</span>
                      <span className="text-amber-400 font-bold">฿{currentCost}</span>
                    </div>
                  </div>

                  {currentSOC >= 100 ? (
                    <div className="w-full py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-xs rounded flex items-center justify-center gap-1.5 font-mono animate-pulse">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>ชาร์จเต็ม 100% (ระบบ Auto-Complete)</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleStopChargingFromDashboard(session)}
                      className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded transition-all flex items-center justify-center gap-1.5 shadow"
                      title="หยุดชาร์จและบันทึกข้อมูล"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>หยุดชาร์จทันที (Stop Charging)</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Section Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-6">
        {/* Left 2 cols: Stations status & Charts */}
        <div className="lg:col-span-2 space-y-3 md:space-y-6">
          {/* Active Stations Cards */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-3 md:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div>
                <h2 className="text-xs md:text-sm font-bold text-white uppercase tracking-wider">สถานะตู้ชาร์จในโรงงาน (LIVE BAYS)</h2>
                <p className="hidden sm:block text-[11px] text-slate-500 mt-0.5 font-mono">Real-time status tracking of all charging bays</p>
              </div>
              <button
                onClick={() => onNavigate('stations')}
                className="text-[11px] md:text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono"
              >
                จัดการตู้ชาร์จ <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 md:gap-4">
              {dynamicStations.map((station, index) => {
                const occupyingTruck = trucks.find(t => t.id === station.occupyingTruckId);
                const ongoingSession = sessions.find(s => s.stationId === station.id && s.status === 'Charging');

                return (
                  <div key={`${station.id}-${index}`} className="border border-slate-800 rounded-lg p-2.5 md:p-3 bg-slate-950 flex flex-col justify-between space-y-2.5 md:space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex sm:block items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-emerald-400 sm:text-slate-500 uppercase tracking-wider">{station.id}</span>
                        <h4 className="text-xs font-bold text-slate-200 line-clamp-1">{station.name.split(' - ')[0]}</h4>
                        <span className="text-[9px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800 font-semibold sm:mt-1 inline-block font-mono">
                          {station.chargerType}
                        </span>
                      </div>
                      <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${
                        station.status === 'Available' ? 'bg-emerald-500' :
                        station.status === 'Occupied' ? 'bg-amber-500 animate-pulse' : 'bg-slate-600'
                      }`} />
                    </div>

                    {station.status === 'Occupied' && occupyingTruck ? (
                      <div className="space-y-2 md:space-y-3 bg-slate-900 p-2 md:p-2.5 rounded border border-slate-800">
                        <div className="flex items-center justify-between text-[11px] text-slate-300">
                          <span className="flex items-center gap-1">
                            <Truck className="w-3 h-3 text-slate-500" />
                            <strong className="text-emerald-400 font-mono">{occupyingTruck.id}</strong>
                          </span>
                          <span className="font-bold text-amber-400 animate-pulse flex items-center gap-0.5 font-mono">
                            <Zap className="w-3 h-3 text-amber-500" />
                            {station.powerOutput}kW
                          </span>
                        </div>

                        {ongoingSession?.operatorName && (
                          <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-800/60 text-[11px] text-slate-300">
                            <span className="text-slate-500 text-[9px] uppercase font-mono font-bold">ผู้ขับ:</span>
                            <span className="font-semibold text-slate-200 truncate">{ongoingSession.operatorName}</span>
                          </div>
                        )}

                        {/* SOC visual progress */}
                        {ongoingSession ? (
                          <ChargingCountdown startTimeStr={ongoingSession.startTime} startSOC={ongoingSession.startSOC} staticSOC={occupyingTruck.currentSOC} />
                        ) : (
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-end">
                              <span className="text-[10px] font-bold text-slate-500 font-mono">CAP: {occupyingTruck.batteryCapacity}kWh</span>
                              <span className="font-bold text-slate-300 text-xs font-mono">{occupyingTruck.currentSOC}% SOC</span>
                            </div>
                            <div className="flex items-center w-full">
                              <div className="relative flex-1 h-5 bg-slate-950 border-2 border-slate-700 rounded-md p-0.5 overflow-hidden shadow-inner">
                                <div
                                  className="h-full bg-amber-500 rounded-sm transition-all duration-1000 ease-linear"
                                  style={{ width: `${occupyingTruck.currentSOC}%` }}
                                />
                              </div>
                              <div className="w-1.5 h-2.5 bg-slate-600 rounded-r-sm border-y-2 border-r-2 border-slate-700"></div>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono">
                          <Clock className="w-3 h-3 text-slate-600" />
                          <span>เริ่ม: {ongoingSession ? new Date(ongoingSession.startTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) : '-'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-2 sm:py-5 border border-dashed border-slate-800 rounded bg-slate-950/50 text-slate-600 text-[10px] sm:text-[11px] flex sm:flex-col items-center justify-center gap-1.5 font-mono">
                        {station.status === 'Maintenance' ? (
                          <>
                            <ShieldAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600" />
                            <span className="font-bold text-slate-500 tracking-wider">ปิดซ่อมบำรุง</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500/60" />
                            <span className="text-emerald-400/90 font-bold tracking-wider">ว่าง • พร้อมชาร์จ</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* SVG Analytical Charts */}
          <div className="flex flex-col gap-3 md:gap-4">
            {/* Chart 1: Energy cumulative today */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-3 md:p-5 shadow-sm">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-1 font-mono">ปริมาณพลังงานไฟฟ้าที่จ่ายแยกตามตู้วันนี้ (kWh)</h2>
              <p className="hidden sm:block text-[10px] text-slate-500 mb-4 font-mono">Daily cumulative energy dispensed per charging bay</p>

              <div className="h-48 md:h-64 flex items-end justify-between px-3 md:px-6 pt-4 border-b border-l border-slate-800 relative bg-slate-950/40 rounded-lg p-2.5 md:p-3 mt-2 sm:mt-0">
                {/* Background Guideline values */}
                <div className="absolute left-0 right-0 top-0 h-full flex flex-col justify-between pointer-events-none pr-3 text-[9px] font-mono text-slate-700">
                  <div className="border-t border-dashed border-slate-800 w-full pt-1 text-right">MAX ({Math.round(maxEnergy)} kWh)</div>
                  <div className="border-t border-dashed border-slate-800 w-full pt-1 text-right">{Math.round(maxEnergy / 2)} kWh</div>
                  <div className="w-full text-right pb-1">0 kWh</div>
                </div>

                {/* Bars representing stations */}
                {stationEnergyData.map((data, idx) => {
                  const heightPercent = maxEnergy > 0 ? (data.energy / maxEnergy) * 80 : 0; // max 80% to keep some safety padding

                  return (
                    <div key={`${data.name}-${idx}`} className="flex flex-col items-center flex-1 group z-10">
                      {/* Tooltip on hover */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-slate-950 text-slate-200 text-[10px] rounded px-2.5 py-1.5 absolute mb-20 -translate-y-6 border border-slate-800 shadow-lg text-center pointer-events-none font-mono z-30">
                        <p className="font-bold text-emerald-400">{data.energy.toLocaleString()} kWh</p>
                        <p className="opacity-75">{data.sessionsCount} รอบชาร์จ</p>
                      </div>

                      {/* Bar */}
                      <div className="w-12 bg-slate-900/80 rounded-t border border-slate-800 relative" style={{ height: '140px' }}>
                        {/* Dynamic Value Label above the filled green bar */}
                        <div 
                          className="absolute left-1/2 -translate-x-1/2 text-center text-[9px] font-black text-emerald-400 font-mono z-20 transition-all duration-1000 whitespace-nowrap bg-slate-950/80 px-1 py-0.5 rounded border border-slate-800/60"
                          style={{ bottom: `calc(${heightPercent}% + 4px)` }}
                        >
                          {data.energy.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </div>

                        <div
                          className="bg-emerald-500 w-full rounded-t transition-all duration-1000 absolute bottom-0"
                          style={{ height: `${heightPercent}%` }}
                        />
                      </div>

                      <span className="text-[10px] font-bold text-slate-300 mt-2 line-clamp-1">{data.label}</span>
                      <span className="text-[9px] text-slate-500 font-mono font-medium">{data.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chart 2: Trucks count today */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-3 md:p-5 shadow-sm">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-1 font-mono">ปริมาณการชาร์จแยกตามรถหัวลากวันนี้ (ครั้ง)</h2>
              <p className="hidden sm:block text-[10px] text-slate-500 mb-4 font-mono">Charging frequency per EV truck today</p>

              <div className="h-48 md:h-64 flex items-end justify-between px-3 md:px-6 pt-4 border-b border-l border-slate-800 relative bg-slate-950/40 rounded-lg p-2.5 md:p-3 overflow-x-auto mt-2 sm:mt-0">
                {/* Background Guideline values */}
                <div className="absolute left-0 right-0 top-0 h-full flex flex-col justify-between pointer-events-none pr-3 text-[9px] font-mono text-slate-700">
                  <div className="border-t border-dashed border-slate-800 w-full pt-1 text-right">MAX ({maxTruckSessions} ครั้ง)</div>
                  <div className="border-t border-dashed border-slate-800 w-full pt-1 text-right">{Math.round(maxTruckSessions / 2)} ครั้ง</div>
                  <div className="w-full text-right pb-1">0 ครั้ง</div>
                </div>

                {truckSessionsData.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                    <ZapOff className="w-8 h-8 text-slate-700 mb-2 animate-pulse" />
                    <p className="text-xs text-slate-500 font-mono text-center">ไม่มีประวัติการชาร์จของหัวลากในวันนี้</p>
                  </div>
                ) : (
                  <div className="flex items-end justify-around w-full min-w-[280px] h-full z-10 gap-1 md:gap-3">
                    {truckSessionsData.map((data, idx) => {
                      const heightPercent = maxTruckSessions > 0 ? (data.count / maxTruckSessions) * 80 : 0;

                      return (
                        <div key={`${data.truckId}-${idx}`} className="flex flex-col items-center flex-1 min-w-[44px] max-w-[80px] group z-10">
                          {/* Tooltip on hover */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-slate-950 text-slate-200 text-[10px] rounded px-3 py-2 absolute mb-20 -translate-y-6 border border-slate-800 shadow-lg text-center pointer-events-none font-mono z-30 w-44">
                            <p className="font-bold text-indigo-400 border-b border-slate-800 pb-1 mb-1">{data.truckId}</p>
                            <p className="text-[9px] text-slate-300 font-bold mb-1">ชาร์จรวม: {data.count} ครั้ง</p>
                            <p className="text-[9px] text-emerald-400 font-bold mb-1">พลังงาน: {data.totalEnergy.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh</p>
                            {data.stationsList.length > 0 && (
                              <div className="border-t border-slate-800/60 pt-1 mt-1">
                                <p className="text-[8px] text-slate-500 mb-0.5 text-left uppercase">จุดชาร์จที่ใช้งาน:</p>
                                {data.stationsList.map((st, sIdx) => (
                                  <div key={sIdx} className="flex justify-between text-[8px] text-slate-400">
                                    <span>{st.stationId}:</span>
                                    <span>{st.count} ครั้ง</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Bar */}
                          <div className="w-8 md:w-10 bg-slate-900/80 rounded-t border border-slate-800 relative" style={{ height: '140px' }}>
                            {/* Dynamic Value Label above the filled indigo bar */}
                            <div 
                              className="absolute left-1/2 -translate-x-1/2 text-center text-[9px] font-black text-indigo-400 font-mono z-20 transition-all duration-1000 whitespace-nowrap bg-slate-950/80 px-1 py-0.5 rounded border border-slate-800/60"
                              style={{ bottom: `calc(${heightPercent}% + 4px)` }}
                            >
                              {data.count} ครั้ง
                            </div>

                            <div
                              className="bg-indigo-500 w-full rounded-t transition-all duration-1000 absolute bottom-0"
                              style={{ height: `${heightPercent}%` }}
                            />
                          </div>

                          <span className="text-[9px] font-bold text-slate-300 mt-2 line-clamp-1 text-center w-full truncate" title={data.label}>{data.truckId}</span>
                          <span className="text-[8px] text-slate-500 font-mono font-semibold text-center truncate w-full">
                            {trucks.find(t => t.id === data.truckId)?.licensePlate || 'N/A'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 col: Queue & Today KPIs */}
        <div className="space-y-4">
          {/* Queue Board Widget */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-3 md:p-5 shadow-sm flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <div>
                  <h2 className="text-xs md:text-sm font-bold text-white uppercase tracking-wider">กิจกรรมล่าสุด 10 รายการ</h2>
                  <p className="hidden sm:block text-[11px] text-slate-500 mt-0.5 font-mono">Real-time charging transactions (10 latest)</p>
                </div>
                <button
                  onClick={() => onNavigate('sessions')}
                  className="text-[11px] md:text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono"
                >
                  ดูประวัติ <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2 pr-0.5">
                {(() => {
                  const latestSessions10 = [...sessions]
                    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
                    .slice(0, 10);

                  return latestSessions10.length > 0 ? (
                    latestSessions10.map((s, idx) => {
                      const station = stations.find(st => st.id === s.stationId);
                      const isCharging = s.status === 'Charging';

                      return (
                        <div key={`${s.id}-${idx}`} className="p-2.5 border border-slate-800 rounded-lg bg-slate-950 hover:bg-slate-900 transition-all flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs font-mono text-emerald-400 flex items-center gap-1">
                                {s.truckId}
                                {isCharging && <span className="text-amber-400 animate-pulse">⚡</span>}
                              </span>
                              <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 font-mono px-1.5 py-0.5 rounded font-bold">
                                {station?.id || s.stationId}
                              </span>
                            </div>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                              isCharging
                                ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400 animate-pulse'
                                : s.isAutoCompleted || s.endSOC >= 100
                                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                            }`}>
                              {isCharging ? (
                                <>
                                  <Zap className="w-2.5 h-2.5" />
                                  กำลังชาร์จ
                                </>
                              ) : s.isAutoCompleted || s.endSOC >= 100 ? (
                                <>
                                  <Zap className="w-2.5 h-2.5 text-emerald-400" />
                                  AUTO 100%
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                  เสร็จสิ้น
                                </>
                              )}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span className="font-medium text-slate-300 truncate">{s.operatorName || 'ไม่ระบุผู้ขับขี่'}</span>
                            <span className="text-[10px] font-mono text-slate-500 shrink-0">
                              {new Date(s.startTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}
                              {!isCharging && s.endTime && ` - ${new Date(s.endTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}`}
                            </span>
                          </div>

                          <div className="border-t border-slate-900/60 pt-1 flex items-center justify-between text-[10px] font-mono text-slate-500">
                            <span>{s.startSOC}% → {isCharging ? '...' : `${s.endSOC}%`}</span>
                            <div className="text-right">
                              {isCharging ? (
                                <span className="text-amber-400 font-bold">
                                  เริ่มชาร์จ {s.startSOC}%
                                </span>
                              ) : (
                                <span className="text-emerald-400 font-bold">
                                  +{(s.energyConsumed || 0).toFixed(1)} kWh
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-10 text-slate-500 text-xs flex flex-col items-center gap-2 font-mono">
                      <CheckCircle2 className="w-7 h-7 text-emerald-500/60" />
                      <span className="font-bold uppercase tracking-wider">NO_SESSIONS_RECORDED</span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* General Information widget below queue */}
            <div className="mt-6 border-t border-slate-800 pt-4 space-y-3">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">PERFORMANCE SUMMARY</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                  <div className="flex items-center gap-1 text-slate-500 mb-1">
                    <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[9px] font-bold uppercase tracking-wider font-mono">TOTAL_ENERGY</span>
                  </div>
                  <span className="text-sm font-bold text-slate-200 font-mono">{totalEnergyToday.toLocaleString()}</span>
                  <span className="text-[9px] text-slate-500 font-mono ml-1">kWh</span>
                </div>

                <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                  <div className="flex items-center gap-1 text-slate-500 mb-1">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[9px] font-bold uppercase tracking-wider font-mono">AVG_DURATION</span>
                  </div>
                  <span className="text-sm font-bold text-slate-200 font-mono">{averageDuration}</span>
                  <span className="text-[9px] text-slate-500 font-mono ml-1">MINS</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
