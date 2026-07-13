import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { Commit } from "../types";
import { bucketCommits } from "../aggregate";
import { categorical, chartChrome, prefersDark } from "../theme";
import { EChart } from "./EChart";

export function CommitTimelineChart({ commits }: { commits: Commit[] }) {
  const dark = prefersDark();
  const buckets = useMemo(() => bucketCommits(commits), [commits]);
  const chrome = chartChrome(dark);
  const color = (dark ? categorical.dark : categorical.light)[0];

  if (buckets.length === 0) {
    return <div className="empty">没有可展示的提交数据</div>;
  }

  const option: EChartsOption = {
    color: [color],
    tooltip: {
      trigger: "axis",
      valueFormatter: (v) => `${v}`,
    },
    grid: { left: 44, right: 16, top: 20, bottom: 36 },
    xAxis: {
      type: "category",
      data: buckets.map((b) => b.label),
      axisLine: { lineStyle: { color: chrome.baseline } },
      axisLabel: { color: chrome.muted, hideOverlap: true },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: chrome.gridline } },
      axisLabel: { color: chrome.muted },
      minInterval: 1,
    },
    series: [
      {
        name: "提交数",
        type: "line",
        data: buckets.map((b) => b.commits),
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.15 },
      },
    ],
  };

  return <EChart option={option} />;
}
