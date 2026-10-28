#ifndef OZ_HPP
#define OZ_HPP

#include <cstddef>
#include <cstdint>
#include "oz.h"

namespace oz {
inline void init() { ::oz_init(); }
inline bool running() { return ::oz_running() != 0; }
inline float delta_time() { return ::oz_delta_time(); }
inline void begin_frame() { ::oz_begin_frame(); }
inline void end_frame() { ::oz_end_frame(); }
inline std::uint64_t now_ms() { return ::oz_now_ms(); }
inline void sleep_ms(std::uint32_t milliseconds) { ::oz_sleep_ms(milliseconds); }
inline void log(const char *message) { ::oz_log(message); }
inline void set_log_callback(::oz_log_callback_t callback) { ::oz_set_log_callback(callback); }
inline void shutdown() { ::oz_shutdown(); }
} // namespace oz

#endif
