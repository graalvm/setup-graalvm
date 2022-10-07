import * as fs from "fs";
import * as core from "@actions/core";
import { SummaryTableRow } from "@actions/core/lib/summary";
import { getGVMversion, setNativeImageOption } from "./utils";
import { CodeSize, CODE_BREAKDOWN, CODE_SIZE, DashboardDump, HeapSize, HEAP_BREAKDOWN, HEAP_SIZE } from "./definitions/dashboardNIDef";
import { AnalysisResult, ANALYSIS_RESULTS, BuildOutput, BYTES, CODE_AREA, CPU, ImageDetails, ImageHeap, IMAGE_DETAILS, IMAGE_HEAP, LOAD, MEMORY, RESOURCES, ResourceUsage, RESOURCE_USAGE, SYSTEM_TOTAL, TOTAL_BYTES, TOTAL_CORES } from "./definitions/buildOutputDef";

export async function setUpNIArtifactReport(): Promise<void> {
  const version = await getGVMversion();
  await setNativeImageOption("-H:+DashboardCode");
  await setNativeImageOption("-H:+DashboardHeap");
  await setNativeImageOption("-H:-DashboardBgv");
  await setNativeImageOption("-H:+DashboardJson");
  await setNativeImageOption("-H:DashboardDump=artifactReport");
}

export async function setUpNIBuildReport(): Promise<void> {
  await setNativeImageOption("-H:BuildOutputJSONFile=outputReport.json");
}

export function createNIArtifactReport(): void {
  const data: DashboardDump = JSON.parse(fs.readFileSync("artifactReport.dump").toString());
  const heapBreakdown = data[HEAP_BREAKDOWN];
  const codeBreakdown = data[CODE_BREAKDOWN];
  let heap: HeapSize[] = heapBreakdown[HEAP_SIZE];
  let code: CodeSize[] = codeBreakdown[CODE_SIZE];
  heap.sort((v1, v2) => v2.size - v1.size);
  heap = heap.slice(0, 10);
  code = aggregateCode(code);
  code.sort((v1, v2) => v2.size - v1.size);
  code = code.slice(0, 10);
  const heapSum = heap.map(v => v.size).reduce((v1, v2) => v1 + v2);
  const codeSum = code.map(v => v.size).reduce((v1, v2) => v1 + v2);
  addMermaidPieSummary("Heap/Code size", true,
    { name: "Heap size", value: heapSum },
    { name: "Code size", value: codeSum });
  addTableSummary("10 Top Heap sizes",
    ["Name", "Count", "Size", "%"],
    ...heap.map(h => [h.name, `${h.count}`, `${h.size}`, (h.size / heapSum * 100).toFixed(2)]));
  addTableSummary("10 Top Code sizes",
    ["Name", "Size", "%"],
    ...code.map(c => [c.name, `${c.size}`, (c.size / codeSum * 100).toFixed(2)]));
}

export function createNIBuildReport(): void {
  const data: BuildOutput = JSON.parse(fs.readFileSync("outputReport.json").toString());
  addTableSummary("Image details",
    ["Type", "Bytes"],
    ...imageDetailsToTableRows(data[IMAGE_DETAILS]));
  addTableSummaryNoHeader("Resource usage",
    ...resourceUsageToTableRows(data[RESOURCE_USAGE]));
  addTableSummary("Analysis Results",
    ["Type", "Total", "Reflection", "JNI", "Reachable"],
    ...Object.entries(data[ANALYSIS_RESULTS]).map(analysisResultEntryToTableRow));
}

function analysisResultEntryToTableRow(entry: [string, AnalysisResult]): SummaryTableRow {
  return [entry[0],
  `${entry[1].total }`,
  `${entry[1].reflection }`,
  `${entry[1].jni}`,
  `${entry[1].reachable}`];
}

function imageDetailsToTableRows(imageDetails: ImageDetails): SummaryTableRow[] {
  const out: SummaryTableRow[] = [];
  const imageHeap: ImageHeap = imageDetails[IMAGE_HEAP];
  out.push(["Heap", `${imageHeap[BYTES]}`]);
  out.push(["Resources", `${imageHeap[RESOURCES][BYTES]}`]);
  out.push(["Code", `${imageDetails[CODE_AREA][BYTES]}`]);
  out.push(["Total", `${imageDetails[TOTAL_BYTES]}`]);
  return out;
}
function resourceUsageToTableRows(resourceUsage: ResourceUsage): SummaryTableRow[] {
  const out: SummaryTableRow[] = [];
  out.push(["Memory usage", resourceUsage[MEMORY][SYSTEM_TOTAL] + " B"]);
  out.push(["CPU usage", (resourceUsage[CPU][LOAD] / resourceUsage[CPU][TOTAL_CORES]).toFixed(2) + "%"]);
  return out;
}

function aggregateCode(code: CodeSize[]): CodeSize[] {
  const aggregates: Map<string, number> = new Map();
  code.forEach(element => {
    const pkg = parsePkg(element.name);
    aggregates.set(pkg, (aggregates.get(pkg) || 0) + element.size);
  });
  code = [];
  aggregates.forEach((s, n) => code.push({ name: n, size: s }));
  return code;
}

function parsePkg(name: string): string {
  const parts: string[] = name.split('.');
  let pkg: string[] = [];
  for (const part of parts) {
    if (part === part.toLowerCase()) {
      pkg.push(part);
    } else
      break;
  }
  return pkg.join('.');
}

function addMermaidPieSummary(title: string, showData: boolean, ...data: { name: string, value: number }[]) {
  //%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ff0000'}}}%%\n
  core.summary.addCodeBlock(`pie ${showData ? "showData " : ""}title ${title}\n\t${data.map(v1 => "\"" + v1.name + "\":" + v1.value).join("\n\t")}`, "mermaid");
}

function addTableSummary(title: string, colNames: string[], ...data: SummaryTableRow[]) {
  const rows: SummaryTableRow[] = [];
  rows.push([{ data: title, header: true, colspan: `${colNames.length}` }]);
  rows.push(colNames.map(name => { return { data: name, header: true } }));
  core.summary.addTable(rows.concat(data));
}
function addTableSummaryNoHeader(title: string, ...data: SummaryTableRow[]) {
  const rows: SummaryTableRow[] = [];
  let max = 0;
  for (const row of data) {
    max = Math.max(row.length, max);
  }
  rows.push([{ data: title, header: true, colspan: `${max}` }]);
  core.summary.addTable(rows.concat(data));
}