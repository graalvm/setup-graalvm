# GitHub Action for GraalVM [![build-test](https://github.com/graalvm/setup-graalvm/actions/workflows/test.yml/badge.svg)](https://github.com/graalvm/setup-graalvm/actions/workflows/test.yml)
This GitHub action sets up [Oracle GraalVM][graalvm], GraalVM [Community Edition (CE)][repo], [Enterprise Edition (EE)][graalvm-ee], or [Mandrel][mandrel], as well as [Native Image][native-image] and GraalVM components such as [Truffle languages][truffle-languages].

## Key Features

This action:

- supports Oracle GraalVM [releases][graalvm-dl], GraalVM Community Edition (CE) [releases], [dev builds][dev-builds], GraalVM Enterprise Edition (EE) [releases][graalvm-ee] (set [`gds-token`](#options)) 22.1.0 and later, and [Mandrel][mandrel] (see [Options](#options))
- exports a `$GRAALVM_HOME` environment variable
- adds `$GRAALVM_HOME/bin` to the `$PATH` environment variable<br>(Native Image, Truffle languages, and tools can be invoked directly)
- sets `$JAVA_HOME` to `$GRAALVM_HOME` by default<br>(can be disabled via `set-java-home: 'false'`, see [Options](#options))
- supports `x64` and `aarch64` (selected automatically, `aarch64` requires a [self-hosted runner][gha-self-hosted-runners])
- supports dependency caching for Apache Maven, Gradle, and sbt (see [`cache` option](#options))
- sets up Windows environments with build tools using [vcvarsall.bat][vcvarsall]
- has built-in support for GraalVM components and the [GraalVM Updater][gu]


## Migrating from GraalVM 22.3 or earlier to the new GraalVM for JDK 17 and later

The new [GraalVM for JDK 17 and JDK 20 release](https://medium.com/graalvm/a-new-graalvm-release-and-new-free-license-4aab483692f5) aligns the GraalVM version scheme with OpenJDK.
As a result, this action no longer requires the `version` option to select a specific GraalVM version.
At the same time, it introduces a new `distribution` option to select a specific GraalVM distribution (`graalvm`, `graalvm-community`, or `mandrel`).
Therefore, to migrate your workflow to use the latest GraalVM release, replace the `version` with the `distribution` option in the workflow `yml` config, for example:

```yml
# ...
- uses: graalvm/setup-graalvm@v1
  with:
    java-version: '17'
    version: '22.3.2' # Old 'version' option for the GraalVM version
    # ...
```

can be replaced with:

```yml
# ...
- uses: graalvm/setup-graalvm@v1
  with:
    java-version: '17.0.7' # for a specific JDK 17; or '17' for the latest JDK 17
    distribution: 'graalvm' # New 'distribution' option
    # ...
```


## Templates

### Quickstart Template

```yml
name: GraalVM build
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: graalvm/setup-graalvm@v1
        with:
          java-version: '17.0.7'
          distribution: 'graalvm' # See 'Options' for all available distributions
          github-token: ${{ secrets.GITHUB_TOKEN }}
      - name: Example step
        run: |
          echo "GRAALVM_HOME: $GRAALVM_HOME"
          echo "JAVA_HOME: $JAVA_HOME"
          java --version
          native-image --version
      - name: Example step using Maven plugin  # https://graalvm.github.io/native-build-tools/latest/maven-plugin.html
        run: mvn -Pnative package
      - name: Example step using Gradle plugin # https://graalvm.github.io/native-build-tools/latest/gradle-plugin.html
        run: gradlew nativeCompile
```

### Building a HelloWorld with GraalVM Native Image on Different Platforms

```yml
name: GraalVM Native Image builds
on: [push, pull_request]
jobs:
  build:
    name: HelloWorld on ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    steps:
      - uses: actions/checkout@v3

      - uses: graalvm/setup-graalvm@v1
        with:
          java-version: '17.0.7'
          distribution: 'graalvm'
          github-token: ${{ secrets.GITHUB_TOKEN }}
          native-image-job-reports: 'true'

      - name: Build and run HelloWorld.java
        run: |
          echo 'public class HelloWorld { public static void main(String[] args) { System.out.println("Hello, World!"); } }' > HelloWorld.java
          javac HelloWorld.java
          native-image HelloWorld
          ./helloworld
      
      - name: Upload binary
        uses: actions/upload-artifact@v2
        with:
          name: helloworld-${{ matrix.os }}
          path: helloworld*
```

<details>
<summary><h4>Template for older GraalVM releases</h4></summary>

```yml
name: GraalVM build
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: graalvm/setup-graalvm@v1
        with:
          version: '22.3.2' # GraalVM version
          java-version: '17'
          components: 'native-image'
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

</details>

<details>
<summary><h4>Template for GraalVM Enterprise Edition</h4></summary>

#### Prerequisites

1. Download the version of [GraalVM Enterprise Edition (EE)][graalvm-ee] you want to run on GitHub Actions.
2. Use the [GraalVM Updater][gu] to install the GraalVM components you need on GitHub Actions and accept the corresponding licenses.
3. Run `$GRAALVM_HOME/bin/gu --show-ee-token` to display your token for the GraalVM Download Service.
4. Store this token as a [GitHub Action secret][gha-secrets]. For this template, we use the name `GDS_TOKEN`.

```yml
name: GraalVM Enterprise Edition build
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: graalvm/setup-graalvm@v1
        with:
          version: '22.3.0'
          gds-token: ${{ secrets.GDS_TOKEN }}
          java-version: '17'
          components: 'native-image'
          github-token: ${{ secrets.GITHUB_TOKEN }}
      - name: Example step
        run: |
          java --version
          native-image --version
```

</details>

## Options

| Name            | Default  | Description |
|-----------------|:--------:|-------------|
| `java-version`<br>*(required)* | n/a | `'17.0.7'` or `'20.0.1'` for a specific Java version, `'dev'` for a dev build with the latest Java version available.<br>(`'8'`, `'11'`, `'16'`, `'19'` are supported for older GraalVM releases.) |
| `distribution`  | `''` | GraalVM distribution (`graalvm` for Oracle GraalVM, `graalvm-community` for GraalVM Community Edition, `mandrel` for Mandrel). |
| `github-token`  | `'${{ github.token }}'` | Token for communication with the GitHub API. Please set this to `${{ secrets.GITHUB_TOKEN }}` (see [templates](#templates)) to allow the action to authenticate with the GitHub API, which helps reduce rate-limiting issues. |
| `set-java-home` | `'true'` | If set to `'true'`, instructs the action to set `$JAVA_HOME` to the path of the GraalVM installation. Overrides any previous action or command that sets `$JAVA_HOME`. |
| `cache`         | `''`     | Name of the build platform to cache dependencies. Turned off by default (`''`). It can also be `'maven'`, `'gradle'`, or `'sbt'` and works the same way as described in [actions/setup-java][setup-java-caching]. |
| `check-for-updates` | `'true'`  | [Annotate jobs][gha-annotations] with update notifications, for example when a new GraalVM release is available. |
| `native-image-musl` | `'false'` | If set to `'true'`, sets up [musl] to build [static binaries][native-image-static] with GraalVM Native Image *(Linux only)*. [Example usage][native-image-musl-build] (be sure to replace `uses: ./` with `uses: graalvm/setup-graalvm@v1`). |
| `native-image-job-reports` *) | `'false'` | If set to `'true'`, post a job summary containing a Native Image build report. |
| `native-image-pr-reports`  *) | `'false'` | If set to `'true'`, post a comment containing a Native Image build report on pull requests. Requires `write` permissions for the [`pull-requests` scope][gha-permissions]. |
| `components`    | `''`     | Comma-separated list of GraalVM components (e.g., `native-image` or `ruby,nodejs`) that will be installed by the [GraalVM Updater][gu]. |
| `version` | `''` | `X.Y.Z` (e.g., `22.3.0`) for a specific [GraalVM release][releases] up to `22.3.2`<br>`mandrel-X.Y.Z` (e.g., `mandrel-21.3.0.0-Final`) for a specific [Mandrel release][mandrel-releases],<br>`mandrel-latest` for [latest Mandrel stable release][mandrel-stable]. |
| `gds-token`     | `''`     | Download token for the GraalVM Download Service. If a non-empty token is provided, the action will set up GraalVM Enterprise Edition (see [GraalVM EE template](#template-for-graalvm-enterprise-edition)). |

**) Make sure that Native Image is used only once per build job. Otherwise, the report is only generated for the last Native Image build.*


## Contributing

We welcome code contributions. To get started, you will need to sign the [Oracle Contributor Agreement][oca] (OCA).

Only pull requests from committers that can be verified as having signed the OCA can be accepted.


[dev-build]: https://github.com/graalvm/graalvm-ce-dev-builds/releases/latest
[dev-builds]: https://github.com/graalvm/graalvm-ce-dev-builds
[gha-annotations]: https://github.com/actions/toolkit/tree/main/packages/core#annotations
[gha-permissions]: https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#permissions
[gha-secrets]: https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-a-repository
[gha-self-hosted-runners]: https://docs.github.com/en/actions/hosting-your-own-runners/about-self-hosted-runners
[gu]: https://www.graalvm.org/reference-manual/graalvm-updater/
[graalvm]: https://www.graalvm.org/
[graalvm-dl]: https://www.oracle.com/java/technologies/downloads/
[graalvm-ee]: https://www.oracle.com/downloads/graalvm-downloads.html
[mandrel]: https://github.com/graalvm/mandrel
[mandrel-releases]: https://github.com/graalvm/mandrel/releases
[mandrel-stable]: https://github.com/graalvm/mandrel/releases/latest
[musl]: https://musl.libc.org/
[native-image]: https://www.graalvm.org/native-image/
[native-image-musl-build]: https://github.com/graalvm/setup-graalvm/blob/778131f1d6837ccd4b2e91382c31830896a2d56e/.github/workflows/test.yml#L74-L92
[native-image-static]: https://github.com/oracle/graal/blob/fa6f4a974dedacf4688dcc430dd100849d9882f2/docs/reference-manual/native-image/StaticImages.md
[oca]: https://oca.opensource.oracle.com
[releases]: https://github.com/graalvm/graalvm-ce-builds/releases
[repo]: https://github.com/oracle/graal
[setup-java-caching]: https://github.com/actions/setup-java/tree/5b36705a13905facb447b6812d613a06a07e371d#caching-packages-dependencies
[stable]: https://github.com/graalvm/graalvm-ce-builds/releases/latest
[truffle-languages]: https://www.graalvm.org/reference-manual/languages/
[vcvarsall]: https://docs.microsoft.com/en-us/cpp/build/building-on-the-command-line
