# SceneCraft AI 商品详情图生成器

上传商品图、选择场景、调整构图后，通过阿里云百炼 DashScope / 通义万相图像编辑模型生成真实融合的商品详情图。

## 本地运行

1. 准备 Node.js 20+
2. 复制环境变量文件：

```bash
cp .env.example .env
```

3. 在 `.env` 中填入阿里云百炼 API Key：

```bash
DASHSCOPE_API_KEY=sk-your-dashscope-api-key
DASHSCOPE_IMAGE_MODEL=wan2.5-i2i-preview
DASHSCOPE_API_BASE=https://dashscope.aliyuncs.com/api/v1
DASHSCOPE_IMAGE_SIZE=1080*1350
DASHSCOPE_POLL_ATTEMPTS=36
DASHSCOPE_POLL_INTERVAL_MS=5000
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
  "productImage": "data:image/jpeg;base64,...",
  "draftImage": "data:image/jpeg;base64,...",
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
  "model": "wan2.5-i2i-preview",
  "provider": "dashscope",
  "requestId": ""
}
```

## 阿里云香港服务器上线

推荐选择阿里云香港 ECS 或轻量应用服务器。香港节点通常不需要大陆 ICP 备案，也更适合对外访问；AI 模型接口使用阿里云百炼 DashScope。

### 1. 服务器准备

建议配置：

```text
地域：香港
系统：Ubuntu 22.04 LTS
规格：2 核 2G 起步
端口：开放 80、443、22
```

### 2. 安装运行环境

```bash
sudo apt update
sudo apt install -y git curl nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 3. 拉取代码

```bash
cd /opt
sudo git clone https://github.com/quik76456-svg/-ai.git scenecraft
sudo chown -R $USER:$USER /opt/scenecraft
cd /opt/scenecraft
```

### 4. 配置环境变量

```bash
cp .env.example .env
nano .env
```

填入：

```bash
DASHSCOPE_API_KEY=你的阿里云百炼APIKey
DASHSCOPE_IMAGE_MODEL=wan2.5-i2i-preview
DASHSCOPE_API_BASE=https://dashscope.aliyuncs.com/api/v1
DASHSCOPE_IMAGE_SIZE=1080*1350
DASHSCOPE_POLL_ATTEMPTS=36
DASHSCOPE_POLL_INTERVAL_MS=5000
PORT=3000
```

### 5. 启动服务

```bash
npm start
```

确认可访问后，按 `Ctrl+C` 退出，再用 PM2 后台运行：

```bash
pm2 start server.js --name scenecraft
pm2 save
pm2 startup
```

执行 `pm2 startup` 输出的那条 `sudo ...` 命令。

### 6. 配置 Nginx

创建配置：

```bash
sudo nano /etc/nginx/sites-available/scenecraft
```

写入，把 `your-domain.com` 换成你的域名；如果暂时没有域名，也可以先用服务器公网 IP 访问：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用：

```bash
sudo ln -s /etc/nginx/sites-available/scenecraft /etc/nginx/sites-enabled/scenecraft
sudo nginx -t
sudo systemctl reload nginx
```

### 7. HTTPS

有域名后安装证书：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 注意

- 请从 `http://服务器IP`、`https://你的域名` 或 `http://localhost:3000` 访问，不要用 `file://` 打开 `index.html`。
- 前端默认必须调用真实 `/api/compose`。如果接口失败，会显示错误，不会冒充 AI 结果。
- 商品图建议小于 12MB，PNG/JPG/WebP 均可。
- 不要把真实 `DASHSCOPE_API_KEY` 写入仓库，必须放在服务器 `.env` 或云平台环境变量里。
- 如果使用大陆地域服务器并绑定域名，通常需要 ICP 备案；香港服务器通常不需要大陆备案。
