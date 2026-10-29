#define _POSIX_C_SOURCE 200809L
#include <vulkan/vulkan.h>
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/select.h>
#include <time.h>
#include <unistd.h>

#define OZ_BUFFER_BYTES (8u * 1024u * 1024u)
#define OZ_STATE_BYTES 1024u
#define OZ_DATA_LIMIT (7u * 1024u * 1024u)

typedef struct {
    VkInstance instance;
    VkPhysicalDevice physical;
    VkDevice device;
    VkQueue queue;
    uint32_t queue_family;
    VkBuffer buffer;
    VkDeviceMemory memory;
    VkDescriptorSetLayout set_layout;
    VkPipelineLayout pipeline_layout;
    VkDescriptorPool descriptor_pool;
    VkDescriptorSet descriptor_set;
    VkShaderModule shader;
    VkPipeline pipeline;
    VkCommandPool command_pool;
    VkCommandBuffer command_buffer;
    VkFence fence;
    uint8_t *mapped;
    uint8_t *initial;
    size_t initial_size;
    uint64_t frames;
    uint64_t elapsed_ns;
} Runtime;

static int read_file(const char *file, uint8_t **bytes, size_t *length, size_t maximum) {
    FILE *input = fopen(file, "rb");
    if (!input) {
        fprintf(stderr, "Cannot open %s: %s\n", file, strerror(errno));
        return 0;
    }
    if (fseek(input, 0, SEEK_END) != 0) {
        fclose(input);
        fprintf(stderr, "Cannot size %s\n", file);
        return 0;
    }
    long size = ftell(input);
    if (size < 0 || (uint64_t)size > maximum || fseek(input, 0, SEEK_SET) != 0) {
        fclose(input);
        fprintf(stderr, "Invalid file size: %s\n", file);
        return 0;
    }
    *bytes = malloc(size ? (size_t)size : 1);
    if (!*bytes || fread(*bytes, 1, (size_t)size, input) != (size_t)size) {
        free(*bytes);
        *bytes = NULL;
        fclose(input);
        fprintf(stderr, "Cannot read %s\n", file);
        return 0;
    }
    fclose(input);
    *length = (size_t)size;
    return 1;
}

static int shader_contract(const uint8_t *bytes, size_t length) {
    if (length < 20 || length % 4 || *(const uint32_t *)bytes != 0x07230203u) {
        fprintf(stderr, "Invalid SPIR-V compute module\n");
        return 0;
    }
    const uint32_t *words = (const uint32_t *)bytes;
    size_t count = length / 4;
    uint32_t entry = 0, local[3] = {0, 0, 0};
    int found_entry = 0, found_local = 0;
    for (size_t i = 5; i < count;) {
        uint32_t first = words[i], operands = first >> 16, opcode = first & 0xffffu;
        if (!operands || i + operands > count) {
            fprintf(stderr, "Malformed SPIR-V instruction stream\n");
            return 0;
        }
        if (opcode == 15 && operands >= 4 && words[i + 1] == 5) {
            const char *name = (const char *)&words[i + 3];
            size_t available = (operands - 3) * 4;
            if (memchr(name, '\0', available) && strcmp(name, "main") == 0) {
                entry = words[i + 2];
                found_entry = 1;
            }
        } else if (opcode == 16 && operands == 6 && words[i + 2] == 17 &&
                   words[i + 1] == entry) {
            local[0] = words[i + 3];
            local[1] = words[i + 4];
            local[2] = words[i + 5];
            found_local = 1;
        }
        i += operands;
    }
    if (!found_entry || !found_local || local[0] != 1 || local[1] != 1 || local[2] != 1) {
        fprintf(stderr, "Simulator requires GLCompute entry point main with local size 1x1x1\n");
        return 0;
    }
    return 1;
}

static int initialize_state(Runtime *runtime) {
    memset(runtime->mapped, 0, OZ_BUFFER_BYTES);
    memcpy(runtime->mapped, runtime->initial, runtime->initial_size);
    runtime->frames = 0;
    runtime->elapsed_ns = 0;
    return 1;
}

