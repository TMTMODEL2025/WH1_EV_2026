import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { EVTruck, ChargingStation, SessionLog } from '../types/ev';
import { UserItem } from '../data/users';

import { getThailandISOString } from '../utils/date';
import { 
  User, 
  KeyRound, 
  Truck, 
  Zap, 
  ShieldAlert, 
  CloudLightning, 
  Database,
  Lock,
  ArrowRight,
  Info,
  RefreshCw,
  Clock
} from 'lucide-react';

interface CustomLoginProps {
  trucks: EVTruck[];
  stations: ChargingStation[];
  sessions?: SessionLog[];
  users?: UserItem[];
  onLoginSuccess: (loginData: {
    role: 'Driver' | 'Admin';
    operatorName: string;
    employeeId: string;
    vehicleId?: string;
    chargerId?: string;
  }) => void;
  onStartCharging?: (stationId: string, truckId: string, operator: string, odometer: number, pricePerUnit?: number, startSOC?: number) => Promise<void>;
  onStopCharging?: (stationId: string, endSOC: number, energyConsumed?: number, durationMins?: number, totalCost?: number, endOdometer?: number) => Promise<void>;
  isLoadingData: boolean;
  onNavigateToSetup?: () => void;
  isDbDisconnected?: boolean;
  serverErrorMsg?: string | null;
  onRetryFetch?: () => void;
  onResetDefaultUrl?: () => void;
}

