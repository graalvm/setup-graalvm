import * as c from '../constants'
import * as core from '@actions/core'
import * as fs from 'fs'
import * as github from '@actions/github'
import {join} from 'path'
import {tmpdir} from 'os'
import {
  createChart,
  createPRComment,
  createRef,
  createTree,
  getPrBaseBranchMetrics,
  isPREvent,
  toSemVer
} from '../utils'
import {gte} from 'semver'

const BUILD_OUTPUT_JSON_PATH = join(tmpdir(), 'native-image-build-output.json')
const BYTES_TO_KiB = 1024
const BYTES_TO_MiB = 1024 * 1024
const BYTES_TO_GiB = 1024 * 1024 * 1024
const DOCS_BASE =
    'https://github.com/oracle/graal/blob/master/docs/reference-manual/native-image/BuildOutput.md'
const INPUT_NI_JOB_REPORTS = 'native-image-job-reports'
const INPUT_NI_PR_REPORTS = 'native-image-pr-reports'
const INPUT_NI_JOB_METRIC_HISTORY = 'native-image-metric-history'
const INPUT_NI_HISTORY_BUILD_COUNT = 'build-counts-for-metric-history'
const INPUT_NI_PR_COMPARISON = 'native-image-pr-comparison'
const NATIVE_IMAGE_CONFIG_FILE = join(
    tmpdir(),
    'native-image-options.properties'
)
const NATIVE_IMAGE_CONFIG_FILE_ENV = 'NATIVE_IMAGE_CONFIG_FILE'

interface AnalysisResult {
  total: number
  reachable: number
  reflection: number
  jni: number
}

interface BuildOutput {
  general_info: {
    name: string
    graalvm_version: string
    java_version: string | null
    vendor_version?: string
    c_compiler: string | null
    garbage_collector: string
    graal_compiler?: {
      optimization_level: string
      march: string
      pgo?: string[]
    }
  }
  analysis_results: {
    classes: AnalysisResult
    types?: AnalysisResult
    fields: AnalysisResult
    methods: AnalysisResult
  }
  image_details: {
    total_bytes: number
    code_area: {
      bytes: number
      compilation_units: number
    }
    image_heap: {
      bytes: number
      objects?: {
        count: number
      }
      resources: {
        count: number
        bytes: number
      }
    }
    debug_info?: {
      bytes: number
    }
    runtime_compiled_methods?: {
      count: number
      graph_encoding_bytes: number
    }
  }
  resource_usage: {
    cpu: {
      load: number
      total_cores: number
    }
    garbage_collection: {
      count: number
      total_secs: number
    }
    memory: {
      system_total: number
      peak_rss_bytes: number
    }
    total_secs?: number
  }
}

export async function setUpNativeImageBuildReports(
    isGraalVMforJDK17OrLater: boolean,
    graalVMVersion: string,
): Promise<void> {
  const isRequired = areJobReportsEnabled() || arePRReportsEnabled()
  if (!isRequired) {
    return
  }
  const isSupported =
      isGraalVMforJDK17OrLater ||
      graalVMVersion === c.VERSION_LATEST ||
      graalVMVersion === c.VERSION_DEV ||
      (!graalVMVersion.startsWith(c.MANDREL_NAMESPACE) &&
          gte(toSemVer(graalVMVersion), '22.2.0'))
  if (!isSupported) {
    core.warning(
        `Build reports for PRs and job summaries are only available in GraalVM 22.2.0 or later. This build job uses GraalVM ${graalVMVersion}.`
    )
    return
  }
  core.info(`DEBUGGING: -H:BuildOutputJSONFile=${BUILD_OUTPUT_JSON_PATH.replace(/\\/g, '\\\\')}`)
  setNativeImageOption(
      `-H:BuildOutputJSONFile=${BUILD_OUTPUT_JSON_PATH.replace(/\\/g, '\\\\')}`
  )// Escape backslashes for Windows
}

