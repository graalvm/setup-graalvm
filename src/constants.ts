import * as otypes from '@octokit/types'

export const IS_LINUX = process.platform === 'linux'
export const IS_MACOS = process.platform === 'darwin'
export const IS_WINDOWS = process.platform === 'win32'

export const VERSION_DEV = 'dev'
export const VERSION_LATEST = 'latest'

export const GRAALVM_ARCH = determineGraalVMArchitecture()
export const GRAALVM_FILE_EXTENSION = IS_WINDOWS ? '.zip' : '.tar.gz'
export const GRAALVM_GH_USER = 'graalvm'
export const GRAALVM_PLATFORM = IS_WINDOWS ? 'windows' : process.platform
export const JDK_HOME_SUFFIX = IS_MACOS ? '/Contents/Home' : ''

export const MANDREL_NAMESPACE = 'mandrel-'

export const GDS_BASE = 'https://gds.oracle.com/api/20220101'
export const GDS_GRAALVM_PRODUCT_ID = 'D53FAE8052773FFAE0530F15000AA6C6'

export type LatestReleaseResponse =
  otypes.Endpoints['GET /repos/{owner}/{repo}/releases/latest']['response']

function determineGraalVMArchitecture(): string {
  switch (process.arch) {
    case 'x64': {
      return 'amd64'
    }
    case 'arm64': {
      return 'aarch64'
    }
    default: {
      throw new Error(`Unsupported architecture: ${process.arch}`)
    }
  }
}
