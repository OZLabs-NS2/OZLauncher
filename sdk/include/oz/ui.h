#ifndef OZ_UI_H
#define OZ_UI_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct ozui_rect {
    float x;
    float y;
    float width;
    float height;
} ozui_rect;

typedef struct ozui_context {
    uint32_t frame_index;
    int pointer_x;
    int pointer_y;
    int pointer_down;
    int hovered;
    int focused;
    int pressed;
    int clicked;
    int toggled;
    int value;
} ozui_context;

void ozui_begin(ozui_context *context);
void ozui_end(ozui_context *context);
void ozui_panel(ozui_context *context, const ozui_rect *rect);
void ozui_label(ozui_context *context, const char *text, float x, float y);
int ozui_button(ozui_context *context, const char *label, float x, float y, float width, float height);
int ozui_checkbox(ozui_context *context, const char *label, int *value, float x, float y, float width, float height);
float ozui_slider(ozui_context *context, const char *label, float value, float min_value, float max_value, float x, float y, float width, float height);
void ozui_window(ozui_context *context, const char *title, float x, float y, float width, float height);

#ifdef __cplusplus
}
#endif

#endif
