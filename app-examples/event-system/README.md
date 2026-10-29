# Event System Example

This app demonstrates the SDK's real event queue. Controller button press and
release transitions appear after the frame that produced them; the display
shows the last event, its data/status/sequence, queue availability, and dropped
or malformed-event counters. Hold a button to confirm that it produces one
press event rather than repeating each frame. B or Minus returns to the launcher.

The app needs no service capability for controller events. Service completion
or failure events are emitted only for operations the app is already authorized
to request; the event carries the operation ID and status while the ordinary
mailbox response retains its payload.

Build from the project root:

```sh
node app-examples/event-system/build.cjs
```

See [the shader API guide](../../sdk/docs/shaders.md#events) for event IDs,
queue semantics, overflow behavior, and limitations.
