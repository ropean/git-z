import type { EChartsOption } from "echarts";
import type { AuthorStat } from "../types";
import { categorical, chartChrome, prefersDark } from "../theme";
import { EChart } from "./EChart";

export function AuthorLeaderboardChart({ authors }: { authors: AuthorStat[] }) {
  const dark = prefersDark();
  const chrome = chartChrome(dark);
  const color = (dark ? categorical.dark : categorical.light)[0];
  const top = [...authors].sort((a, b) => b.commits - a.commits).slice(0, 10).reverse();

  if (top.length === 0) {
    return <div className="empty">没有作者数据</div>;
  }

  const option: EChartsOption = {
    color: [color],
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 120, right: 24, top: 10, bottom: 24 },
    xAxis: {
      type: "value",
      splitLine: { lineStyle: { color: chrome.gridline } },
      axisLabel: { color: chrome.muted },
      minInterval: 1,
    },
    yAxis: {
      type: "category",
      data: top.map((a) => a.name),
      axisLine: { lineStyle: { color: chrome.baseline } },
      axisLabel: { color: chrome.muted },
    },
    series: [
      {
        name: "提交数",
        type: "bar",
        data: top.map((a) => a.commits),
        barMaxWidth: 22,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      },
    ],
  };

  return <EChart option={option} height={Math.max(220, top.length * 32)} />;
}
