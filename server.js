import { createReadStream, existsSync, readFileSync, promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = __dirname;

loadEnvFile();

const port = Number(process.env.PORT || 3000);
const maxBodyBytes = 18 * 1024 * 1024;

const sceneFiles = {
  kitchen: "assets/scenes/kitchen-counter.png",
  spa: "assets/scenes/spa-vanity.png",
  studio: "assets/scenes/studio-pedestal.png",
};

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(Object.assign(new Error("上传图片太大，请压缩到 12MB 以内。"), { statusCode: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("请求体不是有效 JSON。"), { statusCode: 400 }));
      }
    });

    request.on("error", reject);
  });
}

function dataUrlToFile(dataUrl, filename) {
  const match = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i.exec(dataUrl || "");
  if (!match) {
    throw Object.assign(new Error("请上传 PNG、JPG 或 WebP 商品图。"), { statusCode: 400 });
  }

  const bytes = Buffer.from(match[2], "base64");
  const mimeType = match[1].toLowerCase();
  return new File([bytes], filename, { type: mimeType });
}

async function localImageToFile(relativePath, filename) {
  const fullPath = path.join(publicRoot, relativePath);
  const bytes = await fs.readFile(fullPath);
  return new File([bytes], filename, { type: "image/png" });
}

function buildPrompt({ prompt, quality, placement, sceneId }) {
  const qualityText = {
    detail: "prioritize exact product identity, readable packaging text, original color, material, and logo fidelity",
    creative: "increase lifestyle atmosphere while keeping the product realistic and unmodified",
    catalog: "create a clean ecommerce catalog/detail-page result with clear product visibility",
  }[quality || "detail"];

  return [
    prompt,
    "",
    "Use image 1 as the exact product reference and image 2 as the scene/background reference.",
    "Create one final photorealistic ecommerce product detail image where the product is naturally placed inside the scene.",
    `Scene id: ${sceneId}. Placement guide: x=${Math.round(placement?.x || 50)}%, y=${Math.round(
      placement?.y || 60
    )}%, scale=${Math.round(placement?.scale || 75)}%, rotation=${Math.round(placement?.rotate || 0)} degrees.`,
    `Quality direction: ${qualityText}.`,
    "Preserve the product shape, label text, brand marks, color, package proportions, and visible details.",
    "Rebuild realistic perspective, contact shadow, ambient reflection, edge blending, depth of field, and scene lighting.",
    "Do not add unrelated props, people, watermarks, captions, labels, or extra text.",
  ].join("\n");
}

async function composeWithOpenAI(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("服务端缺少 OPENAI_API_KEY。请配置环境变量后重启服务。"), { statusCode: 500 });
  }

  const scenePath = sceneFiles[payload.sceneId];
  if (!scenePath) {
    throw Object.assign(new Error("未知场景。"), { statusCode: 400 });
  }

  const productFile = dataUrlToFile(payload.productImage, "product.png");
  const sceneFile = await localImageToFile(scenePath, "scene.png");
  const form = new FormData();
  form.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-2");
  form.append("image[]", productFile);
  form.append("image[]", sceneFile);
  form.append("prompt", buildPrompt(payload));
  form.append("size", "1024x1536");
  form.append("quality", payload.quality === "creative" ? "high" : "medium");
  form.append("background", "opaque");
  form.append("output_format", "png");

  const openaiResponse = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const result = await openaiResponse.json().catch(() => ({}));
  if (!openaiResponse.ok) {
    const message = result.error?.message || `OpenAI 图片生成失败：HTTP ${openaiResponse.status}`;
    throw Object.assign(new Error(message), { statusCode: openaiResponse.status });
  }

  const imageBase64 = result.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw Object.assign(new Error("OpenAI 没有返回图片数据。"), { statusCode: 502 });
  }

  return {
    image: `data:image/png;base64,${imageBase64}`,
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    revisedPrompt: result.data?.[0]?.revised_prompt || "",
  };
}

async function handleCompose(request, response) {
  try {
    const payload = await readJsonBody(request);
    const result = await composeWithOpenAI(payload);
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      error: error.message || "AI 合成失败。",
    });
  }
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const requestedPath = path.normalize(path.join(publicRoot, pathname));

  if (!requestedPath.startsWith(publicRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(requestedPath);
    if (!stat.isFile()) throw new Error("Not a file");

    const ext = path.extname(requestedPath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
    });
    createReadStream(requestedPath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && request.url === "/api/compose") {
    handleCompose(request, response);
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(request, response);
    return;
  }

  response.writeHead(405, { Allow: "GET, HEAD, POST" });
  response.end("Method not allowed");
});

server.listen(port, () => {
  console.log(`SceneCraft is running at http://localhost:${port}`);
});
