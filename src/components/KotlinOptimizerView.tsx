import React, { useState } from 'react';
import { Copy, Check, FileCode, Download, ArrowUpRight } from 'lucide-react';
import { KOTLIN_PATCHES, KotlinPatchItem } from '../core/kotlinPatches';

export const KotlinOptimizerView: React.FC = () => {
  const [selectedPatchId, setSelectedPatchId] = useState<string>(KOTLIN_PATCHES[0].id);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activePatch: KotlinPatchItem =
    KOTLIN_PATCHES.find((p) => p.id === selectedPatchId) || KOTLIN_PATCHES[0];

  const handleCopy = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadPatchBundle = () => {
    const bundleContent = KOTLIN_PATCHES.map(
      (p) =>
        `// ============================================================================\n` +
        `// FILE: ${p.filePath}\n` +
        `// OPTIMIZATION: ${p.title}\n` +
        `// IMPACT: ${p.impactMetric}\n` +
        `// ============================================================================\n\n` +
        `${p.optimizedCode}\n\n`
    ).join('\n');

    const blob = new Blob([bundleContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workTimeTrace-v1.2.0-optimizations.kt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Android 源码级深度优化方案 (针对 lutcraft/workTimeTrace v1.1.0)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            基于仓库现有 Kotlin + Jetpack Compose + Room + 高德/系统双定位架构，提供可直接覆盖粘贴的 5 项核心生产级重构代码
          </p>
        </div>
        <button
          onClick={handleDownloadPatchBundle}
          className="px-4 py-2 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          下载全部 Kotlin 优化代码合集 (.kt)
        </button>
      </div>

      {/* Main Split View: Left Patch Selector List (5 cols) + Right Code & Analysis (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 space-y-3">
          {KOTLIN_PATCHES.map((patch) => {
            const isSelected = patch.id === activePatch.id;
            return (
              <button
                key={patch.id}
                onClick={() => setSelectedPatchId(patch.id)}
                className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-emerald-600 dark:border-emerald-500 bg-white dark:bg-slate-900 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                  <span>{patch.category}</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                    {patch.impactMetric}
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {patch.title}
                </div>
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1.5 truncate">
                  {patch.filePath}
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Detail Panel */}
        <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-5">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
              <span>目标文件: {activePatch.filePath}</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                预期收益: {activePatch.impactMetric}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-1">
              {activePatch.title}
            </h3>
          </div>

          {/* Root Cause vs Solution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-1">
                原版 v1.1.0 痛点与隐患剖析
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {activePatch.problemAnalysis}
              </p>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
                v1.2.0 架构与算法改进方案
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {activePatch.solutionSummary}
              </p>
            </div>
          </div>

          {/* Original Snippet */}
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              原版代码片段 (v1.1.0):
            </div>
            <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-300 text-xs font-mono overflow-x-auto border border-slate-800">
              <code>{activePatch.originalSnippet}</code>
            </pre>
          </div>

          {/* Optimized Kotlin Code */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <FileCode className="w-4 h-4 text-emerald-600" />
                重构后完整 Kotlin 实现 (可直接替换至 Android Studio):
              </span>
              <button
                onClick={() => handleCopy(activePatch.id, activePatch.optimizedCode)}
                className="px-3 py-1 text-xs font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {copiedId === activePatch.id ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    已复制代码
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    复制 Kotlin 代码
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 rounded-xl bg-slate-950 text-emerald-300 text-xs font-mono overflow-x-auto max-h-[420px] border border-slate-800 leading-relaxed">
              <code>{activePatch.optimizedCode}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
