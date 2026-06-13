{% raw %}import Link from "next/link";
import { Sparkles } from "lucide-react";

import { APP_NAME, ROUTES } from "@/lib/constants";

const HIGHLIGHTS = [
  "一句话需求录入与澄清",
  "基于来源的需求问答",
  "开发拆解与变更确认",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-screen lg:grid lg:grid-cols-[1.1fr_minmax(0,560px)]">
      {/* LEFT — form panel (always light, regardless of system theme) */}
      <main
        id="main"
        className="theme-light bg-background text-foreground relative flex flex-col"
      >
        <header className="flex h-16 items-center px-6 sm:px-10">
          <Link
            href={ROUTES.HOME}
            className="font-display text-foreground inline-flex items-center gap-2 text-base font-bold tracking-tight"
          >
            <span aria-hidden className="bg-brand inline-block h-2.5 w-2.5 rounded-full" />
            {APP_NAME}
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">{children}</div>
        </div>

        <footer className="text-foreground/50 px-6 py-6 font-mono text-[11px] tracking-wider uppercase sm:px-10">
          © {new Date().getFullYear()} {APP_NAME}
        </footer>
      </main>

      {/* RIGHT — brand island (floating rounded card, hidden on mobile) */}
      <aside className="hidden p-5 lg:block lg:p-6">
        <div className="theme-dark bg-background text-foreground border-foreground/10 relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border p-10 shadow-2xl lg:p-12">
          {/* Background visuals */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="bg-grid absolute inset-0 opacity-[0.55]" />
            <div className="bg-brand/[0.28] absolute -top-32 -right-20 h-[460px] w-[460px] rounded-full blur-[120px]" />
            <div className="bg-brand/[0.12] absolute -bottom-20 -left-10 h-[320px] w-[420px] rounded-full blur-[140px]" />
          </div>

          {/* TOP — eyebrow chip */}
          <div className="relative z-10">
            <span className="eyebrow-badge inline-flex items-center gap-2">
              <Sparkles className="h-3 w-3" aria-hidden />
              面向产品和开发的需求知识库
            </span>
          </div>

          {/* MIDDLE — headline + highlights */}
          <div className="relative z-10 max-w-[28rem]">
            <h2 className="text-display-lg text-foreground mb-6 leading-[1.05] [&_em]:font-accent [&_em]:font-normal [&_em]:italic">
              把零散需求沉淀成<em>可追溯</em>的协作资产。
            </h2>
            <p className="text-foreground/65 max-w-md text-base leading-relaxed">
              产品录入需求，AI 生成澄清问题；开发基于来源查询、拆解任务并确认变更。
            </p>

            <ul className="mt-10 space-y-3">
              {HIGHLIGHTS.map((line) => (
                <li key={line} className="text-foreground/85 flex items-center gap-3 text-sm">
                  <span aria-hidden className="bg-brand h-1.5 w-1.5 shrink-0 rounded-full" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          {/* BOTTOM — glass testimonial card */}
          <figure className="border-foreground/10 bg-card/40 relative z-10 max-w-md rounded-2xl border p-5 backdrop-blur-xl">
            <blockquote className="text-foreground/90 text-sm leading-relaxed">
              &ldquo;一句话需求可以被追问、归档、查询和拆解，产品和开发终于对齐在同一份上下文里。&rdquo;
            </blockquote>
            <figcaption className="mt-4 flex items-center gap-3">
              <span
                className="bg-brand text-brand-foreground flex h-9 w-9 items-center justify-center rounded-full font-mono text-xs font-semibold"
                style={{ boxShadow: "0 0 16px var(--color-brand)" }}
              >
                EP
              </span>
              <div>
                <p className="text-foreground text-sm font-semibold">需求知识库 MVP</p>
                <p className="text-foreground/55 text-xs">产品 · 开发协作</p>
              </div>
            </figcaption>
          </figure>
        </div>
      </aside>
    </div>
  );
}
{% endraw %}
