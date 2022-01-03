import {GRAALVM_PLATFORM} from './constants'
import {exec} from '@actions/exec'
import {join} from 'path'

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
  graalVMHome: string,
  components: string[]
): Promise<void> {
  await exec('gu', ['install', '--no-progress'].concat(components))

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
