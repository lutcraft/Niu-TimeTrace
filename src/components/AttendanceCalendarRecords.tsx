import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Edit3,
  AlertCircle,
  CheckCircle2,
  Download,
  Upload,
} from 'lucide-react';
import {
  AttendanceEvent,
  Workplace,
  DayStat,
  AppSettings,
  toDateKey,
  getDayHolidayInfo,
  formatDuration,
  formatHoursDecimal,
  formatTimeHHMM,
  startOfLocalDateMs,
} from '../core/overtimeEngine';

interface AttendanceCalendarRecordsProps {
  events: AttendanceEvent[];
  workplaces: Workplace[];
  stats: Record<string, DayStat>;
  settings: AppSettings;
  onAddEvent: (workplaceId: number, type: 'ENTER' | 'EXIT', timestamp: number) => void;
  onDeleteEvent: (id: number) => void;
  onDeleteDayEvents: (dateKey: string) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

export const AttendanceCalendarRecords: React.FC<AttendanceCalendarRecordsProps> = ({
  events,
  workplaces,
  stats,
  settings,
  onAddEvent,
  onDeleteEvent,
  onDeleteDayEvents,
  onExportCsv,
  onExportJson,
  onImportJson,
}) => {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1); // 1..12
  const [selectedDateKey, setSelectedDateKey] = useState<string>(toDateKey(Date.now()));
  const [filterMode, setFilterMode] = useState<'ALL' | 'OVERTIME' | 'ORPHAN'>('ALL');

  // Manual Entry Modal State
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [manualType, setManualType] = useState<'ENTER' | 'EXIT'>('ENTER');
  const [manualTime, setManualTime] = useState<string>('09:00');
  const [manualWpId, setManualWpId] = useState<number>(workplaces[0]?.id ?? 1);

  const workplaceNameMap = useMemo(() => {
    const m: Record<number, string> = {};
    for (const w of workplaces) m[w.id] = w.name;
    return m;
  }, [workplaces]);

  const handlePrevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  // Build calendar cells for current year-month
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    // Monday-based offset (0..6)
    const startOffset = (firstDay.getDay() + 6) % 7;
    const cells: Array<{ dateKey: string | null; dayNum: number | null }> = [];