static int dispatch(Runtime *runtime) {
    VkResult result = vkWaitForFences(runtime->device, 1, &runtime->fence, VK_TRUE, UINT64_MAX);
    if (result != VK_SUCCESS) goto fail;
    result = vkResetFences(runtime->device, 1, &runtime->fence);
    if (result != VK_SUCCESS) goto fail;
    result = vkResetCommandPool(runtime->device, runtime->command_pool, 0);
    if (result != VK_SUCCESS) goto fail;
    VkCommandBufferBeginInfo begin = {
        .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO,
        .flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT
    };
    result = vkBeginCommandBuffer(runtime->command_buffer, &begin);
    if (result != VK_SUCCESS) goto fail;
    vkCmdBindPipeline(runtime->command_buffer, VK_PIPELINE_BIND_POINT_COMPUTE, runtime->pipeline);
    vkCmdBindDescriptorSets(runtime->command_buffer, VK_PIPELINE_BIND_POINT_COMPUTE,
                            runtime->pipeline_layout, 0, 1, &runtime->descriptor_set, 0, NULL);
    vkCmdDispatch(runtime->command_buffer, 1, 1, 1);
    VkMemoryBarrier barrier = {
        .sType = VK_STRUCTURE_TYPE_MEMORY_BARRIER,
        .srcAccessMask = VK_ACCESS_SHADER_WRITE_BIT,
        .dstAccessMask = VK_ACCESS_SHADER_READ_BIT | VK_ACCESS_SHADER_WRITE_BIT
    };
    vkCmdPipelineBarrier(runtime->command_buffer, VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT,
                         VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT, 0, 1, &barrier, 0, NULL, 0, NULL);
    VkMemoryBarrier host_barrier = {
        .sType = VK_STRUCTURE_TYPE_MEMORY_BARRIER,
        .srcAccessMask = VK_ACCESS_SHADER_WRITE_BIT,
        .dstAccessMask = VK_ACCESS_HOST_READ_BIT
    };
    vkCmdPipelineBarrier(runtime->command_buffer, VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT,
                         VK_PIPELINE_STAGE_HOST_BIT, 0, 1, &host_barrier, 0, NULL, 0, NULL);
    result = vkEndCommandBuffer(runtime->command_buffer);
    if (result != VK_SUCCESS) goto fail;
    VkSubmitInfo submit = {
        .sType = VK_STRUCTURE_TYPE_SUBMIT_INFO,
        .commandBufferCount = 1,
        .pCommandBuffers = &runtime->command_buffer
    };
    result = vkQueueSubmit(runtime->queue, 1, &submit, runtime->fence);
    if (result != VK_SUCCESS) goto fail;
    struct timespec start, finish;
    clock_gettime(CLOCK_MONOTONIC, &start);
    result = vkWaitForFences(runtime->device, 1, &runtime->fence, VK_TRUE, UINT64_MAX);
    clock_gettime(CLOCK_MONOTONIC, &finish);
    if (result != VK_SUCCESS) goto fail;
    int64_t elapsed = (int64_t)(finish.tv_sec - start.tv_sec) * 1000000000ll +
                      (int64_t)finish.tv_nsec - (int64_t)start.tv_nsec;
    if (elapsed > 0) runtime->elapsed_ns += (uint64_t)elapsed;
    runtime->frames++;
    return 1;
fail:
    fprintf(stderr, "Vulkan compute dispatch failed: %d\n", result);
    return 0;
}

static void report(const Runtime *runtime) {
    uint64_t hash = 1469598103934665603ull;
    size_t changed = 0;
    for (size_t i = 0; i < OZ_STATE_BYTES; i++) {
        hash = (hash ^ runtime->mapped[i]) * 1099511628211ull;
        if (runtime->mapped[i] != runtime->initial[i]) changed++;
    }
    double average_ms = runtime->frames
        ? (double)runtime->elapsed_ns / (double)runtime->frames / 1000000.0 : 0.0;
    double local_fps = average_ms > 0.0 ? 1000.0 / average_ms : 0.0;
    printf("PC simulation: compute shader executed; frames=%llu; state_bytes_changed=%zu; state_fnv64=%016llx; local_average_ms=%.3f; local_fps=%.2f\n",
           (unsigned long long)runtime->frames, changed, (unsigned long long)hash, average_ms, local_fps);
    fflush(stdout);
}

static int button_mask(const char *name, uint32_t *mask) {
    static const struct { const char *name; uint32_t mask; } buttons[] = {
        {"A", 1u}, {"B", 2u}, {"X", 4u}, {"Y", 8u}, {"L", 64u}, {"R", 128u},
        {"PLUS", 1024u}, {"MINUS", 2048u}, {"LEFT", 4096u}, {"UP", 8192u},
        {"RIGHT", 16384u}, {"DOWN", 32768u}
    };
    for (size_t i = 0; i < sizeof(buttons) / sizeof(buttons[0]); i++) {
        if (strcmp(name, buttons[i].name) == 0) {
            *mask = buttons[i].mask;
            return 1;
        }
    }
    return 0;
}

