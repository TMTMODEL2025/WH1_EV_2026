import React, { useState, useMemo } from 'react';
import { EVTruck, ChargingStation, SessionLog } from '../types/ev';
import { 
  Calendar, 
  BarChart3, 
  TrendingUp, 
  Zap, 
  Clock, 
  DollarSign, 
  Truck, 
  Download, 
  ChevronRight, 
  ChevronLeft,
  ChevronDown,
  User, 
  SlidersHorizontal,
  FileSpreadsheet,
  Award,
  ZapOff,
  RefreshCw
} from 'lucide-react';
import Swal from 'sweetalert2';
import { getThailandDateString, getThailandMonthString, getThailandHour, formatDateToTH, parseThailandDate } from '../utils/date';

interface ReportsProps {
  sessions: SessionLog[];
  stations: ChargingStation[];
  trucks: EVTruck[];
  isFullHistoryLoaded?: boolean;
  totalHistoryCount?: number;
  onLoadFullHistory?: () => Promise<void> | void;
  isLoadingFullHistory?: boolean;
}

export default function Reports({
  sessions,
  stations,
  trucks,
  isFullHistoryLoaded = false,
  totalHistoryCount = 0,
  onLoadFullHistory,
  isLoadingFullHistory = false,
}: ReportsProps) {
  // Report scope: 'daily' | 'weekly' | 'monthly' | 'vehicles' | 'comparison'
  const [reportType, setReportType] = useState<'daily' | 'weekly' | 'monthly' | 'vehicles' | 'comparison'>('daily');
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [compareMetric, setCompareMetric] = useState<'energy' | 'cost' | 'sessions'>('energy');
  const [expandedCompareMonths, setExpandedCompareMonths] = useState<Set<string>>(new Set());
  const [hoveredSegment, setHoveredSegment] = useState<{
    month: string;
    id: string;
    name: string;
    value: number;
    type: 'station' | 'truck';
  } | null>(null);

  const [operatorPage, setOperatorPage] = useState<number>(1);
  const [groupedLogsPage, setGroupedLogsPage] = useState<number>(1);
  const [groupedLogsPerPage, setGroupedLogsPerPage] = useState<number>(10);
  
  // Date filters
  const [selectedDate, setSelectedDate] = useState<string>(() => getThailandDateString());

  const [selectedMonth, setSelectedMonth] = useState<string>(() => getThailandMonthString());

  // Calculate stats for all vehicles
  const vehiclesData = useMemo(() => {
    return trucks.map(truck => {
      // Find completed sessions for this truck
      const truckSessions = sessions.filter(s => s.truckId === truck.id && s.status === 'Completed');
      
      const totalSessions = truckSessions.length;
      const totalEnergy = truckSessions.reduce((sum, s) => sum + (s.energyConsumed || 0), 0);
      const totalCost = truckSessions.reduce((sum, s) => sum + (s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5))), 0);
      const totalDuration = truckSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
      
      // Calculate odometer mileage run if possible
      const odometers = truckSessions.map(s => s.odometer).filter((od): od is number => od !== undefined && od > 0);
      const mileageRun = odometers.length > 1 ? (Math.max(...odometers) - Math.min(...odometers)) : 0;
      
      const avgDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;
      const avgEnergy = totalSessions > 0 ? totalEnergy / totalSessions : 0;
      
      return {
        truck,
        totalSessions,
        totalEnergy,
        totalCost,
        totalDuration,
        avgDuration,
        avgEnergy,
        mileageRun,
        latestOdometer: truck.currentOdometer || (odometers.length > 0 ? Math.max(...odometers) : 0),
        sessionsList: truckSessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      };
    }).sort((a, b) => b.totalEnergy - a.totalEnergy);
  }, [sessions, trucks]);


  React.useEffect(() => {
    setOperatorPage(1);
    setGroupedLogsPage(1);
  }, [selectedDate, selectedMonth, reportType, selectedTruckId]);

  const selectedTruckStats = useMemo(() => {
    if (!selectedTruckId) return null;
    return vehiclesData.find(v => v.truck.id === selectedTruckId);
  }, [vehiclesData, selectedTruckId]);

  const recentSessionsForChart = useMemo(() => {
    if (!selectedTruckStats) return [];
    return [...selectedTruckStats.sessionsList].slice(0, 7).reverse();
  }, [selectedTruckStats]);

  const selectedTruckGroupedSessions = useMemo(() => {
    if (!selectedTruckStats) return {};
    return selectedTruckStats.sessionsList.reduce((acc, session) => {
      const dateStr = session.startTime ? formatDateToTH(new Date(session.startTime)) : 'ไม่ระบุวันที่';
      if (!acc[dateStr]) acc[dateStr] = [];
      acc[dateStr].push(session);
      return acc;
    }, {} as Record<string, SessionLog[]>);
  }, [selectedTruckStats]);

  const paginatedGroupedSessions = useMemo(() => {
    const entries = Object.entries(selectedTruckGroupedSessions);
    const totalCount = entries.length;
    const totalPages = Math.ceil(totalCount / groupedLogsPerPage) || 1;
    
    // Clamp current page to a valid range
    const currentPage = Math.min(Math.max(1, groupedLogsPage), totalPages);
    const startIndex = (currentPage - 1) * groupedLogsPerPage;
    const endIndex = startIndex + groupedLogsPerPage;
    const paginatedEntries = entries.slice(startIndex, endIndex);
    
    return {
      entries: paginatedEntries,
      totalCount,
      totalPages,
      currentPage
    };
  }, [selectedTruckGroupedSessions, groupedLogsPage, groupedLogsPerPage]);

  const toggleDate = (date: string) => {
    const newSet = new Set(expandedDates);
    if (newSet.has(date)) {
      newSet.delete(date);
    } else {
      newSet.add(date);
    }
    setExpandedDates(newSet);
  };

  // Export helper (generates CSV of the current report scope)
  const handleExportCSV = (title: string, headers: string[], rows: string[][]) => {
    const csvContent = "\uFEFF" + [
      headers.join(","),
      ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${title}_${new Date().toLocaleDateString('th-TH')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Swal.fire({
      title: 'ส่งออกรายงานสำเร็จ!',
      text: `ดาวน์โหลดไฟล์รายงาน ${title} เรียบร้อยแล้ว`,
      icon: 'success',
      background: '#0f172a',
      color: '#f8fafc',
      confirmButtonColor: '#10b981',
    });
  };

  // 1.5 MONTHLY COMPARATIVE COMPUTATION
  const comparisonData = useMemo(() => {
    // 1. Deduplicate stations and trucks by ID to avoid double-counting
    const uniqueStations: ChargingStation[] = [];
    const seenStations = new Set<string>();
    stations.forEach(st => {
      if (st.id) {
        const idNorm = st.id.trim().toUpperCase();
        if (!seenStations.has(idNorm)) {
          seenStations.add(idNorm);
          uniqueStations.push(st);
        }
      }
    });

    const uniqueTrucks: EVTruck[] = [];
    const seenTrucks = new Set<string>();
    trucks.forEach(tr => {
      if (tr.id) {
        const idNorm = tr.id.trim().toUpperCase();
        if (!seenTrucks.has(idNorm)) {
          seenTrucks.add(idNorm);
          uniqueTrucks.push(tr);
        }
      }
    });

    const stationIdsSet = new Set(uniqueStations.map(st => st.id.trim().toUpperCase()));
    const truckIdsSet = new Set(uniqueTrucks.map(tr => tr.id.trim().toUpperCase()));

    // 2. Filter completed sessions strictly
    const completed = sessions.filter(s => {
      if (s.status !== 'Completed' || !s.startTime) return false;
      const sId = s.stationId ? s.stationId.trim().toUpperCase() : '';
      const tId = s.truckId ? s.truckId.trim().toUpperCase() : '';
      return stationIdsSet.has(sId) && truckIdsSet.has(tId);
    });
    
    // Find unique months in 'YYYY-MM' format using Thailand timezone
    const monthsSet = new Set<string>();
    completed.forEach(s => {
      const d = parseThailandDate(s.startTime);
      if (!isNaN(d.getTime())) {
        const mKey = getThailandMonthString(d);
        monthsSet.add(mKey);
      }
    });

    // Fallback: if no months found in database, default to last 6 months
    if (monthsSet.size === 0) {
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        monthsSet.add(`${year}-${month}`);
      }
    }

    const sortedMonths = Array.from(monthsSet).sort();

    // Map station monthly comparative data
    const stationCompare = uniqueStations.map((station, sIdx) => {
      const monthlyEnergy: Record<string, number> = {};
      const monthlyCost: Record<string, number> = {};
      const monthlySessions: Record<string, number> = {};

      sortedMonths.forEach(m => {
        monthlyEnergy[m] = 0;
        monthlyCost[m] = 0;
        monthlySessions[m] = 0;
      });

      completed.filter(s => s.stationId && s.stationId.trim().toUpperCase() === station.id.trim().toUpperCase()).forEach(s => {
        const d = parseThailandDate(s.startTime);
        const mKey = getThailandMonthString(d);
        if (monthlyEnergy[mKey] !== undefined) {
          monthlyEnergy[mKey] += s.energyConsumed || 0;
          monthlyCost[mKey] += s.totalCost || ((s.energyConsumed || 0) * (s.pricePerUnit || 3.5));
          monthlySessions[mKey] += 1;
        }
      });

      return {
        id: station.id,
        name: station.name,
        color: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e'][sIdx % 7],
        monthlyEnergy,
        monthlyCost,
        monthlySessions,
        totalEnergy: Object.values(monthlyEnergy).reduce((a, b) => a + b, 0),
        totalCost: Object.values(monthlyCost).reduce((a, b) => a + b, 0),
        totalSessions: Object.values(monthlySessions).reduce((a, b) => a + b, 0)
      };
    });

    // Map truck monthly comparative data
    const truckCompare = uniqueTrucks.map((truck, tIdx) => {
      const monthlyEnergy: Record<string, number> = {};
      const monthlyCost: Record<string, number> = {};
      const monthlySessions: Record<string, number> = {};

      sortedMonths.forEach(m => {
        monthlyEnergy[m] = 0;
        monthlyCost[m] = 0;
        monthlySessions[m] = 0;
      });

      completed.filter(s => s.truckId && s.truckId.trim().toUpperCase() === truck.id.trim().toUpperCase()).forEach(s => {
        const d = parseThailandDate(s.startTime);
        const mKey = getThailandMonthString(d);
        if (monthlyEnergy[mKey] !== undefined) {
          monthlyEnergy[mKey] += s.energyConsumed || 0;
          monthlyCost[mKey] += s.totalCost || ((s.energyConsumed || 0) * (s.pricePerUnit || 3.5));
          monthlySessions[mKey] += 1;
        }
      });

      return {
        id: truck.id,
        licensePlate: truck.licensePlate,
        model: truck.model,
        color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e', '#eab308', '#6366f1'][tIdx % 10],
        monthlyEnergy,
        monthlyCost,
        monthlySessions,
        totalEnergy: Object.values(monthlyEnergy).reduce((a, b) => a + b, 0),
        totalCost: Object.values(monthlyCost).reduce((a, b) => a + b, 0),
        totalSessions: Object.values(monthlySessions).reduce((a, b) => a + b, 0)
      };
    });

    return {
      months: sortedMonths,
      stationCompare,
      truckCompare
    };
  }, [sessions, stations, trucks]);

  const maxStationMonthlyTotal = useMemo(() => {
    let maxVal = 10;
    [...comparisonData.months].reverse().forEach(m => {
      const total = comparisonData.stationCompare.reduce((sum, st) => {
        const val = compareMetric === 'energy' 
          ? st.monthlyEnergy[m] 
          : compareMetric === 'cost' 
          ? st.monthlyCost[m] 
          : st.monthlySessions[m];
        return sum + val;
      }, 0);
      if (total > maxVal) maxVal = total;
    });
    return maxVal;
  }, [comparisonData, compareMetric]);

  const maxTruckMonthlyTotal = useMemo(() => {
    let maxVal = 10;
    [...comparisonData.months].reverse().forEach(m => {
      const total = comparisonData.truckCompare.reduce((sum, tr) => {
        const val = compareMetric === 'energy' 
          ? tr.monthlyEnergy[m] 
          : compareMetric === 'cost' 
          ? tr.monthlyCost[m] 
          : tr.monthlySessions[m];
        return sum + val;
      }, 0);
      if (total > maxVal) maxVal = total;
    });
    return maxVal;
  }, [comparisonData, compareMetric]);

  const formatThaiMonth = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const thaiMonths: Record<string, string> = {
      '01': 'ม.ค.', '02': 'ก.พ.', '03': 'มี.ค.', '04': 'เม.ย.',
      '05': 'พ.ค.', '06': 'มิ.ย.', '07': 'ก.ค.', '08': 'ส.ค.',
      '09': 'ก.ย.', '10': 'ต.ค.', '11': 'พ.ย.', '12': 'ธ.ค.'
    };
    const thYear = parseInt(year) + 543;
    return `${thaiMonths[month] || month} ${String(thYear).slice(-2)}`;
  };

  const formatYAxisValue = (val: number) => {
    if (compareMetric === 'energy') {
      return `${Math.round(val).toLocaleString()} kWh`;
    } else if (compareMetric === 'cost') {
      return `฿${Math.round(val).toLocaleString()}`;
    } else {
      return `${Math.round(val)} รอบ`;
    }
  };

  const toggleCompareMonth = (month: string) => {
    const newSet = new Set(expandedCompareMonths);
    if (newSet.has(month)) {
      newSet.delete(month);
    } else {
      newSet.add(month);
    }
    setExpandedCompareMonths(newSet);
  };

  const triggerComparisonExport = () => {
    const headers = [
      "เดือน",
      "ประเภท",
      "ตู้ชาร์จ (Station)",
      "รถหัวลาก (Truck)",
      "พลังงานรวม (kWh)",
      "ค่าไฟฟ้ารวม (บาท)",
      "รอบการใช้งาน"
    ];

    const rows: string[][] = [];

    [...comparisonData.months].reverse().forEach((m) => {
      // Calculate total stats for this month across all stations and trucks
      const monthEnergy = comparisonData.stationCompare.reduce((sum, st) => sum + (st.monthlyEnergy[m] || 0), 0);
      const monthCost = comparisonData.stationCompare.reduce((sum, st) => sum + (st.monthlyCost[m] || 0), 0);
      const monthSessions = comparisonData.stationCompare.reduce((sum, st) => sum + (st.monthlySessions[m] || 0), 0);

      // 1. Month Total Row
      rows.push([
        formatThaiMonth(m),
        "MONTHLY_TOTAL",
        "-",
        "-",
        monthEnergy.toFixed(1),
        monthCost.toFixed(2),
        `${monthSessions} รอบ`
      ]);

      // 2. Station Rows
      comparisonData.stationCompare.forEach(st => {
        const stEnergy = st.monthlyEnergy[m] || 0;
        const stCost = st.monthlyCost[m] || 0;
        const stSessions = st.monthlySessions[m] || 0;
        if (stSessions === 0 && stEnergy === 0) return;

        rows.push([
          formatThaiMonth(m),
          "ตู้ชาร์จ",
          `${st.id} (${st.name})`,
          "-",
          stEnergy.toFixed(1),
          stCost.toFixed(2),
          `${stSessions} รอบ`
        ]);
      });

      // 3. Truck Rows
      comparisonData.truckCompare.forEach(tr => {
        const trEnergy = tr.monthlyEnergy[m] || 0;
        const trCost = tr.monthlyCost[m] || 0;
        const trSessions = tr.monthlySessions[m] || 0;
        if (trSessions === 0 && trEnergy === 0) return;

        rows.push([
          formatThaiMonth(m),
          "รถหัวลาก",
          "-",
          `${tr.id} (${tr.licensePlate})`,
          trEnergy.toFixed(1),
          trCost.toFixed(2),
          `${trSessions} รอบ`
        ]);
      });
    });

    handleExportCSV(`Monthly_Summaries_Report`, headers, rows);
  };

  // Helper date conversions in TH zone (+07:00)
  const getLocalDate = (dateStr: string) => {
    if (!dateStr) return null;
    return new Date(dateStr);
  };

  const currentFilteredSessions = useMemo(() => {
    let filtered = sessions.filter(s => s.status === 'Completed' && s.startTime);
    if (reportType === 'daily') {
      filtered = filtered.filter(s => {
        const dateLocal = getThailandDateString(parseThailandDate(s.startTime));
        return dateLocal === selectedDate;
      });
    } else if (reportType === 'weekly') {
      const selected = new Date(selectedDate);
      const day = selected.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const startDate = new Date(selected);
      startDate.setDate(selected.getDate() + diffToMonday);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      
      const startStr = getThailandDateString(startDate);
      const endStr = getThailandDateString(endDate);

      filtered = filtered.filter(s => {
        const dStr = getThailandDateString(parseThailandDate(s.startTime));
        return dStr >= startStr && dStr <= endStr;
      });
    } else if (reportType === 'monthly') {
      filtered = filtered.filter(s => {
        return getThailandMonthString(parseThailandDate(s.startTime)) === selectedMonth;
      });
    } else if (reportType === 'vehicles' && selectedTruckId) {
      filtered = filtered.filter(s => s.truckId === selectedTruckId);
    }
    return filtered;
  }, [sessions, reportType, selectedDate, selectedMonth, selectedTruckId]);

  // 1. DAILY REPORT CALCULATION
  const dailyData = useMemo(() => {
    if (reportType !== 'daily') return null;

    const completed = sessions.filter(s => {
      if (s.status !== 'Completed' || !s.startTime) return false;
      const dateLocal = getThailandDateString(parseThailandDate(s.startTime));
      return dateLocal === selectedDate;
    });

    const totalEnergy = completed.reduce((sum, s) => sum + (s.energyConsumed || 0), 0);
    const totalCost = completed.reduce((sum, s) => sum + (s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5))), 0);
    const totalDuration = completed.reduce((sum, s) => sum + (s.duration || 0), 0);
    const totalSessions = completed.length;
    const avgEnergy = totalSessions > 0 ? totalEnergy / totalSessions : 0;
    const avgDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;

    // Hourly peak breakdown (0-23 hours)
    const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => {
      const hrSessions = completed.filter(s => {
        return getThailandHour(parseThailandDate(s.startTime)) === hour;
      });
      const hrEnergy = hrSessions.reduce((sum, s) => sum + (s.energyConsumed || 0), 0);
      const uniqueTruckIds = Array.from(new Set(hrSessions.map(s => s.truckId).filter(Boolean)));
      return { 
        hour, 
        sessions: hrSessions.length, 
        energy: hrEnergy, 
        trucksCount: uniqueTruckIds.length, 
        trucksList: uniqueTruckIds 
      };
    });

    // Station breakdown
    const stationBreakdown = stations.map(station => {
      const stationSessions = completed.filter(s => s.stationId === station.id);
      const energy = stationSessions.reduce((sum, s) => sum + (s.energyConsumed || 0), 0);
      const cost = stationSessions.reduce((sum, s) => sum + (s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5))), 0);
      return {
        id: station.id,
        name: station.name.split(' - ')[0],
        cycles: stationSessions.length,
        energy,
        cost
      };
    });

    // Driver activity breakdown
    const driverMap: Record<string, { cycles: number; energy: number; cost: number }> = {};
    completed.forEach(s => {
      const op = s.operatorName || 'ไม่ระบุชื่อ';
      if (!driverMap[op]) {
        driverMap[op] = { cycles: 0, energy: 0, cost: 0 };
      }
      driverMap[op].cycles += 1;
      driverMap[op].energy += s.energyConsumed || 0;
      driverMap[op].cost += s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5));
    });

    const driverBreakdown = Object.entries(driverMap).map(([name, stats]) => ({
      name,
      ...stats
    })).sort((a, b) => b.energy - a.energy);

    // Vehicle activity breakdown today
    const vehicleMap: Record<string, { cycles: number; energy: number; cost: number }> = {};
    completed.forEach(s => {
      const id = s.truckId || 'ไม่ระบุรถ';
      if (!vehicleMap[id]) {
        vehicleMap[id] = { cycles: 0, energy: 0, cost: 0 };
      }
      vehicleMap[id].cycles += 1;
      vehicleMap[id].energy += s.energyConsumed || 0;
      vehicleMap[id].cost += s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5));
    });

    const vehicleBreakdown = Object.entries(vehicleMap).map(([id, stats]) => {
      const truckObj = trucks.find(t => t.id === id);
      return {
        id,
        licensePlate: truckObj?.licensePlate || 'ไม่ระบุทะเบียน',
        model: truckObj?.model || 'ไม่ระบุรุ่น',
        ...stats
      };
    }).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));

    return {
      completed,
      totalEnergy,
      totalCost,
      totalDuration,
      totalSessions,
      avgEnergy,
      avgDuration,
      hourlyDistribution,
      stationBreakdown,
      driverBreakdown,
      vehicleBreakdown
    };
  }, [sessions, stations, trucks, selectedDate, reportType]);

  // 2. WEEKLY REPORT CALCULATION (Last 7 Days from Selected Date)
  const weeklyData = useMemo(() => {
    if (reportType !== 'weekly') return null;

    const selected = new Date(selectedDate);
    const day = selected.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const startDate = new Date(selected);
    startDate.setDate(selected.getDate() + diffToMonday);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    const startStr = getThailandDateString(startDate);
    const endStr = getThailandDateString(endDate);

    const completed = sessions.filter(s => {
      if (s.status !== 'Completed' || !s.startTime) return false;
      const dStr = getThailandDateString(parseThailandDate(s.startTime));
      return dStr >= startStr && dStr <= endStr;
    });

    // Group by Day of Week
    const daysTh = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    const dailySeries = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + idx);
      const dStr = getThailandDateString(d);
      const daySessions = completed.filter(s => {
        const sDateStr = getThailandDateString(parseThailandDate(s.startTime));
        return sDateStr === dStr;
      });
      const energy = daySessions.reduce((sum, s) => sum + (s.energyConsumed || 0), 0);
      const cost = daySessions.reduce((sum, s) => sum + (s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5))), 0);
      const uniqueTruckIds = Array.from(new Set(daySessions.map(s => s.truckId).filter(Boolean)));
      return {
        label: `${daysTh[d.getDay()]} (${d.getDate()}/${d.getMonth()+1})`,
        energy,
        cost,
        sessionsCount: daySessions.length,
        trucksCount: uniqueTruckIds.length,
        trucksList: uniqueTruckIds
      };
    });

    const totalEnergy = completed.reduce((sum, s) => sum + (s.energyConsumed || 0), 0);
    const totalCost = completed.reduce((sum, s) => sum + (s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5))), 0);
    const totalSessions = completed.length;

    // Vehicle usage breakdown
    const vehicleMap: Record<string, { cycles: number; energy: number; cost: number }> = {};
    completed.forEach(s => {
      const vehicle = s.truckId || 'ไม่ระบุรถ';
      if (!vehicleMap[vehicle]) {
        vehicleMap[vehicle] = { cycles: 0, energy: 0, cost: 0 };
      }
      vehicleMap[vehicle].cycles += 1;
      vehicleMap[vehicle].energy += s.energyConsumed || 0;
      vehicleMap[vehicle].cost += s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5));
    });

    const vehicleBreakdown = Object.entries(vehicleMap).map(([id, stats]) => {
      const tInfo = trucks.find(t => t.id === id);
      return {
        id,
        licensePlate: tInfo?.licensePlate || 'ไม่ระบุทะเบียน',
        model: tInfo?.model || 'ไม่ระบุรุ่น',
        ...stats
      };
    }).sort((a, b) => b.energy - a.energy);

    return {
      completed,
      startDate: startDate.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' }),
      endDate: endDate.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' }),
      totalEnergy,
      totalCost,
      totalSessions,
      dailySeries,
      vehicleBreakdown
    };
  }, [sessions, trucks, selectedDate, reportType]);

  // 3. MONTHLY REPORT CALCULATION
  const monthlyData = useMemo(() => {
    if (reportType !== 'monthly') return null;

    const [year, month] = selectedMonth.split('-').map(Number);

    const completed = sessions.filter(s => {
      if (s.status !== 'Completed' || !s.startTime) return false;
      return getThailandMonthString(parseThailandDate(s.startTime)) === selectedMonth;
    });

    const totalEnergy = completed.reduce((sum, s) => sum + (s.energyConsumed || 0), 0);
    const totalCost = completed.reduce((sum, s) => sum + (s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5))), 0);
    const totalSessions = completed.length;

    // Group by Weeks of Month
    const weeklySeries = Array.from({ length: 5 }, (_, idx) => {
      const weekSessions = completed.filter(s => {
        const dStr = getThailandDateString(parseThailandDate(s.startTime));
        const day = parseInt(dStr.split('-')[2], 10);
        if (idx === 0) return day >= 1 && day <= 7;
        if (idx === 1) return day >= 8 && day <= 14;
        if (idx === 2) return day >= 15 && day <= 21;
        if (idx === 3) return day >= 22 && day <= 28;
        return day >= 29;
      });
      const energy = weekSessions.reduce((sum, s) => sum + (s.energyConsumed || 0), 0);
      const cost = weekSessions.reduce((sum, s) => sum + (s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5))), 0);
      
      // Calculate unique truck IDs charged this week
      const uniqueTruckIds = Array.from(new Set(weekSessions.map(s => s.truckId).filter(Boolean)));
      
      return {
        label: `สัปดาห์ที่ ${idx + 1}`,
        energy,
        cost,
        sessionsCount: weekSessions.length,
        trucksCount: uniqueTruckIds.length,
        trucksList: uniqueTruckIds
      };
    });

    // Station efficiency rate (Usage / total monthly sessions)
    const stationBreakdown = stations.map(station => {
      const stationSessions = completed.filter(s => s.stationId === station.id);
      const energy = stationSessions.reduce((sum, s) => sum + (s.energyConsumed || 0), 0);
      const cost = stationSessions.reduce((sum, s) => sum + (s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5))), 0);
      return {
        id: station.id,
        name: station.name.split(' - ')[0],
        cycles: stationSessions.length,
        energy,
        cost,
        percentage: totalSessions > 0 ? (stationSessions.length / totalSessions) * 100 : 0
      };
    }).sort((a, b) => b.energy - a.energy);

    // Driver monthly stats
    const driverMap: Record<string, { cycles: number; energy: number; cost: number }> = {};
    completed.forEach(s => {
      const name = s.operatorName || 'ไม่ระบุชื่อ';
      if (!driverMap[name]) {
        driverMap[name] = { cycles: 0, energy: 0, cost: 0 };
      }
      driverMap[name].cycles += 1;
      driverMap[name].energy += s.energyConsumed || 0;
      driverMap[name].cost += s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5));
    });

    const driverBreakdown = Object.entries(driverMap).map(([name, stats]) => ({
      name,
      ...stats
    })).sort((a, b) => b.energy - a.energy);

    // Vehicle monthly stats
    const vehicleMap: Record<string, { cycles: number; energy: number; cost: number }> = {};
    completed.forEach(s => {
      const id = s.truckId || 'ไม่ระบุรถ';
      if (!vehicleMap[id]) {
        vehicleMap[id] = { cycles: 0, energy: 0, cost: 0 };
      }
      vehicleMap[id].cycles += 1;
      vehicleMap[id].energy += s.energyConsumed || 0;
      vehicleMap[id].cost += s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5));
    });

    const vehicleBreakdown = Object.entries(vehicleMap).map(([id, stats]) => {
      const truckObj = trucks.find(t => t.id === id);
      return {
        id,
        licensePlate: truckObj?.licensePlate || 'ไม่ระบุทะเบียน',
        model: truckObj?.model || 'ไม่ระบุรุ่น',
        ...stats
      };
    }).sort((a, b) => b.energy - a.energy);

    return {
      completed,
      totalEnergy,
      totalCost,
      totalSessions,
      weeklySeries,
      stationBreakdown,
      driverBreakdown,
      vehicleBreakdown
    };
  }, [sessions, stations, trucks, selectedMonth, reportType]);

  // Export Daily CSV Action
  const triggerDailyExport = () => {
    if (!dailyData) return;
    const headers = ["Session ID", "ทะเบียนรถ", "ตู้ชาร์จ", "พนักงานขับรถ", "เวลาเริ่มชาร์จ", "เวลาสิ้นสุดชาร์จ", "พลังงาน (kWh)", "เวลาชาร์จ (นาที)", "ราคาต่อหน่วย (บาท)", "ราคารวม (บาท)"];
    const rows = dailyData.completed.map(s => {
      const truckObj = trucks.find(t => t.id === s.truckId);
      const stationObj = stations.find(st => st.id === s.stationId);
      return [
        s.id,
        truckObj ? truckObj.licensePlate : s.truckId,
        stationObj ? stationObj.name : s.stationId,
        s.operatorName || '-',
        s.startTime ? new Date(s.startTime).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '-',
        s.endTime ? new Date(s.endTime).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '-',
        (s.energyConsumed || 0).toString(),
        (s.duration || 0).toString(),
        (s.pricePerUnit || 3.5).toString(),
        (s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5))).toFixed(2)
      ];
    });
    handleExportCSV(`Daily_Report_${selectedDate}`, headers, rows);
  };

  // Export Weekly CSV Action
  const triggerWeeklyExport = () => {
    if (!weeklyData) return;
    const headers = [
      "ID รถหัวลาก", 
      "ป้ายทะเบียน", 
      "รุ่นรถ", 
      "รอบประจุไฟฟ้า", 
      "พลังงานไฟฟ้ารวม (kWh)", 
      "มูลค่าไฟฟ้ารวม (บาท)"
    ];
    const rows = weeklyData.vehicleBreakdown.map(v => [
      v.id,
      v.licensePlate,
      v.model,
      v.cycles.toString(),
      v.energy.toFixed(1),
      v.cost.toFixed(2)
    ]);
    handleExportCSV(`Weekly_Performance_Report_${weeklyData.startDate}_to_${weeklyData.endDate}`, headers, rows);
  };

  // Export Monthly CSV Action
  const triggerMonthlyExport = () => {
    if (!monthlyData) return;
    const headers = [
      "รหัสตู้ชาร์จ",
      "ชื่อตู้ชาร์จ",
      "รอบการใช้งาน (ครั้ง)",
      "พลังงานสะสม (kWh)",
      "สัดส่วนการใช้งาน (%)",
      "รวมมูลค่าไฟฟ้า (บาท)"
    ];
    const rows = monthlyData.stationBreakdown.map(st => [
      st.id,
      st.name,
      st.cycles.toString(),
      st.energy.toFixed(1),
      st.percentage.toFixed(1),
      st.cost.toFixed(2)
    ]);
    handleExportCSV(`Monthly_Efficiency_Report_${selectedMonth}`, headers, rows);
  };

  // Export Vehicles CSV Action
  const triggerVehiclesExport = () => {
    if (!vehiclesData) return;
    const headers = [
      "ID รถหัวลาก", 
      "ป้ายทะเบียน", 
      "รุ่นโมเดล", 
      "ความจุแบตเตอรี่ (kWh)", 
      "จำนวนรอบชาร์จทั้งหมด", 
      "พลังงานไฟฟ้ารวม (kWh)", 
      "รวมมูลค่าไฟฟ้า (บาท)"
    ];
    const rows = vehiclesData.map(v => [
      v.truck.id,
      v.truck.licensePlate,
      v.truck.model,
      v.truck.batteryCapacity.toString(),
      v.totalSessions.toString(),
      v.totalEnergy.toFixed(1),
      v.totalCost.toFixed(2)
    ]);
    handleExportCSV(`Vehicles_Performance_Report`, headers, rows);
  };

  // Calculate daily operator breakdown pagination
  const itemsPerPage = 10;
  const dailyTotalDrivers = dailyData?.driverBreakdown?.length || 0;
  const dailyTotalPages = Math.ceil(dailyTotalDrivers / itemsPerPage) || 1;
  const currentDailyDrivers = useMemo(() => {
    if (!dailyData?.driverBreakdown) return [];
    const startIdx = (operatorPage - 1) * itemsPerPage;
    return dailyData.driverBreakdown.slice(startIdx, startIdx + itemsPerPage);
  }, [dailyData?.driverBreakdown, operatorPage]);

  return (
    <div className="space-y-3 md:space-y-4" id="reports-section">
      {/* Top Header Controls (Responsive layout) */}
      <div className="flex flex-col gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3 md:p-4 shadow-sm" id="reports-header-controls">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-xs md:text-base font-black text-white flex items-center gap-2 font-mono truncate">
              <BarChart3 className="w-4 h-4 md:w-5 md:h-5 text-emerald-400 shrink-0" />
              <span className="truncate">รายงานสถิติพลังงาน ({sessions.length.toLocaleString()} รายการ)</span>
            </h2>
            <p className="hidden sm:block text-xs text-slate-500 font-semibold mt-0.5">รายงานสถิติรอบการประจุพลังงาน อัตราการใช้ไฟ และประวัติแยกตามรายคันและรายตู้ชาร์จ</p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isFullHistoryLoaded && onLoadFullHistory && (
              <button
                onClick={onLoadFullHistory}
                disabled={isLoadingFullHistory}
                className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-bold text-[10px] md:text-xs rounded-lg transition-all flex items-center gap-1 active:scale-95 disabled:opacity-50 cursor-pointer font-mono"
                title="โหลดประวัติสะสมทั้งหมดจาก Google Sheets"
              >
                {isLoadingFullHistory ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Download className="w-3 h-3" />
                )}
                <span>โหลดทั้งหมด {totalHistoryCount ? `(${totalHistoryCount.toLocaleString()})` : ''}</span>
              </button>
            )}

            {/* Export CSV button */}
            <button
              onClick={() => {
                if (reportType === 'daily') triggerDailyExport();
                else if (reportType === 'weekly') triggerWeeklyExport();
                else if (reportType === 'monthly') triggerMonthlyExport();
                else if (reportType === 'vehicles') triggerVehiclesExport();
                else triggerComparisonExport();
              }}
              className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-[10px] md:text-xs transition-all flex items-center gap-1 cursor-pointer font-bold font-mono"
              title="ส่งออกเป็น Excel CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* Report Scope Selector + Date Picker Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setReportType('daily')}
              className={`px-2.5 py-1.5 text-[11px] font-bold rounded-md transition-all whitespace-nowrap ${
                reportType === 'daily'
                  ? 'bg-emerald-600 text-slate-950 shadow font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              รายวัน
            </button>
            <button
              onClick={() => setReportType('weekly')}
              className={`px-2.5 py-1.5 text-[11px] font-bold rounded-md transition-all whitespace-nowrap ${
                reportType === 'weekly'
                  ? 'bg-emerald-600 text-slate-950 shadow font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              รายสัปดาห์
            </button>
            <button
              onClick={() => setReportType('monthly')}
              className={`px-2.5 py-1.5 text-[11px] font-bold rounded-md transition-all whitespace-nowrap ${
                reportType === 'monthly'
                  ? 'bg-emerald-600 text-slate-950 shadow font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              รายเดือน
            </button>
            <button
              onClick={() => setReportType('vehicles')}
              className={`px-2.5 py-1.5 text-[11px] font-bold rounded-md transition-all flex items-center gap-1 whitespace-nowrap ${
                reportType === 'vehicles'
                  ? 'bg-emerald-600 text-slate-950 shadow font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Truck className="w-3 h-3" />
              รายรถหัวลาก
            </button>
            <button
              onClick={() => setReportType('comparison')}
              className={`px-2.5 py-1.5 text-[11px] font-bold rounded-md transition-all flex items-center gap-1 whitespace-nowrap ${
                reportType === 'comparison'
                  ? 'bg-emerald-600 text-slate-950 shadow font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              เปรียบเทียบเดือน
            </button>
          </div>

          {/* Dynamic Date Inputs depending on Selection */}
          <div className="flex items-center gap-1.5">
            {reportType === 'vehicles' ? (
              <span className="text-[10px] text-slate-500 font-mono hidden md:inline-block">
                TOTAL: {trucks.length} VEHICLES
              </span>
            ) : reportType === 'comparison' ? (
              <span className="text-[10px] text-slate-500 font-mono hidden md:inline-block">
                TOTAL: {comparisonData.months.length} MONTHS
              </span>
            ) : reportType !== 'monthly' ? (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full sm:w-auto bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 font-mono"
              />
            ) : (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full sm:w-auto bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 font-mono"
              />
            )}
          </div>
        </div>
      </div>

      {/* KPI METRICS HERO BANNER (Responsive 3 columns) */}
      <div className="grid grid-cols-3 gap-2 md:gap-4" id="reports-kpi-banner">
        {/* Metric 1: Sessions Count */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-2.5 md:p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-0.5 md:space-y-1 overflow-hidden">
            <span className="text-slate-500 text-[9px] md:text-[10px] font-bold uppercase tracking-wider block truncate">
              {reportType === 'daily' ? 'จำนวนรอบชาร์จวันนี้' : reportType === 'weekly' ? 'จำนวนรอบชาร์จสัปดาห์นี้' : reportType === 'monthly' ? 'จำนวนรอบชาร์จเดือนนี้' : 'รอบชาร์จรวมสะสม'}
            </span>
            <h3 className="text-sm md:text-2xl font-black text-white font-mono leading-none">
              {currentFilteredSessions.length.toLocaleString() || '0'}
              <span className="text-[10px] md:text-xs font-semibold text-slate-400 ml-1">รอบ</span>
            </h3>
            <span className="text-[9px] text-emerald-500 font-bold block truncate">
              ตามเงื่อนไขที่เลือก
            </span>
          </div>
          <div className="p-1.5 md:p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded hidden sm:block">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>

        {/* Metric 2: Total Energy */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-2.5 md:p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-0.5 md:space-y-1 overflow-hidden">
            <span className="text-slate-500 text-[9px] md:text-[10px] font-bold uppercase tracking-wider block truncate">พลังงานจ่ายรวม</span>
            <h3 className="text-sm md:text-2xl font-black text-emerald-400 font-mono leading-none">
              {currentFilteredSessions.reduce((sum, s) => sum + (s.energyConsumed || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 1 }) || '0'}
              <span className="text-[10px] md:text-xs font-semibold text-slate-400 ml-1">kWh</span>
            </h3>
            <span className="text-[9px] text-slate-500 block truncate font-mono">
              เฉลี่ย {trucks.length > 0 ? Math.round(currentFilteredSessions.reduce((sum, s) => sum + (s.energyConsumed || 0), 0) / (reportType === 'vehicles' ? 1 : trucks.length)).toLocaleString() : 0} kWh / คัน
            </span>
          </div>
          <div className="p-1.5 md:p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded hidden sm:block">
            <Zap className="w-4 h-4" />
          </div>
        </div>

        {/* Metric 3: Total Costs */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-2.5 md:p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-0.5 md:space-y-1 overflow-hidden">
            <span className="text-slate-500 text-[9px] md:text-[10px] font-bold uppercase tracking-wider block truncate">มูลค่าไฟฟ้าประจุรวม</span>
            <h3 className="text-sm md:text-2xl font-black text-amber-400 font-mono leading-none">
              ฿{currentFilteredSessions.reduce((sum, s) => sum + (s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5))), 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) || '0.0'}
            </h3>
            <span className="text-[9px] text-slate-500 block truncate font-mono">
              คิดจากอัตราค่าไฟฟ้าตามช่วงเวลา
            </span>
          </div>
          <div className="p-1.5 md:p-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded hidden sm:block">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* RENDER DYNAMIC DASHBOARDS ACCORDING TO SELECTION */}

      {/* 1. DAILY REPORT VISUAL LAYOUT */}
      {reportType === 'daily' && dailyData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" id="daily-report-body">
          {/* Main Chart Column: Hourly load heat */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-1 font-mono">
                ภาระโหลดพลังงานชั่วโมงชาร์จประจำวัน (HOURLY ENERGY PROFILE)
              </h3>
              <p className="text-[10px] text-slate-500 mb-4 font-mono">Grouped hourly cumulative kWh loading distributions for {selectedDate}</p>
              
              {/* Responsive SVG Daily Line Chart */}
              <div className="h-44 bg-slate-950/50 rounded border border-slate-855 p-3 flex items-end justify-between relative">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-3 text-[8px] font-mono text-slate-700">
                  <div className="border-t border-slate-800/40 w-full pt-0.5 text-right">PEAK LEVEL</div>
                  <div className="border-t border-slate-800/40 w-full pt-0.5 text-right">MID LEVEL</div>
                  <div className="w-full text-right pb-0.5">0 kWh</div>
                </div>

                {dailyData.hourlyDistribution.map((h, i) => {
                  const maxVal = Math.max(...dailyData.hourlyDistribution.map(x => x.energy), 10);
                  const barHeight = (h.energy / maxVal) * 80; // keep max at 80%

                  return (
                    <div key={i} className="flex flex-col items-center flex-1 group z-10 h-full justify-end">
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bg-slate-950 text-slate-200 border border-slate-800 text-[9px] rounded p-1.5 mb-10 text-center pointer-events-none z-30 font-mono shadow-xl">
                        <p className="font-bold text-emerald-400">{h.hour.toString().padStart(2,'0')}:00</p>
                        <p>จ่ายไฟ: {h.energy.toFixed(1)} kWh</p>
                        <p>ชาร์จ: {h.sessions} คัน</p>
                      </div>

                      {/* Bar indicator */}
                      <div className="w-2.5 md:w-3 bg-slate-900 rounded-t overflow-hidden relative h-24 flex items-end">
                        <div 
                          className="w-full bg-emerald-500 rounded-t transition-all duration-700" 
                          style={{ height: `${barHeight}%` }}
                        />
                      </div>
                      <span className="text-[8px] font-mono text-slate-500 mt-1 scale-90 md:scale-100">
                        {h.hour % 4 === 0 ? `${h.hour}h` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Daily Trucks Active Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm animate-fade-in animate-duration-300" id="daily-trucks-chart">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1">
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-cyan-400" />
                  จำนวนครั้งการเข้าชาร์จแยกตามรายคันวันนี้ (DAILY CHARGING FREQUENCY PER TRUCK)
                </h3>
                <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-950/50 border border-cyan-900/50 px-2.5 py-1 rounded-md">
                  รถที่เข้าใช้บริการวันนี้: {dailyData.vehicleBreakdown.length} คัน
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mb-4 font-mono">แสดงข้อมูลรถหัวลากไฟฟ้าที่เข้ามาประจุพลังงานวันนี้ และจำนวนรอบ (ครั้ง) ที่เข้ามาชาร์จในแต่ละคัน</p>

              {dailyData.vehicleBreakdown.length === 0 ? (
                <div className="h-44 bg-slate-950/50 rounded border border-slate-800 flex flex-col items-center justify-center p-4">
                  <Truck className="w-8 h-8 text-slate-700 mb-2 stroke-[1.5]" />
                  <p className="text-xs text-slate-600 font-mono">ไม่มีประวัติการประจุไฟฟ้าของรถหัวลากวันนี้</p>
                </div>
              ) : (
                <div className="h-44 bg-slate-950/50 rounded border border-slate-855 p-3 flex items-end justify-start gap-4 overflow-x-auto relative">
                  <div className="absolute inset-x-0 top-0 bottom-0 flex flex-col justify-between pointer-events-none p-3 text-[8px] font-mono text-slate-700">
                    <div className="border-t border-slate-800/40 w-full pt-0.5 text-right">MAX CHARGES</div>
                    <div className="border-t border-slate-800/40 w-full pt-0.5 text-right">ACTIVE STATUS</div>
                    <div className="w-full text-right pb-0.5">0 ครั้ง</div>
                  </div>

                  {dailyData.vehicleBreakdown.map((vb, idx) => {
                    const maxVal = Math.max(...dailyData.vehicleBreakdown.map(x => x.cycles), 3);
                    const barHeight = (vb.cycles / maxVal) * 80;

                    return (
                      <div key={vb.id} className="flex flex-col items-center min-w-[70px] max-w-[100px] flex-1 group z-10 h-full justify-end">
                        {/* Tooltip */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bg-slate-950 text-slate-200 border border-slate-800 text-[10px] rounded p-2 mb-10 text-center pointer-events-none z-30 font-mono shadow-xl max-w-[220px]">
                          <p className="font-bold text-cyan-400">{vb.id}</p>
                          <p className="text-[9px] text-slate-400 font-sans mb-1">{vb.licensePlate} - {vb.model}</p>
                          <div className="border-t border-slate-800/60 mt-1 pt-1 text-left space-y-0.5">
                            <p className="font-bold text-white">จำนวนชาร์จสะสม: <span className="text-cyan-300">{vb.cycles} ครั้ง</span></p>
                            <p>พลังงานรวม: {vb.energy.toLocaleString(undefined, {maximumFractionDigits: 1})} kWh</p>
                            <p>ค่าไฟฟ้ารวม: ฿{vb.cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                          </div>
                        </div>

                        {/* Bar indicator */}
                        <div className="w-12 bg-slate-900 rounded-t overflow-hidden relative h-24 flex items-end">
                          <div 
                            className="w-full bg-cyan-500 rounded-t transition-all duration-700" 
                            style={{ height: `${barHeight}%` }}
                          />
                          {/* Display count inside or above the bar */}
                          <div className="absolute inset-x-0 top-1 text-center text-[10px] font-black text-slate-400 group-hover:text-cyan-300 font-mono">
                            {vb.cycles}
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-300 mt-2 font-bold truncate max-w-full">
                          {vb.id}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Table of Driver Logs today */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 md:p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-2 font-mono flex items-center justify-between">
                <span>สถิติการใช้งานแยกตามพนักงาน</span>
                {dailyTotalDrivers > 0 && (
                  <span className="text-[10px] text-slate-500 font-normal">ทั้งหมด {dailyTotalDrivers} คน</span>
                )}
              </h3>

              {/* Mobile Driver Cards (< 768px) */}
              <div className="md:hidden space-y-2">
                {currentDailyDrivers.length === 0 ? (
                  <div className="py-6 text-center text-slate-600 text-xs font-mono">ไม่มีข้อมูลการชาร์จในวันนี้</div>
                ) : (
                  currentDailyDrivers.map((dr, index) => (
                    <div key={index} className="bg-slate-950 border border-slate-800/80 rounded-lg p-2.5 flex items-center justify-between text-xs font-mono">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-200 truncate flex items-center gap-1.5">
                          <User className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span className="truncate">{dr.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">ชาร์จ {dr.cycles} รอบ</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-emerald-400 font-bold block">{dr.energy.toLocaleString(undefined, {maximumFractionDigits: 1})} kWh</span>
                        <span className="text-[10px] text-amber-400 font-bold">฿{dr.cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-[11px] font-mono">
                  <thead>
                    <tr className="bg-slate-950 text-slate-500 border-b border-slate-800">
                      <th className="py-2 px-3 whitespace-nowrap">พนักงานขับรถ</th>
                      <th className="py-2 px-3 text-center whitespace-nowrap">จำนวนรอบประจุ</th>
                      <th className="py-2 px-3 text-right whitespace-nowrap">พลังงานที่ใช้ (kWh)</th>
                      <th className="py-2 px-3 text-right whitespace-nowrap">คิดเป็นมูลค่าไฟ (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {currentDailyDrivers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-600 whitespace-nowrap">ไม่มีข้อมูลการชาร์จในวันนี้</td>
                      </tr>
                    ) : (
                      currentDailyDrivers.map((dr, index) => (
                        <tr key={index} className="hover:bg-slate-950/30">
                          <td className="py-2 px-3 font-semibold text-slate-200 flex items-center gap-1.5 whitespace-nowrap">
                            <User className="w-3.5 h-3.5 text-slate-500" />
                            {dr.name}
                          </td>
                          <td className="py-2 px-3 text-center text-slate-300 font-bold whitespace-nowrap">{dr.cycles}</td>
                          <td className="py-2 px-3 text-right text-emerald-400 font-bold whitespace-nowrap">{dr.energy.toLocaleString(undefined, {maximumFractionDigits: 1})}</td>
                          <td className="py-2 px-3 text-right text-amber-400 font-bold whitespace-nowrap">฿{dr.cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {dailyTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800 text-[11px]">
                  <span className="text-slate-500 font-mono">
                    หน้า {operatorPage} จาก {dailyTotalPages} ({dailyTotalDrivers} พนักงาน)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setOperatorPage(p => Math.max(1, p - 1))}
                      disabled={operatorPage === 1}
                      className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:hover:text-slate-400 transition-colors flex items-center gap-1 font-semibold focus:outline-none"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      ก่อนหน้า
                    </button>
                    <button
                      onClick={() => setOperatorPage(p => Math.min(dailyTotalPages, p + 1))}
                      disabled={operatorPage === dailyTotalPages}
                      className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:hover:text-slate-400 transition-colors flex items-center gap-1 font-semibold focus:outline-none"
                    >
                      ถัดไป
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar of daily breakdowns */}
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-3 font-mono">
                พลังงานไฟฟ้าตามหัวชาร์จวันนี้
              </h3>
              <div className="space-y-2.5">
                {dailyData.stationBreakdown.map(st => {
                  const maxCycles = Math.max(...dailyData.stationBreakdown.map(x => x.energy), 1);
                  const progressWidth = (st.energy / maxCycles) * 100;
                  return (
                    <div key={st.id} className="bg-slate-950 p-2.5 rounded border border-slate-850/60 space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="font-bold text-slate-300">{st.id} <span className="text-slate-500 font-normal">({st.name})</span></span>
                        <span className="text-emerald-400 font-bold">{st.energy.toFixed(1)} kWh</span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full" style={{ width: `${progressWidth}%` }} />
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                        <span>{st.cycles} ครั้ง</span>
                        <span>มูลค่า ฿{st.cost.toLocaleString(undefined, {maximumFractionDigits: 1})}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Daily Operational insights */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2.5 font-mono flex items-center gap-1.5">
                <Award className="w-4 h-4 text-emerald-400" />
                INSIGHTS ประจำวัน
              </h3>
              <div className="space-y-2 text-[11px] leading-relaxed text-slate-400">
                <div className="p-2 bg-slate-950 rounded border border-slate-850">
                  <span className="text-slate-500 uppercase font-bold tracking-wider font-mono text-[9px] block">ประสิทธิภาพเวลาประจุ</span>
                  <p className="mt-0.5 text-slate-300">
                    เฉลี่ยต่อการเชื่อมชาร์จหนึ่งรอบคือ <strong className="text-slate-200 font-mono">{dailyData.avgDuration.toFixed(1)} นาที</strong> จ่ายหน่วยไฟฟ้าสะสมเฉลี่ย <strong className="text-slate-200 font-mono">{dailyData.avgEnergy.toFixed(1)} kWh</strong>
                  </p>
                </div>
                <div className="p-2 bg-slate-950 rounded border border-slate-850">
                  <span className="text-slate-500 uppercase font-bold tracking-wider font-mono text-[9px] block">อัตราพลังงานจ่าย</span>
                  <p className="mt-0.5 text-slate-300">
                    หัวชาร์จที่ให้พลังงานสูงสุดในวันนี้ คือ <strong className="text-emerald-400 font-mono">
                      {dailyData.stationBreakdown.sort((a,b)=>b.energy - a.energy)[0]?.id || '-'}
                    </strong> ซึ่งคิดเป็นรอบการชาร์จ <strong className="text-slate-200 font-mono">{dailyData.stationBreakdown.sort((a,b)=>b.energy - a.energy)[0]?.cycles || 0} รอบ</strong>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. WEEKLY REPORT VISUAL LAYOUT */}
      {reportType === 'weekly' && weeklyData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" id="weekly-report-body">
          {/* Main Chart Column: Last 7 days breakdown */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-1 font-mono">
                พลังงานจ่ายรายวันประจำสัปดาห์ (WEEKLY ENERGY HISTORY)
              </h3>
              <p className="text-[10px] text-slate-500 mb-4 font-mono">Cumulative electrical load trends from {weeklyData.startDate} ถึง {weeklyData.endDate} (จันทร์ - อาทิตย์)</p>

              {/* Weekly SVG Bar Chart */}
              <div className="h-44 bg-slate-950/50 rounded border border-slate-855 p-3 flex items-end justify-between relative">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-3 text-[8px] font-mono text-slate-700">
                  <div className="border-t border-slate-800/40 w-full pt-0.5 text-right">WEEKLY PEAK</div>
                  <div className="border-t border-slate-800/40 w-full pt-0.5 text-right">MID VOLUME</div>
                  <div className="w-full text-right pb-0.5">0 kWh</div>
                </div>

                {weeklyData.dailySeries.map((day, idx) => {
                  const maxVal = Math.max(...weeklyData.dailySeries.map(x => x.energy), 10);
                  const barHeight = (day.energy / maxVal) * 80;

                  return (
                    <div key={idx} className="flex flex-col items-center flex-1 group z-10 h-full justify-end">
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bg-slate-950 text-slate-200 border border-slate-800 text-[9px] rounded p-1.5 mb-10 text-center pointer-events-none z-30 font-mono shadow-xl">
                        <p className="font-bold text-emerald-400">{day.label}</p>
                        <p>จ่ายไฟรวม: {day.energy.toFixed(1)} kWh</p>
                        <p>ชาร์จรวม: {day.sessionsCount} คัน</p>
                        <p>ค่าไฟรวม: ฿{day.cost.toLocaleString(undefined, {maximumFractionDigits:0})}</p>
                      </div>

                      {/* Bar indicator */}
                      <div className="w-10 bg-slate-900 rounded-t overflow-hidden relative h-24 flex items-end">
                        <div 
                          className="w-full bg-emerald-500 rounded-t transition-all duration-700" 
                          style={{ height: `${barHeight}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 mt-2">
                        {day.label.split(' ')[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Weekly Trucks Active Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm animate-fade-in animate-duration-300" id="weekly-trucks-chart">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1">
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-cyan-400" />
                  จำนวนรถหัวลากไฟฟ้าที่เข้ามาชาร์จรายวันประจำสัปดาห์ (WEEKLY ACTIVE VEHICLES)
                </h3>
                <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-950/50 border border-cyan-900/50 px-2.5 py-1 rounded-md">
                  สัปดาห์นี้เข้าชาร์จทั้งหมด: {weeklyData.vehicleBreakdown.length} คัน
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mb-4 font-mono">จำนวนรถหัวลากไฟฟ้าที่ไม่ซ้ำกัน (Unique EV Trucks) ที่เข้าใช้บริการสถานีชาร์จในแต่ละวัน</p>

              {/* Weekly Day SVG Bar Chart */}
              <div className="h-44 bg-slate-950/50 rounded border border-slate-855 p-3 flex items-end justify-between relative">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-3 text-[8px] font-mono text-slate-700">
                  <div className="border-t border-slate-800/40 w-full pt-0.5 text-right">MAX FLEET ({trucks.length} TRUCKS)</div>
                  <div className="border-t border-slate-800/40 w-full pt-0.5 text-right">ACTIVE LEVEL</div>
                  <div className="w-full text-right pb-0.5">0 คัน</div>
                </div>

                {weeklyData.dailySeries.map((day, idx) => {
                  const maxVal = Math.max(...weeklyData.dailySeries.map(x => x.trucksCount || 0), 4);
                  const barHeight = ((day.trucksCount || 0) / maxVal) * 80;

                  return (
                    <div key={idx} className="flex flex-col items-center flex-1 group z-10 h-full justify-end">
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bg-slate-950 text-slate-200 border border-slate-800 text-[9px] rounded p-2 mb-10 text-center pointer-events-none z-30 font-mono shadow-xl max-w-[220px]">
                        <p className="font-bold text-cyan-400">{day.label}</p>
                        <p className="font-black my-1 text-xs text-white">จำนวนรถที่ชาร์จ: {day.trucksCount || 0} คัน</p>
                        <p className="text-[8.5px] text-slate-400 text-left border-t border-slate-800/60 mt-1 pt-1 font-sans leading-normal">
                          {day.trucksList && day.trucksList.length > 0 ? (
                            <>
                              <span className="font-bold font-mono text-cyan-500 block mb-0.5">รหัสรถที่เข้าชาร์จ:</span>
                              {day.trucksList.map(tId => {
                                const truckObj = trucks.find(t => t.id === tId);
                                return `${tId} (${truckObj?.licensePlate || 'ไม่ระบุ'})`;
                              }).join(', ')}
                            </>
                          ) : 'ไม่มีรถเข้าชาร์จในวันนี้'}
                        </p>
                      </div>

                      {/* Bar indicator */}
                      <div className="w-10 bg-slate-900 rounded-t overflow-hidden relative h-24 flex items-end">
                        <div 
                          className="w-full bg-cyan-500 rounded-t transition-all duration-700" 
                          style={{ height: `${barHeight}%` }}
                        />
                        {/* Display count inside or above the bar */}
                        <div className="absolute inset-x-0 top-1 text-center text-[10px] font-black text-slate-400 group-hover:text-cyan-300 font-mono">
                          {day.trucksCount || 0}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 mt-2">
                        {day.label.split(' ')[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tractor Performance/usage list */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 md:p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-2 font-mono">
                พลังงานจ่ายและรอบชาร์จแยกตามรถหัวลาก
              </h3>

              {/* Mobile Weekly Vehicle Cards (< 768px) */}
              <div className="md:hidden space-y-2">
                {weeklyData.vehicleBreakdown.length === 0 ? (
                  <div className="py-6 text-center text-slate-600 text-xs font-mono">ไม่มีประวัติการชาร์จสัปดาห์นี้</div>
                ) : (
                  weeklyData.vehicleBreakdown.map((veh, index) => (
                    <div key={index} className="bg-slate-950 border border-slate-800/80 rounded-lg p-2.5 flex items-center justify-between text-xs font-mono">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-emerald-400">{veh.id}</span>
                          <span className="text-[10px] text-slate-400">({veh.licensePlate})</span>
                        </div>
                        <span className="text-[10px] text-slate-500">ชาร์จ {veh.cycles} รอบ</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-200 font-bold block">{veh.energy.toLocaleString(undefined, {maximumFractionDigits: 1})} kWh</span>
                        <span className="text-[10px] text-amber-400 font-bold">฿{veh.cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-[11px] font-mono">
                  <thead>
                    <tr className="bg-slate-950 text-slate-500 border-b border-slate-800">
                      <th className="py-2 px-3 whitespace-nowrap">ทะเบียนรถหัวลาก</th>
                      <th className="py-2 px-3 whitespace-nowrap">รุ่นโมเดล</th>
                      <th className="py-2 px-3 text-center whitespace-nowrap">จำนวนรอบชาร์จ</th>
                      <th className="py-2 px-3 text-right whitespace-nowrap">พลังงานจ่ายรวม (kWh)</th>
                      <th className="py-2 px-3 text-right whitespace-nowrap">มูลค่ารวม (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {weeklyData.vehicleBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-600 whitespace-nowrap">ไม่มีประวัติการชาร์จสัปดาห์นี้</td>
                      </tr>
                    ) : (
                      weeklyData.vehicleBreakdown.map((veh, index) => (
                        <tr key={index} className="hover:bg-slate-950/30">
                          <td className="py-2 px-3 font-semibold text-emerald-400 font-bold whitespace-nowrap">{veh.id}</td>
                          <td className="py-2 px-3 text-slate-400 whitespace-nowrap">{veh.licensePlate} ({veh.model})</td>
                          <td className="py-2 px-3 text-center text-slate-300 font-bold whitespace-nowrap">{veh.cycles}</td>
                          <td className="py-2 px-3 text-right text-slate-200 font-bold whitespace-nowrap">{veh.energy.toLocaleString(undefined, {maximumFractionDigits: 1})}</td>
                          <td className="py-2 px-3 text-right text-amber-400 font-bold whitespace-nowrap">฿{veh.cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right sidebar for weekly profiles */}
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-3.5 font-mono flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-emerald-500" />
                หัวลากใช้ไฟสูงสุด (TOP CONSUMER)
              </h3>
              {weeklyData.vehicleBreakdown.length > 0 ? (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 text-center space-y-3">
                  <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner animate-pulse">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-white font-mono">{weeklyData.vehicleBreakdown[0].id}</h4>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">{weeklyData.vehicleBreakdown[0].licensePlate} - {weeklyData.vehicleBreakdown[0].model}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-left pt-2 border-t border-slate-800/80">
                    <div>
                      <span className="text-[9px] text-slate-500 block font-mono">ENERGY_TOTAL</span>
                      <span className="text-xs font-bold text-emerald-400 font-mono">{weeklyData.vehicleBreakdown[0].energy.toFixed(1)} kWh</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block font-mono">CYCLES_TOTAL</span>
                      <span className="text-xs font-bold text-slate-300 font-mono">{weeklyData.vehicleBreakdown[0].cycles} รอบ</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-600 text-xs font-mono">NO_DATA_AVAILABLE</div>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-3 font-mono">
                สัดส่วนการชาร์จรายสัปดาห์
              </h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                การประเมินการขนส่งและการประจุพลังงานภายในสัปดาห์ปัจจุบัน พบว่ารถหัวลากที่วิ่งขนส่งมีสัดส่วนการรับพลังงานสูงขึ้นในช่วงกลางสัปดาห์ โดยคิดเป็นมูลค่าไฟเฉลี่ยวันละ <strong className="text-amber-400 font-mono">฿{(weeklyData.totalCost / 7).toLocaleString(undefined, {maximumFractionDigits:0})}</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. MONTHLY REPORT VISUAL LAYOUT */}
      {reportType === 'monthly' && monthlyData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" id="monthly-report-body">
          {/* Main Chart Column: Monthly load profile */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-1 font-mono">
                ประเมินการโหลดพลังงานรายสัปดาห์ของเดือนนี้ (WEEKLY TREND)
              </h3>
              <p className="text-[10px] text-slate-500 mb-4 font-mono">Grouped weekly load profile for selected month {selectedMonth}</p>

              {/* Monthly SVG Bar Chart */}
              <div className="h-44 bg-slate-950/50 rounded border border-slate-855 p-3 flex items-end justify-around relative">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-3 text-[8px] font-mono text-slate-700">
                  <div className="border-t border-slate-800/40 w-full pt-0.5 text-right">MONTHLY PEAK</div>
                  <div className="border-t border-slate-800/40 w-full pt-0.5 text-right">MID VOLUME</div>
                  <div className="w-full text-right pb-0.5">0 kWh</div>
                </div>

                {monthlyData.weeklySeries.map((week, idx) => {
                  const maxVal = Math.max(...monthlyData.weeklySeries.map(x => x.energy), 10);
                  const barHeight = (week.energy / maxVal) * 80;

                  return (
                    <div key={idx} className="flex flex-col items-center flex-1 group z-10 h-full justify-end">
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bg-slate-950 text-slate-200 border border-slate-800 text-[9px] rounded p-1.5 mb-10 text-center pointer-events-none z-30 font-mono shadow-xl">
                        <p className="font-bold text-emerald-400">{week.label}</p>
                        <p>จ่ายพลังงาน: {week.energy.toFixed(1)} kWh</p>
                        <p>รอบประจุรวม: {week.sessionsCount} ครั้ง</p>
                        <p>มูลค่าไฟ: ฿{week.cost.toLocaleString(undefined, {maximumFractionDigits:0})}</p>
                      </div>

                      {/* Bar indicator */}
                      <div className="w-14 bg-slate-900 rounded-t overflow-hidden relative h-24 flex items-end">
                        <div 
                          className="w-full bg-emerald-500 rounded-t transition-all duration-700" 
                          style={{ height: `${barHeight}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 mt-2">
                        {week.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Weekly Trucks Active Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm animate-fade-in" id="monthly-weekly-trucks-chart">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1">
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-cyan-400" />
                  จำนวนรถหัวลากไฟฟ้าที่เข้ามาชาร์จรายสัปดาห์ (WEEKLY ACTIVE VEHICLES)
                </h3>
                <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-950/50 border border-cyan-900/50 px-2.5 py-1 rounded-md">
                  เดือนนี้เข้าชาร์จทั้งหมด: {monthlyData.vehicleBreakdown.length} คัน
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mb-4 font-mono">จำนวนรถหัวลากไฟฟ้าที่ไม่ซ้ำกัน (Unique EV Trucks) ที่เข้าใช้บริการสถานีชาร์จในแต่ละสัปดาห์</p>

              {/* Weekly Trucks SVG Bar Chart */}
              <div className="h-44 bg-slate-950/50 rounded border border-slate-855 p-3 flex items-end justify-around relative">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-3 text-[8px] font-mono text-slate-700">
                  <div className="border-t border-slate-800/40 w-full pt-0.5 text-right">MAX FLEET ({trucks.length} TRUCKS)</div>
                  <div className="border-t border-slate-800/40 w-full pt-0.5 text-right">ACTIVE LEVEL</div>
                  <div className="w-full text-right pb-0.5">0 คัน</div>
                </div>

                {monthlyData.weeklySeries.map((week, idx) => {
                  const maxVal = Math.max(...monthlyData.weeklySeries.map(x => x.trucksCount || 0), 4);
                  const barHeight = ((week.trucksCount || 0) / maxVal) * 80;

                  return (
                    <div key={idx} className="flex flex-col items-center flex-1 group z-10 h-full justify-end">
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bg-slate-950 text-slate-200 border border-slate-800 text-[9px] rounded p-2 mb-10 text-center pointer-events-none z-30 font-mono shadow-xl max-w-[220px]">
                        <p className="font-bold text-cyan-400">{week.label}</p>
                        <p className="font-black my-1 text-xs text-white">จำนวนรถที่ชาร์จ: {week.trucksCount || 0} คัน</p>
                        <p className="text-[8.5px] text-slate-400 text-left border-t border-slate-800/60 mt-1 pt-1 font-sans leading-normal">
                          {week.trucksList && week.trucksList.length > 0 ? (
                            <>
                              <span className="font-bold font-mono text-cyan-500 block mb-0.5">รหัสรถที่เข้าชาร์จ:</span>
                              {week.trucksList.map(tId => {
                                const truckObj = trucks.find(t => t.id === tId);
                                return `${tId} (${truckObj?.licensePlate || 'ไม่ระบุ'})`;
                              }).join(', ')}
                            </>
                          ) : 'ไม่มีรถเข้าชาร์จในสัปดาห์นี้'}
                        </p>
                      </div>

                      {/* Bar indicator */}
                      <div className="w-14 bg-slate-900 rounded-t overflow-hidden relative h-24 flex items-end">
                        <div 
                          className="w-full bg-cyan-500 rounded-t transition-all duration-700" 
                          style={{ height: `${barHeight}%` }}
                        />
                        {/* Display count inside or above the bar */}
                        <div className="absolute inset-x-0 top-1 text-center text-[10px] font-black text-slate-400 group-hover:text-cyan-300 font-mono">
                          {week.trucksCount || 0}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 mt-2">
                        {week.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Monthly Operator matrix */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 md:p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-2 font-mono">
                สถิติการชาร์จสะสมรายเดือนของพนักงาน
              </h3>

              {/* Mobile Monthly Driver Cards (< 768px) */}
              <div className="md:hidden space-y-2">
                {monthlyData.driverBreakdown.length === 0 ? (
                  <div className="py-6 text-center text-slate-600 text-xs font-mono">ไม่มีข้อมูลการชาร์จในเดือนนี้</div>
                ) : (
                  monthlyData.driverBreakdown.map((dr, index) => (
                    <div key={index} className="bg-slate-950 border border-slate-800/80 rounded-lg p-2.5 flex items-center justify-between text-xs font-mono">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-200 truncate">
                          <span className="text-slate-500 mr-1.5">#{index + 1}</span>
                          {dr.name}
                        </div>
                        <span className="text-[10px] text-slate-400">สะสม {dr.cycles} รอบ</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-emerald-400 font-bold block">{dr.energy.toLocaleString(undefined, {maximumFractionDigits: 1})} kWh</span>
                        <span className="text-[10px] text-amber-400 font-bold">฿{dr.cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-[11px] font-mono">
                  <thead>
                    <tr className="bg-slate-950 text-slate-500 border-b border-slate-800">
                      <th className="py-2 px-3 whitespace-nowrap">ชื่อ-นามสกุล พนักงานขับรถ</th>
                      <th className="py-2 px-3 text-center whitespace-nowrap">รอบชาร์จสะสม</th>
                      <th className="py-2 px-3 text-right whitespace-nowrap">พลังงานที่ใช้ชาร์จ (kWh)</th>
                      <th className="py-2 px-3 text-right whitespace-nowrap">รวมค่าไฟฟ้า (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {monthlyData.driverBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-600 whitespace-nowrap">ไม่มีข้อมูลการชาร์จในเดือนนี้</td>
                      </tr>
                    ) : (
                      monthlyData.driverBreakdown.map((dr, index) => (
                        <tr key={index} className="hover:bg-slate-950/30">
                          <td className="py-2 px-3 font-semibold text-slate-200 flex items-center gap-1.5 whitespace-nowrap">
                            <span className="text-slate-500 font-bold text-[10px] w-4">{index + 1}</span>
                            {dr.name}
                          </td>
                          <td className="py-2 px-3 text-center text-slate-300 font-bold whitespace-nowrap">{dr.cycles}</td>
                          <td className="py-2 px-3 text-right text-emerald-400 font-bold whitespace-nowrap">{dr.energy.toLocaleString(undefined, {maximumFractionDigits: 1})}</td>
                          <td className="py-2 px-3 text-right text-amber-400 font-bold whitespace-nowrap">฿{dr.cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Monthly Vehicle performance matrix */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 md:p-4 shadow-sm animate-fade-in">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-2 font-mono flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-cyan-400" />
                สถิติรถหัวลากสะสมรายเดือน
              </h3>

              {/* Mobile Monthly Vehicle Cards (< 768px) */}
              <div className="md:hidden space-y-2">
                {monthlyData.vehicleBreakdown.length === 0 ? (
                  <div className="py-6 text-center text-slate-600 text-xs font-mono">ไม่มีข้อมูลการชาร์จของรถหัวลากในเดือนนี้</div>
                ) : (
                  monthlyData.vehicleBreakdown.map((vb, index) => (
                    <div key={vb.id} className="bg-slate-950 border border-slate-800/80 rounded-lg p-2.5 flex items-center justify-between text-xs font-mono">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500 text-[10px]">#{index + 1}</span>
                          <span className="text-cyan-400 font-bold">{vb.id}</span>
                          <span className="text-[10px] text-slate-400">({vb.licensePlate})</span>
                        </div>
                        <span className="text-[10px] text-slate-500">สะสม {vb.cycles} รอบ</span>
                      </div>
                      <div className="text-right">
                        <span className="text-emerald-400 font-bold block">{vb.energy.toLocaleString(undefined, {maximumFractionDigits: 1})} kWh</span>
                        <span className="text-[10px] text-amber-400 font-bold">฿{vb.cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-[11px] font-mono">
                  <thead>
                    <tr className="bg-slate-950 text-slate-500 border-b border-slate-800">
                      <th className="py-2 px-3 whitespace-nowrap">รหัสรถ / ทะเบียน / รุ่น</th>
                      <th className="py-2 px-3 text-center whitespace-nowrap">รอบชาร์จสะสม</th>
                      <th className="py-2 px-3 text-right whitespace-nowrap">พลังงานที่ใช้ชาร์จ (kWh)</th>
                      <th className="py-2 px-3 text-right whitespace-nowrap">รวมค่าไฟฟ้า (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {monthlyData.vehicleBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-600 whitespace-nowrap">ไม่มีข้อมูลการชาร์จของรถหัวลากในเดือนนี้</td>
                      </tr>
                    ) : (
                      monthlyData.vehicleBreakdown.map((vb, index) => (
                        <tr key={vb.id} className="hover:bg-slate-950/30">
                          <td className="py-2 px-3 font-semibold text-slate-200 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-500 font-bold text-[10px] w-4">{index + 1}</span>
                              <div>
                                <span className="text-cyan-400 font-bold">{vb.id}</span>
                                <span className="text-[10px] text-slate-400 ml-1.5 font-sans">({vb.licensePlate} - {vb.model})</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center text-slate-300 font-bold whitespace-nowrap">{vb.cycles}</td>
                          <td className="py-2 px-3 text-right text-emerald-400 font-bold whitespace-nowrap">{vb.energy.toLocaleString(undefined, {maximumFractionDigits: 1})}</td>
                          <td className="py-2 px-3 text-right text-amber-400 font-bold whitespace-nowrap">฿{vb.cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column: Station performances and usage share */}
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-3.5 font-mono">
                สัดส่วนและประสิทธิภาพตู้ชาร์จสะสม (BAYS SHARE)
              </h3>
              <div className="space-y-3">
                {monthlyData.stationBreakdown.map(st => {
                  return (
                    <div key={st.id} className="bg-slate-950 p-3 rounded border border-slate-850/60 space-y-2">
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="font-bold text-slate-200">{st.id} <span className="text-slate-500 font-normal">({st.name})</span></span>
                        <span className="text-emerald-400 font-bold">{st.percentage.toFixed(1)}% Share</span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full" style={{ width: `${st.percentage}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                        <span>{st.cycles} รอบสะสม</span>
                        <span className="font-bold text-slate-400">{st.energy.toLocaleString(undefined, {maximumFractionDigits:0})} kWh</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Carbon Offset estimation or Eco impact (Highly appealing for heavy-duty EV Trucks!) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-2 font-mono flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                ลดการปล่อยคาร์บอน (ECO METRICS)
              </h3>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 text-center space-y-2.5">
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider font-mono block">CO2 REDUCED</span>
                  <h4 className="text-xl font-black text-emerald-400 font-mono">
                    {((monthlyData.totalEnergy * 0.5) / 1000).toFixed(3)}
                    <span className="text-xs font-semibold text-slate-400 ml-1">TONS_CO2</span>
                  </h4>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  จากการประจุไฟฟ้าสะสมแทนการใช้น้ำมันดีเซลพ่วงลากของโรงงาน (คำนวณเบื้องต้น 1 kWh ประหยัดได้ประมาณ 0.5 kg CO2)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {reportType === 'vehicles' && (
        <div className="space-y-4 animate-fade-in" id="vehicles-report-view">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Column: All Vehicles Summary Table */}
            <div className="col-span-1 lg:col-span-5 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 md:p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-emerald-400" />
                    เลือกรถหัวลาก ({vehiclesData.length} คัน)
                  </h3>
                  <span className="text-[10px] text-slate-400 font-sans md:hidden">แตะเพื่อดูรายละเอียด</span>
                </div>

                {/* Mobile Vehicle Selector Cards (< 768px) */}
                <div className="md:hidden grid grid-cols-2 gap-2">
                  {vehiclesData.map((v) => {
                    const isSelected = selectedTruckId === v.truck.id;
                    return (
                      <button
                        key={v.truck.id}
                        type="button"
                        onClick={() => setSelectedTruckId(v.truck.id)}
                        className={`p-2.5 rounded-lg border text-left font-mono transition-all ${
                          isSelected
                            ? 'bg-emerald-500/15 border-emerald-500 text-white shadow'
                            : 'bg-slate-950 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-400">{v.truck.id}</span>
                          <span className="text-[10px] text-slate-400">{v.totalSessions} รอบ</span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">{v.truck.licensePlate}</div>
                        <div className="flex items-center justify-between text-[10px] mt-1 pt-1 border-t border-slate-800/60">
                          <span className="text-emerald-300 font-bold">{v.totalEnergy.toFixed(0)} kWh</span>
                          <span className="text-amber-400 font-bold">฿{v.totalCost.toFixed(0)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[500px] text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950 text-slate-500 border-b border-slate-800 text-[10px] font-mono">
                        <th className="py-2 px-2.5 whitespace-nowrap">รหัสรถ / ทะเบียน</th>
                        <th className="py-2 px-1 text-center whitespace-nowrap">รอบชาร์จ</th>
                        <th className="py-2 px-2 text-right whitespace-nowrap">พลังงานสะสม</th>
                        <th className="py-2 px-2 text-right whitespace-nowrap">รวมค่าไฟ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {vehiclesData.map((v) => {
                        const isSelected = selectedTruckId === v.truck.id;
                        return (
                          <tr 
                            key={v.truck.id}
                            onClick={() => setSelectedTruckId(v.truck.id)}
                            className={`cursor-pointer transition-all ${
                              isSelected 
                                ? 'bg-emerald-500/10 border-l-2 border-emerald-500 text-white' 
                                : 'hover:bg-slate-950/40 text-slate-300'
                            }`}
                          >
                            <td className="py-2.5 px-2.5 font-bold font-mono whitespace-nowrap">
                              <div className="flex flex-col">
                                <span>{v.truck.id}</span>
                                <span className="text-[10px] text-slate-500 font-normal">{v.truck.licensePlate}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-1 text-center font-bold font-mono text-slate-200 whitespace-nowrap">
                              {v.totalSessions} รอบ
                            </td>
                            <td className="py-2.5 px-2 text-right font-bold font-mono text-emerald-400 whitespace-nowrap">
                              {v.totalEnergy.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span className="text-[9px] text-slate-500 font-normal">kWh</span>
                            </td>
                            <td className="py-2.5 px-2 text-right font-bold font-mono text-amber-400 whitespace-nowrap">
                              ฿{v.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Selected Vehicle Detail Panel */}
            <div className="col-span-1 lg:col-span-7 space-y-4">
              {selectedTruckStats ? (
                <div className="space-y-4">
                  {/* Truck specifications */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
                    <div className="absolute right-4 top-4 text-slate-800 pointer-events-none">
                      <Truck className="w-16 h-16 opacity-10" />
                    </div>
                    
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase tracking-wider font-bold font-mono">SELECTED TRACTOR UNIT</span>
                        <h3 className="text-lg font-black text-white font-mono flex items-center gap-2">
                          {selectedTruckStats.truck.id} 
                          <span className="text-xs bg-slate-950 px-2.5 py-0.5 rounded text-emerald-400 border border-slate-800 font-bold font-sans">
                            {selectedTruckStats.truck.licensePlate}
                          </span>
                        </h3>
                        <p className="text-xs text-slate-400 font-semibold font-mono mt-0.5">
                          {selectedTruckStats.truck.model} (ความจุ: {selectedTruckStats.truck.batteryCapacity} kWh)
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-slate-500 text-[10px] uppercase tracking-wider font-bold font-mono block">BATTERY STATE</span>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded mt-1 ${
                          selectedTruckStats.truck.status === 'Charging'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : selectedTruckStats.truck.status === 'Maintenance'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            selectedTruckStats.truck.status === 'Charging'
                              ? 'bg-amber-400 animate-pulse'
                              : selectedTruckStats.truck.status === 'Maintenance'
                              ? 'bg-rose-400'
                              : 'bg-emerald-400'
                          }`} />
                          {selectedTruckStats.truck.status === 'Charging' ? 'CHARGING' : selectedTruckStats.truck.status === 'Maintenance' ? 'MAINTENANCE' : 'AVAILABLE'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-3 rounded-lg border border-slate-850">
                      <div>
                        <span className="text-slate-500 text-[9px] uppercase font-bold font-mono block">BATTERY SOC</span>
                        <p className="text-sm font-bold font-mono text-slate-200 mt-0.5">
                          {selectedTruckStats.truck.currentSOC}%
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[9px] uppercase font-bold font-mono block">เลขไมล์สะสมล่าสุด</span>
                        <p className="text-sm font-bold font-mono text-slate-200 mt-0.5">
                          {selectedTruckStats.latestOdometer.toLocaleString()} <span className="text-[10px] text-slate-500">km</span>
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[9px] uppercase font-bold font-mono block">ระยะวิ่งในประวัติ (EV)</span>
                        <p className="text-sm font-bold font-mono text-slate-200 mt-0.5">
                          {selectedTruckStats.mileageRun > 0 ? `${selectedTruckStats.mileageRun.toLocaleString()} km` : '-'}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[9px] uppercase font-bold font-mono block">อัตราเฉลี่ยต่อรอบ</span>
                        <p className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                          {selectedTruckStats.avgEnergy > 0 ? `${selectedTruckStats.avgEnergy.toFixed(1)} kWh` : '-'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* SVG Mini Chart of Recent Energy Consumed */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-3.5 font-mono">
                      ประวัติจ่ายพลังงาน 7 รอบชาร์จล่าสุด (LAST 7 CHARGING SESSIONS)
                    </h3>
                    
                    {recentSessionsForChart.length === 0 ? (
                      <div className="h-44 flex flex-col items-center justify-center text-slate-600 bg-slate-950 border border-slate-855 rounded-lg text-xs font-mono">
                        <ZapOff className="w-8 h-8 mb-2 text-slate-700 animate-pulse" />
                        <span>ยังไม่มีประวัติการชาร์จสะสมสำหรับรถคันนี้</span>
                      </div>
                    ) : (
                      <div className="bg-slate-950 p-4 rounded-lg border border-slate-850/60">
                        <div className="relative h-44 w-full flex items-end justify-between px-2 pt-6">
                          {recentSessionsForChart.map((session, idx) => {
                            // Find max value for scaling
                            const maxVal = Math.max(...recentSessionsForChart.map(s => s.energyConsumed), 40);
                            const barHeight = (session.energyConsumed / maxVal) * 85; // Percent of container height
                            
                            return (
                              <div key={`${session.id}-${idx}`} className="flex flex-col items-center flex-1 group relative">
                                {/* Tooltip */}
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bottom-full mb-2 bg-slate-900 border border-slate-800 text-[10px] text-slate-200 rounded p-1.5 pointer-events-none z-10 text-center font-mono shadow-xl w-32">
                                  <p className="font-bold text-emerald-400">{session.id}</p>
                                  <p>พลังงาน: {session.energyConsumed.toFixed(1)} kWh</p>
                                  <p>เวลาชาร์จ: {session.duration} นาที</p>
                                  <p>เริ่มต้น: {session.startSOC}% → {session.endSOC}%</p>
                                </div>

                                {/* Energy Value Label */}
                                <span className="text-[9px] font-bold font-mono text-emerald-400 mb-1 opacity-80">
                                  {session.energyConsumed.toFixed(0)}
                                </span>

                                {/* Bar */}
                                <div className="w-8 bg-slate-900 rounded-t overflow-hidden relative h-28 flex items-end">
                                  <div 
                                    className="w-full bg-emerald-500 rounded-t transition-all duration-700 hover:bg-emerald-400" 
                                    style={{ height: `${barHeight}%` }}
                                  />
                                </div>

                                {/* Odometer or label */}
                                <span className="text-[9px] font-mono text-slate-500 mt-1.5 truncate max-w-[50px]">
                                  {session.startTime ? new Date(session.startTime).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit' }) : '-'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="border-t border-slate-800 mt-2 pt-1 flex justify-between text-[8px] text-slate-500 font-mono uppercase">
                          <span>อดีต</span>
                          <span>ล่าสุด</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[300px] bg-slate-900 border border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center text-center text-slate-500">
                  <Truck className="w-12 h-12 mb-3 text-slate-700 animate-bounce" />
                  <h4 className="text-sm font-bold text-white uppercase font-mono">กรุณาเลือกหัวลากจากตารางซ้ายมือ</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    เลือกหัวลากพ่วงไฟฟ้าที่ต้องการดูวิเคราะห์เชิงลึก ข้อมูลประสิทธิภาพการใช้ไฟ คาร์บอนเครดิต และประวัติการเติมประจุแบบแยกคัน
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Full-width Row: Grouped Logs */}
          {selectedTruckStats && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm w-full animate-fade-in" id="vehicles-grouped-logs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800/80 pb-3 mb-4 gap-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider font-mono flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    ประวัติบันทึกข้อมูลแบบกลุ่มตามวันที่ (GROUPED LOGS) — {selectedTruckStats.truck.id}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono mt-1">
                    แสดงรายละเอียดบันทึกการประจุไฟฟ้าของรถ <span className="text-emerald-400 font-bold">{selectedTruckStats.truck.id} ({selectedTruckStats.truck.licensePlate})</span> แยกกลุ่มรายการเป็นรายวันจากล่าสุดย้อนหลัง คลิกเพื่อย่อหรือขยายรายละเอียดในแต่ละวัน
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 text-[10px] font-mono uppercase font-bold">แถวต่อหน้า:</span>
                    <select
                      value={groupedLogsPerPage}
                      onChange={(e) => {
                        setGroupedLogsPerPage(Number(e.target.value));
                        setGroupedLogsPage(1);
                      }}
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                    >
                      <option value={10}>10 วัน</option>
                      <option value={20}>20 วัน</option>
                      <option value={50}>50 วัน</option>
                    </select>
                  </div>
                  <span className="text-[10px] bg-slate-950 px-2.5 py-1 rounded text-emerald-400 border border-slate-800 font-mono font-bold">
                    ประวัติทั้งหมด: {Object.values(selectedTruckGroupedSessions).flat().length} รายการ ({Object.keys(selectedTruckGroupedSessions).length} วัน)
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-950 text-slate-500 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider">
                      <th className="py-2.5 px-3 whitespace-nowrap">ID / รายการรอบชาร์จ</th>
                      <th className="py-2.5 px-2 text-center whitespace-nowrap">สถานีและผู้ใช้งาน</th>
                      <th className="py-2.5 px-2 text-center whitespace-nowrap">SOC CHANGE (เริ่มต้น → สิ้นสุด)</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap">พลังงานที่จ่ายไป (ENERGY)</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap">ระยะเวลาชาร์จ</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">ค่าไฟฟ้าสุทธิ (THB)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedGroupedSessions.entries.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500 font-mono whitespace-nowrap">
                          <ZapOff className="w-8 h-8 text-slate-700 mx-auto mb-2 animate-pulse" />
                          ไม่มีประวัติข้อมูลการประจุพลังงานของรถคันนี้ในระบบ
                        </td>
                      </tr>
                    ) : (
                      paginatedGroupedSessions.entries.map(([date, rawSessions]) => {
                        const dateSessions = rawSessions as SessionLog[];
                        const isExpanded = expandedDates.has(date);
                        
                        return (
                          <React.Fragment key={date}>
                            {/* Date Header Row */}
                            <tr 
                              onClick={() => toggleDate(date)}
                              className="bg-slate-800/40 hover:bg-slate-800/80 cursor-pointer transition-all border-b border-slate-800/60"
                            >
                              <td colSpan={6} className="py-2.5 px-3 font-bold text-slate-200 whitespace-nowrap">
                                <div className="flex items-center justify-between w-full">
                                  <div className="flex items-center gap-2">
                                    {isExpanded ? <ChevronDown className="w-4 h-4 text-emerald-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />}
                                    <span>วันที่: {date}</span>
                                    <span className="text-slate-500 text-[10px] font-normal font-sans">({dateSessions.length} รายการชาร์จ)</span>
                                  </div>
                                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-900/30 px-2 py-0.5 rounded">
                                    ยอดรวม: {dateSessions.reduce((sum, s) => sum + (s.energyConsumed || 0), 0).toFixed(1)} kWh
                                  </span>
                                </div>
                              </td>
                            </tr>
                            
                            {/* Expanded sessions list */}
                            {isExpanded && dateSessions.map((s, idx) => {
                              const costVal = s.totalCost || (s.energyConsumed * (s.pricePerUnit || 3.5));
                              return (
                                <tr key={`${s.id}-${idx}`} className="hover:bg-slate-950/40 transition-colors border-b border-slate-800/30">
                                  <td className="py-2.5 px-3 font-bold text-emerald-400 whitespace-nowrap">
                                    {s.id}
                                  </td>
                                  <td className="py-2.5 px-2 text-center text-slate-300 whitespace-nowrap">
                                    <span className="font-semibold text-slate-100">{s.stationId}</span>
                                    <span className="text-[10px] text-slate-500 block">ผู้ใช้: {s.operatorName}</span>
                                  </td>
                                  <td className="py-2.5 px-2 text-center text-slate-300 font-semibold whitespace-nowrap">
                                    {s.startSOC}% → {s.endSOC}%
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-bold text-emerald-400 whitespace-nowrap">
                                    {s.energyConsumed.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span className="text-[10px] text-slate-500 font-normal">kWh</span>
                                  </td>
                                  <td className="py-2.5 px-2 text-right text-slate-300 whitespace-nowrap">
                                    {s.duration} นาที
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-amber-400 whitespace-nowrap">
                                    ฿{costVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              {paginatedGroupedSessions.totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between mt-4 pt-3 border-t border-slate-800/60 gap-3 font-mono">
                  <span className="text-xs text-slate-400">
                    แสดงกลุ่มวันที่ {(paginatedGroupedSessions.currentPage - 1) * groupedLogsPerPage + 1} - {Math.min(paginatedGroupedSessions.currentPage * groupedLogsPerPage, paginatedGroupedSessions.totalCount)} จากทั้งหมด {paginatedGroupedSessions.totalCount} วัน
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setGroupedLogsPage(prev => Math.max(1, prev - 1))}
                      disabled={paginatedGroupedSessions.currentPage === 1}
                      className="p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-all cursor-pointer"
                      title="ย้อนกลับ (Previous Page)"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    
                    <span className="text-xs text-slate-300 px-3 py-1 bg-slate-950 border border-slate-800 rounded min-w-[100px] text-center">
                      หน้า {paginatedGroupedSessions.currentPage} จาก {paginatedGroupedSessions.totalPages}
                    </span>
                    
                    <button
                      onClick={() => setGroupedLogsPage(prev => Math.min(paginatedGroupedSessions.totalPages, prev + 1))}
                      disabled={paginatedGroupedSessions.currentPage === paginatedGroupedSessions.totalPages}
                      className="p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-all cursor-pointer"
                      title="ถัดไป (Next Page)"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {reportType === 'comparison' && (
        <div className="space-y-4 animate-fade-in" id="comparison-report-view">
          {/* Metric selector tabs */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
            <div>
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                เปรียบเทียบผลประกอบการและประสิทธิภาพรายเดือน (MONTHLY PERFORMANCE COMPARISON)
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5 font-semibold">
                เปรียบเทียบประวัติการชาร์จสะสม พลังงาน และค่าไฟฟ้า ของตู้ชาร์จและรถหัวลากในแต่ละเดือน
              </p>
            </div>
            
            <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-850 self-stretch sm:self-auto justify-center">
              <button
                onClick={() => setCompareMetric('energy')}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                  compareMetric === 'energy'
                    ? 'bg-emerald-600 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                พลังงาน (kWh)
              </button>
              <button
                onClick={() => setCompareMetric('cost')}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                  compareMetric === 'cost'
                    ? 'bg-emerald-600 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                ค่าไฟฟ้า (฿)
              </button>
              <button
                onClick={() => setCompareMetric('sessions')}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                  compareMetric === 'sessions'
                    ? 'bg-emerald-600 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                จำนวนรอบชาร์จ
              </button>
            </div>
          </div>

          {/* Double Columns: Station Compare & Truck Compare */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Column A: Stations Comparison Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-3.5 font-mono flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                ปริมาณสะสมแยกตามรายตู้ชาร์จ ({compareMetric === 'energy' ? 'KWH' : compareMetric === 'cost' ? 'BAHT' : 'SESSIONS'})
              </h4>
              
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-850 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800">
                <div className="min-w-[480px] lg:min-w-0">
                  <div className="h-56 flex items-end pt-6 relative px-1">
                    {/* Y-Axis Guideline Numbers */}
                    <div className="flex flex-col justify-between text-[8px] font-mono text-slate-500 h-40 pb-5 pr-2.5 border-r border-slate-800/80 w-16 select-none pointer-events-none text-right shrink-0">
                      <span className="leading-none truncate">{formatYAxisValue(maxStationMonthlyTotal)}</span>
                      <span className="leading-none truncate">{formatYAxisValue(maxStationMonthlyTotal / 2)}</span>
                      <span className="leading-none truncate">0</span>
                    </div>

                    {/* Bars Container with inner padding */}
                    <div className="flex-1 flex items-end justify-around h-40 relative pl-4 pr-2 gap-2">
                      {/* Grid Lines behind bars */}
                      <div className="absolute inset-x-0 top-0 bottom-0 flex flex-col justify-between pointer-events-none py-1 pl-4 pr-2">
                        <div className="border-t border-dashed border-slate-800/40 w-full" />
                        <div className="border-t border-dashed border-slate-800/40 w-full" />
                        <div className="border-b border-dashed border-slate-800/40 w-full" />
                      </div>

                      {[...comparisonData.months].reverse().map((m) => {
                        // Calculate total for this month to display above bar
                        let totalMonthVal = 0;
                        const segments = comparisonData.stationCompare.map(st => {
                          const val = compareMetric === 'energy' 
                            ? st.monthlyEnergy[m] || 0
                            : compareMetric === 'cost' 
                            ? st.monthlyCost[m] || 0
                            : st.monthlySessions[m] || 0;
                          totalMonthVal += val;
                          return { ...st, val };
                        });

                        return (
                          <div key={m} className="flex flex-col items-center flex-1 h-full justify-end relative group z-10 max-w-[48px]">
                            {/* Value indicator above the bar */}
                            <span className="text-[8px] font-bold font-mono text-slate-400 mb-1 opacity-80 whitespace-nowrap">
                              {compareMetric === 'cost' 
                                ? `฿${Math.round(totalMonthVal).toLocaleString()}` 
                                : Math.round(totalMonthVal).toLocaleString()}
                            </span>

                            {/* Stacked Bar */}
                            <div className="w-full bg-slate-900/60 rounded-t overflow-hidden h-40 flex flex-col justify-end border border-slate-800/40">
                              {segments.map((seg, sIdx) => {
                                if (seg.val === 0) return null;
                                const heightPct = (seg.val / (maxStationMonthlyTotal || 1)) * 100;
                                return (
                                  <div
                                    key={seg.id}
                                    style={{ height: `${heightPct}%`, backgroundColor: seg.color }}
                                    className="w-full transition-all duration-300 hover:brightness-125 cursor-pointer relative"
                                    onMouseEnter={() => setHoveredSegment({
                                      month: m,
                                      id: seg.id,
                                      name: seg.name,
                                      value: seg.val,
                                      type: 'station'
                                    })}
                                    onMouseLeave={() => setHoveredSegment(null)}
                                  />
                                );
                              })}
                            </div>

                            {/* Month Label */}
                            <span className="text-[9px] font-mono text-slate-500 mt-2 text-center whitespace-nowrap">
                              {formatThaiMonth(m)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                
                {/* Station Legend */}
                <div className="border-t border-slate-850 mt-4 pt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                  {comparisonData.stationCompare.map(st => (
                    <div key={st.id} className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: st.color }} />
                      <span className="font-bold text-slate-300">{st.id}</span>
                      <span className="text-[9px] text-slate-500">({st.name})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Column B: Trucks Comparison Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-3.5 font-mono flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                ปริมาณสะสมแยกตามรายรถหัวลาก ({compareMetric === 'energy' ? 'KWH' : compareMetric === 'cost' ? 'BAHT' : 'SESSIONS'})
              </h4>

              <div className="bg-slate-950 p-4 rounded-lg border border-slate-850 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800">
                <div className="min-w-[480px] lg:min-w-0">
                  <div className="h-56 flex items-end pt-6 relative px-1">
                    {/* Y-Axis Guideline Numbers */}
                    <div className="flex flex-col justify-between text-[8px] font-mono text-slate-500 h-40 pb-5 pr-2.5 border-r border-slate-800/80 w-16 select-none pointer-events-none text-right shrink-0">
                      <span className="leading-none truncate">{formatYAxisValue(maxTruckMonthlyTotal)}</span>
                      <span className="leading-none truncate">{formatYAxisValue(maxTruckMonthlyTotal / 2)}</span>
                      <span className="leading-none truncate">0</span>
                    </div>

                    {/* Bars Container with inner padding */}
                    <div className="flex-1 flex items-end justify-around h-40 relative pl-4 pr-2 gap-2">
                      {/* Grid Lines behind bars */}
                      <div className="absolute inset-x-0 top-0 bottom-0 flex flex-col justify-between pointer-events-none py-1 pl-4 pr-2">
                        <div className="border-t border-dashed border-slate-800/40 w-full" />
                        <div className="border-t border-dashed border-slate-800/40 w-full" />
                        <div className="border-b border-dashed border-slate-800/40 w-full" />
                      </div>

                      {[...comparisonData.months].reverse().map((m) => {
                        let totalMonthVal = 0;
                        const segments = comparisonData.truckCompare.map(tr => {
                          const val = compareMetric === 'energy' 
                            ? tr.monthlyEnergy[m] || 0
                            : compareMetric === 'cost' 
                            ? tr.monthlyCost[m] || 0
                            : tr.monthlySessions[m] || 0;
                          totalMonthVal += val;
                          return { ...tr, val };
                        });

                        return (
                          <div key={m} className="flex flex-col items-center flex-1 h-full justify-end relative group z-10 max-w-[48px]">
                            {/* Value indicator */}
                            <span className="text-[8px] font-bold font-mono text-slate-400 mb-1 opacity-80 whitespace-nowrap">
                              {compareMetric === 'cost' 
                                ? `฿${Math.round(totalMonthVal).toLocaleString()}` 
                                : Math.round(totalMonthVal).toLocaleString()}
                            </span>

                            {/* Stacked Bar */}
                            <div className="w-full bg-slate-900/60 rounded-t overflow-hidden h-40 flex flex-col justify-end border border-slate-800/40">
                              {segments.map((seg) => {
                                if (seg.val === 0) return null;
                                const heightPct = (seg.val / (maxTruckMonthlyTotal || 1)) * 100;
                                return (
                                  <div
                                    key={seg.id}
                                    style={{ height: `${heightPct}%`, backgroundColor: seg.color }}
                                    className="w-full transition-all duration-300 hover:brightness-125 cursor-pointer relative"
                                    onMouseEnter={() => setHoveredSegment({
                                      month: m,
                                      id: seg.id,
                                      name: `${seg.licensePlate} (${seg.model})`,
                                      value: seg.val,
                                      type: 'truck'
                                    })}
                                    onMouseLeave={() => setHoveredSegment(null)}
                                  />
                                );
                              })}
                            </div>

                            {/* Month Label */}
                            <span className="text-[9px] font-mono text-slate-500 mt-2 text-center whitespace-nowrap">
                              {formatThaiMonth(m)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Truck Legend */}
                <div className="border-t border-slate-850 mt-4 pt-3 flex flex-wrap justify-center gap-x-3 gap-y-1.5">
                  {comparisonData.truckCompare.slice(0, 6).map(tr => (
                    <div key={tr.id} className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: tr.color }} />
                      <span className="font-bold text-slate-300">{tr.id}</span>
                      <span className="text-[9px] text-slate-500">({tr.licensePlate})</span>
                    </div>
                  ))}
                  {comparisonData.truckCompare.length > 6 && (
                    <span className="text-[9px] text-slate-500 font-bold self-center">+{comparisonData.truckCompare.length - 6} คันอื่น ๆ</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Floating Tooltip (Dynamic Hover State) */}
          {hoveredSegment && (
            <div className="bg-slate-950 border border-emerald-500/30 p-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in text-xs font-mono max-w-md mx-auto">
              <div className="w-3 h-3 rounded-full animate-ping" style={{ backgroundColor: hoveredSegment.type === 'station' ? '#10b981' : '#3b82f6' }} />
              <div>
                <p className="text-slate-500 text-[10px] font-bold">ข้อมูลจุดชาร์จและหัวลากรายเดือน ({formatThaiMonth(hoveredSegment.month)})</p>
                <p className="text-white font-bold mt-0.5">
                  {hoveredSegment.id} : <span className="text-slate-300">{hoveredSegment.name}</span>
                </p>
                <p className="text-emerald-400 font-black mt-1">
                  {compareMetric === 'energy' 
                    ? `ปริมาณไฟฟ้า: ${hoveredSegment.value.toLocaleString(undefined, {maximumFractionDigits: 1})} kWh` 
                    : compareMetric === 'cost' 
                    ? `มูลค่าค่าไฟ: ฿${hoveredSegment.value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` 
                    : `จำนวนครั้งที่ชาร์จ: ${hoveredSegment.value} ครั้ง`}
                </p>
              </div>
            </div>
          )}

          {/* Grouped Comparative Logs Table (Mandatory collapsed-by-default behavior) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider mb-3 font-mono flex items-center justify-between">
              <span>ตารางเปรียบเทียบข้อมูลสรุปประจำเดือน (MONTHLY SUMMARIES)</span>
              <span className="text-[10px] text-slate-500 font-normal font-sans">คลิกแถวเดือนเพื่อย่อ-ขยายข้อมูลแยกย่อย</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left border-collapse text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-[9px] font-bold text-slate-500 uppercase tracking-wider bg-slate-950/40">
                    <th className="py-2 px-3 whitespace-nowrap">เดือนเปรียบเทียบ / รายการย่อย</th>
                    <th className="py-2 px-2.5 text-center whitespace-nowrap">ประเภท</th>
                    <th className="py-2 px-3 text-right whitespace-nowrap">พลังงานรวม (kWh)</th>
                    <th className="py-2 px-3 text-right whitespace-nowrap">ค่าไฟฟ้ารวม (บาท)</th>
                    <th className="py-2 px-3 text-right whitespace-nowrap">รอบการใช้งาน</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonData.months.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-600 whitespace-nowrap">ไม่มีข้อมูลการชาร์จในระบบเพื่อวิเคราะห์เปรียบเทียบ</td>
                    </tr>
                  ) : (
                    [...comparisonData.months].reverse().map((m) => {
                      const isExpanded = expandedCompareMonths.has(m);
                      
                      // Calculate total stats for this month across all stations and trucks
                      const monthEnergy = comparisonData.stationCompare.reduce((sum, st) => sum + (st.monthlyEnergy[m] || 0), 0);
                      const monthCost = comparisonData.stationCompare.reduce((sum, st) => sum + (st.monthlyCost[m] || 0), 0);
                      const monthSessions = comparisonData.stationCompare.reduce((sum, st) => sum + (st.monthlySessions[m] || 0), 0);

                      return (
                        <React.Fragment key={m}>
                          {/* Date Group Header - Click to expand */}
                          <tr 
                            onClick={() => toggleCompareMonth(m)}
                            className="bg-slate-800/40 hover:bg-slate-800/80 cursor-pointer transition-all border-b border-slate-800/60 font-bold"
                          >
                            <td className="py-2.5 px-3 text-slate-200 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                )}
                                <span className="whitespace-nowrap">{formatThaiMonth(m)}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-2.5 text-center text-slate-500 font-sans text-[10px] whitespace-nowrap">
                              MONTHLY_TOTAL
                            </td>
                            <td className="py-2.5 px-3 text-right text-emerald-400 font-black whitespace-nowrap">
                              {monthEnergy.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh
                            </td>
                            <td className="py-2.5 px-3 text-right text-amber-400 font-black whitespace-nowrap">
                              ฿{monthCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-300 font-black whitespace-nowrap">
                              {monthSessions} รอบ
                            </td>
                          </tr>

                          {/* Expanded Station Rows */}
                          {isExpanded && (
                            <>
                              <tr className="bg-slate-950/20 text-slate-500 text-[9px] font-bold">
                                <td colSpan={5} className="py-1 px-8 uppercase border-b border-slate-800/20 whitespace-nowrap">
                                  --- ข้อมูลการใช้ตู้ชาร์จประจำสถานี (BAYS PERFORMANCE) ---
                                </td>
                              </tr>
                              {comparisonData.stationCompare.map(st => {
                                const stEnergy = st.monthlyEnergy[m] || 0;
                                const stCost = st.monthlyCost[m] || 0;
                                const stSessions = st.monthlySessions[m] || 0;
                                if (stSessions === 0 && stEnergy === 0) return null;

                                return (
                                  <tr key={`st-${st.id}`} className="hover:bg-slate-950/40 transition-colors border-b border-slate-800/30">
                                    <td className="py-2 px-8 text-slate-300 whitespace-nowrap">
                                      <div className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                                        <span className="font-semibold">{st.id} ({st.name})</span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-2.5 text-center text-slate-500 font-sans text-[10px] whitespace-nowrap">
                                      ตู้ชาร์จ
                                    </td>
                                    <td className="py-2 px-3 text-right text-emerald-400/80 whitespace-nowrap">
                                      {stEnergy.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh
                                    </td>
                                    <td className="py-2 px-3 text-right text-slate-300 whitespace-nowrap">
                                      ฿{stCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-2 px-3 text-right text-slate-400 whitespace-nowrap">
                                      {stSessions} รอบ
                                    </td>
                                  </tr>
                                );
                              })}

                              <tr className="bg-slate-950/20 text-slate-500 text-[9px] font-bold">
                                <td colSpan={5} className="py-1 px-8 uppercase border-b border-slate-800/20 whitespace-nowrap">
                                  --- ข้อมูลรายรถหัวลากไฟฟ้า (VEHICLES COMPARISON) ---
                                </td>
                              </tr>
                              {comparisonData.truckCompare.map(tr => {
                                const trEnergy = tr.monthlyEnergy[m] || 0;
                                const trCost = tr.monthlyCost[m] || 0;
                                const trSessions = tr.monthlySessions[m] || 0;
                                if (trSessions === 0 && trEnergy === 0) return null;

                                return (
                                  <tr key={`tr-${tr.id}`} className="hover:bg-slate-950/40 transition-colors border-b border-slate-800/30">
                                    <td className="py-2 px-8 text-slate-300 whitespace-nowrap">
                                      <div className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tr.color }} />
                                        <span className="font-semibold">{tr.id} ({tr.licensePlate})</span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-2.5 text-center text-slate-500 font-sans text-[10px] whitespace-nowrap">
                                      รถหัวลาก
                                    </td>
                                    <td className="py-2 px-3 text-right text-emerald-400/80 whitespace-nowrap">
                                      {trEnergy.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh
                                    </td>
                                    <td className="py-2 px-3 text-right text-slate-300 whitespace-nowrap">
                                      ฿{trCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-2 px-3 text-right text-slate-400 whitespace-nowrap">
                                      {trSessions} รอบ
                                    </td>
                                  </tr>
                                );
                              })}
                            </>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
