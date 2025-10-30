document.addEventListener("DOMContentLoaded", () => {
  const state = {
    socket: null,
    isModelLoaded: false,
    lastGeneratedImage: null,
    maxVramRes: null,
    galleryImages: [],
    prompts: [],
    settings: { models: [], loras: [] },
    currentLightboxIndex: -1,
    zoomLevel: 1,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    panCurrent: { x: 0, y: 0 },
    canvas: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      isDragging: false,
      startX: 0,
      startY: 0,
    },
    nodes: new Map(),
    generationState: {
      model_name: null,
      scheduler_name: "Euler A",
      lora_name: null,
      lora_weight: 0.7,
      prompt: "fantasy portrait of a mystical woman with blue flowing hair resembling ocean waves, watercolor art, cool color palette, seafoam accents, luminous eyes, elegant posture, magical and calming aura, fine art style, detailed face, soft-focus lighting, painterly textures",
      negative_prompt: "",
      steps: 50,
      guidance: 3,
      seed: 12345,
      width: 512,
      height: 512,
      vae_tiling: true,
      cpu_offload: false,
    },
  };

  const ui = {
    navLinks: document.querySelectorAll(".nav-link"),
    pages: {
      generate: document.getElementById("page-generate"),
      gallery: document.getElementById("page-gallery"),
      promptBook: document.getElementById("page-prompt-book"),
      settings: document.getElementById("page-settings"),
    },
    status: {
      indicator: document.getElementById("status-indicator"),
      connectionText: document.getElementById("connection-status"),
    },
    gallery: {
      grid: document.getElementById("gallery-grid"),
      placeholder: document.getElementById("gallery-placeholder"),
      refreshBtn: document.getElementById("refresh-gallery-btn"),
    },
    promptBook: {
      grid: document.getElementById("prompt-book-grid"),
      placeholder: document.getElementById("prompt-book-placeholder"),
      addBtn: document.getElementById("add-prompt-btn"),
      refreshBtn: document.getElementById("refresh-prompts-btn"),
      editor: {
        overlay: document.getElementById("prompt-editor-overlay"),
        title: document.getElementById("prompt-editor-title"),
        titleInput: document.getElementById("prompt-title"),
        promptInput: document.getElementById("prompt-content"),
        negativeInput: document.getElementById("prompt-negative"),
        buttons: document.getElementById("prompt-editor-buttons"),
        _oldTitle: null,
      },
    },
    settings: {
      modelsList: document.getElementById("models-list"),
      lorasList: document.getElementById("loras-list"),
      refreshModelsBtn: document.getElementById("refresh-models-btn"),
      refreshLorasBtn: document.getElementById("refresh-loras-btn"),
      fileItemTemplate: document.getElementById("file-item-template"),
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
    themeToggle: document.getElementById("theme-toggle-btn"),
    node: {
      canvas: document.getElementById("node-canvas"),
      connectorSvg: document.getElementById("node-connector-svg"),
      dock: document.getElementById("node-dock"),
      dockButtons: document.querySelectorAll("#node-dock .node-dock-button"),
      loadModelBtn: document.getElementById("dock-load-model-btn"),
      generateBtn: document.getElementById("dock-generate-btn"),
    },
    restartBtn: document.getElementById("restart-backend-btn"),
    clearCacheBtn: document.getElementById("clear-cache-btn"),
    resetZoomBtn: document.getElementById("reset-zoom-btn"),
  };

  function connectWebSocket() {
    const url = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
      window.location.host
    }/ws`;
    state.socket = new WebSocket(url);
    state.socket.onopen = () =>
      updateConnectionStatus("Connected", "connected");
    state.socket.onclose = () => {
      updateConnectionStatus("Reconnecting...", "connecting");
      setTimeout(connectWebSocket, 3000);
    };
    state.socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      updateConnectionStatus("Error", "disconnected");
      state.socket.close();
    };
    state.socket.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);
      handleWebSocketMessage(type, data);
    };
  }

  function sendMessage(action, payload = {}) {
    if (state.socket?.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({ action, payload }));
    }
  }

  function handleWebSocketMessage(type, data) {
    const handlers = {
      model_loaded: (data) => {
        state.isModelLoaded = true;
        state.maxVramRes = data.max_res_vram;
        updateNodeUI("model_sampler", {
          status: data.status_message,
          loaded: true,
        });
        state.generationState.width = data.width;
        state.generationState.height = data.height;
        updateNodeUI("parameters", {
          width: data.width,
          height: data.height,
          max_res: data.max_res_vram,
        });
      },
      generation_complete: (data) => {
        state.lastGeneratedImage = data.image_filename;
        updateNodeUI("image_preview", {
          image: data.image_filename,
          clearProgress: true,
        });
      },
      generation_failed: (data) => {
        showDialog("Generation Failed", data.message, [{ text: "OK" }]);
        updateNodeUI("image_preview", { clearProgress: true });
      },
      progress_update: (data) => {
        updateNodeUI("image_preview", {
          progress: data.progress,
          description: data.description,
        });
      },
      model_unloaded: (data) => {
        state.isModelLoaded = false;
        state.maxVramRes = null;
        updateNodeUI("model_sampler", {
          status: data.status_message,
          loaded: false,
        });
        updateNodeUI("parameters", { max_res: null });
      },
      gallery_updated: (data) =>
        populateGallery(data.images.map((img) => img.filename)),
      image_deleted: (data) => {
        if (data.status === "success") closeLightbox();
        else
          showDialog("Error", `Could not delete image: ${data.message}`, [
            { text: "OK" },
          ]);
      },
      settings_data: (data) => {
        state.settings.models = data.models;
        state.settings.loras = data.loras;
        populateSettingsLists();
      },
      settings_data_updated: (data) => {
        state.settings.models = data.models;
        state.settings.loras = data.loras;
        populateSettingsLists();
      },
      error: (data) =>
        showDialog("Server Error", data.message, [{ text: "OK" }]),
      backend_restarting: () =>
        showDialog(
          "Info",
          "Backend is restarting. The page will reload shortly.",
          []
        ),
      cache_cleared: () =>
        showDialog("Success", "VRAM cache has been cleared.", [{ text: "OK" }]),
    };
    (handlers[type] || (() => console.warn(`Unhandled message type: ${type}`)))(
      data
    );
  }

  function updateConnectionStatus(text, statusClass) {
    ui.status.connectionText.textContent = text;
    ui.status.indicator.className = `status-indicator ${statusClass}`;
  }

  function initTheme() {
    const savedTheme = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
    ui.themeToggle.querySelector(".material-symbols-outlined").textContent =
      savedTheme === "dark" ? "light_mode" : "dark_mode";
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    ui.themeToggle.querySelector(".material-symbols-outlined").textContent =
      newTheme === "dark" ? "light_mode" : "dark_mode";
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
        btnInfo.callback?.();
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
        item.innerHTML = `<img src="${imageUrl}" alt="${imageFile}" class="gallery-item-image" loading="lazy"><div class="image-actions-overlay"><a href="${imageUrl}" target="_blank" class="image-action-btn" title="Open in New Tab"><span class="material-symbols-outlined">open_in_new</span></a></div>`;
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

  function showLightboxImage(index) {
    if (index < 0 || index >= state.galleryImages.length) return;
    state.currentLightboxIndex = index;
    const filename = state.galleryImages[index];
    ui.lightbox.img.src = `/outputs/${filename}`;
    ui.lightbox.caption.textContent = filename;
    resetZoomAndPan();
  }

  function resetZoomAndPan() {
    state.zoomLevel = 1;
    state.panCurrent = { x: 0, y: 0 };
    updateImageTransform();
  }

  function updateImageTransform() {
    ui.lightbox.img.style.transform = `translate(${state.panCurrent.x}px, ${state.panCurrent.y}px) scale(${state.zoomLevel})`;
  }

  function handleLightboxKeys(e) {
    const keyMap = {
      Escape: closeLightbox,
      ArrowLeft: () => ui.lightbox.prevBtn.click(),
      ArrowRight: () => ui.lightbox.nextBtn.click(),
      "+": () => ui.lightbox.zoomInBtn.click(),
      "-": () => ui.lightbox.zoomOutBtn.click(),
      f: () => ui.lightbox.fitBtn.click(),
      Delete: () => ui.lightbox.deleteBtn.click(),
    };
    keyMap[e.key]?.();
  }

  function populateSettingsLists() {
    const createFileItem = (filename, type) => {
      const item = ui.settings.fileItemTemplate.content.cloneNode(true);
      item.querySelector(".file-name").textContent = filename;
      const deleteBtn = item.querySelector(".file-delete-btn");
      deleteBtn.addEventListener("click", () => {
        const action =
          type === "model" ? "delete_model_file" : "delete_lora_file";
        showDialog(
          "Confirm Deletion",
          `Delete <strong>${filename}</strong>? This cannot be undone.`,
          [
            { text: "Cancel" },
            {
              text: "Delete",
              class: "btn-danger",
              callback: () => sendMessage(action, { filename }),
            },
          ]
        );
      });
      return item;
    };

    ui.settings.modelsList.innerHTML = "";
    state.settings.models.forEach((model) =>
      ui.settings.modelsList.appendChild(createFileItem(model, "model"))
    );

    ui.settings.lorasList.innerHTML = "";
    state.settings.loras.forEach((lora) =>
      ui.settings.lorasList.appendChild(createFileItem(lora, "lora"))
    );
  }

  function initCanvasInteraction() {
    const { canvas } = ui.node;
    const resetView = () => {
      state.canvas.scale = 1;
      state.canvas.offsetX = 0;
      state.canvas.offsetY = 0;
      updateCanvasTransform();
    };
    ui.resetZoomBtn.addEventListener("click", resetView);

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const wheel = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.max(0.2, Math.min(3, state.canvas.scale * wheel));
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      state.canvas.offsetX = mouseX - (mouseX - state.canvas.offsetX) * wheel;
      state.canvas.offsetY = mouseY - (mouseY - state.canvas.offsetY) * wheel;
      state.canvas.scale = newScale;
      updateCanvasTransform();
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.target === canvas) {
        state.canvas.isDragging = true;
        state.canvas.startX = e.clientX - state.canvas.offsetX;
        state.canvas.startY = e.clientY - state.canvas.offsetY;
        canvas.style.cursor = "grabbing";
      }
    });
    document.addEventListener("mousemove", (e) => {
      if (state.canvas.isDragging) {
        state.canvas.offsetX = e.clientX - state.canvas.startX;
        state.canvas.offsetY = e.clientY - state.canvas.startY;
        updateCanvasTransform();
      }
    });
    document.addEventListener("mouseup", () => {
      state.canvas.isDragging = false;
      canvas.style.cursor = "default";
    });
  }

  function updateCanvasTransform() {
    const { canvas, connectorSvg } = ui.node;
    canvas.style.transform = `translate(${state.canvas.offsetX}px, ${state.canvas.offsetY}px) scale(${state.canvas.scale})`;
    connectorSvg.style.transform = `translate(${state.canvas.offsetX}px, ${state.canvas.offsetY}px) scale(${state.canvas.scale})`;
  }

  function makeNodeDraggable(node) {
    const header = node.querySelector(".node-header");
    if (!header) return;
    header.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      let startX = e.clientX,
        startY = e.clientY;
      let startLeft = node.offsetLeft,
        startTop = node.offsetTop;
      const onMouseMove = (moveEvent) => {
        const dx = (moveEvent.clientX - startX) / state.canvas.scale;
        const dy = (moveEvent.clientY - startY) / state.canvas.scale;
        node.style.left = `${startLeft + dx}px`;
        node.style.top = `${startTop + dy}px`;
      };
      const onMouseUp = () =>
        document.removeEventListener("mousemove", onMouseMove);
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp, { once: true });
    });
  }

  function createNode(type, x, y) {
    if (state.nodes.has(type) && ["lora"].includes(type)) {
      showDialog("Info", "A LoRA node already exists on the canvas.", [
        { text: "OK" },
      ]);
      return;
    }
    const nodeEl = document.createElement("div");
    nodeEl.id = `node-${type}`;
    nodeEl.className = "node";
    nodeEl.style.left = `${x}px`;
    nodeEl.style.top = `${y}px`;
    const isPermanent = [
      "model_sampler",
      "parameters",
      "image_preview",
      "prompt",
    ].includes(type);
    let header = "",
      content = "";

    switch (type) {
      case "model_sampler":
        header = `<h3 class="node-title">Model & Sampler</h3><div class="node-header-actions"><button class="icon-btn" id="node-refresh-models" title="Refresh Models"><span class="material-symbols-outlined">refresh</span></button><button class="icon-btn" id="node-unload-model" title="Unload Model" disabled><span class="material-symbols-outlined">cancel</span></button></div>`;
        content = `<div class="node-content">
                <div class="control-group"><label>Model</label><div class="custom-dropdown" data-key="model_name"></div></div>
                <div class="control-group"><label>Sampler</label><div class="custom-dropdown" data-key="scheduler_name"></div></div>
                <div class="control-group"><div id="model-status" style="font-size: 0.8rem; text-align: center;">No model loaded.</div></div>
            </div>`;
        break;
      case "parameters":
        header = `<h3 class="node-title">Parameters & Dimensions</h3>`;
        content = `<div class="node-content">
                <div class="control-group"><label>Steps</label><div class="slider-input-group"><input type="range" class="range-input" data-key="steps" min="1" max="100" value="${state.generationState.steps}" step="1"><input type="number" data-value-for="steps" value="${state.generationState.steps}"></div></div>
                <div class="control-group"><label>Guidance</label><div class="slider-input-group"><input type="range" class="range-input" data-key="guidance" min="1" max="20" value="${state.generationState.guidance}" step="1"><input type="number" data-value-for="guidance" value="${state.generationState.guidance}"></div></div>
                <div class="control-group"><label>Width</label><div class="slider-input-group"><input type="range" class="range-input" data-key="width" min="256" max="2048" value="${state.generationState.width}" step="64"><input type="number" data-value-for="width" value="${state.generationState.width}"></div></div>
                <div class="control-group"><label>Height</label><div class="slider-input-group"><input type="range" class="range-input" data-key="height" min="256" max="2048" value="${state.generationState.height}" step="64"><input type="number" data-value-for="height" value="${state.generationState.height}"></div></div>
                <div class="control-group"><label>Aspect Ratio</label><div class="aspect-ratio-buttons"><button class="aspect-ratio-btn ar-1-1" data-ratio="1:1" title="1:1"></button><button class="aspect-ratio-btn ar-4-3" data-ratio="4:3" title="4:3"></button><button class="aspect-ratio-btn ar-3-4" data-ratio="3:4" title="3:4"></button><button class="aspect-ratio-btn ar-16-9" data-ratio="16:9" title="16:9"></button><button class="aspect-ratio-btn ar-9-16" data-ratio="9:16" title="9:16"></button></div></div>
                <div class="control-group"><label>Seed</label><div class="seed-input-wrapper"><input type="number" class="form-input" data-key="seed" value="${state.generationState.seed}"><button id="random-seed" class="icon-btn" title="Randomize Seed"><span class="material-symbols-outlined">casino</span></button></div></div>
                <div id="max-res-info" class="max-res-info"></div>
            </div>`;
        break;
      case "image_preview":
        header = `<h3 class="node-title">Image Preview</h3>`;
        content = `<div class="node-content">
                <div class="image-preview-node">
                    <div class="placeholder"><span class="material-symbols-outlined">wallpaper</span></div>
                    <img class="preview-img hidden" />
                    <div class="progress-overlay"><div class="progress-bar"><div class="progress-bar-inner"></div></div><span class="progress-text"></span></div>
                </div>
                <div class="image-preview-actions"><button id="view-image-btn" class="icon-btn" title="View Image" disabled><span class="material-symbols-outlined">visibility</span></button><button id="delete-image-btn" class="icon-btn" title="Delete Image" disabled><span class="material-symbols-outlined">delete</span></button></div>
            </div>`;
        break;
      case "prompt":
        header = `<h3 class="node-title">Prompt</h3>`;
        content = `<div class="node-content">
                <div class="control-group"><label>Prompt</label><div class="autoresize-textarea-wrapper"><textarea class="form-textarea" data-key="prompt" rows="1">${state.generationState.prompt}</textarea></div></div>
                <div class="control-group"><label>Negative Prompt</label><div class="autoresize-textarea-wrapper"><textarea class="form-textarea" data-key="negative_prompt" rows="1">${state.generationState.negative_prompt}</textarea></div></div>
            </div>`;
        break;
      case "lora":
        header = `<h3 class="node-title">LoRA</h3>`;
        content = `<div class="node-content">
                <div class="control-group"><label>LoRA</label><div class="custom-dropdown" data-key="lora_name"></div></div>
                <div class="control-group"><label>Weight</label><div class="slider-input-group"><input type="range" class="range-input" data-key="lora_weight" min="0" max="1" value="${state.generationState.lora_weight}" step="0.05"><input type="number" data-value-for="lora_weight" value="${state.generationState.lora_weight}" step="0.05"></div></div>
            </div>`;
        break;
      default:
        return;
    }

    nodeEl.innerHTML = `<div class="node-header">${header}${
      !isPermanent
        ? '<button class="node-delete" title="Delete Node">&times;</button>'
        : ""
    }</div>${content}`;
    ui.node.canvas.appendChild(nodeEl);
    state.nodes.set(type, { el: nodeEl });
    makeNodeDraggable(nodeEl);
    initNodeControls(nodeEl, type, isPermanent);
  }

  function initNodeControls(node, type, isPermanent) {
    const setupAutoresize = (textarea) => {
      const update = () => {
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
      };
      textarea.addEventListener("input", update);
      update();
    };

    const createDropdown = (container, key, options, defaultVal) => {
      container.innerHTML = "";
      const selected = document.createElement("div");
      selected.className = "dropdown-selected";
      selected.textContent =
        state.generationState[key] || defaultVal || "Select...";
      const optionsList = document.createElement("ul");
      optionsList.className = "dropdown-options";
      if (key === "lora_name") options = ["None", ...options];

      options.forEach((opt) => {
        const optionEl = document.createElement("li");
        optionEl.className = "dropdown-option";
        optionEl.textContent = opt;
        optionEl.dataset.value = opt;
        optionsList.appendChild(optionEl);
      });
      container.append(selected, optionsList);
      container.addEventListener("click", (e) => {
        if (e.target.matches(".dropdown-option")) {
          state.generationState[key] =
            e.target.dataset.value === "None" ? null : e.target.dataset.value;
          selected.textContent = e.target.textContent;
          container.classList.remove("open");
        } else {
          container.classList.toggle("open");
        }
      });
    };

    node.querySelectorAll(".slider-input-group").forEach((group) => {
      const rangeInput = group.querySelector('input[type="range"]');
      const numberInput = group.querySelector('input[type="number"]');
      const key = rangeInput.dataset.key;

      const updateRangeBg = (input) => {
        const percent =
          ((input.value - input.min) / (input.max - input.min)) * 100;
        input.style.backgroundSize = `${percent}% 100%`;
      };

      rangeInput.addEventListener("input", () => {
        const value = rangeInput.step.includes(".")
          ? parseFloat(rangeInput.value).toFixed(2)
          : rangeInput.value;
        numberInput.value = value;
        state.generationState[key] = parseFloat(value);
        updateRangeBg(rangeInput);
      });
      numberInput.addEventListener("change", () => {
        let value = parseFloat(numberInput.value);
        value = Math.max(
          parseFloat(rangeInput.min),
          Math.min(parseFloat(rangeInput.max), value)
        );
        if (isNaN(value)) value = state.generationState[key];
        numberInput.value = value;
        rangeInput.value = value;
        state.generationState[key] = value;
        updateRangeBg(rangeInput);
      });
      updateRangeBg(rangeInput);
    });

    node.querySelectorAll("textarea.form-textarea").forEach((textarea) => {
      setupAutoresize(textarea);
      textarea.addEventListener("input", () => {
        state.generationState[textarea.dataset.key] = textarea.value;
      });
    });

    node.querySelectorAll("input.form-input").forEach((input) => {
      const key = input.dataset.key;
      input.addEventListener(
        "change",
        () => (state.generationState[key] = parseInt(input.value))
      );
    });

    if (type === "model_sampler") {
      const modelDropdownContainer = node.querySelector(
        '.custom-dropdown[data-key="model_name"]'
      );
      const samplerDropdownContainer = node.querySelector(
        '.custom-dropdown[data-key="scheduler_name"]'
      );
      const rebuildModelDropdown = (models) =>
        createDropdown(
          modelDropdownContainer,
          "model_name",
          models,
          "Select a model"
        );

      fetch("/api/config")
        .then((r) => r.json())
        .then((config) => {
          state.settings.models = config.models;
          state.settings.loras = config.loras;
          rebuildModelDropdown(config.models);
          createDropdown(
            samplerDropdownContainer,
            "scheduler_name",
            config.schedulers,
            "Euler A"
          );
        });

      node
        .querySelector("#node-refresh-models")
        .addEventListener("click", (e) => {
          e.stopPropagation();
          fetch("/api/config")
            .then((r) => r.json())
            .then((config) => {
              state.settings.models = config.models;
              rebuildModelDropdown(config.models);
            });
        });

      node
        .querySelector("#node-unload-model")
        .addEventListener("click", (e) => {
          e.stopPropagation();
          sendMessage("unload_model");
        });
    }

    if (type === "parameters") {
      node.querySelector("#random-seed").addEventListener("click", () => {
        const newSeed = Math.floor(Math.random() * 2 ** 32);
        state.generationState.seed = newSeed;
        node.querySelector('input[data-key="seed"]').value = newSeed;
      });
      node.querySelectorAll(".aspect-ratio-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const [w, h] = btn.dataset.ratio.split(":").map(Number);
          const isVertical = h > w;
          const baseSize =
            state.generationState.width > 768
              ? 1024
              : state.generationState.width > 512
              ? 768
              : 512;
          let newWidth, newHeight;
          if (w === h) {
            newWidth = baseSize;
            newHeight = baseSize;
          } else if (isVertical) {
            newHeight = baseSize;
            newWidth = Math.round((baseSize * w) / h / 64) * 64;
          } else {
            newWidth = baseSize;
            newHeight = Math.round((baseSize * h) / w / 64) * 64;
          }
          updateNodeUI("parameters", { width: newWidth, height: newHeight });
        });
      });
    }

    if (type === "image_preview") {
      node.querySelector("#view-image-btn").addEventListener("click", () => {
        if (state.lastGeneratedImage) {
          const imgIndex = state.galleryImages.indexOf(
            state.lastGeneratedImage
          );
          if (imgIndex !== -1) openLightbox(imgIndex);
        }
      });
      node.querySelector("#delete-image-btn").addEventListener("click", () => {
        if (state.lastGeneratedImage) {
          showDialog(
            "Confirm Deletion",
            `Delete <strong>${state.lastGeneratedImage}</strong>?`,
            [
              { text: "Cancel" },
              {
                text: "Delete",
                class: "btn-danger",
                callback: () => {
                  sendMessage("delete_image", {
                    filename: state.lastGeneratedImage,
                  });
                  state.lastGeneratedImage = null;
                  updateNodeUI("image_preview", { image: null });
                },
              },
            ]
          );
        }
      });
    }

    if (type === "lora") {
      const loraDropdownContainer = node.querySelector(
        '.custom-dropdown[data-key="lora_name"]'
      );
      fetch("/api/config")
        .then((r) => r.json())
        .then((config) =>
          createDropdown(
            loraDropdownContainer,
            "lora_name",
            config.loras,
            "None"
          )
        );
    }

    if (!isPermanent) {
      node.querySelector(".node-delete").addEventListener("click", () => {
        if (type === "lora") state.generationState.lora_name = null;
        node.remove();
        state.nodes.delete(type);
      });
    }
  }

  function updateNodeUI(type, updates) {
    const node = state.nodes.get(type)?.el;
    if (!node) return;
    if (type === "model_sampler") {
      if (updates.status)
        node.querySelector("#model-status").textContent = updates.status;
      node.querySelector("#node-unload-model").disabled = !updates.loaded;
      ui.node.generateBtn.disabled = !updates.loaded;
    }
    if (type === "image_preview") {
      const progressOverlay = node.querySelector(".progress-overlay");
      const viewBtn = node.querySelector("#view-image-btn");
      const deleteBtn = node.querySelector("#delete-image-btn");

      if (updates.clearProgress) progressOverlay.classList.remove("visible");
      if (updates.progress !== undefined) {
        progressOverlay.classList.add("visible");
        node.querySelector(".progress-bar-inner").style.width = `${
          updates.progress * 100
        }%`;
        node.querySelector(".progress-text").textContent = updates.description;
      }
      if (updates.image !== undefined) {
        const img = node.querySelector(".preview-img");
        const placeholder = node.querySelector(".placeholder");
        if (updates.image) {
          img.src = `/outputs/${updates.image}`;
          img.classList.remove("hidden");
          placeholder.classList.add("hidden");
        } else {
          img.src = "";
          img.classList.add("hidden");
          placeholder.classList.remove("hidden");
        }
        viewBtn.disabled = !updates.image;
        deleteBtn.disabled = !updates.image;
      }
    }
    if (type === "parameters") {
      if (updates.width) {
        const input = node.querySelector('input[data-key="width"]');
        input.value = updates.width;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (updates.height) {
        const input = node.querySelector('input[data-key="height"]');
        input.value = updates.height;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (updates.max_res !== undefined) {
        const infoEl = node.querySelector("#max-res-info");
        infoEl.innerHTML = updates.max_res
          ? `Recommended Max: <strong>${updates.max_res}px</strong>`
          : "";
      }
    }
  }

  function initDock() {
    ui.node.dockButtons.forEach((button) => {
      const type = button.dataset.nodeType;
      const isToggle = ["vae_tiling", "cpu_offload"].includes(type);

      button.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (isToggle) {
          state.generationState[type] = !state.generationState[type];
          button.classList.toggle("active", state.generationState[type]);
          if (state.isModelLoaded)
            showDialog(
              "Info",
              "This setting requires a model reload to take effect.",
              [{ text: "OK" }]
            );
          return;
        }
        const tempNode = button.cloneNode(true);
        Object.assign(tempNode.style, {
          position: "fixed",
          zIndex: "9999",
          opacity: "0.8",
          pointerEvents: "none",
          left: `${e.clientX - 25}px`,
          top: `${e.clientY - 25}px`,
        });
        document.body.appendChild(tempNode);
        const onMouseMove = (moveEvent) => {
          tempNode.style.left = `${moveEvent.clientX - 25}px`;
          tempNode.style.top = `${moveEvent.clientY - 25}px`;
        };
        const onMouseUp = (upEvent) => {
          document.removeEventListener("mousemove", onMouseMove);
          document.body.removeChild(tempNode);
          const canvasRect = ui.node.canvas.getBoundingClientRect();
          if (
            upEvent.clientX >= canvasRect.left &&
            upEvent.clientX <= canvasRect.right &&
            upEvent.clientY >= canvasRect.top &&
            upEvent.clientY <= canvasRect.bottom
          ) {
            const x =
              (upEvent.clientX - canvasRect.left - state.canvas.offsetX) /
              state.canvas.scale;
            const y =
              (upEvent.clientY - canvasRect.top - state.canvas.offsetY) /
              state.canvas.scale;
            createNode(type, x, y);
          }
        };
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp, { once: true });
      });
    });

    ui.node.loadModelBtn.addEventListener("click", () => {
      if (!state.generationState.model_name) {
        showDialog("Error", "Please select a model to load.", [{ text: "OK" }]);
        return;
      }
      updateNodeUI("model_sampler", {
        status: "Loading model...",
        loaded: false,
      });
      updateNodeUI("image_preview", {
        showProgress: true,
        description: "Loading...",
      });
      const payload = {
        model_name: state.generationState.model_name,
        scheduler_name: state.generationState.scheduler_name,
        lora_name: state.generationState.lora_name,
        vae_tiling: state.generationState.vae_tiling,
        cpu_offload: state.generationState.cpu_offload,
      };
      sendMessage("load_model", payload);
    });

    ui.node.generateBtn.addEventListener("click", () => {
      updateNodeUI("image_preview", {
        showProgress: true,
        description: "Starting...",
      });
      const payload = { ...state.generationState };
      payload.lora_weight = state.generationState.lora_name
        ? state.generationState.lora_weight
        : 0;
      sendMessage("generate_image", payload);
    });

    document
      .querySelector('[data-node-type="vae_tiling"]')
      .classList.toggle("active", state.generationState.vae_tiling);
    document
      .querySelector('[data-node-type="cpu_offload"]')
      .classList.toggle("active", state.generationState.cpu_offload);
  }

  async function loadPrompts() {
    try {
      const response = await fetch("/api/prompts");
      state.prompts = await response.json();
      populatePromptBook(state.prompts);
    } catch (error) {
      console.error("Error loading prompts:", error);
    }
  }

  function populatePromptBook(prompts) {
    ui.promptBook.grid.innerHTML = "";
    const hasPrompts = prompts.length > 0;
    ui.promptBook.placeholder.classList.toggle("hidden", hasPrompts);
    if (hasPrompts) {
      prompts.forEach((p, index) => {
        const item = document.createElement("div");
        item.className = "gallery-item";
        item.innerHTML = `<div class="prompt-item-content"><h4>${
          p.title
        }</h4><p><strong>Prompt:</strong> ${p.prompt}</p>${
          p.negative_prompt
            ? `<p><strong>Negative:</strong> ${p.negative_prompt}</p>`
            : ""
        }</div><div class="image-actions-overlay"><button class="image-action-btn" data-action="use" data-index="${index}" title="Use Prompt"><span class="material-symbols-outlined">add_task</span></button><button class="image-action-btn" data-action="edit" data-index="${index}" title="Edit Prompt"><span class="material-symbols-outlined">edit</span></button><button class="image-action-btn" data-action="delete" data-index="${index}" title="Delete Prompt"><span class="material-symbols-outlined">delete</span></button></div>`;
        ui.promptBook.grid.appendChild(item);
      });
    }
  }

  function handlePromptBookClick(e) {
    const button = e.target.closest(".image-action-btn");
    if (!button) return;
    const { action, index } = button.dataset;
    const prompt = state.prompts[index];

    if (action === "use") {
      const promptNode = state.nodes.get("prompt")?.el;
      if (!promptNode) return;
      state.generationState.prompt = prompt.prompt;
      state.generationState.negative_prompt = prompt.negative_prompt || "";
      const promptTextarea = promptNode.querySelector('[data-key="prompt"]');
      const negPromptTextarea = promptNode.querySelector(
        '[data-key="negative_prompt"]'
      );
      promptTextarea.value = prompt.prompt;
      negPromptTextarea.value = prompt.negative_prompt || "";
      promptTextarea.dispatchEvent(new Event("input", { bubbles: true }));
      negPromptTextarea.dispatchEvent(new Event("input", { bubbles: true }));
      ui.navLinks[0].click();
    } else if (action === "edit") {
      const { editor } = ui.promptBook;
      editor._oldTitle = prompt.title;
      editor.title.textContent = "Edit Prompt";
      editor.titleInput.value = prompt.title;
      editor.promptInput.value = prompt.prompt;
      editor.negativeInput.value = prompt.negative_prompt || "";
      editor.promptInput.dispatchEvent(new Event("input", { bubbles: true }));
      editor.negativeInput.dispatchEvent(new Event("input", { bubbles: true }));
      editor.overlay.classList.remove("hidden");
    } else if (action === "delete") {
      showDialog(
        "Confirm Deletion",
        `Delete prompt "<strong>${prompt.title}</strong>"?`,
        [
          { text: "Cancel" },
          {
            text: "Delete",
            class: "btn-danger",
            callback: () => deletePrompt(prompt.title),
          },
        ]
      );
    }
  }

  async function savePrompt() {
    const { editor } = ui.promptBook;
    const body = {
      old_title: editor._oldTitle,
      new_title: editor.titleInput.value,
      prompt: editor.promptInput.value,
      negative_prompt: editor.negativeInput.value,
    };
    try {
      const response = await fetch("/api/prompts", {
        method: editor._oldTitle ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if ((await response.json()).success) {
        editor.overlay.classList.add("hidden");
        loadPrompts();
      } else {
        showDialog("Error", "Failed to save prompt. Title may already exist.", [
          { text: "OK" },
        ]);
      }
    } catch (error) {
      console.error("Error saving prompt:", error);
    }
  }

  async function deletePrompt(title) {
    try {
      const response = await fetch("/api/prompts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if ((await response.json()).success) loadPrompts();
    } catch (error) {
      console.error("Error deleting prompt:", error);
    }
  }

  function setupEventListeners() {
    ui.themeToggle.addEventListener("click", toggleTheme);
    ui.restartBtn.addEventListener("click", () =>
      sendMessage("restart_backend")
    );
    ui.clearCacheBtn.addEventListener("click", () =>
      sendMessage("clear_cache")
    );

    document
      .querySelectorAll(".autoresize-textarea-wrapper textarea")
      .forEach((textarea) => {
        const wrapper = textarea.parentElement;
        wrapper.dataset.replicatedValue = textarea.value;
        textarea.addEventListener("input", () => {
          wrapper.dataset.replicatedValue = textarea.value;
        });
      });

    ui.navLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        ui.navLinks.forEach((l) => l.classList.remove("active"));
        link.classList.add("active");
        Object.values(ui.pages).forEach((p) => p.classList.add("hidden"));
        const targetPage = document.getElementById(
          `page-${link.dataset.target}`
        );
        if (targetPage) targetPage.classList.remove("hidden");
        if (link.dataset.target === "prompt-book") loadPrompts();
        if (link.dataset.target === "settings")
          sendMessage("get_settings_data");
      });
    });

    ui.gallery.refreshBtn.addEventListener("click", () =>
      fetch("/api/config")
        .then((r) => r.json())
        .then((c) => populateGallery(c.gallery_images.map((i) => i.filename)))
    );
    ui.settings.refreshModelsBtn.addEventListener("click", () =>
      sendMessage("get_settings_data")
    );
    ui.settings.refreshLorasBtn.addEventListener("click", () =>
      sendMessage("get_settings_data")
    );

    ui.lightbox.closeBtn.addEventListener("click", closeLightbox);
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
    ui.lightbox.deleteBtn.addEventListener("click", () => {
      const filename = state.galleryImages[state.currentLightboxIndex];
      showDialog("Confirm Deletion", `Delete <strong>${filename}</strong>?`, [
        { text: "Cancel" },
        {
          text: "Delete",
          class: "btn-danger",
          callback: () => sendMessage("delete_image", { filename }),
        },
      ]);
    });
    ui.lightbox.imageWrapper.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      state.isPanning = true;
      state.panStart = {
        x: e.clientX - state.panCurrent.x,
        y: e.clientY - state.panCurrent.y,
      };
      ui.lightbox.imageWrapper.style.cursor = "grabbing";
    });
    window.addEventListener("mousemove", (e) => {
      if (state.isPanning) {
        state.panCurrent = {
          x: e.clientX - state.panStart.x,
          y: e.clientY - state.panStart.y,
        };
        updateImageTransform();
      }
    });
    window.addEventListener("mouseup", () => {
      if (state.isPanning) {
        state.isPanning = false;
        ui.lightbox.imageWrapper.style.cursor = "grab";
      }
    });

    ui.promptBook.addBtn.addEventListener("click", () => {
      const { editor } = ui.promptBook;
      editor._oldTitle = null;
      editor.title.textContent = "Add New Prompt";
      editor.titleInput.value = "";
      editor.promptInput.value = "";
      editor.negativeInput.value = "";
      editor.promptInput.dispatchEvent(new Event("input", { bubbles: true }));
      editor.negativeInput.dispatchEvent(new Event("input", { bubbles: true }));
      editor.overlay.classList.remove("hidden");
    });
    ui.promptBook.refreshBtn.addEventListener("click", loadPrompts);
    ui.promptBook.grid.addEventListener("click", handlePromptBookClick);
    ui.promptBook.editor.buttons.innerHTML =
      '<button id="save-prompt-btn" class="btn btn-primary">Save</button><button id="cancel-prompt-btn" class="btn btn-secondary">Cancel</button>';
    document
      .getElementById("save-prompt-btn")
      .addEventListener("click", savePrompt);
    document
      .getElementById("cancel-prompt-btn")
      .addEventListener("click", () =>
        ui.promptBook.editor.overlay.classList.add("hidden")
      );
  }

  async function init() {
    initTheme();
    connectWebSocket();
    setupEventListeners();
    initCanvasInteraction();
    initDock();

    try {
      const response = await fetch("/api/config");
      const config = await response.json();
      populateGallery(config.gallery_images.map((img) => img.filename));
      createNode("model_sampler", 50, 50);
      createNode("prompt", 50, 350);
      createNode("parameters", 400, 50);
      createNode("image_preview", 750, 50);
    } catch (error) {
      console.error("Failed to fetch initial config:", error);
      showDialog(
        "Initialization Error",
        "Could not load configuration from the server.",
        [{ text: "OK" }]
      );
    }
  }

  init();
});
