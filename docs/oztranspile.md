# OZTranspile

OZTranspile is the SDK's local source-to-SPIR-V build front end. Its usable
vertical slice compiles **OpenCL C** with `clspv`, or a Rust-GPU Cargo project
with nightly `cargo`, validates the resulting Vulkan 1.0 SPIR-V, and places it
in the compute-shader slot of the existing ABI-1 GPU app. It does not translate
arbitrary C/C++ executables into shaders.

## Architecture and compatibility report

The current launcher does not load CPU code. It validates `app.json` with
`format: "hblauncher.gpu-app"` and `abi: 1`, then dispatches the app's vertex,
fragment, and compute SPIR-V modules. The app storage is binding 0: an 8 MiB
storage buffer with a 1024-byte initial state and app data at byte 1024. The
SDK's established shader entry point is `main`; existing apps are built for a
single compute invocation. Source projects must retain compatible vertex and
fragment shaders, manifest, icon, state, and data. OZTranspile replaces/builds
the compute module; it does not invent a CPU ABI or rewrite the launcher
mailbox.

The compiler front end is delegated to real toolchains. clspv uses its Clang /
LLVM-based OpenCL C frontend and SPIR-V passes; Rust-GPU uses the rustc
codegen-backend and emits SPIR-V. SPIRV-Tools' `spirv-val` validates the output
for Vulkan 1.0. There is no custom C parser or claim of semantic equivalence
beyond those frontends and the tested package/runtime checks.

## Toolchain

