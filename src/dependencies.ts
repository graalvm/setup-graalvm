import * as core from '@actions/core'
import { GRAALVM_PLATFORM } from './constants'
import { exec } from './utils'

const APT_GET_INSTALL_BASE = 'sudo apt-get -y --no-upgrade install'
const COMPONENT_TO_DEPS = new Map<string, Map<string, string>>([
  [
    'linux',
    new Map<string, string>([
      ['nodejs', `${APT_GET_INSTALL_BASE} g++ make`],
      ['ruby', `${APT_GET_INSTALL_BASE} make gcc libssl-dev libz-dev`],
      ['R', `${APT_GET_INSTALL_BASE} libgomp1 build-essential gfortran libxml2 libc++-dev`]
    ])
  ],
  ['darwin', new Map<string, string>([['ruby', 'brew install openssl']])]
])

export async function setUpDependencies(components: string[]): Promise<void> {
  const platformDeps = COMPONENT_TO_DEPS.get(GRAALVM_PLATFORM)
  if (platformDeps) {
    for (const component of components) {
      const depCommand = platformDeps.get(component)
      if (depCommand) {
        core.startGroup(`Installing dependencies for ${component}...`)
        await exec(depCommand)
        core.endGroup()
      }
    }
  }
}
