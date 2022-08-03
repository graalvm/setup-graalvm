import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import {IS_LINUX} from './constants'
import {exec} from './utils'
import {join} from 'path'

const MUSL_NAME = 'x86_64-linux-musl-native'
const MUSL_VERSION = '10.2.1'

export async function setUpNativeImageMusl(): Promise<void> {
  if (!IS_LINUX) {
    core.warning('musl is only supported on Linux')
    return
  }
  let toolPath = tc.find(MUSL_NAME, MUSL_VERSION)
  if (toolPath) {
    core.info(`Found ${MUSL_NAME} ${MUSL_VERSION} in tool-cache @ ${toolPath}`)
  } else {
    core.startGroup(`Setting up musl for GraalVM Native Image...`)
    const muslDownloadPath = await tc.downloadTool(
      `https://github.com/graalvm/setup-graalvm/releases/download/x86_64-linux-musl-${MUSL_VERSION}/${MUSL_NAME}.tgz`
    )
    const muslExtractPath = await tc.extractTar(muslDownloadPath)
    const muslPath = join(muslExtractPath, MUSL_NAME)

    const zlibCommit = 'ec3df00224d4b396e2ac6586ab5d25f673caa4c2'
    const zlibDownloadPath = await tc.downloadTool(
      `https://github.com/madler/zlib/archive/${zlibCommit}.tar.gz`
    )
    const zlibExtractPath = await tc.extractTar(zlibDownloadPath)
    const zlibPath = join(zlibExtractPath, `zlib-${zlibCommit}`)
    const zlibBuildOptions = {
      cwd: zlibPath,
      env: {
        ...process.env,
        CC: join(muslPath, 'bin', 'gcc')
      }
    }
    await exec(
      './configure',
      [`--prefix=${muslPath}`, '--static'],
      zlibBuildOptions
    )
    await exec('make', [], zlibBuildOptions)
    await exec('make', ['install'], {cwd: zlibPath})

    core.info(`Adding ${MUSL_NAME} ${MUSL_VERSION} to tool-cache ...`)
    toolPath = await tc.cacheDir(muslPath, MUSL_NAME, MUSL_VERSION)
    core.endGroup()
  }
  core.addPath(join(toolPath, 'bin'))
}
