# GitHub + Vercel 部署工作流

这个项目适合用一个 GitHub 仓库承载统一代码，并用一个 Vercel 项目部署 Next.js 门户。

线上项目：

- GitHub：`liminbo25/amazon-atlas-os`
- Vercel：https://amazon-atlas-os.vercel.app

## Vercel 配置

Framework Preset 保持 `Next.js`。常用环境变量：

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_MODEL`
- `SELLERSPRITE_SECRET_KEY`
- `GEMINI_API_KEY`
- `GEMINI_API_BASE_URL`
- `REPLICATE_API_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_TRANSCRIBE_MODEL`
- `VIDEO_OUTPUT_ROOT`
- `VIDEO_MAX_UPLOAD_MB`

`NEXT_PUBLIC_VIDEO_API_BASE_URL` 不再是默认必需项。只有临时切回旧 `video-backend/` FastAPI 服务时才设置它。

## 视频模块部署说明

视频工坊默认走项目内 Next.js API：

- `/api/video-studio/models`
- `/api/video-studio/generation/tasks`
- `/api/video-studio/upload-video`
- `/api/video-studio/generate-copy`

抽帧依赖 npm 包 `ffmpeg-static` 和 `ffprobe-static`，不用单独启动 Python 服务。音频转写依赖 `OPENAI_API_KEY`；未配置时视频上传仍会返回关键帧和基础 manifest，脚本区可以手动补字幕后继续。

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
