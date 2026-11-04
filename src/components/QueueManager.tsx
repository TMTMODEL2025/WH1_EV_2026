import React, { useState } from 'react';
import { EVTruck, QueueItem } from '../types/ev';
import { ListOrdered, Plus, Trash2, ArrowUpRight, Clock, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';
import Swal from 'sweetalert2';

interface QueueManagerProps {
  queue: QueueItem[];
  trucks: EVTruck[];
  onAddQueue: (truckId: string, priority: 'High' | 'Normal', requestedType: 'AC' | 'DC') => Promise<void>;
  onCancelQueue: (id: string) => Promise<void>;
}

export default function QueueManager({ queue, trucks, onAddQueue, onCancelQueue }: QueueManagerProps) {
  const [selectedTruckId, setSelectedTruckId] = useState('');
  const [priority, setPriority] = useState<'High' | 'Normal'>('Normal');
  const [requestedType, setRequestedType] = useState<'AC' | 'DC'>('DC');
  const [isLoading, setIsLoading] = useState(false);

  // Filter trucks that can join the queue (Must be Available and not already in the active queue)
  const activeQueueTruckIds = queue.filter(q => q.status === 'Waiting').map(q => q.truckId);
  const eligibleTrucks = trucks.filter(
    t => t.status === 'Available' && !activeQueueTruckIds.includes(t.id)
  );

  const handleAddQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTruckId) {
      Swal.fire({
        title: 'คำเตือน',
        text: 'กรุณาเลือกรถหัวลากเพื่อต่อคิว',
        icon: 'warning',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#eab308',
      });
      return;
    }

    setIsLoading(true);
    try {
      await onAddQueue(selectedTruckId, priority, requestedType);
      Swal.fire({
        title: 'จัดสรรคิวสำเร็จ!',
        text: `จัดสรรคิวสำหรับรถหัวลาก ${selectedTruckId} สำเร็จแล้ว`,
        icon: 'success',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#10b981',
      });
      setSelectedTruckId('');
      setPriority('Normal');
      setRequestedType('DC');
    } catch (err: any) {
      Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: `ล้มเหลวในการจัดสรรคิวชาร์จด่วน: ${err.message}`,
        icon: 'error',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonColor: '#ef4444',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelQueue = async (id: string) => {
    const result = await Swal.fire({
      title: 'คุณต้องการยกเลิกคิวนี้ใช่หรือไม่?',
      text: 'การเปลี่ยนแปลงนี้จะลบคิวและบันทึกกลับลงชีททันที',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ใช่, ยกเลิกคิว',
      cancelButtonText: 'กลับ',
      background: '#0f172a',
      color: '#f8fafc',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b'
    });

    if (result.isConfirmed) {
      setIsLoading(true);
      try {
        await onCancelQueue(id);
        Swal.fire({
          title: 'ยกเลิกคิวสำเร็จ!',
          text: 'คิวนี้ได้รับการยกเลิกเรียบร้อยแล้ว',
          icon: 'success',
          background: '#0f172a',
          color: '#f8fafc',
          confirmButtonColor: '#10b981',
        });
      } catch (err: any) {
        Swal.fire({
          title: 'เกิดข้อผิดพลาด',
          text: `ล้มเหลวในการยกเลิกคิวชาร์จ: ${err.message}`,
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

  const activeQueues = queue.filter(q => q.status === 'Waiting');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left 2 cols: Active Queue Table */}
      <div className="lg:col-span-2 bg-slate-900 rounded-xl border border-slate-800 p-5 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-emerald-400" />
                คิวรถชาร์จพลังงานไฟฟ้ารอจัดสรร (ACTIVE CHARGING QUEUE)
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5 font-mono">Prioritized tractor queue for high-capacity industrial charger allocation</p>
            </div>
            <span className="text-[10px] bg-slate-950 text-slate-400 border border-slate-800 px-2.5 py-0.5 rounded font-mono font-bold">
              QUEUED: {activeQueues.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  <th className="py-2 px-3 whitespace-nowrap">Q-ID</th>
                  <th className="py-2 px-3 whitespace-nowrap">TRACTOR</th>
                  <th className="py-2 px-3 whitespace-nowrap">PRIORITY</th>
                  <th className="py-2 px-3 whitespace-nowrap">REQ_TYPE</th>
                  <th className="py-2 px-3 whitespace-nowrap">TIME</th>
                  <th className="py-2 px-3 whitespace-nowrap">WAITING</th>
                  <th className="py-2 px-3 text-right whitespace-nowrap">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {activeQueues.length > 0 ? (
                  activeQueues.map((q, idx) => {
                    const truck = trucks.find(t => t.id === q.truckId);
                    const waitTime = Math.round((Date.now() - new Date(q.requestTime).getTime()) / 60000);

                    return (
                      <tr key={`${q.id}-${idx}`} className="text-xs hover:bg-slate-950/40 transition-all font-mono">
                        <td className="py-3.5 px-3 font-bold text-emerald-400 whitespace-nowrap">{q.id}</td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <div>
                            <span className="font-bold text-slate-200">{q.truckId}</span>
                            <span className="text-[10px] text-slate-500 block">
                              {truck?.model} ({truck?.licensePlate})
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                              q.priority === 'High'
                                ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400 animate-pulse'
                                : 'bg-slate-950 border border-slate-800 text-slate-400'
                            }`}
                          >
                            {q.priority === 'High' ? 'HIGH' : 'NORMAL'}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                            {q.requestedChargerType} FAST
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-[10px] text-slate-500 whitespace-nowrap">
                          {new Date(q.requestTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}
                        </td>
                        <td className="py-3.5 px-3 text-xs font-semibold text-slate-400 whitespace-nowrap">
                          {waitTime}m
                        </td>
                        <td className="py-3.5 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleCancelQueue(q.id)}
                            className="p-1 hover:bg-rose-950/40 rounded text-slate-500 hover:text-rose-400 transition-all cursor-pointer"
                            title="ยกเลิกคิวชาร์จด่วน"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-500 text-xs font-mono whitespace-nowrap">
                      <div className="flex flex-col items-center gap-2">
                        <ShieldCheck className="w-8 h-8 text-emerald-500/60" />
                        <span className="font-bold uppercase tracking-wider">QUEUE_CLEAR_NOMINAL</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right 1 col: Add Queue Form */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 shadow-sm h-full">
        <h3 className="text-sm font-bold text-white mb-1 uppercase tracking-wider flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-400" />
          จัดสรรลำดับคิวใหม่ (ALLOCATE QUEUE)
        </h3>
        <p className="text-[11px] text-slate-500 mb-6 font-mono">Push tractor requests to priority queue buffers</p>

        <form onSubmit={handleAddQueue} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">
              เลือกรถที่ต้องการเพิ่มเข้าคิว
            </label>
            <select
              value={selectedTruckId}
              onChange={(e) => setSelectedTruckId(e.target.value)}
              required
              className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none"
            >
              <option value="" disabled>-- กรุณาเลือกรถหัวลาก --</option>
              {eligibleTrucks.map(t => (
                <option key={t.id} value={t.id}>
                  {t.id} - แบต: {t.currentSOC}% ({t.model})
                </option>
              ))}
            </select>
            {eligibleTrucks.length === 0 && (
              <p className="text-[10px] text-amber-400 font-medium mt-2 flex items-start gap-1 font-mono">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                NO_TRACTORS_ELIGIBLE_FOR_QUEUE
              </p>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">
              ระดับความสำคัญในการคอย (PRIORITY)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPriority('Normal')}
                className={`py-1.5 px-3 rounded border font-mono font-bold text-[10px] uppercase transition-all ${
                  priority === 'Normal'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : 'border-slate-800 text-slate-500 bg-slate-950 hover:bg-slate-900'
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setPriority('High')}
                className={`py-1.5 px-3 rounded border font-mono font-bold text-[10px] uppercase transition-all ${
                  priority === 'High'
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                    : 'border-slate-800 text-slate-500 bg-slate-950 hover:bg-slate-900'
                }`}
              >
                High Priority
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">
              ชนิดระบบหัวชาร์จที่ร้องขอ (CHARGER TYPE)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRequestedType('DC')}
                className={`py-1.5 px-3 rounded border font-mono font-bold text-[10px] uppercase transition-all ${
                  requestedType === 'DC'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : 'border-slate-800 text-slate-500 bg-slate-950 hover:bg-slate-900'
                }`}
              >
                DC Fast
              </button>
              <button
                type="button"
                onClick={() => setRequestedType('AC')}
                className={`py-1.5 px-3 rounded border font-mono font-bold text-[10px] uppercase transition-all ${
                  requestedType === 'AC'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : 'border-slate-800 text-slate-500 bg-slate-950 hover:bg-slate-900'
                }`}
              >
                AC Normal
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !selectedTruckId}
            className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded transition-all flex items-center justify-center gap-2 disabled:opacity-40 shadow mt-4"
          >
            {isLoading && <RefreshCw className="w-3 animate-spin" />}
            ออกบัตรคิวและจองช่อง
          </button>
        </form>
      </div>
    </div>
  );
}
