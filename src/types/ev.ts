export interface EVTruck {
  id: string; // e.g., TRK-001
  licensePlate: string; // ทะเบียนรถ
  model: string; // ยี่ห้อ/รุ่น เช่น BYD Q1M, SANY SEV
  batteryCapacity: number; // ความจุแบตเตอรี่ (kWh) เช่น 282, 350
  currentSOC: number; // ระดับแบตเตอรี่ปัจจุบัน (%)
  status: 'Available' | 'Charging' | 'Maintenance';
  lastUpdated: string;
  currentOdometer?: number; // เลขไมล์สะสมล่าสุด (km)
}

export interface ChargingStation {
  id: string; // e.g., CS-01
  name: string; // ชื่อสถานี เช่น Station A - DC 150kW
  chargerType: 'AC 22kW' | 'DC 120kW' | 'DC 150kW Fast';
  powerOutput: number; // กำลังไฟ (kW)
  status: 'Available' | 'Occupied' | 'Maintenance';
  occupyingTruckId: string; // รหัสรถที่กำลังชาร์จ (ถ้ามี)
  lastUpdated: string;
}

export interface QueueItem {
  id: string; // e.g., Q-1001
  truckId: string;
  priority: 'High' | 'Normal';
  requestedChargerType: 'AC' | 'DC';
  status: 'Waiting' | 'Charging' | 'Completed' | 'Cancelled';
  requestTime: string;
  estimatedWaitTime: number; // นาที
}

export interface SessionLog {
  id: string; // e.g., S-10001
  truckId: string;
  stationId: string;
  operatorName: string;
  startTime: string;
  endTime: string;
  startSOC: number;
  endSOC: number;
  energyConsumed: number; // kWh
  duration: number; // นาที
  status: 'Charging' | 'Completed';
  odometer?: number; // เลขไมล์ที่บันทึก (km)
  pricePerUnit?: number; // ราคาต่อหน่วยที่เริ่มชาร์จ
  totalCost?: number; // ค่าไฟ (บาท)
  stoppedBy?: string; // ผู้ปลดการชาร์จ (กรณี Auto-Complete จะเป็นชื่อเดียวกับผู้เริ่มชาร์จ)
  isAutoCompleted?: boolean; // ปลดชาร์จโดยระบบ Auto-Complete 100%
}

export interface GASConfig {
  spreadsheetId: string;
  webAppUrl: string;
  mode: 'direct' | 'gas'; // direct = Google Sheets API, gas = Google Apps Script Web App
  lineToken?: string; // LINE Notify / Messenger Token saved locally
}
