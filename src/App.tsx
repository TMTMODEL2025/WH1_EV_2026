import React, { useState, useEffect, useRef, useMemo } from 'react';
import { EVTruck, ChargingStation, QueueItem, SessionLog, GASConfig } from './types/ev';
import { initAuth, googleSignIn, logout, getAccessToken } from './services/firebaseAuth';
import { googleSheetsDirect } from './services/googleSheetsDirect';
import { googleAppsScriptService, DEFAULT_PRODUCTION_GAS_URL, sanitizeBaseGasUrl, GasBatchOperation } from './services/googleAppsScriptService';
import Swal from 'sweetalert2';

// Component imports
import Dashboard from './components/Dashboard';
import TrucksList from './components/TrucksList';
import StationsList from './components/StationsList';
import SessionsHistory from './components/SessionsHistory';
import Reports from './components/Reports';
import Analytics from './components/Analytics';
import GasSetupPanel from './components/GasSetupPanel';
import CustomLogin from './components/CustomLogin';
import { getElectricityPrice } from './utils/pricing';
import { getThailandISOString, generateUniqueSessionId } from './utils/date';
import { UserItem } from './data/users';
import UsersList from './components/UsersList';

// Target session patch for S-261007-212515-TTEV23: END = 22:13, DURATION = 48m
const TARGET_PATCHED_SESSION_ID = 'S-261007-212515-TTEV23';
const DEFAULT_TARGET_SESSION: SessionLog = {
  id: 'S-261007-212515-TTEV23',
  truckId: 'TTEV-23',
  stationId: 'DC-01',
  operatorName: 'นายนพรัตน์ แสงแก้ว',
  startTime: '2026-10-07T21:25:15+07:00',
  endTime: '2026-10-07T22:13:00+07:00',
  startSOC: 40,
  endSOC: 100,
  energyConsumed: 12.8,
  duration: 48,
  status: 'Completed',
  odometer: 9870,
  pricePerUnit: 3.5000,
  totalCost: 44.8,
  stoppedBy: 'นายนพรัตน์ แสงแก้ว',
  isAutoCompleted: true
};

const applySessionGuardsAndPatches = (session: SessionLog): SessionLog => {
  if (!session) return session;
  const sid = session.id ? String(session.id).trim().toUpperCase() : '';

  // 1. Specific Target Session Repair: S-261007-212515-TTEV23 -> END = 22:13 (+07:00), DURATION = 48m
  if (sid === TARGET_PATCHED_SESSION_ID) {
    const patchedEndTime = '2026-10-07T22:13:00+07:00';
    const patchedDuration = 48;
    const currentStartSOC = session.startSOC || 0;
    const patchedEndSOC = session.endSOC && session.endSOC > currentStartSOC ? session.endSOC : 100;
    const energy = session.energyConsumed && session.energyConsumed > 0 
      ? session.energyConsumed 
      : Math.round(((patchedDuration * 16) / 60) * 100) / 100;
    const cost = session.totalCost && session.totalCost > 0 
      ? session.totalCost 
      : Math.round(energy * (session.pricePerUnit || 3.50) * 100) / 100;

    return {
      ...session,
      endTime: patchedEndTime,
      duration: patchedDuration,
      endSOC: patchedEndSOC,
      energyConsumed: energy,
      totalCost: cost,
      status: 'Completed',
      isAutoCompleted: true,
      stoppedBy: session.stoppedBy || session.operatorName || 'นายนพรัตน์ แสงแก้ว'
    };
  }

  // 2. Abandoned Session Guard (> 12 hours):
  // For recent sessions reaching 100%, checkAutoCompleteRoutine will properly write the completion to Google Sheets.
  // Only force-guard in memory if an unclosed session was abandoned for > 12 hours (720 mins).
  if (session.status?.toLowerCase() === 'charging' || !session.endTime) {
    if (session.startTime) {
      const startMs = new Date(session.startTime).getTime();
      const nowMs = Date.now();
      if (!isNaN(startMs)) {
        const elapsedMinutes = Math.max(0, (nowMs - startMs) / 60000);
        const startSOC = session.startSOC || 0;
        const estMinutesToFull = Math.max(1, Math.round((100 - startSOC) * 1.45));
        
        if (elapsedMinutes > 720) {
          const guardedDuration = Math.min(180, estMinutesToFull);
          const guardedEndMs = startMs + (guardedDuration * 60000);
          const guardedEndTime = getThailandISOString(new Date(guardedEndMs));
          const guardedEnergy = Math.round(((guardedDuration * 16) / 60) * 100) / 100;
          const guardedCost = Math.round(guardedEnergy * (session.pricePerUnit || 3.50) * 100) / 100;

          return {
            ...session,
            endTime: guardedEndTime,
            endSOC: 100,
            duration: guardedDuration,
            energyConsumed: session.energyConsumed || guardedEnergy,
            totalCost: session.totalCost || guardedCost,
            status: 'Completed'
          };
        }
      }
    }
  }

  return session;
};

