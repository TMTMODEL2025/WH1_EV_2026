import React, { useState, useMemo } from 'react';
import { SessionLog } from '../types/ev';
import { Clock, Zap, History, ClipboardList, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Search, Calendar, X, Coins, Download, RefreshCw, Database, FileSpreadsheet } from 'lucide-react';
import Swal from 'sweetalert2';

import { getThailandDateString, formatDateToTH } from '../utils/date';

interface SessionsHistoryProps {
  sessions: SessionLog[];
  isFullHistoryLoaded?: boolean;
  totalHistoryCount?: number;
  onLoadFullHistory?: () => Promise<void> | void;
  isLoadingFullHistory?: boolean;
  onLoadMore?: () => Promise<void> | void;
  isLastPage?: boolean;
  isLoading?: boolean;
}

export default function SessionsHistory({
  sessions,
  isFullHistoryLoaded = false,
  totalHistoryCount = 0,
  onLoadFullHistory,
  isLoadingFullHistory = false,
  onLoadMore,
  isLastPage = false,
  isLoading = false,
}: SessionsHistoryProps) {
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CHARGING' | 'COMPLETED'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [recordsPerPage, setRecordsPerPage] = useState<number>(50);

  // Single Source of Truth (SSOT): Active charging sessions
  const activeChargingSessions = useMemo(() => {
    return sessions.filter(s => s.status?.toLowerCase() === 'charging');
  }, [sessions]);

  // Reset to first page when any filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, startDate, endDate]);

  // Filter sessions based on search, status and date filters
  const filteredSessions = sessions.filter(s => {
    // 0. Status Filter
    if (statusFilter === 'CHARGING' && s.status?.toLowerCase() !== 'charging') {
      return false;
    }
    if (statusFilter === 'COMPLETED' && s.status?.toLowerCase() !== 'completed') {
      return false;
    }

    // 1. Search Query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchId = (s.id || '').toLowerCase().includes(q);
      const matchTruck = (s.truckId || '').toLowerCase().includes(q);
      const matchStation = (s.stationId || '').toLowerCase().includes(q);
      const matchOperator = (s.operatorName || '').toLowerCase().includes(q);
      if (!matchId && !matchTruck && !matchStation && !matchOperator) {
        return false;
      }
    }

    // 2. Date Range
    if (s.startTime) {
      const sessionTimeStr = getThailandDateString(new Date(s.startTime));
      
      if (startDate && sessionTimeStr < startDate) {
        return false;
      }
      if (endDate && sessionTimeStr > endDate) {
        return false;
      }
    } else if (startDate || endDate) {
      return false;
    }

    return true;
  });

  // Sort sessions: newest first
  let sortedSessions = [...filteredSessions].sort((a, b) => {
    return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
  });

  // Fallback: If default date filter yields no results and there's no search query, show latest 20 records
  const isDefaultDate = startDate === '' && endDate === '';
  if (sortedSessions.length === 0 && isDefaultDate && searchQuery.trim() === '') {
    sortedSessions = [...sessions].sort((a, b) => {
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    }).slice(0, 20);
  }

  const totalCount = sortedSessions.length;
  const totalPages = Math.ceil(totalCount / recordsPerPage) || 1;
  const activePage = Math.min(Math.max(1, currentPage), totalPages);

  const startIndex = (activePage - 1) * recordsPerPage;
  const endIndex = startIndex + recordsPerPage;
  const paginatedSessions = sortedSessions.slice(startIndex, endIndex);

  // Group by date (only the paginated sessions)
  const groupedSessions = paginatedSessions.reduce((acc, session) => {
    const dateStr = session.startTime ? formatDateToTH(new Date(session.startTime)) : 'ไม่ระบุวันที่';
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(session);
    return acc;
  }, {} as Record<string, SessionLog[]>);

  const isFiltering = searchQuery.trim() !== '' || startDate !== '' || endDate !== '';

  const toggleDate = (date: string) => {
    const newSet = new Set(expandedDates);
    if (isFiltering) {
      const collapsedKey = date + '_collapsed';
      if (newSet.has(collapsedKey)) {
        newSet.delete(collapsedKey);
      } else {
        newSet.add(collapsedKey);
      }
    } else {
      if (newSet.has(date)) {
        newSet.delete(date);
      } else {
        newSet.add(date);
      }
    }
    setExpandedDates(newSet);
  };

  // Calculate aggregated stats
  const completedSessions = filteredSessions.filter(s => s.status === 'Completed');
  const totalEnergy = completedSessions.reduce((sum, s) => sum + (s.energyConsumed || 0), 0);
  const totalDuration = completedSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const totalCost = completedSessions.reduce((sum, s) => sum + (s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5))), 0);
  const avgEnergy = completedSessions.length > 0 ? Math.round(totalEnergy / completedSessions.length) : 0;
  const avgDuration = completedSessions.length > 0 ? Math.round(totalDuration / completedSessions.length) : 0;
  const avgCost = completedSessions.length > 0 ? totalCost / completedSessions.length : 0;

  const handleExportExcel = () => {
    if (sortedSessions.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่มีข้อมูลสำหรับส่งออก',
        text: 'ไม่พบรายการประวัติการชาร์จตามเงื่อนไขที่เลือก',
        confirmButtonColor: '#10b981',
        background: '#0f172a',
        color: '#f8fafc',
      });
      return;
    }

    const headers = [
      'Session ID',
      'วันที่',
      'รหัสรถ (Truck ID)',
      'ตู้ชาร์จ (Station ID)',
      'พนักงานขับรถ (Operator)',
      'เวลาเริ่มชาร์จ',
      'เวลาสิ้นสุดชาร์จ',
      'SOC เริ่มต้น (%)',
      'SOC สิ้นสุด (%)',
      'พลังงานที่ใช้ (kWh)',
      'ระยะเวลาชาร์จ (นาที)',
      'เลขไมล์ (km)',
      'ราคาต่อหน่วย (บาท)',
      'ค่าไฟฟ้ารวม (บาท)',
      'สถานะ'
    ];

    const escapeCsvField = (val: any) => {
      const str = val === null || val === undefined ? '' : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = sortedSessions.map((s) => {
      const isCharging = s.status?.toLowerCase() === 'charging';
      const startD = s.startTime ? new Date(s.startTime) : null;
      const endD = s.endTime ? new Date(s.endTime) : null;
      const dateStr = startD && !isNaN(startD.getTime()) ? formatDateToTH(startD) : '-';
      const startTimeStr = startD && !isNaN(startD.getTime())
        ? startD.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' })
        : '-';
      const endTimeStr = endD && !isNaN(endD.getTime())
        ? endD.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' })
        : (isCharging ? 'กำลังชาร์จ' : '-');

      const elapsedMins = startD && !isNaN(startD.getTime()) ? Math.max(1, Math.round((Date.now() - startD.getTime()) / 60000)) : 0;
      const durationVal = isCharging
        ? Math.min(elapsedMins, Math.round((100 - (s.startSOC || 0)) * 1.45))
        : (s.duration || 0);
      const energyVal = Math.round(((16 * durationVal) / 60) * 100) / 100;
      const priceVal = s.pricePerUnit || 3.5;
      const costVal = Math.round((energyVal * priceVal) * 100) / 100;

      const statusTh = isCharging
        ? 'กำลังชาร์จ'
        : (s.isAutoCompleted || s.endSOC >= 100 ? 'เสร็จสิ้น (Auto 100%)' : 'เสร็จสิ้น');

      return [
        s.id || '-',
        dateStr,
        s.truckId || '-',
        s.stationId || '-',
        s.operatorName || '-',
        startTimeStr,
        endTimeStr,
        s.startSOC ?? 0,
        isCharging ? '-' : (s.endSOC ?? 0),
        energyVal.toFixed(2),
        durationVal,
        s.odometer || '-',
        priceVal.toFixed(4),
        costVal.toFixed(2),
        statusTh
      ].map(escapeCsvField).join(',');
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCsvField).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = getThailandDateString();
    link.href = url;
    link.setAttribute('download', `EV_Charging_History_${dateStamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `ส่งออกไฟล์ Excel สำเร็จ (${sortedSessions.length.toLocaleString()} รายการ)`,
      showConfirmButton: false,
      timer: 2500,
      background: '#1e293b',
      color: '#f8fafc',
    });
  };

  return (
    <div className="space-y-2.5 md:space-y-4">
      {/* Metrics Banner: 2x2 Compact Grid on Mobile, 4 Columns on Desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-2.5 md:p-4 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider font-mono block truncate">พลังงานสะสมรวม</span>
            <h3 className="text-sm md:text-lg font-bold text-white font-mono mt-0.5 md:mt-1 truncate">{totalEnergy.toLocaleString()} kWh</h3>
            <p className="hidden md:block text-[10px] text-slate-500 mt-1 font-mono">AVG: {avgEnergy} kWh / SESSION</p>
          </div>
          <div className="p-1.5 md:p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded shrink-0 ml-1.5">
            <Zap className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-2.5 md:p-4 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider font-mono block truncate">เวลาชาร์จรวม</span>
            <h3 className="text-sm md:text-lg font-bold text-white font-mono mt-0.5 md:mt-1 truncate">{totalDuration.toLocaleString()} นาที</h3>
            <p className="hidden md:block text-[10px] text-slate-500 mt-1 font-mono">AVG: {avgDuration} MIN / SESSION</p>
          </div>
          <div className="p-1.5 md:p-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded shrink-0 ml-1.5">
            <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-2.5 md:p-4 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider font-mono block truncate">มูลค่าไฟฟ้ารวม</span>
            <h3 className="text-sm md:text-lg font-bold text-amber-400 font-mono mt-0.5 md:mt-1 truncate">฿{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <p className="hidden md:block text-[10px] text-slate-500 mt-1 font-mono">AVG: ฿{avgCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / SESSION</p>
          </div>
          <div className="p-1.5 md:p-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded shrink-0 ml-1.5">
            <Coins className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-2.5 md:p-4 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider font-mono block truncate">รายการทั้งหมด</span>
            <div className="flex items-baseline gap-1.5 mt-0.5 md:mt-1">
              <h3 className="text-sm md:text-lg font-bold text-white font-mono truncate">{filteredSessions.length.toLocaleString()} รายการ</h3>
            </div>
            <p className="hidden md:block text-[10px] text-emerald-400 font-mono font-semibold mt-1">
              สำเร็จ {completedSessions.length} | ⚡ กำลังชาร์จ {activeChargingSessions.length}
            </p>
          </div>
          <div className={`p-1.5 md:p-2 rounded border shrink-0 ml-1.5 ${
            activeChargingSessions.length > 0 
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse' 
              : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
          }`}>
            {activeChargingSessions.length > 0 ? <Zap className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4" />}
          </div>
        </div>
      </div>

      {/* Active In-Progress Charging Sessions Highlight Banner */}
      {activeChargingSessions.length > 0 && (
        <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/20 border border-amber-500/40 rounded-xl p-2.5 md:p-4 shadow-sm space-y-2 md:space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-amber-500/20 pb-1.5 md:pb-2.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <h3 className="text-[11px] md:text-sm font-bold text-amber-300 font-mono truncate flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                กำลังชาร์จขณะนี้ ({activeChargingSessions.length} คัน)
              </h3>
            </div>
            <span className="text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono uppercase shrink-0">
              LIVE
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {activeChargingSessions.map((actSess) => {
              const startTime = new Date(actSess.startTime);
              const elapsedMins = isNaN(startTime.getTime()) ? 0 : Math.max(1, Math.round((Date.now() - startTime.getTime()) / 60000));
              return (
                <div key={actSess.id} className="bg-slate-950/80 border border-amber-500/30 rounded-lg px-2.5 py-2 md:p-3 font-mono text-xs text-slate-200 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-400 font-bold text-xs md:text-sm">{actSess.truckId}</span>
                      <span className="text-[10px] bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-slate-300 font-semibold">{actSess.stationId}</span>
                      <span className="text-[10px] text-slate-400 truncate">· {actSess.operatorName || '-'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-[10px]">
                    <span className="text-amber-300 font-bold">{actSess.startSOC}%</span>
                    <span className="flex items-center gap-1 text-amber-400 font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      <Clock className="w-3 h-3 animate-spin" /> ~{elapsedMins}m
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-2.5 md:p-5 shadow-sm">
        {/* Header & Status Filter Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 md:gap-4 mb-2.5 md:mb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 md:gap-2">
              <History className="w-4 h-4 md:w-4.5 md:h-4.5 text-emerald-400 shrink-0" />
              <h2 className="text-xs md:text-sm font-bold text-white uppercase tracking-wider">ประวัติการชาร์จไฟฟ้า</h2>
            </div>

            {/* Mobile Export Excel + Rows Per Page Selector */}
            <div className="flex sm:hidden items-center gap-1.5 font-mono">
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[10px] rounded flex items-center gap-1 shadow transition-all active:scale-95 cursor-pointer"
                title="ส่งออกไฟล์ Excel (.csv)"
              >
                <FileSpreadsheet className="w-3 h-3 stroke-[2.5]" />
                <span>Export Excel</span>
              </button>
              <select
                value={recordsPerPage}
                onChange={(e) => {
                  setRecordsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-emerald-500 font-bold"
              >
                <option value={10}>10 / หน้า</option>
                <option value={20}>20 / หน้า</option>
                <option value={50}>50 / หน้า</option>
              </select>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
            {/* Status Filter Tabs */}
            <div className="grid grid-cols-3 sm:flex items-center w-full sm:w-auto bg-slate-950 p-1 rounded-lg border border-slate-800 font-mono text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-2 py-1 rounded text-[10px] md:text-[11px] font-bold transition-all text-center ${
                  statusFilter === 'ALL'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ทั้งหมด ({sessions.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('CHARGING')}
                className={`px-2 py-1 rounded text-[10px] md:text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${
                  statusFilter === 'CHARGING'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'text-amber-400/80 hover:text-amber-300'
                }`}
              >
                <Zap className="w-2.5 h-2.5 md:w-3 md:h-3 text-amber-400 shrink-0" />
                <span>กำลังชาร์จ ({activeChargingSessions.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('COMPLETED')}
                className={`px-2 py-1 rounded text-[10px] md:text-[11px] font-bold transition-all text-center ${
                  statusFilter === 'COMPLETED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                เสร็จสิ้น ({completedSessions.length})
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-2 font-mono">
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1.5 shadow transition-all active:scale-95 cursor-pointer"
                title="ส่งออกประวัติการชาร์จเป็นไฟล์ Excel (.csv)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Export Excel</span>
              </button>
              <span className="text-slate-500 text-[10px] font-bold uppercase ml-1">แถวต่อหน้า:</span>
              <select
                value={recordsPerPage}
                onChange={(e) => {
                  setRecordsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-emerald-500 font-bold"
              >
                <option value={10}>10 รายการ</option>
                <option value={20}>20 รายการ</option>
                <option value={50}>50 รายการ</option>
              </select>
            </div>
          </div>
        </div>

        {/* Compact Filters Panel */}
        <div className="grid grid-cols-2 md:grid-cols-12 gap-2 md:gap-3 mb-3 md:mb-5 bg-slate-950/60 p-2 md:p-3.5 rounded-lg border border-slate-800/80">
          {/* Search Input */}
          <div className="col-span-2 md:col-span-5 relative">
            <label className="hidden md:block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
              ค้นหาข้อมูล (TRACTOR / SESSION ID / OPERATOR)
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 md:top-2.5 w-3.5 h-3.5 md:w-4 md:h-4 text-slate-500" />
              <input
                type="text"
                placeholder="ค้นหาเลขรถ, รหัส, ชื่อผู้ขับ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 md:py-2 rounded bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 md:top-2.5 text-slate-500 hover:text-slate-300 focus:outline-none"
                >
                  <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Start Date */}
          <div className="col-span-1 md:col-span-3 relative">
            <label className="block text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 md:mb-1 font-mono">
              จากวันที่
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2 md:px-3 py-1.5 md:py-2 rounded bg-slate-900 border border-slate-800 text-[11px] md:text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500 [color-scheme:dark] transition-all"
            />
          </div>

          {/* End Date */}
          <div className="col-span-1 md:col-span-3 relative">
            <label className="block text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 md:mb-1 font-mono">
              ถึงวันที่
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2 md:px-3 py-1.5 md:py-2 rounded bg-slate-900 border border-slate-800 text-[11px] md:text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500 [color-scheme:dark] transition-all"
            />
          </div>

          {/* Reset Filters */}
          {(searchQuery || startDate || endDate) ? (
            <div className="col-span-2 md:col-span-1 flex items-end">
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStartDate('');
                  setEndDate('');
                }}
                className="w-full py-1.5 md:py-2 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-rose-400 hover:text-rose-300 transition-all flex items-center justify-center gap-1 h-[32px] md:h-[34px]"
                title="ล้างตัวกรองทั้งหมด"
              >
                <X className="w-3.5 h-3.5" />
                <span className="md:hidden font-mono text-[11px]">ล้างตัวกรอง</span>
              </button>
            </div>
          ) : (
            <div className="hidden md:block md:col-span-1 h-[34px] w-full" />
          )}
        </div>

        {/* MOBILE VIEW (< 768px): Collapsible Date Groups with Compact Session Cards */}
        <div className="md:hidden space-y-2">
          {Object.keys(groupedSessions).length > 0 ? (
            Object.entries(groupedSessions).map(([date, dateSessions]) => {
              const isExpanded = isFiltering ? !expandedDates.has(date + '_collapsed') : expandedDates.has(date);
              const activeInDate = dateSessions.filter(s => s.status?.toLowerCase() === 'charging').length;
              const dateTotalCost = dateSessions
                .filter(s => s.status === 'Completed')
                .reduce((sum, s) => sum + (s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5))), 0);

              return (
                <div key={date} className="rounded-lg border border-slate-800 overflow-hidden bg-slate-950/50">
                  {/* Date Group Header */}
                  <button
                    type="button"
                    onClick={() => toggleDate(date)}
                    className="w-full px-3 py-2.5 bg-slate-800/60 hover:bg-slate-800 flex items-center justify-between gap-2 text-left transition-colors"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 font-mono">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                      <span className="text-xs font-bold text-slate-200 truncate">{date}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">({dateSessions.length})</span>
                      {activeInDate > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold font-mono shrink-0">
                          ⚡ {activeInDate}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-amber-400 font-mono shrink-0">
                      ฿{dateTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </button>

                  {/* Expanded Compact Mobile Cards */}
                  {isExpanded && (
                    <div className="divide-y divide-slate-800/80 p-1.5 space-y-1.5">
                      {dateSessions.map((s, index) => {
                        const isCharging = s.status?.toLowerCase() === 'charging';
                        const startTime = new Date(s.startTime);
                        const elapsedMins = isNaN(startTime.getTime()) ? 0 : Math.max(1, Math.round((Date.now() - startTime.getTime()) / 60000));
                        const estDuration = Math.min(elapsedMins, (100 - (s.startSOC || 0)) * 1.45);
                        const estEnergy = Math.round(((estDuration * 16) / 60) * 10) / 10;
                        const estCost = Math.round(estEnergy * (s.pricePerUnit || 3.50) * 100) / 100;
                        const startStr = s.startTime ? new Date(s.startTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) : '-';
                        const endStr = s.endTime ? new Date(s.endTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) : '-';
                        const costVal = !isCharging
                          ? (s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5)))
                          : estCost;

                        return (
                          <div
                            key={`${s.id}-${index}`}
                            className={`rounded-lg p-2.5 font-mono text-xs space-y-1.5 ${
                              isCharging
                                ? 'bg-amber-950/20 border border-amber-500/40'
                                : 'bg-slate-900/90 border border-slate-800/80'
                            }`}
                          >
                            {/* Row 1: Truck + Station + Time | Cost + Status */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-bold text-white text-xs shrink-0">{s.truckId}</span>
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-semibold shrink-0">
                                  {s.stationId}
                                </span>
                                <span className="text-[10px] text-slate-400 truncate">
                                  {startStr}{isCharging ? ' → กำลังชาร์จ' : ` - ${endStr}`}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="font-bold text-amber-400 text-xs">
                                  {isCharging ? '~' : ''}฿{costVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 ${
                                    isCharging
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                                      : s.isAutoCompleted || s.endSOC >= 100
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  }`}
                                >
                                  {isCharging ? '⚡ ชาร์จ' : s.isAutoCompleted || s.endSOC >= 100 ? '100%' : 'สำเร็จ'}
                                </span>
                              </div>
                            </div>

                            {/* Row 2: Operator | SOC + kWh + Duration */}
                            <div className="flex items-center justify-between gap-2 text-[10px] pt-1 border-t border-slate-800/60">
                              <div className="text-slate-300 truncate min-w-0">
                                <span className="font-semibold text-slate-200">{s.operatorName || '-'}</span>
                                {!isCharging && s.stoppedBy && s.stoppedBy !== s.operatorName && (
                                  <span className="text-slate-500 ml-1">(ปลด: {s.stoppedBy})</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
                                <span className="text-slate-300 font-semibold">
                                  {s.startSOC}%→{isCharging ? '...' : `${s.endSOC}%`}
                                </span>
                                <span>·</span>
                                <span className="text-emerald-400 font-bold">
                                  {isCharging ? `~${estEnergy}` : s.energyConsumed.toLocaleString()} kWh
                                </span>
                                <span>·</span>
                                <span className="text-slate-300">
                                  {isCharging ? `~${elapsedMins}m` : `${s.duration}m`}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-10 text-slate-600 text-xs font-mono">
              <div className="flex flex-col items-center gap-2">
                <ClipboardList className="w-7 h-7 text-slate-700" />
                <span className="font-bold uppercase tracking-wider">ไม่พบข้อมูลประวัติการชาร์จ</span>
              </div>
            </div>
          )}
        </div>

        {/* TABLET & DESKTOP VIEW (>= 768px): Full Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                <th className="py-2 px-3 whitespace-nowrap">SESSION ID</th>
                <th className="py-2 px-3 whitespace-nowrap">TRACTOR</th>
                <th className="py-2 px-3 whitespace-nowrap">BAY</th>
                <th className="py-2 px-3 whitespace-nowrap">OPERATOR</th>
                <th className="py-2 px-3 whitespace-nowrap">START</th>
                <th className="py-2 px-3 whitespace-nowrap">END</th>
                <th className="py-2 px-3 whitespace-nowrap">SOC DELTA (%)</th>
                <th className="py-2 px-3 text-right whitespace-nowrap">ENERGY (kWh)</th>
                <th className="py-2 px-3 text-right whitespace-nowrap">DURATION</th>
                <th className="py-2 px-3 text-right whitespace-nowrap">COST (THB)</th>
                <th className="py-2 px-3 text-center whitespace-nowrap">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {Object.keys(groupedSessions).length > 0 ? (
                Object.entries(groupedSessions).map(([date, dateSessions]) => {
                  const isExpanded = isFiltering ? !expandedDates.has(date + '_collapsed') : expandedDates.has(date);
                  const activeInDate = dateSessions.filter(s => s.status?.toLowerCase() === 'charging').length;
                  const dateTotalCost = dateSessions
                    .filter(s => s.status === 'Completed')
                    .reduce((sum, s) => sum + (s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5))), 0);

                  return (
                    <React.Fragment key={date}>
                      <tr 
                        className="bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors"
                        onClick={() => toggleDate(date)}
                      >
                        <td colSpan={9} className="py-2.5 px-3 font-bold text-slate-300 font-mono text-xs whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-emerald-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0" />}
                            <span>วันที่: {date}</span>
                            <span className="text-slate-500 font-normal ml-1">({dateSessions.length} รายการ)</span>
                            {activeInDate > 0 && (
                              <span className="ml-2 px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse font-bold flex items-center gap-1 font-mono">
                                ⚡ กำลังชาร์จ {activeInDate} คัน
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-amber-400 font-mono text-xs whitespace-nowrap">
                          ฿{dateTotalCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap"></td>
                      </tr>
                      {isExpanded && dateSessions.map((s, index) => {
                        const isCharging = s.status?.toLowerCase() === 'charging';
                        const startTime = new Date(s.startTime);
                        const elapsedMins = isNaN(startTime.getTime()) ? 0 : Math.max(1, Math.round((Date.now() - startTime.getTime()) / 60000));
                        const estDuration = Math.min(elapsedMins, (100 - (s.startSOC || 0)) * 1.45);
                        const estEnergy = Math.round(((estDuration * 16) / 60) * 10) / 10;
                        const estCost = Math.round(estEnergy * (s.pricePerUnit || 3.50) * 100) / 100;

                        return (
                          <tr 
                            key={`${s.id}-${index}`} 
                            className={`text-[11px] hover:bg-slate-950/40 transition-all font-mono ${
                              isCharging ? 'bg-amber-950/15 border-l-2 border-l-amber-400' : ''
                            }`}
                          >
                            <td className="py-2 px-3 font-bold text-slate-400 pl-6 whitespace-nowrap">
                              {s.id}
                            </td>
                            <td className="py-2 px-3 font-bold text-white whitespace-nowrap">
                              {s.truckId}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-300 whitespace-nowrap">
                              {s.stationId}
                            </td>
                            <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                              <div className="font-semibold text-slate-200">{s.operatorName || '-'}</div>
                              {s.isAutoCompleted ? (
                                <div className="text-[9px] text-emerald-400 font-mono flex items-center gap-0.5">
                                  <span>ปลด: {s.stoppedBy || s.operatorName} (Auto 100%)</span>
                                </div>
                              ) : s.stoppedBy && s.stoppedBy !== s.operatorName ? (
                                <div className="text-[9px] text-slate-400 font-mono">
                                  ปลด: {s.stoppedBy}
                                </div>
                              ) : null}
                            </td>
                            <td className="py-2 px-3 text-[10px] text-slate-500 whitespace-nowrap">
                              {s.startTime ? new Date(s.startTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) : '-'}
                            </td>
                            <td className="py-2 px-3 text-[10px] whitespace-nowrap">
                              {isCharging ? (
                                <span className="text-amber-400 font-semibold animate-pulse flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> กำลังชาร์จ...
                                </span>
                              ) : (
                                <span className="text-slate-500">
                                  {s.endTime ? new Date(s.endTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) : '-'}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-[10px] whitespace-nowrap">
                              {!isCharging ? (
                                <span className="text-slate-400 font-semibold">
                                  {s.startSOC}% <span className="text-slate-600">→</span> {s.endSOC}%
                                </span>
                              ) : (
                                <span className="text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 animate-pulse">
                                  {s.startSOC}% → กำลังชาร์จ
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-bold whitespace-nowrap">
                              {!isCharging ? (
                                <span className="text-emerald-400">{s.energyConsumed.toLocaleString()} kWh</span>
                              ) : (
                                <span className="text-amber-300 font-medium">~{estEnergy} kWh</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-semibold whitespace-nowrap">
                              {!isCharging ? (
                                <span className="text-slate-300">{s.duration}m</span>
                              ) : (
                                <span className="text-amber-300">~{elapsedMins}m</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-bold whitespace-nowrap">
                              {!isCharging ? (
                                <span className="text-amber-400">฿{(s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5))).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                              ) : (
                                <span className="text-amber-400 font-medium">~฿{estCost.toFixed(2)}</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              <span
                                className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono inline-flex items-center gap-1 ${
                                  isCharging
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse shadow-sm'
                                    : s.isAutoCompleted || s.endSOC >= 100
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                }`}
                              >
                                {isCharging ? (
                                  <>⚡ CHARGING</>
                                ) : s.isAutoCompleted || s.endSOC >= 100 ? (
                                  <>
                                    <Zap className="w-2.5 h-2.5 text-emerald-400" />
                                    AUTO 100%
                                  </>
                                ) : (
                                  <>COMPLETED</>
                                )}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-slate-600 text-xs font-mono whitespace-nowrap">
                    <div className="flex flex-col items-center gap-2">
                      <ClipboardList className="w-8 h-8 text-slate-700" />
                      <span className="font-bold uppercase tracking-wider">NO_LOG_DATA_FOUND</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 md:mt-4 pt-2.5 md:pt-3 border-t border-slate-800/60 gap-2 font-mono">
            <span className="text-[11px] md:text-xs text-slate-400">
              {startIndex + 1}-{Math.min(endIndex, totalCount)} จาก {totalCount}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={activePage === 1}
                className="p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-all cursor-pointer"
                title="ย้อนกลับ (Previous Page)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <span className="text-[11px] md:text-xs text-slate-300 px-2.5 py-1 bg-slate-950 border border-slate-800 rounded text-center">
                {activePage} / {totalPages}
              </span>
              
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={activePage === totalPages}
                className="p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-all cursor-pointer"
                title="ถัดไป (Next Page)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Compact Load More / Full History Actions */}
        {!isFullHistoryLoaded && (onLoadMore || onLoadFullHistory) && (
          <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex flex-wrap items-center justify-center gap-2">
            {onLoadMore && !isLastPage && (
              <button
                onClick={onLoadMore}
                disabled={isLoading || isLoadingFullHistory}
                className="flex-1 sm:flex-initial px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-emerald-500/40 text-emerald-400 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    กำลังโหลด...
                  </>
                ) : (
                  <>
                    <Database className="w-3.5 h-3.5 text-emerald-400" />
                    โหลดเพิ่ม +100 {totalHistoryCount > sessions.length ? `(${sessions.length.toLocaleString()}/${totalHistoryCount.toLocaleString()})` : ''}
                  </>
                )}
              </button>
            )}
            {onLoadFullHistory && (
              <button
                onClick={onLoadFullHistory}
                disabled={isLoadingFullHistory || isLoading}
                className="flex-1 sm:flex-initial px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                {isLoadingFullHistory ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    กำลังดึงข้อมูล...
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    โหลดทั้งหมด {totalHistoryCount ? `(${totalHistoryCount.toLocaleString()})` : ''}
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
