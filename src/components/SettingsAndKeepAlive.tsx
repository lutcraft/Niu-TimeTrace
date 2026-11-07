import React, { useState } from 'react';
import { Smartphone, BatteryCharging, ShieldAlert, Sliders, RotateCcw } from 'lucide-react';
import { AppSettings } from '../core/overtimeEngine';

interface SettingsAndKeepAliveProps {
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  onResetDemoData: () => void;
}

interface RomGuide {
  brand: string;
  osName: string;
  autostartPath: string;
  batteryPath: string;
  lockRecentTip: string;
  adbCommand: string;
}

const ROM_GUIDES: RomGuide[] = [
  {
    brand: '小米 / 红米 (Xiaomi / Redmi)',
    osName: 'HyperOS / MIUI',
    autostartPath: '设置 → 应用设置 → 应用管理 → 牛马时录 → 开启「后台自启动」',
    batteryPath: '设置 → 应用设置 → 应用管理 → 牛马时录 → 省电策略 → 选择「无限制」',
    lockRecentTip: '打开多任务界面，长按或下拉「牛马时录」卡片，点击「锁图标」锁定后台',
    adbCommand: 'adb shell dumpsys deviceidle whitelist +com.worktime.trace',
  },
  {
    brand: '华为 / 荣耀 (Huawei / Honor)',
    osName: 'HarmonyOS / MagicOS',
    autostartPath: '设置 → 应用和服务 → 应用启动管理 → 找到「牛马时录」关闭自动管理',
    batteryPath: '在弹窗中手动开启「允许自启动」「允许关联启动」「允许后台活动」全部三项',
    lockRecentTip: '进入最近任务，向下滑动「牛马时录」卡片使其顶部出现锁标志',
    adbCommand: 'adb shell cmd appops set com.worktime.trace RUN_ANY_IN_BACKGROUND allow',
  },
  {
    brand: 'OPPO / 一加 / 真我 (OnePlus / Realme)',
    osName: 'ColorOS',
    autostartPath: '设置 → 应用 → 自启动管理 → 允许「牛马时录」自启动',
    batteryPath: '设置 → 电池 → 应用耗电管理 → 牛马时录 → 开启「允许完全后台行为」',
    lockRecentTip: '多任务视图点击卡片右上角「⋮」菜单，选择「锁定」',
    adbCommand: 'adb shell dumpsys deviceidle whitelist +com.worktime.trace',
  },
  {
    brand: 'vivo / iQOO',
    osName: 'OriginOS',
    autostartPath: '设置 → 应用与权限 → 权限管理 → 权限 → 自启动 → 允许「牛马时录」',
    batteryPath: '设置 → 电池 → 后台耗电管理 → 牛马时录 → 选择「允许后台高耗电」',
    lockRecentTip: '上滑调出后台多任务，点击应用名称旁下拉箭头选择「锁定」',
    adbCommand: 'adb shell dumpsys deviceidle whitelist +com.worktime.trace',
  },
  {
    brand: '魅族 (MEIZU 20/21 Pro 实测通过)',
    osName: 'Flyme AIOS / Android 15',
    autostartPath: '手机管家 → 权限管理 → 后台管理 → 牛马时录 → 选择「允许后台运行」',
    batteryPath: '设置 → 电量管理 → 待机耗电管理 → 允许牛马时录待机运行（注：Flyme 会拦截开机广播，v1.1+ 已支持打开 App 自动恢复服务）',
    lockRecentTip: '多任务卡片向下拉动即可上锁',
    adbCommand: 'adb shell dumpsys deviceidle whitelist +com.worktime.trace',
  },
];

