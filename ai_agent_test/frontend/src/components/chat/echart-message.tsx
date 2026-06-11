"use client";

import { memo, useEffect, useRef } from "react";
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

import type { EChartPayload } from "@/types";

echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
  CanvasRenderer,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
]);

export function parseEChartResult(result: unknown): EChartPayload | null {
  let payload: unknown = result;
  if (typeof result === "string") {
    try {
      payload = JSON.parse(result);
    } catch {
      return null;
    }
  }

  if (
    payload &&
    typeof payload === "object" &&
    (payload as { kind?: unknown }).kind === "echart" &&
    typeof (payload as { option?: unknown }).option === "object" &&
    (payload as { option?: unknown }).option !== null
  ) {
    return payload as EChartPayload;
  }
  return null;
}

export const EChartMessage = memo(function EChartMessage({ payload }: { payload: EChartPayload }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = echarts.init(container, null, { renderer: "canvas" });
    chartRef.current = chart;
    chart.setOption(payload.option, true);

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [payload.option]);

  return (
    <div className="bg-card overflow-hidden rounded-xl border p-3 sm:p-4">
      <div ref={containerRef} className="h-[400px] w-full" style={{ minWidth: 1, minHeight: 1 }} />
    </div>
  );
});
