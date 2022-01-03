# GitHub Action for GraalVM [![build-test](https://github.com/graalvm/setup-graalvm/actions/workflows/test.yml/badge.svg)](https://github.com/graalvm/setup-graalvm/actions/workflows/test.yml)
This GitHub action sets up [GraalVM Community Edition][repo] and GraalVM components such as [Native Image][native-image] and [GraalVM languages][graalvm-languages].

## Key Features

This action:

- supports GraalVM CE [releases], [nightly builds][nightly], building from [source][repo], and [Mandrel][mandrel] (see [options](#options))
- has built-in support for GraalVM components and the [GraalVM updater][gu]
- exports a `$GRAALVM_HOME` environment variable
- adds `$GRAALVM_HOME/bin` to the `$PATH` environment variable<br>(GraalVM tools such as `gu` and GraalVM languages can be invoked directly)
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
        version: [latest, nightly, '21.3.0']
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
| `version`<br>*(required)* | n/a | `X.Y.Z` (e.g., `22.0.0`) for a specific [GraalVM release][releases]<br>`latest` for [latest stable release][stable],<br>`nightly` for [latest nightly build][nightly],<br>`trunk` for building GraalVM from [source][repo] (slow, can take several minutes),<br>`mandrel-X.Y.Z` (e.g., `mandrel-21.3.0.0-Final`) for a specific [Mandrel release][mandrel-releases], or<br>`mandrel-latest` for [latest Mandrel stable release][mandrel-stable]. |
| `java-version`<br>*(required)* | n/a | `'11'` or `'17'` for a specific Java version.<br>(`'8'` and `'16'` are supported for GraalVM 21.2 and earlier.) |
| `components`    | `''`     | Comma-spearated list of GraalVM components (e.g., `native-image` or `ruby,nodejs`) that will be installed by the [GraalVM Updater][gu]. |
| `github-token`  | `''`     | Token for communication with the GitHub API. Please set to `${{ secrets.GITHUB_TOKEN }}` (see [templates](#templates)) to allow the action to authenticate with the GitHub API, which helps to reduce rate limiting issues. |
| `set-java-home` | `'true'` | If set to `'true'`, instructs the action to set `$JAVA_HOME` to the path of the GraalVM installation. |

## Contributing

We welcome code contributions. To get started, you will need to sign the [Oracle Contributor Agreement][oca] (OCA).

Only pull requests from committers that can be verified as having signed the OCA can be accepted.


[graalvm-languages]: https://www.graalvm.org/reference-manual/languages/
[gu]: https://www.graalvm.org/reference-manual/graalvm-updater/
[mandrel]: https://github.com/graalvm/mandrel
[mandrel-releases]: https://github.com/graalvm/mandrel/releases
[mandrel-stable]: https://github.com/graalvm/mandrel/releases/latest
[native-image]: https://www.graalvm.org/native-image/
[nightly]: https://github.com/graalvm/graalvm-ce-dev-builds/releases/latest
[oca]: https://oca.opensource.oracle.com
[releases]: https://github.com/graalvm/graalvm-ce-builds/releases
[repo]: https://github.com/oracle/graal
[stable]: https://github.com/graalvm/graalvm-ce-builds/releases/latest
[vcvarsall]: https://docs.microsoft.com/en-us/cpp/build/building-on-the-command-line
