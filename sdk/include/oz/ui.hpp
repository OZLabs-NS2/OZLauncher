#ifndef OZ_UI_HPP
#define OZ_UI_HPP

#include <cstdint>
#include "ui.h"

namespace oz {
namespace ui {
using rect = ::ozui_rect;
using context = ::ozui_context;

inline void begin() { ::ozui_begin(nullptr); }
inline void begin(context *ctx) { ::ozui_begin(ctx); }
inline void end() { ::ozui_end(nullptr); }
inline void end(context *ctx) { ::ozui_end(ctx); }
inline void panel(context *ctx, const rect &r) { ::ozui_panel(ctx, &r); }
inline void label(const char *text) { ::ozui_label(nullptr, text, 0.0f, 0.0f); }
inline void label(context *ctx, const char *text, float x, float y) { ::ozui_label(ctx, text, x, y); }
inline bool button(const char *label) { return ::ozui_button(nullptr, label, 0.0f, 0.0f, 0.0f, 0.0f) != 0; }
inline bool button(context *ctx, const char *label, float x, float y, float width, float height) {
    return ::ozui_button(ctx, label, x, y, width, height) != 0;
}
inline bool checkbox(const char *label, bool &value) {
    int current = value ? 1 : 0;
    const int clicked = ::ozui_checkbox(nullptr, label, &current, 0.0f, 0.0f, 0.0f, 0.0f);
    value = current != 0;
    return clicked != 0;
}
inline bool checkbox(context *ctx, const char *label, bool &value, float x, float y, float width, float height) {
    int current = value ? 1 : 0;
    const int clicked = ::ozui_checkbox(ctx, label, &current, x, y, width, height);
    value = current != 0;
    return clicked != 0;
}
inline float slider(const char *label, float value, float min_value, float max_value) {
    return ::ozui_slider(nullptr, label, value, min_value, max_value, 0.0f, 0.0f, 0.0f, 0.0f);
}
inline float slider(context *ctx, const char *label, float value, float min_value, float max_value, float x, float y, float width, float height) {
    return ::ozui_slider(ctx, label, value, min_value, max_value, x, y, width, height);
}
inline void window(context *ctx, const char *title, float x, float y, float width, float height) {
    ::ozui_window(ctx, title, x, y, width, height);
}
} // namespace ui
} // namespace oz

#endif
