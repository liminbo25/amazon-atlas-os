# Local Backend

## Run

```powershell
cd "c:\Users\Administrator\Desktop\codex code对话\viral-video-workbench"
python -m uvicorn backend.app.main:app --reload
```

默认地址：

- API: `http://127.0.0.1:8000`
- 健康检查: `http://127.0.0.1:8000/api/health`

## Current capability

1. 接收本地视频绝对路径。
2. 自动抽帧并写到 `backend/output/<job-id>/`。
3. 返回前端可直接消费的 `manifest`，其中每一帧都带可访问的 `src` 地址。

## Planned next

1. 接入 Whisper 做字幕识别。
2. 接 OCR 做页面文字提取。
3. 接 LLM 做“停病药信买”结构分类。
