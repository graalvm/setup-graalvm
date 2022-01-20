import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import {IS_LINUX} from './constants'
import {exec} from '@actions/exec'
import {homedir} from 'os'
import {join} from 'path'
import {mkdirP} from '@actions/io'

export async function setUpNativeImageMusl(): Promise<void> {
  if (!IS_LINUX) {
    core.warning('musl is only supported on Linux')
    return
  }
  core.startGroup(`Setting up musl for GraalVM Native Image...`)
  const basePath = join(homedir(), '.musl_feature')
  await mkdirP(basePath)

  const muslName = 'x86_64-linux-musl-native'
  const muslDownloadPath = await tc.downloadTool(
    `http://more.musl.cc/10/x86_64-linux-musl/${muslName}.tgz`
  )
  await tc.extractTar(muslDownloadPath, basePath)
  const muslPath = join(basePath, muslName)
  core.addPath(join(muslPath, 'bin'))

  const zlibVersion = '1.2.11'
  const zlibDownloadPath = await tc.downloadTool(
    `https://zlib.net/zlib-${zlibVersion}.tar.gz`
  )
  await tc.extractTar(zlibDownloadPath, basePath)
  const zlibPath = join(basePath, `zlib-${zlibVersion}`)
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
  core.endGroup()
}
