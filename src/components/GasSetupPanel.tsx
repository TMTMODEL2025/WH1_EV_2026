import React, { useState, useEffect } from 'react';
import { googleAppsScriptCode } from '../services/gasCodeTemplate';
import { googleSheetsDirect } from '../services/googleSheetsDirect';
import { DEFAULT_PRODUCTION_GAS_URL, sanitizeGasUrl, sanitizeBaseGasUrl } from '../services/googleAppsScriptService';
import { Database, FileCode, CheckCircle2, Copy, AlertTriangle, RefreshCw, KeyRound, Globe, FileSpreadsheet, Lock, CloudLightning } from 'lucide-react';
import Swal from 'sweetalert2';

interface GasSetupPanelProps {
  spreadsheetId: string;
  webAppUrl: string;
  mode: 'direct' | 'gas';
  lineToken?: string;
  accessToken: string | null;
  onConfigChange: (config: { spreadsheetId: string; webAppUrl: string; mode: 'direct' | 'gas'; lineToken?: string }) => void;
  onRefreshData: () => Promise<void>;
}

export default function GasSetupPanel({
  spreadsheetId,
  webAppUrl,
  mode,
  lineToken,
  accessToken,
  onConfigChange,
  onRefreshData
}: GasSetupPanelProps) {
  const [localSpreadsheetId, setLocalSpreadsheetId] = useState(spreadsheetId);
  const [localWebAppUrl, setLocalWebAppUrl] = useState(webAppUrl);
  const [localMode, setLocalMode] = useState<'direct' | 'gas'>(mode);
  const [localLineToken, setLocalLineToken] = useState(lineToken || '');

  useEffect(() => {
    setLocalSpreadsheetId(spreadsheetId);
    setLocalWebAppUrl(webAppUrl);
    setLocalMode(mode);
    setLocalLineToken(lineToken || '');
  }, [spreadsheetId, webAppUrl, mode, lineToken]);

  const [isInitializing, setIsInitializing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // High-security password lock screen variables
  const [isPasswordUnlocked, setIsPasswordUnlocked] = useState(() => {
    return sessionStorage.getItem('setup_unlocked') === 'true';
  });
  const [inputPassword, setInputPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPassword = inputPassword.trim();
    if (trimmedPassword === '685400') {
      setIsPasswordUnlocked(true);
      sessionStorage.setItem('setup_unlocked', 'true');
      setUnlockError('');
      Swal.fire({
        title: 'ยืนยันรหัสผ่านสำเร็จ!',
        text: 'ปลดล็อกสิทธิ์การเข้าถึงเมนูการเชื่อมฐานข้อมูลแล้ว',
        icon: 'success',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#10b981',
        timer: 1500,
        showConfirmButton: false,
      });
    } else {
      setUnlockError('รหัสผ่านสำหรับเปิดใช้งานหน้าตั้งค่าฐานข้อมูลไม่ถูกต้อง');
      Swal.fire({
        title: 'รหัสผ่านไม่ถูกต้อง',
        text: 'กรุณาระบุรหัสผ่านผู้ดูแลระบบระดับสูงที่ถูกต้อง (685400)',
        icon: 'error',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#ef4444',
      });
    }
  };

  const handleLockMenu = () => {
    setIsPasswordUnlocked(false);
    sessionStorage.removeItem('setup_unlocked');
    setInputPassword('');
    Swal.fire({
      title: 'ล็อกเมนูแล้ว!',
      text: 'ล็อกสิทธิ์การเข้าถึงเมนูการเชื่อมฐานข้อมูลสำเร็จ',
      icon: 'info',
      background: '#0f172a',
      color: '#f8fafc',
      confirmButtonColor: '#10b981',
      timer: 1500,
      showConfirmButton: false
    });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(googleAppsScriptCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateNewDatabase = async () => {
    if (!accessToken) {
      Swal.fire({
        title: 'คำเตือน',
        text: 'กรุณาเข้าสู่ระบบด้วย Google ก่อนสร้างฐานข้อมูล',
        icon: 'warning',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#eab308',
      });
      return;
    }

    setIsInitializing(true);
    setTestResult(null);
    try {
      const newSheetId = await googleSheetsDirect.createAndInitializeDatabase(accessToken);
      setLocalSpreadsheetId(newSheetId);
      onConfigChange({
        spreadsheetId: newSheetId,
        webAppUrl: localWebAppUrl,
        mode: 'direct',
        lineToken: localLineToken
      });
      setTestResult({
        success: true,
        message: `สร้างฐานข้อมูลสำเร็จ! ID: ${newSheetId}`
      });
      Swal.fire({
        title: 'สร้างฐานข้อมูลสำเร็จ!',
        text: `ระบบสร้างแผ่นงานที่จำเป็นทั้งหมดบน Google Sheets เรียบร้อยแล้ว\nSpreadsheet ID: ${newSheetId}`,
        icon: 'success',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#10b981',
      });
      setTimeout(() => {
        onRefreshData();
      }, 1000);
    } catch (e: any) {
      console.error(e);
      setTestResult({
        success: false,
        message: `ล้มเหลวในการสร้างฐานข้อมูล: ${e.message}`
      });
      Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: `ล้มเหลวในการสร้างฐานข้อมูล: ${e.message}`,
        icon: 'error',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#ef4444',
      });
    } finally {
      setIsInitializing(false);
    }
  };

  const handleSetDefaultGasUrl = () => {
    setLocalWebAppUrl(DEFAULT_PRODUCTION_GAS_URL);
    setLocalMode('gas');
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'info',
      title: 'กรอก Production Web App URL เริ่มต้นแล้ว',
      text: 'กดปุ่ม "บันทึกและทดสอบการเชื่อมต่อ" เพื่อเริ่มใช้งาน',
      showConfirmButton: false,
      timer: 2500,
      background: '#1e293b',
      color: '#f8fafc',
    });
  };

  const handleSaveConfig = async () => {
    const cleanUrl = sanitizeBaseGasUrl(localWebAppUrl);
    setLocalWebAppUrl(cleanUrl);

    setIsTesting(true);
    setTestResult(null);

    try {
      if (localMode === 'direct') {
        if (!accessToken) {
          throw new Error('กรุณาเข้าสู่ระบบ Google เพื่อเชื่อมต่อตรง');
        }
        if (!localSpreadsheetId) {
          throw new Error('กรุณาระบุ Spreadsheet ID');
        }
        const isValid = await googleSheetsDirect.validateSpreadsheet(localSpreadsheetId.trim(), accessToken);
        if (isValid) {
          onConfigChange({
            spreadsheetId: localSpreadsheetId.trim(),
            webAppUrl: cleanUrl,
            mode: localMode,
            lineToken: localLineToken.trim()
          });
          setTestResult({
            success: true,
            message: 'เชื่อมต่อตรงกับ Google Sheets สำเร็จ! ค้นพบโครงสร้างตารางครบถ้วน'
          });
          Swal.fire({
            title: 'เชื่อมต่อสำเร็จ!',
            text: 'ระบบทำการเชื่อมต่อและดึงข้อมูลจาก Google Sheets ได้โดยตรงเรียบร้อยแล้ว',
            icon: 'success',
            background: '#0f172a',
            color: '#f8fafc',
            confirmButtonColor: '#10b981',
          });
          onRefreshData();
        } else {
          setTestResult({
            success: false,
            message: 'เชื่อมต่อสำเร็จ แต่ไม่พบแผ่นงานที่จำเป็น (Trucks, Stations, Queue, Sessions)'
          });
          Swal.fire({
            title: 'โครงสร้างฐานข้อมูลไม่ครบถ้วน',
            text: 'เชื่อมต่อสำเร็จ แต่ไม่พบแผ่นงานที่จำเป็น กรุณากดสร้างฐานข้อมูลใหม่หรืออัปเดตแผ่นงาน',
            icon: 'warning',
            background: '#0f172a',
            color: '#f8fafc',
            confirmButtonColor: '#eab308',
          });
        }
      } else {
        if (!cleanUrl) {
          throw new Error('กรุณาระบุ Web App URL ของ Google Apps Script หรือกด "⚡ ใช้ URL เริ่มต้นของระบบ"');
        }
        const testUrl = `${cleanUrl}?action=getAll`;
        const res = await fetch(testUrl, { redirect: 'follow' });
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('ไม่พบ Web App Deployment นี้ (404 Not Found) กรุณาตรวจสอบว่า URL ลงท้ายด้วย /exec และตั้งค่า Who has access เป็น Anyone หรือกด "⚡ ใช้ URL เริ่มต้นของระบบ" ด้านบน');
          }
          throw new Error(`Google Apps Script API Error (${res.status})`);
        }
        const data = await res.json();
        if (data.success) {
          onConfigChange({
            spreadsheetId: localSpreadsheetId.trim(),
            webAppUrl: cleanUrl,
            mode: localMode,
            lineToken: localLineToken.trim()
          });
          setTestResult({
            success: true,
            message: 'เชื่อมต่อผ่าน Google Apps Script สำเร็จ! สามารถอ่านเขียนข้อมูลได้แล้ว'
          });
          Swal.fire({
            title: 'เชื่อมต่อผ่าน API สำเร็จ!',
            text: 'การตรวจสอบสิทธิ์เชื่อมต่อผ่าน Gateway ประสบความสำเร็จ บันทึกการตั้งค่าเรียบร้อยแล้ว',
            icon: 'success',
            background: '#0f172a',
            color: '#f8fafc',
            confirmButtonColor: '#10b981',
          });
          onRefreshData();
        } else {
          throw new Error(data.error || 'ล้มเหลวในการดึงข้อมูล');
        }
      }
    } catch (e: any) {
      console.error(e);
      setTestResult({
        success: false,
        message: `ล้มเหลวในการทดสอบการเชื่อมต่อ: ${e.message}`
      });
      Swal.fire({
        title: 'ล้มเหลวในการเชื่อมต่อ',
        text: e.message,
        icon: 'error',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#ef4444',
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (!isPasswordUnlocked) {
    return (
      <div className="max-w-md mx-auto my-12 animate-fade-in" id="gas-setup-lock-screen">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500"></div>
          
          <div className="text-center space-y-4">
            <div className="w-14 h-14 bg-slate-950 border border-slate-800 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <Lock className="w-6 h-6 animate-pulse" />
            </div>
            
            <div>
              <h2 className="text-base font-bold text-slate-100 font-sans">
                การป้องกันความปลอดภัยสูงสุด
              </h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                จำกัดสิทธิ์สำหรับผู้ดูแลระบบระดับสูงเท่านั้น เพื่อความปลอดภัยของสถาปัตยกรรมระบบและฐานข้อมูล กรุณากรอกรหัสรักษาความปลอดภัย 6 หลักเพื่อเข้าใช้งานเมนูนี้
              </p>
            </div>
          </div>

          <form onSubmit={handleUnlock} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                รหัสผ่านสำหรับเข้าถึง (6 หลัก) *
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  placeholder="กรอกรหัสผ่าน 6 หลักเพื่อปลดล็อก..."
                  value={inputPassword}
                  onChange={(e) => setInputPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-center tracking-widest font-mono text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              {unlockError && (
                <p className="text-[11px] text-rose-400 font-semibold text-center bg-rose-500/10 border border-rose-500/20 py-1.5 px-3 rounded-lg mt-1 animate-pulse">
                  ⚠️ {unlockError}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-500/10"
            >
              <Lock className="w-4 h-4" />
              ยืนยันการปลดล็อก
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="gas-setup-panel">
      {/* Configuration Header Card */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-3.5 md:p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3 md:mb-4">
          <h2 className="text-xs md:text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 truncate">
            <Database className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">ตั้งค่าการเชื่อมต่อฐานข้อมูล</span>
          </h2>
          <button
            onClick={handleLockMenu}
            className="px-2.5 py-1.5 bg-rose-600/10 hover:bg-rose-600 border border-rose-500/20 text-rose-400 hover:text-white rounded-lg text-[10px] md:text-xs font-bold font-mono transition-all flex items-center gap-1 shadow-sm shrink-0 cursor-pointer"
          >
            <Lock className="w-3 h-3" />
            <span>ล็อกตั้งค่า</span>
          </button>
        </div>
        <p className="hidden sm:block text-slate-400 text-xs mb-6 leading-relaxed font-mono">
          This system architecture runs on a <strong>Serverless + Real Database</strong> paradigm. 
          Use Google Sheets in your workspace as the relational storage layer via direct Sheet API calls or 
          enterprise Google Apps Script (GAS) Gateway pipelines.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => setLocalMode('direct')}
            className={`p-4 rounded-xl border text-left transition-all ${
              localMode === 'direct'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/10'
                : 'border-slate-800 text-slate-500 bg-slate-950 hover:bg-slate-900/50'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <KeyRound className={`w-4 h-4 ${localMode === 'direct' ? 'text-emerald-400' : 'text-slate-600'}`} />
              <span className="font-bold text-xs uppercase tracking-wider font-mono">Mode A: Google Sheets API (Direct Sync)</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed font-mono">
              Fast-track setup using native browser OAuth. No backend compiler or deployment steps needed.
            </p>
          </button>

          <button
            onClick={() => setLocalMode('gas')}
            className={`p-4 rounded-xl border text-left transition-all ${
              localMode === 'gas'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/10'
                : 'border-slate-800 text-slate-500 bg-slate-950 hover:bg-slate-900/50'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <Globe className={`w-4 h-4 ${localMode === 'gas' ? 'text-emerald-400' : 'text-slate-600'}`} />
              <span className="font-bold text-xs uppercase tracking-wider font-mono">Mode B: Google Apps Script REST Gateway</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed font-mono">
              Production-grade configuration. Acts as an isolated API server optimizing sheets transactions.
            </p>
          </button>
        </div>

        <div className="space-y-4">
          {localMode === 'direct' ? (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">
                GOOGLE SPREADSHEET ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="เช่น 1xAbCdEf..."
                  value={localSpreadsheetId}
                  onChange={(e) => setLocalSpreadsheetId(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none font-mono"
                />
                <button
                  onClick={handleCreateNewDatabase}
                  disabled={isInitializing}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded transition-all flex items-center gap-2 disabled:opacity-40"
                >
                  {isInitializing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  )}
                  สร้างฐานข้อมูลใหม่ใน Drive
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-2 font-mono">
                *Click "สร้างฐานข้อมูลใหม่ใน Drive" to automatically format and seed database schemas directly to your Google Workspace account.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  GOOGLE APPS SCRIPT WEB APP URL
                </label>
                <button
                  type="button"
                  onClick={handleSetDefaultGasUrl}
                  className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono transition-colors cursor-pointer"
                  title="ใส่ URL เริ่มต้นของระบบที่เชื่อมต่อ Google Sheets หลัก"
                >
                  <CloudLightning className="w-3 h-3" />
                  ⚡ ใช้ URL เริ่มต้นของระบบ
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={localWebAppUrl}
                  onChange={(e) => setLocalWebAppUrl(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={handleSetDefaultGasUrl}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded border border-slate-700 transition-all shrink-0 cursor-pointer"
                >
                  รีเซ็ตค่าเริ่มต้น
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-2 font-mono">
                *ต้องลงท้ายด้วย <code>/exec</code> เสมอ และใน Apps Script ตั้งค่า Deploy ให้ "Who has access" เป็น "Anyone (ทุกคน)"
              </p>
            </div>
          )}

          {/* LINE Notify Token integration */}
          <div className="pt-4 border-t border-slate-800">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">
              LINE NOTIFY TOKEN / API ACCESS (การตั้งค่าโทเค็นไลน์)
            </label>
            <input
              type="text"
              placeholder="กรอก LINE Notify Token (เช่น xXyYzZ...)"
              value={localLineToken}
              onChange={(e) => setLocalLineToken(e.target.value)}
              className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none font-mono"
            />
            <p className="text-[10px] text-slate-500 mt-1.5 font-mono">
              *ระบบจะทำการส่งข้อความแจ้งเตือนเข้าแชท LINE กลุ่มจริงทันทีเมื่อเริ่มชาร์จ, แบตเต็ม 100%, หรือเมื่อกดหยุดชาร์จ
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSaveConfig}
              disabled={isTesting}
              className="px-5 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-bold text-xs rounded transition-all flex items-center gap-2 disabled:opacity-40 shadow-sm"
            >
              {isTesting ? (
                <RefreshCw className="w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              )}
              บันทึกและทดสอบการเชื่อมต่อ
            </button>
          </div>

          {testResult && (
            <div
              className={`p-3.5 rounded border text-xs flex items-start gap-3 mt-4 font-mono ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-bold tracking-wider">{testResult.success ? 'CONNECTION_ESTABLISHED' : 'CONNECTION_FAILURE'}</p>
                <p className="mt-1 text-[11px] opacity-90 leading-relaxed">{testResult.message}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Deploy Steps & Code copying Card */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 shadow-sm">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <FileCode className="w-4 h-4 text-cyan-400" />
          รหัสติดตั้งสำหรับ Google Apps Script (PRODUCTION GATEWAY ENGINE)
        </h2>
        <div className="space-y-4">
          <div className="bg-slate-950 border border-slate-850 rounded p-4 text-[11px] text-slate-400 leading-relaxed font-mono">
            <p className="font-bold mb-2 text-slate-300">DEPLOYMENT PIPELINE STEPS:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Open your Google Sheet workbook in your browser</li>
              <li>Go to <strong>ส่วนขยาย (Extensions)</strong> &gt; <strong>Apps Script</strong></li>
              <li>Overwrite all source contents with the code snippet below</li>
              <li>Bind your Sheets spreadsheet ID into <code className="bg-slate-900 border border-slate-800 px-1 rounded text-emerald-400">SPREADSHEET_ID</code> on line 9</li>
              <li>Click <strong>การทำให้ใช้งานได้ (Deploy)</strong> &gt; <strong>การทำให้ใช้งานได้ใหม่ (New deployment)</strong></li>
              <li>Select type <strong>เว็บแอป (Web app)</strong></li>
              <li>Configure Execute as: "Me" and Access privilege: <strong>Everyone (ทุกคน)</strong></li>
              <li>Execute <strong>Deploy</strong>, copy Web App execution URL and paste into Mode B settings</li>
            </ol>
          </div>

          <div className="relative">
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded text-[10px] font-bold tracking-wider font-mono transition-all shadow-sm"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-3 text-emerald-400" />
                    COPIED
                  </>
                ) : (
                  <>
                    <Copy className="w-3" />
                    COPY CODE
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 bg-slate-950 border border-slate-850 text-slate-300 rounded text-[10px] font-mono overflow-x-auto max-h-[350px] leading-relaxed shadow-inner">
              <code>{googleAppsScriptCode}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
