// web/static/js/main.js

document.addEventListener("DOMContentLoaded", () => {
  const state = {
    isModelLoaded: false,
    isBusy: false,
    modelType: "SD 1.5",
    currentModelName: null,
    currentLoraName: "None",
    currentCpuOffload: false,
    currentVaeTiling: true,
    socket: null,
    galleryImages: [],
    currentLightboxIndex: -1,
    zoomLevel: 1,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    panCurrent: { x: 0, y: 0 },
  };

  const ASPECT_RATIOS = {
    "SD 1.5": {
      "1:1": [512, 512],
      "4:3": [576, 448],
      "3:2": [608, 416],
      "16:9": [672, 384],
    },
    "SD 2.x": {
      "1:1": [768, 768],
      "4:3": [864, 640],
      "3:2": [960, 640],
      "16:9": [1024, 576],
    },
    SDXL: {
      "1:1": [1024, 1024],
      "4:3": [1152, 896],
      "3:2": [1216, 832],
      "16:9": [1344, 768],
    },
    SD3: {
      "1:1": [1024, 1024],
      "4:3": [1152, 896],
      "3:2": [1216, 832],
      "16:9": [1344, 768],
    },
    "FLUX Dev": {
      "1:1": [1024, 1024],
      "4:3": [1152, 896],
      "3:2": [1216, 832],
      "16:9": [1344, 768],
    },
    "FLUX Schnell": {
      "1:1": [1024, 1024],
      "4:3": [1152, 896],
      "3:2": [1216, 832],
      "16:9": [1344, 768],
    },
  };

  const ui = {
    nav: { links: document.querySelectorAll(".nav-link") },
    pages: {
      generate: document.getElementById("page-generate"),
      gallery: document.getElementById("page-gallery"),
    },
    status: {
      indicator: document.getElementById("status-indicator"),
      connectionText: document.getElementById("connection-status"),
      card: document.getElementById("status-card"),
      text: document.getElementById("status-text"),
      icon: document.querySelector("#status-card .material-symbols-outlined"),
    },
    model: {
      dropdown: document.getElementById("model-dropdown"),
      samplerDropdown: document.getElementById("sampler-dropdown"),
      loadBtn: document.getElementById("load-model-btn"),
      unloadBtn: document.getElementById("unload-model-btn"),
      refreshBtn: document.getElementById("refresh-models-btn"),
    },
    lora: {
      toggle: document.getElementById("lora-toggle"),
      container: document.getElementById("lora-options-container"),
      dropdown: document.getElementById("lora-dropdown"),
      refreshBtn: document.getElementById("refresh-loras-btn"),
      weightSlider: document.getElementById("lora-weight-slider"),
      weightValue: document.getElementById("lora-weight-value"),
    },
    params: {
      prompt: document.getElementById("prompt"),
      negativePrompt: document.getElementById("negative-prompt"),
      stepsSlider: document.getElementById("steps-slider"),
      stepsValue: document.getElementById("steps-value"),
      guidanceSlider: document.getElementById("guidance-slider"),
      guidanceValue: document.getElementById("guidance-value"),
      widthSlider: document.getElementById("width-slider"),
      widthValue: document.getElementById("width-value"),
      heightSlider: document.getElementById("height-slider"),
      heightValue: document.getElementById("height-value"),
      aspectRatioBtns: document.getElementById("aspect-ratio-btns"),
      seedInput: document.getElementById("seed-input"),
      randomizeSeedBtn: document.getElementById("randomize-seed-btn"),
      vaeTilingCheckbox: document.getElementById("vae-tiling-checkbox"),
      cpuOffloadCheckbox: document.getElementById("cpu-offload-checkbox"),
      resGuidance: document.getElementById("resolution-guidance"),
      resText: document.getElementById("resolution-text"),
    },
    generate: {
      wrapper: document.getElementById("image-preview-wrapper"),
      btn: document.getElementById("generate-btn"),
      outputImage: document.getElementById("output-image"),
      imagePlaceholder: document.getElementById("image-placeholder"),
      infoText: document.getElementById("info-text"),
      viewBtn: document.getElementById("view-btn"),
      downloadBtn: document.getElementById("download-btn"),
      openNewTabBtn: document.getElementById("open-new-tab-btn"),
    },
    progress: {
      container: document.getElementById("progress-container"),
      label: document.getElementById("progress-label"),
      percent: document.getElementById("progress-percent"),
      barFill: document.getElementById("progress-bar-fill"),
    },
    gallery: {
      grid: document.getElementById("gallery-grid"),
      placeholder: document.getElementById("gallery-placeholder"),
      refreshBtn: document.getElementById("refresh-gallery-btn"),
    },
    lightbox: {
      container: document.getElementById("lightbox"),
      closeBtn: document.getElementById("lightbox-close"),
      img: document.getElementById("lightbox-img"),
      imageWrapper: document.getElementById("lightbox-image-wrapper"),
      caption: document.getElementById("lightbox-caption"),
      prevBtn: document.getElementById("lightbox-prev"),
      nextBtn: document.getElementById("lightbox-next"),
      zoomInBtn: document.getElementById("lightbox-zoom-in"),
      zoomOutBtn: document.getElementById("lightbox-zoom-out"),
      fitBtn: document.getElementById("lightbox-fit"),
      deleteBtn: document.getElementById("lightbox-delete"),
    },
    dialog: {
      overlay: document.getElementById("dialog-overlay"),
      title: document.getElementById("dialog-title"),
      message: document.getElementById("dialog-message"),
      buttons: document.getElementById("dialog-buttons"),
    },
    busyControls: [],
  };

  function connectWebSocket() {
    const url = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
      window.location.host
    }/ws`;
    state.socket = new WebSocket(url);
    state.socket.onopen = () =>
      updateConnectionStatus("Connected", "connected");
    state.socket.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);
      handleWebSocketMessage(type, data);
    };
    state.socket.onclose = () => {
      updateConnectionStatus("Reconnecting...", "connecting");
      setTimeout(connectWebSocket, 3000);
    };
    state.socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      updateConnectionStatus("Error", "disconnected");
      state.socket.close();
    };
  }

  function sendMessage(action, payload = {}) {
    if (state.socket?.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({ action, payload }));
    }
  }

  const messageHandlers = {
    model_loaded: (data) => {
      state.isModelLoaded = true;
      state.modelType = data.model_type;
      state.currentModelName = ui.model.dropdown.dataset.value;
      state.currentLoraName = ui.lora.toggle.checked
        ? ui.lora.dropdown.dataset.value
        : "None";
      state.currentCpuOffload = ui.params.cpuOffloadCheckbox.checked;
      state.currentVaeTiling = ui.params.vaeTilingCheckbox.checked;

      updateStatus(data.status_message, "ready");
      setDimensions(data.width, data.height);
      setBusyState(false);
      updateLoadButtonState();

      ui.params.resText.textContent = `Est. max resolution: ${data.max_res_vram}px (VRAM), ${data.max_res_offload}px (Offload)`;
      ui.params.resGuidance.classList.remove("hidden");
    },
    generation_complete: (data) => {
      const imageUrl = `/outputs/${data.image_filename}?t=${Date.now()}`;
      ui.generate.outputImage.src = imageUrl;
      ui.generate.downloadBtn.href = imageUrl;
      ui.generate.openNewTabBtn.href = imageUrl;
      ui.generate.outputImage.classList.remove("hidden");
      ui.generate.wrapper.classList.add("has-image");
      ui.generate.imagePlaceholder.classList.add("hidden");
      ui.generate.infoText.textContent = data.info;
      setBusyState(false);
    },
    generation_failed: (data) => {
      showDialog("Generation Failed", data.message, [{ text: "OK" }]);
      setBusyState(false);
    },
    model_unloaded: (data) => {
      state.isModelLoaded = false;
      state.currentModelName = null;
      state.currentLoraName = "None";
      state.currentCpuOffload = false;
      state.currentVaeTiling = true;
      updateStatus(data.status_message, "unloaded");
      setBusyState(false);
      updateLoadButtonState();
      ui.params.resGuidance.classList.add("hidden");
    },
    progress_update: (data) => {
      showProgressBar(true);
      ui.progress.label.textContent = data.description;
      const percent = Math.round(data.progress * 100);
      ui.progress.percent.textContent = `${percent}%`;
      ui.progress.barFill.style.width = `${percent}%`;
    },
    gallery_updated: (data) => populateGallery(data.images),
    image_deleted: (data) => {
      if (data.status === "success") {
        const deletedFilename = ui.lightbox.caption.textContent;
        if (ui.generate.outputImage.src.includes(deletedFilename)) {
          ui.generate.outputImage.src = "";
          ui.generate.outputImage.classList.add("hidden");
          ui.generate.wrapper.classList.remove("has-image");
          ui.generate.imagePlaceholder.classList.remove("hidden");
          ui.generate.wrapper.style.aspectRatio = "1 / 1";
        }
        closeLightbox();
      } else {
        showDialog("Error", `Could not delete image: ${data.message}`, [
          { text: "OK" },
        ]);
      }
    },
    error: (data) => {
      showDialog("Server Error", data.message, [{ text: "OK" }]);
      setBusyState(false);
      updateLoadButtonState();
    },
  };

  function handleWebSocketMessage(type, data) {
    (
      messageHandlers[type] ||
      (() => console.warn(`Unhandled message type: ${type}`))
    )(data);
  }

  function setBusyState(isBusy) {
    state.isBusy = isBusy;
    document.body.style.cursor = isBusy ? "wait" : "default";
    if (!isBusy) showProgressBar(false);

    ui.busyControls.forEach((el) => {
      const isDisabled = el.classList.contains("custom-dropdown")
        ? "disabled"
        : "disabled";
      el.classList.toggle(isDisabled, isBusy);
      if (el.tagName !== "DIV") el.disabled = isBusy;
    });

    if (!isBusy) {
      ui.model.unloadBtn.disabled = !state.isModelLoaded;
      ui.generate.btn.disabled = !state.isModelLoaded;
      updateLoadButtonState();
    }
  }

  function updateLoadButtonState() {
    if (state.isBusy) return;
    const selectedModel = ui.model.dropdown.dataset.value;
    const selectedLora = ui.lora.toggle.checked
      ? ui.lora.dropdown.dataset.value
      : "None";
    const selectedOffload = ui.params.cpuOffloadCheckbox.checked;
    const selectedTiling = ui.params.vaeTilingCheckbox.checked;

    const isSameConfig =
      state.isModelLoaded &&
      selectedModel === state.currentModelName &&
      selectedLora === state.currentLoraName &&
      selectedOffload === state.currentCpuOffload &&
      selectedTiling === state.currentVaeTiling;

    ui.model.loadBtn.disabled = isSameConfig;
  }

  function updateStatus(message, statusClass) {
    ui.status.text.textContent = message;
    const iconName =
      { ready: "memory", unloaded: "memory_off", busy: "hourglass_top" }[
        statusClass
      ] || "memory";
    ui.status.icon.textContent = iconName;
    ui.status.icon.className = `material-symbols-outlined icon-${statusClass}`;
  }

  function showProgressBar(show) {
    ui.progress.container.classList.toggle("hidden", !show);
  }
  function updateConnectionStatus(text, statusClass) {
    ui.status.connectionText.textContent = text;
    ui.status.indicator.className = `status-indicator ${statusClass}`;
  }

  function setDimensions(width, height) {
    ui.params.widthSlider.value = width;
    ui.params.heightSlider.value = height;
    ui.params.widthSlider.dispatchEvent(new Event("input"));
    ui.params.heightSlider.dispatchEvent(new Event("input"));
  }

  function autoResizeTextarea(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function createCustomDropdown(container, options, onSelect) {
    const initialValue = options[0] || "No options";
    container.innerHTML = `<div class="dropdown-selected" tabindex="0"><span class="selected-text">${initialValue}</span></div><ul class="dropdown-options"></ul>`;
    const selected = container.querySelector(".selected-text");
    const optionsList = container.querySelector(".dropdown-options");
    options.forEach((option) => {
      const li = document.createElement("li");
      li.className = "dropdown-option";
      li.textContent = option;
      li.dataset.value = option;
      optionsList.appendChild(li);
    });
    container.dataset.value = initialValue;
    if (options.length > 0) {
      optionsList.querySelector("li").classList.add("selected");
    }
    container.addEventListener("click", (e) => {
      if (!container.classList.contains("disabled")) {
        e.stopPropagation();
        container.classList.toggle("open");
      }
    });
    optionsList.addEventListener("click", (e) => {
      if (e.target.tagName === "LI") {
        container.dataset.value = e.target.dataset.value;
        selected.textContent = e.target.textContent;
        optionsList
          .querySelectorAll("li")
          .forEach((li) => li.classList.remove("selected"));
        e.target.classList.add("selected");
        onSelect?.(e.target.dataset.value);
      }
    });
  }

  function showDialog(title, message, buttons) {
    ui.dialog.title.textContent = title;
    ui.dialog.message.innerHTML = message;
    ui.dialog.buttons.innerHTML = "";
    buttons.forEach((btnInfo) => {
      const button = document.createElement("button");
      button.textContent = btnInfo.text;
      button.className = `btn ${btnInfo.class || "btn-secondary"}`;
      button.onclick = () => {
        ui.dialog.overlay.classList.add("hidden");
        if (btnInfo.callback) btnInfo.callback();
      };
      ui.dialog.buttons.appendChild(button);
    });
    ui.dialog.overlay.classList.remove("hidden");
  }

  function populateGallery(images) {
    state.galleryImages = images || [];
    ui.gallery.grid.innerHTML = "";
    const hasImages = state.galleryImages.length > 0;
    ui.gallery.placeholder.classList.toggle("hidden", hasImages);
    if (hasImages) {
      state.galleryImages.forEach((imageFile, index) => {
        const item = document.createElement("div");
        item.className = "gallery-item";
        const imageUrl = `/outputs/${imageFile}`;
        item.innerHTML = `<img src="${imageUrl}" alt="${imageFile}" class="gallery-item-image" loading="lazy"><div class="image-actions-overlay"><a href="${imageUrl}" download class="image-action-btn" title="Download Image"><span class="material-symbols-outlined">download</span></a><a href="${imageUrl}" target="_blank" class="image-action-btn" title="Open in New Tab"><span class="material-symbols-outlined">open_in_new</span></a></div>`;
        item
          .querySelector(".image-actions-overlay")
          .addEventListener("click", (e) => e.stopPropagation());
        item.addEventListener("click", () => openLightbox(index));
        ui.gallery.grid.appendChild(item);
      });
    }
  }

  function openLightbox(index) {
    showLightboxImage(index);
    ui.lightbox.container.classList.remove("hidden");
    document.addEventListener("keydown", handleLightboxKeys);
  }

  function closeLightbox() {
    ui.lightbox.container.classList.add("hidden");
    document.removeEventListener("keydown", handleLightboxKeys);
  }

  function handleLightboxKeys(e) {
    if (ui.lightbox.container.classList.contains("hidden")) return;
    switch (e.key) {
      case "Escape":
        closeLightbox();
        break;
      case "ArrowLeft":
        ui.lightbox.prevBtn.click();
        break;
      case "ArrowRight":
        ui.lightbox.nextBtn.click();
        break;
      case "f":
      case "F":
        ui.lightbox.fitBtn.click();
        break;
      case "+":
      case "=":
        ui.lightbox.zoomInBtn.click();
        break;
      case "-":
      case "_":
        ui.lightbox.zoomOutBtn.click();
        break;
      case "Delete":
        ui.lightbox.deleteBtn.click();
        break;
    }
  }

  function showLightboxImage(index) {
    const isFromGallery = typeof index === "number";
    let imageUrl, caption;

    if (isFromGallery) {
      if (index < 0 || index >= state.galleryImages.length) return;
      state.currentLightboxIndex = index;
      caption = state.galleryImages[index];
      imageUrl = `/outputs/${caption}`;
      ui.lightbox.prevBtn.style.display = "block";
      ui.lightbox.nextBtn.style.display = "block";
      ui.lightbox.deleteBtn.style.display = "block";
    } else {
      state.currentLightboxIndex = -1;
      imageUrl = ui.generate.outputImage.src;
      caption = imageUrl.split("/").pop().split("?")[0];
      ui.lightbox.prevBtn.style.display = "none";
      ui.lightbox.nextBtn.style.display = "none";
      ui.lightbox.deleteBtn.style.display = "block";
    }

    ui.lightbox.img.src = imageUrl;
    ui.lightbox.caption.textContent = caption;
    resetZoomAndPan();
  }

  function updateImageTransform() {
    ui.lightbox.img.style.transform = `translate(${state.panCurrent.x}px, ${state.panCurrent.y}px) scale(${state.zoomLevel})`;
  }

  function resetZoomAndPan() {
    state.zoomLevel = 1;
    state.panCurrent = { x: 0, y: 0 };
    updateImageTransform();
  }

  function updateSliderBackground(slider) {
    const min = parseFloat(slider.min || 0);
    const max = parseFloat(slider.max || 100);
    const val = parseFloat(slider.value);
    const percentage = ((val - min) * 100) / (max - min);
    slider.style.backgroundSize = `${percentage}% 100%`;
  }

  function setupEventListeners() {
    document.querySelectorAll(".range-input").forEach((slider) => {
      const valueDisplay = document.getElementById(
        slider.id.replace("-slider", "-value")
      );
      const updateFunc = () => {
        if (valueDisplay)
          valueDisplay.textContent =
            slider.value +
            (slider.id.includes("width") || slider.id.includes("height")
              ? "px"
              : "");
        updateSliderBackground(slider);
      };
      slider.addEventListener("input", updateFunc);
      updateFunc();
    });

    document.querySelectorAll(".form-textarea").forEach((textarea) => {
      textarea.addEventListener("input", () => autoResizeTextarea(textarea));
      textarea.addEventListener("focus", () => autoResizeTextarea(textarea));
      autoResizeTextarea(textarea);
    });

    ui.nav.links.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        ui.nav.links.forEach((l) => l.classList.remove("active"));
        link.classList.add("active");
        Object.values(ui.pages).forEach((page) => page.classList.add("hidden"));
        document
          .getElementById(`page-${link.dataset.target}`)
          .classList.remove("hidden");
      });
    });

    ui.lora.toggle.addEventListener("change", () => {
      ui.lora.container.classList.toggle("hidden");
      updateLoadButtonState();
    });

    ui.model.loadBtn.addEventListener("click", () => {
      setBusyState(true);
      updateStatus("Loading model...", "busy");
      sendMessage("load_model", {
        model_name: ui.model.dropdown.dataset.value,
        scheduler_name: ui.model.samplerDropdown.dataset.value,
        lora_name: ui.lora.toggle.checked
          ? ui.lora.dropdown.dataset.value
          : "None",
        vae_tiling: ui.params.vaeTilingCheckbox.checked,
        cpu_offload: ui.params.cpuOffloadCheckbox.checked,
      });
    });

    ui.model.unloadBtn.addEventListener("click", () => {
      setBusyState(true);
      updateStatus("Unloading model...", "busy");
      sendMessage("unload_model");
    });

    [ui.model.dropdown, ui.lora.dropdown].forEach((el) =>
      el.addEventListener("click", (e) => {
        if (e.target.tagName === "LI") updateLoadButtonState();
      })
    );
    [ui.params.cpuOffloadCheckbox, ui.params.vaeTilingCheckbox].forEach((el) =>
      el.addEventListener("change", updateLoadButtonState)
    );

    ui.generate.btn.addEventListener("click", () => {
      setBusyState(true);
      ui.generate.infoText.textContent = "";
      sendMessage("generate_image", {
        prompt: ui.params.prompt.value,
        negative_prompt: ui.params.negativePrompt.value,
        steps: parseInt(ui.params.stepsSlider.value),
        guidance: parseFloat(ui.params.guidanceSlider.value),
        seed: parseInt(ui.params.seedInput.value),
        width: parseInt(ui.params.widthSlider.value),
        height: parseInt(ui.params.heightSlider.value),
        lora_weight: ui.lora.toggle.checked
          ? parseFloat(ui.lora.weightSlider.value)
          : 0,
      });
    });

    ui.generate.outputImage.onload = () => {
      const img = ui.generate.outputImage;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        ui.generate.wrapper.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
      }
    };

    ui.params.randomizeSeedBtn.addEventListener("click", () => {
      ui.params.seedInput.value = Math.floor(Math.random() * 2 ** 32);
    });

    ui.params.aspectRatioBtns.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-aspect-ratio");
      if (btn && !state.isBusy) {
        const presets =
          ASPECT_RATIOS[state.modelType] || ASPECT_RATIOS["SD 1.5"];
        if (presets[btn.dataset.ratio]) {
          setDimensions(...presets[btn.dataset.ratio]);
          ui.params.aspectRatioBtns
            .querySelectorAll("button")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
        }
      }
    });

    const refreshHandler = async (type) => {
      const response = await fetch("/api/config");
      const config = await response.json();
      if (type === "models")
        createCustomDropdown(
          ui.model.dropdown,
          config.models,
          updateLoadButtonState
        );
      else if (type === "loras")
        createCustomDropdown(
          ui.lora.dropdown,
          ["None", ...config.loras],
          updateLoadButtonState
        );
    };

    ui.model.refreshBtn.addEventListener("click", () =>
      refreshHandler("models")
    );
    ui.lora.refreshBtn.addEventListener("click", () => refreshHandler("loras"));
    ui.gallery.refreshBtn.addEventListener("click", () =>
      fetch("/api/config")
        .then((res) => res.json())
        .then((config) => populateGallery(config.gallery_images))
    );

    ui.generate.wrapper.addEventListener("click", (e) => {
      if (
        ui.generate.wrapper.classList.contains("has-image") &&
        e.target.closest(".image-action-btn") === null
      )
        openLightbox(null);
    });
    ui.generate.viewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (ui.generate.wrapper.classList.contains("has-image"))
        openLightbox(null);
    });

    ui.lightbox.closeBtn.addEventListener("click", closeLightbox);
    ui.lightbox.deleteBtn.addEventListener("click", () => {
      const filename = ui.lightbox.caption.textContent;
      const buttons = [
        { text: "Cancel" },
        {
          text: "Delete",
          class: "btn-danger",
          callback: () => sendMessage("delete_image", { filename }),
        },
      ];
      showDialog(
        "Confirm Deletion",
        `Are you sure you want to permanently delete <strong>${filename}</strong>? This action cannot be undone.`,
        buttons
      );
    });
    ui.lightbox.container.addEventListener("click", (e) => {
      if (e.target === ui.lightbox.container) closeLightbox();
    });
    ui.lightbox.prevBtn.addEventListener("click", () =>
      showLightboxImage(state.currentLightboxIndex - 1)
    );
    ui.lightbox.nextBtn.addEventListener("click", () =>
      showLightboxImage(state.currentLightboxIndex + 1)
    );
    ui.lightbox.zoomInBtn.addEventListener("click", () => {
      state.zoomLevel = Math.min(5, state.zoomLevel + 0.2);
      updateImageTransform();
    });
    ui.lightbox.zoomOutBtn.addEventListener("click", () => {
      state.zoomLevel = Math.max(0.2, state.zoomLevel - 0.2);
      updateImageTransform();
    });
    ui.lightbox.fitBtn.addEventListener("click", resetZoomAndPan);

    ui.lightbox.imageWrapper.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      state.isPanning = true;
      state.panStart = {
        x: e.clientX - state.panCurrent.x,
        y: e.clientY - state.panCurrent.y,
      };
      ui.lightbox.imageWrapper.style.cursor = "grabbing";
    });
    window.addEventListener("mousemove", (e) => {
      if (!state.isPanning) return;
      e.preventDefault();
      state.panCurrent = {
        x: e.clientX - state.panStart.x,
        y: e.clientY - state.panStart.y,
      };
      updateImageTransform();
    });
    window.addEventListener("mouseup", (e) => {
      if (!state.isPanning) return;
      e.preventDefault();
      state.isPanning = false;
      ui.lightbox.imageWrapper.style.cursor = "grab";
    });
  }

  async function init() {
    try {
      const response = await fetch("/api/config");
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const config = await response.json();
      createCustomDropdown(
        ui.model.dropdown,
        config.models,
        updateLoadButtonState
      );
      createCustomDropdown(ui.model.samplerDropdown, config.schedulers);
      createCustomDropdown(
        ui.lora.dropdown,
        ["None", ...config.loras],
        updateLoadButtonState
      );
      populateGallery(config.gallery_images);

      const generationControls = document
        .getElementById("page-generate")
        .querySelectorAll(
          "button, input, textarea, .custom-dropdown, .lora-switch"
        );
      ui.busyControls = Array.from(generationControls).filter(
        (el) => !el.closest(".image-actions-overlay")
      );

      setBusyState(false);
      updateLoadButtonState();
    } catch (error) {
      console.error("Failed to fetch initial config:", error);
      alert("Could not load configuration from the server. Please refresh.");
    }
  }

  init();
  connectWebSocket();
  setupEventListeners();
  document.addEventListener("click", () =>
    document
      .querySelectorAll(".custom-dropdown.open")
      .forEach((d) => d.classList.remove("open"))
  );
});
