# OZUI shader UI

OZUI is an immediate-mode helper library for the SDK's existing GPU app
pipeline. The app still runs one compute shader invocation per frame followed by
the normal fullscreen vertex/fragment draw. OZUI does not add Vulkan
submissions, alter binding 0, or change the host mailbox.

The working vertical slice is the
[Hello World app](../../app-examples/hello-world): it renders a rounded panel,
atlas-backed text, two buttons, controller focus, and touch activation. It
builds and runs through the normal app pipeline.

## Integration and limits

The runtime currently submits one fullscreen fragment shader at 1920×1080.
Widget rectangles use a caller-selected logical coordinate system; the
fragment helper maps pixels with `ozuiMapPixel`. Pass actual output and logical
dimensions so layouts can be reused at another output size. The current
launcher path itself is fixed to 1920×1080.

The console loader still has no native C/C++ callback interface, so the GPU
OZUI library remains a GLSL API for shader-based apps. The repository also ships
a host-side C/C++ facade for SDK projects that need a stable public API while
building and packaging apps: the C headers live at `oz/oz.h` and `oz/ui.h`, with
C++ wrappers in `oz/oz.hpp` and `oz/ui.hpp`. This is a host-side bridge for the
OZ package workflow; it does not replace the verified shader execution model.

`ozui.glsl` is installed beside the generated shader headers by `sdk/build.cjs`.
Existing shader-only apps do not include it and are unchanged.

Current widgets and helpers:

| API | Behavior |
| --- | --- |
| `ozuiPanel` | Rounded panel composited into the fullscreen fragment |
| `ozuiButton` | Stable nonzero ID, controller activation, touch-down activation |
| `ozuiLabelColor` | Render one glyph rectangle from the app's grayscale atlas |
| `OzuiColumn` | Vertical layout with width, padding, and spacing |
| `ozuiDefaultTheme` | Default panel, button, focus, pressed, text colors and radius |
| `ozuiTextOrigin` | Start, center, or end alignment of an atlas glyph rectangle |
| `ozuiMapPixel` | Map fragment coordinates to logical UI coordinates |

Sliders, checkboxes, scroll containers, tabs, modal dialogs, toasts, clipping,
texture widgets, hover state, arbitrary runtime strings, and wrapped text are
not implemented yet. There is no separate vertex buffer or multi-draw batching:
compositing happens in the existing fragment shader. Theme alpha controls
compositing against the app's background; it does not enable Vulkan attachment
blending.

## Frame lifecycle

Include `abi.glsl` and `hb.glsl`, then define `OZUI_INPUT` before including
`ozui.glsl` in the compute shader. The SDK state in this example uses app-owned
scratch words in `c.game`; applications may use their own scratch locations.
Touch coordinates are provided by the existing SDK helper in 1280×720 space.
Keep the same logical coordinate dimensions for hit testing and rendering.

```glsl
#define OZUI_INPUT
#include "ozui.glsl"

void main() {
    OzuiContext ui;
    vec2 pointer = hbTouchCount() > 0u ? hbTouch(0u) : vec2(-1.0);
    uint pointerDown = hbTouchCount() > 0u ? 1u : 0u;
    ozuiBegin(ui, c.game.x, c.game.y, hbPressed(), pointer, pointerDown);

    OzuiColumn column;
    ozuiColumnBegin(column, vec2(300.0, 385.0), 680.0, 0.0, 16.0);
    vec4 startBounds = ozuiColumnNext(column, 72.0);
    vec4 returnBounds = ozuiColumnNext(column, 72.0);
    bool start = ozuiButton(ui, 1u, startBounds);
    bool goBack = ozuiButton(ui, 2u, returnBounds);

    ozuiEnd(ui, c.game.x, c.game.y);
    c.game.w = ui.errors;
    if (start) c.game.z++;
    if (goBack && hbConnected()) hbExit();
    hbEndFrame();
}
```

Use stable, unique, nonzero button IDs and call widgets in the same visual
order on every frame. Focus begins at the first button when its saved ID is no
longer present. Up/left and down/right move focus cyclically; the A button
activates the focused button on its rising edge. A touch activates a button on
the touch-down edge when that position is within its half-open rectangle.
Pointer state and focus are returned by `ozuiEnd`; persist those values between
frames. A released pointer doesn't activate again until a new down edge.

Duplicate IDs are ignored for the duplicate call and set
`OZUI_ERROR_DUPLICATE_ID`. The 33rd button is ignored and sets
`OZUI_ERROR_WIDGET_LIMIT`; ID zero sets `OZUI_ERROR_INVALID_ID`. Inspect
`ui.errors` after `ozuiEnd` and report it through app-owned state or a developer
diagnostic. The context is frame-local; it keeps only the IDs for the current
widget pass and has a fixed limit of 32. At most one button activates per frame.
Pointer input takes precedence over A while held; overlapping pointer targets
resolve to the first button in call order.

## Rendering and text

Include the existing `text.glsl` and `draw.glsl`, define `OZUI_RENDER`, then
include `ozui.glsl` in the fragment shader. OZUI renders rounded rectangles
using the existing signed-distance helpers and composites the returned color
over the app's current color. `ozuiButtonColor` accepts focused and pressed
state so the application can draw input feedback.

The text API samples an `ivec4` glyph rectangle from the grayscale atlas at
`c.atlas`. It does not rasterize arbitrary strings at runtime. Generate glyph
rectangles and the atlas at build time using the existing app asset workflow;
`app-examples/hello-world/assets.py` is the current example. Its developer setup uses
Pillow and the host's DejaVu Sans font package. The app packages the atlas, not
a font engine.

The SDK uses one fragment invocation per output pixel, so adding a widget
doesn't submit another draw. The current widget cap is 32 interactive buttons
per compute frame; ordinary layout and drawing use fixed-size shader values.
There is no persistent allocation in the renderer.

## Validation

`node app-examples/hello-world/build.cjs` compiles and validates all three Vulkan 1.0
shaders. `node app-examples/hello-world/check.cjs` executes the compute SPIR-V on the
desktop Vulkan test path and renders the fragment SPIR-V offscreen. The checks
cover layout coordinates, duplicate IDs, resource limits, controller
navigation/activation, and visible panel, text, and button output. This is not
a substitute for testing touch behavior on the target hardware.
