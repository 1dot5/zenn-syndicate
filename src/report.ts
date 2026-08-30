import pc from "picocolors";
import type { Diagnostic, ExitCode, Report, ReportSummary } from "./types.js";

/** Collects diagnostics as they're produced across modules. Never throws. */
export class DiagnosticCollector {
  private diagnostics: Diagnostic[] = [];

  add(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic);
  }

  addAll(diagnostics: Diagnostic[]): void {
    this.diagnostics.push(...diagnostics);
  }

  all(): Diagnostic[] {
    return this.diagnostics;
  }

  hasErrors(): boolean {
    return this.diagnostics.some((d) => d.level === "error");
  }
}

export function summarize(
  diagnostics: Diagnostic[],
  filesProcessed: number,
  filesWritten: number,
): ReportSummary {
  const summary: ReportSummary = {
    errors: 0,
    warnings: 0,
    infos: 0,
    filesProcessed,
    filesWritten,
  };
  for (const d of diagnostics) {
    if (d.level === "error") summary.errors++;
    else if (d.level === "warning") summary.warnings++;
    else summary.infos++;
  }
  return summary;
}

export function buildReport(
  diagnostics: Diagnostic[],
  filesProcessed: number,
  filesWritten: number,
): Report {
  return {
    diagnostics,
    summary: summarize(diagnostics, filesProcessed, filesWritten),
  };
}

/** Exit code convention: 0 = no errors, 1 = per-document errors, 2 = fatal (caller decides 2). */
export function exitCodeForReport(report: Report): ExitCode {
  return report.summary.errors > 0 ? 1 : 0;
}

function levelColor(level: Diagnostic["level"], text: string): string {
  if (level === "error") return pc.red(text);
  if (level === "warning") return pc.yellow(text);
  return pc.cyan(text);
}

function levelLabel(level: Diagnostic["level"]): string {
  if (level === "error") return "error";
  if (level === "warning") return "warn";
  return "info";
}

/** Renders a report as human-readable, colorized text grouped by file. */
export function formatHuman(report: Report): string {
  const lines: string[] = [];
  const grouped = new Map<string, Diagnostic[]>();
  const ungrouped: Diagnostic[] = [];

  for (const d of report.diagnostics) {
    if (d.file) {
      const list = grouped.get(d.file) ?? [];
      list.push(d);
      grouped.set(d.file, list);
    } else {
      ungrouped.push(d);
    }
  }

  for (const [file, diags] of grouped) {
    lines.push(pc.bold(file));
    for (const d of diags) {
      lines.push(`  ${levelColor(d.level, levelLabel(d.level))} [${d.code}] ${d.message}`);
    }
  }

  for (const d of ungrouped) {
    lines.push(`${levelColor(d.level, levelLabel(d.level))} [${d.code}] ${d.message}`);
  }

  if (report.diagnostics.length > 0) lines.push("");

  const s = report.summary;
  const summaryParts = [
    s.errors > 0 ? pc.red(`${s.errors} error${s.errors === 1 ? "" : "s"}`) : `0 errors`,
    s.warnings > 0
      ? pc.yellow(`${s.warnings} warning${s.warnings === 1 ? "" : "s"}`)
      : `0 warnings`,
    `${s.infos} info`,
  ].join(", ");
  lines.push(summaryParts);
  lines.push(`${s.filesProcessed} file(s) processed, ${s.filesWritten} written`);

  return lines.join("\n");
}

export function formatJson(report: Report): string {
  return JSON.stringify(report, null, 2);
}
