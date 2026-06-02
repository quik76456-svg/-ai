import { createReadStream, existsSync, readFileSync, promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = __dirname;

loadEnvFile();

const port = Number(process.env.PORT || 3000);
const maxBodyBytes = 18 * 1024 * 1024;

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

function dataUrlToDashScopeImage(dataUrl, label) {
  const match = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i.exec(dataUrl || "");
  if (!match) {
    throw Object.assign(new Error(`${label} 必须是 PNG、JPG 或 WebP 图片。`), { statusCode: 400 });
  }

  return `data:${match[1].toLowerCase()};base64,${match[2]}`;
}

function buildPrompt({ prompt, quality, placement, sceneId }) {
  const qualityText = {
    detail: "优先保留商品细节、包装文字、logo、颜色、材质和比例",
    creative: "增强场景氛围，但商品主体必须真实且不变形",
    catalog: "生成干净清晰的电商详情页图片，商品辨识度高",
  }[quality || "detail"];

  return [
    prompt,
    "",
    "第一张图是商品参考图，第二张图是用户已摆放好的构图草稿。",
    "请以第二张图的场景、位置、大小和大致构图为准，将商品真实融合到场景中。",
    `Scene id: ${sceneId}. Placement guide: x=${Math.round(placement?.x || 50)}%, y=${Math.round(
      placement?.y || 60
    )}%, scale=${Math.round(placement?.scale || 75)}%, rotation=${Math.round(placement?.rotate || 0)} degrees.`,
    `生成方向：${qualityText}。`,
    "保持商品形状、标签文字、品牌标识、颜色、包装比例和可见细节，不要替换成其它商品。",
    "重绘真实透视、接触阴影、环境反光、边缘融合、景深和场景光照，让商品像真实拍摄在该场景中。",
    "不要添加无关道具、人物、水印、说明文字、标题或额外 logo。",
  ].join("\n");
}

async function imageUrlToDataUrl(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw Object.assign(new Error(`无法下载模型生成图片：HTTP ${response.status}`), { statusCode: 502 });
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0] || "image/png";
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function extractDashScopeImageUrl(result) {
  return (
    result.output?.choices?.[0]?.message?.content?.find?.((item) => item.image)?.image ||
    result.output?.results?.[0]?.url ||
    result.output?.results?.[0]?.image ||
    result.output?.image_url ||
    result.output?.url
  );
}

async function composeWithDashScope(payload) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("服务端缺少 DASHSCOPE_API_KEY。请在阿里云环境变量中配置后重启服务。"), { statusCode: 500 });
  }

  const productImage = dataUrlToDashScopeImage(payload.productImage, "商品参考图");
  const draftImage = dataUrlToDashScopeImage(payload.draftImage, "构图草稿图");
  const baseUrl = (process.env.DASHSCOPE_API_BASE || "https://dashscope.aliyuncs.com/api/v1").replace(/\/$/, "");
  const endpoint = `${baseUrl}/services/aigc/image2image/image-synthesis`;

  const createResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: process.env.DASHSCOPE_IMAGE_MODEL || "wan2.5-i2i-preview",
      input: {
        prompt: buildPrompt(payload),
        images: [
          productImage,
          draftImage,
        ],
        negative_prompt: "低清晰度，变形商品，错误文字，多余文字，水印，人物，额外道具，错误logo，错误包装，模糊边缘",
      },
      parameters: {
        n: 1,
        size: process.env.DASHSCOPE_IMAGE_SIZE || "1080*1350",
        prompt_extend: false,
        watermark: false,
      },
    }),
  });

  const createResult = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok) {
    const message =
      createResult.message ||
      createResult.error?.message ||
      createResult.output?.message ||
      `通义万相任务创建失败：HTTP ${createResponse.status}`;
    throw Object.assign(new Error(message), { statusCode: createResponse.status });
  }

  const taskId = createResult.output?.task_id;
  if (!taskId) {
    throw Object.assign(new Error("通义万相没有返回 task_id。"), { statusCode: 502 });
  }

  const result = await pollDashScopeTask(baseUrl, apiKey, taskId);
  const imageUrl = extractDashScopeImageUrl(result);
  if (!imageUrl) {
    throw Object.assign(new Error("通义万相没有返回图片地址。"), { statusCode: 502 });
  }

  const image = imageUrl.startsWith("data:") ? imageUrl : await imageUrlToDataUrl(imageUrl);
  return {
    image,
    model: process.env.DASHSCOPE_IMAGE_MODEL || "wan2.5-i2i-preview",
    provider: "dashscope",
    requestId: result.request_id || createResult.request_id || "",
    taskId,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollDashScopeTask(baseUrl, apiKey, taskId) {
  const maxAttempts = Number(process.env.DASHSCOPE_POLL_ATTEMPTS || 36);
  const intervalMs = Number(process.env.DASHSCOPE_POLL_INTERVAL_MS || 5000);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await wait(intervalMs);

    const response = await fetch(`${baseUrl}/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = result.message || result.output?.message || `通义万相任务查询失败：HTTP ${response.status}`;
      throw Object.assign(new Error(message), { statusCode: response.status });
    }

    const status = result.output?.task_status;
    if (status === "SUCCEEDED") return result;
    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
      const message = result.output?.message || result.message || `通义万相任务失败：${status}`;
      throw Object.assign(new Error(message), { statusCode: 502 });
    }
  }

  throw Object.assign(new Error("通义万相生成超时，请稍后重试。"), { statusCode: 504 });
}

async function handleCompose(request, response) {
  try {
    const payload = await readJsonBody(request);
    const result = await composeWithDashScope(payload);
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
