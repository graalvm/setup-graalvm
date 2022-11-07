import * as c from '../constants'
import * as core from '@actions/core'
import * as fs from 'fs'
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
    debugInfoLine = `\n| [Debug info](${DOCS_BASE}#glossary-debug-info) | ${bytesToHuman(
      debugInfoBytes
    )} | ${toPercent(debugInfoBytes, details.total_bytes)} |  |`
  }

  const resources = data.resource_usage

  return `## Generated \`${info.name}\`

using [Native Image](https://www.graalvm.org/native-image/) from ${
    info.graalvm_version
  }.

#### Analysis Results

| Category | Classes | in % | Fields | in % | Methods | in % |
|:---------|--------:|-----:|-------:|-----:|--------:|-----:|
| [Reachable](${DOCS_BASE}#glossary-reachability) | ${
    analysis.classes.reachable
  } | ${toPercent(analysis.classes.reachable, analysis.classes.total)} | ${
    analysis.fields.reachable
  } | ${toPercent(analysis.fields.reachable, analysis.fields.total)} | ${
    analysis.methods.reachable
  } | ${toPercent(analysis.methods.reachable, analysis.methods.total)} |
| [Reflection](${DOCS_BASE}#glossary-reflection-registrations) | ${
    analysis.classes.reflection
  } | ${toPercent(analysis.classes.reflection, analysis.classes.total)} | ${
    analysis.fields.reflection
  } | ${toPercent(analysis.fields.reflection, analysis.fields.total)} | ${
    analysis.methods.reflection
  } | ${toPercent(analysis.methods.reflection, analysis.methods.total)} |
| [JNI](${DOCS_BASE}#glossary-jni-access-registrations) | ${
    analysis.classes.jni
  } | ${toPercent(analysis.classes.jni, analysis.classes.total)} | ${
    analysis.fields.jni
  } | ${toPercent(analysis.fields.jni, analysis.fields.total)} | ${
    analysis.methods.jni
  } | ${toPercent(analysis.methods.jni, analysis.methods.total)} |
| [Loaded](${DOCS_BASE}#reachable-classes-fields-and-methods) | ${
    analysis.classes.total
  } | 100.000% | ${analysis.fields.total} | 100.000% | ${
    analysis.methods.total
  } | 100.000% |

#### Image Details

| Category | Size | in % | Details |
|:---------|-----:|-----:|:--------|
| [Code area](${DOCS_BASE}#glossary-code-area)| ${bytesToHuman(
    details.code_area.bytes
  )} | ${toPercent(details.code_area.bytes, details.total_bytes)} | ${
    details.code_area.compilation_units
  } compilation units |
| [Image heap](${DOCS_BASE}#glossary-image-heap) | ${bytesToHuman(
    details.image_heap.bytes
  )} | ${toPercent(
    details.image_heap.bytes,
    details.total_bytes
  )} | ${bytesToHuman(details.image_heap.resources.bytes)} for ${
    details.image_heap.resources.count
  } resources |${debugInfoLine}
| [Other data](${DOCS_BASE}#glossary-other-data) | ${bytesToHuman(
    otherBytes
  )} | ${toPercent(otherBytes, details.total_bytes)} |  |
| Total | **${bytesToHuman(details.total_bytes)}** | 100.000% |  |

#### Resource Usage

| Category | |
|:---------|:------|
| [GCs](${DOCS_BASE}#glossary-garbage-collections) | ${resources.garbage_collection.total_secs.toFixed(
    2
  )}s in ${resources.garbage_collection.count} GCs |
| [Peak RSS](${DOCS_BASE}#glossary-peak-rss) | ${bytesToHuman(
    resources.memory.peak_rss_bytes
  )} |
| [CPU load](${DOCS_BASE}#glossary-cpu-load) | ${resources.cpu.load.toFixed(
    3
  )} (${toPercent(resources.cpu.load, resources.cpu.total_cores)} of ${
    resources.cpu.total_cores
  } CPU cores) |

_Report generated by [setup-graalvm](https://github.com/marketplace/actions/github-action-for-graalvm)._`
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
