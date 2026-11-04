import React, { useState } from 'react';
import { UserItem } from '../data/users';
import { Plus, Edit2, Trash2, X, RefreshCw, Check, ShieldCheck, UserPlus, Info } from 'lucide-react';
import Swal from 'sweetalert2';

interface UsersListProps {
  users: UserItem[];
  onAddUser: (user: UserItem) => Promise<void>;
  onUpdateUser: (user: UserItem) => Promise<void>;
  onDeleteUser: (employeeId: string) => Promise<void>;
}

export default function UsersList({ users, onAddUser, onUpdateUser, onDeleteUser }: UsersListProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Form State
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'Driver' | 'Admin' | 'Supervisor'>('Driver');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openModal = (user?: UserItem) => {
    setErrorMsg(null);
    if (user) {
      setEditingUser(user);
      setEmployeeId(user.employeeId);
      setName(user.name);
      setRole((user.role as any) || 'Driver');
    } else {
      setEditingUser(null);
      setEmployeeId('');
      setName('');
      setRole('Driver');
    }
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setEditingUser(null);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!employeeId || !name) {
      setErrorMsg('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    // Validate 8-digit
    if (employeeId.length !== 8 || !/^\d+$/.test(employeeId)) {
      setErrorMsg('รหัสพนักงานต้องเป็นตัวเลข 8 หลักเท่านั้น');
      return;
    }

    setIsLoading(true);
    try {
      const userData: UserItem = {
        employeeId,
        name,
        role,
      };

      if (editingUser) {
        await onUpdateUser(userData);
        Swal.fire({
          title: 'สำเร็จ!',
          text: 'แก้ไขข้อมูลพนักงานสำเร็จ',
          icon: 'success',
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#10b981',
        });
      } else {
        // Check duplication
        if (users.some(u => u.employeeId === employeeId)) {
          setErrorMsg('รหัสพนักงานนี้มีอยู่ในระบบแล้ว');
          setIsLoading(false);
          return;
        }
        await onAddUser(userData);
        Swal.fire({
          title: 'สำเร็จ!',
          text: 'เพิ่มพนักงานใหม่สำเร็จ',
          icon: 'success',
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#10b981',
        });
      }
      closeModal();
    } catch (err: any) {
      setErrorMsg(`ล้มเหลวในการบันทึกข้อมูล: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (empId: string, empName: string) => {
    const result = await Swal.fire({
      title: 'คุณต้องการลบพนักงานหรือไม่?',
      text: `คุณต้องการลบพนักงาน "${empName}" (รหัส: ${empId}) หรือไม่? ข้อมูลจะถูกลบออกจากฐานข้อมูล Google Sheets เสมือนจริง`,
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
        await onDeleteUser(empId);
        Swal.fire({
          title: 'ลบสำเร็จ!',
          text: 'ลบข้อมูลพนักงานขับรถเรียบร้อยแล้ว',
          icon: 'success',
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#10b981',
        });
      } catch (err: any) {
        Swal.fire({
          title: 'เกิดข้อผิดพลาด',
          text: `ล้มเหลวในการลบพนักงาน: ${err.message}`,
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

  return (
    <div className="space-y-3 md:space-y-4" id="users-list-panel">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-2 bg-slate-900 p-3 md:p-4 rounded-xl border border-slate-800">
        <div className="min-w-0">
          <h2 className="text-xs md:text-lg font-bold text-white flex items-center gap-2 truncate">
            <ShieldCheck className="w-4 h-4 md:w-5 md:h-5 text-emerald-400 shrink-0" />
            <span className="truncate">พนักงานและสิทธิ์ระบบ ({users.length} คน)</span>
          </h2>
          <p className="hidden sm:block text-slate-400 text-xs mt-1">
            สามารถเพิ่ม ลบ หรือแก้ไขข้อมูลพนักงานและหัวหน้างานได้จากตรงนี้ ข้อมูลจะบันทึกกลับไปยังชีท "Users" อัตโนมัติ
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/10 shrink-0 active:scale-95"
        >
          <UserPlus className="w-4 h-4" />
          <span>เพิ่มพนักงาน</span>
        </button>
      </div>

      {/* Info Card (Desktop only) */}
      <div className="hidden sm:flex bg-slate-900/50 border border-slate-800/60 rounded-xl p-3 gap-3 text-xs text-emerald-400/90 font-medium">
        <Info className="w-4 h-4 shrink-0 text-emerald-400" />
        <div>
          <p>คุณสามารถตั้งรหัสพนักงานเป็นระดับ<strong>หัวหน้างาน / แอดมิน (Admin / Supervisor)</strong> ได้ ซึ่งหัวหน้างานเหล่านี้จะสามารถล็อกอินเข้าสู่ระบบหลังบ้านเพื่อจัดการข้อมูลและดูประวัติการชาร์จผ่านรหัสพนักงาน 8 หลักของตนเอง</p>
        </div>
      </div>

      {/* Mobile Card List (< 768px) */}
      <div className="md:hidden space-y-2">
        {users.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs">
            ไม่พบข้อมูลพนักงานในฐานข้อมูล
          </div>
        ) : (
          users.map((user) => (
            <div key={user.employeeId} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-100 truncate">{user.name}</span>
                  {user.role === 'Admin' || user.role === 'Supervisor' ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 shrink-0">
                      <ShieldCheck className="w-3 h-3" />
                      Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-semibold rounded bg-slate-800 text-slate-400 border border-slate-700/60 shrink-0">
                      Driver
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-mono text-emerald-400 font-bold">
                  รหัสพนักงาน: {user.employeeId}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => openModal(user)}
                  className="p-2 bg-slate-800 hover:bg-emerald-950 hover:text-emerald-400 text-slate-300 rounded-lg transition-all cursor-pointer"
                  title="แก้ไขพนักงาน"
                >
                  <Edit2 className="w-3.5 h-3.5 text-emerald-400" />
                </button>
                <button
                  onClick={() => handleDelete(user.employeeId, user.name)}
                  className="p-2 bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 rounded-lg transition-all cursor-pointer"
                  title="ลบพนักงาน"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Data Table (>= 768px) */}
      <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800 font-mono">
                <th className="p-2 md:p-4 w-32 whitespace-nowrap">รหัสพนักงาน (8 หลัก)</th>
                <th className="p-2 md:p-4 whitespace-nowrap">ชื่อ - นามสกุล</th>
                <th className="p-2 md:p-4 w-44 whitespace-nowrap">สิทธิ์การใช้งาน (Role)</th>
                <th className="p-2 md:p-4 w-28 text-right whitespace-nowrap">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500 font-medium whitespace-nowrap">
                    ไม่พบข้อมูลพนักงานในฐานข้อมูล
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.employeeId} className="hover:bg-slate-850/40 transition-colors">
                    <td className="p-2 md:p-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                      {user.employeeId}
                    </td>
                    <td className="p-2 md:p-4 font-semibold text-slate-200 whitespace-nowrap">
                      {user.name}
                    </td>
                    <td className="p-2 md:p-4 whitespace-nowrap">
                      {user.role === 'Admin' || user.role === 'Supervisor' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold rounded-lg bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          หัวหน้างาน (Supervisor / Admin)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold rounded-lg bg-slate-800 text-slate-400 border border-slate-700/60">
                          พนักงานขับรถ (Driver)
                        </span>
                      )}
                    </td>
                    <td className="p-2 md:p-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openModal(user)}
                          className="p-1.5 bg-slate-800 hover:bg-emerald-950 hover:text-emerald-400 text-slate-400 rounded-lg transition-all cursor-pointer"
                          title="แก้ไขพนักงาน"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(user.employeeId, user.name)}
                          className="p-1.5 bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 rounded-lg transition-all cursor-pointer"
                          title="ลบพนักงาน"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over or Bottom Sheet Modal Popup */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border-t sm:border border-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-3.5 sm:p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white text-sm">
                {editingUser ? 'แก้ไขข้อมูลพนักงานขับรถ' : 'เพิ่มพนักงานขับรถใหม่'}
              </h3>
              <button
                onClick={closeModal}
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
              {errorMsg && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-2">
                  <X className="w-4 h-4 shrink-0 text-rose-400" />
                  <span className="font-semibold">{errorMsg}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  รหัสพนักงาน (8 หลัก) *
                </label>
                <input
                  type="text"
                  required
                  maxLength={8}
                  placeholder="เช่น 55019283"
                  disabled={!!editingUser}
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors font-mono disabled:opacity-50 min-h-[42px]"
                />
                {editingUser && (
                  <p className="text-[10px] text-slate-500 mt-1 font-sans">ไม่สามารถแก้ไขรหัสพนักงานได้ หากต้องการเปลี่ยนรหัสโปรดลบแล้วสร้างใหม่</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  ชื่อ - นามสกุล *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น สมศักดิ์ รักงาน"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors min-h-[42px]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  สิทธิ์การใช้งาน (Permissions / Role) *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors min-h-[42px]"
                >
                  <option value="Driver">พนักงานขับรถ (Driver)</option>
                  <option value="Admin">ผู้ดูแลระบบ/หัวหน้างาน (Admin / Supervisor)</option>
                </select>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer min-h-[42px]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[42px]"
                >
                  {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingUser ? 'บันทึกการแก้ไข' : 'เพิ่มพนักงาน'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
