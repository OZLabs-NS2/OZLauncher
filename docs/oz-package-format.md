# `.oz` package format

## Container and compatibility

An `.oz` file is a ZIP archive. The package is a launcher GPU app identified by
its root `app.json`:

```json
{
  "format": "hblauncher.gpu-app",
  "abi": 1
}
```

The ZIP is not a native executable container and does not have a separate
binary magic header. `format` and `abi` version the application contract;
`version` in the manifest is the app's own version. The launcher continues to
support development folders for backwards compatibility, but new SDK builds
produce `.oz` as the installable artifact. A `.oz` package wins over a
development folder with the same app ID.

## Required files

`app.json` is at the archive root and names package files using relative paths.
At minimum it references:

| Manifest field | Required contents |
| --- | --- |
| `format`, `abi` | `hblauncher.gpu-app`, `1` |
| `id`, `name`, `version`, `description` | Bounded app metadata; ID is lowercase alphanumeric/hyphen. |
| `icon` | Valid PNG. |
| `initialState` | Exactly 1024 bytes for ABI 1. |
| `data` | App data, at most 7 MiB. It begins at byte 1024 of binding 0. |
| `shaders.vertex` | SPIR-V vertex entry point `main`. |
| `shaders.fragment` | SPIR-V fragment entry point `main`. |
| `shaders.compute` | SPIR-V compute entry point `main`. |

Optional manifest fields for private storage, compute sequences, sound effects,
and SDK declarations follow the existing launcher manifest checks and are not
implemented by every desktop simulator.

The runtime ABI is unchanged: descriptor set 0, binding 0 is an 8 MiB storage
buffer. Its first 1024 bytes contain controller/state/mailbox ABI data and app
scratch fields; app data begins at 1024. The SDK reserves the top 64 KiB for
its extension. See [the shader ABI documentation](../sdk/docs/shaders.md).

## Package limits and safety

The packager includes only manifest-referenced resources, rejects symlinks in
the package source, and writes entries in sorted path order. The validator
rejects duplicate names, absolute paths, backslashes, `..` path components,
more than 256 entries, and archives exceeding 64 MiB uncompressed. Each shader
is limited to 1 MiB. Required references must exist in the archive. The launcher
then performs deeper manifest, image, SPIR-V instruction, stage, entry-point,
and state-size validation before loading the app.

Extraction refuses an existing destination, validates before writing, and
confines every resolved file path to that destination. Do not execute files
from an `.oz` package as native programs.

## Build, inspect, extract, install

```sh
node sdk/oztranspile.cjs build ./my-app --output ./dist/my-app.oz
node sdk/oz-package.cjs validate ./dist/my-app.oz
node sdk/oz-package.cjs extract ./dist/my-app.oz ./unpacked-app
```

The included source-backed examples live in `app-examples/`; for example,
`node app-examples/hello-world/build.cjs` emits `apps/hello-world.oz`. The
launcher scans `.oz` files in its configured application catalog directory
(the default is the repository's `apps/` directory in the current host
workflow; `HB_APPS_DIR` can override it). The package is the distributable
app; source folders are kept separately for development.

The current ZIP writer does not promise byte-for-byte reproducible archives.
