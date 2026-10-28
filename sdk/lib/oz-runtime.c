#define _POSIX_C_SOURCE 200809L

#include "../include/oz/oz.h"
#include "../include/oz/ui.h"

#include <stdio.h>
#include <string.h>
#include <time.h>

static int oz_active = 0;
static int oz_frame_count = 0;
static float oz_tick_seconds = 1.0f / 60.0f;
static oz_log_callback_t oz_log_sink = NULL;
static ozui_context ozui_default_context = {0U, 0, 0, 0, 0, 0, 0, 0, 0, 0};

static void oz_emit_log(const char *message) {
    if (oz_log_sink != NULL) {
        oz_log_sink(message);
        return;
    }
    if (message != NULL) {
        printf("[oz] %s\n", message);
    }
}

void oz_init(void) {
    oz_active = 1;
    oz_frame_count = 0;
}

int oz_running(void) {
    return oz_active;
}

float oz_delta_time(void) {
    return oz_tick_seconds;
}

void oz_begin_frame(void) {
    if (!oz_active) {
        return;
    }
    oz_frame_count += 1;
}

void oz_end_frame(void) {
    (void)0;
}

uint64_t oz_now_ms(void) {
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) {
        return 0ULL;
    }
    return (uint64_t)ts.tv_sec * 1000ULL + (uint64_t)ts.tv_nsec / 1000000ULL;
}

void oz_sleep_ms(uint32_t milliseconds) {
    struct timespec ts;
    ts.tv_sec = (time_t)(milliseconds / 1000U);
    ts.tv_nsec = (long)((milliseconds % 1000U) * 1000000UL);
    while (nanosleep(&ts, &ts) != 0) {
        if (ts.tv_sec == 0 && ts.tv_nsec == 0) {
            break;
        }
    }
}

void oz_log(const char *message) {
    oz_emit_log(message);
}

void oz_set_log_callback(oz_log_callback_t callback) {
    oz_log_sink = callback;
}

void oz_shutdown(void) {
    oz_active = 0;
    oz_frame_count = 0;
}

void ozui_begin(ozui_context *context) {
    if (context == NULL) {
        context = &ozui_default_context;
    }
    memset(context, 0, sizeof(*context));
    context->frame_index = (uint32_t)oz_frame_count;
    context->pointer_down = 0;
    context->hovered = 0;
    context->focused = 0;
    context->pressed = 0;
    context->clicked = 0;
    context->toggled = 0;
    context->value = 0;
}

void ozui_end(ozui_context *context) {
    if (context == NULL) {
        context = &ozui_default_context;
    }
    context->pressed = 0;
    context->clicked = 0;
}

void ozui_panel(ozui_context *context, const ozui_rect *rect) {
    (void)context;
    (void)rect;
}

void ozui_label(ozui_context *context, const char *text, float x, float y) {
    (void)context;
    (void)text;
    (void)x;
    (void)y;
}

int ozui_button(ozui_context *context, const char *label, float x, float y, float width, float height) {
    (void)label;
    if (context == NULL) {
        context = &ozui_default_context;
    }

    const int pointer_x = context->pointer_x;
    const int pointer_y = context->pointer_y;
    const int within = pointer_x >= (int)x && pointer_x <= (int)(x + width) &&
                       pointer_y >= (int)y && pointer_y <= (int)(y + height);

    context->hovered = within ? 1 : 0;
    context->pressed = (context->pointer_down && within) ? 1 : 0;
    context->clicked = context->pressed;
    if (context->pointer_down && within) {
        context->value = 1;
        return 1;
    }
    return 0;
}

int ozui_checkbox(ozui_context *context, const char *label, int *value, float x, float y, float width, float height) {
    (void)label;
    if (context == NULL) {
        context = &ozui_default_context;
    }
    if (value == NULL) {
        return 0;
    }

    const int pointer_x = context->pointer_x;
    const int pointer_y = context->pointer_y;
    const int within = pointer_x >= (int)x && pointer_x <= (int)(x + width) &&
                       pointer_y >= (int)y && pointer_y <= (int)(y + height);

    context->hovered = within ? 1 : 0;
    if (context->pointer_down && within) {
        *value = (*value == 0) ? 1 : 0;
        context->clicked = 1;
        context->toggled = 1;
        context->pressed = 1;
        return 1;
    }
    return 0;
}

float ozui_slider(ozui_context *context, const char *label, float value, float min_value, float max_value, float x, float y, float width, float height) {
    (void)label;
    if (context == NULL) {
        context = &ozui_default_context;
    }
    const float span = max_value - min_value;
    float clamped = value;
    if (span > 0.0f) {
        clamped = value < min_value ? min_value : value > max_value ? max_value : value;
    }
    context->hovered = context->pointer_x >= (int)x && context->pointer_x <= (int)(x + width) &&
                       context->pointer_y >= (int)y && context->pointer_y <= (int)(y + height) ? 1 : 0;
    if (context->pointer_down && context->hovered) {
        const float ratio = (float)(context->pointer_x - (int)x) / (float)width;
        clamped = min_value + ratio * span;
        context->value = (int)(clamped + 0.5f);
    }
    return clamped;
}

void ozui_window(ozui_context *context, const char *title, float x, float y, float width, float height) {
    (void)context;
    (void)title;
    (void)x;
    (void)y;
    (void)width;
    (void)height;
}