// Sub-component for displaying active charging sessions on the login screen
function ActiveChargingCard({
  session,
  truck,
  station,
  users,
  onStopCharging
}: {
  key?: string;
  session: SessionLog;
  truck?: EVTruck;
  station?: ChargingStation;
  users: UserItem[];
  onStopCharging?: (stationId: string, endSOC: number, energyConsumed?: number, durationMins?: number, totalCost?: number, endOdometer?: number) => Promise<void>;
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const startTime = new Date(session.startTime);
  const elapsedMinutes = Math.max(0, (now.getTime() - startTime.getTime()) / 60000);
  
  let currentEstimatedSOC = session.startSOC + elapsedMinutes / 1.45;
  if (currentEstimatedSOC > 100) currentEstimatedSOC = 100;
  
  const remainingMinutes = Math.max(0, (100 - session.startSOC) * 1.45 - elapsedMinutes);
  const completionTime = new Date(startTime.getTime() + (100 - session.startSOC) * 1.45 * 60000);

  const hours = Math.floor(elapsedMinutes / 60);
  const mins = Math.floor(elapsedMinutes % 60);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  };

  const handleStop = async () => {
    const { value: empId } = await Swal.fire({
      title: 'ยืนยันตัวตนเพื่อหยุดชาร์จ',
      text: `กรุณากรอกรหัสพนักงาน 8 หลักของ คุณ ${session.operatorName} เพื่อหยุดชาร์จรถ ${session.truckId}`,
      input: 'password',
      inputPlaceholder: 'รหัสพนักงาน 8 หลัก',
      inputAttributes: {
        maxlength: '8',
        autocapitalize: 'off',
        autocorrect: 'off'
      },
      showCancelButton: true,
      confirmButtonText: 'หยุดการชาร์จ',
      cancelButtonText: 'ยกเลิก',
      background: '#0f172a',
      color: '#f8fafc',
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#475569',
      inputValidator: (value) => {
        if (!value) {
          return 'กรุณากรอกรหัสพนักงาน';
        }
        if (value.length !== 8 || !/^\d+$/.test(value)) {
          return 'รหัสพนักงานต้องเป็นตัวเลข 8 หลัก';
        }
      }
    });

    if (empId) {
      const trimmedEmpId = String(empId).trim();
      const driverName = String(session.operatorName || '').trim();

      const enteringUser = users.find(u => String(u.employeeId).trim() === trimmedEmpId);
      const matchedUser = users.find(u => String(u.name).trim() === driverName);

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
            text: `ไม่อนุญาตให้ Admin หรือผู้ดูแล ปลดการชาร์จแทนผู้ชาร์จในทุกกรณี ต้องใช้รหัสพนักงาน 8 หลักของผู้ชาร์จ (คุณ ${session.operatorName}) เท่านั้น`,
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
          text: `รหัสพนักงานไม่ถูกต้องสำหรับหยุดการชาร์จของคุณ ${session.operatorName} (รถ ${session.truckId})`,
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#ef4444'
        });
        return;
      }

      if (onStopCharging) {
        try {
          Swal.fire({
            title: 'กำลังหยุดการชาร์จ...',
            text: 'กรุณารอสักครู่ ระบบกำลังบันทึกข้อมูลไปยังฐานข้อมูล',
            allowOutsideClick: false,
            didOpen: () => {
              Swal.showLoading();
            },
            background: '#0f172a',
            color: '#f8fafc',
          });

          const currentSocInt = Math.round(currentEstimatedSOC);
          // Auto calculate duration, energy and costs using the formulas
          await onStopCharging(
            session.stationId,
            currentSocInt,
            undefined, // consumedEnergy calculated on backend/App.tsx
            undefined, // duration calculated on backend/App.tsx
            undefined, // totalCost calculated on backend/App.tsx
            truck?.currentOdometer || session.odometer
          );

          Swal.fire({
            title: 'หยุดการชาร์จสำเร็จ!',
            text: `ระบบทำการหยุดชาร์จรถ ${session.truckId} เรียบร้อยแล้วที่ระดับ SOC ${currentSocInt}%`,
            icon: 'success',
            background: '#0f172a',
            color: '#f8fafc',
            confirmButtonColor: '#10b981',
          });
        } catch (err: any) {
          Swal.fire({
            icon: 'error',
            title: 'เกิดข้อผิดพลาด',
            text: err.message || 'ไม่สามารถบันทึกข้อมูลการหยุดชาร์จได้',
            background: '#0f172a',
            color: '#f8fafc',
            confirmButtonColor: '#ef4444'
          });
        }
      }
    }
  };

  return (
    <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 space-y-2 hover:border-emerald-500/20 transition-all text-left">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-slate-200">เครื่องชาร์จ {session.stationId}</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 font-bold rounded border border-emerald-500/10 font-mono">
            {session.truckId}
          </span>
        </div>
        <span className="text-[10px] text-slate-400">
          ผู้ขับ: <span className="font-semibold text-slate-300">{session.operatorName}</span>
        </span>
      </div>

      {/* Progress & Time Info */}
      <div className="space-y-1">
        <div className="w-full h-1 bg-slate-950 border border-slate-800/80 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${currentEstimatedSOC}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">SOC: {session.startSOC}% ➔</span>
            <span className="text-emerald-400 font-bold">{Math.round(currentEstimatedSOC)}%</span>
            <span className="text-slate-500">• {hours > 0 ? `${hours}ชม. ` : ''}{mins}นาที</span>
          </div>
          <div>
            {remainingMinutes > 0 ? (
              <span className="text-amber-400 font-medium">เหลือ ~{remainingMinutes.toFixed(0)} นาที ({formatTime(completionTime)})</span>
            ) : (
              <span className="text-emerald-400 font-semibold animate-pulse">เต็ม 100% แล้ว</span>
            )}
          </div>
        </div>
      </div>

      {/* Compact Stop Button */}
      <button
        type="button"
        onClick={handleStop}
        className="w-full py-1.5 bg-rose-600/10 hover:bg-rose-600 border border-rose-500/20 text-rose-400 hover:text-white font-extrabold text-[11px] rounded-lg transition-all flex items-center justify-center gap-1 active:scale-[0.99] cursor-pointer"
      >
        <span>หยุดชาร์จรถ {session.truckId}</span>
      </button>
    </div>
  );
}

// CustomLogin component without fallback mock data