export const SettingsAndKeepAlive: React.FC<SettingsAndKeepAliveProps> = ({
  settings,
  onUpdateSettings,
  onResetDemoData,
}) => {
  const [selectedRomIdx, setSelectedRomIdx] = useState<number>(0);
  const activeRom = ROM_GUIDES[selectedRomIdx];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Rule & Compensation Settings (7 cols) */}
      <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              考勤核算与 v1.2.0 增强规则配置
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              修改任意参数将实时重新计算全月净工时、加班时长与加班费折算结果
            </p>
          </div>
          <button
            onClick={onResetDemoData}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重置演示数据
          </button>
        </div>

        {/* Standard Work Hours & Lunch Break Deduction */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">工作日标准工时</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {settings.standardHours.toFixed(1)} 小时 / 天
              </span>
            </div>
            <input
              type="range"
              min={6}
              max={10}
              step={0.5}
              value={settings.standardHours}
              onChange={(e) => onUpdateSettings({ standardHours: Number(e.target.value) })}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              工作日净在岗时长超出标准工时的部分自动计入平时加班
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                v1.2 自动扣除午休重叠时段
              </span>
              <input
                type="checkbox"
                checked={settings.lunchBreakDeductEnabled}
                onChange={(e) => onUpdateSettings({ lunchBreakDeductEnabled: e.target.checked })}
                className="w-4 h-4 accent-emerald-600 cursor-pointer"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">午休开始</label>
                <input
                  type="time"
                  value={settings.lunchStartTime}
                  disabled={!settings.lunchBreakDeductEnabled}
                  onChange={(e) => onUpdateSettings({ lunchStartTime: e.target.value })}
                  className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">午休结束</label>
                <input
                  type="time"
                  value={settings.lunchEndTime}
                  disabled={!settings.lunchBreakDeductEnabled}
                  onChange={(e) => onUpdateSettings({ lunchEndTime: e.target.value })}
                  className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Weekend & Holiday Overtime Switches */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between cursor-pointer">
            <div>
              <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                周末休息日全天计入加班
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                自动剔除国务院调休补班周六/周日
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.weekendOvertime}
              onChange={(e) => onUpdateSettings({ weekendOvertime: e.target.checked })}
              className="w-4 h-4 accent-emerald-600"
            />
          </label>

          <label className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between cursor-pointer">
            <div>
              <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                法定节假日全天计入加班
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                适用 2025–2027 元旦/春节/五一/国庆等法定假日
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.holidayOvertime}
              onChange={(e) => onUpdateSettings({ holidayOvertime: e.target.checked })}
              className="w-4 h-4 accent-emerald-600"
            />
          </label>
        </div>

        {/* Overtime Wage Estimator Configuration */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            加班费与时薪价值折算参数（劳动法标准倍率）
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">基准时薪 (元/h)</label>
              <input
                type="number"
                min={10}
                max={2000}
                value={settings.hourlyBaseWage}
                onChange={(e) => onUpdateSettings({ hourlyBaseWage: Number(e.target.value) || 0 })}
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">延时加班倍率</label>
              <input
                type="number"
                step={0.5}
                value={settings.workdayOvertimeMultiplier}
                onChange={(e) =>
                  onUpdateSettings({ workdayOvertimeMultiplier: Number(e.target.value) || 1.5 })
                }
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">周末休息倍率</label>
              <input
                type="number"
                step={0.5}
                value={settings.weekendOvertimeMultiplier}
                onChange={(e) =>
                  onUpdateSettings({ weekendOvertimeMultiplier: Number(e.target.value) || 2.0 })
                }
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">法定假日倍率</label>
              <input
                type="number"
                step={0.5}
                value={settings.holidayOvertimeMultiplier}
                onChange={(e) =>
                  onUpdateSettings({ holidayOvertimeMultiplier: Number(e.target.value) || 3.0 })
                }
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right: Chinese ROM Keep-Alive Interactive Wizard (5 cols) */}
      <div className="lg:col-span-5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-4">
        <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-600" />
            国产 ROM 前台定位服务保活向导
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            解决后台周期定位被小米/华为/OPPO/vivo/魅族杀进程导致漏打卡问题
          </p>
        </div>

        {/* Brand Tabs */}
        <div className="flex flex-wrap gap-1.5">
          {ROM_GUIDES.map((rom, idx) => (
            <button
              key={rom.brand}
              onClick={() => setSelectedRomIdx(idx)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                selectedRomIdx === idx
                  ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {rom.brand.split(' ')[0]}
            </button>
          ))}
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
          <div className="font-semibold text-slate-900 dark:text-slate-100">
            {activeRom.brand} · {activeRom.osName}
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block mb-0.5">01. 开启自启动权限：</span>
            <span className="text-slate-800 dark:text-slate-200 font-medium">{activeRom.autostartPath}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block mb-0.5">02. 解除电池后台限制：</span>
            <span className="text-slate-800 dark:text-slate-200 font-medium">{activeRom.batteryPath}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block mb-0.5">03. 最近任务卡片加锁：</span>
            <span className="text-slate-800 dark:text-slate-200 font-medium">{activeRom.lockRecentTip}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block mb-1">
              04. 开发者 ADB 免杀白名单指令：
            </span>
            <code className="block p-2 rounded bg-slate-900 text-emerald-300 font-mono text-[11px] select-all">
              {activeRom.adbCommand}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
};
