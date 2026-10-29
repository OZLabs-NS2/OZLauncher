# OZTranspile compatibility

This table describes the implemented pipeline, not the full capabilities of
each source language. "Requires frontend validation" means the configured
upstream compiler must parse and compile the source; it is not a blanket
language-support promise.

| Input / feature | Status | Notes |
| --- | --- | --- |
| OpenCL C 1.2 compute kernel | Frontend path implemented | Compiled by clspv to Vulkan SPIR-V; actual subset is defined by clspv. |
| `language: "c"` | Alias | Means OpenCL C, not arbitrary C. |
| Rust shader source | Frontend path implemented, experimental | Cargo nightly and Rust-GPU SPIR-V target are required. Upstream marks the project early-stage. |
| GLSL app vertex/fragment stages | Existing SDK path | Built with `glslangValidator`; these stages remain required for launcher apps. |
| `.oz` ABI-1 packaging | Implemented | ZIP container with `app.json`, assets, and SPIR-V shader resources. |
| Vulkan 1.0 SPIR-V validation | Implemented | `spirv-val` is invoked during frontend compilation and launcher package loading. |
| ABI-1 entry-point validation | Implemented | Launcher requires `main` for the expected vertex, fragment, and compute execution models. |
| Binding-zero app state | Runtime contract | 8 MiB storage buffer; first 1024 bytes are initial state, app data begins at 1024. |
| One-invocation compute simulation | Implemented in PC runner | Vulkan compute only; requires `main` with local size 1×1×1 and binding 0. |
| Scalar arithmetic, arrays, structs, and loops | Upstream-dependent | Accepted only when the chosen frontend produces valid ABI-compatible SPIR-V. No broader semantic guarantee is made. |
| Multiple source files / cross-file C calls | Unsupported by current clspv driver | Configure one OpenCL C entry source; no project-wide C call-graph pass exists. |
| C++ | Unsupported for shader transpilation | No C++-to-ABI shader lowering is implemented. |
| General ISO C / native applications | Unsupported for shader transpilation | This is not the former host-native C/C++ package workflow. |
| Rust host code, `std`, or CPU/GPU partitioning | Unsupported | Rust syntax must compile as a Rust-GPU shader; host behavior is not executed. |
| Recursion, host pointers, allocation, OS/system calls | No portable shader mapping | Rejected by frontend/validator when detectable; no complete custom compatibility analyzer exists. |
| Vulkan extensions or non-1.0 SPIR-V capabilities | Unsupported unless validated by target | Launcher validation targets Vulkan 1.0; desktop extensions do not imply target support. |
| Source maps to original source | Not implemented | Frontend diagnostics may have source locations; optimized shader-to-source mapping is not generated. |
| Switch 2 hardware behavior | Requires hardware verification | Desktop validation and Vulkan execution are not hardware verification. |

Build tools and loader checks are separate from semantic correctness. A green
SPIR-V validator result establishes module validity for the selected target
environment only.
