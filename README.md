# 牛马时录 (workTimeTrace)

基于地理围栏的自动上下班打卡与加班工时统计工具。包含 **1:1 移动端交互应用与异常边界场景模拟器**，以及可直接同步至 Android 原生工程（Kotlin + Jetpack Compose + Room + DataStore + 高德融合定位）的完整源码与 Git 补丁。

---

## 核心特性

### 1. 双工时统计模式
- **首进末出模式 (`FIRST_IN_LAST_OUT`)**：仅统计当日**首次进入围栏**与**最后一次离开围栏**的时间差作为当日有效上班时长，忽略日内外出就餐、取快递或短时定位漂移产生的中间进出裂隙。
- **多段累计模式 (`INTERVAL_UNION`)**：严格累加每一段在围栏内的实际停留区间并去重求并集，中途离开围栏时段不计入在岗时长。

### 2. 异常边界场景自愈机制
- **App 启动时已在围栏内自动补卡 (`STARTUP_INSIDE_COMPENSATED`)**：
  - 当用户到达公司工位后才首次启动应用、恢复定位服务或刚添加工作地点时，无需等待发生「围栏外 → 围栏内」的物理跨越，首次定位命中围栏内即自动补记今日上班卡 (`ENTER`)。
  - 若数据库中存在昨日或更早未闭合的 `ENTER` 记录，系统会先按昨日最后在岗心跳时间（或 `23:59:59` 兜底）自动闭合昨日下班卡，再补记今日上班卡。
- **手机在围栏内关机、离开围栏后开机回溯结算 (`OFFLINE_EXIT_RECONCILED`)**：
  - 前台服务在围栏内每次定位成功时，在 `DataStore` 持久化记录 `lastInsideBeat` 在岗心跳时间戳；同时通过 `BootReceiver` 监听系统 `ACTION_SHUTDOWN` / `QUICKBOOT_POWEROFF` 关机广播冻结关机瞬间心跳。
  - 当手机在公司没电关机、回家充电或次日早上在围栏外开机时，服务启动首次定位发现数据库状态仍为 `ENTER` 但当前物理位置已在围栏外，会自动按**关机前最后一次在岗心跳时间**补记下班卡 (`EXIT`)，避免将整晚关机时间误算为通宵加班。

### 3. 动态迟滞双半径防漂移围栏 (`ZoneStateTracker`)
- 采用「进严出宽」双半径迟滞策略：进入围栏需满足 `distance <= radius`；离开围栏需满足 `distance > radius + hysteresisBuffer + accuracy * 0.5` 且连续多次确认，过滤室内窗边、电梯或基站切换造成的偶发定位跳变。

### 4. 月度日历工时热力图与状态筛选器 (`CalendarScreen`)
- **五档工时热力图**：根据每日在岗时长 (`0h` / `<4h` / `4–8h` / `8–10h` / `10–12h` / `≥12h`) 动态渲染浅绿至浓墨绿背景色阶，直观呈现整月忙碌分布。
- **三态快速高亮筛选**：支持在「**全部日期**」「**加班日**」「**请假/缺勤**」之间一键切换。结合国务院法定节假日与调休补班日历，自动识别过去工作日中无打卡记录（全天请假/缺勤）或工时明显不足（半天假/早退）的日期并高亮标记。

### 5. 月度考勤流水 CSV 导出 (`RecordsScreen`)
- 支持在记录页将当前选定月份的完整进出围栏流水一键导出为标准 CSV 文件（含 UTF-8 BOM 头，Excel 直接打开不乱码）。
- 导出字段涵盖：`日期`、`时间`、`毫秒时间戳`、`事件类型 (ENTER/EXIT)`、`工作地点`、`纬度`、`经度`、`定位精度` 以及 `系统补偿备注`（区分自动围栏打卡、手动补录、启动即在围栏自动补卡、关机离线回溯下班等）。

### 6. 主页状态卡片加班时长关怀提醒 (`HomeScreen` & `SettingsScreen`)
- 在设置页提供「**加班时长关怀提醒**」开关（默认关闭）及可自定义触发阈值（`0.5` ~ `6.0` 小时，默认 `2` 小时）。
- 开启后，当今日加班时长达到或超过设定阈值时，主页顶部状态卡片内会以高对比警示色块显著高亮提示：**“今日加班较多，注意休息”**。

---

## 目录结构

```text
├── public/
│   └── workTimeTrace.patch          # 针对 Android 原生仓库生成的标准 Git 补丁文件
├── src/
│   ├── core/
│   │   ├── overtimeEngine.ts        # 核心工时计算引擎、节假日调休表与异常自愈对账算法
│   │   └── kotlinPatches.ts         # 初始测试样本与 Android Kotlin 核心模块优化源码对照
│   ├── App.tsx                      # 移动端五标签视图 (主页/记录/日历/统计/设置) + 异常场景模拟器
│   ├── index.css                    # 全局样式与主题配置
│   └── main.tsx                     # 应用入口
└── README.md
```

---

## 本地运行与使用

### 1. 启动交互式模拟与调试工作台

```bash
# 安装依赖
npm install

# 启动开发服务器 (默认端口 3000)
npm run dev

# 构建生产版本
npm run build
```

### 2. 将改动应用到 Android 原生工程 (`workTimeTrace`)

项目根目录下已内置针对 Android 原生工程生成的标准补丁 `public/workTimeTrace.patch`（涵盖 `SettingsStore.kt`、`OvertimeCalculator.kt`、`TrackingService.kt`、`BootReceiver.kt`、`AndroidManifest.xml`、`HomeScreen.kt`、`RecordsScreen.kt`、`CalendarScreen.kt`、`SettingsScreen.kt`、`SettingsViewModel.kt` 共 10 个文件）。

在 Android 工程根目录下执行：

```bash
git apply workTimeTrace.patch
```

即可将所有新增功能与异常自愈逻辑一键同步至 Android Studio 项目中编译打包。
