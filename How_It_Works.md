# ⚙️ How ArtTic-LAB Works: A Deep Dive

Welcome to the engine room of ArtTic-LAB! This document explains the entire architecture and workflow of the application, from the moment you click "Generate" to the moment your image appears.

The core mission of ArtTic-LAB is to provide a **simple, powerful, and highly-optimized** image generation experience specifically for **Intel® Arc™ GPUs**. Many tools are built with NVIDIA-first assumptions, so we built this from the ground up for Intel's XPU architecture.

---

## 🗺️ The Big Picture: From Click to Creation

Before we dive into the details, let's look at the high-level journey of a single image generation request.

1.  **The User Interface (`web/` and `ui.py`) 😊:** You interact with the UI, typing a prompt, moving sliders, and selecting a model. When you click "Generate," the frontend sends a structured message (JSON) over a WebSocket connection.
2.  **The Asynchronous Conductor (`web/server.py` and `app.py`) 🧠:** The FastAPI server receives the WebSocket message. Instead of running the heavy AI task directly, it uses `asyncio.to_thread` to delegate the job to a background worker thread. **This is the key to a non-blocking UI.**
3.  **The Engine Room (`core/logic.py`) 🏭:** In the background thread, the `generate_image` function is called. It prepares the generation parameters (like the seed and prompts) and passes them to the currently loaded pipeline object.
4.  **The GPU Workout (`pipelines/`, `torch` + `ipex`) 💪:** The pipeline, which has been heavily optimized by **Intel® Extension for PyTorch (IPEX)**, executes the diffusion steps on your Arc GPU (the "XPU"). It uses `bfloat16` precision for speed and memory savings.
5.  **Real-time Feedback 📈:** As the pipeline generates the image, it periodically calls a progress callback function. This function sends a message back over the WebSocket to the UI, which updates the progress bar in real-time.
6.  **The Result 🖼️:** The pipeline returns the generated image.
7.  **File & Feedback ✅:** The `core/logic` function saves the image to the `./outputs` folder with a new sequential name (`ArtTic-LAB_X.png`) and sends a final "generation complete" message back to the UI with the image details.

Now, let's break down each of these components.

---

## 🏛️ Core Components & Architecture

### `app.py`: The Main Launcher 🚀

This is the primary entry point of the application. Its main job is to parse command-line arguments, set up the environment (like the strict logging system), and launch the chosen user interface.

### `web/server.py`: The Asynchronous Communications Hub 🧠

For the custom UI, this file is the true brain of the operation. It manages the web server and all real-time communication.

- **Technical Breakdown:**

  - It's a **FastAPI** application that serves the main HTML page and static assets (CSS, JS).
  - It hosts a **WebSocket endpoint** (`/ws`) which is the main communication channel between the frontend and backend.
  - **The Non-Blocking Secret:** When a request for a long-running task arrives (like `load_model` or `generate_image`), it does **not** run the function directly. Instead, it wraps the call in `await asyncio.to_thread(...)`. This tells the Python `asyncio` event loop to run the synchronous, blocking function in a separate worker thread from the thread pool.
  - This architecture allows the main server thread to remain free to handle other requests, such as serving gallery images or responding to UI pings, ensuring the interface never freezes.

- **Easy Explanation:**
  Think of the `web/server.py` as a highly efficient restaurant host. When a large group (a heavy AI task) arrives, the host doesn't get stuck seating them. They hand the group over to a capable waiter (a worker thread) and immediately turn to greet the next guest (another UI request). This keeps the front door clear and the restaurant running smoothly.

### `core/logic.py`: The Engine Room 🏭

This file contains all the pure, UI-agnostic logic for the application. It handles model management, image generation, and file I/O. It's designed to be called by any interface, be it the custom web UI or the Gradio UI.

- **Key Functions:**
  - `load_model`: Now contains logic to prevent reloading an identical configuration.
  - `generate_image`: Catches `torch.OutOfMemoryError`, converts it to a custom, user-friendly error, and ensures VRAM is cleared.
  - `_get_next_image_number`: Scans the outputs directory to implement the `ArtTic-LAB_X.png` naming scheme.
  - `delete_image`: Securely deletes an image from the outputs folder.
  - `_calculate_max_resolution`: The new intelligence feature that estimates VRAM usage.

### The `pipelines/` Module: The Specialists 🛠️

This module is responsible for handling different types of Stable Diffusion models. Its core architecture remains the same, but with a key improvement for a cleaner user experience: all pipeline loading functions now include `progress_bar_config={"disable": True}` to suppress unwanted terminal output from the `diffusers` library.

---

## ✨ The Intel ARC Optimization Stack

This is what makes ArtTic-LAB special. We use a combination of techniques to get the most performance out of Arc GPUs.

### 1. **IPEX (Intel® Extension for PyTorch) 🚀**

_(This remains a core feature)_

- **Technical:** IPEX is a library that deeply optimizes PyTorch code for Intel hardware. When we call `ipex.optimize()`, it performs graph fusion and operator optimization, rewriting the model for maximum performance.
- **Easy:** IPEX is like a Formula 1 race engineering team that custom-tunes a standard engine for a specific race track (your Arc GPU).

### 2. **`bfloat16` Mixed Precision ⚖️**

_(This remains a core feature)_

- **Technical:** We use `torch.bfloat16` and `torch.xpu.amp.autocast` to perform calculations in a 16-bit format, which uses half the VRAM and is much faster for the XPU hardware to process.
- **Easy:** It's like intelligently rounding long decimal numbers during a complex calculation. It's faster and uses less space on your paper, but you still get the correct result.

### 3. **Memory Management & Intelligence ✅**

We've implemented a multi-layered approach to memory management, moving from reactive features to proactive intelligence.

- **Proactive OOM Prevention & Guidance (New!)**

  - **Technical:** When a model is loaded, the new `_calculate_max_resolution` function is called. It gets the total and reserved VRAM from `torch.xpu.get_device_properties(0)` and `torch.xpu.memory_reserved(0)`. It then uses a heuristic (a dictionary of `vram_per_megapixel` values tested for different model architectures) to estimate how many megapixels can be generated with the _free_ VRAM. This is converted back into a square resolution (e.g., 1536x1536) and sent to the UI.
  - **Easy:** Before you try to lift a heavy box, you instinctively size it up to see if you can handle it. ArtTic-LAB now does the same for your GPU. It "looks" at the available VRAM, "estimates" the "weight" of the image you want to generate, and advises you on a safe limit to prevent you from "straining" your hardware (running out of memory).

- **Graceful OOM Error Handling**

  - **Technical:** If a generation still fails with an `OutOfMemoryError` (e.g., due to background processes or fragmentation), the `generate_image` function now has a `try...except` block to catch it. It immediately calls `torch.xpu.empty_cache()` to free up memory and raises a custom, clean `OOMError` that is sent to the UI as a user-friendly message.
  - **Easy:** If you do try to lift a box that's too heavy and fail, you drop it safely instead of crashing to the floor. The app now does this, cleaning up the mess (clearing VRAM) and telling you what happened without breaking.

- **VAE Tiling/Slicing & CPU Offloading**
  - These existing features remain crucial. VAE Tiling prevents VRAM spikes during the final image decoding stage, while CPU Offloading allows users with less VRAM to generate images at the cost of speed. The UI now correctly handles these states, triggering a model reload when they are changed to ensure the setting is always active.
