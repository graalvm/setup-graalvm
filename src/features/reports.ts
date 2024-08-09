import * as c from '../constants'
import * as core from '@actions/core'
import * as fs from 'fs'
import * as github from '@actions/github'
import * as semver from 'semver'
import {join} from 'path'
import {tmpdir} from 'os'
import {
  createPRComment,
  findExistingPRCommentId,
  isPREvent,
  toSemVer,
  updatePRComment
} from '../utils'

const BUILD_OUTPUT_JSON_PATH = join(tmpdir(), 'native-image-build-output.json')
const BYTES_TO_KiB = 1024
const BYTES_TO_MiB = 1024 * 1024
const BYTES_TO_GiB = 1024 * 1024 * 1024
const DOCS_BASE =
  'https://github.com/oracle/graal/blob/master/docs/reference-manual/native-image/BuildOutput.md'
const INPUT_NI_JOB_REPORTS = 'native-image-job-reports'
const INPUT_NI_PR_REPORTS = 'native-image-pr-reports'
const INPUT_NI_PR_REPORTS_UPDATE = 'native-image-pr-reports-update-existing'
const NATIVE_IMAGE_CONFIG_FILE = join(
  tmpdir(),
  'native-image-options.properties'
)
const NATIVE_IMAGE_OPTIONS_ENV = 'NATIVE_IMAGE_OPTIONS'
const NATIVE_IMAGE_CONFIG_FILE_ENV = 'NATIVE_IMAGE_CONFIG_FILE'
const PR_COMMENT_TITLE = '## GraalVM Native Image Build Report'

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
  javaVersionOrDev: string,
  graalVMVersion: string
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
      semver.gte(toSemVer(graalVMVersion), '22.2.0'))
  if (!isSupported) {
    core.warning(
      `Build reports for PRs and job summaries are only available in GraalVM 22.2.0 or later. This build job uses GraalVM ${graalVMVersion}.`
    )
    return
  }
  setNativeImageOption(
    javaVersionOrDev,
    `-H:BuildOutputJSONFile=${BUILD_OUTPUT_JSON_PATH.replace(/\\/g, '\\\\')}`
  ) // Escape backslashes for Windows
}

export async function generateReports(): Promise<void> {
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
      if (arePRReportsUpdateEnabled()) {
        const commentId = await findExistingPRCommentId(PR_COMMENT_TITLE)
        if (commentId) {
          return updatePRComment(report, commentId)
        }
      }
      return createPRComment(report)
    } else if (arePRReportsUpdateEnabled()) {
      throw new Error(
        `'${INPUT_NI_PR_REPORTS_UPDATE}' option requires '${INPUT_NI_PR_REPORTS}' to be set 'true'`
      )
    }
  }
}

function areJobReportsEnabled(): boolean {
  return core.getInput(INPUT_NI_JOB_REPORTS) === 'true'
}

function arePRReportsEnabled(): boolean {
  return isPREvent() && core.getInput(INPUT_NI_PR_REPORTS) === 'true'
}

function arePRReportsUpdateEnabled(): boolean {
  return isPREvent() && core.getInput(INPUT_NI_PR_REPORTS_UPDATE) === 'true'
}

function setNativeImageOption(
  javaVersionOrDev: string,
  optionValue: string
): void {
  const coercedJavaVersionOrDev = semver.coerce(javaVersionOrDev)
  if (
    (coercedJavaVersionOrDev &&
      semver.gte(coercedJavaVersionOrDev, '22.0.0')) ||
    javaVersionOrDev === c.VERSION_DEV ||
    javaVersionOrDev.endsWith('-ea')
  ) {
    /* NATIVE_IMAGE_OPTIONS was introduced in GraalVM for JDK 22 (so were EA builds). */
    let newOptionValue = optionValue
    const existingOptions = process.env[NATIVE_IMAGE_OPTIONS_ENV]
    if (existingOptions) {
      newOptionValue = `${existingOptions} ${newOptionValue}`
    }
    core.exportVariable(NATIVE_IMAGE_OPTIONS_ENV, newOptionValue)
  } else {
    const optionsFile = getNativeImageOptionsFile()
    if (fs.existsSync(optionsFile)) {
      fs.appendFileSync(optionsFile, ` ${optionValue}`)
    } else {
      fs.writeFileSync(optionsFile, `NativeImageArgs = ${optionValue}`)
    }
  }
}

function getNativeImageOptionsFile(): string {
  let optionsFile = process.env[NATIVE_IMAGE_CONFIG_FILE_ENV]
  if (optionsFile === undefined) {
    optionsFile = NATIVE_IMAGE_CONFIG_FILE
    core.exportVariable(NATIVE_IMAGE_CONFIG_FILE_ENV, optionsFile)
  }
  return optionsFile
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

  return `${PR_COMMENT_TITLE}

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

function secondsToHuman(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  } else {
    return `${Math.trunc(seconds / 60)}m ${Math.trunc(seconds % 60)}s`
  }
}
