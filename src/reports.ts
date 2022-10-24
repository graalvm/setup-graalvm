import * as fs from "fs";
import * as core from "@actions/core";
import * as mark from "./markdown";
import { getGVMversion, hRBytes, setNativeImageOption } from "./utils";
import { CodeSize, CODE_BREAKDOWN, CODE_SIZE, DashboardDump, HeapSize, HEAP_BREAKDOWN, HEAP_SIZE, NAME, SIZE } from "./definitions/dashboardNIDef";
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

type Sized = { size: number };
const descend = (v1: Sized, v2: Sized) => v2.size - v1.size;
const sum = (n1: number, n2: number) => n1 + n2;

export function createNIArtifactReport(): void {
  const data: DashboardDump = JSON.parse(fs.readFileSync("artifactReport.dump").toString());
  const heapBreakdown = data[HEAP_BREAKDOWN];
  const codeBreakdown = data[CODE_BREAKDOWN];
  let heap: HeapSize[] = heapBreakdown[HEAP_SIZE];
  let code: CodeSize[] = codeBreakdown[CODE_SIZE];
  const heapSum = heap.map(v => v.size).reduce(sum);
  const codeSum = code.map(v => v.size).reduce(sum);
  heap.sort(descend);
  heap = heap.slice(0, 10);
  let pCode: Package[] = parsePackages(code);
  addMermaidPieSummary("Heap/Code size", true,
    { name: "Heap size", size: heapSum },
    { name: "Code size", size: codeSum });
  addTableSummary("10 Top Heap sizes",
    ["Name", "Count", "Size", "%"],
    ...heap.map(h => [h.name, `${h.count}`, hRBytes(h.size), (h.size / heapSum * 100).toFixed(2)]));
  addTableSummary("Code sizes by packages",
    ["Name", "Size"],
    ...pCode.sort(descend).map(c => [processPackage(c), hRBytes(c.size)]));
}

function processPackage(pkg: Package): string {
  const boldName = mark.bold(pkg[NAME]);
  if (pkg.pkg.size > 0)
    return mark.detail(boldName, packageToTable(pkg));
  return boldName;
}

function packageToTable(pkg: Package): string {
  return packagesToTable([...pkg.pkg.values()]);
}

function packagesToTable(pkgs: Package[]): string {
  const rows: mark.TableRow[] = [mark.makeHeaderRow("Name", "Size")];
  return mark.table(rows.concat(pkgs.sort(descend).map(cd => [processPackage(cd), hRBytes(cd[SIZE])])));
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

function analysisResultEntryToTableRow(entry: [string, AnalysisResult]): mark.TableRow {
  return [entry[0],
  hRBytes(entry[1].total),
  hRBytes(entry[1].reflection),
  hRBytes(entry[1].jni),
  hRBytes(entry[1].reachable)];
}

function imageDetailsToTableRows(imageDetails: ImageDetails): mark.TableRow[] {
  const out: mark.TableRow[] = [];
  const imageHeap: ImageHeap = imageDetails[IMAGE_HEAP];
  out.push(["Heap", hRBytes(imageHeap[BYTES])]);
  out.push(["Resources", hRBytes(imageHeap[RESOURCES][BYTES])]);
  out.push(["Code", hRBytes(imageDetails[CODE_AREA][BYTES])]);
  out.push(["Total", hRBytes(imageDetails[TOTAL_BYTES])]);
  return out;
}
function resourceUsageToTableRows(resourceUsage: ResourceUsage): mark.TableRow[] {
  const out: mark.TableRow[] = [];
  out.push(["Memory usage", hRBytes(resourceUsage[MEMORY][SYSTEM_TOTAL])]);
  out.push(["CPU usage", (resourceUsage[CPU][LOAD] / resourceUsage[CPU][TOTAL_CORES] * 100).toFixed(2) + "%"]);
  return out;
}

type Package = CodeSize & { pkg: Map<string, Package> };
function parsePackages(code: CodeSize[]): Package[] {
  const pkgs: Map<string, Package> = new Map();
  code.forEach(c => {
    const parts = c[NAME].split('.');
    let prt = 0;
    let p: Package = { name: "", size: 0, pkg: new Map() };
    let m: Map<string, Package> = pkgs;
    for (const part of parts) {
      if (part === part.toLowerCase()) {
        p = appMap(part, c[SIZE], m);
        m = p.pkg;
        prt += part.length + 1;
      } else {
        break;
      }
    }
  });
  return mergePackages([...pkgs.values()]);
}

function mergePackages(pkgs: Package[]): Package[] {
  pkgs.forEach(mergePackage);
  return pkgs;
}

function mergePackage(pkg: Package): Package {
  if (pkg.pkg.size === 1) {
    const pack = pkg.pkg.get(pkg.pkg.keys().next().value) as Package;
    pkg[NAME] = pkg[NAME] + "." + pack[NAME];
    pkg.pkg = pack.pkg;
    mergePackage(pkg);
  } else
    mergePackages([...pkg.pkg.values()]);
  return pkg;
}

function appMap(part: string, size: number, map: Map<string, Package>): Package {
  let next: Package | undefined = map.get(part);
  if (next === undefined) {
    next = { name: part, size: 0, pkg: new Map() };
    map.set(part, next);
  }
  next.size += size;
  return next;
}

function addMermaidPieSummary(title: string, showData: boolean, ...data: mark.MermaidPieData[]) {
  core.summary.addRaw(mark.mermaidPie(title, showData, ...data));
}

function addTableSummary(title: string, colNames: string[], ...data: mark.TableRow[]) {
  const rows: mark.TableRow[] = [];
  rows.push([{ content: title, header: true, span: colNames.length }]);
  rows.push(colNames.map(name => { return { content: name, header: true } }));
  core.summary.addRaw(mark.table(rows.concat(data)));
}
function addTableSummaryNoHeader(title: string, ...data: mark.TableRow[]) {
  const rows: mark.TableRow[] = [];
  let max = 0;
  for (const row of data) {
    max = Math.max(row.length, max);
  }
  rows.push([{ content: title, header: true, span: max }]);
  core.summary.addRaw(mark.table(rows.concat(data)));
}