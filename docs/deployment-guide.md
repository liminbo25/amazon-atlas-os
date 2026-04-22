# GitHub + Vercel 部署工作流

这个项目适合用一个 GitHub 仓库承载统一代码，并用一个 Vercel 项目部署 Next.js 门户。

线上项目：

- GitHub：`liminbo25/amazon-atlas-os`
- Vercel：https://amazon-atlas-os.vercel.app

## Vercel 配置

Framework Preset 保持 `Next.js`。常用环境变量：

- `AI_PROVIDER`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_MODEL`
- `SELLERSPRITE_SECRET_KEY`
- `GEMINI_API_KEY`
- `GEMINI_API_BASE_URL`
- `FASHN_API_KEY`
- `FASHN_API_BASE_URL`
- `FASHN_MODEL`
- `FASHN_GENERATION_MODE`
- `FASHN_RESOLUTION`
- `FASHN_OUTPUT_FORMAT`
- `REPLICATE_API_TOKEN`
- `BLOB_READ_WRITE_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_TRANSCRIBE_API_KEY`
- `OPENAI_TRANSCRIBE_BASE_URL`
- `OPENAI_TRANSCRIBE_MODEL`
- `VIDEO_OUTPUT_ROOT`
- `VIDEO_MAX_UPLOAD_MB`

Image Studio now uploads original images to Vercel Blob and writes generated outputs back to Blob URLs, so `BLOB_READ_WRITE_TOKEN` is required for the image module in production.

If `FASHN_API_KEY` is configured, the try-on flow will switch to FASHN Try-On Max with the configured `generation mode / resolution / output format` and the frontend will poll the async task status automatically. If it is not configured yet, the page will keep falling back to the existing Gemini try-on route.

`NEXT_PUBLIC_VIDEO_API_BASE_URL` 不再是默认必需项。只有临时切回旧 `video-backend/` FastAPI 服务时才设置它。

### 使用本地 OpenAI-compatible 网关作为线上默认 LLM

如果你的主 LLM 运行在本机，例如 `http://127.0.0.1:8317/v1`，Vercel 线上函数无法直接访问这个地址。可行做法是：

1. 在本机启动一个公网 HTTPS 隧道，把 `127.0.0.1:8317` 暴露出去。
2. 将 Vercel 的 `AI_PROVIDER` 设为 `openai`。
3. 将 `OPENAI_BASE_URL` 设为隧道暴露出的公网地址。
4. 将 `OPENAI_API_KEY` 设为该网关所需的 key。
5. 将 `OPENAI_MODEL` 设为 `gpt-5.4`。

推荐把视频音频转写保持独立：

- `OPENAI_TRANSCRIBE_BASE_URL=https://api.openai.com`
- `OPENAI_TRANSCRIBE_API_KEY=<你的转写 key>`
- `OPENAI_TRANSCRIBE_MODEL=whisper-1`

这样 Listing、多源分析、视频关键帧分析、视频脚本生成会走你的 `gpt-5.4` 网关，而图片生成、视频生成、音频转写仍可保留原有供应商。

## 视频模块部署说明

视频工坊默认走项目内 Next.js API：

- `/api/video-studio/models`
- `/api/video-studio/generation/tasks`
- `/api/video-studio/upload-video`
- `/api/video-studio/generate-copy`

抽帧依赖 npm 包 `ffmpeg-static` 和 `ffprobe-static`，不用单独启动 Python 服务。音频转写优先读取 `OPENAI_TRANSCRIBE_API_KEY` / `OPENAI_TRANSCRIBE_BASE_URL`；只有未单独指定 `OPENAI_TRANSCRIBE_BASE_URL` 时才会回退到 `OPENAI_API_KEY` / `OPENAI_BASE_URL`。如果转写凭证最终仍未配置，视频上传仍会返回关键帧和基础 manifest，脚本区可以手动补字幕后继续。

Vercel serverless 文件系统只适合作为临时输出目录。若视频任务需要长期保存关键帧、上传素材或真实生成结果，后续应接对象存储或数据库。

## 旧 FastAPI fallback

`video-backend/` 仍保留在仓库中，方便本地对照或临时回退：

```powershell
npm run dev:video-backend
```

然后在本地 `.env.local` 设置：

```env
NEXT_PUBLIC_VIDEO_API_BASE_URL=http://127.0.0.1:8000
```

设置该变量后，视频页面会优先调用旧服务；移除后恢复使用 Next.js API。

## 常用命令

```powershell
npm run dev
npm run lint
npm run build
```

提交和推送仍由本地 git 流程控制；本次迁移不需要自动 push。
