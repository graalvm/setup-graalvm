import * as c from '../constants'
import * as core from '@actions/core'
import * as fs from 'fs'
import * as github from '@actions/github'
import {join} from 'path'
import {tmpdir} from 'os'
import {createPRComment, isPREvent, toSemVer} from '../utils'
import {gte} from 'semver'

const BUILD_OUTPUT_JSON_PATH = join(tmpdir(), 'native-image-build-output.json')
const BYTES_TO_KiB = 1024
const BYTES_TO_MiB = 1024 * 1024
const BYTES_TO_GiB = 1024 * 1024 * 1024
const DOCS_BASE =
  'https://github.com/oracle/graal/blob/master/docs/reference-manual/native-image/BuildOutput.md'
const INPUT_NI_JOB_REPORTS = 'native-image-job-reports'
const INPUT_NI_PR_REPORTS = 'native-image-pr-reports'
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
    c_compiler: string | null
    garbage_collector: string
  }
  analysis_results: {
    classes: AnalysisResult
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
  }
}

export async function setUpNativeImageBuildReports(
  graalVMVersion: string
): Promise<void> {
  const isRequired = areJobReportsEnabled() || arePRReportsEnabled()
  if (!isRequired) {
    return
  }
  const isSupported =
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
  setNativeImageOption(
    `-H:BuildOutputJSONFile=${BUILD_OUTPUT_JSON_PATH.replace(/\\/g, '\\\\')}`
  ) // Escape backslashes for Windows
}

export function generateReports(): void {
  if (areJobReportsEnabled() || arePRReportsEnabled()) {
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
      core.summary.write()
    }
    if (arePRReportsEnabled()) {
      createPRComment(report)
    }
  }
}

function areJobReportsEnabled(): boolean {
  return core.getInput(INPUT_NI_JOB_REPORTS) === 'true'
}

function arePRReportsEnabled(): boolean {
  return isPREvent() && core.getInput(INPUT_NI_PR_REPORTS) === 'true'
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

function createReport(data: BuildOutput): string {
  const context = github.context
  const info = data.general_info
  const analysis = data.analysis_results
  const details = data.image_details
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

  const resources = data.resource_usage

  return `## GraalVM Native Image Build Report

\`${info.name}\` generated as part of the '${
    context.job
  }' job in run <a href="${context.serverUrl}/${context.repo.owner}/${
    context.repo.repo
  }/actions/runs/${context.runId}" target="_blank">#${context.runNumber}</a>.

#### Environment

<table>
  <tr>
    <td><a href="${DOCS_BASE}#glossary-version-info" target="_blank">GraalVM version</a></td>
    <td>${info.graalvm_version}</td>
    <td><a href="${DOCS_BASE}#glossary-ccompiler" target="_blank">C compiler</a></td>
    <td>${info.c_compiler}</td>
  </tr>
  <tr>
    <td><a href="${DOCS_BASE}#glossary-java-version-info" target="_blank">Java version</a></td>
    <td>${info.java_version}</td>
    <td><a href="${DOCS_BASE}#glossary-gc" target="_blank">Garbage collector</a></td>
    <td>${info.garbage_collector}</td>
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
      <td align="right">${analysis.classes.reachable}</td>
      <td align="right">${toPercent(
        analysis.classes.reachable,
        analysis.classes.total
      )}</td>
      <td align="right">${analysis.fields.reachable}</td>
      <td align="right">${toPercent(
        analysis.fields.reachable,
        analysis.fields.total
      )}</td>
      <td align="right">${analysis.methods.reachable}</td>
      <td align="right">${toPercent(
        analysis.methods.reachable,
        analysis.methods.total
      )}</td>
    </tr>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-reflection-registrations" target="_blank">Reflection</a></td>
      <td align="right">${analysis.classes.reflection}</td>
      <td align="right">${toPercent(
        analysis.classes.reflection,
        analysis.classes.total
      )}</td>
      <td align="right">${analysis.fields.reflection}</td>
      <td align="right">${toPercent(
        analysis.fields.reflection,
        analysis.fields.total
      )}</td>
      <td align="right">${analysis.methods.reflection}</td>
      <td align="right">${toPercent(
        analysis.methods.reflection,
        analysis.methods.total
      )}</td>
    </tr>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-jni-access-registrations" target="_blank">JNI</a></td>
      <td align="right">${analysis.classes.jni}</td>
      <td align="right">${toPercent(
        analysis.classes.jni,
        analysis.classes.total
      )}</td>
      <td align="right">${analysis.fields.jni}</td>
      <td align="right">${toPercent(
        analysis.fields.jni,
        analysis.fields.total
      )}</td>
      <td align="right">${analysis.methods.jni}</td>
      <td align="right">${toPercent(
        analysis.methods.jni,
        analysis.methods.total
      )}</td>
    </tr>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-reachability" target="_blank">Loaded</a></td>
      <td align="right">${analysis.classes.total}</td>
      <td align="right">100.000%</td>
      <td align="right">${analysis.fields.total}</td>
      <td align="right">100.000%</td>
      <td align="right">${analysis.methods.total}</td>
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
      <td align="left">${
        details.code_area.compilation_units
      } compilation units</td>
    </tr>
    <tr>
      <td align="left"><a href="${DOCS_BASE}#glossary-image-heap" target="_blank">Image heap</a></td>
      <td align="right">${bytesToHuman(details.image_heap.bytes)}</td>
      <td align="right">${toPercent(
        details.image_heap.bytes,
        details.total_bytes
      )}</td>
      <td align="left">${bytesToHuman(
        details.image_heap.resources.bytes
      )} for ${details.image_heap.resources.count} resources</td>
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
      )}s in ${resources.garbage_collection.count} GCs</td>
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

function bytesToHuman(bytes: number): string {
  if (bytes < BYTES_TO_KiB) {
    return `${bytes.toFixed(2)}B`
  } else if (bytes < BYTES_TO_MiB) {
    return `${(bytes / BYTES_TO_KiB).toFixed(2)}KB`
  } else if (bytes < BYTES_TO_GiB) {
    return `${(bytes / BYTES_TO_MiB).toFixed(2)}MB`
  } else {
    return `${(bytes / BYTES_TO_GiB).toFixed(2)}GB`
  }
}
