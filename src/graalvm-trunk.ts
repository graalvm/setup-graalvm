import * as c from './constants'
import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import {SpawnSyncOptionsWithStringEncoding, spawnSync} from 'child_process'
import {mkdirP, mv} from '@actions/io'
import {findJavaHomeInSubfolder} from './utils'
import {join} from 'path'

const GRAALVM_TRUNK_DL =
  'https://github.com/oracle/graal/archive/refs/heads/master.zip'
const GRAALVM_MX_DL =
  'https://github.com/graalvm/mx/archive/refs/heads/master.zip'
const DEFAULT_SUITES = '/compiler,/regex,/sdk,/tools,/truffle'
const GRAAL_REPO_DIR = join(c.GRAALVM_BASE, 'graal')
const VM_DIR = join(GRAAL_REPO_DIR, 'vm')
const MX_DIR = join(c.GRAALVM_BASE, 'mx')
const MX_EXEC = c.IS_WINDOWS ? 'mx.cmd' : 'mx'
const SPAWN_OPTIONS: SpawnSyncOptionsWithStringEncoding = {
  cwd: VM_DIR,
  encoding: 'utf8',
  stdio: 'inherit'
}

const COMPONENTS_TO_SUITE_NAME = new Map<string, string>([
  ['espresso', '/espresso'],
  ['js', '/graal-js'],
  ['llvm-toolchain', '/sulong'],
  ['native-image', '/substratevm'],
  ['nodejs', '/graal-nodejs'],
  ['python', 'graalpython'],
  ['R', 'fastr'],
  ['ruby', 'truffleruby'],
  ['wasm', '/wasm']
])

export async function setUpGraalVMTrunk(
  javaVersion: string,
  components: string[]
): Promise<string> {
  const jdkId = `labsjdk-ce-${javaVersion}`

  core.startGroup(`Downloading GraalVM sources, mx, and ${jdkId}...`)

  await tc.extractZip(await tc.downloadTool(GRAALVM_TRUNK_DL), c.GRAALVM_BASE)
  await mv(join(c.GRAALVM_BASE, 'graal-master'), GRAAL_REPO_DIR)

  await tc.extractZip(await tc.downloadTool(GRAALVM_MX_DL), c.GRAALVM_BASE)
  await mv(join(c.GRAALVM_BASE, 'mx-master'), MX_DIR)
  core.addPath(MX_DIR)
  core.debug(`"${MX_DIR}" added to $PATH`)

  const labsJDKDir = join(c.GRAALVM_BASE, 'labsjdk')
  await mkdirP(labsJDKDir)
  spawnSync(
    MX_EXEC,
    ['--java-home=', 'fetch-jdk', '--jdk-id', jdkId, '--to', labsJDKDir],
    SPAWN_OPTIONS
  )
  const labsJDKHome = findJavaHomeInSubfolder(labsJDKDir)
  core.exportVariable('JAVA_HOME', labsJDKHome)
  core.debug(`$JAVA_HOME set to "${labsJDKHome}"`)

  core.endGroup()

  const dynamicImports = toSuiteNames(components).join(',')
  const mxArgs = [
    '--no-download-progress', // avoid cluttering the build log
    '--disable-installables=true', // installables not needed
    '--force-bash-launchers=true', // disable native launchers
    '--disable-libpolyglot', // avoid building libpolyglot to save time
    '--exclude-components=LibGraal', // avoid building libgraal to save time
    '--dynamicimports',
    dynamicImports
  ]
  if (core.isDebug()) {
    spawnSync(MX_EXEC, mxArgs.concat('graalvm-show'), SPAWN_OPTIONS)
  }
  const graalvmHome = spawnSync(MX_EXEC, mxArgs.concat(['graalvm-home']), {
    ...SPAWN_OPTIONS,
    stdio: 'pipe'
  })
  core.startGroup('Building GraalVM CE from source...')
  spawnSync(MX_EXEC, mxArgs.concat(['build']), SPAWN_OPTIONS)
  core.endGroup()
  const graalvmHomePath = graalvmHome.stdout.trim()
  if (core.isDebug()) {
    const cmd = c.IS_WINDOWS ? 'dir' : 'ls'
    spawnSync(cmd, [graalvmHomePath], {stdio: 'inherit'})
  }
  return graalvmHomePath
}

function toSuiteNames(components: string[]): string[] {
  const names = [DEFAULT_SUITES]
  for (const component of components) {
    const suiteName = COMPONENTS_TO_SUITE_NAME.get(component)
    if (suiteName) {
      names.push(suiteName)
    } else {
      throw new Error(`Unsupported component: ${component}`)
    }
  }
  return names
}
