import React, { useState, useMemo } from 'react';
import {
  Home,
  ListChecks,
  CalendarDays,
  BarChart2,
  Settings,
  MapPin,
  Play,
  Square,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  PowerOff,
  Power,
  ShieldAlert,
  CheckCircle2,
  Navigation,
  Clock,
  FileCode,
  Download,
  Copy,
  Check,
  RotateCcw,
  Sun,
  Moon,
  AlertTriangle,
} from 'lucide-react';
import {
  Workplace,
  AttendanceEvent,
  AppSettings,
  DayStat,
  CalcMode,
  computeDayStats,
  currentlyInside,
  currentSessionStartMs,
  formatDuration,
  formatHoursDecimal,
  formatTimeHHMM,
  toDateKey,
  startOfLocalDateMs,
  getDayHolidayInfo,
} from './core/overtimeEngine';
import {
  DEFAULT_SETTINGS,
  INITIAL_WORKPLACES,
  generateSeedEvents,
  KOTLIN_PATCHES,
} from './core/kotlinPatches';

type MobileTab = 'home' | 'records' | 'calendar' | 'stats' | 'settings';

const STORAGE_KEYS = {
  WORKPLACES: 'wtt_android_workplaces_v2',
  EVENTS: 'wtt_android_events_v4',
  SETTINGS: 'wtt_android_settings_v2',
  HEARTBEAT: 'wtt_android_last_beat_v2',
  THEME: 'wtt_android_theme_v2',
};

