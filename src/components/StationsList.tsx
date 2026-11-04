import React, { useState } from 'react';
import { EVTruck, ChargingStation, QueueItem, SessionLog } from '../types/ev';
import { UserItem } from '../data/users';
import { Zap, Play, Square, Settings, ShieldAlert, RefreshCw, Truck, ArrowRight, UserCheck, Plus, Edit2, Trash2, X } from 'lucide-react';
import Swal from 'sweetalert2';
import { getThailandISOString } from '../utils/date';
import ChargingCountdown from './ChargingCountdown';

interface StationsListProps {
  stations: ChargingStation[];
  trucks: EVTruck[];
  queue: QueueItem[];
  sessions: SessionLog[];
  users?: UserItem[];
  onStartCharging: (stationId: string, truckId: string, operatorName: string) => Promise<void>;
  onStopCharging: (stationId: string, endSOC: number) => Promise<void>;
  onToggleMaintenance: (stationId: string, currentStatus: 'Available' | 'Maintenance') => Promise<void>;
  onAddStation: (station: ChargingStation) => Promise<void>;
  onUpdateStation: (station: ChargingStation) => Promise<void>;
  user: any;
  onDeleteStation: (id: string) => Promise<void>;
}

export default function StationsList({
  stations,
  trucks,
  queue,
  sessions,
  users,
  onStartCharging,
  onStopCharging,
  onToggleMaintenance,
  onAddStation,
  onUpdateStation,
  onDeleteStation,
  user
}: StationsListProps) {
  const [activeStationId, setActiveStationId] = useState<string | null>(null);
  const [selectedTruckId, setSelectedTruckId] = useState('');
  const [operatorName, setOperatorName] = useState('สมชาย แข็งขัน');
  const [targetSOC, setTargetSOC] = useState(100);
  const [stopDriverEmpIdInput, setStopDriverEmpIdInput] = useState('');
  const [actionType, setActionType] = useState<'start' | 'stop' | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // New Station Form State
  const [isStationModalOpen, setIsStationModalOpen] = useState(false);
  const [editingStation, setEditingStation] = useState<ChargingStation | null>(null);
  const [stationIdInput, setStationIdInput] = useState('');
  const [stationNameInput, setStationNameInput] = useState('');
  const [chargerTypeInput, setChargerTypeInput] = useState<'AC 22kW' | 'DC 120kW' | 'DC 150kW Fast'>('DC 150kW Fast');
  const [powerOutputInput, setPowerOutputInput] = useState(150);

  // Available trucks to select (either they are 'Available' status and not charging, or from the Queue)
  const availableTrucksForCharging = trucks.filter(
    t => t.status === 'Available'
  );

  const openActionModal = (stationId: string, action: 'start' | 'stop') => {
    setActiveStationId(stationId);
    setActionType(action);
    if (action === 'start') {
      const waitingInQueue = queue.find(q => q.status === 'Waiting');
      setSelectedTruckId(waitingInQueue?.truckId || availableTrucksForCharging[0]?.id || '');
    } else {
      const station = stations.find(s => s.id === stationId);
      const activeSession = sessions.find(s => s.stationId === stationId && s.status === 'Charging');
      if (activeSession) {
        const startTime = new Date(activeSession.startTime);
        const now = new Date();
        const elapsedMinutes = Math.max(0, (now.getTime() - startTime.getTime()) / 60000);
        let currentEstimatedSOC = activeSession.startSOC + elapsedMinutes / 1.45;
        if (currentEstimatedSOC > 100) currentEstimatedSOC = 100;
        setTargetSOC(Math.round(currentEstimatedSOC));
      } else {
        setTargetSOC(100);
      }
    }
  };

  const closeActionModal = () => {
    setActiveStationId(null);
    setActionType(null);
    setSelectedTruckId('');
    setStopDriverEmpIdInput('');
  };

  const openStationModal = (station?: ChargingStation) => {
    if (station) {
      setEditingStation(station);
      setStationIdInput(station.id);
      setStationNameInput(station.name);
      setChargerTypeInput(station.chargerType);
      setPowerOutputInput(station.powerOutput);
    } else {
      setEditingStation(null);
      const existingIds = stations.map(s => s.id);
      let prefix = 'CS-';
      let nextNum = 1;
      
      if (existingIds.length > 0) {
        const sampleId = existingIds[0];
        const match = sampleId.match(/^([A-Za-z\-]+)(\d+)/);
        if (match) {
          prefix = match[1];
          const nums = existingIds.map(id => {
            const m = id.match(/^([A-Za-z\-]+)(\d+)/);
            return m ? parseInt(m[2], 10) : 0;
          });
          nextNum = Math.max(...nums) + 1;
        }
      }
      
      const paddedNum = String(nextNum).padStart(2, '0');
      setStationIdInput(`${prefix}${paddedNum}`);
      setStationNameInput(`EV-CH ${paddedNum}`);
      setChargerTypeInput('DC 150kW Fast');
      setPowerOutputInput(150);
    }
    setIsStationModalOpen(true);
  };

  const closeStationModal = () => {
    setIsStationModalOpen(false);
    setEditingStation(null);
  };

  const handleStationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stationIdInput.trim() || !stationNameInput.trim()) {
      Swal.fire({
        title: 'คำเตือน',
        text: 'กรุณากรอกข้อมูลให้ครบถ้วน',
        icon: 'warning',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#eab308',
      });
      return;
    }

    setIsLoading(true);
    try {
      const stationData: ChargingStation = {
        id: stationIdInput.trim(),
        name: stationNameInput.trim(),
        chargerType: chargerTypeInput,
        powerOutput: powerOutputInput,
        status: editingStation ? editingStation.status : 'Available',
        occupyingTruckId: editingStation ? editingStation.occupyingTruckId : '',
        lastUpdated: new Date().toISOString()
      };

      if (editingStation) {
        await onUpdateStation(stationData);
        Swal.fire({
          title: 'สำเร็จ!',
          text: 'แก้ไขข้อมูลตู้ชาร์จสำเร็จ',
          icon: 'success',
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#10b981',
        });
      } else {
        if (stations.some(s => s.id === stationData.id)) {
          Swal.fire({
            title: 'เกิดข้อผิดพลาด',
            text: 'รหัสตู้ชาร์จนี้มีอยู่แล้วในระบบ',
            icon: 'error',
            background: '#0f172a',
            color: '#f8fafc',
            confirmButtonColor: '#ef4444',
          });
          setIsLoading(false);
          return;
        }
        await onAddStation(stationData);
        Swal.fire({
          title: 'สำเร็จ!',
          text: 'เพิ่มตู้ชาร์จใหม่สำเร็จ',
          icon: 'success',
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#10b981',
        });
      }
      closeStationModal();
    } catch (err: any) {
      Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: `ไม่สามารถบันทึกข้อมูลตู้ชาร์จได้: ${err.message}`,
        icon: 'error',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#ef4444',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteStationClick = async (stationId: string) => {
    const station = stations.find(s => s.id === stationId);
    if (!station) return;
    if (station.status === 'Occupied') {
      Swal.fire({
        title: 'คำเตือน',
        text: 'ไม่สามารถลบตู้ชาร์จที่กำลังทำการชาร์จอยู่ได้',
        icon: 'warning',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#eab308',
      });
      return;
    }

    const result = await Swal.fire({
      title: 'คุณต้องการลบตู้ชาร์จหรือไม่?',
      text: `คุณต้องการลบตู้ชาร์จ ${station.name} (${stationId}) หรือไม่? การลบนี้จะนำข้อมูลออกจาก Google Sheets ทันที`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ใช่, ต้องการลบ',
      cancelButtonText: 'ยกเลิก',
      background: '#0f172a',
      color: '#f8fafc',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b'
    });

    if (result.isConfirmed) {
      setIsLoading(true);
      try {
        await onDeleteStation(stationId);
        Swal.fire({
          title: 'ลบสำเร็จ!',
          text: 'ลบข้อมูลตู้ชาร์จเรียบร้อยแล้ว',
          icon: 'success',
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#10b981',
        });
      } catch (err: any) {
        Swal.fire({
          title: 'เกิดข้อผิดพลาด',
          text: `ไม่สามารถลบตู้ชาร์จได้: ${err.message}`,
          icon: 'error',
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#ef4444',
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleStartChargingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStationId || !selectedTruckId || !operatorName) {
      Swal.fire({
        title: 'คำเตือน',
        text: 'กรุณากรอกข้อมูลให้ครบถ้วน',
        icon: 'warning',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#eab308',
      });
      return;
    }

    // Selected truck is ready to charge

    setIsLoading(true);
    try {
      // Artificial delay to show the loading animation clearly
      await new Promise(resolve => setTimeout(resolve, 800));
      await onStartCharging(activeStationId, selectedTruckId, operatorName);
      Swal.fire({
        title: 'เริ่มชาร์จสำเร็จ!',
        text: `ตู้ชาร์จเริ่มให้บริการแก่รถหัวลาก ${selectedTruckId} เรียบร้อยแล้ว`,
        icon: 'success',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#10b981',
      });
      closeActionModal();
    } catch (err: any) {
      Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: `ไม่สามารถเริ่มชาร์จได้: ${err.message}`,
        icon: 'error',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#ef4444',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopChargingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStationId) return;

    const station = stations.find(s => s.id === activeStationId);
    const activeSession = sessions.find(s => s.stationId === activeStationId && s.status === 'Charging');

    // 1. Verify 8-digit Employee ID input
    const trimmedEmpId = String(stopDriverEmpIdInput || '').trim();
    if (!trimmedEmpId || trimmedEmpId.length !== 8 || !/^\d+$/.test(trimmedEmpId)) {
      Swal.fire({
        title: 'ข้อมูลไม่ถูกต้อง',
        text: 'กรุณากรอกรหัสพนักงาน 8 หลักของผู้ขับขี่ที่ทำการชาร์จ',
        icon: 'warning',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#eab308',
      });
      return;
    }

    const driverName = String(activeSession?.operatorName || '').trim();
    const userList = users || [];
    const enteringUser = userList.find(u => String(u.employeeId).trim() === trimmedEmpId);
    const matchedUser = userList.find(u => String(u.name).trim() === driverName);

    const isAdminOrSupervisor = enteringUser && (enteringUser.role === 'Admin' || enteringUser.role === 'Supervisor');
    const isMasterAdminPin = trimmedEmpId === '685400' || trimmedEmpId === '99999999' || trimmedEmpId === '55019283';

    // Strict Rule: Admin / Supervisor / Master Admin CANNOT stop charging on behalf of another driver
    if (isAdminOrSupervisor || isMasterAdminPin) {
      const isSelfDriver = matchedUser 
        ? String(matchedUser.employeeId).trim() === trimmedEmpId
        : (enteringUser && (enteringUser.name.trim() === driverName || enteringUser.employeeId.trim() === driverName));

      if (!isSelfDriver) {
        Swal.fire({
          icon: 'error',
          title: 'ไม่อนุญาตให้ปลดการชาร์จแทนผู้ชาร์จ',
          text: `ไม่อนุญาตให้ Admin หรือผู้ดูแล ปลดการชาร์จแทนผู้ชาร์จในทุกกรณี ต้องใช้รหัสพนักงาน 8 หลักของผู้ชาร์จ (คุณ ${activeSession?.operatorName || 'ผู้ชาร์จ'}) เท่านั้น`,
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#ef4444'
        });
        return;
      }
    }

    const isCorrectDriver = matchedUser 
      ? String(matchedUser.employeeId).trim() === trimmedEmpId
      : (enteringUser && (enteringUser.name.trim() === driverName || enteringUser.employeeId.trim() === driverName));

    if (!isCorrectDriver) {
      Swal.fire({
        icon: 'error',
        title: 'ยืนยันตัวตนไม่สำเร็จ',
        text: `รหัสพนักงานไม่ถูกต้องสำหรับหยุดการชาร์จของคุณ ${activeSession?.operatorName || 'ผู้ชาร์จ'}`,
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#ef4444'
      });
      return;
    }

    // Validate target SOC is higher than start SOC
    const occupyingTruckId = activeSession ? activeSession.truckId : (station ? station.occupyingTruckId : '');
    const truck = trucks.find(t => t.id === occupyingTruckId);
    if (truck && targetSOC < truck.currentSOC) {
      Swal.fire({
        title: 'คำเตือน',
        text: `เป้าหมาย SOC (${targetSOC}%) ต้องไม่น้อยกว่าระดับแบตเตอรี่ปัจจุบันของรถ (${truck.currentSOC}%)`,
        icon: 'warning',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#eab308',
      });
      return;
    }

    setIsLoading(true);
    try {
      // Artificial delay to show the loading animation clearly
      await new Promise(resolve => setTimeout(resolve, 800));
      await onStopCharging(activeStationId, targetSOC);
      Swal.fire({
        title: 'หยุดชาร์จสำเร็จ!',
        text: 'ระบบได้ทำการบันทึกประวัติการชาร์จไฟเรียบร้อยแล้ว',
        icon: 'success',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#10b981',
      });
      closeActionModal();
    } catch (err: any) {
      Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: `ไม่สามารถหยุดชาร์จได้: ${err.message}`,
        icon: 'error',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#ef4444',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleMaintenance = async (stationId: string, currentStatus: 'Available' | 'Occupied' | 'Maintenance') => {
    if (currentStatus === 'Occupied') {
      Swal.fire({
        title: 'คำเตือน',
        text: 'ไม่สามารถปิดซ่อมบำรุงหัวชาร์จที่กำลังเชื่อมต่อรถชาร์จไฟได้',
        icon: 'warning',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#eab308',
      });
      return;
    }

    const nextStatus = currentStatus === 'Maintenance' ? 'Available' : 'Maintenance';
    const msg = nextStatus === 'Maintenance'
      ? `ต้องการปิดตู้ชาร์จ ${stationId} เพื่อซ่อมบำรุงใช่หรือไม่?`
      : `ซ่อมบำรุงตู้ชาร์จ ${stationId} เสร็จสิ้นและเปิดให้บริการ?`;

    const result = await Swal.fire({
      title: 'ยืนยันการเปลี่ยนสถานะ',
      text: msg,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
      background: '#0f172a',
      color: '#f8fafc',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#64748b'
    });

    if (result.isConfirmed) {
      try {
        await onToggleMaintenance(stationId, nextStatus);
        Swal.fire({
          title: 'อัปเดตสำเร็จ!',
          text: 'สถานะตู้ชาร์จได้รับการปรับปรุงแล้ว',
          icon: 'success',
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#10b981',
        });
      } catch (err: any) {
        Swal.fire({
          title: 'เกิดข้อผิดพลาด',
          text: `ล้มเหลวในการอัปเดตสถานะตู้ชาร์จ: ${err.message}`,
          icon: 'error',
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#ef4444',
        });
      }
    }
  };

  // Quick summary counts for compact mobile overview
  const statusCounts = stations.reduce(
    (acc, station) => {
      const stationIdClean = station.id?.trim().toUpperCase();
      const activeSession = sessions.find(
        s =>
          s.status?.toLowerCase() === 'charging' &&
          (s.stationId?.trim().toUpperCase() === stationIdClean ||
            (station.occupyingTruckId &&
              s.truckId?.trim().toUpperCase() === station.occupyingTruckId?.trim().toUpperCase()))
      );
      if (station.status === 'Maintenance') acc.maintenance += 1;
      else if (activeSession) acc.occupied += 1;
      else acc.available += 1;
      return acc;
    },
    { available: 0, occupied: 0, maintenance: 0 }
  );

  return (
    <div className="space-y-2.5 md:space-y-4">
      {/* Compact Header + Quick Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900/80 md:bg-transparent p-2.5 md:p-0 rounded-xl border border-slate-800/80 md:border-none">
        <div className="flex items-center justify-between sm:block">
          <div>
            <h2 className="text-xs md:text-sm font-bold text-white uppercase tracking-wider">
              สถานีชาร์จพลังงานรถไฟฟ้า (CHARGING BAYS)
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
              <span className="text-emerald-400 font-semibold">ว่าง {statusCounts.available}</span>
              <span>·</span>
              <span className="text-amber-400 font-semibold">กำลังชาร์จ {statusCounts.occupied}</span>
              {statusCounts.maintenance > 0 && (
                <>
                  <span>·</span>
                  <span className="text-rose-400 font-semibold">ซ่อมบำรุง {statusCounts.maintenance}</span>
                </>
              )}
            </div>
          </div>

          {user?.role === 'Admin' && (
            <button
              onClick={() => openStationModal()}
              className="sm:hidden px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[11px] rounded-lg transition-all flex items-center gap-1 shadow shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-slate-950" />
              เพิ่มตู้
            </button>
          )}
        </div>

        {user?.role === 'Admin' && (
          <button
            onClick={() => openStationModal()}
            className="hidden sm:flex px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg transition-all items-center gap-2 shadow shrink-0"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            ลงทะเบียนตู้ชาร์จใหม่
          </button>
        )}
      </div>

      {/* Grid of Stations */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 md:gap-5">
        {stations.map((station) => {
          const stationIdClean = station.id?.trim().toUpperCase();
          // Find any active session for this station directly or via occupying truck
          const activeSession = sessions.find(s => 
            s.status?.toLowerCase() === 'charging' && 
            (s.stationId?.trim().toUpperCase() === stationIdClean || (station.occupyingTruckId && s.truckId?.trim().toUpperCase() === station.occupyingTruckId?.trim().toUpperCase()))
          );
          
          // Determine the occupying truck ID and details
          const occupyingTruckId = activeSession ? activeSession.truckId : '';
          const occupyingTruck = trucks.find(t => 
            t.id?.trim().toUpperCase() === occupyingTruckId?.trim().toUpperCase()
          );
          
          // Determine the station's dynamic status
          const isOccupied = Boolean(activeSession);
          const currentStationStatus = station.status === 'Maintenance' 
            ? 'Maintenance' 
            : (isOccupied ? 'Occupied' : 'Available');
          
          const isMySession = user?.role === 'Admin' || (user?.role === 'Driver' && (activeSession?.operatorName === user?.displayName || occupyingTruck?.id === user?.vehicleId));
          const showDetails = user?.role === 'Admin' || isMySession;

          return (
            <div
              key={station.id}
              className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm p-2.5 md:p-4 flex flex-col justify-between h-full space-y-2 md:space-y-4 hover:border-slate-700 transition-all"
            >
              {/* Header block: Ultra-compact on mobile */}
              <div className="flex items-center md:items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider font-mono">
                      {station.id}
                    </span>
                    <span className="text-slate-600">·</span>
                    <h3 className="text-xs md:text-sm font-bold text-slate-100 truncate">
                      {station.name}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5 mt-0.5 md:mt-1.5 text-[10px] font-mono text-slate-400">
                    <span>{station.chargerType}</span>
                    <span>·</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                      <Zap className="w-2.5 h-2.5 text-emerald-500" />
                      {station.powerOutput} kW
                    </span>
                  </div>
                </div>

                <div className="flex items-center md:flex-col md:items-end gap-1.5 shrink-0">
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider font-mono ${
                      currentStationStatus === 'Available'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : currentStationStatus === 'Occupied'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {currentStationStatus === 'Available' ? 'ว่างพร้อมชาร์จ' : currentStationStatus === 'Occupied' ? 'กำลังชาร์จ' : 'ซ่อมบำรุง'}
                  </span>

                  {user?.role === 'Admin' && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openStationModal(station)}
                        className="p-1 text-slate-500 hover:text-emerald-400 rounded transition-colors bg-slate-950/60 border border-slate-800/60"
                        title="แก้ไขตู้ชาร์จ"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteStationClick(station.id)}
                        disabled={currentStationStatus === 'Occupied'}
                        className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors bg-slate-950/60 border border-slate-800/60 disabled:opacity-30 disabled:hover:text-slate-500"
                        title="ลบตู้ชาร์จ"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Charging Live Monitor: Compact on mobile, full detail on desktop */}
              <div className="flex-1">
                {currentStationStatus === 'Occupied' && occupyingTruck && showDetails ? (
                  <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-2 md:p-3 space-y-1.5 md:space-y-3">
                    {/* Single compact line on mobile for Truck ID + License Plate + Driver */}
                    <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                      <div className="flex items-center gap-1.5 font-mono">
                        <Truck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="font-bold text-white">{occupyingTruck.id}</span>
                        <span className="text-slate-500 text-[10px]">({occupyingTruck.licensePlate})</span>
                      </div>
                      {activeSession?.operatorName && (
                        <span className="text-[10px] text-slate-300 truncate max-w-[160px]">
                          ผู้ขับ: <strong className="text-slate-100">{activeSession.operatorName}</strong>
                        </span>
                      )}
                    </div>

                    {/* Progress with battery icon */}
                    {activeSession ? (
                      <ChargingCountdown startTimeStr={activeSession.startTime} startSOC={activeSession.startSOC} staticSOC={occupyingTruck.currentSOC} />
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-end">
                          <span className="text-[10px] font-bold text-slate-500 font-mono">SOC ปัจจุบัน</span>
                          <span className="text-emerald-400 font-mono font-bold text-xs">{occupyingTruck.currentSOC}%</span>
                        </div>
                        <div className="flex items-center w-full">
                          <div className="relative flex-1 h-4 md:h-6 bg-slate-950 border border-slate-700 rounded p-0.5 overflow-hidden shadow-inner">
                            <div
                              className="h-full bg-emerald-500 rounded-xs transition-all duration-1000 ease-linear"
                              style={{ width: `${occupyingTruck.currentSOC}%` }}
                            />
                          </div>
                          <div className="w-1 h-2 bg-slate-600 rounded-r-sm border-y border-r border-slate-700"></div>
                        </div>
                      </div>
                    )}

                    <div className="hidden md:flex items-center justify-between text-[9px] text-slate-500 font-mono">
                      <span>MODEL: {occupyingTruck.model}</span>
                      <span>CAP: {occupyingTruck.batteryCapacity} kWh</span>
                    </div>
                  </div>
                ) : currentStationStatus === 'Occupied' && !showDetails ? (
                  <div className="py-2 px-3 md:py-6 border border-dashed border-slate-800 bg-slate-950/40 rounded-lg text-slate-500 text-[11px] flex items-center md:flex-col justify-center gap-2 font-mono">
                    <Zap className="w-3.5 h-3.5 md:w-5 md:h-5 text-amber-500/50 shrink-0" />
                    <span className="text-slate-400 font-bold tracking-wider uppercase">กำลังใช้งานโดยรถคันอื่น</span>
                  </div>
                ) : (
                  /* On mobile, hide tall empty placeholder box when Available so cards stay super compact */
                  <div className="hidden md:flex text-center py-6 border border-dashed border-slate-800 bg-slate-950/40 rounded-lg text-slate-600 text-[11px] flex-col items-center justify-center gap-2 font-mono">
                    {currentStationStatus === 'Maintenance' ? (
                      <>
                        <ShieldAlert className="w-5 h-5 text-slate-600" />
                        <span className="font-bold text-slate-500 tracking-wider">MAINTENANCE_MODE</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-5 h-5 text-emerald-500/50" />
                        <span className="text-slate-400 font-bold tracking-wider">BAY_VACANT_READY</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Controller buttons: Single compact row on mobile */}
              <div className="flex items-center gap-1.5 pt-1.5 md:pt-2 border-t border-slate-800/80">
                {currentStationStatus === 'Available' ? (
                  <button
                    onClick={() => openActionModal(station.id, 'start')}
                    disabled={availableTrucksForCharging.length === 0 && queue.filter(q => q.status === 'Waiting').length === 0}
                    className="flex-1 py-2 md:py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-300 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-40 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
                    เริ่มชาร์จไฟฟ้า
                  </button>
                ) : currentStationStatus === 'Occupied' && showDetails ? (
                  <button
                    onClick={() => openActionModal(station.id, 'stop')}
                    className="flex-1 py-2 md:py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 shadow cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 fill-current text-slate-950" />
                    หยุดชาร์จ & บันทึก
                  </button>
                ) : null}

                {user?.role === 'Admin' && (
                  <button
                    onClick={() => handleToggleMaintenance(station.id, currentStationStatus)}
                    className={`px-2.5 py-2 md:py-1.5 text-[10px] font-bold font-mono rounded-lg border transition-all text-center shrink-0 cursor-pointer ${
                      currentStationStatus === 'Maintenance'
                        ? 'flex-1 bg-slate-950 border-emerald-500/30 text-emerald-400 hover:bg-slate-800'
                        : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                    title={currentStationStatus === 'Maintenance' ? 'เปิดใช้งานตู้ชาร์จ' : 'ตั้งค่าซ่อมบำรุง'}
                  >
                    {currentStationStatus === 'Maintenance' ? 'เปิดให้บริการ' : 'ซ่อมบำรุง'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Start / Stop Modal (Bottom Sheet on Mobile, Centered Modal on Desktop) */}
      {activeStationId && actionType && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-xl border-t sm:border border-slate-800 shadow-2xl max-w-md w-full overflow-hidden transition-all">
            <div className="px-4 py-3 bg-slate-950 text-white flex justify-between items-center border-b border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider font-mono">
                {actionType === 'start' ? `เริ่มชาร์จไฟฟ้า (${activeStationId})` : `หยุดชาร์จ & บันทึก (${activeStationId})`}
              </h3>
              <button onClick={closeActionModal} className="p-1 text-slate-400 hover:text-white rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            {actionType === 'start' ? (
              <form onSubmit={handleStartChargingSubmit} className="p-4 sm:p-5 space-y-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
                    เลือกรถหัวลาก (SELECT TRACTOR)
                  </label>
                  <select
                    value={selectedTruckId}
                    onChange={(e) => setSelectedTruckId(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="" disabled>-- กรุณาเลือกรถหัวลาก --</option>
                    {queue.filter(q => q.status === 'Waiting').map(q => {
                      const truck = trucks.find(t => t.id === q.truckId);
                      return (
                        <option key={q.id} value={q.truckId} className="font-semibold text-rose-400">
                          คิว {q.id} ({q.truckId} | แบต: {truck?.currentSOC}%) [รอด่วน]
                        </option>
                      );
                    })}
                    {availableTrucksForCharging.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.id} ({t.licensePlate}) | แบตคงเหลือ: {t.currentSOC}%
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
                    ชื่อผู้ขับขี่ / ผู้ควบคุม (OPERATOR NAME)
                  </label>
                  <input
                    type="text"
                    required
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    placeholder="เช่น สมชาย แข็งขัน"
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={closeActionModal}
                    className="flex-1 py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 font-semibold text-xs rounded-lg transition-all"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || !selectedTruckId}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    เริ่มชาร์จไฟฟ้า
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleStopChargingSubmit} className="p-4 sm:p-5 space-y-3">
                {(() => {
                  const station = stations.find(s => s.id === activeStationId);
                  const activeSession = sessions.find(s => s.stationId === activeStationId && s.status === 'Charging');
                  const occupyingTruckId = activeSession ? activeSession.truckId : (station ? station.occupyingTruckId : '');
                  const truck = trucks.find(t => t.id === occupyingTruckId);
                  if (!truck) return null;

                  return (
                    <div className="space-y-3">
                      <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 flex items-center justify-between font-mono">
                        <div>
                          <span className="text-[10px] text-slate-500 block">รถหัวลาก</span>
                          <strong className="text-emerald-400 text-sm">{truck.id}</strong>
                          <span className="text-[10px] text-slate-500 ml-1">({truck.licensePlate})</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 block">ผู้ชาร์จ</span>
                          <strong className="text-white">{activeSession?.operatorName || 'ไม่ระบุ'}</strong>
                        </div>
                      </div>

                      <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg text-[11px] text-rose-300">
                        🔒 ใช้รหัสพนักงาน 8 หลักของคุณ <strong>{activeSession?.operatorName || 'ผู้ชาร์จ'}</strong> เท่านั้น
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-mono">
                            รหัสพนักงาน 8 หลัก *
                          </label>
                          <input
                            type="password"
                            required
                            maxLength={8}
                            inputMode="numeric"
                            placeholder="รหัส 8 หลัก"
                            value={stopDriverEmpIdInput}
                            onChange={(e) => setStopDriverEmpIdInput(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none focus:border-rose-500 font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-mono">
                            แบตเตอรี่สิ้นสุด (SOC %) *
                          </label>
                          <input
                            type="number"
                            required
                            min={truck.currentSOC}
                            max={100}
                            value={targetSOC}
                            onChange={(e) => setTargetSOC(parseInt(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={closeActionModal}
                    className="flex-1 py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 font-semibold text-xs rounded-lg transition-all"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-slate-950 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-2"
                  >
                    {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    หยุดชาร์จ & บันทึก
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Station Modal */}
      {isStationModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-xl border-t sm:border border-slate-800 shadow-2xl max-w-md w-full overflow-hidden transition-all">
            <div className="px-4 py-3 bg-slate-950 text-white flex justify-between items-center border-b border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider font-mono">
                {editingStation ? 'แก้ไขข้อมูลตู้ชาร์จ' : 'ลงทะเบียนตู้ชาร์จใหม่'}
              </h3>
              <button onClick={closeStationModal} className="p-1 text-slate-400 hover:text-white rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleStationSubmit} className="p-4 sm:p-5 space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 font-mono">
                  รหัสตู้ชาร์จ (STATION ID)
                </label>
                <input
                  type="text"
                  required
                  disabled={!!editingStation}
                  value={stationIdInput}
                  onChange={(e) => setStationIdInput(e.target.value.toUpperCase())}
                  placeholder="เช่น CS-04, CH-01"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none font-mono disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 font-mono">
                  ชื่อตู้ชาร์จ / สถานีชาร์จ (STATION NAME)
                </label>
                <input
                  type="text"
                  required
                  value={stationNameInput}
                  onChange={(e) => setStationNameInput(e.target.value)}
                  placeholder="เช่น ตู้ชาร์จลานซีเมนต์ฝั่งตะวันตก"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 font-mono">
                    ประเภท (TYPE)
                  </label>
                  <select
                    value={chargerTypeInput}
                    onChange={(e) => {
                      const val = e.target.value as 'AC 22kW' | 'DC 120kW' | 'DC 150kW Fast';
                      setChargerTypeInput(val);
                      if (val === 'AC 22kW') setPowerOutputInput(22);
                      else if (val === 'DC 120kW') setPowerOutputInput(120);
                      else if (val === 'DC 150kW Fast') setPowerOutputInput(150);
                    }}
                    className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none"
                  >
                    <option value="AC 22kW">AC 22kW</option>
                    <option value="DC 120kW">DC 120kW</option>
                    <option value="DC 150kW Fast">DC 150kW Fast</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 font-mono">
                    กำลังไฟ (kW)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={500}
                    value={powerOutputInput}
                    onChange={(e) => setPowerOutputInput(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closeStationModal}
                  className="flex-1 py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 font-semibold text-xs rounded-lg transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  บันทึกข้อมูล
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