export default function CustomLogin({
  trucks = [],
  stations = [],
  sessions = [],
  users = [],
  onLoginSuccess,
  onStartCharging,
  onStopCharging,
  isLoadingData,
  onNavigateToSetup,
  isDbDisconnected = false,
  serverErrorMsg,
  onRetryFetch,
  onResetDefaultUrl
}: CustomLoginProps) {
  const [loginMode, setLoginMode] = useState<'driver' | 'admin'>('driver');
  
  // Driver Form states
  const [selectedOperator, setSelectedOperator] = useState('');
  const [password, setPassword] = useState('');
  const [selectedTruckId, setSelectedTruckId] = useState('');
  const [selectedStationId, setSelectedStationId] = useState('');
  const [odometer, setOdometer] = useState<number | ''>('');
  const [soc, setSoc] = useState<number | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Admin Form states
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Use DB lists directly (no mock data)
  const displayTrucks = trucks || [];
  const displayStations = stations || [];
  const displayUsers = users || [];
  const displaySessions = sessions || [];
  const onlyDrivers = displayUsers.filter(u => u.role !== 'Admin' && u.role !== 'Supervisor');

  // Filter stations to show ONLY those with 'Available' status for driver
  const availableStations = displayStations.filter(st => st.status === 'Available');

  // If the driver currently has an active charging session, only show the truck they are currently charging
  const activeDriverSession = selectedOperator 
    ? displaySessions.find(s => s.status === 'Charging' && s.operatorName === selectedOperator)
    : null;

  const filteredTrucks = activeDriverSession 
    ? displayTrucks.filter(t => t.id === activeDriverSession.truckId)
    : displayTrucks;

  const selectedTruckObj = displayTrucks.find(t => t.id === selectedTruckId);
  const isChargingMode = selectedTruckObj?.status === 'Charging';

  const currentOdo = selectedTruckObj ? (selectedTruckObj.currentOdometer || 0) : 0;

  // Form Validation
  const isSocInvalid = !isChargingMode && selectedTruckId !== '' && soc !== '' && (
    Number(soc) < 0 || Number(soc) > 100
  );

  const isOdometerInvalid = !isChargingMode && selectedTruckId !== '' && odometer !== '' && (
    Number(odometer) < currentOdo || Number(odometer) > currentOdo + 50
  );

  const isFormInvalid = isSocInvalid || isOdometerInvalid;

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isChargingMode) {
      const activeStation = displayStations.find(s => s.occupyingTruckId === selectedTruckId);
      if (activeStation) {
        setSelectedStationId(activeStation.id);
        
        const activeSession = displaySessions.find(s => s.stationId === activeStation.id && s.status === 'Charging' && s.truckId === selectedTruckId);
        
        const updateEstimatedSoc = () => {
          if (activeSession) {
            const startTime = new Date(activeSession.startTime);
            const now = new Date();
            const elapsedMinutes = Math.max(0, (now.getTime() - startTime.getTime()) / 60000);
            let currentEstimatedSOC = activeSession.startSOC + elapsedMinutes / 1.45;
            if (currentEstimatedSOC > 100) currentEstimatedSOC = 100;
            setSoc(Math.round(currentEstimatedSOC));
          } else if (selectedTruckObj) {
            setSoc(selectedTruckObj.currentSOC);
          }
        };

        // Run immediately
        updateEstimatedSoc();

        // Update every 1 second to show real-time percentage change
        interval = setInterval(updateEstimatedSoc, 1000);
      }
    } else {
      setSelectedStationId('');
      setOdometer('');
      setSoc('');
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedTruckId, isChargingMode, displayStations, displaySessions, selectedTruckObj]);

  // Auto-detect active session when driver selects their name
  useEffect(() => {
    if (selectedOperator) {
      const activeSession = displaySessions.find(
        s => s.status === 'Charging' && s.operatorName === selectedOperator
      );
      if (activeSession) {
        if (selectedTruckId !== activeSession.truckId || selectedStationId !== activeSession.stationId) {
          setSelectedTruckId(activeSession.truckId);
          setSelectedStationId(activeSession.stationId);
          
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'info',
            title: 'พบข้อมูลการชาร์จของคุณ',
            text: `ระบบเลือก รถ ${activeSession.truckId} และ เครื่องชาร์จ ${activeSession.stationId} ให้โดยอัตโนมัติ`,
            showConfirmButton: false,
            timer: 4000,
            background: '#0f172a',
            color: '#f8fafc',
            timerProgressBar: true
          });
        }
      }
    }
  }, [selectedOperator, displaySessions, selectedTruckId, selectedStationId]);

  const handleDriverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedOperator || !password || !selectedTruckId || !selectedStationId || soc === '') {
      setErrorMsg('กรุณากรอกข้อมูลและเลือกตัวเลือกให้ครบถ้วนทุกช่อง');
      return;
    }

    if (!isChargingMode && odometer === '') {
      setErrorMsg('กรุณากรอกข้อมูลและเลือกตัวเลือกให้ครบถ้วนทุกช่อง');
      return;
    }

    // Validate 8-digit password
    if (password.length !== 8 || !/^\d+$/.test(password)) {
      setErrorMsg('รหัสผ่านจะต้องเป็นตัวเลขรหัสพนักงาน 8 หลัก');
      return;
    }

    // Authenticate user against displayUsers
    const matchedUser = displayUsers.find(u => u.name === selectedOperator);
    if (!matchedUser) {
      setErrorMsg('ไม่พบข้อมูลชื่อพนักงานขับรถท่านนี้');
      return;
    }

    if (isChargingMode) {
      const enteringUser = displayUsers.find(u => String(u.employeeId).trim() === String(password).trim());
      const isAdminOrSupervisor = enteringUser && (enteringUser.role === 'Admin' || enteringUser.role === 'Supervisor');
      const isMasterAdminPin = password === '685400' || password === '99999999' || password === '55019283';

      if ((isAdminOrSupervisor || isMasterAdminPin) && String(enteringUser?.name).trim() !== String(selectedOperator).trim()) {
        setErrorMsg(`ไม่อนุญาตให้ Admin หรือผู้ดูแล ปลดการชาร์จแทนผู้ชาร์จในทุกกรณี ต้องใช้รหัสพนักงานของผู้ชาร์จ (คุณ ${selectedOperator}) เท่านั้น`);
        return;
      }
    }

    if (matchedUser.employeeId !== password) {
      setErrorMsg(`รหัสพนักงานไม่ถูกต้องสำหรับคุณ ${selectedOperator}`);
      return;
    }

    if (isChargingMode) {
      // It's Stop Charging
      if (soc < (selectedTruckObj?.currentSOC || 0)) {
        setErrorMsg(`เป้าหมาย SOC (${soc}%) ต้องไม่น้อยกว่าระดับแบตเตอรี่ปัจจุบัน (${selectedTruckObj?.currentSOC}%)`);
        return;
      }
      if (onStopCharging) {
        try {
          setIsSubmitting(true);
          // Artificial delay to show the loading animation clearly
          await new Promise(resolve => setTimeout(resolve, 800));
          await onStopCharging(selectedStationId, Number(soc), undefined, undefined, undefined, selectedTruckObj?.currentOdometer);
          Swal.fire({
            title: 'หยุดชาร์จสำเร็จ!',
            text: 'บันทึกข้อมูลการชาร์จเรียบร้อยแล้ว',
            icon: 'success',
            background: '#0f172a',
            color: '#f8fafc',
            confirmButtonColor: '#10b981',
          });
          // Reset form instead of jumping to dashboard
          setPassword('');
          setSelectedTruckId('');
          setSelectedStationId('');
          setOdometer('');
          setSoc('');
        } catch (err: any) {
          setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการหยุดชาร์จ');
        } finally {
          setIsSubmitting(false);
        }
      }
    } else {
      // It's Start Charging
      if (isFormInvalid) {
        if (isSocInvalid) {
          setErrorMsg('ระบุแบตเตอรี่ไม่เกิน 100%');
        } else if (isOdometerInvalid) {
          setErrorMsg('เลขไมล์ต้องไม่น้อยกว่าค่าเดิมและไม่เกิน +50');
        } else {
          setErrorMsg('กรุณากรอกข้อมูลให้ถูกต้องตามเงื่อนไข');
        }
        return;
      }

      if (Number(soc) >= 100) {
        setErrorMsg('ระบุแบตเตอรี่ก่อนชาร์จ 100% เต็มอยู่แล้ว ไม่จำเป็นต้องทำการชาร์จไฟเพิ่ม');
        return;
      }

      if (odometer < (selectedTruckObj?.currentOdometer || 0)) {
        setErrorMsg(`เลขไมล์ (${odometer}) ต้องไม่น้อยกว่าเลขไมล์ปัจจุบัน (${selectedTruckObj?.currentOdometer})`);
        return;
      }

      const stationObj = displayStations.find(s => s.id === selectedStationId);
      if (stationObj && stationObj.status !== 'Available') {
        setErrorMsg(`เครื่องชาร์จ ${selectedStationId} ถูกใช้งานโดยรถอื่นแล้วหรืออยู่ระหว่างซ่อมบำรุง`);
        return;
      }
      
      if (onStartCharging) {
        try {
          setIsSubmitting(true);
          // Artificial delay to show the loading animation clearly
          await new Promise(resolve => setTimeout(resolve, 800));
          await onStartCharging(selectedStationId, selectedTruckId, selectedOperator, Number(odometer), undefined, Number(soc));
          Swal.fire({
            title: 'เริ่มชาร์จสำเร็จ!',
            text: 'บันทึกข้อมูลและเริ่มชาร์จเรียบร้อยแล้ว',
            icon: 'success',
            background: '#0f172a',
            color: '#f8fafc',
            confirmButtonColor: '#10b981',
          });
          // Reset form instead of jumping to dashboard
          setPassword('');
          setSelectedTruckId('');
          setSelectedStationId('');
          setOdometer('');
          setSoc('');
        } catch (err: any) {
          setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการเริ่มชาร์จ');
        } finally {
          setIsSubmitting(false);
        }
      }
    }
  };

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!adminUsername || !adminPassword) {
      setErrorMsg('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    // 1. Check default master admin accounts first
    const trimmedAdminPassword = adminPassword.trim();
    if (trimmedAdminPassword === '685400' || trimmedAdminPassword === '99999999' || trimmedAdminPassword === '55019283') {
      onLoginSuccess({
        role: 'Admin',
        operatorName: 'ผู้ดูแลระบบสูงสุด (Master Admin)',
        employeeId: trimmedAdminPassword
      });
      Swal.fire({
        title: 'เข้าสู่ระบบสำเร็จ!',
        text: 'ยินดีต้อนรับผู้ดูแลระบบระดับสูง (Master Admin)',
        icon: 'success',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#10b981',
        timer: 2000,
        showConfirmButton: false,
      });
      return;
    }

    // 2. Validate against displayUsers with role 'Admin' or 'Supervisor'
    const matchedAdmin = displayUsers.find(
      u => u.employeeId === trimmedAdminPassword && (u.role === 'Admin' || u.role === 'Supervisor')
    );

    if (matchedAdmin) {
      onLoginSuccess({
        role: 'Admin',
        operatorName: matchedAdmin.name,
        employeeId: matchedAdmin.employeeId
      });
      Swal.fire({
        title: 'เข้าสู่ระบบสำเร็จ!',
        text: `ยินดีต้อนรับหัวหน้างาน: คุณ ${matchedAdmin.name}`,
        icon: 'success',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#10b981',
        timer: 2000,
        showConfirmButton: false,
      });
    } else {
      setErrorMsg('รหัสผ่านผู้ดูแลระบบ หรือรหัสพนักงานระดับหัวหน้างานไม่ถูกต้อง');
    }
  };

  const hasCachedData = (displayTrucks.length > 0 && displayStations.length > 0);

  return (
    <div className="min-h-[100dvh] bg-slate-950 flex flex-col items-center justify-center p-3 py-4 sm:p-4 sm:py-10 relative overflow-y-auto overflow-x-hidden" id="custom-login-container">
      {/* Visual ambient glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl relative z-10 space-y-4 sm:space-y-6 overflow-hidden">
        {/* Full-screen loading overlay only if there is NO cached data at all */}
        {isLoadingData && !hasCachedData && (
          <div className="absolute inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
            <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
            <p className="text-sm font-bold text-slate-200 tracking-wider font-mono">กำลังเชื่อมต่อและดึงข้อมูลระบบครั้งแรก...</p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-mono">Connecting to Database Gateway</p>
          </div>
        )}
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center gap-1.5 relative">
          {/* Subtle non-blocking background sync indicator */}
          {isLoadingData && hasCachedData && (
            <div className="absolute right-0 top-0 hidden sm:flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>กำลังซิงค์...</span>
            </div>
          )}

          <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-1">
            <CloudLightning className="w-6 h-6 sm:w-8 sm:h-8 text-slate-950 fill-current" />
          </div>
          <h1 className="text-lg sm:text-2xl font-extrabold text-white tracking-tight">TMT EV-CMS</h1>
          <div className="flex items-center gap-2">
            <p className="text-emerald-400 text-[11px] sm:text-xs font-bold uppercase tracking-wider font-mono">ระบบจัดการการชาร์จรถหัวลากไฟฟ้า (WH1)</p>
            {isLoadingData && hasCachedData && (
              <span className="sm:hidden text-[9px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 animate-pulse flex items-center gap-1">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" /> ซิงค์...
              </span>
            )}
          </div>
        </div>


        {/* Database Offline / Server Error Alert with Quick Actions */}
        {serverErrorMsg && (
          <div className="p-3.5 bg-rose-950/60 border border-rose-800/80 text-rose-200 rounded-2xl text-xs space-y-2.5 animate-fade-in shadow-md">
            <div className="flex items-start gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0 mt-1" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-rose-300 flex items-center gap-1.5">
                  เชื่อมต่อฐานข้อมูล Google Sheets ขัดข้อง
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 font-mono px-1.5 py-0.5 rounded border border-rose-500/30">โหมดออฟไลน์แคช</span>
                </p>
                <p className="text-[11px] text-rose-300/80 mt-1 leading-relaxed break-words font-sans">
                  {serverErrorMsg}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rose-900/40">
              {onRetryFetch && (
                <button
                  type="button"
                  onClick={onRetryFetch}
                  disabled={isLoadingData}
                  className="px-3 py-1 bg-emerald-600/90 hover:bg-emerald-500 text-slate-950 font-bold text-[11px] rounded-lg transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingData ? 'animate-spin' : ''}`} />
                  ลองเชื่อมต่อใหม่ (Retry)
                </button>
              )}
              {onResetDefaultUrl && (
                <button
                  type="button"
                  onClick={onResetDefaultUrl}
                  className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 font-bold text-[11px] rounded-lg transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <CloudLightning className="w-3 h-3 text-amber-400" />
                  รีเซ็ต URL เริ่มต้น
                </button>
              )}
              {onNavigateToSetup && (
                <button
                  type="button"
                  onClick={onNavigateToSetup}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[11px] rounded-lg transition-all active:scale-95 cursor-pointer"
                >
                  ตั้งค่าฐานข้อมูล
                </button>
              )}
            </div>
          </div>
        )}

        {/* Mode Selector Tab */}
        <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => { setLoginMode('driver'); setErrorMsg(null); }}
            className={`py-2 px-2.5 rounded-lg text-xs font-bold tracking-wide transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              loginMode === 'driver' 
                ? 'bg-slate-800 text-emerald-400 border border-slate-700/60 shadow-sm' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">พนักงานขับรถ</span>
          </button>
          <button
            type="button"
            onClick={() => { setLoginMode('admin'); setErrorMsg(null); }}
            className={`py-2 px-2.5 rounded-lg text-xs font-bold tracking-wide transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              loginMode === 'admin' 
                ? 'bg-slate-800 text-emerald-400 border border-slate-700/60 shadow-sm' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">ผู้ดูแลระบบ</span>
          </button>
        </div>

        {/* Error Message banner */}
        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="font-semibold">{errorMsg}</span>
          </div>
        )}

        {/* DRIVER LOGIN FORM */}
        {loginMode === 'driver' && (
          <form onSubmit={handleDriverSubmit} className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
              
              {/* 1. Select User */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  1. เลือกชื่อ-นามสกุล *
                </label>
                <div className="relative">
                  <select
                    required
                    value={selectedOperator}
                    onChange={(e) => {
                      setSelectedOperator(e.target.value);
                      setSelectedTruckId('');
                      setSelectedStationId('');
                      setOdometer('');
                      setSoc('');
                    }}
                    disabled={onlyDrivers.length === 0}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
                  >
                    <option value="">{onlyDrivers.length === 0 ? '-- ไม่มีรายชื่อพนักงานในระบบ --' : '-- เลือกชื่อพนักงาน --'}</option>
                    {onlyDrivers.map(user => (
                      <option key={user.name} value={user.name}>{user.name}</option>
                    ))}
                  </select>
                  <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                </div>
              </div>

              {/* 2. Password (8-digit ID) */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  2. รหัสพนักงาน (8 หลัก) *
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    maxLength={8}
                    placeholder="ใส่รหัสพนักงาน 8 หลัก"
                    value={password}
                    onChange={(e) => setPassword(e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-blue-500/40 text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                  />
                  <KeyRound className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                </div>
              </div>

              {/* 3 & 4 Paired on Mobile: Select Vehicle & Select Charger */}
              <div className="grid grid-cols-2 sm:contents gap-2.5">
                {/* 3. Select Vehicle (TTEV19-27) */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    3. เลือกเบอร์รถ *
                  </label>
                  <div className="relative">
                    <select
                      required
                      value={selectedTruckId}
                      onChange={(e) => {
                        const newTruckId = e.target.value;
                        setSelectedTruckId(newTruckId);
                        const truck = displayTrucks.find(t => t.id === newTruckId);
                        if (truck && truck.currentOdometer !== undefined && truck.currentOdometer !== null && !Number.isNaN(truck.currentOdometer)) {
                          setOdometer(truck.currentOdometer);
                        } else {
                          setOdometer('');
                        }
                      }}
                      disabled={filteredTrucks.length === 0}
                      className="w-full pl-8 pr-2 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors font-mono disabled:opacity-50"
                    >
                      <option value="">{filteredTrucks.length === 0 ? '-- ไม่มีรถ --' : '-- เลือกรถ --'}</option>
                      {filteredTrucks.map(truck => (
                        <option 
                          key={truck.id} 
                          value={truck.id}
                        >
                          {truck.id} {truck.status === 'Charging' ? '⚡' : ''}
                        </option>
                      ))}
                    </select>
                    <Truck className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-3" />
                  </div>
                </div>

                {/* 4. Select Charger (Only Available) */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    4. เลือกตู้ชาร์จ *
                  </label>
                  <div className="relative">
                    <select
                      required
                      value={selectedStationId}
                      onChange={(e) => setSelectedStationId(e.target.value)}
                      disabled={isChargingMode || displayStations.length === 0}
                      className="w-full pl-8 pr-2 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors font-mono disabled:opacity-50"
                    >
                      <option value="">{displayStations.length === 0 ? '-- ไม่มีตู้ --' : '-- เลือกตู้ --'}</option>
                      {displayStations.map((st, index) => (
                        <option 
                          key={`${st.id}-${index}`} 
                          value={st.id}
                          disabled={st.status !== 'Available' && st.occupyingTruckId !== selectedTruckId}
                        >
                          {st.id} {st.occupyingTruckId === selectedTruckId ? '⚡' : (st.status !== 'Available' ? '❌' : '🟢')}
                        </option>
                      ))}
                    </select>
                    <Zap className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-3" />
                  </div>
                </div>
              </div>

              {/* Latest Odometer (Read-only) */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  เลขไมล์สะสมในระบบ (อัตโนมัติ)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={selectedTruckObj ? selectedTruckObj.currentOdometer : '-'}
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-500 cursor-not-allowed font-mono"
                  />
                  <Database className="w-3.5 h-3.5 text-slate-600 absolute left-3 top-2.5" />
                </div>
              </div>

              {/* 5. Odometer */}
              {!isChargingMode && (
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    5. เลขไมล์ก่อนชาร์จ (ต้องไม่น้อยกว่าเลขไมล์ล่าสุด และไม่เกิน +50) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min={currentOdo}
                      max={currentOdo + 50}
                      placeholder={`เลขไมล์ปัจจุบัน: ${currentOdo}`}
                      value={odometer}
                      onChange={(e) => setOdometer(e.target.value ? Number(e.target.value) : '')}
                      className={`w-full pl-9 pr-3.5 py-2.5 rounded-xl border text-xs font-semibold font-mono transition-colors focus:outline-none ${
                        isOdometerInvalid
                          ? 'bg-slate-950 border-rose-500 ring-1 ring-rose-500 text-slate-200 focus:border-rose-500'
                          : 'bg-slate-950 border-slate-800 text-slate-200 focus:border-emerald-500'
                      }`}
                    />
                    <Database className={`w-3.5 h-3.5 absolute left-3 top-3.5 ${isOdometerInvalid ? 'text-rose-500' : 'text-slate-500'}`} />
                  </div>
                  {isOdometerInvalid && (
                    <p className="text-[11px] text-rose-400 font-medium mt-1">
                      เลขไมล์ต้องไม่น้อยกว่าค่าเดิมและไม่เกิน +50 จากค่าเดิม ({currentOdo} - {currentOdo + 50})
                    </p>
                  )}
                </div>
              )}

              {/* 6. SOC */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    6. แบตเตอรี่ (%) {isChargingMode ? 'หลัง' : 'ก่อน'}ชาร์จ *
                  </label>
                  {isChargingMode && (
                    <span className="text-[9px] text-amber-400 font-bold flex items-center gap-1 animate-pulse">
                      ⚡ คำนวณแบบเรียลไทม์ตามเวลาจริง
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min={isChargingMode ? (selectedTruckObj?.currentSOC || 0) : 0}
                    max={100}
                    placeholder={`SOC ปัจจุบัน: ${selectedTruckObj?.currentSOC || 0}%`}
                    value={soc}
                    readOnly={isChargingMode}
                    onChange={(e) => {
                      if (!isChargingMode) {
                        setSoc(e.target.value ? Number(e.target.value) : '');
                      }
                    }}
                    className={`w-full pl-9 pr-3.5 py-2.5 rounded-xl border text-xs font-semibold font-mono transition-all focus:outline-none ${
                      isChargingMode 
                        ? 'bg-slate-900/80 border-amber-500/40 text-amber-400 shadow-inner shadow-amber-500/5 focus:border-amber-500' 
                        : isSocInvalid
                          ? 'bg-slate-950 border-rose-500 ring-1 ring-rose-500 text-slate-200 focus:border-rose-500 font-mono'
                          : 'bg-slate-950 border-slate-800 text-slate-200 focus:border-emerald-500 font-mono'
                    }`}
                  />
                  <CloudLightning className={`w-3.5 h-3.5 absolute left-3 top-3.5 ${isChargingMode ? 'text-amber-500 animate-bounce' : isSocInvalid ? 'text-rose-500' : 'text-slate-500'}`} />
                </div>
                {isSocInvalid && (
                  <p className="text-[11px] text-rose-400 font-medium mt-1">
                    ระบุแบตเตอรี่ไม่เกิน 100% (สามารถระบุได้ตั้งแต่ 0 ถึง 100)
                  </p>
                )}
              </div>

            </div>

            {/* Submit button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || isFormInvalid}
                className={`w-full py-3 ${isChargingMode ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-slate-950 font-extrabold text-xs sm:text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-slate-950" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>กำลังประมวลผล...</span>
                  </>
                ) : (
                  <>
                    <span>{isChargingMode ? 'หยุดชาร์จ (STOP CHARGING)' : 'เริ่มชาร์จ (START CHARGING)'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ADMIN LOGIN FORM */}
        {loginMode === 'admin' && (
          <form onSubmit={handleAdminSubmit} className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  บัญชีผู้ใช้
                </label>
                <div className="relative">
                  <input
                    type="text"
                    disabled
                    value="ผู้ดูแลระบบ / หัวหน้างาน (Admin / Supervisor)"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-850 text-xs font-semibold text-slate-400 font-sans"
                  />
                  <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3.5" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  รหัสผ่านแอดมิน หรือ รหัสพนักงานระดับหัวหน้างาน *
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    placeholder="กรอกรหัสพนักงานหัวหน้างาน 8 หลัก หรือรหัสแอดมินเดิม"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                  />
                  <KeyRound className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3.5" />
                </div>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-850 p-3 rounded-xl">
              <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                💡 <strong>คำแนะนำ:</strong> สำหรับหัวหน้างานที่ลงทะเบียนในระบบแล้ว สามารถใช้รหัสพนักงาน 8 หลักเป็นรหัสผ่านเพื่อเข้าสู่ระบบจัดการได้ทันที
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                id="admin-login-submit-btn"
                className="w-full py-3 bg-blue-500 hover:bg-blue-400 text-slate-950 font-extrabold text-xs sm:text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer"
              >
                <span>เข้าสู่ระบบจัดการสำหรับแอดมิน (ADMIN LOGIN)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* Database setup shortcut for offline mode */}
        {isDbDisconnected && onNavigateToSetup && (
          <div className="pt-4 border-t border-slate-800/80 text-center">
            <button
              type="button"
              onClick={onNavigateToSetup}
              className="text-xs font-bold text-emerald-400 hover:text-emerald-300 underline underline-offset-4 cursor-pointer"
            >
              ตั้งค่าหรือเชื่อมต่อฐานข้อมูล Google Sheets
            </button>
          </div>
        )}
      </div>

      {/* ACTIVE CHARGING SESSIONS STATUS LIST */}
      {(() => {
        if (loginMode !== 'driver') return null;
        const activeSessions = (sessions || []).filter(s => s.status === 'Charging');
        if (activeSessions.length === 0) return null;
        return (
          <div className="max-w-xl w-full mt-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-2xl relative z-10 space-y-3">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider font-mono">
                ⚡ รถที่กำลังชาร์จอยู่ ({activeSessions.length})
              </h3>
            </div>
            <p className="text-[10px] text-slate-400 leading-normal font-sans">
              คนขับรถสามารถกดปุ่ม <strong>"หยุดชาร์จ"</strong> บนรถของคุณด้านล่างนี้ และกรอกรหัสพนักงาน 8 หลัก เพื่อหยุดการชาร์จได้ทันทีโดยไม่ต้องเข้าระบบใหม่
            </p>
            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {activeSessions.map((session, index) => {
                const matchedTruck = displayTrucks.find(t => t.id === session.truckId);
                const matchedStation = displayStations.find(s => s.id === session.stationId);
                return (
                  <ActiveChargingCard
                    key={`${session.id}-${index}`}
                    session={session}
                    truck={matchedTruck}
                    station={matchedStation}
                    users={displayUsers}
                    onStopCharging={onStopCharging}
                  />
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
