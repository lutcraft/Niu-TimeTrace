import React, { useMemo, useState } from 'react';
import {
  DayStat,
  AppSettings,
  formatDuration,
  formatHoursDecimal,
  toDateKey,
  startOfLocalDateMs,
} from '../core/overtimeEngine';

interface StatsDashboardProps {
  stats: Record<string, DayStat>;
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
}

type RangeMode = 'MONTH' | 'DAYS30' | 'YEAR';

export const StatsDashboard: React.FC<StatsDashboardProps> = ({
  stats,
  settings,
  onUpdateSettings,
}) => {
  const [rangeMode, setRangeMode] = useState<RangeMode>('MONTH');
  const nowMs = Date.now();
  const todayKey = toDateKey(nowMs);
  const [curY, curM] = todayKey.split('-').map(Number);

  const filteredDays = useMemo(() => {
    const all = Object.values(stats);
    if (rangeMode === 'MONTH') {
      const prefix = `${curY}-${String(curM).padStart(2, '0')}`;
      return all.filter((d) => d.dateKey.startsWith(prefix));
    }
    if (rangeMode === 'DAYS30') {
      const cutoff = startOfLocalDateMs(todayKey) - 29 * 86_400_000;
      return all.filter((d) => startOfLocalDateMs(d.dateKey) >= cutoff);
    }
    const yearPrefix = `${curY}-`;
    return all.filter((d) => d.dateKey.startsWith(yearPrefix));
  }, [stats, rangeMode, curY, curM, todayKey]);

  const summary = useMemo(() => {
    let totalWorkMs = 0;
    let totalGrossMs = 0;
    let totalLunchDeductedMs = 0;
    let totalOvertimeMs = 0;
    let workdayOtMs = 0;
    let restDayOtMs = 0;
    let otDays = 0;
    let workDays = 0;
    let totalEstimatedPay = 0;

    for (const d of filteredDays) {
      if (d.workMs > 0) workDays++;
      totalWorkMs += d.workMs;
      totalGrossMs += d.grossWorkMs;
      totalLunchDeductedMs += d.lunchDeductedMs;
      totalOvertimeMs += d.overtimeMs;
      totalEstimatedPay += d.estimatedOvertimePay;
      if (d.overtimeMs > 0) {
        otDays++;
        if (d.restDay) restDayOtMs += d.overtimeMs;
        else workdayOtMs += d.overtimeMs;
      }
    }

    const avgOtMs = otDays > 0 ? totalOvertimeMs / otDays : 0;
    return {
      totalWorkMs,
      totalGrossMs,
      totalLunchDeductedMs,
      totalOvertimeMs,
      workdayOtMs,
      restDayOtMs,
      otDays,
      workDays,
      avgOtMs,
      totalEstimatedPay,
    };
  }, [filteredDays]);

  // 12-week trend (Monday-based weeks)
  const weeklyTrend = useMemo(() => {
    const todayDate = new Date(startOfLocalDateMs(todayKey));
    const dow = (todayDate.getDay() + 6) % 7; // 0=Mon..6=Sun
    const thisMondayMs = todayDate.getTime() - dow * 86_400_000;

    const buckets: Array<{
      label: string;
      workdayOtHours: number;
      restOtHours: number;
      totalOtHours: number;
    }> = [];

    for (let i = 11; i >= 0; i--) {
      const ws = thisMondayMs - i * 7 * 86_400_000;
      const we = ws + 7 * 86_400_000;
      const dObj = new Date(ws);
      const label = `${dObj.getMonth() + 1}/${dObj.getDate()}`;

      let wOt = 0;
      let rOt = 0;
      for (const stat of Object.values(stats)) {
        const dayMs = startOfLocalDateMs(stat.dateKey);
        if (dayMs >= ws && dayMs < we) {
          if (stat.restDay) rOt += stat.overtimeMs / 3_600_000;
          else wOt += stat.overtimeMs / 3_600_000;
        }
      }
      buckets.push({
        label,
        workdayOtHours: Number(wOt.toFixed(1)),
        restOtHours: Number(rOt.toFixed(1)),
        totalOtHours: Number((wOt + rOt).toFixed(1)),
      });
    }
    return buckets;
  }, [stats, todayKey]);

  const maxWeeklyHours = Math.max(4, ...weeklyTrend.map((b) => b.totalOtHours));

  return (
    <div className="space-y-6">
      {/* Range Filter Bar & Lunch Deduction Quick Switch */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {(
            [
              { id: 'MONTH', label: '本月统计' },
              { id: 'DAYS30', label: '近 30 天' },
              { id: 'YEAR', label: '本年累计' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setRangeMode(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                rangeMode === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.lunchBreakDeductEnabled}
            onChange={(e) => onUpdateSettings({ lunchBreakDeductEnabled: e.target.checked })}
            className="w-4 h-4 accent-emerald-600 rounded"
          />
          <span>
            启用 v1.2 午休重叠自动核减 ({settings.lunchStartTime}–{settings.lunchEndTime}) · 已过滤虚增工时{' '}
            <strong className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatHoursDecimal(summary.totalLunchDeductedMs)}
            </strong>
          </span>
        </label>
      </div>

      {/* 4-Column Metric Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">加班总时长 (净核算)</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1">
            {formatDuration(summary.totalOvertimeMs)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-mono tabular-nums">
            共 {summary.otDays} 天产生加班 · 日均 {formatHoursDecimal(summary.avgOtMs)}
          </div>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">工作日延时 vs 休息日加班</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {formatHoursDecimal(summary.workdayOtMs)} / {formatHoursDecimal(summary.restDayOtMs)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            超 {settings.standardHours}h 标准工时 vs 周末/节假日全天
          </div>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">净在岗总工时 (出勤 {summary.workDays} 天)</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {formatDuration(summary.totalWorkMs)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-mono tabular-nums">
            毛在岗 {formatHoursDecimal(summary.totalGrossMs)} · 核减午休 {formatHoursDecimal(summary.totalLunchDeductedMs)}
          </div>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">折算加班薪资估值 (v1.2 新增)</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
            ¥{Math.round(summary.totalEstimatedPay).toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-mono tabular-nums">
            时薪 ¥{settings.hourlyBaseWage} · {settings.workdayOvertimeMultiplier}x / {settings.weekendOvertimeMultiplier}x / {settings.holidayOvertimeMultiplier}x
          </div>
        </div>
      </div>

      {/* 12-Week Stacked Overtime Bar Chart */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              近 12 周加班时长结构趋势 (区分工作日延时与休息日全天)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              对比原版 StatsScreen 单色柱状图，v1.2 拆分为「平时延时加班」与「周末/法定节假日加班」双层堆叠视图
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block" /> 工作日延时加班
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block" /> 周末/节假日加班
            </span>
          </div>
        </div>

        <div className="h-52 pt-6 pb-2 px-2 flex items-end gap-2 sm:gap-4 border-b border-slate-200 dark:border-slate-800">
          {weeklyTrend.map((w, idx) => {
            const workdayPct = (w.workdayOtHours / maxWeeklyHours) * 100;
            const restPct = (w.restOtHours / maxWeeklyHours) * 100;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mb-1">
                  {w.totalOtHours > 0 ? `${w.totalOtHours}h` : ''}
                </div>
                <div className="w-full max-w-[34px] flex flex-col justify-end rounded-t-md overflow-hidden bg-slate-100 dark:bg-slate-800/40 h-36">
                  {w.restOtHours > 0 && (
                    <div
                      style={{ height: `${Math.max(4, restPct)}%` }}
                      className="w-full bg-amber-500 transition-transform"
                      title={`周末/假日加班: ${w.restOtHours}h`}
                    />
                  )}
                  {w.workdayOtHours > 0 && (
                    <div
                      style={{ height: `${Math.max(4, workdayPct)}%` }}
                      className="w-full bg-emerald-600 transition-transform"
                      title={`工作日加班: ${w.workdayOtHours}h`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 sm:gap-4 px-2">
          {weeklyTrend.map((w, idx) => (
            <div
              key={idx}
              className="flex-1 text-center text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400"
            >
              {w.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
