import type { EChartsOption } from "echarts";
import type { FileStat } from "../types";
import { categorical, chartChrome, prefersDark } from "../theme";
import { EChart } from "./EChart";

export function FileChurnChart({ files }: { files: FileStat[] }) {
  const dark = prefersDark();
  const chrome = chartChrome(dark);
  const color = (dark ? categorical.dark : categorical.light)[1];
  const top = [...files]
    .sort((a, b) => b.insertions + b.deletions - (a.insertions + a.deletions))
    .slice(0, 10)
    .reverse();

  if (top.length === 0) {
    return <div className="empty">没有文件变更数据</div>;
  }

  const option: EChartsOption = {
    color: [color],
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 160, right: 24, top: 10, bottom: 24 },
    xAxis: {
      type: "value",
      name: "增删行数",
      nameTextStyle: { color: chrome.muted },
      splitLine: { lineStyle: { color: chrome.gridline } },
      axisLabel: { color: chrome.muted },
    },
    yAxis: {
      type: "category",
      data: top.map((f) => f.path),
      axisLine: { lineStyle: { color: chrome.baseline } },
      axisLabel: { color: chrome.muted, width: 140, overflow: "truncate" },
    },
    series: [
      {
        name: "增删行数",
        type: "bar",
        data: top.map((f) => f.insertions + f.deletions),
        barMaxWidth: 18,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      },
    ],
  };

  return <EChart option={option} height={Math.max(220, top.length * 32)} />;
}
