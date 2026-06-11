import { BarChart3, Database, MessageSquare } from "lucide-react";

const DEFAULT_STEPS = [
  {
    icon: MessageSquare,
    title: "提出运营问题",
    body: "直接用中文询问车辆堆积、早晚高峰订单趋势、预测缺口或天气应急，不需要手写 SQL。",
  },
  {
    icon: Database,
    title: "Agent 查询数据",
    body: "通过 MCP 读取车辆分布、订单流水、站点、天气和需求预测表，并返回可复查的查询依据。",
  },
  {
    icon: BarChart3,
    title: "生成调度建议",
    body: "把异常站点、峰值趋势和缺车优先级整理成图表、排序结果和下一步调度动作。",
  },
];

interface HowItWorksProps {
  steps?: Array<{
    icon: (typeof DEFAULT_STEPS)[number]["icon"];
    title: string;
    body: string;
  }>;
}

export function HowItWorks({ steps = DEFAULT_STEPS }: HowItWorksProps) {
  return (
    <div className="grid gap-6 md:grid-cols-3 md:gap-8">
      {steps.map((step, i) => (
        <div
          key={step.title}
          className="border-foreground/15 bg-card lift relative overflow-hidden rounded-2xl border p-8"
        >
          <div className="text-foreground/30 absolute top-6 right-6 font-mono text-sm tabular-nums">
            0{i + 1}
          </div>
          <div className="bg-brand text-brand-foreground inline-flex h-11 w-11 items-center justify-center rounded-xl">
            <step.icon className="h-5 w-5" />
          </div>
          <h3 className="text-foreground font-display mt-6 text-xl font-bold">{step.title}</h3>
          <p className="text-foreground/65 mt-3 text-sm leading-relaxed">{step.body}</p>
          {i < steps.length - 1 && (
            <div
              aria-hidden
              className="border-foreground/15 absolute top-1/2 right-[-12px] hidden h-px w-6 border-t md:block"
            />
          )}
        </div>
      ))}
    </div>
  );
}