import {
  LayoutDashboard,
  Truck,
  Zap,
  ListOrdered,
  History,
  BarChart3,
  Settings,
  LogOut,
  RefreshCw,
  Database,
  Menu,
  X,
  CloudLightning,
  User,
  ExternalLink,
  Sun,
  Moon,
  Activity
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(false);

  // App settings cached in LocalStorage
  const [config, setConfig] = useState<GASConfig>(() => {
    const saved = localStorage.getItem('ev_charging_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.webAppUrl) {
          parsed.webAppUrl = DEFAULT_PRODUCTION_GAS_URL;
          parsed.mode = 'gas';
        } else {
          parsed.webAppUrl = sanitizeBaseGasUrl(parsed.webAppUrl);
        }
        return parsed;
      } catch (e) {
        // Fallback
      }
    }
    return {
      spreadsheetId: '',
      webAppUrl: DEFAULT_PRODUCTION_GAS_URL,
      mode: 'gas'
    };
  });

  // Table Data State with LocalStorage Caches for High Resiliency
  const [trucks, setTrucks] = useState<EVTruck[]>(() => {
    try {
      const saved = localStorage.getItem('ev_cached_trucks');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      { id: 'TTEV-19', licensePlate: '83-9919', model: 'SANY EV Truck', batteryCapacity: 218, currentSOC: 35, status: 'Available', lastUpdated: new Date().toISOString(), currentOdometer: 14520 },
      { id: 'TTEV-20', licensePlate: '83-9920', model: 'SANY EV Truck', batteryCapacity: 218, currentSOC: 42, status: 'Available', lastUpdated: new Date().toISOString(), currentOdometer: 12100 },
      { id: 'TTEV-21', licensePlate: '83-9921', model: 'LISHEN EV', batteryCapacity: 282, currentSOC: 18, status: 'Available', lastUpdated: new Date().toISOString(), currentOdometer: 18940 },
      { id: 'TTEV-22', licensePlate: '83-9922', model: 'SANY EV Truck', batteryCapacity: 218, currentSOC: 55, status: 'Available', lastUpdated: new Date().toISOString(), currentOdometer: 11050 },
      { id: 'TTEV-23', licensePlate: '83-9923', model: 'LISHEN EV', batteryCapacity: 282, currentSOC: 40, status: 'Available', lastUpdated: new Date().toISOString(), currentOdometer: 9870 },
      { id: 'TTEV-24', licensePlate: '83-9924', model: 'SANY EV Truck', batteryCapacity: 218, currentSOC: 62, status: 'Available', lastUpdated: new Date().toISOString(), currentOdometer: 8520 },
      { id: 'TTEV-25', licensePlate: '83-9925', model: 'LISHEN EV', batteryCapacity: 282, currentSOC: 25, status: 'Available', lastUpdated: new Date().toISOString(), currentOdometer: 15400 },
      { id: 'TTEV-26', licensePlate: '83-9926', model: 'SANY EV Truck', batteryCapacity: 218, currentSOC: 78, status: 'Available', lastUpdated: new Date().toISOString(), currentOdometer: 16210 },
      { id: 'TTEV-27', licensePlate: '83-9927', model: 'LISHEN EV', batteryCapacity: 282, currentSOC: 88, status: 'Available', lastUpdated: new Date().toISOString(), currentOdometer: 17350 }
    ];
  });

  const [stations, setStations] = useState<ChargingStation[]>(() => {
    try {
      const saved = localStorage.getItem('ev_cached_stations');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      { id: 'DC-01', name: 'ตู้ชาร์จ DC-01 (150kW)', chargerType: 'DC', powerOutput: 150, status: 'Available', occupyingTruckId: '', lastUpdated: new Date().toISOString() },
      { id: 'AC-02', name: 'ตู้ชาร์จ AC-02 (40kW)', chargerType: 'AC', powerOutput: 40, status: 'Available', occupyingTruckId: '', lastUpdated: new Date().toISOString() },
      { id: 'DC-03', name: 'ตู้ชาร์จ DC-03 (150kW)', chargerType: 'DC', powerOutput: 150, status: 'Available', occupyingTruckId: '', lastUpdated: new Date().toISOString() },
      { id: 'AC-04', name: 'ตู้ชาร์จ AC-04 (40kW)', chargerType: 'AC', powerOutput: 40, status: 'Available', occupyingTruckId: '', lastUpdated: new Date().toISOString() }
    ];
  });

  const [queue, setQueue] = useState<QueueItem[]>(() => {
    try {
      const saved = localStorage.getItem('ev_cached_queue');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  const [sessions, setSessions] = useState<SessionLog[]>(() => {
    try {
      const saved = localStorage.getItem('ev_cached_sessions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const patchedList = parsed.map(applySessionGuardsAndPatches);
          if (!patchedList.some(s => s.id === TARGET_PATCHED_SESSION_ID)) {
            patchedList.push(DEFAULT_TARGET_SESSION);
          }
          return patchedList;
        }
      }
    } catch (e) {}
    return [DEFAULT_TARGET_SESSION];
  });

  const [usersList, setUsersList] = useState<{ name: string; employeeId: string; role?: any }[]>(() => {
    try {
      const saved = localStorage.getItem('ev_cached_users');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      { employeeId: '10012025', name: 'นาย สมชาย ดีใจ', role: 'Driver' },
      { employeeId: '10012026', name: 'นาย วิชัย รักเรียน', role: 'Driver' },
      { employeeId: '10012027', name: 'นางสาว สุดา สวยงาม', role: 'Driver' },
      { employeeId: '10012028', name: 'นาย อานนท์ ขยันยิ่ง', role: 'Driver' },
      { employeeId: '99999999', name: 'ผู้ดูแลระบบ', role: 'Admin' },
      { employeeId: '685400', name: 'ผู้จัดการระบบ', role: 'Supervisor' }
    ];
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [isLastPage, setIsLastPage] = useState(false);

  // Keep caches updated on every state mutation
  useEffect(() => {
    if (trucks && trucks.length > 0) {
      localStorage.setItem('ev_cached_trucks', JSON.stringify(trucks));
    }
  }, [trucks]);

  useEffect(() => {
    if (stations && stations.length > 0) {
      localStorage.setItem('ev_cached_stations', JSON.stringify(stations));
    }
  }, [stations]);

  useEffect(() => {
    if (queue) {
      localStorage.setItem('ev_cached_queue', JSON.stringify(queue));
    }
  }, [queue]);

  useEffect(() => {
    if (sessions && sessions.length > 0) {
      try {
        // Cache the most recent 200 sessions to keep localStorage fast and well within quota
        const sessionsToCache = sessions.slice(0, 200);
        localStorage.setItem('ev_cached_sessions', JSON.stringify(sessionsToCache));
      } catch (e) {
        console.warn('LocalStorage quota exceeded for sessions cache');
      }
    }
  }, [sessions]);

  useEffect(() => {
    if (usersList && usersList.length > 0) {
      localStorage.setItem('ev_cached_users', JSON.stringify(usersList));
    }
  }, [usersList]);

  // Single Source of Truth (SSOT): Active in-progress charging sessions
  const activeChargingSessions = useMemo(() => {
    const map = new Map<string, SessionLog>();
    for (const s of sessions) {
      if (s.status?.toLowerCase() === 'charging') {
        const truckKey = (s.truckId || '').trim().toUpperCase();
        if (truckKey) {
          const existing = map.get(truckKey);
          if (!existing) {
            map.set(truckKey, s);
          } else {
            const tExisting = new Date(existing.startTime).getTime() || 0;
            const tNew = new Date(s.startTime).getTime() || 0;
            if (tNew > tExisting) {
              map.set(truckKey, s);
            }
          }
        }
      }
    }
    return Array.from(map.values());
  }, [sessions]);

  // Harmonized Trucks: status is strictly derived from active charging sessions (SSOT)
  const harmonizedTrucks = useMemo(() => {
    const activeTruckMap = new Map<string, SessionLog>();
    for (const s of activeChargingSessions) {
      if (s.truckId) {
        activeTruckMap.set(s.truckId.trim().toUpperCase(), s);
      }
    }

    return trucks.map(truck => {
      const activeSession = activeTruckMap.get(truck.id.trim().toUpperCase());
      const isCharging = Boolean(activeSession);
      const dynamicStatus: 'Available' | 'Charging' | 'Maintenance' = 
        truck.status === 'Maintenance'
          ? 'Maintenance'
          : (isCharging ? 'Charging' : 'Available');

      return {
        ...truck,
        status: dynamicStatus,
      };
    });
  }, [trucks, activeChargingSessions]);

  // Harmonized Stations: status & occupyingTruckId strictly derived from active charging sessions (SSOT)
  const harmonizedStations = useMemo(() => {
    const activeStationMap = new Map<string, SessionLog>();
    for (const s of activeChargingSessions) {
      if (s.stationId) {
        activeStationMap.set(s.stationId.trim().toUpperCase(), s);
      }
    }

    return stations.map(station => {
      if (station.status === 'Maintenance') {
        return station;
      }
      const stationIdClean = station.id.trim().toUpperCase();
      let activeSession = activeStationMap.get(stationIdClean);
      if (!activeSession && station.occupyingTruckId) {
        activeSession = activeChargingSessions.find(
          s => s.truckId?.trim().toUpperCase() === station.occupyingTruckId?.trim().toUpperCase()
        );
      }

      const isOccupied = Boolean(activeSession);
      return {
        ...station,
        status: isOccupied ? ('Occupied' as const) : ('Available' as const),
        occupyingTruckId: activeSession ? activeSession.truckId : '',
      };
    });
  }, [stations, activeChargingSessions]);

  // Pending Transaction Queue for Background Syncing
  const [pendingTransactions, setPendingTransactions] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('ev_pending_transactions');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const pendingTransactionsRef = useRef<any[]>(pendingTransactions);
  const isSyncingRef = useRef(false);
  const inFlightWritesRef = useRef(0);

  useEffect(() => {
    pendingTransactionsRef.current = pendingTransactions;
    localStorage.setItem('ev_pending_transactions', JSON.stringify(pendingTransactions));
  }, [pendingTransactions]);

  // Throttling and Debouncing State
  const [lastActionTime, setLastActionTime] = useState<Record<string, number>>({});

  const isActionThrottled = (actionKey: string, limitMs = 1500): boolean => {
    const now = Date.now();
    const lastTime = lastActionTime[actionKey] || 0;
    if (now - lastTime < limitMs) {
      return true;
    }
    setLastActionTime(prev => ({ ...prev, [actionKey]: now }));
    return false;
  };

  // Base Sheets write execution helper
  const executeSheetsWrite = async (
    actionType: 'append' | 'update' | 'delete',
    sheetName: string,
    keyId?: string,
    row?: any[]
  ) => {
    if (config.mode === 'direct' && accessToken) {
      if (actionType === 'append') {
        await googleSheetsDirect.appendRow(config.spreadsheetId, sheetName, row!, accessToken);
      } else if (actionType === 'update') {
        await googleSheetsDirect.updateRow(config.spreadsheetId, sheetName, keyId!, row!, accessToken);
      } else if (actionType === 'delete') {
        await googleSheetsDirect.deleteRow(config.spreadsheetId, sheetName, keyId!, accessToken);
      }
    } else {
      if (actionType === 'append') {
        await googleAppsScriptService.appendRow(config.webAppUrl, sheetName, row!);
      } else if (actionType === 'update') {
        await googleAppsScriptService.updateRow(config.webAppUrl, sheetName, keyId!, row!);
      } else if (actionType === 'delete') {
        await googleAppsScriptService.deleteRow(config.webAppUrl, sheetName, keyId!);
      }
    }
  };

  // Helper to enqueue failed operations into pendingTransactions without duplicating already-succeeded steps
  const enqueuePendingOperations = (ops: Array<{
    description: string;
    actionType: 'append' | 'update' | 'delete';
    sheetName: string;
    keyId?: string;
    row?: any[];
  }>) => {
    if (!ops || ops.length === 0) return;
    const now = Date.now();
    const newTxItems = ops.map((op, idx) => ({
      id: `${op.sheetName}-${op.actionType}-${op.keyId || 'new'}-${now}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
      actionType: op.actionType,
      sheetName: op.sheetName,
      keyId: op.keyId,
      row: op.row,
      timestamp: now + idx,
      description: op.description
    }));
    setPendingTransactions(prev => [...prev, ...newTxItems]);
  };

  // Atomic / Batch database write helper for multi-sheet operations (Start Charging / Stop Charging)
  const executeBatchDatabaseWrite = async (
    ops: Array<{
      description: string;
      actionType: 'append' | 'update' | 'delete';
      sheetName: string;
      keyId?: string;
      row?: any[];
    }>
  ): Promise<boolean> => {
    if (!ops || ops.length === 0) return true;

    if (pendingTransactionsRef.current.length > 0) {
      enqueuePendingOperations(ops);
      return false;
    }

    inFlightWritesRef.current += 1;
    try {
      if (config.mode === 'gas' && config.webAppUrl) {
        const gasOps: GasBatchOperation[] = ops.map(op => ({
          action: op.actionType === 'append' ? 'add' : op.actionType,
          sheet: op.sheetName,
          id: op.keyId,
          row: op.row,
          description: op.description,
        }));
        const failedGasOps = await googleAppsScriptService.batchWrite(config.webAppUrl, gasOps);
        if (failedGasOps.length > 0) {
          enqueuePendingOperations(failedGasOps.map(f => ({
            description: f.description || `ซิงค์ ${f.sheet}`,
            actionType: f.action === 'add' ? 'append' : f.action,
            sheetName: f.sheet,
            keyId: f.id,
            row: f.row,
          })));
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'warning',
            title: 'บันทึกในเครื่องแล้ว กำลังซิงค์เบื้องหลัง...',
            showConfirmButton: false,
            timer: 3000,
            background: '#1e293b',
            color: '#f8fafc',
          });
          return false;
        }
        return true;
      } else {
        // Direct mode: execute sequentially and only enqueue remaining failed items if an error occurs
        for (let i = 0; i < ops.length; i++) {
          const op = ops[i];
          try {
            await executeSheetsWrite(op.actionType, op.sheetName, op.keyId, op.row);
          } catch (err) {
            enqueuePendingOperations(ops.slice(i));
            return false;
          }
        }
        return true;
      }
    } finally {
      inFlightWritesRef.current = Math.max(0, inFlightWritesRef.current - 1);
    }
  };

  // Sequential Background Database Queue Worker
  const performDatabaseWrite = async (
    description: string,
    actionType: 'append' | 'update' | 'delete',
    sheetName: string,
    keyId?: string,
    row?: any[]
  ) => {
    await executeBatchDatabaseWrite([{ description, actionType, sheetName, keyId, row }]);
  };

  // Process pending transactions (uses batchWrite when in GAS mode for instant clearing)
  const processPendingTransactions = async () => {
    const currentQueue = pendingTransactionsRef.current;
    if (isSyncingRef.current || currentQueue.length === 0 || inFlightWritesRef.current > 0) return;
    if (config.mode === 'direct' && (!accessToken || !config.spreadsheetId)) return;
    if (config.mode === 'gas' && !config.webAppUrl) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    const tx = currentQueue[0];

    try {
      await executeSheetsWrite(tx.actionType, tx.sheetName, tx.keyId, tx.row);
      // Success: remove this transaction from the queue
      setPendingTransactions(prev => prev.filter(item => item.id !== tx.id));
      
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `ซิงค์ข้อมูลสำเร็จ: ${tx.description}`,
        showConfirmButton: false,
        timer: 2000,
        background: '#1e293b',
        color: '#f8fafc',
      });

      // If this was the last item in the queue and no new writes are in-flight, trigger a clean refresh
      if (currentQueue.length === 1 && inFlightWritesRef.current === 0) {
        fetchAllData();
      }
    } catch (err: any) {
      console.warn(`Sync failed for pending transaction ${tx.id}. Will retry later. Error:`, err);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  };

  // Run background sync worker every 8 seconds using stable interval
  useEffect(() => {
    const timer = setInterval(() => {
      processPendingTransactions();
    }, 8000);
    return () => clearInterval(timer);
  }, [accessToken, config.mode, config.webAppUrl, config.spreadsheetId]);

  // Navigation and UI
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isFullHistoryLoaded, setIsFullHistoryLoaded] = useState(false);
  const [totalHistoryCount, setTotalHistoryCount] = useState<number>(0);
  const [isLoadingFullHistory, setIsLoadingFullHistory] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('ev_charging_theme');
    return (saved as 'dark' | 'light') || 'dark';
  });

  // Keep theme class updated in the document root
  useEffect(() => {
    localStorage.setItem('ev_charging_theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  }, [theme]);

  // Keep configuration updated in localstorage
  useEffect(() => {
    localStorage.setItem('ev_charging_config', JSON.stringify(config));
  }, [config]);

  // Handle Firebase Sign-In State
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setAccessToken(token);
        setAuthChecking(false);
      },
      () => {
        setAccessToken(null);
        setAuthChecking(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const isFetchingRef = useRef(false);

  // Fetch Data from Google Sheets or Apps Script with Partitioned (Fast / Paginated LoadMore / Full) Loading
  const fetchData = async (mode: 'recent' | 'loadMore' | 'full' = 'recent', page = 1, forceToast = false) => {
    if (isFetchingRef.current) {
      return;
    }
    if (config.mode === 'direct' && (!accessToken || !config.spreadsheetId)) {
      return;
    }
    if (config.mode === 'gas' && !config.webAppUrl) {
      return;
    }

    const numericPage = typeof page === 'number' && !isNaN(page) ? Math.max(1, page) : 1;

    isFetchingRef.current = true;
    setIsLoading(true);
    if (mode === 'full') {
      setIsLoadingFullHistory(true);
    } else if (mode === 'loadMore') {
      setIsLoadingMore(true);
    }
    setErrorMsg(null);
    try {
      let data: any;
      if (config.mode === 'direct' && accessToken) {
        data = await googleSheetsDirect.fetchAllData(config.spreadsheetId, accessToken);
      } else if (config.mode === 'gas' && config.webAppUrl) {
        const cleanGasUrl = sanitizeBaseGasUrl(config.webAppUrl);
        try {
          if (mode === 'recent' || mode === 'loadMore') {
            data = await googleAppsScriptService.fetchRecentData(cleanGasUrl, 100, numericPage);
          } else {
            data = await googleAppsScriptService.fetchAllData(cleanGasUrl);
          }
        } catch (gasErr: any) {
          console.warn('Configured GAS URL failed:', cleanGasUrl, gasErr);
          if (cleanGasUrl !== DEFAULT_PRODUCTION_GAS_URL) {
            console.info('Auto-recovering with DEFAULT_PRODUCTION_GAS_URL...');
            try {
              if (mode === 'recent' || mode === 'loadMore') {
                data = await googleAppsScriptService.fetchRecentData(DEFAULT_PRODUCTION_GAS_URL, 100, numericPage);
              } else {
                data = await googleAppsScriptService.fetchAllData(DEFAULT_PRODUCTION_GAS_URL);
              }
              const healedConfig: GASConfig = {
                ...config,
                mode: 'gas',
                webAppUrl: DEFAULT_PRODUCTION_GAS_URL
              };
              setConfig(healedConfig);
              localStorage.setItem('ev_charging_config', JSON.stringify(healedConfig));
            } catch (defaultErr) {
              throw gasErr;
            }
          } else {
            throw gasErr;
          }
        }
      }

      if (data) {
        // Only overwrite live Trucks/Stations/Queue if no write is currently in flight
        if (inFlightWritesRef.current === 0 && pendingTransactionsRef.current.length === 0) {
          if (data.trucks && data.trucks.length > 0) setTrucks(data.trucks);
          if (data.stations && data.stations.length > 0) setStations(data.stations);
          if (data.queue) setQueue(data.queue);
        }
        if (data.users && data.users.length > 0) {
          setUsersList(data.users);
        }

        if (mode === 'full') {
          const guardedSessions = (data.sessions || []).map(applySessionGuardsAndPatches).sort((a: SessionLog, b: SessionLog) => {
            const tA = new Date(a.startTime).getTime() || 0;
            const tB = new Date(b.startTime).getTime() || 0;
            return tB - tA;
          });
          if (!guardedSessions.some((s: SessionLog) => s.id === TARGET_PATCHED_SESSION_ID)) {
            guardedSessions.push(DEFAULT_TARGET_SESSION);
          }
          setSessions(guardedSessions);
          setIsFullHistoryLoaded(true);
          setIsLastPage(true);
          setTotalHistoryCount(guardedSessions.length);
          if (forceToast) {
            Swal.fire({
              toast: true,
              position: 'top-end',
              icon: 'success',
              title: `โหลดประวัติทั้งหมดเรียบร้อย (${guardedSessions.length.toLocaleString()} รายการ)`,
              showConfirmButton: false,
              timer: 2500,
              background: '#1e293b',
              color: '#f8fafc',
            });
          }
        } else {
          // Merge fetched page of sessions into existing historical sessions in state (append items without losing loaded pages)
          const fetchedSessions: SessionLog[] = data.sessions || [];
          setSessions(prev => {
            const map = new Map<string, SessionLog>();
            // 1. Keep all already-loaded sessions in memory
            for (const s of prev) {
              if (s.id) map.set(String(s.id).trim().toUpperCase(), applySessionGuardsAndPatches(s));
            }
            // 2. Merge / append newly fetched page records
            for (const s of fetchedSessions) {
              if (s.id) map.set(String(s.id).trim().toUpperCase(), applySessionGuardsAndPatches(s));
            }

            // 3. SSOT Consistency: Only reconcile active charging sessions on page 1 when no writes are pending
            if (mode === 'recent' && numericPage === 1 && inFlightWritesRef.current === 0 && pendingTransactionsRef.current.length === 0) {
              const serverActiveIds = new Set<string>();
              for (const s of fetchedSessions) {
                if (s.status?.toLowerCase() === 'charging' && s.id) {
                  serverActiveIds.add(String(s.id).trim().toUpperCase());
                }
              }
              for (const [key, s] of map.entries()) {
                if (s.status?.toLowerCase() === 'charging' && !serverActiveIds.has(key)) {
                  map.set(key, applySessionGuardsAndPatches({ ...s, status: 'Completed' }));
                }
              }
            }

            if (!map.has(TARGET_PATCHED_SESSION_ID)) {
              map.set(TARGET_PATCHED_SESSION_ID, DEFAULT_TARGET_SESSION);
            }

            return Array.from(map.values()).sort((a, b) => {
              const tA = new Date(a.startTime).getTime() || 0;
              const tB = new Date(b.startTime).getTime() || 0;
              return tB - tA;
            });
          });

          const totalCount = data.totalSessionsCount || 0;
          if (totalCount > 0) {
            setTotalHistoryCount(totalCount);
          }

          if (mode === 'loadMore' || numericPage > currentPage) {
            setCurrentPage(numericPage);
          }

          const reachedEnd = data.hasMore !== undefined
            ? !data.hasMore
            : (fetchedSessions.length < 100 || (totalCount > 0 && numericPage * 100 >= totalCount));

          if (mode === 'loadMore' || numericPage > 1) {
            setIsLastPage(reachedEnd);
            if (reachedEnd) {
              setIsFullHistoryLoaded(true);
            }
          } else if (currentPage === 1) {
            setIsLastPage(reachedEnd);
          }

          if (forceToast) {
            Swal.fire({
              toast: true,
              position: 'top-end',
              icon: 'success',
              title: mode === 'loadMore'
                ? `โหลดประวัติเพิ่มสำเร็จ (+${fetchedSessions.length} รายการ | หน้า ${numericPage})`
                : 'รีเฟรชข้อมูลล่าสุดสำเร็จ (โหลดด่วน 1-2s)',
              showConfirmButton: false,
              timer: 2000,
              background: '#1e293b',
              color: '#f8fafc',
            });
          }
        }

        setLastUpdated(new Date());
        setErrorMsg(null);
      }
    } catch (e: any) {
      console.error('Fetch error:', e);
      // If we already have trucks or stations loaded in memory, do not disrupt the UI with a blocking error banner
      if (trucks.length === 0 && stations.length === 0) {
        const is404 = e?.message?.includes('404') || e?.message?.includes('Not Found');
        const isTimeoutOrAbort = 
          e?.name === 'AbortError' || 
          e?.message?.includes('aborted') || 
          e?.message?.includes('Timeout') || 
          e?.message?.includes('without reason');

        const isFailedToFetch = 
          e?.message?.includes('Failed to fetch') || 
          e?.message?.includes('NetworkError');

        let displayMessage = `เกิดข้อผิดพลาดในการดึงข้อมูลตาราง: ${e.message}`;
        if (is404) {
          displayMessage = 'ไม่พบ Web App Deployment (404 Not Found) กรุณากดปุ่ม "⚡ รีเซ็ต URL เริ่มต้น" ด้านบน หรือตรวจสอบว่าตั้งค่าสิทธิ์ใน Google Apps Script เป็น Anyone';
        } else if (isTimeoutOrAbort) {
          displayMessage = 'การเชื่อมต่อหมดเวลา (Connection Timeout): เครือข่ายหรือเซิร์ฟเวอร์ Google Apps Script ตอบสนองช้า ระบบกำลังใช้ข้อมูลแคชล่าสุดในเครื่องแทน กรุณากด "ลองเชื่อมต่อใหม่"';
        } else if (isFailedToFetch) {
          displayMessage = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ฐานข้อมูลได้ (Failed to fetch) กรุณาตรวจสอบสัญญาณอินเทอร์เน็ต หรือการตั้งค่า URL ของ Web App';
        }
        setErrorMsg(displayMessage);
      } else {
        console.warn('Background auto-refresh encountered transient error, preserving active data:', e);
      }
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
      setIsLoadingMore(false);
      setIsLoadingFullHistory(false);
    }
  };

  const fetchAllData = () => fetchData('recent', 1, false);
  const handleLoadFullHistory = () => fetchData('full', 1, true);
  const loadMore = async () => {
    if (isLoading || isLoadingMore || isLastPage || isFullHistoryLoaded) return;
    const nextPage = currentPage + 1;
    await fetchData('loadMore', nextPage, true);
  };

  // Throttled manual refresh handler
  const handleManualRefresh = async () => {
    if (isActionThrottled('manual-refresh', 3000)) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title: 'กรุณารอสักครู่ (รีเฟรชได้ทุกๆ 3 วินาที)',
        showConfirmButton: false,
        timer: 2000,
        background: '#1e293b',
        color: '#f8fafc',
      });
      return;
    }
    await fetchData('recent', 1, true);
  };

  // Re-fetch fresh data whenever switching tabs (if > 10s since last fetch) to guarantee 100% synchronized state
  const lastFetchTimeRef = useRef<number>(Date.now());
  useEffect(() => {
    const now = Date.now();
    if (now - lastFetchTimeRef.current > 10000) {
      lastFetchTimeRef.current = now;
      fetchData('recent');
    }
  }, [activeTab]);

  // Re-fetch when browser window/tab gains focus
  useEffect(() => {
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFetchTimeRef.current > 15000) {
        lastFetchTimeRef.current = now;
        fetchData('recent');
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Trigger Fetching Data when AccessToken or SpreadsheetId/Config updates
  useEffect(() => {
    if (config.webAppUrl || (config.mode === 'direct' && accessToken)) {
      fetchAllData();
    }
  }, [accessToken, config.spreadsheetId, config.webAppUrl, config.mode]);

  // Auto-Refresh data periodically (every 45s) with cleanup
  useEffect(() => {
    let intervalId: any = null;

    if (config.webAppUrl || (config.mode === 'direct' && accessToken)) {
      intervalId = setInterval(() => {
        lastFetchTimeRef.current = Date.now();
        fetchAllData();
      }, 45000); // 45 seconds real-time auto-refresh
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [accessToken, config.spreadsheetId, config.webAppUrl, config.mode]);

  // Background Auto-Recovery: When an error is active, retry connection every 45 seconds
  useEffect(() => {
    if (!errorMsg) return;
    const retryTimer = setInterval(() => {
      console.log('Attempting automatic background reconnection to database...');
      fetchAllData();
    }, 45000);

    return () => clearInterval(retryTimer);
  }, [errorMsg, config, accessToken]);

  const handleResetDefaultGasUrl = async () => {
    const result = await Swal.fire({
      title: 'รีเซ็ต URL ฐานข้อมูลเป็นค่าเริ่มต้น?',
      text: 'ระบบจะสลับ URL ไปยัง Production Gateway มาตรฐาน (AKfycbztaFLd4jxg1kv-_WLefXTA6y3N0anaOdoN5qPa0__18kBHGL1YIVvMfvrOI3Tc3iw) เพื่อกู้คืนการเชื่อมต่อทันที',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ยืนยันการรีเซ็ต',
      cancelButtonText: 'ยกเลิก',
      background: '#0f172a',
      color: '#f8fafc',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#64748b'
    });

    if (result.isConfirmed) {
      const newConfig: GASConfig = {
        ...config,
        mode: 'gas',
        webAppUrl: DEFAULT_PRODUCTION_GAS_URL
      };
      setConfig(newConfig);
      localStorage.setItem('ev_charging_config', JSON.stringify(newConfig));
      setErrorMsg(null);
      
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'รีเซ็ต URL เริ่มต้นสำเร็จ กำลังเชื่อมต่อ...',
        showConfirmButton: false,
        timer: 2500,
        background: '#1e293b',
        color: '#f8fafc',
      });

      setTimeout(() => {
        fetchAllData();
      }, 200);
    }
  };

  const handleLogout = async () => {
    const result = await Swal.fire({
      title: 'ยืนยันการออกจากระบบ',
      text: 'คุณต้องการออกจากระบบหรือไม่?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ออกจากระบบ',
      cancelButtonText: 'ยกเลิก',
      background: '#0f172a',
      color: '#f8fafc',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b'
    });

    if (result.isConfirmed) {
      try {
        await logout();
      } catch (e) {
        console.error('Firebase logout error:', e);
      }
      setUser(null);
      setAccessToken(null);
      setTrucks([]);
      setStations([]);
      setQueue([]);
      setSessions([]);
      fetchAllData();
    }
  };

  const handlePortalLogout = async () => {
    const result = await Swal.fire({
      title: 'ยืนยันการออกจากระบบ',
      text: 'คุณต้องการออกจากระบบหรือไม่?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ออกจากระบบ',
      cancelButtonText: 'ยกเลิก',
      background: '#0f172a',
      color: '#f8fafc',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b'
    });

    if (result.isConfirmed) {
      try {
        logout().catch(err => console.error('Silent portal logout error:', err));
      } catch (e) {
        // ignore
      }
      setUser(null);
      setAccessToken(null);
      setTrucks([]);
      setStations([]);
      setQueue([]);
      setSessions([]);
      fetchAllData();
    }
  };

  // Direct sheets helper row writers
  const handleAddTruck = async (truck: EVTruck) => {
    if (isActionThrottled('add-truck', 1500)) return;

    const row = [
      truck.id, 
      truck.licensePlate, 
      truck.model, 
      truck.batteryCapacity, 
      truck.currentSOC, 
      truck.status, 
      truck.lastUpdated,
      truck.currentOdometer || 0
    ];
    setTrucks(prev => {
      if (prev.some(t => t.id === truck.id)) return prev;
      return [...prev, truck];
    });

    await performDatabaseWrite(`เพิ่มรถหัวลาก ${truck.id}`, 'append', 'Trucks', undefined, row);
  };

  const handleUpdateTruck = async (truck: EVTruck) => {
    if (isActionThrottled(`update-truck-${truck.id}`, 1500)) return;

    const row = [
      truck.id, 
      truck.licensePlate, 
      truck.model, 
      truck.batteryCapacity, 
      truck.currentSOC, 
      truck.status, 
      truck.lastUpdated,
      truck.currentOdometer || 0
    ];
    setTrucks(prev => prev.map(t => t.id === truck.id ? truck : t));

    await performDatabaseWrite(`อัปเดตรถหัวลาก ${truck.id}`, 'update', 'Trucks', truck.id, row);
  };

  const handleDeleteTruck = async (id: string) => {
    if (isActionThrottled(`delete-truck-${id}`, 1500)) return;

    setTrucks(prev => prev.filter(t => t.id !== id));

    await performDatabaseWrite(`ลบรถหัวลาก ${id}`, 'delete', 'Trucks', id);
  };

  const handleAddUser = async (userItem: UserItem) => {
    if (isActionThrottled('add-user', 1500)) return;

    const row = [userItem.employeeId, userItem.name, userItem.role || 'Driver'];
    setUsersList(prev => {
      if (prev.some(u => u.employeeId === userItem.employeeId)) return prev;
      return [...prev, userItem];
    });

    await performDatabaseWrite(`เพิ่มพนักงาน ${userItem.employeeId}`, 'append', 'Users', undefined, row);
  };

  const handleUpdateUser = async (userItem: UserItem) => {
    if (isActionThrottled(`update-user-${userItem.employeeId}`, 1500)) return;

    const row = [userItem.employeeId, userItem.name, userItem.role || 'Driver'];
    setUsersList(prev => prev.map(u => u.employeeId === userItem.employeeId ? userItem : u));

    await performDatabaseWrite(`อัปเดตพนักงาน ${userItem.employeeId}`, 'update', 'Users', userItem.employeeId, row);
  };

  const handleDeleteUser = async (empId: string) => {
    if (isActionThrottled(`delete-user-${empId}`, 1500)) return;

    setUsersList(prev => prev.filter(u => u.employeeId !== empId));

    await performDatabaseWrite(`ลบพนักงาน ${empId}`, 'delete', 'Users', empId);
  };

  const handleStartCharging = async (
    stationId: string, 
    truckId: string, 
    operator: string, 
    odometer?: number, 
    pricePerUnit?: number,
    startSOC?: number
  ) => {
    if (isActionThrottled(`start-charging-${stationId}`, 2000)) return;

    const now = getThailandISOString();

    // 1. Get truck and station to write
    const station = stations.find(s => s.id === stationId);
    const truck = trucks.find(t => t.id === truckId);
    if (!station || !truck) return;

    // 1.0 Guard against Orphaned/Lingering Active Session for this truck or station
    // If the truck previously had an active charging session that wasn't closed properly,
    // gracefully close it using SOC delta estimation or last full SOC instead of overwriting with current time.
    const lingeringSessions = sessions.filter(s => 
      s.status?.toLowerCase() === 'charging' && 
      (s.truckId?.trim().toUpperCase() === truckId?.trim().toUpperCase() || s.stationId?.trim().toUpperCase() === stationId?.trim().toUpperCase())
    );

    for (const oldSess of lingeringSessions) {
      try {
        const oldStartMs = new Date(oldSess.startTime).getTime();
        const oldStartSOC = oldSess.startSOC || 0;
        const estMinutes = Math.max(1, Math.min(180, Math.round((100 - oldStartSOC) * 1.45)));
        const oldEndMs = !isNaN(oldStartMs) ? oldStartMs + (estMinutes * 60000) : Date.now();
        const oldEndTime = getThailandISOString(new Date(oldEndMs));
        const oldEnergy = Math.round(((estMinutes * 16) / 60) * 100) / 100;
        const oldCost = Math.round(oldEnergy * (oldSess.pricePerUnit || 3.50) * 100) / 100;

        const closedRow = [
          oldSess.id,
          oldSess.truckId,
          oldSess.stationId,
          oldSess.operatorName || 'Driver',
          oldSess.startTime,
          oldEndTime,
          oldStartSOC,
          100,
          oldEnergy,
          estMinutes,
          'Completed',
          oldSess.odometer || truck.currentOdometer || 0,
          oldSess.pricePerUnit || 3.5000,
          oldCost
        ];

        // Optimistically close old session locally
        setSessions(prev => prev.map(s => s.id === oldSess.id ? {
          ...s,
          endTime: oldEndTime,
          endSOC: 100,
          duration: estMinutes,
          energyConsumed: oldEnergy,
          totalCost: oldCost,
          status: 'Completed'
        } : s));

        // Asynchronously persist closure
        executeSheetsWrite('update', 'Sessions', oldSess.id, closedRow).catch(() => {
          performDatabaseWrite(`ปิดเซสชันค้าง ${oldSess.id}`, 'update', 'Sessions', oldSess.id, closedRow);
        });
      } catch (e) {
        console.warn('Error auto-closing lingering session:', e);
      }
    }

    const finalStartSOC = startSOC !== undefined ? startSOC : truck.currentSOC;
    if (finalStartSOC >= 100) {
      throw new Error(`ระบุแบตเตอรี่ก่อนชาร์จ 100% เต็มอยู่แล้ว ไม่จำเป็นต้องทำการชาร์จไฟเพิ่ม`);
    }

    const finalOdometer = odometer !== undefined ? odometer : (truck.currentOdometer || 0);
    const dynamicPrice = getElectricityPrice(new Date()).price;
    const finalPrice = pricePerUnit !== undefined ? pricePerUnit : dynamicPrice;

    // 2. Generate new unique Time-Based + Truck ID session ID
    const nextSessionId = generateUniqueSessionId(truckId);

    // 3. Prepare rows
    const updatedStationRow = [station.id, station.name, station.chargerType, station.powerOutput, 'Occupied', truckId, new Date().toISOString()];
    const updatedTruckRow = [truck.id, truck.licensePlate, truck.model, truck.batteryCapacity, finalStartSOC, 'Charging', new Date().toISOString(), finalOdometer];
    const newSessionRow = [
      nextSessionId, 
      truckId, 
      stationId, 
      operator, 
      new Date().toISOString(), 
      '', 
      finalStartSOC, 
      '', 
      '', 
      '', 
      'Charging', 
      finalOdometer, 
      finalPrice, 
      ''
    ];

    // Optimistic local state update
    const localNewSession: SessionLog = {
      id: nextSessionId,
      truckId: truckId,
      stationId: stationId,
      operatorName: operator,
      startTime: new Date().toISOString(),
      endTime: '',
      startSOC: finalStartSOC,
      endSOC: 0,
      energyConsumed: 0,
      duration: 0,
      status: 'Charging',
      odometer: finalOdometer,
      pricePerUnit: finalPrice,
      totalCost: 0
    };

    setSessions(prev => [localNewSession, ...prev]);
    setStations(prev => prev.map(s => s.id === stationId ? { ...s, status: 'Occupied', occupyingTruckId: truckId, lastUpdated: new Date().toISOString() } : s));
    setTrucks(prev => prev.map(t => t.id === truckId ? { ...t, status: 'Charging', currentSOC: finalStartSOC, currentOdometer: finalOdometer, lastUpdated: new Date().toISOString() } : t));
    setQueue(prev => prev.map(q => q.truckId === truckId && q.status === 'Waiting' ? { ...q, status: 'Charging' } : q));

    // Single atomic batch write (or legacy sequential fallback without duplicating succeeded rows)
    const batchOps: Array<{
      description: string;
      actionType: 'append' | 'update' | 'delete';
      sheetName: string;
      keyId?: string;
      row?: any[];
    }> = [
      {
        description: `เริ่มชาร์จตู้ ${stationId} - อัปเดตสถานี`,
        actionType: 'update',
        sheetName: 'Stations',
        keyId: stationId,
        row: updatedStationRow,
      },
      {
        description: `เริ่มชาร์จตู้ ${stationId} - อัปเดตรถ ${truckId}`,
        actionType: 'update',
        sheetName: 'Trucks',
        keyId: truckId,
        row: updatedTruckRow,
      },
      {
        description: `เริ่มชาร์จตู้ ${stationId} - สร้างเซสชันชาร์จ`,
        actionType: 'append',
        sheetName: 'Sessions',
        row: newSessionRow,
      },
    ];

    const activeQueueItem = queue.find(q => q.truckId === truckId && q.status === 'Waiting');
    if (activeQueueItem) {
      const updatedQueueRow = [activeQueueItem.id, activeQueueItem.truckId, activeQueueItem.priority, activeQueueItem.requestedChargerType, 'Charging', activeQueueItem.requestTime, 0];
      batchOps.push({
        description: `เริ่มชาร์จตู้ ${stationId} - อัปเดตคิว ${activeQueueItem.id}`,
        actionType: 'update',
        sheetName: 'Queue',
        keyId: activeQueueItem.id,
        row: updatedQueueRow,
      });
    }

    const ok = await executeBatchDatabaseWrite(batchOps);
    if (ok) {
      await fetchAllData();
    }
  };

  const handleStopCharging = async (
    stationId: string, 
    endSOCParam?: number | {
      stoppedBy?: string;
      endSoc?: number;
      energyConsumed?: number;
      durationMins?: number;
      totalCost?: number;
      endOdometer?: number;
      isAutoCompleted?: boolean;
    }, 
    energyConsumed?: number, 
    durationMins?: number, 
    totalCost?: number,
    endOdometer?: number
  ) => {
    if (isActionThrottled(`stop-charging-${stationId}`, 2000)) return;

    let endSOC = 100;
    let stoppedBy: string | undefined = undefined;
    let isAutoCompleted = false;
    let explicitDuration = durationMins;
    let explicitEnergy = energyConsumed;
    let explicitCost = totalCost;
    let explicitOdometer = endOdometer;

    if (typeof endSOCParam === 'object' && endSOCParam !== null) {
      endSOC = endSOCParam.endSoc !== undefined ? endSOCParam.endSoc : 100;
      stoppedBy = endSOCParam.stoppedBy;
      isAutoCompleted = !!endSOCParam.isAutoCompleted;
      if (endSOCParam.durationMins !== undefined) explicitDuration = endSOCParam.durationMins;
      if (endSOCParam.energyConsumed !== undefined) explicitEnergy = endSOCParam.energyConsumed;
      if (endSOCParam.totalCost !== undefined) explicitCost = endSOCParam.totalCost;
      if (endSOCParam.endOdometer !== undefined) explicitOdometer = endSOCParam.endOdometer;
    } else if (typeof endSOCParam === 'number') {
      endSOC = endSOCParam;
    }

    if (endSOC >= 100) {
      isAutoCompleted = true;
    }

    const now = getThailandISOString();

    let station = stations.find(s => s.id === stationId || s.id?.trim().toUpperCase() === stationId?.trim().toUpperCase());
    
    // Check if stationId was a Session ID first
    let activeSession = sessions.find(s => s.id?.trim().toUpperCase() === stationId?.trim().toUpperCase());

    // If not found by station id, check if stationId was actually a truckId
    if (!station) {
      station = stations.find(s => s.occupyingTruckId?.trim().toUpperCase() === stationId?.trim().toUpperCase());
    }
    
    // If still not found, check sessions to see which station this truck/session belongs to
    if (!station) {
      const relatedSession = activeSession || sessions.find(s => 
        (s.truckId?.trim().toUpperCase() === stationId?.trim().toUpperCase() || s.id?.trim().toUpperCase() === stationId?.trim().toUpperCase()) &&
        s.status?.trim().toUpperCase() === 'CHARGING'
      );
      if (relatedSession && relatedSession.stationId) {
        station = stations.find(s => s.id?.trim().toUpperCase() === relatedSession.stationId?.trim().toUpperCase());
      }
    }

    // Default fallback to first station or stationId
    const targetStationId = station?.id || (activeSession?.stationId || stations[0]?.id || stationId || 'CS-01');

    if (!activeSession) {
      // Fallback 1: Find by targetStationId prioritizing active charging status
      activeSession = sessions.find(s => 
        s.stationId?.trim().toUpperCase() === targetStationId?.trim().toUpperCase() && 
        (s.status?.trim().toUpperCase() === 'CHARGING' || !s.endTime) && 
        (station?.occupyingTruckId ? s.truckId?.trim().toUpperCase() === station.occupyingTruckId?.trim().toUpperCase() : true)
      );
    }

    if (!activeSession) {
      activeSession = sessions.find(s => 
        s.stationId?.trim().toUpperCase() === targetStationId?.trim().toUpperCase() && 
        (s.status?.trim().toUpperCase() === 'CHARGING' || !s.endTime)
      );
    }

    const truckId = activeSession?.truckId || station?.occupyingTruckId || (trucks.some(t => t.id === stationId) ? stationId : undefined);

    if (!activeSession && truckId) {
      // Fallback 2: Find by truckId only
      activeSession = sessions.find(s => 
        s.truckId?.trim().toUpperCase() === truckId?.trim().toUpperCase() && 
        (s.status?.trim().toUpperCase() === 'CHARGING' || !s.endTime)
      );
    }

    const truck = truckId ? trucks.find(t => t.id === truckId || t.id?.trim().toUpperCase() === truckId?.trim().toUpperCase() || t.licensePlate?.trim().toUpperCase() === truckId?.trim().toUpperCase()) : undefined;

    // Critical State Cleanup: If no truck and no active session, but station is still 'Occupied'
    if (!truckId && !activeSession && station) {
      const updatedStationRow = [station.id, station.name, station.chargerType, station.powerOutput, 'Available', '', now];
      await executeSheetsWrite('update', 'Stations', targetStationId, updatedStationRow);
      await fetchAllData();
      return;
    }

    // Determine stoppedBy:
    // If auto-completed: Use driver who started session (operatorName / startedBy)
    // If manual stop: Use provided stoppedBy, logged-in user, or operatorName
    const finalStoppedBy = isAutoCompleted 
      ? (activeSession?.operatorName || 'Driver')
      : (stoppedBy || user?.name || activeSession?.operatorName || 'Driver');

    // 1. Calculate charging time (Duration), Energy (kWh), and Cost (THB) accurately
    const startSOC = activeSession ? activeSession.startSOC : (truck ? truck.currentSOC : 0);
    const startTimeMs = activeSession?.startTime ? new Date(activeSession.startTime).getTime() : (station?.lastUpdated ? new Date(station.lastUpdated).getTime() : NaN);

    let finalEndTime = now;
    let calculatedDuration = 0;

    if (isAutoCompleted || endSOC >= 100) {
      // Auto-complete or reaching 100%: Calculate exact moment battery reached 100%
      const socGain = Math.max(0, 100 - startSOC);
      const estMinutesTo100 = Math.max(1, Math.round(socGain * 1.45 * 10) / 10);

      if (!isNaN(startTimeMs)) {
        const elapsedMinutes = Math.max(0, (new Date(now).getTime() - startTimeMs) / 60000);
        if (elapsedMinutes >= estMinutesTo100) {
          // Reached 100% in the past: clamp endTime to the moment it hit 100%
          const hit100Ms = startTimeMs + (estMinutesTo100 * 60000);
          finalEndTime = getThailandISOString(new Date(hit100Ms));
          calculatedDuration = estMinutesTo100;
        } else {
          // Reached 100% right now
          finalEndTime = now;
          calculatedDuration = Math.max(1, Math.round(elapsedMinutes * 10) / 10);
        }
      } else {
        calculatedDuration = estMinutesTo100;
        finalEndTime = now;
      }
    } else {
      // Manual stop before 100%
      finalEndTime = now;
      if (!isNaN(startTimeMs)) {
        calculatedDuration = Math.max(1, Math.round(((new Date(now).getTime() - startTimeMs) / 60000) * 10) / 10);
      } else {
        const socGain = Math.max(0, endSOC - startSOC);
        calculatedDuration = socGain > 0 ? Math.round(socGain * 1.45 * 10) / 10 : 1;
      }
    }

    const finalDuration = explicitDuration !== undefined ? explicitDuration : Math.max(0, Math.round(calculatedDuration * 100) / 100);

    // 1.2 Calculate Energy Consumed (kWh) based on Battery Capacity delta and Charger Power Output
    const stationPower = station?.powerOutput || 16;
    const socGain = Math.max(0, endSOC - startSOC);
    let calculatedEnergy = 0;
    
    if (startSOC >= 100 || endSOC <= startSOC || socGain <= 0) {
      calculatedEnergy = 0;
    } else if (truck?.batteryCapacity && endSOC > startSOC) {
      calculatedEnergy = (truck.batteryCapacity * socGain) / 100;
    } else if (endSOC > startSOC) {
      calculatedEnergy = (stationPower * (finalDuration / 60));
    }

    if (startSOC < 100 && endSOC > startSOC && calculatedEnergy <= 0) {
      const minEnergyFromDuration = (stationPower * (finalDuration / 60));
      if (minEnergyFromDuration > 0) {
        calculatedEnergy = minEnergyFromDuration;
      }
    }

    const finalEnergy = explicitEnergy !== undefined 
      ? explicitEnergy 
      : (startSOC >= 100 || endSOC <= startSOC ? 0 : Math.max(0, Math.round(calculatedEnergy * 100) / 100));
    
    // 1.3 Calculate Total Cost (THB)
    const pricePerUnit = activeSession?.pricePerUnit || 3.5000;
    const computedCost = finalEnergy * (pricePerUnit || 3.5000);
    const finalCost = explicitCost !== undefined 
      ? explicitCost 
      : (startSOC >= 100 || endSOC <= startSOC ? 0 : Math.max(0, Math.round(computedCost * 100) / 100));

    const finalOdometer = explicitOdometer !== undefined ? explicitOdometer : (activeSession?.odometer || truck?.currentOdometer || 0);

    // Prepare rows for Google Sheets / Apps Script DB
    const updatedStationRow = [station ? station.id : targetStationId, station ? station.name : `ตู้ ${targetStationId}`, station ? station.chargerType : 'DC 120kW', station ? station.powerOutput : 120, 'Available', '', finalEndTime];
    
    let updatedTruckRow: any[] | null = null;
    if (truck) {
      updatedTruckRow = [truck.id, truck.licensePlate, truck.model, truck.batteryCapacity, endSOC, 'Available', finalEndTime, finalOdometer];
    } else if (truckId) {
      updatedTruckRow = [truckId, truckId, 'EV Truck', 100, endSOC, 'Available', finalEndTime, finalOdometer];
    }

    let updatedSessionRow: any[] | null = null;
    let isNewSession = false;
    
    if (activeSession) {
      updatedSessionRow = [
        activeSession.id, 
        truckId || activeSession.truckId, 
        targetStationId, 
        activeSession.operatorName, // Driver Name (startedBy)
        activeSession.startTime, 
        finalEndTime, 
        activeSession.startSOC, 
        endSOC, 
        finalEnergy, 
        finalDuration, 
        'Completed', 
        finalOdometer, 
        activeSession.pricePerUnit || 3.5000, 
        finalCost
      ];
    } else {
      isNewSession = true;
      const nextSessionId = generateUniqueSessionId(truckId || targetStationId);
      const sessionStartTime = station?.lastUpdated || finalEndTime;
      
      updatedSessionRow = [
        nextSessionId,
        truckId || 'Unknown',
        targetStationId,
        finalStoppedBy,
        sessionStartTime,
        finalEndTime,
        startSOC,
        endSOC,
        finalEnergy,
        finalDuration,
        'Completed',
        finalOdometer,
        3.5000,
        finalCost
      ];
    }

    // 1.5 Optimistic / Immediate local state updates for fast UI feedback
    setSessions(prev => {
      const activeSessionLocal = activeSession;
      return prev.map(s => {
        const isTargetMatch = 
          (activeSessionLocal && s.id === activeSessionLocal.id) ||
          (s.status === 'Charging' && s.truckId?.trim().toUpperCase() === truckId?.trim().toUpperCase()) ||
          (s.status === 'Charging' && s.stationId?.trim().toUpperCase() === targetStationId?.trim().toUpperCase());

        if (isTargetMatch) {
          return {
            ...s,
            endTime: finalEndTime,
            endSOC: endSOC,
            energyConsumed: finalEnergy,
            duration: finalDuration,
            status: 'Completed' as any,
            odometer: finalOdometer,
            totalCost: finalCost,
            stoppedBy: finalStoppedBy,
            isAutoCompleted: isAutoCompleted
          };
        }
        return s;
      });
    });

    setStations(prev => prev.map(s => {
      if (
        s.id?.trim().toUpperCase() === targetStationId?.trim().toUpperCase() ||
        (truckId && s.occupyingTruckId?.trim().toUpperCase() === truckId?.trim().toUpperCase())
      ) {
        return {
          ...s,
          status: 'Available' as any,
          occupyingTruckId: '',
          lastUpdated: finalEndTime
        };
      }
      return s;
    }));

    if (truckId) {
      setTrucks(prev => prev.map(t => {
        if (t.id?.trim().toUpperCase() === truckId?.trim().toUpperCase()) {
          return {
            ...t,
            currentSOC: endSOC,
            status: 'Available' as any,
            currentOdometer: finalOdometer,
            lastUpdated: finalEndTime
          };
        }
        return t;
      }));

      setQueue(prev => prev.map(q => {
        if (q.truckId === truckId && q.status === 'Charging') {
          return {
            ...q,
            status: 'Completed' as any
          };
        }
        return q;
      }));
    }

    // SweetAlert Notification for Auto-Complete
    if (isAutoCompleted) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `⚡ รถ ${truckId} ชาร์จเต็ม 100% แล้ว`,
        html: `<div class="text-xs text-slate-300">ระบบ Auto-COMPLETE ทำการปลดชาร์จและคืนสถานะว่างอัตโนมัติ<br/>ผู้ปลดชาร์จ: <b class="text-emerald-400">${finalStoppedBy}</b> (ผู้เริ่มชาร์จ)</div>`,
        showConfirmButton: false,
        timer: 4500,
        background: '#0f172a',
        color: '#f8fafc',
      });
    }

    // 2. Perform single atomic batch database update (or non-duplicating sequential fallback)
    const batchOps: Array<{
      description: string;
      actionType: 'append' | 'update' | 'delete';
      sheetName: string;
      keyId?: string;
      row?: any[];
    }> = [];

    if (updatedSessionRow) {
      if (isNewSession) {
        batchOps.push({
          description: `หยุดชาร์จตู้ ${targetStationId} - บันทึกประวัติการชาร์จใหม่`,
          actionType: 'append',
          sheetName: 'Sessions',
          row: updatedSessionRow,
        });
      } else {
        const targetSessionId = activeSession ? activeSession.id : (truckId || targetStationId);
        batchOps.push({
          description: `หยุดชาร์จตู้ ${targetStationId} - อัปเดตประวัติการชาร์จ`,
          actionType: 'update',
          sheetName: 'Sessions',
          keyId: targetSessionId,
          row: updatedSessionRow,
        });
      }
    }

    if (updatedTruckRow && truckId) {
      batchOps.push({
        description: `หยุดชาร์จตู้ ${targetStationId} - อัปเดตรถ ${truckId}`,
        actionType: 'update',
        sheetName: 'Trucks',
        keyId: truckId,
        row: updatedTruckRow,
      });
    }

    batchOps.push({
      description: `หยุดชาร์จตู้ ${targetStationId} - อัปเดตสถานี`,
      actionType: 'update',
      sheetName: 'Stations',
      keyId: targetStationId,
      row: updatedStationRow,
    });

    const queueItem = queue.find(q => q.truckId === truckId && q.status === 'Charging');
    if (queueItem) {
      const updatedQueueRow = [queueItem.id, queueItem.truckId, queueItem.priority, queueItem.requestedChargerType, 'Completed', queueItem.requestTime, 0];
      batchOps.push({
        description: `หยุดชาร์จตู้ ${targetStationId} - อัปเดตคิวชาร์จเสร็จสิ้น`,
        actionType: 'update',
        sheetName: 'Queue',
        keyId: queueItem.id,
        row: updatedQueueRow,
      });
    }

    const ok = await executeBatchDatabaseWrite(batchOps);
    if (ok) {
      await fetchAllData();
    }
  };

  // Auto-COMPLETE Routine when battery reaches 100%
  const autoCompletingIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const checkAutoCompleteRoutine = () => {
      const activeSessions = sessions.filter(
        s => s.status?.toLowerCase() === 'charging' || (!s.endTime && s.status !== 'Completed')
      );
      const nowMs = Date.now();

      for (const s of activeSessions) {
        if (!s.id || autoCompletingIdsRef.current.has(s.id)) continue;

        const truck = trucks.find(
          t => t.id === s.truckId || t.id?.trim().toUpperCase() === s.truckId?.trim().toUpperCase()
        );
        const startT = new Date(s.startTime).getTime();
        const elapsedMins = isNaN(startT) ? 0 : Math.max(0, (nowMs - startT) / 60000);
        const estSoc = Math.round((s.startSOC || 0) + (elapsedMins / 1.45));
        const truckSoc = truck?.currentSOC || 0;
        const currentSoc = Math.max(estSoc, truckSoc);

        if (currentSoc >= 100) {
          autoCompletingIdsRef.current.add(s.id);
          console.info(`[Auto-Complete 100%] Active session ${s.id} (Truck: ${s.truckId}) reached ${currentSoc}%. Automatically completing session...`);

          handleStopCharging(s.stationId || s.id, {
            stoppedBy: s.operatorName || 'Driver',
            endSoc: 100,
            isAutoCompleted: true
          }).catch((err: any) => {
            console.warn(`[Auto-Complete] Error stopping session ${s.id}:`, err);
            autoCompletingIdsRef.current.delete(s.id);
          });
        }
      }
    };

    checkAutoCompleteRoutine();
    const interval = setInterval(checkAutoCompleteRoutine, 8000);
    return () => clearInterval(interval);
  }, [sessions, trucks, stations]);

  const handleToggleMaintenance = async (stationId: string, targetStatus: 'Available' | 'Maintenance') => {
    if (isActionThrottled(`toggle-maintenance-${stationId}`, 1500)) return;

    const station = stations.find(s => s.id === stationId);
    if (!station) return;

    const updatedStationRow = [station.id, station.name, station.chargerType, station.powerOutput, targetStatus, '', new Date().toISOString()];

    setStations(prev => prev.map(s => s.id === stationId ? { ...s, status: targetStatus, lastUpdated: new Date().toISOString() } : s));

    await performDatabaseWrite(`ปรับสถานะตู้ชาร์จ ${stationId} เป็น ${targetStatus === 'Maintenance' ? 'ปิดซ่อมบำรุง' : 'พร้อมใช้งาน'}`, 'update', 'Stations', stationId, updatedStationRow);
  };

  const handleAddStation = async (station: ChargingStation) => {
    if (isActionThrottled('add-station', 1500)) return;

    const row = [station.id, station.name, station.chargerType, station.powerOutput, station.status, station.occupyingTruckId || '', station.lastUpdated];
    setStations(prev => {
      if (prev.some(s => s.id === station.id)) return prev;
      return [...prev, station];
    });

    await performDatabaseWrite(`เพิ่มตู้ชาร์จ ${station.id}`, 'append', 'Stations', undefined, row);
  };

  const handleUpdateStation = async (station: ChargingStation) => {
    if (isActionThrottled(`update-station-${station.id}`, 1500)) return;

    const row = [station.id, station.name, station.chargerType, station.powerOutput, station.status, station.occupyingTruckId || '', station.lastUpdated];
    setStations(prev => prev.map(s => s.id === station.id ? station : s));

    await performDatabaseWrite(`อัปเดตตู้ชาร์จ ${station.id}`, 'update', 'Stations', station.id, row);
  };

  const handleDeleteStation = async (id: string) => {
    if (isActionThrottled(`delete-station-${id}`, 1500)) return;

    setStations(prev => prev.filter(s => s.id !== id));

    await performDatabaseWrite(`ลบตู้ชาร์จ ${id}`, 'delete', 'Stations', id);
  };

  const handleAddQueue = async (truckId: string, priority: 'High' | 'Normal', requestedType: 'AC' | 'DC') => {
    if (isActionThrottled('add-queue', 1500)) return;

    const queueIds = queue.map(q => parseInt(q.id.replace('Q-', ''))).filter(n => !isNaN(n));
    const nextQueueIdNum = queueIds.length > 0 ? Math.max(...queueIds) + 1 : 1001;
    const nextQueueId = `Q-${nextQueueIdNum}`;
    const now = getThailandISOString();

    const row = [nextQueueId, truckId, priority, requestedType, 'Waiting', now, 15];

    const localQueueItem: QueueItem = {
      id: nextQueueId,
      truckId,
      priority,
      requestedChargerType: requestedType,
      status: 'Waiting',
      requestTime: now,
      estimatedWaitTime: 15
    };

    setQueue(prev => [...prev, localQueueItem]);

    await performDatabaseWrite(`จองคิวรถ ${truckId} ความสำคัญ ${priority}`, 'append', 'Queue', undefined, row);
  };

  const handleCancelQueue = async (id: string) => {
    if (isActionThrottled(`cancel-queue-${id}`, 1500)) return;

    const queueItem = queue.find(q => q.id === id);
    if (!queueItem) return;

    const row = [queueItem.id, queueItem.truckId, queueItem.priority, queueItem.requestedChargerType, 'Cancelled', queueItem.requestTime, 0];

    setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'Cancelled' as any } : q));

    await performDatabaseWrite(`ยกเลิกคิว ${id}`, 'update', 'Queue', id, row);
  };

  // Auth checking indicator
  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-500 mb-3" />
        <p className="text-sm font-semibold tracking-wider font-mono">กำลังตรวจสอบเซสชัน Google Authentication...</p>
      </div>
    );
  }

  // Custom auth required gate
  if (user === null) {
    const isDbDisconnected = (config.mode === 'direct' && !config.spreadsheetId) || (config.mode === 'gas' && !config.webAppUrl);

    const handleCustomLoginSuccess = (loginData: {
      role: 'Driver' | 'Admin';
      operatorName: string;
      employeeId: string;
      vehicleId?: string;
      chargerId?: string;
    }) => {
      const customUser = {
        displayName: loginData.operatorName,
        email: loginData.role === 'Admin' ? 'admin@tmt-logistic.com' : `${loginData.operatorName.replace(/\s+/g, '.')}@tmt-logistic.com`,
        role: loginData.role,
        employeeId: loginData.employeeId,
        vehicleId: loginData.vehicleId,
        chargerId: loginData.chargerId
      };

      setUser(customUser);

      setActiveTab('dashboard');
    };

    const handleNavigateToSetupFromLogin = () => {
      const tempAdmin = {
        displayName: 'ผู้ดูแลระบบ (ตั้งค่า)',
        email: 'admin-setup@tmt-logistic.com',
        role: 'Admin',
        employeeId: '99999999'
      };
      setUser(tempAdmin);
      setActiveTab('setup');
    };

    return (
      <CustomLogin
        trucks={harmonizedTrucks}
        stations={harmonizedStations}
        sessions={sessions}
        users={usersList}
        isLoadingData={isLoading}
        onLoginSuccess={handleCustomLoginSuccess}
        onStartCharging={handleStartCharging}
        onStopCharging={handleStopCharging}
        onNavigateToSetup={handleNavigateToSetupFromLogin}
        isDbDisconnected={isDbDisconnected}
        serverErrorMsg={errorMsg}
        onRetryFetch={fetchAllData}
        onResetDefaultUrl={handleResetDefaultGasUrl}
      />
    );
  }

  // Database Connection Gate (if spreadsheetId is missing in direct mode and webAppUrl is missing in gas mode)
  const isDbDisconnected = (config.mode === 'direct' && !config.spreadsheetId) || (config.mode === 'gas' && !config.webAppUrl);

  return (
    <div className="h-[100dvh] w-full bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans relative overflow-hidden">
      {/* Mobile Header (Single Unified Compact Bar) */}
      <div className="md:hidden flex items-center justify-between px-3 py-2.5 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 shadow shrink-0">
            <CloudLightning className="w-4 h-4 fill-current" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-xs font-bold text-white leading-tight truncate">
                {activeTab === 'dashboard' ? 'แดชบอร์ดติดตาม' :
                 activeTab === 'trucks' ? 'ทะเบียนรถหัวลาก' :
                 activeTab === 'stations' ? 'สถานีและตู้ชาร์จ' :
                 activeTab === 'sessions' ? 'ประวัติชาร์จพลังงาน' :
                 activeTab === 'reports' ? 'รายงานสถิติพลังงาน' :
                 activeTab === 'analytics' ? 'วิเคราะห์ SOH & ESG' :
                 activeTab === 'users' ? 'จัดการพนักงานขับรถ' :
                 'การเชื่อมฐานข้อมูล'}
              </h1>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDbDisconnected ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'}`} title={isDbDisconnected ? 'DB Disconnected' : 'DB Active'} />
            </div>
            <span className="text-[9px] text-slate-400 font-mono block truncate">
              TMT EV-CMS {lastUpdated ? `• อัปเดต ${lastUpdated.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {pendingTransactions.length > 0 && (
            <button
              onClick={processPendingTransactions}
              disabled={isSyncing}
              className="flex items-center gap-1 text-[9px] bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold font-mono px-1.5 py-1 rounded-md"
              title="ซิงค์ข้อมูลค้าง"
            >
              <Activity className={`w-3 h-3 text-amber-400 ${isSyncing ? 'animate-spin' : 'animate-pulse'}`} />
              <span>{pendingTransactions.length}</span>
            </button>
          )}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 border border-slate-800 bg-slate-950 text-slate-300 rounded-lg active:scale-95"
            title={theme === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-400" />}
          </button>
          <button
            onClick={handleManualRefresh}
            disabled={isLoading || isDbDisconnected}
            className="p-2 border border-slate-800 bg-slate-950 text-slate-300 rounded-lg disabled:opacity-40 active:scale-95"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-slate-800 text-slate-200 rounded-lg active:scale-95">
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar Rail */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-400 flex flex-col justify-between shrink-0 border-r border-slate-800 transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 space-y-6">
          {/* Brand Logo */}
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 shadow">
                <CloudLightning className="w-4.5 h-4.5 fill-current" />
              </div>
              <div>
                <h1 className="text-xs font-bold text-white leading-tight tracking-wider">EV-CMS <span className="text-emerald-500 text-[10px] font-mono ml-1">v4.2.0</span></h1>
                <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase font-mono">TRACTOR MANAGEMENT</span>
              </div>
            </div>
            <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-md">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* User badge */}
          <div className="flex items-center gap-3 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName} className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-white text-[11px] font-bold">
                {user.displayName?.[0] || 'U'}
              </div>
            )}
            <div className="overflow-hidden">
              <span className="text-xs font-semibold text-slate-200 block truncate">{user.displayName}</span>
              <span className="text-[9px] text-slate-500 block truncate font-mono">{user.email}</span>
            </div>
          </div>

          {/* Nav List */}
          <nav className="space-y-1">
            {user.role === 'Driver' ? (
              <button
                onClick={() => { setActiveTab('stations'); setIsMobileMenuOpen(false); }}
                disabled={isDbDisconnected}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  activeTab === 'stations'
                    ? 'bg-slate-800 text-emerald-400 border-l-2 border-emerald-500'
                    : 'hover:bg-slate-800/30 text-slate-400 hover:text-slate-200 disabled:opacity-40'
                }`}
              >
                <Zap className="w-4 h-4 text-emerald-400" />
                สถานีและตู้ชาร์จ
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
                  disabled={isDbDisconnected}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    activeTab === 'dashboard'
                      ? 'bg-slate-800 text-emerald-400 border-l-2 border-emerald-500'
                      : 'hover:bg-slate-800/30 text-slate-400 hover:text-slate-200 disabled:opacity-40'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  แดชบอร์ดติดตาม
                </button>

                <button
                  onClick={() => { setActiveTab('trucks'); setIsMobileMenuOpen(false); }}
                  disabled={isDbDisconnected}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    activeTab === 'trucks'
                      ? 'bg-slate-800 text-emerald-400 border-l-2 border-emerald-500'
                      : 'hover:bg-slate-800/30 text-slate-400 hover:text-slate-200 disabled:opacity-40'
                  }`}
                >
                  <Truck className="w-4 h-4" />
                  ทะเบียนรถหัวลาก
                </button>

                <button
                  onClick={() => { setActiveTab('stations'); setIsMobileMenuOpen(false); }}
                  disabled={isDbDisconnected}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    activeTab === 'stations'
                      ? 'bg-slate-800 text-emerald-400 border-l-2 border-emerald-500'
                      : 'hover:bg-slate-800/30 text-slate-400 hover:text-slate-200 disabled:opacity-40'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  สถานีและตู้ชาร์จ
                </button>

                <button
                  onClick={() => { setActiveTab('sessions'); setIsMobileMenuOpen(false); }}
                  disabled={isDbDisconnected}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    activeTab === 'sessions'
                      ? 'bg-slate-800 text-emerald-400 border-l-2 border-emerald-500'
                      : 'hover:bg-slate-800/30 text-slate-400 hover:text-slate-200 disabled:opacity-40'
                  }`}
                >
                  <History className="w-4 h-4" />
                  ประวัติชาร์จพลังงาน
                </button>

                <button
                  onClick={() => { setActiveTab('reports'); setIsMobileMenuOpen(false); }}
                  disabled={isDbDisconnected}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    activeTab === 'reports'
                      ? 'bg-slate-800 text-emerald-400 border-l-2 border-emerald-500'
                      : 'hover:bg-slate-800/30 text-slate-400 hover:text-slate-200 disabled:opacity-40'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  รายงานสถิติพลังงาน
                </button>

                <button
                  onClick={() => { setActiveTab('analytics'); setIsMobileMenuOpen(false); }}
                  disabled={isDbDisconnected}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    activeTab === 'analytics'
                      ? 'bg-slate-800 text-emerald-400 border-l-2 border-emerald-500'
                      : 'hover:bg-slate-800/30 text-slate-400 hover:text-slate-200 disabled:opacity-40'
                  }`}
                >
                  <Activity className="w-4 h-4" />
                  วิเคราะห์ SOH & ESG
                </button>

                <button
                  onClick={() => { setActiveTab('users'); setIsMobileMenuOpen(false); }}
                  disabled={isDbDisconnected}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    activeTab === 'users'
                      ? 'bg-slate-800 text-emerald-400 border-l-2 border-emerald-500'
                      : 'hover:bg-slate-800/30 text-slate-400 hover:text-slate-200 disabled:opacity-40'
                  }`}
                >
                  <User className="w-4 h-4" />
                  จัดการพนักงานขับรถ
                </button>

                <div className="pt-3 border-t border-slate-800 mt-3">
                  <button
                    onClick={() => { setActiveTab('setup'); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                      activeTab === 'setup'
                        ? 'bg-slate-800 text-emerald-400 border-l-2 border-emerald-500'
                        : 'hover:bg-slate-800/30 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Settings className="w-4 h-4" />
                    การเชื่อมฐานข้อมูล
                  </button>
                </div>
              </>
            )}
          </nav>
        </div>

        {/* Footer Area with SignOut */}
        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">
            สถานะสถาปัตยกรรม: <span className="text-emerald-400">{config.mode === 'direct' ? 'API Direct' : 'GAS API Gateway'}</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold text-rose-400 hover:text-white hover:bg-rose-950/30 transition-all border border-dashed border-rose-900/30"
          >
            <LogOut className="w-4 h-4" />
            ออกจากเซสชัน
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-950">
        {/* Header toolbar (Desktop & Tablet) */}
        <header className="hidden md:flex h-14 border-b border-slate-800 bg-slate-900 px-4 md:px-6 items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono hidden sm:inline-block">EV Logistics Gateway</span>
            <span className="text-slate-700">|</span>
            {config.spreadsheetId ? (
              <a
                href={`https://docs.google.com/spreadsheets/d/${config.spreadsheetId}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono"
              >
                DB: GOOGLE SHEETS ACTIVE <ExternalLink className="w-3 h-3" />
              </a>
            ) : config.mode === 'gas' && config.webAppUrl ? (
              <span className="text-xs font-semibold text-emerald-400 font-mono">DB: GAS API ACTIVE</span>
            ) : (
              <span className="text-xs font-semibold text-rose-400 font-mono">DB: DISCONNECTED</span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {lastUpdated && (
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-slate-400 font-bold font-mono bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>อัปเดต {lastUpdated.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span className="text-slate-600">|</span>
                <span className="text-[9px] text-slate-500 font-medium">Auto 15m</span>
              </div>
            )}

            {isLoading && (
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold font-mono">
                <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                SYNCING...
              </div>
            )}

            {pendingTransactions.length > 0 && (
              <button
                onClick={processPendingTransactions}
                disabled={isSyncing}
                className="flex items-center gap-1.5 text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold font-mono px-2 py-1 rounded-lg hover:bg-amber-500/20 transition-all cursor-pointer"
                title="มีข้อมูลรอซิงค์ในคิวการบันทึก กดที่นี่เพื่อสั่งซิงค์ทันที"
              >
                <Activity className={`w-3.5 h-3.5 text-amber-400 ${isSyncing ? 'animate-spin' : 'animate-pulse'}`} />
                <span>รอดำเนินการ ({pendingTransactions.length})</span>
              </button>
            )}
            
            {/* Theme Toggle Button */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 border border-slate-800 bg-slate-950 hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
              title={theme === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] font-bold font-mono text-amber-500 hidden sm:inline">LIGHT MODE</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-[10px] font-bold font-mono text-slate-400 hidden sm:inline">DARK MODE</span>
                </>
              )}
            </button>

            {/* Quick Sync Switcher */}
            <div className="hidden lg:flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-[10px] font-mono">
              <button
                onClick={() => fetchData('recent', 1, true)}
                disabled={isLoading}
                className={`px-2 py-1 rounded flex items-center gap-1 transition-all cursor-pointer ${!isFullHistoryLoaded ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200'}`}
                title="โหลดเฉพาะข้อมูลล่าสุด 100 รายการ + รถที่กำลังชาร์จ (รวดเร็ว 1-2 วินาที)"
              >
                <Zap className="w-3 h-3 text-emerald-400" />
                <span>โหลดด่วน (1-2s)</span>
              </button>
              <button
                onClick={() => fetchData('full', 1, true)}
                disabled={isLoading || isLoadingFullHistory}
                className={`px-2 py-1 rounded flex items-center gap-1 transition-all cursor-pointer ${isFullHistoryLoaded ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200'}`}
                title="โหลดประวัติสะสมทั้งหมดจาก Google Sheets"
              >
                {isLoadingFullHistory ? (
                  <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                ) : (
                  <Database className="w-3 h-3 text-cyan-400" />
                )}
                <span>ประวัติทั้งหมด {totalHistoryCount > 0 ? `(${totalHistoryCount})` : ''}</span>
              </button>
            </div>

            <button
              onClick={handleManualRefresh}
              disabled={isLoading || isDbDisconnected}
              className="p-1.5 border border-slate-800 bg-slate-950 hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-200 transition-all disabled:opacity-40 cursor-pointer"
              title="รีเฟรชข้อมูลด่วน (1-2s)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2 md:p-6 bg-slate-950">
          {errorMsg && (
            <div className="mb-6 p-4 bg-rose-950/60 border border-rose-800/80 text-rose-200 text-sm rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg animate-fade-in">
              <div className="flex-1 min-w-0">
                <p className="font-bold flex items-center gap-2 text-rose-300">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                  ตรวจสอบฐานข้อมูลขัดข้อง (โหมดออฟไลน์แคช)
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 font-mono px-2 py-0.5 rounded border border-rose-500/30">Auto-Reconnecting</span>
                </p>
                <p className="text-xs mt-1 text-rose-300/80 leading-relaxed break-words">{errorMsg}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={handleManualRefresh}
                  disabled={isLoading}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
                  title="ลองส่งคำขอเชื่อมต่อใหม่อีกครั้ง"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  ลองเชื่อมต่อใหม่ (Retry)
                </button>
                <button
                  onClick={handleResetDefaultGasUrl}
                  className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  title="สลับกลับไปใช้ Production Web App URL เริ่มต้น"
                >
                  <CloudLightning className="w-3.5 h-3.5 text-amber-400" />
                  รีเซ็ต URL เริ่มต้น
                </button>
                <button
                  onClick={() => { setActiveTab('setup'); setIsMobileMenuOpen(false); }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-all active:scale-95 cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 inline mr-1" />
                  ตั้งค่าฐานข้อมูล
                </button>
                <button
                  onClick={() => setErrorMsg(null)}
                  className="p-1.5 hover:bg-rose-900/50 rounded-xl text-rose-400 hover:text-white transition-all text-xs font-bold"
                  title="ปิดการแจ้งเตือน"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {isDbDisconnected && activeTab !== 'setup' ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-xl mx-auto my-12 space-y-6 shadow-sm">
              <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto">
                <Database className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-800">เชื่อมโยงระบบฐานข้อมูล Google Sheets ก่อนเริ่มต้นใช้งาน</h2>
                <p className="text-sm text-slate-500 leading-relaxed max-w-md mx-auto">
                  ระบบ EV Charging Management System จำเป็นต้องมีแหล่งเก็บข้อมูลจริง 
                  คุณสามารถสร้างชีทฐานข้อมูลขึ้นใหม่ใน Drive ของคุณได้ในคลิกเดียวเพื่อเริ่มต้น
                </p>
              </div>
              <button
                onClick={() => { setActiveTab('setup'); setIsMobileMenuOpen(false); }}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-all inline-flex items-center gap-2 shadow-md"
              >
                เข้าสู่เมนูตั้งค่าฐานข้อมูล
              </button>
            </div>
          ) : (
            <div>
              {activeTab === 'dashboard' && (
                <Dashboard
                  trucks={harmonizedTrucks}
                  stations={harmonizedStations}
                  queue={queue}
                  sessions={sessions}
                  users={usersList}
                  onNavigate={setActiveTab}
                  onStopCharging={handleStopCharging}
                />
              )}
              {activeTab === 'trucks' && (
                <TrucksList
                  trucks={harmonizedTrucks}
                  stations={harmonizedStations}
                  sessions={sessions}
                  onAddTruck={handleAddTruck}
                  onUpdateTruck={handleUpdateTruck}
                  onDeleteTruck={handleDeleteTruck}
                />
              )}
              {activeTab === 'stations' && (
                <StationsList
                  user={user}
                  stations={harmonizedStations}
                  trucks={harmonizedTrucks}
                  queue={queue}
                  sessions={sessions}
                  users={usersList}
                  onStartCharging={handleStartCharging}
                  onStopCharging={handleStopCharging}
                  onToggleMaintenance={handleToggleMaintenance}
                  onAddStation={handleAddStation}
                  onUpdateStation={handleUpdateStation}
                  onDeleteStation={handleDeleteStation}
                />
              )}
              {activeTab === 'sessions' && (
                <SessionsHistory
                  sessions={sessions}
                  isFullHistoryLoaded={isFullHistoryLoaded}
                  totalHistoryCount={totalHistoryCount}
                  onLoadFullHistory={handleLoadFullHistory}
                  isLoadingFullHistory={isLoadingFullHistory}
                  onLoadMore={loadMore}
                  isLastPage={isLastPage}
                  isLoading={isLoading || isLoadingMore}
                />
              )}
              {activeTab === 'reports' && (
                <Reports
                  sessions={sessions}
                  stations={harmonizedStations}
                  trucks={harmonizedTrucks}
                  isFullHistoryLoaded={isFullHistoryLoaded}
                  totalHistoryCount={totalHistoryCount}
                  onLoadFullHistory={handleLoadFullHistory}
                  isLoadingFullHistory={isLoadingFullHistory}
                />
              )}
              {activeTab === 'analytics' && (
                <Analytics trucks={harmonizedTrucks} sessions={sessions} />
              )}
              {activeTab === 'users' && (
                <UsersList
                  users={usersList}
                  onAddUser={handleAddUser}
                  onUpdateUser={handleUpdateUser}
                  onDeleteUser={handleDeleteUser}
                />
              )}
              {activeTab === 'setup' && (
                <GasSetupPanel
                  spreadsheetId={config.spreadsheetId}
                  webAppUrl={config.webAppUrl}
                  mode={config.mode}
                  lineToken={config.lineToken}
                  accessToken={accessToken}
                  onConfigChange={setConfig}
                  onRefreshData={handleManualRefresh}
                />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
