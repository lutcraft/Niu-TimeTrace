export type EventType = 'ENTER' | 'EXIT';

export type CalcMode = 'INTERVAL_UNION' | 'FIRST_IN_LAST_OUT';

export type EventOrigin =
  | 'NORMAL_TRANSITION'      // 常规进出围栏触发
  | 'STARTUP_INSIDE_COMPENSATED' // 异常1修复：App首次启动/服务恢复时人已在围栏内自动补记上班
  | 'OFFLINE_EXIT_RECONCILED'    // 异常2修复：关机/无信号在岗，重启/恢复后已在围栏外，按最后在线心跳时间补记下班
  | 'MANUAL';                // 手动补录

export interface Workplace {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  enabled: boolean;
  createdAt: number;
}

export interface AttendanceEvent {
  id: number;
  workplaceId: number;
  type: EventType;
  timestamp: number;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters?: number;
  manual: boolean;
  origin?: EventOrigin;
  note?: string;
}

export interface AppSettings {
  calcMode: CalcMode; // 新增：累计多段并集 vs 首进末出跨度
  standardHours: number;
  weekendOvertime: boolean;
  holidayOvertime: boolean;
  locationIntervalSec: number;
  trackingEnabled: boolean;
  lunchBreakDeductEnabled: boolean;
  lunchStartTime: string; // "12:00"
  lunchEndTime: string;   // "13:30"
  exitConfirmations: number;
  hysteresisBufferMeters: number;
  accuracyExpansionFactor: number;
  hourlyBaseWage: number;
  workdayOvertimeMultiplier: number;
  weekendOvertimeMultiplier: number;
  holidayOvertimeMultiplier: number;
  overtimeAlertEnabled: boolean;
  overtimeAlertThresholdHours: number;
}

export interface PresenceInterval {
  startMs: number;
  endMs: number;
  workplaceId: number;
  isOpen?: boolean;
}

export interface DayStat {
  dateKey: string; // YYYY-MM-DD
  calcModeUsed: CalcMode;
  intervalUnionGrossMs: number; // 多段并集毛工时（用于对比展示）
  firstLastSpanGrossMs: number; // 首进末出跨度毛工时（用于对比展示）
  grossWorkMs: number;          // 当前生效模式下的毛工时
  lunchDeductedMs: number;
  workMs: number;               // 净工时
  overtimeMs: number;
  firstInMs: number | null;
  lastOutMs: number | null;
  currentlyOpenToday: boolean;
  intervals: PresenceInterval[];
  orphanEvents: AttendanceEvent[];
  abnormalEvents: AttendanceEvent[]; // 当天经过启动补偿或关机回溯修正的事件
  restDay: boolean;
  holidayName: string | null;
  adjustedWorkday: boolean;
  estimatedOvertimePay: number;
}

// Haversine formula matching GeoUtils.kt
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const EARTH_RADIUS_METERS = 6371008.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.asin(Math.sqrt(Math.min(1.0, Math.max(0.0, a))));
  return EARTH_RADIUS_METERS * c;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

interface YearPlan {
  holidays: Record<string, string>;
  adjustedWorkdays: Set<string>;
}

