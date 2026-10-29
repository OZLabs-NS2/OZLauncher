# OZ Studio

OZ Studio currently ships as a headless Linux CLI simulator, not a graphical
desktop IDE. It opens the same `.oz` package used by the launcher, uses the
launcher catalog's package and SPIR-V validation, and can execute a deliberately
small subset of apps through a real Vulkan compute queue.

## Requirements

- Linux x86-64 tested; other operating systems are not currently supported.
- A Vulkan 1.0 loader, headers, and a compute-capable GPU or software ICD such
  as Mesa Lavapipe.
- A C compiler (`cc`) for the small simulator runtime, plus Node.js, Python 3,
  and Pillow for package loading and validation.
- `spirv-val` and Pillow must be available to the repository's existing
  launcher package validator.

The package can be inspected without running a GPU shader. Running a shader
fails with an explicit error if the Vulkan device, driver, shader contract, or
required host-visible memory is unavailable. The simulator never executes a
packaged native binary.

## Open and run an app

```sh
node sdk/ozstudio.cjs inspect ./dist/my-app.oz
node sdk/ozstudio.cjs run ./dist/my-app.oz --frames 120
node sdk/ozstudio.cjs run ./dist/my-app.oz --interactive
```

In interactive mode, the process starts paused. Enter:

| Command | Action |
| --- | --- |
| `run` / `resume` | Dispatch continuously at approximately 60 simulator frames per second. |
| `pause` | Stop dispatching while retaining GPU state. |
| `step` | Dispatch one frame while paused or running. |
| `restart` | Restore the packaged initial state and app data; remain paused. |
| `press A` / `release A` | Set/clear a simulated controller button. Supported names: A, B, X, Y, L, R, PLUS, MINUS, LEFT, UP, RIGHT, DOWN. |
| `stats` | Print frame count, changed initial-state bytes, a state checksum, and local dispatch timing. |
| `stop` | Stop the application and exit. |

The runner constructs the existing 8 MiB ABI-1 binding-0 storage buffer, copies
the 1024-byte initial state and app data into their documented offsets, creates
a Vulkan compute pipeline from the package's compute SPIR-V, and dispatches one
workgroup per frame. It accepts only a `main` compute entry point with local
size 1×1×1. The local timing and FPS are observations of this PC's Vulkan
driver, not hardware benchmarks.

The command prints separate statuses for SPIR-V validation, PC simulation, and
Switch 2 verification. A successful PC run never changes the hardware status:
Switch 2 behavior still requires actual hardware testing.

## Unsupported behavior

This version does not render the package's vertex/fragment stages and has no
window, viewport, resolution control, physical gamepad, mouse, touchscreen,
audio device, native lifecycle, or hardware service bridge. It does not emulate
NFC, vibration, UDP, storage/event mailboxes, or the private-storage binding.
It refuses packages declaring unsupported private storage, compute sequences,
audio, or host SDK capabilities rather than silently pretending to provide
those services.

Only the documented binding-0 state/data initialization and simple simulated
button bits are supplied. Therefore apps relying on real input telemetry,
host-service responses, rendering, timing, storage, or events are not
equivalently simulated. Use the launcher/hardware for those cases.

## Result statuses

- **Shader validation passed** — package SPIR-V passed the existing Vulkan 1.0
  validator and launcher package checks.
- **Passed in PC simulation** — the selected compute shader was dispatched by
  the detected desktop Vulkan device.
- **Unsupported by simulator** — a needed package/runtime feature is outside
  this implementation.
- **Requires Switch 2 hardware verification** — always applies to actual console
  compatibility, independent of desktop success.
- **Failed** — package validation, pipeline creation, or dispatch failed.

The current simulator is intentionally a real but narrow compute execution
path, not a mock rendering UI or a claim that the full OZ runtime has been
ported to desktop.