const WEEKDAYS_ZH = ['一', '二', '三', '四', '五', '六', '日'];

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.THEME) === 'dark';
  });

  React.useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem(STORAGE_KEYS.THEME, 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem(STORAGE_KEYS.THEME, 'light');
    }
  }, [darkMode]);

  const [workplaces, setWorkplaces] = useState<Workplace[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.WORKPLACES);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return INITIAL_WORKPLACES;
  });

  const [events, setEvents] = useState<AttendanceEvent[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EVENTS);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return generateSeedEvents(Date.now());
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  });

  // 持久化的最后一次在围栏内心跳时间戳（用于模拟关机在围栏内、开机已在围栏外的精确回溯）
  const [lastInsideBeatMs, setLastInsideBeatMs] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.HEARTBEAT);
    return saved ? Number(saved) : Date.now() - 15 * 60_000;
  });

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WORKPLACES, JSON.stringify(workplaces));
  }, [workplaces]);

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
  }, [events]);

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.HEARTBEAT, String(lastInsideBeatMs));
  }, [lastInsideBeatMs]);

  // 手机 App 内部导航状态（复刻 AppNav.kt 的 5 个 Tab + MapPicker 子页面）
  const [activeTab, setActiveTab] = useState<MobileTab>('home');
  const [mapPickerWpId, setMapPickerWpId] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // 异常状态模拟器状态（手机开机/关机/所在位置）
  const [phonePoweredOn, setPhonePoweredOn] = useState<boolean>(true);
  const [physicalPosition, setPhysicalPosition] = useState<'INSIDE' | 'OUTSIDE'>('INSIDE');
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([
    '[19:26:41] TrackingService: 前台定位服务已启动，当前模式=首进末出 (FIRST_IN_LAST_OUT)',
    '[09:00:00] reconcileInitialState: 检测到 App 启动时人已在围栏内，自动补记今日首次上班卡 (ENTER)',
  ]);

  // 右侧 Kotlin 补丁查看器状态（在大屏或抽屉中查看源码）
  const [selectedPatchId, setSelectedPatchId] = useState<string>(KOTLIN_PATCHES[0].id);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showMobileCodeDrawer, setShowMobileCodeDrawer] = useState<boolean>(false);

  // 记录页 & 日历页状态
  const [viewYear, setViewYear] = useState<number>(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(new Date().getMonth() + 1);
  const [expandedDateKey, setExpandedDateKey] = useState<string | null>(toDateKey(Date.now()));
  const [selectedCalendarDateKey, setSelectedCalendarDateKey] = useState<string>(toDateKey(Date.now()));
  const [calendarFilter, setCalendarFilter] = useState<'ALL' | 'OVERTIME' | 'LEAVE_ABSENT'>('ALL');
  const [statsRange, setStatsRange] = useState<'MONTH' | 'DAYS30' | 'YEAR'>('MONTH');

  // 补录弹窗与 GitHub 推送弹窗状态
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  const [showGitPushModal, setShowGitPushModal] = useState<boolean>(false);
  const [manualDateKey, setManualDateKey] = useState<string>(toDateKey(Date.now()));
  const [manualTimeStr, setManualTimeStr] = useState<string>('09:00');
  const [manualIsEnter, setManualIsEnter] = useState<boolean>(true);
  const [manualWpId, setManualWpId] = useState<number>(workplaces[0]?.id ?? 1);

  // MapPicker 表单状态
  const [pickerName, setPickerName] = useState<string>('深圳南山科技园总部大厦');
  const [pickerLat, setPickerLat] = useState<string>('22.54051');
  const [pickerLng, setPickerLng] = useState<string>('113.95182');
  const [pickerRadius, setPickerRadius] = useState<number>(180);

  const appendLog = (msg: string) => {
    const time = formatTimeHHMM(Date.now()) + ':' + String(new Date().getSeconds()).padStart(2, '0');
    setDiagnosticLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 18)]);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  };

  const dayStats = useMemo(
    () => computeDayStats(events, settings, nowMs),
    [events, settings, nowMs]
  );

  const isInside = useMemo(() => currentlyInside(events), [events]);
  const sessionStart = useMemo(() => currentSessionStartMs(events), [events]);
  const todayKey = toDateKey(nowMs);
  const todayStat = dayStats[todayKey];

  const monthStatsSummary = useMemo(() => {
    const prefix = `${viewYear}-${String(viewMonth).padStart(2, '0')}`;
    const list = Object.values(dayStats).filter((d) => d.dateKey.startsWith(prefix));
    const workMs = list.reduce((a, b) => a + b.workMs, 0);
    const overtimeMs = list.reduce((a, b) => a + b.overtimeMs, 0);
    const workDays = list.filter((d) => d.workMs > 0).length;
    const otDays = list.filter((d) => d.overtimeMs > 0).length;
    return { workMs, overtimeMs, workDays, otDays };
  }, [dayStats, viewYear, viewMonth]);

  // =========================================================================
  // 核心异常场景模拟器（严格对应 TrackingService.kt 的 reconcileInitialState）
  // =========================================================================

  /**
   * 异常场景 1：App 刚启动 / 刚添加完工作地点，用户人就已经在围栏里面了
   */
  const simulateAppStartAlreadyInside = () => {
    const now = Date.now();
    const wp = workplaces[0];
    if (!wp) return;

    setPhonePoweredOn(true);
    setPhysicalPosition('INSIDE');
    setSettings((s) => ({ ...s, trackingEnabled: true }));

    // 检查今天是否已经有未闭合的 ENTER
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    const lastEv = sorted.filter((e) => e.workplaceId === wp.id).pop();
    const todayStart = startOfLocalDateMs(toDateKey(now));

    const newEvents: AttendanceEvent[] = [];

    if (!lastEv || lastEv.type === 'EXIT') {
      // 数据库当前不在岗，但首次定位发现在围栏内 -> 立即补记今日 ENTER
      // 为了直观展示今日工时，若今天还没有任何打卡，我们模拟早上 09:05 到岗打开 App 补记
      const simulatedStartTs =
        todayStat && todayStat.firstInMs
          ? now
          : Math.min(now, todayStart + (9 * 60 + 5) * 60_000);

      newEvents.push({
        id: Date.now() + 1,
        workplaceId: wp.id,
        type: 'ENTER',
        timestamp: simulatedStartTs,
        latitude: wp.latitude,
        longitude: wp.longitude,
        accuracyMeters: 14,
        manual: false,
        origin: 'STARTUP_INSIDE_COMPENSATED',
        note: 'App启动时已在围栏内自动补记上班',
      });
      setLastInsideBeatMs(now);
      setEvents((prev) => [...prev, ...newEvents]);
      appendLog(
        `reconcileInitialState: App 启动首次定位在「${wp.name}」围栏内 (dist=22m <= ${wp.radiusMeters}m)，DB状态=未在岗 -> 立即补记上班(ENTER) @ ${formatTimeHHMM(simulatedStartTs)}`
      );
      showToast('已触发：App一启动已在围栏内 -> 自动补记今日上班卡');
    } else if (lastEv.type === 'ENTER' && lastEv.timestamp < todayStart) {
      // 上一次未闭合的 ENTER 是昨天或更早（跨天未退），先闭合昨日，再补记今日 ENTER
      const yesterdayEnd = startOfLocalDateMs(toDateKey(lastEv.timestamp)) + 86_399_000;
      const closeTs =
        lastInsideBeatMs > lastEv.timestamp && lastInsideBeatMs <= yesterdayEnd
          ? lastInsideBeatMs
          : yesterdayEnd;

      newEvents.push({
        id: Date.now() + 1,
        workplaceId: wp.id,
        type: 'EXIT',
        timestamp: closeTs,
        latitude: wp.latitude,
        longitude: wp.longitude,
        manual: false,
        origin: 'OFFLINE_EXIT_RECONCILED',
        note: '跨天启动自动闭合旧在岗会话',
      });
      newEvents.push({
        id: Date.now() + 2,
        workplaceId: wp.id,
        type: 'ENTER',
        timestamp: now,
        latitude: wp.latitude,
        longitude: wp.longitude,
        accuracyMeters: 12,
        manual: false,
        origin: 'STARTUP_INSIDE_COMPENSATED',
        note: '跨天启动已在围栏内补记今日上班',
      });
      setLastInsideBeatMs(now);
      setEvents((prev) => [...prev, ...newEvents]);
      appendLog(
        `reconcileInitialState: 闭合昨日遗留会话 @ ${formatTimeHHMM(closeTs)}，并立即补记今日上班(ENTER)`
      );
      showToast('已闭合昨日未退会话，并补记今日首次上班卡');
    } else {
      // 今天已经在岗，刷新心跳并展示效果
      setLastInsideBeatMs(now);
      appendLog(
        `reconcileInitialState: App 启动检测已在「${wp.name}」围栏内，今日首卡 (${formatTimeHHMM(lastEv.timestamp)}) 已存在，保持在岗并刷新存活心跳`
      );
      showToast(`已在围栏内，今日首进时间 ${formatTimeHHMM(lastEv.timestamp)} 正常保持`);
    }
  };

  /**
   * 异常场景 2：手机在围栏内时关机（或没电/被杀），等到回家离开围栏后才开机
   * 一键完整演示两步曲：
   * 1) 记录关机前最后一次在围栏内的心跳时间戳（例如 35 分钟前，或模拟傍晚下班前关机）
   * 2) 手机在围栏外开机后，TrackingService 首次定位发现已在范围外，立即用「关机前最后在岗心跳时间」回溯补记 EXIT，绝不把关机后的时间算进加班！
   */
  const simulateShutdownInsideThenBootOutside = () => {
    const now = Date.now();
    const wp = workplaces[0];
    if (!wp) return;

    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    const lastEv = sorted.filter((e) => e.workplaceId === wp.id).pop();

    // 如果当前不在围栏内，我们先模拟用户在 2 小时前在公司正常上班，并在 35 分钟前关机
    let enterTs = lastEv?.type === 'ENTER' ? lastEv.timestamp : now - 120 * 60_000;
    const shutdownBeatTs = Math.max(enterTs + 15 * 60_000, now - 35 * 60_000);

    const newAdditions: AttendanceEvent[] = [];
    if (!lastEv || lastEv.type !== 'ENTER') {
      newAdditions.push({
        id: Date.now() + 1,
        workplaceId: wp.id,
        type: 'ENTER',
        timestamp: enterTs,
        latitude: wp.latitude,
        longitude: wp.longitude,
        accuracyMeters: 12,
        manual: false,
        origin: 'NORMAL_TRANSITION',
      });
    }

    // 开机自愈：由于关机前最后心跳是 shutdownBeatTs，开机时刻是 now（晚了 35 分钟），系统回溯在 shutdownBeatTs 写入 EXIT
    newAdditions.push({
      id: Date.now() + 2,
      workplaceId: wp.id,
      type: 'EXIT',
      timestamp: shutdownBeatTs,
      latitude: wp.latitude + 0.015,
      longitude: wp.longitude + 0.015,
      accuracyMeters: 18,
      manual: false,
      origin: 'OFFLINE_EXIT_RECONCILED',
      note: `关机在围栏内→开机已离开：按关机前心跳回溯下班（剔除关机后35分钟）`,
    });

    setLastInsideBeatMs(shutdownBeatTs);
    setPhonePoweredOn(true);
    setPhysicalPosition('OUTSIDE');
    setEvents((prev) => [...prev, ...newAdditions]);

    appendLog(
      `ACTION_SHUTDOWN 快照: 关机前最后在岗心跳冻结于 ${formatTimeHHMM(shutdownBeatTs)}`
    );
    appendLog(
      `ACTION_BOOT_COMPLETED 自愈: 开机首次定位距公司 2.1km (已在围栏外)，发现 DB 仍为在岗 -> 自动回溯至最后在岗心跳 ${formatTimeHHMM(shutdownBeatTs)} 补记下班(EXIT)，成功剔除关机离线 35 分钟！`
    );
    showToast(
      `已自愈：关机在围栏内、开机已出围栏 -> 回溯至 ${formatTimeHHMM(shutdownBeatTs)} 记下班`
    );
  };

  /**
   * 场景 3：模拟日内中途离开围栏吃午饭/拿外卖再回来，验证「首进末出」与「多段并集」的实时差异
   */
  const simulateMiddayOutAndBack = () => {
    const wp = workplaces[0];
    if (!wp) return;
    const todayStart = startOfLocalDateMs(todayKey);
    const now = Date.now();

    // 清理今天已有的测试事件，构造标准的：09:00 进 -> 12:00 出 -> 13:30 进 -> 18:30 出 (或仍在岗)
    const otherDays = events.filter((e) => toDateKey(e.timestamp) !== todayKey);
    const t0900 = todayStart + 9 * 3_600_000;
    const t1200 = todayStart + 12 * 3_600_000;
    const t1330 = todayStart + 13.5 * 3_600_000;
    const t1830 = Math.max(t1330 + 3_600_000, Math.min(now, todayStart + 18.5 * 3_600_000));

    const sampleToday: AttendanceEvent[] = [
      {
        id: Date.now() + 1,
        workplaceId: wp.id,
        type: 'ENTER',
        timestamp: t0900,
        latitude: wp.latitude,
        longitude: wp.longitude,
        manual: false,
        origin: 'NORMAL_TRANSITION',
        note: '今日首次进入围栏',
      },
      {
        id: Date.now() + 2,
        workplaceId: wp.id,
        type: 'EXIT',
        timestamp: t1200,
        latitude: wp.latitude + 0.003,
        longitude: wp.longitude + 0.003,
        manual: false,
        origin: 'NORMAL_TRANSITION',
        note: '午间离开围栏外出就餐 (1.5小时)',
      },
      {
        id: Date.now() + 3,
        workplaceId: wp.id,
        type: 'ENTER',
        timestamp: t1330,
        latitude: wp.latitude,
        longitude: wp.longitude,
        manual: false,
        origin: 'NORMAL_TRANSITION',
        note: '午间返回工作围栏',
      },
      {
        id: Date.now() + 4,
        workplaceId: wp.id,
        type: 'EXIT',
        timestamp: t1830,
        latitude: wp.latitude + 0.004,
        longitude: wp.longitude + 0.004,
        manual: false,
        origin: 'NORMAL_TRANSITION',
        note: '今日最后一次离开围栏',
      },
    ];

    setEvents([...otherDays, ...sampleToday]);
    setPhysicalPosition('OUTSIDE');
    appendLog(
      `已生成今日多段进出样本：09:00进 → 12:00出 → 13:30进 → ${formatTimeHHMM(t1830)}出。首进末出模式计 ${formatDuration(t1830 - t0900)}，多段累计模式计 ${formatDuration(t1200 - t0900 + (t1830 - t1330))}`
    );
    showToast('已生成今日中途外出样本，可在主页/设置切换两种计时模式对比');
  };

  const openMapPicker = (wpId: number) => {
    const existing = workplaces.find((w) => w.id === wpId);
    if (existing) {
      setPickerName(existing.name);
      setPickerLat(String(existing.latitude));
      setPickerLng(String(existing.longitude));
      setPickerRadius(existing.radiusMeters);
    } else {
      setPickerName('新办公地点');
      setPickerLat('22.54051');
      setPickerLng('113.95182');
      setPickerRadius(180);
    }
    setMapPickerWpId(wpId);
  };

  const saveFromMapPicker = () => {
    const lat = parseFloat(pickerLat) || 22.54051;
    const lng = parseFloat(pickerLng) || 113.95182;
    const isNew = mapPickerWpId === -1 || mapPickerWpId === null;
    const wpObj: Workplace = {
      id: isNew ? Date.now() : mapPickerWpId!,
      name: pickerName.trim() || '工作地点',
      latitude: lat,
      longitude: lng,
      radiusMeters: pickerRadius,
      enabled: true,
      createdAt: Date.now(),
    };

    setWorkplaces((prev) => {
      if (isNew) return [...prev, wpObj];
      return prev.map((w) => (w.id === wpObj.id ? wpObj : w));
    });
    setMapPickerWpId(null);

    // 如果保存地点时服务已开启且模拟位置在围栏内，立即检查是否触发「添加地点即在围栏内」自动打卡
    if (settings.trackingEnabled && physicalPosition === 'INSIDE' && !isInside) {
      const now = Date.now();
      setEvents((prev) => [
        ...prev,
        {
          id: now,
          workplaceId: wpObj.id,
          type: 'ENTER',
          timestamp: now,
          latitude: wpObj.latitude,
          longitude: wpObj.longitude,
          manual: false,
          origin: 'STARTUP_INSIDE_COMPENSATED',
          note: '保存地点时已在围栏内自动记上班',
        },
      ]);
      appendLog(`保存地点「${wpObj.name}」后立即定位：当前已在围栏内 -> 自动补记上班(ENTER)`);
      showToast(`已保存「${wpObj.name}」并立即触发在岗上班打卡`);
    } else {
      showToast(`已保存工作地点「${wpObj.name}」`);
    }
  };

  // 日历网格数据
  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth - 1, 1);
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const startOffset = (firstDay.getDay() + 6) % 7;
    const cells: Array<{ dateKey: string | null; day: number | null }> = [];
    for (let i = 0; i < startOffset; i++) cells.push({ dateKey: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const k = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateKey: k, day: d });
    }
    return cells;
  }, [viewYear, viewMonth]);

  // 记录页当月日期列表
  const monthRecordDates = useMemo(() => {
    const prefix = `${viewYear}-${String(viewMonth).padStart(2, '0')}`;
    const eventDays = events
      .map((e) => toDateKey(e.timestamp))
      .filter((k) => k.startsWith(prefix));
    const statDays = Object.keys(dayStats).filter((k) => k.startsWith(prefix));
    return Array.from(new Set([...eventDays, ...statDays])).sort((a, b) => b.localeCompare(a));
  }, [events, dayStats, viewYear, viewMonth]);

  // 导出当前选定月份 (viewYear-viewMonth) 的完整考勤流水到 CSV 文件
  const handleExportSelectedMonthCsv = () => {
    const prefix = `${viewYear}-${String(viewMonth).padStart(2, '0')}`;
    const wpMap = new Map<number, string>(workplaces.map((w) => [w.id, w.name]));

    const monthEvents = events
      .filter((e) => toDateKey(e.timestamp).startsWith(prefix))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (monthEvents.length === 0) {
      showToast(`${viewYear}年${viewMonth}月 暂无考勤流水可导出`);
      return;
    }

    const originLabel = (ev: AttendanceEvent): string => {
      if (ev.note) return ev.note;
      if (ev.manual || ev.origin === 'MANUAL') return '手动补录';
      if (ev.origin === 'STARTUP_INSIDE_COMPENSATED') return 'App启动时已在围栏内自动补记上班';
      if (ev.origin === 'OFFLINE_EXIT_RECONCILED') return '关机/离线出围栏按最后在岗心跳回溯下班';
      return '正常进出围栏打卡';
    };

    const escapeCsv = (val: string | number | null | undefined) => {
      const str = val === null || val === undefined ? '' : String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const header = [
      '日期',
      '时间',
      '时间戳(ms)',
      '类型',
      '工作地点',
      '纬度',
      '经度',
      '定位精度(m)',
      '系统补偿备注',
    ];

    const rows = monthEvents.map((ev) => {
      const d = new Date(ev.timestamp);
      const dateStr = toDateKey(ev.timestamp);
      const timeStr =
        `${String(d.getHours()).padStart(2, '0')}:` +
        `${String(d.getMinutes()).padStart(2, '0')}:` +
        `${String(d.getSeconds()).padStart(2, '0')}`;
      const typeStr = ev.type === 'ENTER' ? '上班(ENTER)' : '下班(EXIT)';
      const wpName = wpMap.get(ev.workplaceId) || `#${ev.workplaceId}`;
      const latStr = ev.latitude !== null ? ev.latitude.toFixed(6) : '';
      const lngStr = ev.longitude !== null ? ev.longitude.toFixed(6) : '';
      const accStr = ev.accuracyMeters !== undefined ? String(Math.round(ev.accuracyMeters)) : '';
      const remarkStr = originLabel(ev);

      return [
        dateStr,
        timeStr,
        ev.timestamp,
        typeStr,
        wpName,
        latStr,
        lngStr,
        accStr,
        remarkStr,
      ]
        .map(escapeCsv)
        .join(',');
    });

    const csvContent = '\uFEFF' + [header.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `牛马时录_${viewYear}年${String(viewMonth).padStart(2, '0')}月_考勤流水.csv`;
    a.click();
    URL.revokeObjectURL(url);

    appendLog(
      `RecordsScreen: 已导出 ${viewYear}年${viewMonth}月 完整考勤流水 CSV（共 ${monthEvents.length} 条记录，含经纬度与系统补偿备注）`
    );
    showToast(`已导出 ${viewYear}年${viewMonth}月 考勤流水 CSV (${monthEvents.length} 条)`);
  };

  const activePatch =
    KOTLIN_PATCHES.find((p) => p.id === selectedPatchId) || KOTLIN_PATCHES[0];

  const handleDownloadAllKotlin = () => {
    const text = KOTLIN_PATCHES.map(
      (p) =>
        `// =====================================================================\n` +
        `// 文件路径: ${p.filePath}\n` +
        `// 优化主题: ${p.title}\n` +
        `// =====================================================================\n\n` +
        `${p.optimizedCode}\n\n`
    ).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workTimeTrace-android-patches.kt';
    a.click();
    URL.revokeObjectURL(url);
    showToast('已下载完整 Android Kotlin 源码');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F3F6F4] dark:bg-[#0B110E] text-[#171D1A] dark:text-[#DEE4DE]">
      {/* Top Bar Contract: Zone 1 Brand — Zone 2 Nav — Zone 3 Primary CTA */}
      <header className="flex items-center justify-between gap-8 px-5 py-3.5 border-b border-emerald-900/10 dark:border-emerald-100/10 bg-white/90 dark:bg-[#111915]/90 backdrop-blur-md sticky top-0 z-30">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('home');
            setMapPickerWpId(null);
          }}
          className="text-base font-bold tracking-tight text-[#1E6E5C] dark:text-[#8DD6C1] whitespace-nowrap shrink-0"
        >
          牛马时录
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          {(
            [
              { id: 'home', label: '手机主页' },
              { id: 'records', label: '打卡记录' },
              { id: 'calendar', label: '月度日历' },
              { id: 'stats', label: '加班统计' },
              { id: 'settings', label: '规则设置' },
            ] as const
          ).map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                setActiveTab(item.id);
                setMapPickerWpId(null);
              }}
              className={`hover:text-[#1E6E5C] dark:hover:text-[#8DD6C1] transition-colors whitespace-nowrap shrink-0 ${
                activeTab === item.id
                  ? 'text-[#1E6E5C] dark:text-[#8DD6C1] font-semibold underline underline-offset-8 decoration-2'
                  : ''
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowGitPushModal(true)}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-[#1E6E5C] hover:bg-[#175849] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            推送到 GitHub
          </button>
        </div>
      </header>

      {/* Toast 提示 */}
      {toastMsg && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-[#171D1A] dark:bg-[#DEE4DE] text-white dark:text-[#171D1A] text-xs font-medium shadow-lg flex items-center gap-2 whitespace-nowrap">
          <CheckCircle2 className="w-4 h-4 text-[#8DD6C1] dark:text-[#1E6E5C] shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Main Content Layout:
          Left/Center: Authentic Android Phone Viewport (390px Material 3 Compose App)
          Right: Abnormal Scenario Simulator (Start-Inside, Shutdown-Inside-Boot-Outside) & Kotlin Code Inspector */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ===================================================================
            COLUMN 1 (lg:col-span-5): 1:1 原生 Android 手机端实机交互界面
            =================================================================== */}
        <div className="lg:col-span-5 flex flex-col items-center">
          {/* Android Phone Frame */}
          <div className="w-full max-w-[400px] rounded-[38px] border-[8px] border-[#1F2723] dark:border-[#2A3530] bg-[#F6FBF7] dark:bg-[#0F1512] shadow-xl overflow-hidden flex flex-col min-h-[760px] max-h-[810px]">
            {/* Android Status Bar + Constant Foreground Notification Banner */}
            <div className="bg-[#E8F2EC] dark:bg-[#18221D] px-5 pt-2.5 pb-2 border-b border-black/5 dark:border-white/5">
              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#404944] dark:text-[#BFC9C2]">
                <span>{formatTimeHHMM(nowMs)}</span>
                <div className="flex items-center gap-2">
                  <span>{settings.calcMode === 'FIRST_IN_LAST_OUT' ? '首进末出' : '多段累计'}</span>
                  <span>·</span>
                  <span>5G</span>
                  <span>{phonePoweredOn ? '92%' : '已关机'}</span>
                </div>
              </div>

              {/* 常驻前台通知栏预览（对应 TrackingService.updateNotification） */}
              {settings.trackingEnabled && phonePoweredOn && (
                <div className="mt-1.5 px-3 py-1.5 rounded-xl bg-[#DBE5DE]/80 dark:bg-[#232D28] flex items-center justify-between text-[11px]">
                  <div className="truncate pr-2">
                    <span className="font-semibold text-[#1E6E5C] dark:text-[#8DD6C1]">
                      {isInside ? '在岗中 · 牛马时录运行中' : '牛马时录运行中'}
                    </span>
                    <span className="block text-[#404944] dark:text-[#BFC9C2] truncate font-mono tabular-nums">
                      {isInside && todayStat?.firstInMs
                        ? `首进 ${formatTimeHHMM(todayStat.firstInMs)} · 今日已计 ${formatDuration(todayStat.workMs)}`
                        : todayStat && todayStat.workMs > 0 && todayStat.lastOutMs
                        ? `末出 ${formatTimeHHMM(todayStat.lastOutMs)} · 今日在岗 ${formatDuration(todayStat.workMs)}`
                        : '等待进入工作范围…'}
                    </span>
                  </div>
                  <button
                    onClick={() => setDarkMode(!darkMode)}
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer shrink-0"
                    title="切换手机深浅色主题"
                  >
                    {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>

            {/* Android Screen Body (Compose NavHost Equivalent) */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {/* 子页面：MapPickerScreen.kt 地图选点页 */}
              {mapPickerWpId !== null ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setMapPickerWpId(null)}
                      className="min-h-[44px] px-2 flex items-center gap-1 text-sm font-semibold text-[#1E6E5C] dark:text-[#8DD6C1] cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      返回主页
                    </button>
                    <span className="text-sm font-semibold">选择工作地点</span>
                    <span className="w-12" />
                  </div>

                  {/* 交互式高德围栏选点模拟画布 */}
                  <div className="relative h-48 rounded-2xl bg-[#16231E] border border-emerald-800/40 overflow-hidden flex items-center justify-center">
                    <svg viewBox="-120 -90 240 180" className="w-full h-full">
                      <line x1="-120" y1="0" x2="120" y2="0" stroke="#243830" strokeWidth="1" />
                      <line x1="0" y1="-90" x2="0" y2="90" stroke="#243830" strokeWidth="1" />
                      <circle
                        cx="0"
                        cy="0"
                        r={Math.min(75, Math.max(22, pickerRadius / 6))}
                        fill="rgba(30, 110, 92, 0.25)"
                        stroke="#26A69A"
                        strokeWidth="2"
                      />
                      <circle cx="0" cy="0" r="5" fill="#4ADE80" />
                      <text x="10" y="-6" fill="#A9F2DC" fontSize="9" fontFamily="JetBrains Mono">
                        {pickerName} ({pickerRadius}m)
                      </text>
                    </svg>
                    <button
                      onClick={() => {
                        if (navigator.geolocation) {
                          navigator.geolocation.getCurrentPosition(
                            (pos) => {
                              setPickerLat(pos.coords.latitude.toFixed(5));
                              setPickerLng(pos.coords.longitude.toFixed(5));
                              showToast('已获取当前真实 GPS 坐标');
                            },
                            () => showToast('使用默认科技园坐标')
                          );
                        }
                      }}
                      className="absolute bottom-3 right-3 w-11 h-11 rounded-2xl bg-[#A9F2DC] text-[#002017] shadow-md flex items-center justify-center cursor-pointer"
                      title="回到当前位置"
                    >
                      <Navigation className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    <div>
                      <label className="text-xs text-[#404944] dark:text-[#BFC9C2]">名称</label>
                      <input
                        type="text"
                        value={pickerName}
                        onChange={(e) => setPickerName(e.target.value)}
                        className="w-full mt-1 px-3 py-2.5 text-sm rounded-xl border border-[#404944]/30 bg-transparent"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-[#404944] dark:text-[#BFC9C2]">纬度</label>
                        <input
                          type="text"
                          value={pickerLat}
                          onChange={(e) => setPickerLat(e.target.value)}
                          className="w-full mt-1 px-3 py-2 text-xs font-mono rounded-xl border border-[#404944]/30 bg-transparent"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[#404944] dark:text-[#BFC9C2]">经度</label>
                        <input
                          type="text"
                          value={pickerLng}
                          onChange={(e) => setPickerLng(e.target.value)}
                          className="w-full mt-1 px-3 py-2 text-xs font-mono rounded-xl border border-[#404944]/30 bg-transparent"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>打卡范围半径：{pickerRadius} 米</span>
                        <span className="text-[#404944] dark:text-[#BFC9C2]">建议 ≥ 150m</span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={1000}
                        step={10}
                        value={pickerRadius}
                        onChange={(e) => setPickerRadius(Number(e.target.value))}
                        className="w-full accent-[#1E6E5C]"
                      />
                    </div>
                    <button
                      onClick={saveFromMapPicker}
                      className="w-full min-h-[48px] rounded-full bg-[#1E6E5C] dark:bg-[#8DD6C1] text-white dark:text-[#00382C] font-semibold text-sm cursor-pointer"
                    >
                      保存工作地点
                    </button>
                  </div>
                </div>
              ) : activeTab === 'home' ? (
                /* ==================== TAB 1: HomeScreen.kt ==================== */
                <div className="space-y-3">
                  {/* StatusCard (严格还原 HomeScreen.kt 的配色与布局) */}
                  <div
                    className={`rounded-2xl p-4 transition-colors ${
                      isInside
                        ? 'bg-[#D3EFDD] dark:bg-[#1E3B2A] text-[#1B5E2F] dark:text-[#9CD6B0]'
                        : 'bg-[#E4E7E5] dark:bg-[#363B39] text-[#5A615E] dark:text-[#B9BEBB]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-5 h-5 shrink-0" />
                        <span className="text-xl font-bold">
                          {isInside ? '在岗中' : '不在工作范围'}
                        </span>
                      </div>
                      <span className="text-xs font-medium opacity-85">
                        {settings.calcMode === 'FIRST_IN_LAST_OUT' ? '首进末出模式' : '多段累计模式'}
                      </span>
                    </div>

                    <div className="mt-2 space-y-1 text-xs text-[#171D1A] dark:text-[#DEE4DE]">
                      {todayStat && todayStat.firstInMs ? (
                        <div className="font-mono tabular-nums">
                          首次进围栏: <strong>{formatTimeHHMM(todayStat.firstInMs)}</strong>
                          {' · '}
                          {todayStat.currentlyOpenToday
                            ? '当前仍在围栏内'
                            : `最后出围栏: ${formatTimeHHMM(todayStat.lastOutMs!)}`}
                        </div>
                      ) : (
                        <div>今日尚无进入围栏记录</div>
                      )}

                      {todayStat && todayStat.workMs > 0 && (
                        <div className="font-medium font-mono tabular-nums">
                          今日上班时间：{formatDuration(todayStat.workMs)}
                          {todayStat.overtimeMs > 0
                            ? ` · 加班 ${formatDuration(todayStat.overtimeMs)}`
                            : ''}
                        </div>
                      )}

                      {/* 当日加班超过设定阈值时的高亮提醒（可选开启，默认关闭） */}
                      {(() => {
                        const thresholdHours = settings.overtimeAlertThresholdHours ?? 2;
                        const thresholdMs = thresholdHours * 3_600_000;
                        const otMs = todayStat?.overtimeMs ?? 0;
                        const isExceeded = otMs >= thresholdMs;

                        if (settings.overtimeAlertEnabled && isExceeded) {
                          return (
                            <div className="mt-2 rounded-xl bg-[#FFDAD6] dark:bg-[#93000A] text-[#410002] dark:text-[#FFDAD6] border border-[#BA1A1A]/35 dark:border-[#FFB4AB]/40 px-3 py-2.5 flex items-start justify-between gap-2 shadow-xs">
                              <div className="flex items-start gap-2 min-w-0">
                                <AlertTriangle className="w-4 h-4 text-[#BA1A1A] dark:text-[#FFB4AB] shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                  <div className="text-xs font-bold tracking-wide">
                                    今日加班较多，注意休息
                                  </div>
                                  <div className="text-[11px] opacity-90 font-mono tabular-nums mt-0.5">
                                    今日已加班 {formatDuration(otMs)}（已超 {thresholdHours} 小时阈值）
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => setActiveTab('settings')}
                                className="text-[10px] font-semibold underline opacity-85 hover:opacity-100 whitespace-nowrap shrink-0 cursor-pointer mt-0.5"
                              >
                                调整阈值
                              </button>
                            </div>
                          );
                        }

                        return null;
                      })()}

                      {/* 当天同时展示两种计时模式的对比差值 */}
                      {todayStat &&
                        todayStat.firstLastSpanGrossMs !== todayStat.intervalUnionGrossMs && (
                          <div className="pt-1 text-[11px] opacity-80 font-mono tabular-nums">
                            对比：首进末出 {formatDuration(todayStat.firstLastSpanGrossMs)} vs 多段并集{' '}
                            {formatDuration(todayStat.intervalUnionGrossMs)}
                          </div>
                        )}

                      {!settings.trackingEnabled && (
                        <div className="text-[#BA1A1A] dark:text-[#FFB4AB] font-semibold pt-1">
                          记录服务未开启
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 主页计时模式快捷切换器（方便用户在手机主页直接切换「首进末出」与「多段并集」） */}
                  <div className="rounded-2xl bg-[#DBE5DE]/60 dark:bg-[#1B2420] p-3">
                    <div className="text-xs font-semibold mb-2 flex items-center justify-between">
                      <span>当日工时计算模式</span>
                      <span className="text-[11px] font-normal text-[#404944] dark:text-[#BFC9C2]">
                        点击实时切换算法
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F6FBF7] dark:bg-[#0F1512] rounded-xl">
                      <button
                        onClick={() => {
                          setSettings((s) => ({ ...s, calcMode: 'FIRST_IN_LAST_OUT' }));
                          showToast('已切换为「首进末出」模式：以首次进与末次出围栏计算全天工时');
                        }}
                        className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          settings.calcMode === 'FIRST_IN_LAST_OUT'
                            ? 'bg-[#1E6E5C] text-white dark:bg-[#8DD6C1] dark:text-[#00382C]'
                            : 'text-[#404944] dark:text-[#BFC9C2]'
                        }`}
                      >
                        首进末出跨度
                      </button>
                      <button
                        onClick={() => {
                          setSettings((s) => ({ ...s, calcMode: 'INTERVAL_UNION' }));
                          showToast('已切换为「多段累计」模式：中途出围栏时段不计入工时');
                        }}
                        className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          settings.calcMode === 'INTERVAL_UNION'
                            ? 'bg-[#1E6E5C] text-white dark:bg-[#8DD6C1] dark:text-[#00382C]'
                            : 'text-[#404944] dark:text-[#BFC9C2]'
                        }`}
                      >
                        多段停留并集
                      </button>
                    </div>
                  </div>

                  {/* 开始记录 / 停止记录 按钮（对应 HomeScreen.kt 的 52.dp 大按钮） */}
                  {settings.trackingEnabled ? (
                    <button
                      onClick={() => {
                        setSettings((s) => ({ ...s, trackingEnabled: false }));
                        appendLog('TrackingService: 用户手动停止前台考勤记录服务');
                        showToast('已停止记录服务');
                      }}
                      className="w-full min-h-[50px] rounded-full border border-[#404944]/40 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      停止记录
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        // 点击开始记录时，如果物理位置已在围栏内，自动触发「启动即在围栏内」补偿！
                        simulateAppStartAlreadyInside();
                      }}
                      className="w-full min-h-[50px] rounded-full bg-[#1E6E5C] dark:bg-[#8DD6C1] text-white dark:text-[#00382C] font-semibold text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      开始记录（若已在围栏内立即记上班）
                    </button>
                  )}

                  {/* 工作地点卡片 */}
                  <div className="rounded-2xl bg-[#DBE5DE]/50 dark:bg-[#1B2420] p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">工作地点</span>
                      <button
                        onClick={() => openMapPicker(-1)}
                        className="min-h-[36px] px-2.5 text-xs font-semibold text-[#1E6E5C] dark:text-[#8DD6C1] flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        添加
                      </button>
                    </div>

                    <div className="divide-y divide-black/5 dark:divide-white/5">
                      {workplaces.map((wp) => (
                        <div
                          key={wp.id}
                          onClick={() => openMapPicker(wp.id)}
                          className="py-2.5 flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-start gap-2.5 min-w-0 pr-2">
                            <MapPin className="w-4 h-4 text-[#1E6E5C] dark:text-[#8DD6C1] mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{wp.name}</div>
                              <div className="text-[11px] font-mono tabular-nums text-[#404944] dark:text-[#BFC9C2]">
                                范围 {wp.radiusMeters} 米 · {wp.latitude.toFixed(4)}, {wp.longitude.toFixed(4)}
                              </div>
                            </div>
                          </div>
                          {workplaces.length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setWorkplaces((prev) => prev.filter((x) => x.id !== wp.id));
                                showToast('已删除工作地点');
                              }}
                              className="min-w-[40px] min-h-[40px] flex items-center justify-center text-[#404944] hover:text-[#BA1A1A] cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 本月统计卡片 */}
                  <div className="rounded-2xl bg-[#DBE5DE]/50 dark:bg-[#1B2420] p-4 space-y-2">
                    <div className="text-sm font-semibold">本月统计</div>
                    <div className="flex justify-between text-xs">
                      <span>在岗合计</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {formatDuration(monthStatsSummary.workMs)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs items-center">
                      <span>加班合计</span>
                      <span className="font-mono font-bold text-sm tabular-nums text-[#BA1A1A] dark:text-[#FFB4AB]">
                        {formatDuration(monthStatsSummary.overtimeMs)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#404944] dark:text-[#BFC9C2] leading-relaxed">
                      当前模式：{settings.calcMode === 'FIRST_IN_LAST_OUT'
                        ? '首进末出（当天首次进围栏至末次离开围栏）'
                        : '多段累计（各段在围栏内时间取并集）'}{' '}
                      · 超出 {settings.standardHours} 小时计加班
                    </p>
                  </div>
                </div>
              ) : activeTab === 'records' ? (
                /* ==================== TAB 2: RecordsScreen.kt ==================== */
                <div className="space-y-3">
                  {/* 月份切换器 */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        if (viewMonth === 1) {
                          setViewYear((y) => y - 1);
                          setViewMonth(12);
                        } else setViewMonth((m) => m - 1);
                      }}
                      className="min-h-[40px] px-2 text-xs font-semibold text-[#1E6E5C] dark:text-[#8DD6C1] cursor-pointer"
                    >
                      ◀ 上月
                    </button>
                    <span className="text-base font-bold font-mono tabular-nums">
                      {viewYear}年{viewMonth}月
                    </span>
                    <button
                      onClick={() => {
                        if (viewMonth === 12) {
                          setViewYear((y) => y + 1);
                          setViewMonth(1);
                        } else setViewMonth((m) => m + 1);
                      }}
                      className="min-h-[40px] px-2 text-xs font-semibold text-[#1E6E5C] dark:text-[#8DD6C1] cursor-pointer"
                    >
                      下月 ▶
                    </button>
                  </div>

                  {/* 月汇总、导出当月流水 CSV 与手动补录按钮 */}
                  <div className="rounded-2xl bg-[#DBE5DE]/50 dark:bg-[#1B2420] p-3.5 space-y-2.5">
                    <div className="flex justify-between text-xs">
                      <span>
                        出勤 {monthStatsSummary.workDays} 天 · 在岗{' '}
                        {formatDuration(monthStatsSummary.workMs)}
                      </span>
                      <span className="font-mono font-semibold text-[#BA1A1A] dark:text-[#FFB4AB]">
                        加班 {formatDuration(monthStatsSummary.overtimeMs)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setManualDateKey(todayKey);
                          setShowManualModal(true);
                        }}
                        className="min-h-[42px] px-2.5 rounded-full border border-[#1E6E5C]/40 text-xs font-semibold text-[#1E6E5C] dark:text-[#8DD6C1] flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                        手动补录记录
                      </button>
                      <button
                        onClick={handleExportSelectedMonthCsv}
                        className="min-h-[42px] px-2.5 rounded-full bg-[#1E6E5C] dark:bg-[#8DD6C1] text-white dark:text-[#00382C] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        导出当月流水 CSV
                      </button>
                    </div>
                  </div>

                  {/* 每日可展开卡片列表 */}
                  <div className="space-y-2">
                    {monthRecordDates.map((dKey) => {
                      const st = dayStats[dKey];
                      const dayEvs = events
                        .filter((e) => toDateKey(e.timestamp) === dKey)
                        .sort((a, b) => a.timestamp - b.timestamp);
                      const isExpanded = expandedDateKey === dKey;
                      const hasAbnormal = (st?.abnormalEvents.length ?? 0) > 0;

                      return (
                        <div
                          key={dKey}
                          className="rounded-2xl bg-[#DBE5DE]/45 dark:bg-[#1B2420] p-3.5 transition-colors"
                        >
                          <div
                            onClick={() => setExpandedDateKey(isExpanded ? null : dKey)}
                            className="flex items-center justify-between cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-xs font-semibold font-mono tabular-nums">
                                <span>{dKey.slice(5)}</span>
                                <span className="font-sans font-normal text-[#404944] dark:text-[#BFC9C2]">
                                  {st?.holidayName || (st?.restDay ? '休' : '工作日')}
                                </span>
                                {hasAbnormal && (
                                  <span className="font-sans text-[10px] text-[#1E6E5C] dark:text-[#8DD6C1]">
                                    · 含异常自愈校准
                                  </span>
                                )}
                              </div>
                              <div className="text-xs font-mono tabular-nums text-[#404944] dark:text-[#BFC9C2] mt-0.5">
                                {st?.firstInMs ? formatTimeHHMM(st.firstInMs) : '--:--'} –{' '}
                                {st?.currentlyOpenToday
                                  ? '仍在岗'
                                  : st?.lastOutMs
                                  ? formatTimeHHMM(st.lastOutMs)
                                  : '--:--'}
                                {' · '}
                                在岗 {formatDuration(st?.workMs ?? 0)}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {(st?.overtimeMs ?? 0) > 0 && (
                                <span className="text-xs font-mono font-bold text-[#BA1A1A] dark:text-[#FFB4AB]">
                                  +{formatHoursDecimal(st!.overtimeMs)}
                                </span>
                              )}
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-3 pt-2.5 border-t border-black/10 dark:border-white/10 space-y-2 text-xs">
                              {st && (
                                <div className="p-2 rounded-xl bg-black/5 dark:bg-white/5 font-mono tabular-nums text-[11px] space-y-0.5">
                                  <div>
                                    首进末出跨度: {formatDuration(st.firstLastSpanGrossMs)} (
                                    {st.firstInMs ? formatTimeHHMM(st.firstInMs) : '--'} →{' '}
                                    {st.currentlyOpenToday
                                      ? '当前'
                                      : st.lastOutMs
                                      ? formatTimeHHMM(st.lastOutMs)
                                      : '--'}
                                    )
                                  </div>
                                  <div>多段停留并集: {formatDuration(st.intervalUnionGrossMs)}</div>
                                </div>
                              )}

                              <div className="font-semibold text-[11px] text-[#404944] dark:text-[#BFC9C2]">
                                原始进出围栏流水 ({dayEvs.length} 条):
                              </div>
                              {dayEvs.map((ev) => (
                                <div
                                  key={ev.id}
                                  className="flex items-center justify-between py-1 font-mono tabular-nums"
                                >
                                  <div className="min-w-0 pr-2">
                                    <span
                                      className={
                                        ev.type === 'ENTER'
                                          ? 'text-[#1B5E2F] dark:text-[#9CD6B0] font-semibold'
                                          : 'text-[#A5864B] dark:text-[#EBBE7E] font-semibold'
                                      }
                                    >
                                      {ev.type === 'ENTER' ? '上班 ' : '下班 '}
                                    </span>
                                    <span>{formatTimeHHMM(ev.timestamp)}</span>
                                    {ev.note && (
                                      <span className="font-sans text-[11px] text-[#404944] dark:text-[#BFC9C2] block truncate">
                                        {ev.note}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => {
                                      setEvents((prev) => prev.filter((x) => x.id !== ev.id));
                                      showToast('已删除该条记录');
                                    }}
                                    className="min-w-[36px] min-h-[36px] flex items-center justify-center text-[#404944] hover:text-[#BA1A1A] cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : activeTab === 'calendar' ? (
                /* ==================== TAB 3: CalendarScreen.kt (含工时热力图) ==================== */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        if (viewMonth === 1) {
                          setViewYear((y) => y - 1);
                          setViewMonth(12);
                        } else setViewMonth((m) => m - 1);
                      }}
                      className="min-h-[40px] px-2 text-xs font-semibold text-[#1E6E5C] dark:text-[#8DD6C1] cursor-pointer"
                    >
                      ◀ 上月
                    </button>
                    <span className="text-base font-bold font-mono tabular-nums">
                      {viewYear}年{viewMonth}月
                    </span>
                    <button
                      onClick={() => {
                        if (viewMonth === 12) {
                          setViewYear((y) => y + 1);
                          setViewMonth(1);
                        } else setViewMonth((m) => m + 1);
                      }}
                      className="min-h-[40px] px-2 text-xs font-semibold text-[#1E6E5C] dark:text-[#8DD6C1] cursor-pointer"
                    >
                      下月 ▶
                    </button>
                  </div>

                  {/* 日历高亮筛选栏：全部日期 / 加班日 / 请假/缺勤 */}
                  {(() => {
                    const stdThresholdMs = settings.standardHours * 3_600_000 * 0.85;
                    let otDayCount = 0;
                    let leaveAbsentCount = 0;
                    for (const cell of calendarCells) {
                      if (!cell.dateKey) continue;
                      const st = dayStats[cell.dateKey];
                      const info = getDayHolidayInfo(cell.dateKey);
                      const workMs = st?.workMs ?? 0;
                      if ((st?.overtimeMs ?? 0) > 0) otDayCount++;
                      if (cell.dateKey < todayKey && !info.restDay && (workMs === 0 || workMs < stdThresholdMs)) {
                        leaveAbsentCount++;
                      }
                    }

                    return (
                      <div className="grid grid-cols-3 gap-1.5 bg-[#DBE5DE]/40 dark:bg-[#1B2420] p-1 rounded-xl">
                        <button
                          onClick={() => setCalendarFilter('ALL')}
                          className={`min-h-[34px] px-2 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                            calendarFilter === 'ALL'
                              ? 'bg-[#1E6E5C] text-white dark:bg-[#8DD6C1] dark:text-[#00382C] shadow-xs'
                              : 'text-[#404944] dark:text-[#BFC9C2] hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          全部日期
                        </button>
                        <button
                          onClick={() =>
                            setCalendarFilter((prev) => (prev === 'OVERTIME' ? 'ALL' : 'OVERTIME'))
                          }
                          className={`min-h-[34px] px-2 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer flex items-center justify-center gap-1 ${
                            calendarFilter === 'OVERTIME'
                              ? 'bg-[#BA1A1A] text-white dark:bg-[#FFB4AB] dark:text-[#690005] shadow-xs'
                              : 'text-[#404944] dark:text-[#BFC9C2] hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          <span>加班日</span>
                          <span className="font-mono tabular-nums text-[10px] opacity-90">({otDayCount})</span>
                        </button>
                        <button
                          onClick={() =>
                            setCalendarFilter((prev) => (prev === 'LEAVE_ABSENT' ? 'ALL' : 'LEAVE_ABSENT'))
                          }
                          className={`min-h-[34px] px-2 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer flex items-center justify-center gap-1 ${
                            calendarFilter === 'LEAVE_ABSENT'
                              ? 'bg-[#B45309] text-white dark:bg-[#FBBF24] dark:text-[#451A03] shadow-xs'
                              : 'text-[#404944] dark:text-[#BFC9C2] hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          <span>请假/缺勤</span>
                          <span className="font-mono tabular-nums text-[10px] opacity-90">
                            ({leaveAbsentCount})
                          </span>
                        </button>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-7 text-center text-[11px] text-[#404944] dark:text-[#BFC9C2]">
                    {WEEKDAYS_ZH.map((w) => (
                      <div key={w} className="py-1">
                        {w}
                      </div>
                    ))}
                  </div>

                  {/* 月历网格：基于当日工时长度 (workMs) 的 5 档热力图背景 + 筛选高亮 */}
                  <div className="rounded-2xl bg-[#DBE5DE]/30 dark:bg-[#1B2420]/70 p-2 space-y-2">
                    <div className="grid grid-cols-7 gap-1">
                      {calendarCells.map((cell, i) => {
                        if (!cell.dateKey || !cell.day) {
                          return <div key={`empty-${i}`} className="h-12" />;
                        }
                        const st = dayStats[cell.dateKey];
                        const info = getDayHolidayInfo(cell.dateKey);
                        const isSel = cell.dateKey === selectedCalendarDateKey;
                        const isTodayCell = cell.dateKey === todayKey;
                        const workMs = st?.workMs ?? 0;
                        const workHours = workMs / 3_600_000;
                        const hasOt = (st?.overtimeMs ?? 0) > 0;
                        const stdThresholdMs = settings.standardHours * 3_600_000 * 0.85;
                        const isLeaveOrAbsent =
                          cell.dateKey < todayKey &&
                          !info.restDay &&
                          (workMs === 0 || workMs < stdThresholdMs);

                        const isFilterMatched =
                          calendarFilter === 'ALL'
                            ? true
                            : calendarFilter === 'OVERTIME'
                            ? hasOt
                            : isLeaveOrAbsent;

                        // 5 档工时热力图颜色（工时越长，颜色越深）
                        const heatLevel =
                          workHours <= 0
                            ? 0
                            : workHours < 4
                            ? 1
                            : workHours < 8
                            ? 2
                            : workHours < 10
                            ? 3
                            : workHours < 12
                            ? 4
                            : 5;

                        const heatClasses =
                          calendarFilter === 'LEAVE_ABSENT' && isLeaveOrAbsent
                            ? 'bg-amber-500/20 dark:bg-amber-400/25 text-amber-950 dark:text-amber-100'
                            : [
                                // Level 0: 0h 无工时
                                'bg-transparent text-[#171D1A] dark:text-[#DEE4DE]',
                                // Level 1: (0, 4h) 极浅绿
                                'bg-[#1E6E5C]/15 dark:bg-[#26A688]/20 text-[#0F3D32] dark:text-[#C5F6E8]',
                                // Level 2: [4h, 8h) 浅中绿（常规半天至满勤前）
                                'bg-[#1E6E5C]/32 dark:bg-[#26A688]/38 text-[#072B22] dark:text-[#E2FBF3]',
                                // Level 3: [8h, 10h) 中深绿（标准满勤 ~ 轻度加班）
                                'bg-[#1E6E5C]/55 dark:bg-[#26A688]/60 text-white dark:text-white',
                                // Level 4: [10h, 12h) 深翠绿（高强度加班）
                                'bg-[#1E6E5C]/78 dark:bg-[#26A688]/80 text-white dark:text-white',
                                // Level 5: >= 12h 浓墨绿（极限连轴转）
                                'bg-[#114B3E] dark:bg-[#1E8E73] text-white dark:text-white',
                              ][heatLevel];

                        const useLightText =
                          !(calendarFilter === 'LEAVE_ABSENT' && isLeaveOrAbsent) && heatLevel >= 3;

                        const filterHighlightRing =
                          calendarFilter === 'OVERTIME' && hasOt
                            ? 'ring-2 ring-[#BA1A1A] dark:ring-[#FFB4AB]'
                            : calendarFilter === 'LEAVE_ABSENT' && isLeaveOrAbsent
                            ? 'ring-2 ring-amber-600 dark:ring-amber-400'
                            : '';

                        return (
                          <button
                            key={cell.dateKey}
                            onClick={() => setSelectedCalendarDateKey(cell.dateKey!)}
                            title={`${cell.dateKey} · 在岗 ${formatDuration(workMs)}${
                              hasOt ? ` · 加班 ${formatDuration(st!.overtimeMs)}` : ''
                            }${isLeaveOrAbsent ? (workMs === 0 ? ' · 全天请假/缺勤' : ' · 半天请假/早退') : ''}`}
                            className={`h-13 rounded-xl p-1 flex flex-col items-center justify-between text-xs transition-all cursor-pointer ${heatClasses} ${
                              !isFilterMatched ? 'opacity-25 scale-95' : ''
                            } ${
                              isSel
                                ? 'ring-2 ring-[#171D1A] dark:ring-white shadow-xs scale-[1.03]'
                                : filterHighlightRing
                                ? filterHighlightRing
                                : isTodayCell
                                ? 'ring-1 ring-[#1E6E5C] dark:ring-[#8DD6C1]'
                                : ''
                            }`}
                          >
                            <div className="flex items-center gap-0.5 font-mono text-[11px] font-semibold">
                              <span>{cell.day}</span>
                              {info.restDay && (
                                <span
                                  className={`text-[9px] ${
                                    useLightText ? 'text-white/85' : 'opacity-70'
                                  }`}
                                >
                                  休
                                </span>
                              )}
                            </div>

                            {workMs > 0 ? (
                              <div className="flex flex-col items-center leading-none">
                                <span
                                  className={`text-[9px] font-mono tabular-nums font-medium ${
                                    useLightText ? 'text-white/95' : ''
                                  }`}
                                >
                                  {formatHoursDecimal(workMs)}
                                </span>
                                {calendarFilter === 'LEAVE_ABSENT' && isLeaveOrAbsent ? (
                                  <span className="text-[8px] font-bold text-amber-800 dark:text-amber-300">
                                    请假/早退
                                  </span>
                                ) : hasOt ? (
                                  <span
                                    className={`text-[8px] font-mono font-bold tabular-nums ${
                                      useLightText
                                        ? 'text-[#FFDAD6]'
                                        : 'text-[#BA1A1A] dark:text-[#FFB4AB]'
                                    }`}
                                  >
                                    +{formatHoursDecimal(st!.overtimeMs)}
                                  </span>
                                ) : null}
                              </div>
                            ) : isLeaveOrAbsent ? (
                              <span className="text-[8px] font-bold text-amber-700 dark:text-amber-300">
                                缺勤
                              </span>
                            ) : (
                              <span className="text-[9px] opacity-35">-</span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* 热力图色阶图例（0h -> <4h -> 4-8h -> 8-10h -> 10-12h -> 12h+） */}
                    <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between px-1 text-[10px] text-[#404944] dark:text-[#BFC9C2]">
                      <span>工时热力：少</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-3.5 h-3.5 rounded-sm border border-black/15 dark:border-white/15 bg-transparent inline-block"
                          title="0h 无记录"
                        />
                        <span
                          className="w-3.5 h-3.5 rounded-sm bg-[#1E6E5C]/15 dark:bg-[#26A688]/20 inline-block"
                          title="< 4 小时"
                        />
                        <span
                          className="w-3.5 h-3.5 rounded-sm bg-[#1E6E5C]/32 dark:bg-[#26A688]/38 inline-block"
                          title="4 – 8 小时"
                        />
                        <span
                          className="w-3.5 h-3.5 rounded-sm bg-[#1E6E5C]/55 dark:bg-[#26A688]/60 inline-block"
                          title="8 – 10 小时"
                        />
                        <span
                          className="w-3.5 h-3.5 rounded-sm bg-[#1E6E5C]/78 dark:bg-[#26A688]/80 inline-block"
                          title="10 – 12 小时"
                        />
                        <span
                          className="w-3.5 h-3.5 rounded-sm bg-[#114B3E] dark:bg-[#1E8E73] inline-block"
                          title="≥ 12 小时"
                        />
                      </div>
                      <span>多 (≥12h)</span>
                    </div>
                  </div>

                  {/* 选中日期详情卡片 */}
                  {(() => {
                    const selStat = dayStats[selectedCalendarDateKey];
                    const info = getDayHolidayInfo(selectedCalendarDateKey);
                    const workMs = selStat?.workMs ?? 0;
                    const stdThresholdMs = settings.standardHours * 3_600_000 * 0.85;
                    const isLeaveOrAbsent =
                      selectedCalendarDateKey < todayKey &&
                      !info.restDay &&
                      (workMs === 0 || workMs < stdThresholdMs);

                    return (
                      <div className="rounded-2xl bg-[#DBE5DE]/50 dark:bg-[#1B2420] p-4 space-y-1.5 text-xs">
                        <div className="font-semibold flex items-center justify-between">
                          <span className="font-mono">{selectedCalendarDateKey}</span>
                          <div className="flex items-center gap-1.5">
                            {isLeaveOrAbsent && (
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                                {workMs === 0 ? '全天请假/缺勤' : '工时不足 (请假/早退)'}
                              </span>
                            )}
                            <span>{info.holidayName || (info.restDay ? '休息日' : '工作日')}</span>
                          </div>
                        </div>
                        {selStat && selStat.workMs > 0 ? (
                          <>
                            <div className="font-mono tabular-nums">
                              首进末出：{selStat.firstInMs ? formatTimeHHMM(selStat.firstInMs) : '--'} –{' '}
                              {selStat.currentlyOpenToday
                                ? '仍在岗'
                                : selStat.lastOutMs
                                ? formatTimeHHMM(selStat.lastOutMs)
                                : '--'}
                            </div>
                            <div className="font-mono tabular-nums">
                              有效上班：{formatDuration(selStat.workMs)} · 加班：
                              <strong className="text-[#BA1A1A] dark:text-[#FFB4AB]">
                                {formatDuration(selStat.overtimeMs)}
                              </strong>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-between text-[#404944] dark:text-[#BFC9C2]">
                            <span>
                              {isLeaveOrAbsent
                                ? '工作日无打卡记录（全天请假或缺勤）'
                                : '当日无在岗记录'}
                            </span>
                            {isLeaveOrAbsent && (
                              <button
                                onClick={() => {
                                  setManualDateKey(selectedCalendarDateKey);
                                  setManualTimeStr('09:00');
                                  setManualIsEnter(true);
                                  setShowManualModal(true);
                                }}
                                className="text-[#1E6E5C] dark:text-[#8DD6C1] font-semibold hover:underline cursor-pointer"
                              >
                                + 补录打卡
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : activeTab === 'stats' ? (
                /* ==================== TAB 4: StatsScreen.kt ==================== */
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {(
                      [
                        { id: 'MONTH', label: '本月' },
                        { id: 'DAYS30', label: '近 30 天' },
                        { id: 'YEAR', label: '本年' },
                      ] as const
                    ).map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setStatsRange(r.id)}
                        className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium cursor-pointer ${
                          statsRange === r.id
                            ? 'bg-[#1E6E5C] text-white dark:bg-[#8DD6C1] dark:text-[#00382C]'
                            : 'bg-[#DBE5DE]/50 dark:bg-[#1B2420]'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-2xl bg-[#DBE5DE]/50 dark:bg-[#1B2420] p-4 space-y-1">
                    <div className="text-xs text-[#404944] dark:text-[#BFC9C2]">
                      加班合计（{settings.calcMode === 'FIRST_IN_LAST_OUT' ? '按首进末出' : '按多段累计'}）
                    </div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-[#BA1A1A] dark:text-[#FFB4AB]">
                      {formatDuration(monthStatsSummary.overtimeMs)}
                    </div>
                    <div className="text-xs text-[#404944] dark:text-[#BFC9C2] font-mono tabular-nums">
                      加班 {monthStatsSummary.otDays} 天 · 出勤 {monthStatsSummary.workDays} 天
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#DBE5DE]/50 dark:bg-[#1B2420] p-4 space-y-2">
                    <div className="text-sm font-semibold">计时模式实时对比</div>
                    <p className="text-xs text-[#404944] dark:text-[#BFC9C2] leading-relaxed">
                      在「首进末出」模式下，系统只取每天第一次进围栏与最后一次离开围栏的时间差，中途外出就餐或定位短暂漂移不会扣减你的上班时长。
                    </p>
                  </div>
                </div>
              ) : (
                /* ==================== TAB 5: SettingsScreen.kt ==================== */
                <div className="space-y-3">
                  {/* 计时模式设置卡片 */}
                  <div className="rounded-2xl bg-[#DBE5DE]/50 dark:bg-[#1B2420] p-4 space-y-2.5">
                    <div className="text-sm font-semibold">工时计时模式</div>
                    <label className="flex items-start gap-2.5 cursor-pointer py-1">
                      <input
                        type="radio"
                        name="calcMode"
                        checked={settings.calcMode === 'FIRST_IN_LAST_OUT'}
                        onChange={() =>
                          setSettings((s) => ({ ...s, calcMode: 'FIRST_IN_LAST_OUT' }))
                        }
                        className="mt-1 accent-[#1E6E5C]"
                      />
                      <div>
                        <div className="text-xs font-semibold">
                          首进末出模式
                        </div>
                        <div className="text-[11px] text-[#404944] dark:text-[#BFC9C2]">
                          只取当天最早进入围栏与最晚离开围栏的时间作为今日上班时间，忽略中途外出
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start gap-2.5 cursor-pointer py-1">
                      <input
                        type="radio"
                        name="calcMode"
                        checked={settings.calcMode === 'INTERVAL_UNION'}
                        onChange={() =>
                          setSettings((s) => ({ ...s, calcMode: 'INTERVAL_UNION' }))
                        }
                        className="mt-1 accent-[#1E6E5C]"
                      />
                      <div>
                        <div className="text-xs font-semibold">多段累计模式</div>
                        <div className="text-[11px] text-[#404944] dark:text-[#BFC9C2]">
                          严格累加每一段在围栏内的停留区间，中途离开围栏不计入在岗时长
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* 加班规则卡片 */}
                  <div className="rounded-2xl bg-[#DBE5DE]/50 dark:bg-[#1B2420] p-4 space-y-3">
                    <div className="text-sm font-semibold">加班规则</div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>每日标准工时</span>
                        <span className="font-mono font-semibold">{settings.standardHours} 小时</span>
                      </div>
                      <input
                        type="range"
                        min={4}
                        max={12}
                        step={0.5}
                        value={settings.standardHours}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, standardHours: Number(e.target.value) }))
                        }
                        className="w-full accent-[#1E6E5C]"
                      />
                    </div>

                    <label className="flex items-center justify-between text-xs cursor-pointer">
                      <span>扣除固定午休时长 ({settings.lunchStartTime}–{settings.lunchEndTime})</span>
                      <input
                        type="checkbox"
                        checked={settings.lunchBreakDeductEnabled}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, lunchBreakDeductEnabled: e.target.checked }))
                        }
                        className="w-4 h-4 accent-[#1E6E5C]"
                      />
                    </label>

                    <label className="flex items-center justify-between text-xs cursor-pointer">
                      <span>周末全天计加班</span>
                      <input
                        type="checkbox"
                        checked={settings.weekendOvertime}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, weekendOvertime: e.target.checked }))
                        }
                        className="w-4 h-4 accent-[#1E6E5C]"
                      />
                    </label>

                    <label className="flex items-center justify-between text-xs cursor-pointer">
                      <span>法定节假日全天计加班</span>
                      <input
                        type="checkbox"
                        checked={settings.holidayOvertime}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, holidayOvertime: e.target.checked }))
                        }
                        className="w-4 h-4 accent-[#1E6E5C]"
                      />
                    </label>
                  </div>

                  {/* 加班时长提醒设置卡片（默认关闭，阈值可调） */}
                  <div className="rounded-2xl bg-[#DBE5DE]/50 dark:bg-[#1B2420] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">加班时长关怀提醒</div>
                        <div className="text-[11px] text-[#404944] dark:text-[#BFC9C2] mt-0.5">
                          开启后，当日加班超过设定阈值时在主页状态卡片显著高亮提示“今日加班较多，注意休息”
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(settings.overtimeAlertEnabled)}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          setSettings((s) => ({
                            ...s,
                            overtimeAlertEnabled: enabled,
                            overtimeAlertThresholdHours: s.overtimeAlertThresholdHours ?? 2,
                          }));
                          showToast(
                            enabled
                              ? `已开启加班提醒（阈值 ${settings.overtimeAlertThresholdHours ?? 2} 小时）`
                              : '已关闭加班提醒'
                          );
                        }}
                        className="w-4 h-4 accent-[#1E6E5C] shrink-0 ml-2 cursor-pointer"
                      />
                    </div>

                    <div
                      className={`space-y-2 pt-2 border-t border-black/5 dark:border-white/5 transition-opacity ${
                        settings.overtimeAlertEnabled ? 'opacity-100' : 'opacity-50'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span>加班提醒阈值</span>
                        <span className="font-mono font-semibold tabular-nums text-[#BA1A1A] dark:text-[#FFB4AB]">
                          {settings.overtimeAlertThresholdHours ?? 2} 小时
                        </span>
                      </div>

                      <input
                        type="range"
                        min={0.5}
                        max={6}
                        step={0.5}
                        value={settings.overtimeAlertThresholdHours ?? 2}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            overtimeAlertThresholdHours: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-[#BA1A1A] cursor-pointer"
                      />

                      <div className="flex items-center gap-1.5 pt-0.5">
                        {[1, 1.5, 2, 3, 4].map((h) => {
                          const active = (settings.overtimeAlertThresholdHours ?? 2) === h;
                          return (
                            <button
                              key={h}
                              type="button"
                              onClick={() =>
                                setSettings((s) => ({
                                  ...s,
                                  overtimeAlertThresholdHours: h,
                                }))
                              }
                              className={`min-h-[28px] px-2.5 rounded-lg text-[11px] font-mono tabular-nums font-medium cursor-pointer transition-colors ${
                                active
                                  ? 'bg-[#BA1A1A] text-white dark:bg-[#FFB4AB] dark:text-[#690005]'
                                  : 'bg-black/5 dark:bg-white/5 text-[#404944] dark:text-[#BFC9C2]'
                              }`}
                            >
                              {h}h
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Android Material 3 Bottom NavigationBar (1:1 对应 AppNav.kt 的 5 个底部标签) */}
            {mapPickerWpId === null && (
              <div className="h-16 bg-[#EBF3EE] dark:bg-[#161F1B] border-t border-black/5 dark:border-white/5 grid grid-cols-5 items-center px-1 shrink-0">
                {(
                  [
                    { id: 'home', label: '主页', icon: Home },
                    { id: 'records', label: '记录', icon: ListChecks },
                    { id: 'calendar', label: '日历', icon: CalendarDays },
                    { id: 'stats', label: '统计', icon: BarChart2 },
                    { id: 'settings', label: '设置', icon: Settings },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  const selected = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className="min-h-[48px] flex flex-col items-center justify-center cursor-pointer"
                    >
                      <div
                        className={`px-3.5 py-1 rounded-full transition-colors ${
                          selected
                            ? 'bg-[#A9F2DC] dark:bg-[#00513F] text-[#002017] dark:text-[#A9F2DC]'
                            : 'text-[#404944] dark:text-[#BFC9C2]'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-medium mt-0.5">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ===================================================================
            COLUMN 2 (lg:col-span-7): 手机异常场景物理沙盒 + Android Kotlin 源码实现
            =================================================================== */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. 针对用户提出的两个核心异常场景 + 首进末出模式的实机动作模拟器 */}
          <section className="rounded-2xl border border-emerald-900/10 dark:border-emerald-100/10 bg-white dark:bg-[#131C18] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  安卓端异常边界场景模拟器（点击按钮直接驱动左侧手机 App）
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  专门验证你提到的「首进末出计时」「App一启动已在围栏内」「关机时在围栏内、开机已出来」三大场景
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* 场景按钮 1：App一启动就已经在围栏内 */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-col justify-between space-y-3">
                <div>
                  <div className="text-xs font-bold text-[#1E6E5C] dark:text-[#8DD6C1] flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 shrink-0" />
                    场景 A：App 启动即在围栏内
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    到了公司工位才首次打开 App 或开启服务，无需发生“围栏外→围栏内”跨越，首次定位即自动补记今日上班卡；若含昨日未闭合记录则自动先结清昨日。
                  </p>
                </div>
                <button
                  onClick={simulateAppStartAlreadyInside}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1E6E5C] hover:bg-[#175849] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  模拟在围栏内启动 App
                </button>
              </div>

              {/* 场景按钮 2：关机时还在围栏，开机已经出来了 */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-col justify-between space-y-3">
                <div>
                  <div className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <PowerOff className="w-4 h-4 shrink-0" />
                    场景 B：关机在围栏 → 开机已离开
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    下班前手机在公司没电关机（DB仍为在岗），回家后开机定位已在围栏外。自动取「关机前最后一次在岗心跳时间」补记下班，绝不把关机时段算进加班。
                  </p>
                </div>
                <button
                  onClick={simulateShutdownInsideThenBootOutside}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  模拟关机在岗 → 场外开机
                </button>
              </div>

              {/* 场景按钮 3：日内多次进出围栏 -> 首进末出计算 */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-col justify-between space-y-3">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#1E6E5C] shrink-0" />
                    场景 C：中途出围栏吃饭/拿快递
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    模拟今日 09:00 进围栏、12:00 出围栏吃午饭、13:30 回围栏、18:30 下班。在「首进末出」模式下直接按 09:00–18:30 计 9.5 小时。
                  </p>
                </div>
                <button
                  onClick={simulateMiddayOutAndBack}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  生成今日中途进出样本
                </button>
              </div>
            </div>

            {/* 实时服务运行与自愈诊断日志流 */}
            <div className="rounded-xl bg-[#0F1512] text-[#A9F2DC] p-3.5 font-mono text-[11px] space-y-1 max-h-36 overflow-y-auto border border-emerald-900/30">
              <div className="text-xs font-semibold text-white pb-1 flex items-center justify-between">
                <span>AppLogger 实时诊断日志 (TrackingService / BootReceiver)</span>
                <button
                  onClick={() => {
                    setWorkplaces(INITIAL_WORKPLACES);
                    setEvents(generateSeedEvents(Date.now()));
                    setSettings(DEFAULT_SETTINGS);
                    showToast('已重置手机测试数据');
                  }}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> 重置数据
                </button>
              </div>
              {diagnosticLogs.map((line, idx) => (
                <div key={idx} className="leading-relaxed opacity-90">
                  {line}
                </div>
              ))}
            </div>
          </section>

          {/* 2. Android Studio Kotlin 源码改动清单（可直接粘贴替换到你的安卓工程） */}
          <section className="rounded-2xl border border-emerald-900/10 dark:border-emerald-100/10 bg-white dark:bg-[#131C18] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  对应的 Android Kotlin 源码改动（直接复制到你的 Android Studio 项目）
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  严格基于你仓库中的 `OvertimeCalculator.kt`、`TrackingService.kt`、`BootReceiver.kt` 编写
                </p>
              </div>
            </div>

            {/* 补丁切换标签 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {KOTLIN_PATCHES.map((patch) => {
                const active = patch.id === activePatch.id;
                return (
                  <button
                    key={patch.id}
                    onClick={() => setSelectedPatchId(patch.id)}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-[#1E6E5C] bg-[#F6FBF7] dark:bg-[#1B2822]'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900'
                    }`}
                  >
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {patch.title}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {patch.filePath}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 原理说明 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40">
                <div className="font-bold text-rose-700 dark:text-rose-300 mb-1">
                  边界问题分析：
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  {activePatch.problemAnalysis}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40">
                <div className="font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                  处理逻辑设计：
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  {activePatch.solutionSummary}
                </p>
              </div>
            </div>

            {/* Kotlin 代码框 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-400">
                  {activePatch.filePath}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(activePatch.optimizedCode);
                    setCopiedId(activePatch.id);
                    setTimeout(() => setCopiedId(null), 2000);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#1E6E5C] text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === activePatch.id ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> 已复制代码
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> 复制此文件 Kotlin 代码
                    </>
                  )}
                </button>
              </div>
              <pre className="p-4 rounded-xl bg-[#0F1512] text-[#A9F2DC] text-xs font-mono overflow-x-auto max-h-[380px] leading-relaxed border border-emerald-900/30">
                <code>{activePatch.optimizedCode}</code>
              </pre>
            </div>
          </section>
        </div>
      </main>

      {/* 手动补录弹窗 (对应 RecordsScreen.kt 的 ManualEventDialog) */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#F6FBF7] dark:bg-[#18221D] p-5 space-y-4 shadow-xl border border-white/10">
            <h3 className="text-base font-bold">手动补录打卡记录</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setManualIsEnter(true)}
                className={`min-h-[42px] rounded-xl text-xs font-semibold cursor-pointer ${
                  manualIsEnter
                    ? 'bg-[#1E6E5C] text-white'
                    : 'bg-[#DBE5DE]/60 dark:bg-[#232D28]'
                }`}
              >
                上班 (ENTER)
              </button>
              <button
                onClick={() => setManualIsEnter(false)}
                className={`min-h-[42px] rounded-xl text-xs font-semibold cursor-pointer ${
                  !manualIsEnter
                    ? 'bg-[#1E6E5C] text-white'
                    : 'bg-[#DBE5DE]/60 dark:bg-[#232D28]'
                }`}
              >
                下班 (EXIT)
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <label className="block mb-1">日期</label>
                <input
                  type="date"
                  value={manualDateKey}
                  onChange={(e) => setManualDateKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#404944]/30 font-mono bg-transparent"
                />
              </div>
              <div>
                <label className="block mb-1">时间</label>
                <input
                  type="time"
                  value={manualTimeStr}
                  onChange={(e) => setManualTimeStr(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#404944]/30 font-mono bg-transparent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowManualModal(false)}
                className="min-h-[40px] px-4 text-xs font-semibold cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={() => {
                  const [hh, mm] = manualTimeStr.split(':').map(Number);
                  const ts =
                    startOfLocalDateMs(manualDateKey) + ((hh || 0) * 60 + (mm || 0)) * 60_000;
                  setEvents((prev) => [
                    ...prev,
                    {
                      id: Date.now(),
                      workplaceId: manualWpId,
                      type: manualIsEnter ? 'ENTER' : 'EXIT',
                      timestamp: ts,
                      latitude: null,
                      longitude: null,
                      manual: true,
                      origin: 'MANUAL',
                      note: '手动补录',
                    },
                  ]);
                  setShowManualModal(false);
                  showToast('已保存手动补录记录');
                }}
                className="min-h-[40px] px-5 rounded-full bg-[#1E6E5C] text-white text-xs font-semibold cursor-pointer"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 推送到 GitHub (lutcraft/workTimeTrace) 弹窗 ==================== */}
      {showGitPushModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-[#161F1B] border border-emerald-900/15 dark:border-emerald-100/15 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  推送代码到 GitHub
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  已基于你的仓库 <code className="font-mono text-[#1E6E5C] dark:text-[#8DD6C1]">lutcraft/workTimeTrace</code> (master) 生成全部 10 个 Android 源文件的标准 Git 补丁
                </p>
              </div>
              <button
                onClick={() => setShowGitPushModal(false)}
                className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer px-2 py-1"
              >
                关闭
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* 方案 1：推送到原有 Android 仓库 lutcraft/workTimeTrace */}
              <div className="rounded-2xl bg-slate-50 dark:bg-[#0F1512] p-4 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                  <span>方案 A：直接应用补丁并推送到你的 Android 仓库 (lutcraft/workTimeTrace)</span>
                  <span className="text-[11px] font-mono text-[#1E6E5C] dark:text-[#8DD6C1]">10 files changed</span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  包含 <code className="font-mono">SettingsStore.kt</code>、<code className="font-mono">OvertimeCalculator.kt</code>、<code className="font-mono">TrackingService.kt</code>、<code className="font-mono">BootReceiver.kt</code>、<code className="font-mono">HomeScreen.kt</code>、<code className="font-mono">RecordsScreen.kt</code>、<code className="font-mono">CalendarScreen.kt</code>、<code className="font-mono">SettingsScreen.kt</code> 等全部改动。
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="/workTimeTrace.patch"
                    download="workTimeTrace.patch"
                    onClick={() => showToast('已下载 workTimeTrace.patch 标准 Git 补丁')}
                    className="min-h-[38px] px-4 py-2 rounded-xl bg-[#1E6E5C] hover:bg-[#175849] text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    1. 下载 workTimeTrace.patch
                  </a>
                  <button
                    onClick={handleDownloadAllKotlin}
                    className="min-h-[38px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    下载合并版 .kt 源码
                  </button>
                </div>

                <div className="pt-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                    <span>2. 在本地 workTimeTrace 项目根目录执行以下命令即可推送：</span>
                    <button
                      onClick={() => {
                        const cmd = `git apply workTimeTrace.patch && git add -A && git commit -m "feat: 首进末出计时、开关机围栏自愈、日历热力图与筛选、CSV导出及加班关怀提醒" && git push origin master`;
                        navigator.clipboard.writeText(cmd);
                        showToast('已复制 Git 推送命令');
                      }}
                      className="text-[#1E6E5C] dark:text-[#8DD6C1] font-semibold hover:underline cursor-pointer"
                    >
                      复制命令
                    </button>
                  </div>
                  <pre className="p-2.5 rounded-xl bg-[#0B110E] text-[#A9F2DC] font-mono text-[11px] overflow-x-auto">
{`git apply workTimeTrace.patch
git add -A
git commit -m "feat: 首进末出计时、开关机围栏自愈、日历热力图与筛选、CSV导出及加班关怀提醒"
git push origin master`}
                  </pre>
                </div>
              </div>

              {/* 方案 2：使用 AI Studio 顶部工具栏一键同步当前预览工程到 GitHub */}
              <div className="rounded-2xl bg-slate-50 dark:bg-[#0F1512] p-4 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  方案 B：使用 AI Studio 顶部工具栏一键同步当前预览工程
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  如果你想将当前可交互的预览版应用直接推送到 GitHub 新仓库，请点击 Google AI Studio 页面右上角工具栏中的 <strong>GitHub 图标（Save to GitHub）</strong>，按提示授权 GitHub 即可一键完成推送。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
