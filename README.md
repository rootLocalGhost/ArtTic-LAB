<p align="center">
  <img src="assets/Banner.png" alt="ArtTic-LAB Banner" width="100%"/>
</p>
<p align="center"><em>Built by creators, for creators.</em></p>

<h2 align="center">Your Portal to AI Artistry, Forged for Intel ARC GPUs 🎨</h2>

<p align="center">
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License">
  </a>
  <a href="https://www.intel.com/content/www/us/en/products/docs/arc-discrete-graphics.html">
    <img src="https://img.shields.io/badge/Optimized%20for-Intel®%20ARC™-blue.svg?style=for-the-badge&logo=intel" alt="Intel ARC">
  </a>
  <a href="https://github.com/Md-Siam-Mia-Man/ArtTic-LAB/stargazers">
    <img src="https://img.shields.io/github/stars/Md-Siam-Mia-Man/ArtTic-LAB?style=for-the-badge&logo=github" alt="Stars">
  </a>
  <a href="https://github.com/Md-Siam-Mia-Man/ArtTic-LAB/issues">
    <img src="https://img.shields.io/github/issues/Md-Siam-Mia-Man/ArtTic-LAB?style=for-the-badge" alt="Issues">
  </a>
  <a href="https://github.com/Md-Siam-Mia-Man/ArtTic-LAB/commits/main">
    <img src="https://img.shields.io/github/last-commit/Md-Siam-Mia-Man/ArtTic-LAB?style=for-the-badge&color=green" alt="Last Commit">
  </a>
</p>

---

ArtTic-LAB is a **modern, performance-driven** AI image generation suite — precision-engineered for the Intel® Arc™ GPU ecosystem.  
It delivers a fluid **graphical interface** for creators and a **robust CLI** for power users who automate.

This isn’t just a wrapper — it’s a ground-up application designed for **speed, aesthetics, and a frictionless creative workflow**.  
With full support for models from **Stable Diffusion 1.5 → SDXL → SD3 → FLUX**, ArtTic-LAB is the definitive creative tool for ARC GPU users. ✨

---

## 🧭 Two Ways to Create

ArtTic-LAB adapts to your preferred workflow — visual or terminal-based.

| GUI (Light)                               | GUI (Dark)                              | CLI                               |
| ----------------------------------------- | --------------------------------------- | --------------------------------- |
| ![Light](assets/ArtTic-LAB-GUI-Light.png) | ![Dark](assets/ArtTic-LAB-GUI-Dark.png) | ![CLI](assets/ArtTic-LAB-CLI.png) |
| Light mode interface                      | Dark mode interface                     | Terminal interface                |

---

## ⚙️ Feature Deep Dive

| Category                       | Highlights                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engineered for Speed 🏎️**    | - **IPEX Optimization:** Intel® Extension for PyTorch optimizes UNet & VAE.<br>- **Mixed Precision:** Runs in `bfloat16` for ~2× faster performance & 50% VRAM savings. |
| **Intelligent Pipeline 🧠**    | - Auto-detects architecture (SD1.5 → SD3 → FLUX).<br>- Predicts VRAM-safe maximum resolution to prevent OOM errors.                                                     |
| **Total VRAM Control 💧**      | - One-click model unload & VAE tiling for high-res stability.<br>- Adaptive CPU/GPU offloading for efficient memory use.                                                |
| **Streamlined for Artists ✨** | - Responsive async UI — no freezes.<br>- Unified node-based interface for full creative control.<br>- Smooth gallery with zoom & drag support.                          |

---

## 📸 Creations Gallery

| Demo 1 | Demo 2 | Demo 3 |
|--------|--------|--------|
| <img src="assets/demos/1.png" width="256" height="256"> | <img src="assets/demos/2.png" width="256" height="256"> | <img src="assets/demos/3.png" width="256" height="256"> |

| Demo 4 | Demo 5 | Demo 6 |
|--------|--------|--------|
| <img src="assets/demos/4.png" width="256" height="256"> | <img src="assets/demos/5.png" width="256" height="256"> | <img src="assets/demos/6.png" width="256" height="256"> |

| Demo 7 | Demo 9 | Demo 10 |
|--------|--------|---------|
| <img src="assets/demos/7.png" width="256" height="256"> | <img src="assets/demos/9.png" width="256" height="256"> | <img src="assets/demos/10.png" width="256" height="256"> |


---

## 🚀 Get Started in Minutes

Launch your personal AI art studio in three simple steps.

### 1️⃣ Prerequisites

- Install **Miniconda** or **Miniforge**.
- Reopen your terminal to ensure `conda` is available.

### 2️⃣ Installation

Download and unzip this project, then run the one-time installer:

- **Windows 🪟:** `install.bat`
- **Linux/macOS 🐧:** `chmod +x install.sh && ./install.sh`

### 3️⃣ Launch & Create

Start ArtTic-LAB:

- **Windows:** `start.bat`
- **Linux/macOS:** `./start.sh`

Open your browser at `http://127.0.0.1:7860`.

<details>
<summary><strong>👉 Optional Launch Arguments</strong></summary>

- `--disable-filters` → Enable full logs for debugging.
</details>

---

## 📂 Project Structure

```bash
ArtTic-LAB/
├── 📁assets/        # Banners, demos, UI screenshots
├── 📁core/          # Core application logic
├── 📁helpers/       # CLI manager & utilities
├── 📁models/        # Drop your .safetensors models here
├── 📁outputs/       # Generated masterpieces
├── 📁pipelines/     # Core logic for SD model variants
├── 📁web/           # Custom FastAPI web UI
├── 📜app.py         # Main application launcher
├── 📜install.bat    # Windows one-click installer
├── 📜start.bat      # Windows launcher
└── 📜...            # Additional project files
```

<p align="center"> Crafted with ❤️ by <a href="https://github.com/Md-Siam-Mia-Man">Md Siam Mia</a> <br> <sub>Empowering AI Artistry for the Intel® Arc™ Generation</sub> </p> ```
