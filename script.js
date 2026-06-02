const scenes = [
  {
    id: "kitchen",
    name: "晨光厨房台面",
    tag: "食品 / 家居 / 小家电",
    src: "assets/scenes/kitchen-counter.png",
    defaultPlacement: { x: 50, y: 63, scale: 75, rotate: 0, shadow: 35 },
  },
  {
    id: "spa",
    name: "高端护肤浴室台",
    tag: "美妆 / 个护 / 香氛",
    src: "assets/scenes/spa-vanity.png",
    defaultPlacement: { x: 50, y: 62, scale: 72, rotate: 0, shadow: 30 },
  },
  {
    id: "studio",
    name: "彩色棚拍展台",
    tag: "服饰 / 配饰 / 潮流单品",
    src: "assets/scenes/studio-pedestal.png",
    defaultPlacement: { x: 50, y: 61, scale: 78, rotate: 0, shadow: 38 },
  },
];

const sceneList = document.querySelector("#sceneList");
const sceneImage = document.querySelector("#sceneImage");
const sceneName = document.querySelector("#sceneName");
const productLayer = document.querySelector("#productLayer");
const artboard = document.querySelector("#artboard");
const productUpload = document.querySelector("#productUpload");
const dropZone = document.querySelector("#dropZone");
const placementHint = document.querySelector("#placementHint");
const statusText = document.querySelector("#statusText");
const scaleControl = document.querySelector("#scaleControl");
const rotateControl = document.querySelector("#rotateControl");
const shadowControl = document.querySelector("#shadowControl");
const resetProduct = document.querySelector("#resetProduct");
const fitButton = document.querySelector("#fitButton");
const frontButton = document.querySelector("#frontButton");
const qualitySelect = document.querySelector("#qualitySelect");
const apiEndpoint = document.querySelector("#apiEndpoint");
const promptText = document.querySelector("#promptText");
const generateButton = document.querySelector("#generateButton");
const exportButton = document.querySelector("#exportButton");
const exportCanvas = document.querySelector("#exportCanvas");
const aiResultCanvas = document.querySelector("#aiResultCanvas");
const generationMask = document.querySelector("#generationMask");
const draftViewButton = document.querySelector("#draftViewButton");
const resultViewButton = document.querySelector("#resultViewButton");

let activeScene = scenes[0];
let productImage = null;
let placement = { ...activeScene.defaultPlacement };
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let productZ = 2;
let hasAiResult = false;
let activeView = "draft";
let productDataUrl = "";

function renderSceneButtons() {
  sceneList.innerHTML = "";
  scenes.forEach((scene) => {
    const button = document.createElement("button");
    button.className = "scene-card";
    button.type = "button";
    button.setAttribute("aria-pressed", String(scene.id === activeScene.id));
    button.innerHTML = `
      <img src="${scene.src}" alt="">
      <span>
        <strong>${scene.name}</strong>
        <span>${scene.tag}</span>
      </span>
    `;
    button.addEventListener("click", () => setScene(scene));
    sceneList.appendChild(button);
  });
}

function setScene(scene) {
  activeScene = scene;
  sceneImage.src = scene.src;
  sceneName.textContent = scene.name;
  if (!productImage) {
    placement = { ...scene.defaultPlacement };
  }
  hasAiResult = false;
  setView("draft");
  renderSceneButtons();
  updateProduct();
  updatePrompt();
}

function updateProduct() {
  productLayer.style.left = `${placement.x}%`;
  productLayer.style.top = `${placement.y}%`;
  productLayer.style.width = `${placement.scale}%`;
  productLayer.style.transform = `translate(-50%, -50%) rotate(${placement.rotate}deg)`;
  productLayer.style.filter = `drop-shadow(0 ${Math.round(placement.shadow * 0.7)}px ${Math.round(
    placement.shadow
  )}px rgba(0, 0, 0, ${Math.min(0.42, placement.shadow / 120)}))`;
  productLayer.style.zIndex = productZ;
  scaleControl.value = placement.scale;
  rotateControl.value = placement.rotate;
  shadowControl.value = placement.shadow;
  updatePrompt();
}

