import * as c from '../constants.js'
import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import { join } from 'path'

const MUSL_NAME = 'musl-toolchain'
const MUSL_VERSION = '1.2.5-oracle-00001'

export async function setUpNativeImageMusl(): Promise<void> {
  if (!c.IS_LINUX) {
    core.warning('musl is only supported on Linux')
    return
  }
  let toolPath = tc.find(MUSL_NAME, MUSL_VERSION)
  if (toolPath) {
    core.info(`Found ${MUSL_NAME} ${MUSL_VERSION} in tool-cache @ ${toolPath}`)
  } else {
    core.startGroup(`Setting up musl for GraalVM Native Image...`)
    const muslDownloadPath = await tc.downloadTool(
      `https://gds.oracle.com/download/bfs/archive/musl-toolchain-${MUSL_VERSION}-linux-amd64.tar.gz`
    )
    const muslExtractPath = await tc.extractTar(muslDownloadPath)
    const muslPath = join(muslExtractPath, MUSL_NAME)
    core.info(`Adding ${MUSL_NAME} ${MUSL_VERSION} to tool-cache ...`)
    toolPath = await tc.cacheDir(muslPath, MUSL_NAME, MUSL_VERSION)
    core.endGroup()
  }
  core.addPath(join(toolPath, 'bin'))
}