export async function generateReports(): Promise<void> {
  if (areJobReportsEnabled() || arePRReportsEnabled()) {
    core.info(`DEBUGGING: ${BUILD_OUTPUT_JSON_PATH}`)
    if (!fs.existsSync(BUILD_OUTPUT_JSON_PATH)) {
      core.warning(
          'Unable to find build output data to create a report. Are you sure this build job has used GraalVM Native Image?'
      )
      return
    }
    const buildOutput: BuildOutput = JSON.parse(
        fs.readFileSync(BUILD_OUTPUT_JSON_PATH, 'utf8')
    )

    const report = createReport(buildOutput)
    if (areJobReportsEnabled()) {
      core.summary.addRaw(report)
      await core.summary.write()
    }
    if (arePRReportsEnabled()) {
      const baseBranchBuildOutput: BuildOutput = JSON.parse(await getPrBaseBranchMetrics())
      const prReport = creatPRReport(buildOutput, baseBranchBuildOutput)
      core.info(prReport)
      await createPRComment(prReport)
    }

    const treeSha = await createTree(JSON.stringify(buildOutput))
    await createRef(treeSha)
    if (areMetricHistoriesEnabled()) {
      /*const pushEvents = await getPushEvents(getBuildCountsForMetricHistory())
      // Prepare data
      const timestamps = []
      const shas = []
      for (let i=0; i < pushEvents.length; i++) {
        timestamps.push(pushEvents[i].created_at)
        shas.push(pushEvents[i].payload.commits[pushEvents[i].payload.commits.length - 1].sha)

      }
      const imageData = await getImageData(shas)
      const commitDates = formatTimestamps(timestamps)
      const mermaidDiagramm = createHistoryDiagramm(shas, imageData, commitDates)
      core.summary.addRaw(mermaidDiagramm)
      await core.summary.write()*/
      await createChart()
    }

    if (arePRBaseComparisonEnabled()) {
      const prMetrics: BuildOutput = JSON.parse(
          await getPrBaseBranchMetrics()
      )
      await createPRComment(createPRComparison(buildOutput, prMetrics))
    }
  }
}

function areJobReportsEnabled(): boolean {
  return core.getInput(INPUT_NI_JOB_REPORTS) === 'true'
}

function arePRReportsEnabled(): boolean {
  return isPREvent() && core.getInput(INPUT_NI_PR_REPORTS) === 'true'
}

function areMetricHistoriesEnabled(): boolean {
  return core.getInput(INPUT_NI_JOB_METRIC_HISTORY) === 'true'
}

function arePRBaseComparisonEnabled(): boolean {
  return isPREvent() && core.getInput(INPUT_NI_PR_COMPARISON) === 'true'
}

function getBuildCountsForMetricHistory(): number {
  return Number(core.getInput(INPUT_NI_HISTORY_BUILD_COUNT))
}

function getNativeImageOptionsFile(): string {
  let optionsFile = process.env[NATIVE_IMAGE_CONFIG_FILE_ENV]
  if (optionsFile === undefined) {
    optionsFile = NATIVE_IMAGE_CONFIG_FILE
    core.exportVariable(NATIVE_IMAGE_CONFIG_FILE_ENV, optionsFile)
  }
  return optionsFile
}

function setNativeImageOption(value: string): void {
  const optionsFile = getNativeImageOptionsFile()
  if (fs.existsSync(optionsFile)) {
    fs.appendFileSync(optionsFile, ` ${value}`)
  } else {
    fs.writeFileSync(optionsFile, `NativeImageArgs = ${value}`)
  }
}

function createPRComparison(dataRecent: BuildOutput, dataBase: BuildOutput): string {
  const detailsRecent = dataRecent.image_details
  const detailsBase = dataBase.image_details
  const debugInfoBytesRecent = detailsRecent.debug_info ? detailsRecent.debug_info.bytes : 0
  const otherBytesRecent =
      detailsRecent.total_bytes -
      detailsRecent.code_area.bytes -
      detailsRecent.image_heap.bytes -
      debugInfoBytesRecent

  const debugInfoBytesBase = detailsBase.debug_info ? detailsBase.debug_info.bytes : 0
  const otherBytesBase =
      detailsBase.total_bytes -
      detailsBase.code_area.bytes -
      detailsBase.image_heap.bytes -
      debugInfoBytesBase

  const baseBranch = process.env.GITHUB_BASE_REF
  const recentBranch = process.env.GITHUB_HEAD_REF

  return `## GraalVM Native Image PR comparison

#### Image Details

\`\`\`mermaid
gantt
    title Native Image Size Details 
    todayMarker off
    dateFormat  X
    axisFormat %

    section Code area
    ${recentBranch} (${bytesToHuman(detailsRecent.code_area.bytes)}): active, 0, ${detailsRecent.code_area.bytes}
    ${baseBranch} (${bytesToHuman(detailsBase.code_area.bytes)}): 0, ${detailsBase.code_area.bytes}
    
    section Image heap
    ${recentBranch} (${bytesToHuman(detailsRecent.image_heap.bytes)}): active, 0, ${detailsRecent.image_heap.bytes}
    ${baseBranch} (${bytesToHuman(detailsBase.image_heap.bytes)}): 0, ${detailsBase.image_heap.bytes}
    
    section Other data
    ${recentBranch} (${bytesToHuman(otherBytesRecent)}): active, 0, ${otherBytesRecent}
    ${baseBranch} (${bytesToHuman(otherBytesBase)}): 0, ${otherBytesBase}

    section Total
    ${recentBranch} (${bytesToHuman(detailsRecent.total_bytes)})   : active, 0, ${detailsRecent.total_bytes}
    ${baseBranch} (${bytesToHuman(detailsBase.total_bytes)})   : 0, ${detailsBase.total_bytes}
\`\`\`

<em>Report generated by <a href="https://github.com/marketplace/actions/github-action-for-graalvm" target="_blank">setup-graalvm</a>.</em>`
}

