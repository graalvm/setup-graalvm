import * as otypes from '@octokit/types'
import {homedir} from 'os'
import {join} from 'path'

export const IS_MACOS = process.platform === 'darwin'
export const IS_WINDOWS = process.platform === 'win32'

export const VERSION_DEV = 'dev'
export const VERSION_LATEST = 'latest'

export const GRAALVM_BASE = join(homedir(), '.graalvm')
export const GRAALVM_FILE_EXTENSION = IS_WINDOWS ? '.zip' : '.tar.gz'
export const GRAALVM_GH_USER = 'graalvm'
export const GRAALVM_PLATFORM = IS_WINDOWS ? 'windows' : process.platform
export const JDK_HOME_SUFFIX = IS_MACOS ? '/Contents/Home' : ''

export const MANDREL_NAMESPACE = 'mandrel-'

export type LatestReleaseResponse =
  otypes.Endpoints['GET /repos/{owner}/{repo}/releases/latest']['response']
