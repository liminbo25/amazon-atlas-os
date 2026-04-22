# Amazon Atlas OS

统一的亚马逊运营门户，当前整合 3 个模块：

- `图片工坊`：服装图 + 模特图批量试穿，支持超分增强。
- `Listing 工坊`：竞品分析、VOC 洞察、文案生成和导出。
- `视频工坊`：视频上传拆解、脚本改写、视频生成任务编排。

## 目录结构

- `app/`：Next.js 页面与同域 API 路由。
- `components/`：跨模块 UI 与业务组件。
- `lib/`：状态、工具函数、AI 路由助手和视频服务层。
- `video-backend/`：旧 FastAPI 视频后端，保留为 legacy fallback，不再是默认依赖。
- `docs/`：部署和模块说明。

## 本地启动

```powershell
cd "D:\亚马逊总工具"
npm install
npm run dev
```

复制 `.env.example` 为 `.env.local`，按需填写：

- `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL`：图片分析、Listing 生成、视频关键帧分析和脚本生成可使用。
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_TRANSCRIBE_MODEL`：视频音频转写使用；未配置时仍可上传抽帧，并可手动补字幕后生成脚本。
- `SELLERSPRITE_SECRET_KEY`：竞品/关键词分析。
- `GEMINI_API_KEY` / `GEMINI_API_BASE_URL`：图片生成。
- `GEMINI_IMAGE_MODEL` supports `nano_banana_pro` and `image2`; `image2` defaults to `https://api.yijiarj.cn/v1/chat/completions` and can be overridden with `GEMINI_IMAGE2_API_BASE_URL`.
- `REPLICATE_API_TOKEN`：图片超分增强。
- `VIDEO_OUTPUT_ROOT` / `VIDEO_MAX_UPLOAD_MB`：视频上传、关键帧和任务文件的本地输出目录与上传大小上限。

`NEXT_PUBLIC_VIDEO_API_BASE_URL` 现在只是可选 legacy fallback。默认留空即可使用项目内 `/api/video-studio/...` 路由；只有想临时切回旧 FastAPI 服务时才需要设置。

## 视频模块

视频模块已迁移为默认走 Next.js API：

- `GET /api/video-studio/models`
- `POST /api/video-studio/generation/tasks`
- `GET /api/video-studio/generation/tasks/:taskId`
- `POST /api/video-studio/upload-video`
- `POST /api/video-studio/generate-copy`

抽帧依赖 `ffmpeg-static` / `ffprobe-static`，脚本生成复用项目内统一 AI 配置。真实 Runway / Kling / Veo 供应商提交层仍是预留任务结构，尚未接入真实视频生成 API。

## 部署

项目已适配 GitHub + Vercel 的统一 Next.js 部署路径。Vercel 上的视频上传产物默认写入 serverless 临时目录；如果需要长期保存视频任务、关键帧或生成结果，建议后续接对象存储或设置适合运行环境的 `VIDEO_OUTPUT_ROOT`。

更多说明见 `docs/deployment-guide.md` 和 `docs/video-studio-next-api.md`。