static int set_button(Runtime *runtime, const char *command, const char *name, int pressed) {
    uint32_t mask;
    if (!button_mask(name, &mask)) {
        printf("Unknown button. Use A B X Y L R PLUS MINUS LEFT UP RIGHT DOWN.\n");
        return 1;
    }
    uint32_t buttons;
    memcpy(&buttons, runtime->mapped + 8, sizeof(buttons));
    buttons = pressed ? buttons | mask : buttons & ~mask;
    memcpy(runtime->mapped + 8, &buttons, sizeof(buttons));
    uint32_t connected = 1u;
    memcpy(runtime->mapped + 32, &connected, sizeof(connected));
    printf("%s %s\n", command, name);
    return 1;
}

static int process_command(Runtime *runtime, char *line, int *running, int *stopped) {
    char name[24] = {0};
    if (strcmp(line, "step") == 0) {
        if (!dispatch(runtime)) return 0;
        report(runtime);
    } else if (strcmp(line, "run") == 0 || strcmp(line, "resume") == 0) {
        *running = 1;
        puts("Runtime resumed.");
    } else if (strcmp(line, "pause") == 0) {
        *running = 0;
        puts("Runtime paused.");
    } else if (strcmp(line, "restart") == 0) {
        initialize_state(runtime);
        *running = 0;
        puts("Runtime restarted and paused.");
    } else if (strcmp(line, "stop") == 0) {
        *running = 0;
        *stopped = 1;
    } else if (strcmp(line, "stats") == 0) {
        report(runtime);
    } else if (sscanf(line, "press %23s", name) == 1) {
        set_button(runtime, "Pressed", name, 1);
    } else if (sscanf(line, "release %23s", name) == 1) {
        set_button(runtime, "Released", name, 0);
    } else if (strcmp(line, "help") == 0) {
        puts("Commands: run/resume, pause, step, restart, press BUTTON, release BUTTON, stats, stop");
    } else if (*line) {
        puts("Unknown command. Type help.");
    }
    fflush(stdout);
    return 1;
}

static void cleanup(Runtime *runtime) {
    if (runtime->device) vkDeviceWaitIdle(runtime->device);
    if (runtime->mapped && runtime->memory) vkUnmapMemory(runtime->device, runtime->memory);
    if (runtime->fence) vkDestroyFence(runtime->device, runtime->fence, NULL);
    if (runtime->command_pool) vkDestroyCommandPool(runtime->device, runtime->command_pool, NULL);
    if (runtime->pipeline) vkDestroyPipeline(runtime->device, runtime->pipeline, NULL);
    if (runtime->shader) vkDestroyShaderModule(runtime->device, runtime->shader, NULL);
    if (runtime->descriptor_pool) vkDestroyDescriptorPool(runtime->device, runtime->descriptor_pool, NULL);
    if (runtime->pipeline_layout) vkDestroyPipelineLayout(runtime->device, runtime->pipeline_layout, NULL);
    if (runtime->set_layout) vkDestroyDescriptorSetLayout(runtime->device, runtime->set_layout, NULL);
    if (runtime->buffer) vkDestroyBuffer(runtime->device, runtime->buffer, NULL);
    if (runtime->memory) vkFreeMemory(runtime->device, runtime->memory, NULL);
    if (runtime->device) vkDestroyDevice(runtime->device, NULL);
    if (runtime->instance) vkDestroyInstance(runtime->instance, NULL);
    free(runtime->initial);
}

