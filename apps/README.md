# Preloaded examples

The launcher discovers `.oz` files directly from its app catalog. These
packages are the preload set in this repository. Hello World and Event System
sources live separately in `app-examples/`; games are distributed as `.oz`
packages without their source folders.

| Package | What it demonstrates |
| --- | --- |
| `hello-world.oz` | Starter app, button input, and SDK UI |
| `event-system.oz` | Controller and host-service event queue |
| `snake.oz` | Keyboard, mouse/touch, and Joy-Con 2 arcade controls |
| `pong.oz` | Keyboard and Joy-Con 2 paddle game |
| `minesweeper.oz` | Keyboard, mouse/touch, and Joy-Con 2 puzzle |

Run `node sdk/build-examples.cjs` from the repository root to rebuild the
source-backed examples and validate all five packages. The packages use the
same ABI-1 GPU app format on PC and Switch 2. Switch 2 input uses the SDK's
native keyboard/mouse polling and controller buttons/sticks where those
devices are connected. Hardware validation still requires the console.