function loadProduct(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    productImage = new Image();
    productImage.onload = () => {
      productLayer.src = reader.result;
      productDataUrl = reader.result;
      productLayer.style.display = "block";
      placementHint.style.display = "none";
      statusText.textContent = "调整构图后生成 AI 图";
      placement = { ...activeScene.defaultPlacement };
      hasAiResult = false;
      setView("draft");
      generateButton.disabled = false;
      exportButton.disabled = false;
      updateProduct();
    };
    productImage.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function updatePrompt() {
  const qualityLabel = qualitySelect.options[qualitySelect.selectedIndex]?.textContent || "保留商品细节";
  promptText.value = [
    `将用户上传的商品自然合成到「${activeScene.name}」场景中。`,
    `保持商品主体、包装文字、logo、颜色和比例准确，不要改变商品身份。`,
    `参考草稿位置：水平 ${Math.round(placement.x)}%，垂直 ${Math.round(placement.y)}%，尺寸 ${Math.round(
      placement.scale
    )}%，旋转 ${Math.round(placement.rotate)} 度。`,
    `重绘合理的接触阴影、环境反光、景深、透视和边缘融合，让商品像真实拍摄在该场景中。`,
    `输出风格：${qualityLabel}，电商详情页可用，画面干净，无额外文字、无水印。`,
  ].join("\n");
}

function setView(view) {
  activeView = view;
  artboard.classList.toggle("show-result", view === "result" && hasAiResult);
  draftViewButton.classList.toggle("is-active", view === "draft");
  resultViewButton.classList.toggle("is-active", view === "result");
}

function pointerToPercent(event) {
  const rect = artboard.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 100,
    y: ((event.clientY - rect.top) / rect.height) * 100,
  };
}

productUpload.addEventListener("change", (event) => {
  loadProduct(event.target.files[0]);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  });
});

dropZone.addEventListener("drop", (event) => {
  loadProduct(event.dataTransfer.files[0]);
});

productLayer.addEventListener("pointerdown", (event) => {
  if (!productImage) return;
  isDragging = true;
  productLayer.setPointerCapture(event.pointerId);
  productLayer.classList.add("is-dragging");
  const point = pointerToPercent(event);
  dragOffset = {
    x: point.x - placement.x,
    y: point.y - placement.y,
  };
});

productLayer.addEventListener("pointermove", (event) => {
  if (!isDragging) return;
  const point = pointerToPercent(event);
  placement.x = Math.max(0, Math.min(100, point.x - dragOffset.x));
  placement.y = Math.max(0, Math.min(100, point.y - dragOffset.y));
  updateProduct();
});

productLayer.addEventListener("pointerup", (event) => {
  isDragging = false;
  productLayer.releasePointerCapture(event.pointerId);
  productLayer.classList.remove("is-dragging");
});

scaleControl.addEventListener("input", () => {
  placement.scale = Number(scaleControl.value);
  hasAiResult = false;
  setView("draft");
  updateProduct();
});

rotateControl.addEventListener("input", () => {
  placement.rotate = Number(rotateControl.value);
  hasAiResult = false;
  setView("draft");
  updateProduct();
});

shadowControl.addEventListener("input", () => {
  placement.shadow = Number(shadowControl.value);
  hasAiResult = false;
  setView("draft");
  updateProduct();
});

resetProduct.addEventListener("click", () => {
  placement = { ...activeScene.defaultPlacement };
  hasAiResult = false;
  setView("draft");
  updateProduct();
});

fitButton.addEventListener("click", () => {
  placement = { ...activeScene.defaultPlacement, scale: Math.min(92, activeScene.defaultPlacement.scale + 8) };
  hasAiResult = false;
  setView("draft");
  updateProduct();
});

frontButton.addEventListener("click", () => {
  productZ = productZ === 2 ? 4 : 2;
  frontButton.textContent = productZ === 4 ? "回到中景" : "置于前景";
  updateProduct();
});

qualitySelect.addEventListener("change", updatePrompt);

function drawCover(ctx, image, width, height) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  if (imageRatio > canvasRatio) {
    drawHeight = height;
    drawWidth = height * imageRatio;
  } else {
    drawWidth = width;
    drawHeight = width / imageRatio;
  }
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function exportImage() {
  const ctx = exportCanvas.getContext("2d");
  const width = exportCanvas.width;
  const height = exportCanvas.height;
  ctx.clearRect(0, 0, width, height);

  if (hasAiResult && activeView === "result") {
    ctx.drawImage(aiResultCanvas, 0, 0, width, height);
  } else {
    drawDraftComposite(ctx, width, height);
  }

  const link = document.createElement("a");
  link.download = `AI商品详情图-${activeScene.id}.png`;
  link.href = exportCanvas.toDataURL("image/png");
  link.click();
  statusText.textContent = "已导出 PNG";
}