static int run(int argc, char **argv) {
    Runtime runtime = {0};
    int exit_code = 1, interactive = 0;
    uint64_t frame_limit = 1;
    if (argc < 4) {
        fprintf(stderr, "Usage: oz-studio-vulkan SHADER.spv STATE.bin DATA.bin [--frames N|--interactive]\n");
        return 2;
    }
    if (argc == 5 && strcmp(argv[4], "--interactive") == 0) {
        interactive = 1;
    } else if (argc == 6 && strcmp(argv[4], "--frames") == 0) {
        char *end = NULL;
        errno = 0;
        frame_limit = strtoull(argv[5], &end, 10);
        if (errno || !end || *end || frame_limit == 0 || frame_limit > 1000000) {
            fprintf(stderr, "Frame count must be in range 1..1000000\n");
            return 2;
        }
    } else if (argc != 4) {
        fprintf(stderr, "Invalid simulator options\n");
        return 2;
    }
    uint8_t *shader_bytes = NULL, *state_bytes = NULL, *data_bytes = NULL;
    size_t shader_size = 0, state_size = 0, data_size = 0;
    if (!read_file(argv[1], &shader_bytes, &shader_size, 1024u * 1024u) ||
        !read_file(argv[2], &state_bytes, &state_size, OZ_STATE_BYTES) ||
        !read_file(argv[3], &data_bytes, &data_size, OZ_DATA_LIMIT)) goto done;
    if (state_size != OZ_STATE_BYTES || !shader_contract(shader_bytes, shader_size)) {
        fprintf(stderr, "Unsupported app state or shader contract\n");
        goto done;
    }
    runtime.initial_size = OZ_STATE_BYTES + data_size;
    runtime.initial = calloc(1, runtime.initial_size);
    if (!runtime.initial) goto done;
    memcpy(runtime.initial, state_bytes, state_size);
    memcpy(runtime.initial + OZ_STATE_BYTES, data_bytes, data_size);

    VkApplicationInfo application = {
        .sType = VK_STRUCTURE_TYPE_APPLICATION_INFO,
        .pApplicationName = "OZ Studio",
        .applicationVersion = 1,
        .pEngineName = "OZLauncher ABI 1 simulator",
        .engineVersion = 1,
        .apiVersion = VK_API_VERSION_1_0
    };
    VkInstanceCreateInfo instance_info = {
        .sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO,
        .pApplicationInfo = &application
    };
    VkResult result = vkCreateInstance(&instance_info, NULL, &runtime.instance);
    if (result != VK_SUCCESS) { fprintf(stderr, "Cannot create Vulkan instance: %d\n", result); goto done; }
    uint32_t physical_count = 0;
    result = vkEnumeratePhysicalDevices(runtime.instance, &physical_count, NULL);
    if (result != VK_SUCCESS || physical_count == 0) { fprintf(stderr, "No Vulkan compute device is available\n"); goto done; }
    VkPhysicalDevice *physical_devices = calloc(physical_count, sizeof(*physical_devices));
    if (!physical_devices) goto done;
    result = vkEnumeratePhysicalDevices(runtime.instance, &physical_count, physical_devices);
    if (result != VK_SUCCESS) { free(physical_devices); fprintf(stderr, "Cannot enumerate Vulkan devices: %d\n", result); goto done; }
    for (uint32_t p = 0; p < physical_count && !runtime.queue; p++) {
        uint32_t family_count = 0;
        vkGetPhysicalDeviceQueueFamilyProperties(physical_devices[p], &family_count, NULL);
        VkQueueFamilyProperties *families = calloc(family_count, sizeof(*families));
        if (!families) continue;
        vkGetPhysicalDeviceQueueFamilyProperties(physical_devices[p], &family_count, families);
        for (uint32_t q = 0; q < family_count; q++) {
            if (!(families[q].queueFlags & VK_QUEUE_COMPUTE_BIT)) continue;
            float priority = 1.0f;
            VkDeviceQueueCreateInfo queue_info = {
                .sType = VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO,
                .queueFamilyIndex = q,
                .queueCount = 1,
                .pQueuePriorities = &priority
            };
            VkDeviceCreateInfo device_info = {
                .sType = VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO,
                .queueCreateInfoCount = 1,
                .pQueueCreateInfos = &queue_info
            };
            if (vkCreateDevice(physical_devices[p], &device_info, NULL, &runtime.device) == VK_SUCCESS) {
                runtime.physical = physical_devices[p];
                runtime.queue_family = q;
                vkGetDeviceQueue(runtime.device, q, 0, &runtime.queue);
                break;
            }
        }
        free(families);
    }
    free(physical_devices);
    if (!runtime.device || !runtime.queue) { fprintf(stderr, "No usable Vulkan compute queue\n"); goto done; }

    VkBufferCreateInfo buffer_info = {
        .sType = VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO,
        .size = OZ_BUFFER_BYTES,
        .usage = VK_BUFFER_USAGE_STORAGE_BUFFER_BIT,
        .sharingMode = VK_SHARING_MODE_EXCLUSIVE
    };
    result = vkCreateBuffer(runtime.device, &buffer_info, NULL, &runtime.buffer);
    if (result != VK_SUCCESS) { fprintf(stderr, "Cannot create binding-zero storage buffer: %d\n", result); goto done; }
    VkMemoryRequirements requirements;
    vkGetBufferMemoryRequirements(runtime.device, runtime.buffer, &requirements);
    VkPhysicalDeviceMemoryProperties memory_properties;
    vkGetPhysicalDeviceMemoryProperties(runtime.physical, &memory_properties);
    uint32_t memory_type = UINT32_MAX;
    for (uint32_t i = 0; i < memory_properties.memoryTypeCount; i++) {
        VkMemoryPropertyFlags flags = memory_properties.memoryTypes[i].propertyFlags;
        if ((requirements.memoryTypeBits & (1u << i)) &&
            (flags & (VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT)) ==
            (VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT)) {
            memory_type = i;
            break;
        }
    }
    if (memory_type == UINT32_MAX) { fprintf(stderr, "Vulkan host-visible coherent storage is unavailable\n"); goto done; }
    VkMemoryAllocateInfo allocation = {
        .sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO,
        .allocationSize = requirements.size,
        .memoryTypeIndex = memory_type
    };
    result = vkAllocateMemory(runtime.device, &allocation, NULL, &runtime.memory);
    if (result != VK_SUCCESS) { fprintf(stderr, "Cannot allocate shader storage: %d\n", result); goto done; }
    result = vkBindBufferMemory(runtime.device, runtime.buffer, runtime.memory, 0);
    if (result != VK_SUCCESS) { fprintf(stderr, "Cannot bind shader storage: %d\n", result); goto done; }
    void *mapped = NULL;
    result = vkMapMemory(runtime.device, runtime.memory, 0, OZ_BUFFER_BYTES, 0, &mapped);
    if (result != VK_SUCCESS) { fprintf(stderr, "Cannot map shader storage: %d\n", result); goto done; }
    runtime.mapped = mapped;
    initialize_state(&runtime);

    VkDescriptorSetLayoutBinding binding = {
        .binding = 0,
        .descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER,
        .descriptorCount = 1,
        .stageFlags = VK_SHADER_STAGE_COMPUTE_BIT
    };
    VkDescriptorSetLayoutCreateInfo set_info = {
        .sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO,
        .bindingCount = 1,
        .pBindings = &binding
    };
    result = vkCreateDescriptorSetLayout(runtime.device, &set_info, NULL, &runtime.set_layout);
    if (result != VK_SUCCESS) { fprintf(stderr, "Cannot create ABI binding-zero layout: %d\n", result); goto done; }
    VkPipelineLayoutCreateInfo layout_info = {
        .sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO,
        .setLayoutCount = 1,
        .pSetLayouts = &runtime.set_layout
    };
    result = vkCreatePipelineLayout(runtime.device, &layout_info, NULL, &runtime.pipeline_layout);
    if (result != VK_SUCCESS) { fprintf(stderr, "Cannot create compute pipeline layout: %d\n", result); goto done; }
    VkShaderModuleCreateInfo shader_info = {
        .sType = VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO,
        .codeSize = shader_size,
        .pCode = (const uint32_t *)shader_bytes
    };
    result = vkCreateShaderModule(runtime.device, &shader_info, NULL, &runtime.shader);
    if (result != VK_SUCCESS) { fprintf(stderr, "Vulkan rejected compute SPIR-V: %d\n", result); goto done; }
    VkPipelineShaderStageCreateInfo stage = {
        .sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO,
        .stage = VK_SHADER_STAGE_COMPUTE_BIT,
        .module = runtime.shader,
        .pName = "main"
    };
    VkComputePipelineCreateInfo pipeline_info = {
        .sType = VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO,
        .stage = stage,
        .layout = runtime.pipeline_layout
    };
    result = vkCreateComputePipelines(runtime.device, VK_NULL_HANDLE, 1, &pipeline_info, NULL, &runtime.pipeline);
    if (result != VK_SUCCESS) { fprintf(stderr, "Cannot create compute pipeline: %d\n", result); goto done; }
    VkDescriptorPoolSize pool_size = {
        .type = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER,
        .descriptorCount = 1
    };
    VkDescriptorPoolCreateInfo pool_info = {
        .sType = VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO,
        .maxSets = 1,
        .poolSizeCount = 1,
        .pPoolSizes = &pool_size
    };
    result = vkCreateDescriptorPool(runtime.device, &pool_info, NULL, &runtime.descriptor_pool);
    if (result != VK_SUCCESS) { fprintf(stderr, "Cannot create descriptor pool: %d\n", result); goto done; }
    VkDescriptorSetAllocateInfo set_allocate = {
        .sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO,
        .descriptorPool = runtime.descriptor_pool,
        .descriptorSetCount = 1,
        .pSetLayouts = &runtime.set_layout
    };
    result = vkAllocateDescriptorSets(runtime.device, &set_allocate, &runtime.descriptor_set);
    if (result != VK_SUCCESS) { fprintf(stderr, "Cannot allocate app descriptor: %d\n", result); goto done; }
    VkDescriptorBufferInfo descriptor_buffer = {
        .buffer = runtime.buffer,
        .offset = 0,
        .range = OZ_BUFFER_BYTES
    };
    VkWriteDescriptorSet write = {
        .sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET,
        .dstSet = runtime.descriptor_set,
        .dstBinding = 0,
        .descriptorCount = 1,
        .descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER,
        .pBufferInfo = &descriptor_buffer
    };
    vkUpdateDescriptorSets(runtime.device, 1, &write, 0, NULL);
    VkCommandPoolCreateInfo command_pool_info = {
        .sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO,
        .queueFamilyIndex = runtime.queue_family
    };
    result = vkCreateCommandPool(runtime.device, &command_pool_info, NULL, &runtime.command_pool);
    if (result != VK_SUCCESS) { fprintf(stderr, "Cannot create compute command pool: %d\n", result); goto done; }
    VkCommandBufferAllocateInfo command_allocate = {
        .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO,
        .commandPool = runtime.command_pool,
        .level = VK_COMMAND_BUFFER_LEVEL_PRIMARY,
        .commandBufferCount = 1
    };
    result = vkAllocateCommandBuffers(runtime.device, &command_allocate, &runtime.command_buffer);
    if (result != VK_SUCCESS) { fprintf(stderr, "Cannot allocate compute command buffer: %d\n", result); goto done; }
    VkFenceCreateInfo fence_info = {
        .sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO,
        .flags = VK_FENCE_CREATE_SIGNALED_BIT
    };
    result = vkCreateFence(runtime.device, &fence_info, NULL, &runtime.fence);
    if (result != VK_SUCCESS) { fprintf(stderr, "Cannot create compute fence: %d\n", result); goto done; }

    VkPhysicalDeviceProperties device_properties;
    vkGetPhysicalDeviceProperties(runtime.physical, &device_properties);
    printf("OZ Studio Vulkan compute simulator | device=%s | result=PC simulation only; Switch 2 verification required\n",
           device_properties.deviceName);
    printf("Supported: ABI-1 binding 0, 8 MiB state, 1024-byte initial state, app data, compute-only 1x1x1 shaders.\n");
    printf("Unsupported: graphics rendering, private storage binding 1, host services, persistent storage, hardware behavior.\n");
    if (interactive) {
        int running = 0, stopped = 0;
        char line[128];
        size_t used = 0;
        puts("Runtime launched paused. Type help for controls.");
        fflush(stdout);
        while (!stopped) {
            fd_set input;
            FD_ZERO(&input);
            FD_SET(STDIN_FILENO, &input);
            struct timeval timeout = {0, 16667};
            int ready = select(STDIN_FILENO + 1, &input, NULL, NULL, running ? &timeout : NULL);
            if (ready < 0 && errno != EINTR) { perror("select"); goto done; }
            if (ready > 0 && FD_ISSET(STDIN_FILENO, &input)) {
                char ch;
                ssize_t got = read(STDIN_FILENO, &ch, 1);
                if (got <= 0) break;
                if (ch == '\n' || ch == '\r') {
                    line[used] = '\0';
                    if (!process_command(&runtime, line, &running, &stopped)) goto done;
                    used = 0;
                } else if (used + 1 < sizeof(line)) {
                    line[used++] = ch;
                }
            }
            if (running && ready == 0 && !dispatch(&runtime)) goto done;
        }
        report(&runtime);
    } else {
        for (uint64_t i = 0; i < frame_limit; i++) if (!dispatch(&runtime)) goto done;
        report(&runtime);
    }
    exit_code = 0;
done:
    free(shader_bytes);
    free(state_bytes);
    free(data_bytes);
    cleanup(&runtime);
    return exit_code;
}

int main(int argc, char **argv) {
    return run(argc, argv);
}