    for (let i = 0; i < startOffset; i++) {
      cells.push({ dateKey: null, dayNum: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateKey: key, dayNum: d });
    }
    return cells;
  }, [year, month]);

  // Monthly aggregated stats
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthDayEntries = useMemo(() => {
    const entries = Object.values(stats)
      .filter((s) => s.dateKey.startsWith(monthPrefix))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

    if (filterMode === 'OVERTIME') {
      return entries.filter((s) => s.overtimeMs > 0);
    }
    if (filterMode === 'ORPHAN') {
      return entries.filter((s) => s.orphanEvents.length > 0);
    }
    return entries;
  }, [stats, monthPrefix, filterMode]);

  const selectedDayStat = stats[selectedDateKey];
  const selectedDayEvents = useMemo(() => {
    return events
      .filter((e) => toDateKey(e.timestamp) === selectedDateKey)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [events, selectedDateKey]);

  // Quick repair for an orphan event: if EXIT without ENTER, insert ENTER at 09:00 on the same day
  const handleQuickRepairOrphan = (orphan: AttendanceEvent) => {
    const dayStart = startOfLocalDateMs(toDateKey(orphan.timestamp));
    if (orphan.type === 'EXIT') {
      const repairEnterTs = dayStart + 9 * 3_600_000;
      onAddEvent(orphan.workplaceId, 'ENTER', repairEnterTs);
    } else {
      const repairExitTs = Math.min(dayStart + 18.5 * 3_600_000, dayStart + 86_340_000);
      onAddEvent(orphan.workplaceId, 'EXIT', repairExitTs);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Toolbar: Month Switcher + Data Backup/Export */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrevMonth}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            title="上个月"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {year} 年 {String(month).padStart(2, '0')} 月
          </span>
          <button
            onClick={handleNextMonth}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            title="下个月"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
            内置 2025–2027 国务院法定节假日与调休补班日历
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onExportCsv}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            导出月度对账单 (.CSV)
          </button>
          <button
            onClick={onExportJson}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            全量备份 (.JSON)
          </button>
          <label className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0">
            <Upload className="w-3.5 h-3.5" />
            恢复备份
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportJson(file);
              }}
            />
          </label>
        </div>
      </div>

      {/* Main Split: Left Calendar Grid (7 cols) + Right Selected Day Inspector & Monthly Ledger (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Calendar Matrix */}
        <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5">
          <div className="grid grid-cols-7 gap-1.5 mb-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                周{w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {calendarDays.map((cell, idx) => {
              if (!cell.dateKey || !cell.dayNum) {
                return <div key={`empty-${idx}`} className="h-20 rounded-lg bg-slate-50/40 dark:bg-slate-950/20" />;
              }

              const stat = stats[cell.dateKey];
              const info = getDayHolidayInfo(cell.dateKey);
              const isSelected = cell.dateKey === selectedDateKey;
              const hasOrphan = (stat?.orphanEvents.length ?? 0) > 0;
              const hasOt = (stat?.overtimeMs ?? 0) > 0;
              const hasWork = (stat?.workMs ?? 0) > 0;

              return (
                <button
                  key={cell.dateKey}
                  onClick={() => setSelectedDateKey(cell.dateKey!)}
                  className={`h-20 p-2 rounded-lg border text-left flex flex-col justify-between transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30'
                      : hasOt
                      ? 'border-slate-200 dark:border-slate-800 bg-amber-50/30 dark:bg-amber-950/15 hover:border-slate-300'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {cell.dayNum}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {info.holidayName
                        ? info.holidayName
                        : info.adjustedWorkday
                        ? '补班'
                        : info.restDay
                        ? '休'
                        : ''}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    {hasWork && (
                      <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        在岗 {formatHoursDecimal(stat!.workMs)}
                      </div>
                    )}
                    {hasOt && (
                      <div className="text-[11px] font-mono font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                        +{formatHoursDecimal(stat!.overtimeMs)} 加班
                      </div>
                    )}
                    {hasOrphan && (
                      <div className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                        孤立记录 ({stat!.orphanEvents.length})
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              净工时计算规则：已{settings.lunchBreakDeductEnabled ? `自动扣除午休时段 (${settings.lunchStartTime}–${settings.lunchEndTime})` : '关闭午休扣除'}
            </span>
            <span>点击任意日期查看/补录当日进出流水</span>
          </div>
        </div>

        {/* Right Column: Selected Day Inspector + Monthly Detail Table */}
        <div className="lg:col-span-5 space-y-6">
          {/* Selected Day Card */}
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {selectedDateKey} 考勤明细
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {selectedDayStat
                    ? `净在岗 ${formatDuration(selectedDayStat.workMs)} · 午休核减 ${formatDuration(
                        selectedDayStat.lunchDeductedMs
                      )} · 加班 ${formatDuration(selectedDayStat.overtimeMs)}`
                    : '当日暂无在岗记录'}
                </p>
              </div>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                补录打卡
              </button>
            </div>

            {/* Manual Add Drawer */}
            {showAddForm && (
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  为 {selectedDateKey} 手动补录一条进出围栏事件
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value as 'ENTER' | 'EXIT')}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    <option value="ENTER">上班 (ENTER)</option>
                    <option value="EXIT">下班 (EXIT)</option>
                  </select>
                  <input
                    type="time"
                    value={manualTime}
                    onChange={(e) => setManualTime(e.target.value)}
                    className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                  <select
                    value={manualWpId}
                    onChange={(e) => setManualWpId(Number(e.target.value))}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 truncate"
                  >
                    {workplaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-1 text-xs text-slate-600 dark:text-slate-400 cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      const [hh, mm] = manualTime.split(':').map(Number);
                      const ts = startOfLocalDateMs(selectedDateKey) + ((hh || 0) * 60 + (mm || 0)) * 60_000;
                      onAddEvent(manualWpId, manualType, ts);
                      setShowAddForm(false);
                    }}
                    className="px-3 py-1 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md cursor-pointer"
                  >
                    确认写入
                  </button>
                </div>
              </div>
            )}

            {/* Orphan Diagnostic Warning */}
            {selectedDayStat && selectedDayStat.orphanEvents.length > 0 && (
              <div className="p-3 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    检测到未配对孤立打卡 ({selectedDayStat.orphanEvents.length} 条)
                  </span>
                </div>
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  原版 v1.1.0 会静默忽略无配对的 EXIT 记录导致当天工时为 0。点击下方按钮可一键智能补齐配对卡：
                </p>
                {selectedDayStat.orphanEvents.map((orph) => (
                  <div key={orph.id} className="flex items-center justify-between text-xs pt-1">
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {orph.type === 'EXIT' ? '孤立下班卡' : '连续上班卡'} @ {formatTimeHHMM(orph.timestamp)}
                    </span>
                    <button
                      onClick={() => handleQuickRepairOrphan(orph)}
                      className="px-2.5 py-1 text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white rounded-md cursor-pointer"
                    >
                      一键智能补齐配对
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Event List */}
            {selectedDayEvents.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                该日期尚无打卡流水，点击右上角「补录打卡」可手动添加
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {selectedDayEvents.map((ev) => (
                  <div key={ev.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-semibold ${
                          ev.type === 'ENTER'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {ev.type === 'ENTER' ? '进入围栏 (上班)' : '离开围栏 (下班)'}
                      </span>
                      <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 font-medium">
                        {formatTimeHHMM(ev.timestamp)}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
                        · {workplaceNameMap[ev.workplaceId] || '默认办公点'}
                        {ev.manual ? ' · 手动补录' : ''}
                      </span>
                    </div>
                    <button
                      onClick={() => onDeleteEvent(ev.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                      title="删除此条记录"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Monthly Ledger Filter & List */}
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                当月打卡汇总台账 ({monthDayEntries.length} 天)
              </h3>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  onClick={() => setFilterMode('ALL')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    filterMode === 'ALL'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  全部
                </button>
                <button
                  onClick={() => setFilterMode('OVERTIME')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    filterMode === 'OVERTIME'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  仅加班
                </button>
                <button
                  onClick={() => setFilterMode('ORPHAN')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    filterMode === 'ORPHAN'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  异常孤立
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/70 max-h-[260px] overflow-y-auto">
              {monthDayEntries.map((item) => (
                <div
                  key={item.dateKey}
                  onClick={() => setSelectedDateKey(item.dateKey)}
                  className="py-2.5 flex items-center justify-between text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 rounded-lg"
                >
                  <div>
                    <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                      {item.dateKey}{' '}
                      <span className="text-slate-500 font-sans font-normal">
                        · {item.holidayName || (item.restDay ? '周末休息日' : '工作日')}
                      </span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                      {item.firstInMs ? formatTimeHHMM(item.firstInMs) : '--:--'} –{' '}
                      {item.lastOutMs ? formatTimeHHMM(item.lastOutMs) : '--:--'} · 净在岗{' '}
                      {formatHoursDecimal(item.workMs)}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    {item.overtimeMs > 0 ? (
                      <div className="font-semibold text-amber-600 dark:text-amber-400">
                        +{formatHoursDecimal(item.overtimeMs)} 加班
                      </div>
                    ) : (
                      <div className="text-slate-400">正常工时</div>
                    )}
                    {item.overtimeMs > 0 && (
                      <div className="text-[11px] text-slate-500">
                        ≈ ¥{Math.round(item.estimatedOvertimePay)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
