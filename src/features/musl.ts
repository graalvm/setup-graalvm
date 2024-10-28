import * as c from '../constants'
import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import {exec} from '../utils'
import {join} from 'path'
import {homedir} from 'os'
import {promises as fs} from 'fs'

const MUSL_NAME = 'musl-gcc'
const MUSL_VERSION = '1.2.4'
const ZLIB_VERSION = '1.2.13'

// Build instructions: https://github.com/oracle/graal/blob/6dab549194b85252f88bda4ee825762d8b02c687/docs/reference-manual/native-image/guides/build-static-and-mostly-static-executable.md?plain=1#L38-L67

export async function setUpNativeImageMusl(): Promise<void> {
  if (!c.IS_LINUX) {
    core.warning('musl is only supported on Linux')
    return
  }
  let toolPath = tc.find(MUSL_NAME, MUSL_VERSION)
  if (toolPath) {
    core.info(`Found musl ${MUSL_VERSION} in tool-cache @ ${toolPath}`)
  } else {
    core.startGroup(`Building musl with zlib for GraalVM Native Image...`)
    // Build musl
    const muslHome = join(homedir(), 'musl-toolchain')
    const muslDownloadPath = await tc.downloadTool(
      `https://musl.libc.org/releases/musl-${MUSL_VERSION}.tar.gz`
    )
    const muslExtractPath = await tc.extractTar(muslDownloadPath)
    const muslPath = join(muslExtractPath, `musl-${MUSL_VERSION}`)
    const muslBuildOptions = {cwd: muslPath}
    await exec(
      './configure',
      [`--prefix=${muslHome}`, '--static'],
      muslBuildOptions
    )
    await exec('make', [], muslBuildOptions)
    await exec('make', ['install'], muslBuildOptions)
    const muslGCC = join(muslHome, 'bin', MUSL_NAME)
    await fs.symlink(
      muslGCC,
      join(muslHome, 'bin', 'x86_64-linux-musl-gcc'),
      'file'
    )
    // Build zlib
    const zlibDownloadPath = await tc.downloadTool(
      `https://zlib.net/fossils/zlib-${ZLIB_VERSION}.tar.gz`
    )
    const zlibExtractPath = await tc.extractTar(zlibDownloadPath)
    const zlibPath = join(zlibExtractPath, `zlib-${ZLIB_VERSION}`)
    const zlibBuildOptions = {
      cwd: zlibPath,
      env: {
        ...process.env,
        CC: muslGCC
      }
    }
    await exec(
      './configure',
      [`--prefix=${muslHome}`, '--static'],
      zlibBuildOptions
    )
    await exec('make', [], zlibBuildOptions)
    await exec('make', ['install'], {cwd: zlibPath})
    // Store in cache
    core.info(
      `Adding musl ${MUSL_VERSION} with zlib ${ZLIB_VERSION} to tool-cache ...`
    )
    toolPath = await tc.cacheDir(muslHome, MUSL_NAME, MUSL_VERSION)
    core.endGroup()
  }
  core.addPath(join(toolPath, 'bin'))
}
