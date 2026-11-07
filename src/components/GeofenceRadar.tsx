import React, { useState, useRef, useEffect } from 'react';
import {
  MapPin,
  Navigation,
  ShieldCheck,
  AlertTriangle,
  Plus,
  Trash2,
  LocateFixed,
  Sliders,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import {
  Workplace,
  AppSettings,
  AttendanceEvent,
  distanceMeters,
  formatDistance,
  formatTimeHHMM,
} from '../core/overtimeEngine';

interface GeofenceRadarProps {
  workplaces: Workplace[];
  activeWorkplaceId: number;
  onSelectWorkplace: (id: number) => void;
  onSaveWorkplace: (wp: Workplace) => void;
  onDeleteWorkplace: (id: number) => void;
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  currentlyInside: boolean;
  onTriggerAttendanceEvent: (type: 'ENTER' | 'EXIT', lat: number, lng: number, accuracy: number) => void;
  recentEvents: AttendanceEvent[];
}

interface PingLog {
  id: number;
  timeStr: string;
  distMeters: number;
  accuracyMeters: number;
  effectiveExitRadius: number;
  v110Action: string;
  v120Action: string;
  preventedFalseExit: boolean;
}

export const GeofenceRadar: React.FC<GeofenceRadarProps> = ({
  workplaces,
  activeWorkplaceId,
  onSelectWorkplace,
  onSaveWorkplace,
  onDeleteWorkplace,
  settings,
  onUpdateSettings,
  currentlyInside,
  onTriggerAttendanceEvent,
}) => {
  const activeWp = workplaces.find((w) => w.id === activeWorkplaceId) || workplaces[0];

  // Simulated user offset in meters from the workplace center (dx, dy)
  const [offsetMeters, setOffsetMeters] = useState<{ dx: number; dy: number }>({
    dx: currentlyInside ? 35 : 240,
    dy: currentlyInside ? -25 : 110,
  });
  const [simAccuracy, setSimAccuracy] = useState<number>(28);
  const [outsideStrikeCount, setOutsideStrikeCount] = useState<number>(0);
  const [v110OutsideCount, setV110OutsideCount] = useState<number>(0);
  const [v110InsideState, setV110InsideState] = useState<boolean>(currentlyInside);
  const [pingLogs, setPingLogs] = useState<PingLog[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [editingWp, setEditingWp] = useState<boolean>(false);
  const [formName, setFormName] = useState<string>(activeWp?.name ?? '');
  const [formLat, setFormLat] = useState<string>(String(activeWp?.latitude ?? 22.54051));
  const [formLng, setFormLng] = useState<string>(String(activeWp?.longitude ?? 113.95182));
  const [formRadius, setFormRadius] = useState<number>(activeWp?.radiusMeters ?? 180);
  const [geoStatusMsg, setGeoStatusMsg] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (activeWp) {
      setFormName(activeWp.name);
      setFormLat(String(activeWp.latitude));
      setFormLng(String(activeWp.longitude));
      setFormRadius(activeWp.radiusMeters);
    }
  }, [activeWp]);

  const currentDist = Math.round(Math.hypot(offsetMeters.dx, offsetMeters.dy));
  const baseRadius = activeWp?.radiusMeters ?? 180;
  const effectiveExitRadius = Math.round(
    baseRadius + settings.hysteresisBufferMeters + simAccuracy * settings.accuracyExpansionFactor
  );
  const lowAccuracyThreshold = Math.round(Math.max(baseRadius * 1.5, 250));
  const isLowAccuracyBlocked = currentlyInside && simAccuracy > lowAccuracyThreshold;

  // Convert offset meters to simulated GPS coordinates around activeWp
  const simLat = (activeWp?.latitude ?? 22.54051) + (offsetMeters.dy * -1) / 111_320;
  const simLng =
    (activeWp?.longitude ?? 113.95182) +
    offsetMeters.dx / (111_320 * Math.cos(((activeWp?.latitude ?? 22.54) * Math.PI) / 180));

  // Scale for radar SVG: max display range is max(baseRadius * 1.9, 360) meters mapped to 150px radius
  const maxRangeMeters = Math.max(effectiveExitRadius * 1.35, 340);
  const pxPerMeter = 145 / maxRangeMeters;

  const updatePointerOffset = (clientX: number, clientY: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dxPx = clientX - centerX;
    const dyPx = clientY - centerY;
    const dxM = Math.round(dxPx / pxPerMeter);
    const dyM = Math.round(dyPx / pxPerMeter);
    const clampedDist = Math.hypot(dxM, dyM);
    if (clampedDist > maxRangeMeters * 1.15) {
      const ratio = (maxRangeMeters * 1.15) / clampedDist;
      setOffsetMeters({ dx: Math.round(dxM * ratio), dy: Math.round(dyM * ratio) });
    } else {
      setOffsetMeters({ dx: dxM, dy: dyM });
    }
  };

  // Run one location callback through both v1.1.0 and v1.2.0 state machines
  const fireSimulatedPing = (customDx?: number, customDy?: number, customAcc?: number) => {
    const dx = customDx ?? offsetMeters.dx;
    const dy = customDy ?? offsetMeters.dy;
    const acc = customAcc ?? simAccuracy;
    const dist = Math.round(Math.hypot(dx, dy));
    const effRadius = Math.round(
      baseRadius + settings.hysteresisBufferMeters + acc * settings.accuracyExpansionFactor
    );

    // 1. Original v1.1.0 calculation
    const v110InsideNow = dist <= baseRadius;
    let v110ResultText = '保持状态';
    let nextV110Inside = v110InsideState;
    let nextV110Count = v110OutsideCount;

    if (v110InsideNow && !v110InsideState) {
      nextV110Inside = true;
      nextV110Count = 0;
      v110ResultText = '触发上班 (ENTER)';
    } else if (!v110InsideNow && v110InsideState) {
      nextV110Count += 1;
      if (nextV110Count >= 2) {
        nextV110Inside = false;
        nextV110Count = 0;
        v110ResultText = '误判下班 (EXIT)';
      } else {
        v110ResultText = `越界计数 (${nextV110Count}/2)`;
      }
    } else {
      nextV110Count = 0;
      v110ResultText = v110InsideState ? '在岗保持' : '场外保持';
    }
    setV110InsideState(nextV110Inside);
    setV110OutsideCount(nextV110Count);

    // 2. Optimized v1.2.0 calculation
    let v120ResultText = '保持状态';
    const lowAccLimit = Math.max(baseRadius * 1.5, 250);
    let preventedFalseExit = false;

    if (currentlyInside && acc > lowAccLimit) {
      v120ResultText = `拦截劣质基站漂移 (精度 ${acc}m > ${Math.round(lowAccLimit)}m)`;
      preventedFalseExit = !v110InsideNow;
    } else {
      const v120InsideNow = currentlyInside ? dist <= effRadius : dist <= baseRadius;
      if (v120InsideNow && !currentlyInside) {
        setOutsideStrikeCount(0);
        v120ResultText = '确认到岗 (ENTER 落库)';
        onTriggerAttendanceEvent('ENTER', simLat, simLng, acc);
      } else if (!v120InsideNow && currentlyInside) {
        const nextCount = outsideStrikeCount + 1;
        if (nextCount >= settings.exitConfirmations) {
          setOutsideStrikeCount(0);
          v120ResultText = `确认下班 (连续 ${settings.exitConfirmations} 次越过动态环 EXIT 落库)`;
          onTriggerAttendanceEvent('EXIT', simLat, simLng, acc);
        } else {
          setOutsideStrikeCount(nextCount);
          v120ResultText = `越过迟滞环计数 (${nextCount}/${settings.exitConfirmations})`;
        }
      } else {
        setOutsideStrikeCount(0);
        if (currentlyInside && dist > baseRadius && dist <= effRadius) {
          v120ResultText = `迟滞环保护生效 (${dist}m ≤ ${effRadius}m 不触发离岗)`;
          preventedFalseExit = true;
        } else {
          v120ResultText = currentlyInside ? '在岗稳定保持' : '范围外待命';
        }
      }
    }

    const nowStr = formatTimeHHMM(Date.now()) + ':' + String(new Date().getSeconds()).padStart(2, '0');
    setPingLogs((prev) => [
      {
        id: Date.now() + Math.random(),
        timeStr: nowStr,
        distMeters: dist,
        accuracyMeters: acc,
        effectiveExitRadius: effRadius,
        v110Action: v110ResultText,
        v120Action: v120ResultText,
        preventedFalseExit,
      },
      ...prev.slice(0, 7),
    ]);
  };

  // Scenario presets for one-click verification
  const runScenario = (mode: 'arrive' | 'indoor_drift' | 'cell_tower_jump' | 'real_leave') => {
    if (mode === 'arrive') {
      const dx = 30;
      const dy = -20;
      const acc = 15;
      setOffsetMeters({ dx, dy });
      setSimAccuracy(acc);
      setTimeout(() => fireSimulatedPing(dx, dy, acc), 30);
    } else if (mode === 'indoor_drift') {
      // Drifted slightly outside baseRadius (e.g., baseRadius + 18m) with 45m indoor WiFi accuracy
      const targetDist = baseRadius + 18;
      const dx = Math.round(targetDist * 0.85);
      const dy = Math.round(targetDist * 0.52);
      const acc = 48;
      setOffsetMeters({ dx, dy });
      setSimAccuracy(acc);
      setTimeout(() => fireSimulatedPing(dx, dy, acc), 30);
    } else if (mode === 'cell_tower_jump') {
      // Cell tower jump 320m away with terrible 310m accuracy
      const dx = 240;
      const dy = -210;
      const acc = 310;
      setOffsetMeters({ dx, dy });
      setSimAccuracy(acc);
      setTimeout(() => fireSimulatedPing(dx, dy, acc), 30);
    } else if (mode === 'real_leave') {
      const targetDist = effectiveExitRadius + 65;
      const dx = Math.round(targetDist * 0.8);
      const dy = Math.round(targetDist * 0.6);
      const acc = 16;
      setOffsetMeters({ dx, dy });
      setSimAccuracy(acc);
      setTimeout(() => fireSimulatedPing(dx, dy, acc), 30);
    }
  };

  const handleUseBrowserGps = () => {
    if (!navigator.geolocation) {
      setGeoStatusMsg('当前浏览器环境不支持 Geolocation API');
      return;
    }
    setGeoStatusMsg('正在请求真实 GPS 坐标…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setFormLat(latitude.toFixed(5));
        setFormLng(longitude.toFixed(5));
        setSimAccuracy(Math.round(accuracy || 20));
        if (activeWp) {
          const d = distanceMeters(latitude, longitude, activeWp.latitude, activeWp.longitude);
          setGeoStatusMsg(`已获取当前坐标 (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) · 距当前工作点 ${formatDistance(d)}`);
        } else {
          setGeoStatusMsg(`已获取当前坐标 (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
        }
      },
      (err) => {
        setGeoStatusMsg(`定位未授权或不可用 (${err.message})，可使用右侧沙盒拖拽模拟`);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Comparison Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Interactive Radar Sandbox (7 cols) */}
        <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                动态迟滞地理围栏仿真器 (ZoneStateTracker v1.2.0)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                拖拽雷达中的定位信标或点击场景按钮，实时对比原版 v1.1.0 与优化版 v1.2.0 的防漂移判定差异
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
              <span className="text-slate-500 dark:text-slate-400">当前状态:</span>
              <span
                className={`font-semibold ${
                  currentlyInside
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {currentlyInside ? '在岗中 (INSIDE)' : '范围外 (OUTSIDE)'}
              </span>
            </div>
          </div>

          {/* Radar Canvas + Real-time Telemetry */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 my-4 items-center">
            <div className="md:col-span-7 flex flex-col items-center justify-center">
              <svg
                ref={svgRef}
                viewBox="-170 -170 340 340"
                className="w-full max-w-[320px] aspect-square bg-slate-950 rounded-xl border border-slate-800 cursor-crosshair select-none touch-none"
                onPointerDown={(e) => {
                  setIsDragging(true);
                  updatePointerOffset(e.clientX, e.clientY);
                }}
                onPointerMove={(e) => {
                  if (isDragging) updatePointerOffset(e.clientX, e.clientY);
                }}
                onPointerUp={() => setIsDragging(false)}
                onPointerLeave={() => setIsDragging(false)}
              >
                {/* Polar Grid Lines */}
                <line x1="-170" y1="0" x2="170" y2="0" stroke="#1e293b" strokeWidth="1" />
                <line x1="0" y1="-170" x2="0" y2="170" stroke="#1e293b" strokeWidth="1" />
                <circle cx="0" cy="0" r="45" fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 3" />
                <circle cx="0" cy="0" r="95" fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 3" />
                <circle cx="0" cy="0" r="145" fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 3" />

                {/* Effective Exit Hysteresis Ring (v1.2.0 Outer Ring) */}
                <circle
                  cx="0"
                  cy="0"
                  r={effectiveExitRadius * pxPerMeter}
                  fill="rgba(245, 158, 11, 0.06)"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                />

                {/* Base Workplace Geofence Ring (v1.1.0 Enter Ring) */}
                <circle
                  cx="0"
                  cy="0"
                  r={baseRadius * pxPerMeter}
                  fill="rgba(16, 185, 129, 0.12)"
                  stroke="#10b981"
                  strokeWidth="2"
                />

                {/* Workplace Center Pin */}
                <circle cx="0" cy="0" r="5" fill="#10b981" />
                <text x="8" y="-8" fill="#94a3b8" fontSize="9" fontFamily="JetBrains Mono">
                  公司中心 (0m)
                </text>

                {/* Distance Vector Line */}
                <line
                  x1="0"
                  y1="0"
                  x2={offsetMeters.dx * pxPerMeter}
                  y2={offsetMeters.dy * pxPerMeter}
                  stroke="#64748b"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                />

                {/* User GPS Accuracy Uncertainty Halo */}
                <circle
                  cx={offsetMeters.dx * pxPerMeter}
                  cy={offsetMeters.dy * pxPerMeter}
                  r={Math.max(6, simAccuracy * pxPerMeter)}
                  fill={isLowAccuracyBlocked ? 'rgba(239, 68, 68, 0.18)' : 'rgba(56, 189, 248, 0.16)'}
                  stroke={isLowAccuracyBlocked ? '#ef4444' : '#38bdf8'}
                  strokeWidth="1"
                />

                {/* User Position Beacon */}
                <circle
                  cx={offsetMeters.dx * pxPerMeter}
                  cy={offsetMeters.dy * pxPerMeter}
                  r="6"
                  fill={currentDist <= baseRadius ? '#10b981' : currentDist <= effectiveExitRadius ? '#f59e0b' : '#f43f5e'}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                <text
                  x={offsetMeters.dx * pxPerMeter + 10}
                  y={offsetMeters.dy * pxPerMeter + 4}
                  fill="#f8fafc"
                  fontSize="10"
                  fontFamily="JetBrains Mono"
                >
                  {currentDist}m (±{simAccuracy}m)
                </text>
              </svg>

              <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-400">
                <span>实线绿圈: 上班触发半径 ({baseRadius}m)</span>
                <span>·</span>
                <span>虚线橙圈: v1.2 动态下班阈值 ({effectiveExitRadius}m)</span>
              </div>
            </div>

            {/* Right inside card: Sliders & Scenario Presets */}
            <div className="md:col-span-5 space-y-4">
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2.5 bg-slate-50/60 dark:bg-slate-950/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">实时圆心距离</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {currentDist} m
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">入场半径 / 动态出场半径</span>
                  <span className="font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {baseRadius}m / {effectiveExitRadius}m
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">当前越界确认计数</span>
                  <span className="font-mono font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                    {outsideStrikeCount} / {settings.exitConfirmations} 次
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">模拟坐标 (GCJ-02)</span>
                  <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {simLat.toFixed(4)}, {simLng.toFixed(4)}
                  </span>
                </div>
              </div>

              {/* Sim Accuracy Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label className="font-medium text-slate-700 dark:text-slate-300">
                    当前定位精度误差 (Accuracy)
                  </label>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    ±{simAccuracy} 米
                  </span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={350}
                  value={simAccuracy}
                  onChange={(e) => setSimAccuracy(Number(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  室外 GPS 约 10–25m；室内 Wi-Fi 约 40–90m；地下室/电梯切基站可达 250m+
                </p>
              </div>

              {/* Hysteresis Buffer Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label className="font-medium text-slate-700 dark:text-slate-300">
                    迟滞缓冲带宽度 (Hysteresis)
                  </label>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    +{settings.hysteresisBufferMeters} 米
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={settings.hysteresisBufferMeters}
                  onChange={(e) => onUpdateSettings({ hysteresisBufferMeters: Number(e.target.value) })}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>

              {/* Primary Trigger Action */}
              <button
                onClick={() => fireSimulatedPing()}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
              >
                <LocateFixed className="w-4 h-4" />
                发送当前位置采样 (触发一次定位回调)
              </button>
            </div>
          </div>

          {/* Preset Scenario Quick Test Buttons */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              典型实测场景一键重现（点击自动移位并触发回调）：
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => runScenario('arrive')}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer"
              >
                <div className="font-semibold text-slate-900 dark:text-slate-100">1. 正常到岗</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">距离 36m · ±15m</div>
              </button>
              <button
                onClick={() => runScenario('indoor_drift')}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer"
              >
                <div className="font-semibold text-amber-600 dark:text-amber-400">2. 室内边界漂移</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  越界 18m · ±48m
                </div>
              </button>
              <button
                onClick={() => runScenario('cell_tower_jump')}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer"
              >
                <div className="font-semibold text-rose-600 dark:text-rose-400">3. 电梯切基站跳变</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  跳变 319m · ±310m
                </div>
              </button>
              <button
                onClick={() => runScenario('real_leave')}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer"
              >
                <div className="font-semibold text-slate-900 dark:text-slate-100">4. 真实离开园区</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  远离 {effectiveExitRadius + 65}m · ±16m
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Workplace Management & Side-by-Side State Log (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Workplace List & Editor Card */}
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  工作地点围栏管理 ({workplaces.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  支持多办公点独立去抖跟踪与真实 GPS 拾取
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingWp(!editingWp);
                  if (!editingWp) {
                    setFormName('新办公驻点');
                    setFormRadius(180);
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                {editingWp ? '收起编辑' : '新增/编辑地点'}
              </button>
            </div>

            {/* Workplace Selector List */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800/70 my-2">
              {workplaces.map((wp) => {
                const isSelected = wp.id === activeWp?.id;
                return (
                  <div
                    key={wp.id}
                    onClick={() => onSelectWorkplace(wp.id)}
                    className={`py-2.5 px-3 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <MapPin
                          className={`w-4 h-4 shrink-0 ${
                            isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                          }`}
                        />
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {wp.name}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5 pl-6">
                        半径 {wp.radiusMeters}m · {wp.latitude.toFixed(4)}, {wp.longitude.toFixed(4)}
                      </div>
                    </div>
                    {workplaces.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteWorkplace(wp.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                        title="删除工作地点"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Editor Drawer */}
            {editingWp && (
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">地点名称</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">纬度 (Latitude)</label>
                    <input
                      type="text"
                      value={formLat}
                      onChange={(e) => setFormLat(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">经度 (Longitude)</label>
                    <input
                      type="text"
                      value={formLng}
                      onChange={(e) => setFormLng(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500 dark:text-slate-400">围栏打卡半径</span>
                    <span className="font-mono font-semibold">{formRadius} 米</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={1000}
                    step={10}
                    value={formRadius}
                    onChange={(e) => setFormRadius(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>
                {geoStatusMsg && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">{geoStatusMsg}</p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleUseBrowserGps}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    取当前真实定位
                  </button>
                  <button
                    onClick={() => {
                      const lat = parseFloat(formLat) || 22.54051;
                      const lng = parseFloat(formLng) || 113.95182;
                      onSaveWorkplace({
                        id: activeWp ? activeWp.id : Date.now(),
                        name: formName.trim() || '办公地点',
                        latitude: lat,
                        longitude: lng,
                        radiusMeters: formRadius,
                        enabled: true,
                        createdAt: Date.now(),
                      });
                      setEditingWp(false);
                    }}
                    className="flex-1 py-1.5 px-3 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg hover:opacity-90 cursor-pointer whitespace-nowrap"
                  >
                    保存围栏配置
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* A/B Comparison Log Table */}
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  v1.1.0 原版 vs v1.2.0 优化版判定对比日志
                </h3>
                {pingLogs.length > 0 && (
                  <button
                    onClick={() => setPingLogs([])}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" /> 清空
                  </button>
                )}
              </div>

              {pingLogs.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  点击左侧「2. 室内边界漂移」或「3. 电梯切基站跳变」，观察 v1.2.0 如何拦截误下班
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/70 mt-2 max-h-[250px] overflow-y-auto">
                  {pingLogs.map((log) => (
                    <div key={log.id} className="py-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        <span>
                          {log.timeStr} · 距离 {log.distMeters}m · 精度 ±{log.accuracyMeters}m
                        </span>
                        <span>动态阈值 {log.effectiveExitRadius}m</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                        <div className="text-slate-500 dark:text-slate-400 truncate">
                          原版 v1.1: <span className="text-slate-700 dark:text-slate-300">{log.v110Action}</span>
                        </div>
                        <div
                          className={`font-medium truncate ${
                            log.preventedFalseExit
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          v1.2 优化: {log.v120Action}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
