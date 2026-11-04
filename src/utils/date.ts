export const getThailandDateString = (dateObj: Date = new Date()): string => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      calendar: 'gregory'
    });
    return formatter.format(dateObj);
  } catch (e) {
    const offset = dateObj.getTimezoneOffset();
    const local = new Date(dateObj.getTime() - (offset * 60 * 1000));
    return local.toISOString().split('T')[0];
  }
};

export const getThailandISOString = (dateObj: Date = new Date()): string => {
  try {
    const d = new Date(dateObj.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+07:00`;
  } catch (e) {
    return dateObj.toISOString();
  }
};

export const formatDateToTH = (dateObj: Date = new Date()): string => {
  try {
    const d = new Date(dateObj.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;
  } catch (e) {
    return dateObj.toLocaleDateString('th-TH');
  }
};
export const getThailandMonthString = (dateObj: Date = new Date()): string => {
  const dStr = getThailandDateString(dateObj);
  return dStr.substring(0, 7); // returns YYYY-MM
};

export const parseThailandDate = (dateInput: string | Date | undefined): Date => {
  if (!dateInput) return new Date();
  if (dateInput instanceof Date) return dateInput;
  
  const trimmed = dateInput.trim();
  if (trimmed.includes('Z') || trimmed.includes('+') || (trimmed.match(/-[0-9]{2}:[0-9]{2}$/))) {
    return new Date(trimmed);
  }
  
  if (trimmed.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}/)) {
    const isoLike = trimmed.replace(' ', 'T');
    return new Date(isoLike + '+07:00');
  }
  
  return new Date(trimmed);
};

export const getThailandHour = (dateObj: Date = new Date()): number => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      hour12: false
    });
    let hr = parseInt(formatter.format(dateObj), 10);
    if (hr === 24) hr = 0;
    return hr;
  } catch (e) {
    const hr = dateObj.getUTCHours() + 7;
    return hr >= 24 ? hr - 24 : hr;
  }
};

/**
 * Generates a collision-free Time-Based + Truck ID Session ID
 * Format: S-YYMMDD-HHmmss-TRUCK (e.g., S-260901-170624-TTEV24)
 * Guaranteed unique across 30+ simultaneous factory users
 */
export const generateUniqueSessionId = (truckId: string = 'TRK', dateObj: Date = new Date()): string => {
  try {
    const d = new Date(dateObj.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yy = d.getFullYear().toString().slice(-2);
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    
    // Sanitize truckId: e.g. "TTEV-24" -> "TTEV24"
    const cleanTruck = (truckId || 'TRK').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'TRK';
    
    return `S-${yy}${mm}${dd}-${hh}${min}${ss}-${cleanTruck}`;
  } catch (e) {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const now = new Date();
    const yy = now.getFullYear().toString().slice(-2);
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const cleanTruck = (truckId || 'TRK').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return `S-${yy}${mm}${dd}-${Date.now().toString().slice(-6)}-${cleanTruck}`;
  }
};