- Node.js, Python 3, and Pillow (used by the repository's package/icon checks).
- `clspv` for OpenCL C projects.
- `spirv-val` from SPIRV-Tools.
- `cargo-gpu` from Rust-GPU and the matching Rust-GPU nightly/toolchain for Rust
  shader crates.
- `glslangValidator` to build the app's GLSL vertex/fragment stages.

The build fails explicitly if a selected frontend or validator is missing.
Install clspv following its upstream build instructions; the upstream project
depends on Clang/LLVM, libclc, SPIRV-Headers, and SPIRV-Tools. Rust-GPU remains an early-stage compiler. Its `cargo gpu build` command manages
the custom rustc SPIR-V backend; follow the upstream toolchain pin for your
installed version. This repository does not download toolchains or require a
hosted service.

## Commands

```sh
node sdk/oztranspile.cjs inspect ./my-app
node sdk/oztranspile.cjs report ./my-app
node sdk/oztranspile.cjs check ./my-app
node sdk/oztranspile.cjs build ./my-app
node sdk/oztranspile.cjs build ./my-app --output ./dist/my-app.oz
node sdk/oz-package.cjs validate ./dist/my-app.oz
node sdk/oz-package.cjs extract ./dist/my-app.oz ./unpacked-app
```

`check` runs the configured frontend and SPIR-V validation, then validates the
complete app against the launcher catalog's current checks. `build` additionally
creates a `.oz` package. By default the package is written next to the project
directory as `<app-id>.oz`; `--output` overrides that path. Copy the resulting
`.oz` file into the launcher's application catalog directory to install it.
The output is a shader app, not an executable.

## Project layout

An OpenCL C project has the following relevant files:

```text
my-app/
  app.json                 # Existing ABI-1 GPU app manifest and render stages
  ozproject.json
  src/main.cl
  assets/...
```

Example `ozproject.json`:

```json
{
  "language": "opencl",
  "entry": "src/main.cl"
}
```

For example, a single-invocation kernel can update the existing animation
clock at float word 16 of binding 0:

```c
__kernel __attribute__((reqd_work_group_size(1, 1, 1)))
void main(__global float *controls) {
    controls[16] += 1.0f / 60.0f;
}
```

The actual `.cl` source must obey clspv's supported OpenCL C 1.2 subset. The
kernel needs to produce the launcher-required compute entry point `main` and
the app's binding-0 storage layout. A successful clspv compile alone does not
prove that a kernel uses the ABI correctly; package validation and the Vulkan
simulator catch some interface failures, but cannot prove algorithmic
equivalence.

For Rust, set `"language": "rust-gpu"` in `ozproject.json` and provide a
Rust-GPU **shader crate** (not a host application) with its upstream cargo-gpu
configuration. The build invokes:

```sh
cargo gpu build --shader-crate PROJECT \
  --output-dir PROJECT/build/rust-gpu \
  --target spirv-unknown-vulkan1.0 --spirv-metadata full
```

If that directory contains more than one `.spv`, set `"artifact"` to the
project-relative shader module that should replace the app's compute stage.
The exported module must have the launcher-required `main` entry point and
ABI-1 binding 0.

## Current limits

- `language: "c"` is retained as an alias for OpenCL C for existing SDK
  projects. It is not ordinary ISO C. `opencl` is the clearer spelling.
- Ordinary C, C++, standard-library programs, native code, multi-file C
  translation units, general system calls, and CPU/GPU partitioning are not
  supported by this shader pipeline.
- Rust syntax is not itself evidence of shader support. Only shader crates that
  actually compile through Rust-GPU to the expected SPIR-V interface are
  supported. The Rust-GPU project currently describes itself as early-stage and
  not production-ready.
- Recursion, host pointers, dynamic allocation, host services, and unsupported
  shader features must be rejected by the upstream frontend or validator;
  OZTranspile does not promise to detect every semantic mismatch.
- Compiler-generated diagnostics are currently frontend diagnostics; precise
  source maps from optimized SPIR-V back to original source are not produced.
- PC validation/execution does not establish Switch 2 driver, timing, memory,
  or hardware compatibility.

See [the compatibility matrix](./transpilation-compatibility.md) and
[the `.oz` package specification](./oz-package-format.md).

## Technology evaluation

- **clspv** is adopted for OpenCL C. Its upstream describes a Clang/LLVM-based
  compiler for OpenCL C 1.2 to Vulkan compute shaders and uses Apache-2.0;
  dependencies retain their own licenses. It is a useful real parser and
  lowering pipeline, but is not a general C/C++-to-shader compiler.
- **Rust-GPU** is adopted as the Rust frontend/backend path through its
  `cargo-gpu` CLI. Upstream documents its rustc SPIR-V codegen backend and
  Rust-GPU-specific toolchain requirements; the project describes the compiler
  as early-stage. Its repository provides Apache-2.0 and MIT license files.
  Its SPIR-V output is passed through `spirv-val`; SPIR-V is not consumed
  directly by OZLauncher as a CPU program.
- **SPIRV-Tools** is used through `spirv-val` rather than implementing a
  validator. It validates module structure and target-environment rules, not
  functional equivalence or Switch 2 hardware behavior.
- **Clang LibTooling** is not currently linked into this project. Adding an AST
  visitor without a real shader backend would not provide useful translation;
  clspv already supplies the frontend for its narrower OpenCL C input.
- **LLVM** is reused indirectly through clspv and Rust-GPU. This repository
  does not add its own LLVM IR-to-shader pass pipeline.
- **Vcc** is the research paper *No More Shading Languages: Compiling C++ to
  Vulkan Shaders* (HPG 2025, paper handle `10.2312/hpg20251167`). It was
  identified from the Eurographics proceedings metadata, but the linked PDF
  could not be retrieved during this work; no public implementation repository
  was identified by the repository searches performed. Consequently its
  implementation, license, compiler requirements, and target interface could
  not be independently verified.
  It cannot safely be reused or integrated on that evidence; no Vcc code is
  copied. The current clspv path is the available, buildable alternative for
  OpenCL C, not a substitute for Vcc's C++ research.

Upstream references:
[clspv](https://github.com/google/clspv),
[Clang LibTooling](https://clang.llvm.org/docs/LibTooling.html),
[LLVM](https://llvm.org/),
[Rust-GPU](https://github.com/Rust-GPU/rust-gpu),
[SPIRV-Tools](https://github.com/KhronosGroup/SPIRV-Tools), and
[the Vcc paper](https://diglib.eg.org/bitstream/handle/10.2312/hpg20251167/hpg20251167.pdf).