function createHistoryDiagramm(shas: String[], metricDataList: any[], commitDates: any[]): string {
  let mermaidDiagramm = `## GraalVM Native Image PR comparison

#### Image Details

\`\`\`mermaid
gantt
    title Native Image Size Details 
    todayMarker off
    dateFormat  X
    axisFormat %
    
`
  for (let i=0; i<metricDataList.length; i++) {
    mermaidDiagramm = mermaidDiagramm + `
    section ${shas[i].slice(0, 8)}...
    ${commitDates[i]} (${bytesToHuman(JSON.parse(metricDataList[i]).image_details.total_bytes)}): ${shas[i] === process.env.GITHUB_SHA? 'active, ': ''} 0, ${JSON.parse(metricDataList[i]).image_details.total_bytes}
    
    `
  }
  mermaidDiagramm = mermaidDiagramm + `
    
\`\`\`

<em>Report generated by <a href="https://github.com/marketplace/actions/github-action-for-graalvm" target="_blank">setup-graalvm</a>.</em>`
  return mermaidDiagramm
}

function createReport(data: BuildOutput): string {
  const context = github.context
  const info = data.general_info
  const analysis = data.analysis_results
  const analysisTypes = analysis.types ? analysis.types : analysis.classes
  const details = data.image_details
  let objectCount = ''
  if (details.image_heap.objects) {
    objectCount = `${details.image_heap.objects.count.toLocaleString()} objects, `
  }
  const debugInfoBytes = details.debug_info ? details.debug_info.bytes : 0
  const otherBytes =
      details.total_bytes -
      details.code_area.bytes -
      details.image_heap.bytes -
      debugInfoBytes
  let debugInfoLine = ''
  if (details.debug_info) {
    debugInfoLine = `
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-debug-info" target="_blank">Debug info</a></td>
      <td align="right">${bytesToHuman(debugInfoBytes)}</td>
      <td align="right">${toPercent(debugInfoBytes, details.total_bytes)}</td>
      <td align="left"></td>
    </tr>`
  }
  let versionLine
  if (info.vendor_version) {
    versionLine = `
    <tr>
      <td><a href="${DOCS_BASE}#glossary-java-info" target="_blank">Java version</a></td>
      <td>${info.java_version}</td>
      <td><a href="${DOCS_BASE}#glossary-java-info" target="_blank">Vendor version</a></td>
      <td>${info.vendor_version}</td>
    </tr>`
  } else {
    versionLine = `
    <tr>
      <td><a href="${DOCS_BASE}#glossary-version-info" target="_blank">GraalVM version</a></td>
      <td>${info.graalvm_version}</td>
      <td><a href="${DOCS_BASE}#glossary-java-version-info" target="_blank">Java version</a></td>
      <td>${info.java_version}</td>
    </tr>`
  }
  let graalLine
  if (info.graal_compiler) {
    let pgoSuffix = ''
    const isOracleGraalVM =
        info.vendor_version && info.vendor_version.includes('Oracle GraalVM')
    if (isOracleGraalVM) {
      const pgo = info.graal_compiler.pgo
      const pgoText = pgo ? pgo.join('+') : 'off'
      pgoSuffix = `, <a href="${DOCS_BASE}#recommendation-pgo" target="_blank">PGO</a>: ${pgoText}`
    }
    graalLine = `
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-graal-compiler" target="_blank">Graal compiler</a></td>
      <td colspan="3">
        optimization level: ${info.graal_compiler.optimization_level},
        target machine: ${info.graal_compiler.march}${pgoSuffix}
      </td>
    </tr>`
  }

  const resources = data.resource_usage

  let totalTime = ''
  let gcTotalTimeRatio = ''
  if (resources.total_secs) {
    totalTime = ` in ${secondsToHuman(resources.total_secs)}`
    gcTotalTimeRatio = ` (${toPercent(
        resources.garbage_collection.total_secs,
        resources.total_secs
    )} of total time)`
  }

  return `## GraalVM Native Image Build Report

\`${info.name}\` generated${totalTime} as part of the '${
      context.job
  }' job in run <a href="${context.serverUrl}/${context.repo.owner}/${
      context.repo.repo
  }/actions/runs/${context.runId}" target="_blank">#${context.runNumber}</a>.

#### Environment

<table>${versionLine}${graalLine}
  <tr>
    <td><a href="${DOCS_BASE}#glossary-ccompiler" target="_blank">C compiler</a></td>
    <td colspan="3">${info.c_compiler}</td>
  </tr>
  <tr>
    <td><a href="${DOCS_BASE}#glossary-gc" target="_blank">Garbage collector</a></td>
    <td colspan="3">${info.garbage_collector}</td>
  </tr>
</table>

#### Analysis Results

<table>
  <thead>
    <tr>
      <th align="left">Category</th>
      <th align="right">Types</th>
      <th align="right">in %</th>
      <th align="right">Fields</th>
      <th align="right">in %</th>
      <th align="right">Methods</th>
      <th align="right">in %</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-reachability" target="_blank">Reachable</a></td>
      <td align="right">${analysisTypes.reachable.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysisTypes.reachable,
      analysisTypes.total
  )}</td>
      <td align="right">${analysis.fields.reachable.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysis.fields.reachable,
      analysis.fields.total
  )}</td>
      <td align="right">${analysis.methods.reachable.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysis.methods.reachable,
      analysis.methods.total
  )}</td>
    </tr>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-reflection-registrations" target="_blank">Reflection</a></td>
      <td align="right">${analysisTypes.reflection.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysisTypes.reflection,
      analysisTypes.total
  )}</td>
      <td align="right">${analysis.fields.reflection.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysis.fields.reflection,
      analysis.fields.total
  )}</td>
      <td align="right">${analysis.methods.reflection.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysis.methods.reflection,
      analysis.methods.total
  )}</td>
    </tr>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-jni-access-registrations" target="_blank">JNI</a></td>
      <td align="right">${analysisTypes.jni.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysisTypes.jni,
      analysisTypes.total
  )}</td>
      <td align="right">${analysis.fields.jni.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysis.fields.jni,
      analysis.fields.total
  )}</td>
      <td align="right">${analysis.methods.jni.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysis.methods.jni,
      analysis.methods.total
  )}</td>
    </tr>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-reachability" target="_blank">Loaded</a></td>
      <td align="right">${analysisTypes.total.toLocaleString()}</td>
      <td align="right">100.000%</td>
      <td align="right">${analysis.fields.total.toLocaleString()}</td>
      <td align="right">100.000%</td>
      <td align="right">${analysis.methods.total.toLocaleString()}</td>
      <td align="right">100.000%</td>
    </tr>
  </tbody>
</table>

#### Image Details

<table>
  <thead>
    <tr>
      <th align="left">Category</th>
      <th align="right">Size</th>
      <th align="right">in %</th>
      <th align="left">Details</th>
      <th 
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-code-area" target="_blank">Code area</a></td>
      <td align="right">${bytesToHuman(details.code_area.bytes)}</td>
      <td align="right">${toPercent(
      details.code_area.bytes,
      details.total_bytes
  )}</td>
      <td align="left">${details.code_area.compilation_units.toLocaleString()} compilation units</td>
      <td></td>
    </tr>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-image-heap" target="_blank">Image heap</a></td>
      <td align="right">${bytesToHuman(details.image_heap.bytes)}</td>
      <td align="right">${toPercent(
      details.image_heap.bytes,
      details.total_bytes
  )}</td>
      <td align="left">${objectCount}${bytesToHuman(
      details.image_heap.resources.bytes
  )} for ${details.image_heap.resources.count.toLocaleString()} resources</td>
    </tr>${debugInfoLine}
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-other-data" target="_blank">Other data</a></td>
      <td align="right">${bytesToHuman(otherBytes)}</td>
      <td align="right">${toPercent(otherBytes, details.total_bytes)}</td>
      <td align="left"></td>
    </tr>
    <tr>
      <td align="left">Total</td>
      <td align="right"><strong>${bytesToHuman(
      details.total_bytes
  )}</strong></td>
      <td align="right">100.000%</td>
      <td align="left"></td>
    </tr>
  </tbody>
</table>

#### Resource Usage

<table>
  <tbody>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-garbage-collections" target="_blank">Garbage collection</a></td>
      <td align="left">${resources.garbage_collection.total_secs.toFixed(
      2
  )}s${gcTotalTimeRatio} in ${resources.garbage_collection.count} GCs</td>
    </tr>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-peak-rss" target="_blank">Peak RSS</a></td>
      <td align="left">${bytesToHuman(
      resources.memory.peak_rss_bytes
  )} (${toPercent(
      resources.memory.peak_rss_bytes,
      resources.memory.system_total
  )} of ${bytesToHuman(resources.memory.system_total)} system memory)</td>
    </tr>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-cpu-load" target="_blank">CPU load</a></td>
      <td align="left">${resources.cpu.load.toFixed(3)} (${toPercent(
      resources.cpu.load,
      resources.cpu.total_cores
  )} of ${resources.cpu.total_cores} CPU cores)</td>
    </tr>
  </tbody>
</table>

<em>Report generated by <a href="https://github.com/marketplace/actions/github-action-for-graalvm" target="_blank">setup-graalvm</a>.</em>`
}