const HOLIDAY_PLANS: Record<number, YearPlan> = {
  2025: {
    holidays: {
      '01-01': '元旦',
      '01-28': '春节', '01-29': '春节', '01-30': '春节', '01-31': '春节',
      '02-01': '春节', '02-02': '春节', '02-03': '春节', '02-04': '春节',
      '04-04': '清明节', '04-05': '清明节', '04-06': '清明节',
      '05-01': '劳动节', '05-02': '劳动节', '05-03': '劳动节', '05-04': '劳动节', '05-05': '劳动节',
      '05-31': '端午节', '06-01': '端午节', '06-02': '端午节',
      '10-01': '国庆节', '10-02': '国庆·中秋', '10-03': '国庆·中秋', '10-04': '国庆·中秋',
      '10-05': '国庆·中秋', '10-06': '国庆·中秋', '10-07': '国庆·中秋', '10-08': '国庆·中秋',
    },
    adjustedWorkdays: new Set(['01-26', '02-08', '04-27', '09-28', '10-11']),
  },
  2026: {
    holidays: {
      '01-01': '元旦', '01-02': '元旦', '01-03': '元旦',
      '02-15': '春节', '02-16': '春节', '02-17': '春节', '02-18': '春节', '02-19': '春节',
      '02-20': '春节', '02-21': '春节', '02-22': '春节', '02-23': '春节',
      '04-04': '清明节', '04-05': '清明节', '04-06': '清明节',
      '05-01': '劳动节', '05-02': '劳动节', '05-03': '劳动节', '05-04': '劳动节', '05-05': '劳动节',
      '06-19': '端午节', '06-20': '端午节', '06-21': '端午节',
      '09-25': '中秋节', '09-26': '中秋节', '09-27': '中秋节',
      '10-01': '国庆节', '10-02': '国庆节', '10-03': '国庆节', '10-04': '国庆节',
      '10-05': '国庆节', '10-06': '国庆节', '10-07': '国庆节',
    },
    adjustedWorkdays: new Set(['01-04', '02-14', '02-28', '05-09', '09-20', '10-10']),
  },
  2027: {
    holidays: {
      '01-01': '元旦', '01-02': '元旦', '01-03': '元旦',
      '02-05': '春节', '02-06': '春节', '02-07': '春节', '02-08': '春节',
      '02-09': '春节', '02-10': '春节', '02-11': '春节', '02-12': '春节',
      '04-03': '清明节', '04-04': '清明节', '04-05': '清明节',
      '05-01': '劳动节', '05-02': '劳动节', '05-03': '劳动节', '05-04': '劳动节', '05-05': '劳动节',
      '06-08': '端午节', '06-09': '端午节', '06-10': '端午节',
      '09-15': '中秋节', '09-16': '中秋节', '09-17': '中秋节',
      '10-01': '国庆节', '10-02': '国庆节', '10-03': '国庆节', '10-04': '国庆节',
      '10-05': '国庆节', '10-06': '国庆节', '10-07': '国庆节',
    },
    adjustedWorkdays: new Set(['01-31', '02-13', '04-25', '05-08', '09-18', '09-26', '10-09']),
  },
};

