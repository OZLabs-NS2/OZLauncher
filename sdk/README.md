# HB SDK

Build GPU apps for HBLauncher running through SmileBASIC. The launcher is the
SDK's integration example: normal navigation uses its input helpers, and the
cursor uses native Joy-Con 2 optical samples. Hello World is the minimal app;
[Event System](../app-examples/event-system/README.md) demonstrates the event queue.
Hardware probes live under `tools/`; the launcher has no diagnostics menu.

This SDK targets the repository's qualified **SmileBASIC 4.4.9 / Switch 2
23.0.1** configuration. Launcher apps contain GLSL/SPIR-V, assets and an ABI-1 manifest;
The installable app is a `.oz` ZIP package, not a CPU-native executable.
OZTranspile compiles OpenCL C via clspv or Rust-GPU shader crates via cargo-gpu
into the existing compute-shader slot. It does not translate arbitrary C/C++
desktop programs. OZ Studio runs a limited ABI-1 compute-only Vulkan simulation
on Linux; it does not reproduce the full console renderer or host services.

See the [OZTranspile guide](../docs/oztranspile.md), [OZ Studio guide](../docs/ozstudio.md),
and [compatibility matrix](../docs/transpilation-compatibility.md) for precise
tool requirements and limitations.

Prebuilt `.oz` examples are included under `apps/`. Run
`node sdk/build-examples.cjs` to build source-backed apps and validate the
complete package set. See the [example catalog](../apps/README.md) for controls
and package details.

