# SceneCraft AI 商品详情图生成器

上传商品图、选择场景、调整构图后，通过 OpenAI Image API 生成真实融合的商品详情图。

## 本地运行

1. 准备 Node.js 20+
2. 复制环境变量文件：

```bash
cp .env.example .env
```

3. 在 `.env` 中填入：

```bash
OPENAI_API_KEY=sk-your-api-key
OPENAI_IMAGE_MODEL=gpt-image-2
PORT=3000
```

4. 启动：

```bash
npm start
```

5. 打开：

```text
http://localhost:3000
```

## API

`POST /api/compose`

请求体：

```json
{
  "productImage": "data:image/png;base64,...",
  "sceneId": "kitchen",
  "prompt": "将用户上传的商品自然合成到场景中...",
  "quality": "detail",
  "placement": { "x": 50, "y": 63, "scale": 75, "rotate": 0, "shadow": 35 }
}
```

响应：

```json
{
  "image": "data:image/png;base64,...",
  "model": "gpt-image-2",
  "revisedPrompt": ""
}
```

## 上线

这个项目是零依赖 Node 服务，可以部署到 Render、Railway、Fly.io、云服务器或 Docker 平台。推荐 Render 或 Railway，因为它们都可以直接从 Git 仓库部署，并在后台配置 `OPENAI_API_KEY`。

生产环境需要配置：

```bash
OPENAI_API_KEY=sk-your-api-key
OPENAI_IMAGE_MODEL=gpt-image-2
PORT=3000
```

启动命令：

```bash
npm start
```

### Render 上线

1. 把本项目推送到 GitHub/GitLab
2. 在 Render 选择 `New` -> `Blueprint`
3. 选择这个仓库
4. Render 会读取 `render.yaml`
5. 在环境变量里填入 `OPENAI_API_KEY`
6. 部署完成后访问 Render 分配的域名

Render 会使用：

```text
startCommand: npm start
healthCheckPath: /healthz
```

### Railway 上线

1. 把本项目推送到 GitHub
2. 在 Railway 选择 `New Project` -> `Deploy from GitHub repo`
3. 选择这个仓库
4. Railway 会读取 `railway.json` 和 `Dockerfile`
5. 在 Variables 里添加 `OPENAI_API_KEY`
6. 部署完成后生成 Public Domain

### Docker 上线

```bash
docker build -t scenecraft-ai-composer .
docker run -p 3000:3000 \
  -e OPENAI_API_KEY=sk-your-api-key \
  -e OPENAI_IMAGE_MODEL=gpt-image-2 \
  scenecraft-ai-composer
```

## 注意

- 请从 `http://localhost:3000` 或线上域名访问，不要用 `file://` 打开 `index.html`，否则浏览器无法调用 `/api/compose`。
- 前端默认必须调用真实 `/api/compose`。如果接口失败，会显示错误，不会冒充 AI 结果。
- 商品图建议小于 12MB，PNG/JPG/WebP 均可。
- 不要把真实 `OPENAI_API_KEY` 写入仓库，必须放在云平台环境变量里。
