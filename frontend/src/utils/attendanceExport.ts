import type { AttendanceRow, AttendanceSheet, AttendanceStatus } from "../api/client";

export interface AttendanceExportLabels {
  title: string;
  dateLabel: string;
  classLabel: string;
  allClasses: string;
  summaryTitle: string;
  detailTitle: string;
  name: string;
  className: string;
  status: string;
  source: string;
  markedAt: string;
  total: string;
  present: string;
  absent: string;
  late: string;
  excused: string;
  unmarked: string;
  statusLabels: Record<AttendanceStatus, string>;
  sourceAuto: string;
  sourceManual: string;
  none: string;
}

export interface AttendanceExportOptions {
  sheet: AttendanceSheet;
  rows: AttendanceRow[];
  classFilter: string;
  labels: AttendanceExportLabels;
  formatTime: (iso: string | null) => string;
}

function statusText(row: AttendanceRow, labels: AttendanceExportLabels): string {
  if (!row.status) return labels.unmarked;
  return labels.statusLabels[row.status];
}

function sourceText(row: AttendanceRow, labels: AttendanceExportLabels): string {
  if (row.source === "auto") return labels.sourceAuto;
  if (row.source === "manual") return labels.sourceManual;
  return labels.none;
}

function exportFilename(sheet: AttendanceSheet, classFilter: string, ext: string): string {
  const suffix = classFilter ? `-${classFilter.replace(/[^\w\u4e00-\u9fff-]+/g, "_")}` : "";
  return `attendance-${sheet.date}${suffix}.${ext}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportAttendanceMarkdown(options: AttendanceExportOptions): void {
  const { sheet, rows, classFilter, labels, formatTime } = options;
  const classText = classFilter || labels.allClasses;

  const lines = [
    `# ${labels.title}`,
    "",
    `- ${labels.dateLabel}：${sheet.date}`,
    `- ${labels.classLabel}：${classText}`,
    "",
    `## ${labels.summaryTitle}`,
    "",
    `- ${labels.total}：${sheet.summary.total}`,
    `- ${labels.present}：${sheet.summary.present}`,
    `- ${labels.absent}：${sheet.summary.absent}`,
    `- ${labels.late}：${sheet.summary.late}`,
    `- ${labels.excused}：${sheet.summary.excused}`,
    `- ${labels.unmarked}：${sheet.summary.unmarked}`,
    "",
    `## ${labels.detailTitle}`,
    "",
    `| ${labels.name} | ${labels.className} | ${labels.status} | ${labels.source} | ${labels.markedAt} |`,
    "| --- | --- | --- | --- | --- |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.name} | ${row.class_name || labels.none} | ${statusText(row, labels)} | ${sourceText(row, labels)} | ${formatTime(row.marked_at)} |`,
    );
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  downloadBlob(blob, exportFilename(sheet, classFilter, "md"));
}

function buildPdfHtml(options: AttendanceExportOptions): string {
  const { sheet, rows, classFilter, labels, formatTime } = options;
  const classText = classFilter || labels.allClasses;

  const headerCells = [labels.name, labels.className, labels.status, labels.source, labels.markedAt]
    .map((cell) => `<th style="padding:8px;border:1px solid #ccc;background:#f5f5f5;text-align:left;">${cell}</th>`)
    .join("");

  const bodyRows = rows
    .map((row) => {
      const cells = [
        row.name,
        row.class_name || labels.none,
        statusText(row, labels),
        sourceText(row, labels),
        formatTime(row.marked_at),
      ]
        .map((cell) => `<td style="padding:8px;border:1px solid #ccc;">${cell}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <div style="font-family:'Noto Sans SC',Roboto,sans-serif;color:#111;padding:16px;">
      <h1 style="font-size:22px;margin:0 0 12px;">${labels.title}</h1>
      <p style="margin:0 0 4px;">${labels.dateLabel}：${sheet.date}</p>
      <p style="margin:0 0 16px;">${labels.classLabel}：${classText}</p>
      <p style="margin:0 0 16px;">
        ${labels.total} ${sheet.summary.total} ·
        ${labels.present} ${sheet.summary.present} ·
        ${labels.absent} ${sheet.summary.absent} ·
        ${labels.late} ${sheet.summary.late} ·
        ${labels.excused} ${sheet.summary.excused} ·
        ${labels.unmarked} ${sheet.summary.unmarked}
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

export async function exportAttendancePdf(options: AttendanceExportOptions): Promise<void> {
  const container = document.createElement("div");
  container.innerHTML = buildPdfHtml(options);
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "800px";
  document.body.appendChild(container);

  try {
    const html2pdf = (await import("html2pdf.js")).default;
    await html2pdf()
      .set({
        margin: 10,
        filename: exportFilename(options.sheet, options.classFilter, "pdf"),
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(container)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}
