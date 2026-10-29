# Release preparation

Maintainer and release commit identity: **RavensClawX**.

The `release` branch is a clean source snapshot with required runtime assets.
Older local development history is not part of that branch. The public repository
is https://github.com/ravensclawx/HBLauncher, with `release` published as `main`.
Do not push every local ref or upload a working-directory ZIP.

Checks:

```sh
node scripts/doctor.cjs --host-only --build
bash homebrew-launcher/build-launcher.sh --check
node sdk/tests/launcher.cjs
node app-examples/hello-world/check.cjs
git diff --check
```

The graphics worker and optical cursor were tested on the supported console.
The recurring batch pause was removed and confirmed resolved. Native-timed
vibration returned nonzero in-stream amplitudes and requested frequencies.
NFC enumeration/detection and a console-to-PC UDP echo passed; actual NFC tag
reads, external keyboard/mouse events, microphone recording and other listed
unimplemented surfaces are not certified. See the SDK capability matrix.

Create a distributable archive from committed files only:

```sh
mkdir -p dist
git archive --format=zip --prefix=HBLauncher/ --output=dist/HBLauncher-source.zip release
sha256sum dist/HBLauncher-source.zip
```

The archive excludes ignored tools, session captures, pairing keys, Wi-Fi
settings and local test executables. It includes compiled GPU shaders, icons,
font atlases, source, the Pico HID dependency and its notice, and documentation.
Users supply their own supported console software and install host dependencies.
The root README retains upstream and third-party attribution, for the included dependencies.
No blanket license has been assigned to third-party material.

Publish updates through the `github` remote using `git push github release:main`.
Never use `--mirror` or `--all` for this prepared source release.
