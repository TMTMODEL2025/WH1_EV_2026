import React, { useState, useMemo } from 'react';
import { EVTruck, ChargingStation, SessionLog } from '../types/ev';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  RefreshCw, 
  Check, 
  AlertTriangle, 
  ShieldCheck, 
  Battery, 
  Gauge, 
  Truck, 
  Search, 
  Filter,
  Zap,
  Activity,
  SlidersHorizontal,
  User
} from 'lucide-react';
import Swal from 'sweetalert2';
import { getThailandISOString } from '../utils/date';

interface TrucksListProps {
  trucks: EVTruck[];
  stations?: ChargingStation[];
  sessions?: SessionLog[];
  onAddTruck: (truck: EVTruck) => Promise<void>;
  onUpdateTruck: (truck: EVTruck) => Promise<void>;
  onDeleteTruck: (id: string) => Promise<void>;
}

export default function TrucksList({ 
  trucks, 
  stations = [], 
  sessions = [], 
  onAddTruck, 
  onUpdateTruck, 
  onDeleteTruck 
}: TrucksListProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<EVTruck | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Available' | 'Charging' | 'Maintenance'>('All');

  // Single Source of Truth (SSOT): Map active sessions to trucks
  const activeSessionsByTruck = useMemo(() => {
    const map = new Map<string, SessionLog>();
    if (sessions) {
      for (const s of sessions) {
        if (s.status?.toLowerCase() === 'charging' && s.truckId) {
          map.set(s.truckId.trim().toUpperCase(), s);
        }
      }
    }
    return map;
  }, [sessions]);

  // Harmonized trucks list: truck status is strictly derived from active sessions (SSOT)
  const harmonizedTrucks = useMemo(() => {
    return trucks.map(truck => {
      const activeSession = activeSessionsByTruck.get(truck.id.trim().toUpperCase());
      const isCharging = Boolean(activeSession);
      const dynamicStatus: 'Available' | 'Charging' | 'Maintenance' = 
        truck.status === 'Maintenance'
          ? 'Maintenance'
          : (isCharging ? 'Charging' : 'Available');

      return {
        ...truck,
        status: dynamicStatus,
        activeSession,
      };
    });
  }, [trucks, activeSessionsByTruck]);

  // Form State
  const [id, setId] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [model, setModel] = useState('BYD Q1M');
  const [batteryCapacity, setBatteryCapacity] = useState(282);
  const [currentSOC, setCurrentSOC] = useState(50);
  const [status, setStatus] = useState<'Available' | 'Charging' | 'Maintenance'>('Available');
  const [currentOdometer, setCurrentOdometer] = useState<number>(0);

  const openModal = (truck?: EVTruck) => {
    if (truck) {
      setEditingTruck(truck);
      setId(truck.id);
      setLicensePlate(truck.licensePlate);
      setModel(truck.model);
      setBatteryCapacity(truck.batteryCapacity);
      setCurrentSOC(truck.currentSOC);
      setStatus(truck.status);
      setCurrentOdometer(truck.currentOdometer || 0);
    } else {
      setEditingTruck(null);
      // Generate next Truck ID based on existing ones
      const ids = trucks.map(t => parseInt(t.id.replace('TTEV-', '').replace('TRK-', ''))).filter(n => !isNaN(n));
      const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 19;
      setId(`TTEV-${nextId}`);
      setLicensePlate('');
      setModel('BYD Q1M');
      setBatteryCapacity(282);
      setCurrentSOC(50);
      setStatus('Available');
      setCurrentOdometer(0);
    }
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setEditingTruck(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !licensePlate.trim()) {
      Swal.fire({
        title: 'คำเตือน',
        text: 'กรุณากรอกรหัสรถและทะเบียนรถให้ครบถ้วน',
        icon: 'warning',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#eab308',
      });
      return;
    }

    if (currentOdometer < 0 || isNaN(currentOdometer)) {
      Swal.fire({
        title: 'คำเตือน',
        text: 'เลขไมล์สะสมต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับ 0',
        icon: 'warning',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#eab308',
      });
      return;
    }

    setIsLoading(true);
    try {
      const truckData: EVTruck = {
        id: id.trim().toUpperCase(),
        licensePlate: licensePlate.trim(),
        model: model.trim(),
        batteryCapacity: Number(batteryCapacity) || 282,
        currentSOC: Number(currentSOC) || 0,
        status,
        lastUpdated: getThailandISOString(),
        currentOdometer: Number(currentOdometer) || 0,
      };

      if (editingTruck) {
        await onUpdateTruck(truckData);
        Swal.fire({
          title: 'สำเร็จ!',
          text: `แก้ไขข้อมูลรถหัวลาก ${truckData.id} และบันทึกเลขไมล์ล่าสุดเรียบร้อย`,
          icon: 'success',
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#10b981',
        });
      } else {
        // Check if ID already exists
        if (trucks.some(t => t.id.toLowerCase() === id.trim().toLowerCase())) {
          Swal.fire({
            title: 'เกิดข้อผิดพลาด',
            text: 'รหัสรถนี้มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น',
            icon: 'error',
            background: '#0f172a',
            color: '#f8fafc',
            confirmButtonColor: '#ef4444',
          });
          setIsLoading(false);
          return;
        }
        await onAddTruck(truckData);
        Swal.fire({
          title: 'สำเร็จ!',
          text: `ลงทะเบียนรถหัวลาก ${truckData.id} พร้อมเลขไมล์ ${Number(currentOdometer).toLocaleString('th-TH')} km เรียบร้อยแล้ว`,
          icon: 'success',
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#10b981',
        });
      }
      closeModal();
    } catch (err: any) {
      Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: `ล้มเหลวในการบันทึกข้อมูลรถ: ${err.message}`,
        icon: 'error',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#ef4444',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (truckId: string) => {
    const result = await Swal.fire({
      title: 'ยืนยันการลบข้อมูลรถ?',
      text: `คุณต้องการลบข้อมูลรถหัวลาก ${truckId} ออกจากฐานข้อมูลหรือไม่?`,
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
        await onDeleteTruck(truckId);
        Swal.fire({
          title: 'ลบสำเร็จ!',
          text: `ลบข้อมูลรถหัวลาก ${truckId} เรียบร้อยแล้ว`,
          icon: 'success',
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#10b981',
        });
      } catch (err: any) {
        Swal.fire({
          title: 'เกิดข้อผิดพลาด',
          text: `ล้มเหลวในการลบรถ: ${err.message}`,
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

  // Fleet Statistics (Strictly derived from SSOT harmonizedTrucks)
  const stats = useMemo(() => {
    const total = harmonizedTrucks.length;
    const charging = harmonizedTrucks.filter(t => t.status === 'Charging').length;
    const maintenance = harmonizedTrucks.filter(t => t.status === 'Maintenance').length;
    const available = Math.max(0, total - charging - maintenance);
    const totalOdometer = harmonizedTrucks.reduce((sum, t) => sum + (Number(t.currentOdometer) || 0), 0);
    const avgSOC = total > 0 ? Math.round(harmonizedTrucks.reduce((sum, t) => sum + (Number(t.currentSOC) || 0), 0) / total) : 0;

    return { total, available, charging, maintenance, totalOdometer, avgSOC };
  }, [harmonizedTrucks]);

  // Filtered trucks (Strictly derived from SSOT harmonizedTrucks)
  const filteredTrucks = useMemo(() => {
    return harmonizedTrucks.filter(truck => {
      const matchesSearch = 
        truck.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        truck.licensePlate.toLowerCase().includes(searchQuery.toLowerCase()) ||
        truck.model.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'All' || truck.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [harmonizedTrucks, searchQuery, statusFilter]);

  return (
    <div className="space-y-3 md:space-y-5">
      {/* Header and Add button */}
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-800/80">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 shrink-0">
            <Truck className="w-4 h-4 md:w-5 md:h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs md:text-base font-bold text-white uppercase tracking-wider font-mono truncate">
              ทะเบียนรถหัวลากไฟฟ้า ({harmonizedTrucks.length} คัน)
            </h2>
            <p className="hidden sm:block text-[11px] text-slate-400 font-mono">
              ระบบจัดการข้อมูลรถหัวลากไฟฟ้า ตรวจสอบสถานะ ระดับแบตเตอรี่ และเลขไมล์สะสมล่าสุด (Odometer)
            </p>
          </div>
        </div>
        <button
          onClick={() => openModal()}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40 shrink-0 active:scale-95"
        >
          <Plus className="w-4 h-4 text-slate-950 stroke-[2.5]" />
          <span>เพิ่มรถใหม่</span>
        </button>
      </div>

      {/* Fleet Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3.5">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 md:p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">รถทั้งหมด</span>
            <div className="text-base md:text-2xl font-bold text-white font-mono mt-0.5">{stats.total} <span className="text-[10px] md:text-xs font-normal text-slate-500">คัน</span></div>
          </div>
          <div className="p-2 bg-slate-800/60 rounded-lg border border-slate-700/50 text-slate-300">
            <Truck className="w-4 h-4 md:w-5 md:h-5" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 md:p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider font-mono">ว่าง / ชาร์จ</span>
            <div className="text-base md:text-2xl font-bold text-emerald-400 font-mono mt-0.5">
              {stats.available} <span className="text-xs text-slate-500">/</span> <span className="text-amber-400">{stats.charging}</span>
            </div>
          </div>
          <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-emerald-400">
            <Zap className="w-4 h-4 md:w-5 md:h-5" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 md:p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider font-mono">ไมล์สะสมรวม</span>
            <div className="text-base md:text-xl font-bold text-cyan-400 font-mono mt-0.5">
              {stats.totalOdometer.toLocaleString('th-TH')} <span className="text-[10px] font-normal text-slate-500">km</span>
            </div>
          </div>
          <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20 text-cyan-400">
            <Gauge className="w-4 h-4 md:w-5 md:h-5" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 md:p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">แบตเฉลี่ย</span>
            <div className="text-base md:text-2xl font-bold text-slate-200 font-mono mt-0.5">{stats.avgSOC}%</div>
          </div>
          <div className="p-2 bg-slate-800/60 rounded-lg border border-slate-700/50 text-slate-300">
            <Battery className="w-4 h-4 md:w-5 md:h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 md:p-3 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหารหัสรถ (TTEV-..), ทะเบียน, หรือยี่ห้อรุ่น..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(['All', 'Available', 'Charging', 'Maintenance'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all whitespace-nowrap min-h-[36px] sm:min-h-[32px] flex items-center gap-1.5 ${
                statusFilter === st
                  ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'bg-slate-950/60 text-slate-400 border border-slate-800/80 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <span>{st === 'All' ? 'ทั้งหมด' : st === 'Available' ? 'พร้อมใช้งาน' : st === 'Charging' ? 'กำลังชาร์จ' : 'ซ่อมบำรุง'}</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-slate-900 border border-slate-700/50 rounded-full font-bold">
                {st === 'All' ? harmonizedTrucks.length : harmonizedTrucks.filter(t => t.status === st).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Trucks */}
      {filteredTrucks.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 text-center">
          <Truck className="w-10 h-10 text-slate-600 mx-auto mb-2 opacity-50" />
          <p className="text-sm font-semibold text-slate-400">ไม่พบข้อมูลรถหัวลากที่ตรงกับเงื่อนไข</p>
          <p className="text-xs text-slate-600 mt-1">ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-4">
          {filteredTrucks.map(truck => {
            const odometerFormatted = (Number(truck.currentOdometer) || 0).toLocaleString('th-TH');
            return (
              <div
                key={truck.id}
                className="bg-slate-900 rounded-xl border border-slate-800 p-3 md:p-4 shadow-sm hover:border-slate-700 transition-all flex flex-col justify-between space-y-2.5 md:space-y-3.5 group hover:shadow-lg hover:shadow-slate-950/50"
              >
                {/* Top row */}
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider font-mono bg-slate-950 border border-slate-800 px-2 py-0.5 rounded">
                        {truck.id}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono truncate">
                        {truck.model}
                      </span>
                    </div>
                    <h3 className="text-sm md:text-base font-bold text-slate-100 font-mono tracking-wide">
                      {truck.licensePlate}
                    </h3>
                  </div>

                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider font-mono whitespace-nowrap ${
                      truck.status === 'Available'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : truck.status === 'Charging'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                        : 'bg-red-500/15 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {truck.status === 'Available' ? '● ว่างพร้อมใช้' : truck.status === 'Charging' ? '⚡ กำลังชาร์จ' : '⚠ ซ่อมบำรุง'}
                  </span>
                </div>

                {/* Active Charging Session Info Banner */}
                {truck.status === 'Charging' && truck.activeSession && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 text-[11px] font-mono text-amber-300 flex items-center justify-between gap-2 shadow-inner">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400 animate-bounce shrink-0" />
                      <span>ตู้: <strong className="text-white">{truck.activeSession.stationId}</strong></span>
                    </div>
                    <span className="text-[10px] text-slate-300 truncate">
                      ผู้ขับ: <strong className="text-amber-200">{truck.activeSession.operatorName || 'ไม่ระบุ'}</strong>
                    </span>
                  </div>
                )}

                {/* Key Metric Highlights: Odometer & Battery */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Latest Mileage Box */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2 flex flex-col justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-wider font-mono flex items-center gap-1 text-slate-400">
                      <Gauge className="w-3 h-3 text-cyan-400" />
                      เลขไมล์ล่าสุด
                    </span>
                    <div className="mt-0.5 flex items-baseline gap-1">
                      <span className="text-xs md:text-base font-black text-cyan-300 font-mono tracking-tight">
                        {odometerFormatted}
                      </span>
                      <span className="text-[9px] font-bold text-slate-500 font-mono">km</span>
                    </div>
                  </div>

                  {/* Battery Capacity Box */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2 flex flex-col justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-wider font-mono flex items-center gap-1 text-slate-400">
                      <Battery className="w-3 h-3 text-emerald-400" />
                      ความจุแบตเตอรี่
                    </span>
                    <div className="mt-0.5 flex items-baseline gap-1">
                      <span className="text-xs md:text-base font-black text-emerald-300 font-mono tracking-tight">
                        {truck.batteryCapacity}
                      </span>
                      <span className="text-[9px] font-bold text-slate-500 font-mono">kWh</span>
                    </div>
                  </div>
                </div>

                {/* Battery SOC progress gauge */}
                <div className="space-y-1 bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-slate-400">แบตเตอรี่ปัจจุบัน</span>
                    <span className={`font-bold ${
                      truck.currentSOC <= 20 ? 'text-rose-400' : truck.currentSOC <= 50 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {truck.currentSOC}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        truck.currentSOC <= 20
                          ? 'bg-rose-500'
                          : truck.currentSOC <= 50
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, truck.currentSOC))}%` }}
                    />
                  </div>
                </div>

                {/* Bottom Actions and Sync Status */}
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/80">
                  <span className="text-[9px] text-slate-500 font-mono">
                    อัปเดต: {truck.lastUpdated ? new Date(truck.lastUpdated).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) : '-'}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => openModal(truck)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-all flex items-center gap-1 text-[11px] font-medium"
                      title="แก้ไขข้อมูลรถและเลขไมล์"
                    >
                      <Edit2 className="w-3 h-3 text-emerald-400" />
                      <span>แก้ไข</span>
                    </button>
                    <button
                      onClick={() => handleDelete(truck.id)}
                      disabled={truck.status === 'Charging'}
                      className="p-1.5 hover:bg-rose-950/40 rounded-lg text-slate-500 hover:text-rose-400 transition-all disabled:opacity-30 flex items-center justify-center"
                      title={truck.status === 'Charging' ? 'ไม่สามารถลบรถที่กำลังชาร์จอยู่ได้' : 'ลบข้อมูลรถ'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-over / Bottom Sheet Modal for Create/Edit Tractor */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl border-t sm:border border-slate-800 shadow-2xl max-w-lg w-full max-h-[92dvh] overflow-y-auto transition-all transform">
            <div className="px-4 py-3.5 bg-slate-950 text-white flex justify-between items-center border-b border-slate-800 sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider font-mono">
                    {editingTruck ? `แก้ไขข้อมูลรถหัวลาก (${id})` : 'ลงทะเบียนรถหัวลากไฟฟ้าใหม่'}
                  </h3>
                </div>
              </div>
              <button 
                onClick={closeModal} 
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-3">
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-mono">
                    รหัสรถ (ID) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น TTEV-19"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    disabled={!!editingTruck}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 disabled:bg-slate-950/40 disabled:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono min-h-[42px]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-mono">
                    เลขทะเบียนรถ <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น 70-1234"
                    value={licensePlate}
                    onChange={(e) => setLicensePlate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500 min-h-[42px]"
                  />
                </div>
              </div>

              {/* Model & Latest Odometer */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-mono">
                    ยี่ห้อ / รุ่น <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น BYD Q1M"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    list="tractor-models"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500 min-h-[42px]"
                  />
                  <datalist id="tractor-models">
                    <option value="BYD Q1M" />
                    <option value="SANY SEV" />
                    <option value="Volvo FH Electric" />
                    <option value="Scania EV Heavy" />
                    <option value="Dongfeng EV Tractor" />
                  </datalist>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1 font-mono flex items-center gap-1">
                    <Gauge className="w-3 h-3 text-cyan-400" />
                    เลขไมล์ (km) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="any"
                    placeholder="เช่น 125400"
                    value={currentOdometer}
                    onChange={(e) => setCurrentOdometer(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-cyan-500/40 text-xs font-bold text-cyan-300 focus:outline-none focus:border-cyan-500 font-mono min-h-[42px]"
                  />
                </div>
              </div>

              {/* Battery Capacity & Current SOC */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-mono">
                    ความจุแบต (kWh)
                  </label>
                  <input
                    type="number"
                    required
                    min={50}
                    max={1200}
                    value={batteryCapacity}
                    onChange={(e) => setBatteryCapacity(parseInt(e.target.value) || 282)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500 font-mono min-h-[42px]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-mono">
                    แบตปัจจุบัน (%)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={100}
                    value={currentSOC}
                    onChange={(e) => setCurrentSOC(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500 font-mono min-h-[42px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-mono">
                  สถานะการทำงาน (STATUS)
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500 font-mono min-h-[42px]"
                >
                  <option value="Available">ว่าง / พร้อมใช้งาน (Available)</option>
                  <option value="Charging" disabled={!editingTruck}>กำลังชาร์จไฟ (Charging)</option>
                  <option value="Maintenance">ปิดซ่อมบำรุง (Maintenance)</option>
                </select>
              </div>

              <div className="flex gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-xs rounded-xl transition-all min-h-[42px]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 min-h-[42px] shadow-lg shadow-emerald-950/40"
                >
                  {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[2.5]" />}
                  <span>{editingTruck ? 'บันทึกการแก้ไข' : 'ลงทะเบียนรถ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
