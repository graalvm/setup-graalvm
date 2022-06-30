# GitHub Action for GraalVM [![build-test](https://github.com/graalvm/setup-graalvm/actions/workflows/test.yml/badge.svg)](https://github.com/graalvm/setup-graalvm/actions/workflows/test.yml)
This GitHub action sets up GraalVM [Community Edition (CE)][repo] or [Enterprise Edition (EE)][graalvm-ee] as well as GraalVM components such as [Native Image][native-image] and [Truffle languages][truffle-languages].

## Key Features

This action:

- supports GraalVM Community Edition (CE) [releases], [dev builds][dev-builds], GraalVM Enterprise Edition (EE) [releases][graalvm-ee] (set [`gds-token`](#options)) 22.1.0 and later, and [Mandrel][mandrel] (see [options](#options))
- has built-in support for GraalVM components and the [GraalVM Updater][gu]
- exports a `$GRAALVM_HOME` environment variable
- adds `$GRAALVM_HOME/bin` to the `$PATH` environment variable<br>(Truffle languages and tools can be invoked directly)
- sets `$JAVA_HOME` to `$GRAALVM_HOME` by default<br>(can be disabled via `set-java-home: 'false'`, see [options](#options))
- supports `amd64` and `aarch64` (selected automatically, `aarch64` requires a [self-hosted runner][gha-self-hosted-runners])
- sets up Windows environments with build tools using [vcvarsall.bat][vcvarsall]


## Templates

### Quickstart Template

```yml
name: GraalVM Community Edition build
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: graalvm/setup-graalvm@v1
        with:
          version: 'latest'
          java-version: '17'
          components: 'native-image'
          github-token: ${{ secrets.GITHUB_TOKEN }}
      - name: Example step
        run: |
          echo "GRAALVM_HOME: $GRAALVM_HOME"
          echo "JAVA_HOME: $JAVA_HOME"
          java --version
          gu --version
          native-image --version
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
      - uses: actions/checkout@v2

      - uses: graalvm/setup-graalvm@v1
        with:
          version: '22.1.0'
          java-version: '11'
          components: 'native-image'
          github-token: ${{ secrets.GITHUB_TOKEN }}

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

### Basic GraalVM Enterprise Edition Template

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
      - uses: actions/checkout@v2
      - uses: graalvm/setup-graalvm@v1
        with:
          version: '22.1.0'
          gds-token: ${{ secrets.GDS_TOKEN }}
          java-version: '11'
          components: 'native-image'
          github-token: ${{ secrets.GITHUB_TOKEN }}
      - name: Example step
        run: |
          java --version
          native-image --version
```


## Options

| Name            | Default  | Description |
|-----------------|:--------:|-------------|
| `version`<br>*(required)* | n/a | `X.Y.Z` (e.g., `21.3.0`) for a specific [GraalVM release][releases]<br>`latest` for [latest stable release][stable],<br>`dev` for [latest dev build][dev-build],<br>`mandrel-X.Y.Z` (e.g., `mandrel-21.3.0.0-Final`) for a specific [Mandrel release][mandrel-releases],<br>`mandrel-latest` for [latest Mandrel stable release][mandrel-stable]. |
| `gds-token`     | `''`     | Download token for the GraalVM Download Service. If a non-empty token is provided, the action will set up GraalVM Enterprise Edition (see [GraalVM EE template](#basic-graalvm-enterprise-edition-template)). |
| `java-version`<br>*(required)* | n/a | `'11'` or `'17'` for a specific Java version.<br>(`'8'` and `'16'` are supported for GraalVM 21.2 and earlier.) |
| `components`    | `''`     | Comma-spearated list of GraalVM components (e.g., `native-image` or `ruby,nodejs`) that will be installed by the [GraalVM Updater][gu]. |
| `github-token`  | `''`     | Token for communication with the GitHub API. Please set to `${{ secrets.GITHUB_TOKEN }}` (see [templates](#templates)) to allow the action to authenticate with the GitHub API, which helps to reduce rate limiting issues. |
| `set-java-home` | `'true'` | If set to `'true'`, instructs the action to set `$JAVA_HOME` to the path of the GraalVM installation. |
| `native-image-musl` | `'false'` | If set to `'true'`, sets up [musl] for building [static images][native-image-static] with GraalVM Native Image *(Linux only)*. [Example usage][native-image-musl-build] (be sure to replace `uses: ./` with `uses: graalvm/setup-graalvm@v1`). |


## Contributing

We welcome code contributions. To get started, you will need to sign the [Oracle Contributor Agreement][oca] (OCA).

Only pull requests from committers that can be verified as having signed the OCA can be accepted.


[dev-build]: https://github.com/graalvm/graalvm-ce-dev-builds/releases/latest
[dev-builds]: https://github.com/graalvm/graalvm-ce-dev-builds
[gha-secrets]: https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-a-repository
[gha-self-hosted-runners]: https://docs.github.com/en/actions/hosting-your-own-runners/about-self-hosted-runners
[gu]: https://www.graalvm.org/reference-manual/graalvm-updater/
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
[stable]: https://github.com/graalvm/graalvm-ce-builds/releases/latest
[truffle-languages]: https://www.graalvm.org/reference-manual/languages/
[vcvarsall]: https://docs.microsoft.com/en-us/cpp/build/building-on-the-command-line
