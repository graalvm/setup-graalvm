import * as otypes from '@octokit/types'

export const INPUT_VERSION = 'version'
export const INPUT_GDS_TOKEN = 'gds-token'
export const INPUT_JAVA_VERSION = 'java-version'
export const INPUT_COMPONENTS = 'components'
export const INPUT_GITHUB_TOKEN = 'github-token'
export const INPUT_SET_JAVA_HOME = 'set-java-home'
export const INPUT_CACHE = 'cache'
export const INPUT_CHECK_FOR_UPDATES = 'check-for-updates'
export const INPUT_NI_MUSL = 'native-image-musl'

export const IS_LINUX = process.platform === 'linux'
export const IS_MACOS = process.platform === 'darwin'
export const IS_WINDOWS = process.platform === 'win32'

export const VERSION_DEV = 'dev'
export const VERSION_LATEST = 'latest'

export const GRAALVM_ARCH = determineGraalVMArchitecture()
export const GRAALVM_FILE_EXTENSION = IS_WINDOWS ? '.zip' : '.tar.gz'
export const GRAALVM_GH_USER = 'graalvm'
export const GRAALVM_PLATFORM = IS_WINDOWS ? 'windows' : process.platform
export const GRAALVM_RELEASES_REPO = 'graalvm-ce-builds'
export const JDK_HOME_SUFFIX = IS_MACOS ? '/Contents/Home' : ''

export const MANDREL_NAMESPACE = 'mandrel-'

export const GDS_BASE = 'https://gds.oracle.com/api/20220101'
export const GDS_GRAALVM_PRODUCT_ID = 'D53FAE8052773FFAE0530F15000AA6C6'

export const ENV_GITHUB_EVENT_NAME = 'GITHUB_EVENT_NAME'
export const EVENT_NAME_PULL_REQUEST = 'pull_request'

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
