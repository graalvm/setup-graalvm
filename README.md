# GitHub Action for GraalVM [![build-test](https://github.com/graalvm/setup-graalvm/actions/workflows/test.yml/badge.svg)](https://github.com/graalvm/setup-graalvm/actions/workflows/test.yml)
This GitHub action sets up [GraalVM Community Edition][repo] and GraalVM components such as [Native Image][native-image] and [Truffle languages][truffle-languages].

## Key Features

This action:

- supports GraalVM CE [releases], [dev builds][dev-builds], and [Mandrel][mandrel] (see [options](#options))
- has built-in support for GraalVM components and the [GraalVM updater][gu]
- exports a `$GRAALVM_HOME` environment variable
- adds `$GRAALVM_HOME/bin` to the `$PATH` environment variable<br>(Truffle languages and tools can be invoked directly)
- sets `$JAVA_HOME` to `$GRAALVM_HOME` by default<br>(can be disabled via `set-java-home: 'false'`, see [options](#options))
- sets up Windows environments with build tools using [vcvarsall.bat][vcvarsall]


## Templates

### Quickstart Template

```yml
name: GraalVM build
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: graalvm/setup-graalvm@v1
        with:
          version: 'latest'
          java-version: '11'
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

### Complex Native Image Template

```yml
name: GraalVM Native Image build
on: [push, pull_request]
jobs:
  build:
    name: ${{ matrix.version }} on ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        version: [latest, dev, '21.3.0']
        os: [macos-latest, windows-latest, ubuntu-latest]
    steps:
      - uses: actions/checkout@v2

      - uses: graalvm/setup-graalvm@v1
        with:
          version: ${{ matrix.version }}
          java-version: '11'
          components: 'native-image'
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and run HelloWorld.java
        run: |
          javac HelloWorld.java
          native-image HelloWorld
          ./helloworld
        if: runner.os != 'Windows'
      
      - name: Build and run HelloWorld.java on Windows
        run: |
          javac.exe HelloWorld.java
          native-image.cmd HelloWorld
          ./helloworld.exe
        if: runner.os == 'Windows'
      
      - name: Upload binary
        uses: actions/upload-artifact@v2
        with:
          name: helloworld-${{ matrix.os }}-${{ matrix.version }}
          path: helloworld*
```


## Options

| Name            | Default  | Description |
|-----------------|:--------:|-------------|
| `version`<br>*(required)* | n/a | `X.Y.Z` (e.g., `22.0.0`) for a specific [GraalVM release][releases]<br>`latest` for [latest stable release][stable],<br>`dev` for [latest dev build][dev-build],<br>`mandrel-X.Y.Z` (e.g., `mandrel-21.3.0.0-Final`) for a specific [Mandrel release][mandrel-releases],<br>`mandrel-latest` for [latest Mandrel stable release][mandrel-stable]. |
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
[gu]: https://www.graalvm.org/reference-manual/graalvm-updater/
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
