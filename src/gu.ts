import * as c from './constants'
import * as core from '@actions/core'
import {GRAALVM_PLATFORM} from './constants'
import {exec} from './utils'
import {join} from 'path'
import {gte as semverGte, valid as semverValid} from 'semver'

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
  javaVersion: string,
  graalVMVersion: string,
  graalVMHome: string,
  components: string[],
  gdsToken: string
): Promise<void> {
  if (components.length == 0) {
    return // nothing to do
  }
  if (
    graalVMVersion === c.VERSION_DEV ||
    javaVersion === c.VERSION_DEV ||
    (semverValid(javaVersion) && semverGte(javaVersion, '21.0.0'))
  ) {
    if (components.length == 1 && components[0] === 'native-image') {
      core.warning(
        `Please remove "components: 'native-image'" from your workflow file. It is automatically included since GraalVM for JDK 17: https://github.com/oracle/graal/pull/5995`
      )
    } else {
      core.warning(
        `Unable to install component(s): '${components.join(
          ','
        )}'. The latest GraalVM dev builds and the upcoming GraalVM for JDK 21 no longer include the GraalVM Updater: https://github.com/oracle/graal/issues/6855`
      )
    }
  } else if (graalVMVersion.startsWith(c.MANDREL_NAMESPACE)) {
    core.warning(
      `Mandrel does not support GraalVM component(s): '${components.join(',')}'`
    )
  } else {
    await installGUComponents(gdsToken, graalVMHome, components)
  }
}

async function installGUComponents(
  gdsToken: string,
  graalVMHome: string,
  components: string[]
): Promise<void> {
  await exec('gu', BASE_FLAGS.concat(components), {
    env: {
      ...process.env,
      GRAAL_EE_DOWNLOAD_TOKEN: gdsToken
    }
  })

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
