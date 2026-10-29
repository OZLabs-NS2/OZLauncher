# OZLauncher

**The most powerful way to play.**

OZLauncher is an OZLabs project built to push Nintendo Switch 2 homebrew further. Combining a polished launcher experience with a powerful, developer-focused SDK, OZLauncher aims to make homebrew easier to create, easier to use, and more capable than ever.

> **One platform. Two sides. More possibilities.**

## What is OZLauncher?

OZLauncher brings homebrew development and homebrew usage together in one ecosystem.

For users, it aims to provide a clean, intuitive way to discover, manage, and launch homebrew applications.

For developers, it aims to provide the tools, APIs, and infrastructure needed to create more capable applications without fighting unnecessary complexity.

OZLauncher builds on the existing HBLauncher ecosystem while developing its own identity and expanding its capabilities through OZLabs.

## Goals

- **Powerful homebrew** — enable applications to do more through an expanding SDK.
- **Better developer experience** — make creating, building, testing, and distributing apps easier.
- **Simple app management** — make homebrew applications straightforward to discover and launch.
- **Modern interface** — deliver a polished, controller-friendly experience designed for the console.
- **Extensible architecture** — provide a foundation that can grow alongside the homebrew ecosystem.
- **Developer freedom** — encourage experimentation, creativity, and community-built applications.

## The OZLabs Ecosystem

OZLauncher is part of the broader OZLabs effort to improve the homebrew development experience.

| Component | Purpose |
| --- | --- |
| **OZLauncher** | Homebrew launcher and user-facing platform |
| **OZLabs HB SDK** | Development tools and APIs for homebrew applications |
| **OZLabs** | The engineering and development ecosystem behind the project |

The launcher and SDK are designed to complement one another, bringing application development and everyday use closer together.

## Built for Developers

OZLauncher aims to make homebrew development more approachable without limiting what experienced developers can build.

Planned areas of development include:

- Easier application creation and project setup.
- Clear, documented APIs and development workflows.
- Persistent application data and save support.
- Event-driven application functionality.
- Improved app integration and lifecycle management.
- Testing tools and practical examples.

These capabilities will be documented as they are implemented and verified.

## Built for Users

Homebrew should be powerful without being difficult to use.

OZLauncher aims to make the user experience just as important as the underlying technology, with a focus on intuitive navigation, straightforward application management, and a consistent interface.

## Platform and Compatibility

OZLauncher targets the Nintendo Switch 2 homebrew environment.

Compatibility depends on the underlying runtime, system software, hardware configuration, and supported development environment. Consult the project's documentation for verified requirements and setup instructions.

OZLauncher is not claimed to be a native executable loader or a custom firmware solution unless a future implementation explicitly supports those capabilities.

## Project Status

**Status:** In development.

OZLauncher is being developed as an evolution of the existing homebrew launcher ecosystem, with a focus on expanded capabilities and a better overall experience.

Features, compatibility, and installation procedures will be documented as the project progresses. Refer to the repository's releases and documentation for the current implementation.

## Getting Started

Installation and development instructions will be published here as the project reaches a usable release.

Once available, this section will cover:

1. Supported hardware and software requirements.
2. Installation and initial configuration.
3. Launching OZLauncher.
4. Creating and installing homebrew applications.
5. Building applications with the OZLabs HB SDK.

## Developer Tools

The SDK can package existing shader applications as `.oz`, transpile supported
OpenCL C and Rust-GPU compute kernels into the current ABI-1 app format, and
validate or extract packages. OZ Studio provides a Linux Vulkan compute-only
simulation; it does not render apps or establish Switch 2 hardware compatibility.
See the [OZTranspile guide](docs/oztranspile.md), [OZ Studio guide](docs/ozstudio.md),
[compatibility matrix](docs/transpilation-compatibility.md), and
[`.oz` package specification](docs/oz-package-format.md).

The repository includes prebuilt `.oz` examples—Hello World, Event System,
Snake, Paddle Party, and Minefield—in [apps/](apps/). Source for the first two
examples lives in [app-examples/](app-examples/). Rebuild those examples and
validate all packages with `node sdk/build-examples.cjs`; see
[the example catalog](apps/README.md).

## Contributing

Contributions, testing, documentation improvements, and constructive feedback are welcome as the project develops.

Before submitting changes:

1. Read the project documentation.
2. Check existing issues and discussions.
3. Test changes in the supported development environment.
4. Document new functionality and compatibility requirements.

Follow the repository's contribution guidelines when available.

## Disclaimer

OZLauncher is an independent homebrew project. It is not affiliated with, endorsed by, or sponsored by Nintendo.

Use homebrew software responsibly and understand the risks associated with experimental software. Back up important data and follow the project's official documentation.

## OZLabs

**OZLauncher — The most powerful way to play.**

Built by OZLabs for developers, creators, and the homebrew community.
