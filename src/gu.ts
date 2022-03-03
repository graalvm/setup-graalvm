import {GRAALVM_PLATFORM} from './constants'
import {exec} from '@actions/exec'
import {join} from 'path'

const BASE_FLAGS = ['--non-interactive', 'install', '--no-progress']
const COMPONENT_TO_POST_INSTALL_HOOK = new Map<string, Map<string, string>>([
  [
    'linux',
    new Map<string, string>([
      ['ruby', 'languages/ruby/lib/truffle/post_install_hook.sh']
      // ['R', 'languages/R/bin/configure_fastr'] (GR-36105: cannot be run non-interactively)
    ])
  ],
  [
    'darwin',
    new Map<string, string>([
      ['ruby', 'languages/ruby/lib/truffle/post_install_hook.sh']
      // ['R', 'languages/R/bin/configure_fastr'] (GR-36105: cannot be run non-interactively)
    ])
  ]
  // No post install hooks for Windows (yet)
])

export async function setUpGUComponents(
  gdsToken: string,
  graalVMHome: string,
  components: string[]
): Promise<void> {
  const optionalFlags = []
  if (gdsToken.length > 0) {
    optionalFlags.push('--token', gdsToken)
  }

  await exec('gu', BASE_FLAGS.concat(optionalFlags, components))

  const platformHooks = COMPONENT_TO_POST_INSTALL_HOOK.get(GRAALVM_PLATFORM)
  if (platformHooks) {
    for (const component of components) {
      const postInstallHook = platformHooks.get(component)
      if (postInstallHook) {
        await exec(`"${join(graalVMHome, postInstallHook)}"`)
      }
    }
  }
}
