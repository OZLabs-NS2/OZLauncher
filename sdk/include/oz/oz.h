#ifndef OZ_H
#define OZ_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void oz_init(void);
int oz_running(void);
float oz_delta_time(void);
void oz_begin_frame(void);
void oz_end_frame(void);
uint64_t oz_now_ms(void);
void oz_sleep_ms(uint32_t milliseconds);
void oz_log(const char *message);
typedef void (*oz_log_callback_t)(const char *message);
void oz_set_log_callback(oz_log_callback_t callback);
void oz_shutdown(void);

#ifdef __cplusplus
}
#endif

#endif
