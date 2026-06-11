"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, Database } from "lucide-react";

import type { PgQueryPayload } from "@/types";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

export function parsePgQueryResult(result: unknown): PgQueryPayload | null {
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
    (payload as { kind?: unknown }).kind === "pg_query" &&
    typeof (payload as { sql?: unknown }).sql === "string" &&
    Array.isArray((payload as { data?: unknown }).data) &&
    Array.isArray((payload as { columns?: unknown }).columns)
  ) {
    return payload as PgQueryPayload;
  }
  return null;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        });
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function PgQueryResult({ payload }: { payload: PgQueryPayload }) {
  const [sqlExpanded, setSqlExpanded] = useState(false);

  return (
    <div className="space-y-3 py-1">
      <div className="border-foreground/10 overflow-hidden rounded-xl border">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSqlExpanded((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setSqlExpanded((value) => !value);
            }
          }}
          className="bg-foreground/[0.02] hover:bg-foreground/[0.04] flex w-full items-center gap-2 px-3 py-2 text-left transition-colors"
        >
          <Database className="text-primary h-3.5 w-3.5 shrink-0" />
          <span className="text-foreground/70 font-mono text-[10px] tracking-wider uppercase">
            SQL Query
          </span>
          <span className="text-foreground/45 min-w-0 flex-1 truncate text-xs">
            {payload.sql.replace(/\s+/g, " ")}
          </span>
          <span
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <CopyButton text={payload.sql} className="h-6 w-6 shrink-0" />
          </span>
          {sqlExpanded ? (
            <ChevronUp className="text-muted-foreground h-4 w-4 shrink-0" />
          ) : (
            <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
          )}
        </div>

        {sqlExpanded && (
          <pre className="border-foreground/10 bg-background/60 max-h-48 overflow-auto border-t p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {payload.sql}
          </pre>
        )}
      </div>

      <div className="border-foreground/10 overflow-hidden rounded-xl border">
        <div className="bg-foreground/[0.02] flex items-center gap-2 px-3 py-2">
          <Database className="text-foreground/55 h-3.5 w-3.5" />
          <span className="text-foreground/70 font-mono text-[10px] tracking-wider uppercase">
            Query Result
          </span>
          <span className="text-foreground/45 ml-auto text-xs">
            {payload.row_count.toLocaleString()} row{payload.row_count === 1 ? "" : "s"}
            {payload.truncated ? " (truncated)" : ""}
          </span>
        </div>

        {payload.data.length === 0 ? (
          <p className="text-muted-foreground px-3 py-4 text-sm">No rows returned.</p>
        ) : (
          <div className="max-h-[300px] overflow-auto">
            <table className="w-full min-w-max border-collapse text-left text-xs">
              <thead className="bg-background sticky top-0 z-10">
                <tr>
                  {payload.columns.map((column) => (
                    <th
                      key={column}
                      className="border-foreground/10 text-foreground/65 border-b px-3 py-2 font-mono text-[10px] tracking-wider uppercase"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payload.data.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className={cn(rowIndex % 2 === 0 ? "bg-transparent" : "bg-muted/35")}
                  >
                    {payload.columns.map((column) => (
                      <td
                        key={column}
                        className="text-foreground/80 border-foreground/5 border-b px-3 py-2"
                      >
                        {formatCell(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-foreground/45 flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase">
        <Copy className="h-3 w-3" />
        SQL is available above for query review.
      </div>
    </div>
  );
}