function drawDraftComposite(ctx, width, height) {
  drawCover(ctx, sceneImage, width, height);

  if (productImage) {
    const scaleBase = width * (placement.scale / 100);
    const productRatio = productImage.naturalHeight / productImage.naturalWidth;
    const drawWidth = scaleBase;
    const drawHeight = scaleBase * productRatio;
    const x = width * (placement.x / 100);
    const y = height * (placement.y / 100);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((placement.rotate * Math.PI) / 180);
    ctx.shadowColor = `rgba(0, 0, 0, ${Math.min(0.42, placement.shadow / 120)})`;
    ctx.shadowBlur = placement.shadow;
    ctx.shadowOffsetY = placement.shadow * 0.7;
    ctx.drawImage(productImage, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  }
}

function drawVignette(ctx, width, height) {
  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.5, width * 0.18, width * 0.5, height * 0.55, width);
  gradient.addColorStop(0, "rgba(255,255,255,0.05)");
  gradient.addColorStop(1, "rgba(20,24,28,0.18)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawContactShadow(ctx, width, height) {
  const x = width * (placement.x / 100);
  const y = height * (placement.y / 100);
  const shadowWidth = width * (placement.scale / 100) * 0.72;
  const shadowHeight = shadowWidth * 0.17;
  const gradient = ctx.createRadialGradient(x, y + shadowHeight * 0.55, shadowWidth * 0.05, x, y + shadowHeight * 0.55, shadowWidth * 0.58);
  gradient.addColorStop(0, "rgba(0,0,0,0.28)");
  gradient.addColorStop(0.55, "rgba(0,0,0,0.11)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");

  ctx.save();
  ctx.translate(x, y + shadowHeight * 0.85);
  ctx.rotate((placement.rotate * Math.PI) / 360);
  ctx.scale(1, 0.32);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, shadowWidth * 0.56, shadowHeight, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAiProduct(ctx, width, height) {
  const scaleBase = width * (placement.scale / 100);
  const productRatio = productImage.naturalHeight / productImage.naturalWidth;
  const drawWidth = scaleBase;
  const drawHeight = scaleBase * productRatio;
  const x = width * (placement.x / 100);
  const y = height * (placement.y / 100);
  const quality = qualitySelect.value;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((placement.rotate * Math.PI) / 180);
  ctx.shadowColor = quality === "catalog" ? "rgba(0, 0, 0, 0.22)" : "rgba(0, 0, 0, 0.34)";
  ctx.shadowBlur = quality === "creative" ? placement.shadow * 1.35 : placement.shadow * 1.05;
  ctx.shadowOffsetY = placement.shadow * 0.62;
  ctx.drawImage(productImage, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

  ctx.globalCompositeOperation = "source-atop";
  const sheen = ctx.createLinearGradient(-drawWidth / 2, -drawHeight / 2, drawWidth / 2, drawHeight / 2);
  sheen.addColorStop(0, "rgba(255,255,255,0.16)");
  sheen.addColorStop(0.42, "rgba(255,255,255,0.02)");
  sheen.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = sheen;
  ctx.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

function drawSceneColorGrade(ctx, width, height) {
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = activeScene.id === "studio" ? "rgba(212, 91, 117, 0.16)" : "rgba(15, 140, 127, 0.09)";
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

async function requestAiComposite() {
  const endpoint = apiEndpoint.value.trim();
  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productImage: productDataUrl,
        sceneId: activeScene.id,
        prompt: promptText.value,
        quality: qualitySelect.value,
        placement,
        output: { width: aiResultCanvas.width, height: aiResultCanvas.height },
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `AI 接口请求失败：HTTP ${response.status}`);
    }

    if (!result.image) {
      throw new Error("AI 接口没有返回 image 字段。");
    }

    await drawGeneratedImage(result.image);
    return result.image;
  }

  return drawBrowserComposite();
}

function drawGeneratedImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const ctx = aiResultCanvas.getContext("2d");
      ctx.clearRect(0, 0, aiResultCanvas.width, aiResultCanvas.height);
      ctx.drawImage(image, 0, 0, aiResultCanvas.width, aiResultCanvas.height);
      resolve();
    };
    image.onerror = reject;
    image.src = src;
  });
}

function drawBrowserComposite() {
  const ctx = aiResultCanvas.getContext("2d");
  const width = aiResultCanvas.width;
  const height = aiResultCanvas.height;
  ctx.clearRect(0, 0, width, height);

  drawCover(ctx, sceneImage, width, height);
  drawContactShadow(ctx, width, height);
  drawAiProduct(ctx, width, height);
  drawSceneColorGrade(ctx, width, height);
  drawVignette(ctx, width, height);

  return aiResultCanvas.toDataURL("image/png");
}

async function generateAiImage() {
  if (!productImage) {
    statusText.textContent = "请先上传商品图";
    return;
  }

  generateButton.disabled = true;
  exportButton.disabled = true;
  artboard.classList.add("is-generating");
  statusText.textContent = "AI 合成中";

  await new Promise((resolve) => setTimeout(resolve, 900));
  try {
    await requestAiComposite();
    hasAiResult = true;
    setView("result");
    statusText.textContent = "AI 结果已生成";
  } catch (error) {
    hasAiResult = false;
    setView("draft");
    statusText.textContent = error.message || "AI 合成失败";
    alert(error.message || "AI 合成失败");
  } finally {
    artboard.classList.remove("is-generating");
    generateButton.disabled = false;
    exportButton.disabled = false;
  }
}

draftViewButton.addEventListener("click", () => setView("draft"));

resultViewButton.addEventListener("click", () => {
  if (hasAiResult) {
    setView("result");
  } else {
    statusText.textContent = "请先生成 AI 图";
  }
});

generateButton.addEventListener("click", generateAiImage);

exportButton.disabled = true;
generateButton.disabled = true;

exportButton.addEventListener("click", exportImage);

setScene(activeScene);