- [Getting started](#getting-started)
- [Shader API](docs/shaders.md)
- [OZUI shader UI](docs/ozui.md)
- [Host API and service protocol](docs/services.md)
- [Capability matrix and discovery](docs/capabilities.md)
- [Native ABI, qualification and investigation](docs/native.md)
- [Package format, graphics, audio and installation](../README.md)

## Getting started

Install the prerequisites listed in the
[OZTranspile guide](../docs/oztranspile.md), then from the repository root:

```sh
node sdk/create-app.cjs my-app "My App"
node app-examples/my-app/build.cjs
```

The generator refuses to overwrite an existing folder. The default GPU flow copies
Hello World's source, icon generator and assets, sets a unique manifest ID and adds
an empty SDK capability declaration. Edit `assets.py` for the greeting and icon,
`shaders/app.comp` for logic, and `shaders/app.frag` for drawing. Rebuild, return
to the launcher, tap Refresh and select your app. The source project is created
under `app-examples/`, and the build emits `apps/my-app.oz` for installation.
Use OZTranspile for OpenCL C or Rust-GPU shader projects.

To scaffold the supported OpenCL C shader path instead, use
`node sdk/create-app.cjs my-kernel "My Kernel" --lang opencl`. The `--lang c`
alias also creates OpenCL C, not a native CPU app. Rust-GPU projects must use a
shader crate configured for the upstream cargo-gpu toolchain.

The builder copies `sdk/include/state.glsl` as `shaders/abi.glsl`, plus
`hb.glsl`, `draw.glsl`, and `ozui.glsl`. These copies are generated: edit the SDK
originals when changing shared code. It compiles and validates Vulkan 1.0 SPIR-V,
then builds the installable `.oz` package. Keep shader sources and assets with
an app to rebuild it.

A complete compute shader with button handling:

```glsl
#version 450
#extension GL_GOOGLE_include_directive : require
layout(local_size_x=1) in;
#include "abi.glsl"
#include "hb.glsl"
void main() {
    c.motion.x += 1.0 / 60.0;
    c.state.z++;
    c.transition.x = max(0.0, c.transition.x - 1.0 / 15.0);
    if (hbConnected() && (hbPressed() & HB_B) != 0u) hbExit();
    hbEndFrame();
}
```

`c.motion.x` above is the existing animation clock, **not accelerometer data**.
Use `hbAcceleration(0u)` and `hbGyroscope(0u)` for hardware motion. This clock
advances per submitted frame; service work can pause submissions, so it is not
a wall clock. The motion sample contains its own native sampling interval.

For a fragment shader, include the same ABI with read-only access:

```glsl
#define STATE_ACCESS readonly
#include "abi.glsl"
#define HB_READONLY
#include "hb.glsl"
```

Use the example's full-screen triangle and fragment shader as your starting
point. `draw.glsl` supplies shapes and atlas-based text; it requires the atlas
layout described in the root README. There is no runtime font rasterizer.

## Request a hardware feature

An app that sends vibration or NFC requests declares them in `app.json`:

```json
"sdk": {
  "version": 1,
  "capabilities": ["vibration", "nfc"]
}
```

In its compute shader:

```glsl
if (!hbBusy() && (hbPressed() & HB_X) != 0u)
    hbVibrate(0u, 120u, 150u);
if (!hbBusy() && (hbPressed() & HB_A) != 0u)
    hbScanNfc();
```

Only one request can be outstanding. Check completion on subsequent frames
with `!hbBusy()`, then inspect `hbResult()` and response bytes. Track whether
your app submitted a request: an empty mailbox is also not busy. The service
reference describes exact results, payloads and limits. A successful vibration
request means the API accepted it; it does not prove physical actuation.

## Source map

| Path | Responsibility |
| --- | --- |
| `include/state.glsl` | Stable 1024-byte application ABI and binding-zero storage |
| `include/hb.glsl` | Input helpers, motion, keyboard, mouse and service requests |
| `include/draw.glsl` | Analytic 2D drawing and text-atlas sampling |
| `include/ozui.glsl` | Immediate-mode panel, button, layout and atlas-text helpers |
| `build.cjs` | Header installation, shader compilation and SPIR-V validation |
| `create-app.cjs` | Non-overwriting app generator |
| `host/layout.cjs` | Telemetry and mailbox constants; motion decoder |
| `host/hardware.cjs` | Device discovery, native frame calls, motion ownership and pulses |
| `host/runtime.cjs` | App capability validation and serialized mailbox dispatch |
| `host/storage.cjs` | Per-app persistent key-value storage with atomic writes and quotas |
| `tests/event-system.test.cjs` | GPU-executed event queue and mailbox notification tests |
| `docs/ozui.md` | OZUI API, lifecycle, layout, rendering and current limits |
| `host/joy-mouse.cjs` | Direct Jcms service lifecycle and optical sample decoder |
| `host/haptics.cjs` | Native-timed amplitude/frequency envelopes and stop cleanup |
| `native/finite.cjs` | Bounded native jobs with console-side completion |
| `native/repeating.cjs` | Continuous qualified worker with a clean stop context |
| `host/network.cjs` | Console-side UDP exchange |
| `host/nfc.cjs` | Bounded read-only NFC discovery and tag-info scan |
| `host/services.cjs` | Service and audio-input enumeration |
| `native/client.cjs` | Instruction qualification, owned buffers and native calls |
| `native/six.cjs` | Qualified six-argument native worker |
| `native/*-functions.json` | Version-specific signatures and instruction checks |
| `tools/` | Reproducible live probes and offline Capstone inspection |
| `tests/` | Buffer/manifest/mailbox tests and launcher GPU integration tests |

## Test and debug

```sh
bash homebrew-launcher/build-launcher.sh --check
node app-examples/hello-world/check.cjs
node sdk/tests/launcher.cjs
```

The first command builds everything and runs Node and menu compute tests. The
last command checks optical cursor movement, sample deduplication, inconsistent
record rejection and ZR selection through the actual launcher compute shader. Desktop tests do not establish that a console peripheral works.

For a **currently connected, qualified** console session, the audit commands are
read-only. Stateful probes require a standalone bridge with no active SDK owner;
do not run them alongside the normal launcher:

```sh
node sdk/tools/audit-loaded.cjs runs/launcher-SESSION
node sdk/tools/audit.cjs runs/launcher-SESSION
node sdk/tools/probe-hid.cjs runs/launcher-SESSION
node sdk/tools/probe-hid.cjs runs/launcher-SESSION --vibrate
node sdk/tools/probe-services.cjs runs/launcher-SESSION
node sdk/tools/probe-nfc.cjs runs/launcher-SESSION
node sdk/tools/probe-network.cjs runs/launcher-SESSION PC_LAN_IPV4
```

`check-live.cjs SESSION PC_LAN_IPV4` exercises the reusable adapters and NFC
mailbox against a prepared `launcher-auto.json`. It writes the reserved SDK
tail and must be run after the previous SDK owner has been closed, with
the qualified bridge and prepared launcher resources still available. Merely
pausing the graphics worker does not relinquish the Jcms or motion session. Do not run multiple hardware probes or SDK contexts
concurrently: they manage shared device state. The historical pre-SDK loop was
compatible with this check because it did not use the SDK tail or sensors.

Private reports go in the session directory. Do not commit raw dumps, tags,
local addresses, credentials or session logs. SDK allocations are retained for
the console session; use a fresh session after repeated investigation. Normal
app transitions reuse the adapter allocations.

## Current limits

The Joy-Con 2 Jcms service was initialized directly with an owned 16 KiB transfer
buffer. Signed optical movement was captured and the integrated launcher cursor
moved in a console session. Physical vibration was confirmed; native-timed
playback returned nonzero amplitudes and the requested frequencies during the
stream. This is the verified amplitude/frequency path, not a claim that every
HD Rumble 2-specific encoding is implemented.

The continuous worker passed a live repeat/stop test. The continuous graphics integration was verified in a fresh session, and
the recurring cursor stall was confirmed resolved on the console.
NFC tag reads and external keyboard/mouse events require corresponding hardware
tests. Network metadata and controller discovery refresh at explicit worker
boundaries; raw controller, motion and optical records update every frame.

NFC, UDP and haptic requests deliberately pause rendering at a cycle boundary
while the host handles them. Ordinary navigation has no recurring host-poll
pause. The mailbox is suitable for occasional service requests, not low-latency
multiplayer traffic. Consult the capability matrix for unimplemented surfaces.

## Background FTP service

HBLauncher v0.2.0 adds console FTP transfers for title-owned files while GPU
rendering continues. Declare `sdk.services: ["ftp"]` and use the `hbFtp*` helpers.
See [the FTP guide](docs/ftp.md) for the complete manifest, status ABI, file
permissions, lifecycle, client setup and verification commands. The standalone
[ftpd-sb app](https://github.com/ravensclawx/ftpd-sb) is the complete example.
