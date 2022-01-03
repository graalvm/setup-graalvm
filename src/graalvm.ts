import * as c from './constants'
import {downloadAndExtractJDK, getLatestRelease} from './utils'

const GRAALVM_CE_DL_BASE =
  'https://github.com/graalvm/graalvm-ce-builds/releases/download'
const GRAALVM_REPO_DEV_BUILDS = 'graalvm-ce-dev-builds'
const GRAALVM_REPO_RELEASES = 'graalvm-ce-builds'
const GRAALVM_TAG_PREFIX = 'vm-'

export async function setUpGraalVMLatest(javaVersion: string): Promise<string> {
  const latestRelease = await getLatestRelease(GRAALVM_REPO_RELEASES)
  const tag_name = latestRelease.tag_name
  if (tag_name.startsWith(GRAALVM_TAG_PREFIX)) {
    const latestVersion = tag_name.substring(
      GRAALVM_TAG_PREFIX.length,
      tag_name.length
    )
    return setUpGraalVMRelease(latestVersion, javaVersion)
  }
  throw new Error(`Could not find latest GraalVM release: ${tag_name}`)
}

export async function setUpGraalVMDevBuild(
  javaVersion: string
): Promise<string> {
  const latestDevBuild = await getLatestRelease(GRAALVM_REPO_DEV_BUILDS)
  const graalVMIdentifier = determineGraalVMIdentifier('dev', javaVersion)
  const expectedFileName = `${graalVMIdentifier}${c.GRAALVM_FILE_EXTENSION}`
  for (const asset of latestDevBuild.assets) {
    if (asset.name === expectedFileName) {
      return downloadAndExtractJDK(asset.browser_download_url)
    }
  }
  throw new Error('Could not find GraalVM dev build')
}

export async function setUpGraalVMRelease(
  version: string,
  javaVersion: string
): Promise<string> {
  const graalVMIdentifier = determineGraalVMIdentifier(version, javaVersion)
  const downloadUrl = `${GRAALVM_CE_DL_BASE}/${GRAALVM_TAG_PREFIX}${version}/${graalVMIdentifier}${c.GRAALVM_FILE_EXTENSION}`
  return downloadAndExtractJDK(downloadUrl)
}

function determineGraalVMIdentifier(
  version: string,
  javaVersion: string
): string {
  return `graalvm-ce-java${javaVersion}-${c.GRAALVM_PLATFORM}-amd64-${version}`
}