function toPercent(part: number, total: number): string {
  return `${((part / total) * 100).toFixed(3)}%`
}

function getDiffPercent(baseValue: number, recentValue: number):string {
  let sign = '+'
  if (recentValue < baseValue) {
    sign = '-'
  }
  return `${sign}${(Math.abs(recentValue-baseValue) / baseValue * 100).toFixed(3)}%`
}

function bytesToHuman(bytes: number): string {
  if (Math.abs(bytes) < BYTES_TO_KiB) {
    return `${bytes.toFixed(2)}B`
  } else if (Math.abs(bytes) < BYTES_TO_MiB) {
    return `${(bytes / BYTES_TO_KiB).toFixed(2)}KB`
  } else if (Math.abs(bytes) < BYTES_TO_GiB) {
    return `${(bytes / BYTES_TO_MiB).toFixed(2)}MB`
  } else {
    return `${(bytes / BYTES_TO_GiB).toFixed(2)}GB`
  }
}

function secondsToHuman(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  } else {
    return `${Math.trunc(seconds / 60)}m ${Math.trunc(seconds % 60)}s`
  }
}

function creatPRReport(recentData: BuildOutput, baseBranchData: BuildOutput): string {
  const context = github.context
  const baseBranch = process.env.GITHUB_BASE_REF
  const recentBranch = process.env.GITHUB_HEAD_REF
  const info = recentData.general_info
  const analysis = recentData.analysis_results
  const analysisTypes = analysis.types ? analysis.types : analysis.classes
  const recentDetails = recentData.image_details
  const baseBranchDetails = baseBranchData.image_details
  let objectCount = ''
  if (recentDetails.image_heap.objects) {
    objectCount = `${recentDetails.image_heap.objects.count.toLocaleString()} objects, `
  }
  const debugInfoBytes = recentDetails.debug_info ? recentDetails.debug_info.bytes : 0
  const recentOtherBytes =
      recentDetails.total_bytes -
      recentDetails.code_area.bytes -
      recentDetails.image_heap.bytes -
      debugInfoBytes
  const baseBranchOtherBytes =
      baseBranchDetails.total_bytes -
      baseBranchDetails.code_area.bytes -
      baseBranchDetails.image_heap.bytes -
      debugInfoBytes
  let debugInfoLine = ''
  if (recentDetails.debug_info) {
    debugInfoLine = `
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-debug-info" target="_blank">Debug info</a></td>
      <td align="right">${bytesToHuman(debugInfoBytes)}</td>
      <td align="right">${toPercent(debugInfoBytes, recentDetails.total_bytes)}</td>
      <td align="left"></td>
    </tr>`
  }
  let versionLine
  if (info.vendor_version) {
    versionLine = `
    <tr>
      <td><a href="${DOCS_BASE}#glossary-java-info" target="_blank">Java version</a></td>
      <td>${info.java_version}</td>
      <td><a href="${DOCS_BASE}#glossary-java-info" target="_blank">Vendor version</a></td>
      <td>${info.vendor_version}</td>
    </tr>`
  } else {
    versionLine = `
    <tr>
      <td><a href="${DOCS_BASE}#glossary-version-info" target="_blank">GraalVM version</a></td>
      <td>${info.graalvm_version}</td>
      <td><a href="${DOCS_BASE}#glossary-java-version-info" target="_blank">Java version</a></td>
      <td>${info.java_version}</td>
    </tr>`
  }
  let graalLine
  if (info.graal_compiler) {
    let pgoSuffix = ''
    const isOracleGraalVM =
        info.vendor_version && info.vendor_version.includes('Oracle GraalVM')
    if (isOracleGraalVM) {
      const pgo = info.graal_compiler.pgo
      const pgoText = pgo ? pgo.join('+') : 'off'
      pgoSuffix = `, <a href="${DOCS_BASE}#recommendation-pgo" target="_blank">PGO</a>: ${pgoText}`
    }
    graalLine = `
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-graal-compiler" target="_blank">Graal compiler</a></td>
      <td colspan="3">
        optimization level: ${info.graal_compiler.optimization_level},
        target machine: ${info.graal_compiler.march}${pgoSuffix}
      </td>
    </tr>`
  }

  const recentResources = recentData.resource_usage
  const baseBranchResources = baseBranchData.resource_usage

  let totalTime = ''
  let gcTotalTimeRatio = ''
  if (recentResources.total_secs) {
    totalTime = ` in ${secondsToHuman(recentResources.total_secs)}`
    gcTotalTimeRatio = ` (${toPercent(
        recentResources.garbage_collection.total_secs,
        recentResources.total_secs
    )} of total time)`
  }

  return `## GraalVM Native Image Build Report

\`${info.name}\` generated${totalTime} as part of the '${
      context.job
  }' job in run <a href="${context.serverUrl}/${context.repo.owner}/${
      context.repo.repo
  }/actions/runs/${context.runId}" target="_blank">#${context.runNumber}</a>.

#### Environment

<table>${versionLine}${graalLine}
  <tr>
    <td><a href="${DOCS_BASE}#glossary-ccompiler" target="_blank">C compiler</a></td>
    <td colspan="3">${info.c_compiler}</td>
  </tr>
  <tr>
    <td><a href="${DOCS_BASE}#glossary-gc" target="_blank">Garbage collector</a></td>
    <td colspan="3">${info.garbage_collector}</td>
  </tr>
</table>

#### Analysis Results

<table>
  <thead>
    <tr>
      <th align="left">Category</th>
      <th align="right">Types</th>
      <th align="right">in %</th>
      <th align="right">Fields</th>
      <th align="right">in %</th>
      <th align="right">Methods</th>
      <th align="right">in %</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-reachability" target="_blank">Reachable</a></td>
      <td align="right">${analysisTypes.reachable.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysisTypes.reachable,
      analysisTypes.total
  )}</td>
      <td align="right">${analysis.fields.reachable.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysis.fields.reachable,
      analysis.fields.total
  )}</td>
      <td align="right">${analysis.methods.reachable.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysis.methods.reachable,
      analysis.methods.total
  )}</td>
    </tr>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-reflection-registrations" target="_blank">Reflection</a></td>
      <td align="right">${analysisTypes.reflection.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysisTypes.reflection,
      analysisTypes.total
  )}</td>
      <td align="right">${analysis.fields.reflection.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysis.fields.reflection,
      analysis.fields.total
  )}</td>
      <td align="right">${analysis.methods.reflection.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysis.methods.reflection,
      analysis.methods.total
  )}</td>
    </tr>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-jni-access-registrations" target="_blank">JNI</a></td>
      <td align="right">${analysisTypes.jni.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysisTypes.jni,
      analysisTypes.total
  )}</td>
      <td align="right">${analysis.fields.jni.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysis.fields.jni,
      analysis.fields.total
  )}</td>
      <td align="right">${analysis.methods.jni.toLocaleString()}</td>
      <td align="right">${toPercent(
      analysis.methods.jni,
      analysis.methods.total
  )}</td>
    </tr>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-reachability" target="_blank">Loaded</a></td>
      <td align="right">${analysisTypes.total.toLocaleString()}</td>
      <td align="right">100.000%</td>
      <td align="right">${analysis.fields.total.toLocaleString()}</td>
      <td align="right">100.000%</td>
      <td align="right">${analysis.methods.total.toLocaleString()}</td>
      <td align="right">100.000%</td>
    </tr>
  </tbody>
</table>

#### Image Details

<table>
  <thead>
    <tr>
      <th align="left">Category</th>
      <th align="right">Size</th>
      <th align="right">in %</th>
      <th align="left">Compared to <i>${baseBranch}</i> (+/- x Bytes)</th>
      <th align="left">Details</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-code-area" target="_blank">Code area</a></td>
      <td align="right">${bytesToHuman(recentDetails.code_area.bytes)}</td>
      <td align="right">${toPercent(
      recentDetails.code_area.bytes,
      recentDetails.total_bytes
  )}</td>
      <td align="left">
${(recentDetails.code_area.bytes - baseBranchDetails.code_area.bytes) < 0 ? `\n\n![#f03c15](https://placehold.co/15x15/008000/008000.png)      ${bytesToHuman(recentDetails.code_area.bytes - baseBranchDetails.code_area.bytes)} (${getDiffPercent(baseBranchDetails.code_area.bytes, recentDetails.code_area.bytes)})      ![#f03c15](https://placehold.co/15x15/008000/008000.png)`: ''}
${(recentDetails.code_area.bytes - baseBranchDetails.code_area.bytes) === 0 ? `${bytesToHuman(recentDetails.code_area.bytes - baseBranchDetails.code_area.bytes)} (${getDiffPercent(baseBranchDetails.code_area.bytes, recentDetails.code_area.bytes)}`: ''}
${(recentDetails.code_area.bytes - baseBranchDetails.code_area.bytes) > 0 ? `\n\n![#f03c15](https://placehold.co/15x15/f03c15/f03c15.png)      ${bytesToHuman(recentDetails.code_area.bytes - baseBranchDetails.code_area.bytes)} (${getDiffPercent(baseBranchDetails.code_area.bytes, recentDetails.code_area.bytes)})      ![#f03c15](https://placehold.co/15x15/f03c15/f03c15.png)`: ''}
</td>
      <td align="left">${recentDetails.code_area.compilation_units.toLocaleString()} compilation units</td>
    </tr>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-image-heap" target="_blank">Image heap</a></td>
      <td align="right">${bytesToHuman(recentDetails.image_heap.bytes)}</td>
      <td align="right">${toPercent(
      recentDetails.image_heap.bytes,
      recentDetails.total_bytes
  )}</td>
      <td align="left">
${(recentDetails.image_heap.bytes - baseBranchDetails.image_heap.bytes) < 0 ? `\n\n![#f03c15](https://placehold.co/15x15/008000/008000.png)      ${bytesToHuman(recentDetails.image_heap.bytes - baseBranchDetails.image_heap.bytes)} (${getDiffPercent(baseBranchDetails.image_heap.bytes, recentDetails.image_heap.bytes)})      ![#f03c15](https://placehold.co/15x15/008000/008000.png)`: ''}
${(recentDetails.image_heap.bytes - baseBranchDetails.image_heap.bytes) === 0 ? `${bytesToHuman(recentDetails.image_heap.bytes - baseBranchDetails.image_heap.bytes)} (${getDiffPercent(baseBranchDetails.image_heap.bytes, recentDetails.image_heap.bytes)})` : ''}
${(recentDetails.image_heap.bytes - baseBranchDetails.image_heap.bytes) > 0 ? `\n\n![#f03c15](https://placehold.co/15x15/f03c15/f03c15.png)      ${bytesToHuman(recentDetails.image_heap.bytes - baseBranchDetails.image_heap.bytes)} (${getDiffPercent(baseBranchDetails.image_heap.bytes, recentDetails.image_heap.bytes)})      ![#f03c15](https://placehold.co/15x15/f03c15/f03c15.png)`: ''}
</td>
      <td align="left">${objectCount}${bytesToHuman(
      recentDetails.image_heap.resources.bytes
  )} for ${recentDetails.image_heap.resources.count.toLocaleString()} resources</td>
    </tr>${debugInfoLine}
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-other-data" target="_blank">Other data</a></td>
      <td align="right">${bytesToHuman(recentOtherBytes)}</td>
      <td align="right">${toPercent(recentOtherBytes, recentDetails.total_bytes)}</td>
      <td align="left">
${(recentOtherBytes - baseBranchOtherBytes) < 0 ? `\n\n![#f03c15](https://placehold.co/15x15/008000/008000.png)      ${bytesToHuman(recentOtherBytes - baseBranchOtherBytes)} (${getDiffPercent(baseBranchOtherBytes, recentOtherBytes)})      ![#f03c15](https://placehold.co/15x15/008000/008000.png)`: ''}
${(recentOtherBytes - baseBranchOtherBytes) === 0 ? `${bytesToHuman(recentOtherBytes - baseBranchOtherBytes)} (${getDiffPercent(baseBranchOtherBytes, recentOtherBytes)})`: ''}
${(recentOtherBytes - baseBranchOtherBytes) > 0 ? `\n\n![#f03c15](https://placehold.co/15x15/f03c15/f03c15.png)      ${bytesToHuman(recentOtherBytes - baseBranchOtherBytes)} (${getDiffPercent(baseBranchOtherBytes, recentOtherBytes)})      ![#f03c15](https://placehold.co/15x15/f03c15/f03c15.png)`: ''}
</td>
      <td align="left"></td>
    </tr>
    <tr>
      <td align="left">Total</td>
      <td align="right"><strong>${bytesToHuman(
      recentDetails.total_bytes
  )}</strong></td>
      <td align="right">100.000%</td>
      <td align="left">
${(recentDetails.total_bytes - baseBranchDetails.total_bytes) < 0 ? `\n\n![#f03c15](https://placehold.co/15x15/008000/008000.png)      ${bytesToHuman(recentDetails.total_bytes - baseBranchDetails.total_bytes)} (${getDiffPercent(baseBranchDetails.total_bytes, recentDetails.total_bytes)})      ![#f03c15](https://placehold.co/15x15/008000/008000.png)`: ''}
${(recentDetails.total_bytes - baseBranchDetails.total_bytes) === 0 ? `${bytesToHuman(recentDetails.total_bytes - baseBranchDetails.total_bytes)} (${getDiffPercent(baseBranchDetails.total_bytes, recentDetails.total_bytes)}`: ''}
${(recentDetails.total_bytes - baseBranchDetails.total_bytes) > 0 ? `\n\n![#f03c15](https://placehold.co/15x15/f03c15/f03c15.png)      ${bytesToHuman(recentDetails.total_bytes - baseBranchDetails.total_bytes)} (${getDiffPercent(baseBranchDetails.total_bytes, recentDetails.total_bytes)})      ![#f03c15](https://placehold.co/15x15/f03c15/f03c15.png)`: ''}
</td>
      <td align="left"></td>
    </tr>
  </tbody>
</table>

#### Resource Usage

<table>
  <tbody>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-garbage-collections" target="_blank">Garbage collection</a></td>
      <td align="left">${recentResources.garbage_collection.total_secs.toFixed(
      2
  )}s${gcTotalTimeRatio} in ${recentResources.garbage_collection.count} GCs</td>
    </tr>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-peak-rss" target="_blank">Peak RSS</a></td>
      <td align="left">${bytesToHuman(
      recentResources.memory.peak_rss_bytes
  )} (${toPercent(
      recentResources.memory.peak_rss_bytes,
      recentResources.memory.system_total
  )} of ${bytesToHuman(recentResources.memory.system_total)} system memory)</td>
    </tr>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-cpu-load" target="_blank">CPU load</a></td>
      <td align="left">${recentResources.cpu.load.toFixed(3)} (${toPercent(
      recentResources.cpu.load,
      recentResources.cpu.total_cores
  )} of ${recentResources.cpu.total_cores} CPU cores)</td>
    </tr>
  </tbody>
</table>

<em>Report generated by <a href="https://github.com/marketplace/actions/github-action-for-graalvm" target="_blank">setup-graalvm</a>.</em>`
}