export function toDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfLocalDateMs(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

export function getDayHolidayInfo(dateKey: string): {
  holidayName: string | null;
  adjustedWorkday: boolean;
  restDay: boolean;
} {
  const [y, m, d] = dateKey.split('-').map(Number);
  const mmdd = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const plan = HOLIDAY_PLANS[y];
  const holidayName = plan?.holidays[mmdd] ?? null;
  const adjustedWorkday = plan?.adjustedWorkdays.has(mmdd) ?? false;
  const dateObj = new Date(y, m - 1, d);
  const dow = dateObj.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const restDay = holidayName !== null ? true : adjustedWorkday ? false : isWeekend;
  return { holidayName, adjustedWorkday, restDay };
}

export function parseTimeMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * 考勤统计核心算法（支持「累计在岗区间并集」与「首进末出时间跨度」双模式）：
 * - INTERVAL_UNION: 每次 ENTER-EXIT 配对为一段在岗区间，同一天多段取并集（适合严格统计在围栏内净停留时长）
 * - FIRST_IN_LAST_OUT: 仅统计当天首次进入围栏（First In）与最后一次离开围栏（Last Out，若当前仍在围栏内则实时取 nowMs）的时间差作为今日上班时间（中途外出午饭、拿快递、短暂漂移均不扣减工时）
 */
export function computeDayStats(
  events: AttendanceEvent[],
  settings: AppSettings,
  nowMs: number = Date.now()
): Record<string, DayStat> {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const openMap = new Map<number, AttendanceEvent>();
  const rawIntervals: PresenceInterval[] = [];
  const orphansByDay: Record<string, AttendanceEvent[]> = {};
  const abnormalsByDay: Record<string, AttendanceEvent[]> = {};

  const recordOrphan = (ev: AttendanceEvent) => {
    const k = toDateKey(ev.timestamp);
    if (!orphansByDay[k]) orphansByDay[k] = [];
    orphansByDay[k].push(ev);
  };

  for (const ev of sorted) {
    if (
      ev.origin === 'STARTUP_INSIDE_COMPENSATED' ||
      ev.origin === 'OFFLINE_EXIT_RECONCILED'
    ) {
      const k = toDateKey(ev.timestamp);
      if (!abnormalsByDay[k]) abnormalsByDay[k] = [];
      abnormalsByDay[k].push(ev);
    }

    if (ev.type === 'ENTER') {
      const prev = openMap.get(ev.workplaceId);
      if (prev) {
        recordOrphan(prev);
        if (prev.timestamp < ev.timestamp) {
          rawIntervals.push({
            startMs: prev.timestamp,
            endMs: ev.timestamp,
            workplaceId: ev.workplaceId,
            isOpen: false,
          });
        }
      }
      openMap.set(ev.workplaceId, ev);
    } else {
      const enterEv = openMap.get(ev.workplaceId);
      if (enterEv && enterEv.timestamp <= ev.timestamp) {
        openMap.delete(ev.workplaceId);
        rawIntervals.push({
          startMs: enterEv.timestamp,
          endMs: ev.timestamp,
          workplaceId: ev.workplaceId,
          isOpen: false,
        });
      } else {
        recordOrphan(ev);
      }
    }
  }

  // 未闭合的 ENTER 事件：实时延伸到 nowMs
  for (const [wpId, enterEv] of openMap.entries()) {
    const end = Math.max(enterEv.timestamp, nowMs);
    rawIntervals.push({
      startMs: enterEv.timestamp,
      endMs: end,
      workplaceId: wpId,
      isOpen: true,
    });
  }

  // 按自然日切分跨午夜区间
  const perDayIntervals: Record<string, PresenceInterval[]> = {};
  for (const iv of rawIntervals) {
    let cur = iv.startMs;
    while (cur < iv.endMs) {
      const dateKey = toDateKey(cur);
      const dayStart = startOfLocalDateMs(dateKey);
      const nextDayStart = dayStart + 86_400_000;
      const segEnd = Math.min(iv.endMs, nextDayStart);
      if (segEnd > cur) {
        if (!perDayIntervals[dateKey]) perDayIntervals[dateKey] = [];
        perDayIntervals[dateKey].push({
          startMs: cur,
          endMs: segEnd,
          workplaceId: iv.workplaceId,
          isOpen: iv.isOpen && segEnd === iv.endMs,
        });
      }
      cur = nextDayStart;
    }
  }

  const allDateKeys = new Set([
    ...Object.keys(perDayIntervals),
    ...Object.keys(orphansByDay),
    ...Object.keys(abnormalsByDay),
  ]);

  const standardMs = Math.round(settings.standardHours * 60) * 60_000;
  const lunchStartMin = parseTimeMinutes(settings.lunchStartTime);
  const lunchEndMin = parseTimeMinutes(settings.lunchEndTime);

  const result: Record<string, DayStat> = {};

  for (const dateKey of allDateKeys) {
    const list = perDayIntervals[dateKey] ?? [];
    const sortedIv = [...list].sort((a, b) => a.startMs - b.startMs);
    const merged: PresenceInterval[] = [];

    for (const iv of sortedIv) {
      const last = merged[merged.length - 1];
      if (last && iv.startMs <= last.endMs) {
        last.endMs = Math.max(last.endMs, iv.endMs);
        last.isOpen = Boolean(last.isOpen || iv.isOpen);
      } else {
        merged.push({ ...iv });
      }
    }

    const firstInMs = merged.length > 0 ? merged[0].startMs : null;
    const lastOutMs = merged.length > 0 ? merged[merged.length - 1].endMs : null;
    const currentlyOpenToday = merged.some((iv) => iv.isOpen);

    // 1. 多段区间并集毛工时
    const intervalUnionGrossMs = merged.reduce((acc, iv) => acc + (iv.endMs - iv.startMs), 0);

    // 2. 首进末出跨度毛工时（从当天第一次进围栏到最后一次出围栏/当前在岗时刻）
    const firstLastSpanGrossMs =
      firstInMs !== null && lastOutMs !== null && lastOutMs >= firstInMs
        ? lastOutMs - firstInMs
        : 0;

    // 根据用户所选计时模式决定有效区间与毛工时
    const effectiveIntervals: PresenceInterval[] =
      settings.calcMode === 'FIRST_IN_LAST_OUT' && firstInMs !== null && lastOutMs !== null
        ? [
            {
              startMs: firstInMs,
              endMs: lastOutMs,
              workplaceId: merged[0].workplaceId,
              isOpen: currentlyOpenToday,
            },
          ]
        : merged;

    const grossWorkMs =
      settings.calcMode === 'FIRST_IN_LAST_OUT' ? firstLastSpanGrossMs : intervalUnionGrossMs;

    // 午休重叠核减
    let lunchDeductedMs = 0;
    if (
      settings.lunchBreakDeductEnabled &&
      lunchEndMin > lunchStartMin &&
      effectiveIntervals.length > 0
    ) {
      const dayStart = startOfLocalDateMs(dateKey);
      const lunchStartMs = dayStart + lunchStartMin * 60_000;
      const lunchEndMs = dayStart + lunchEndMin * 60_000;
      for (const iv of effectiveIntervals) {
        const overlapStart = Math.max(iv.startMs, lunchStartMs);
        const overlapEnd = Math.min(iv.endMs, lunchEndMs);
        if (overlapEnd > overlapStart) {
          lunchDeductedMs += overlapEnd - overlapStart;
        }
      }
    }

    const workMs = Math.max(0, grossWorkMs - lunchDeductedMs);
    const { holidayName, adjustedWorkday, restDay } = getDayHolidayInfo(dateKey);

    let overtimeMs = 0;
    if (restDay) {
      const ruleOn = holidayName !== null ? settings.holidayOvertime : settings.weekendOvertime;
      overtimeMs = ruleOn ? workMs : 0;
    } else {
      overtimeMs = Math.max(0, workMs - standardMs);
    }

    const otHours = overtimeMs / 3_600_000;
    const multiplier =
      holidayName !== null
        ? settings.holidayOvertimeMultiplier
        : restDay
        ? settings.weekendOvertimeMultiplier
        : settings.workdayOvertimeMultiplier;
    const estimatedOvertimePay = otHours * settings.hourlyBaseWage * multiplier;

    result[dateKey] = {
      dateKey,
      calcModeUsed: settings.calcMode,
      intervalUnionGrossMs,
      firstLastSpanGrossMs,
      grossWorkMs,
      lunchDeductedMs,
      workMs,
      overtimeMs,
      firstInMs,
      lastOutMs,
      currentlyOpenToday,
      intervals: merged,
      orphanEvents: orphansByDay[dateKey] ?? [],
      abnormalEvents: abnormalsByDay[dateKey] ?? [],
      restDay,
      holidayName,
      adjustedWorkday,
      estimatedOvertimePay,
    };
  }

  return result;
}

export function currentlyInside(events: AttendanceEvent[]): boolean {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const open = new Set<number>();
  for (const ev of sorted) {
    if (ev.type === 'ENTER') open.add(ev.workplaceId);
    else open.delete(ev.workplaceId);
  }
  return open.size > 0;
}

export function currentSessionStartMs(events: AttendanceEvent[]): number | null {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const open = new Map<number, number>();
  for (const ev of sorted) {
    if (ev.type === 'ENTER') open.set(ev.workplaceId, ev.timestamp);
    else open.delete(ev.workplaceId);
  }
  if (open.size === 0) return null;
  return Math.max(...Array.from(open.values()));
}

export function formatDuration(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} 分钟`;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分钟`;
}

export function formatHoursDecimal(ms: number): string {
  return (Math.max(0, ms) / 3_600_000).toFixed(1) + 'h';
}

export function formatTimeHHMM(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
