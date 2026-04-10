from __future__ import annotations

import json
import os
import re
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .llm_service import (
    chat_json_messages,
    ensure_llm_configured,
    llm_public_status,
    make_image_content,
    make_text_content,
    save_llm_config,
    test_llm_connection,
)
from .video_generation import (
    create_video_task,
    get_video_task,
    list_video_models,
    with_video_task_urls,
)
from .video_analysis import AnalysisOptions, OUTPUT_ROOT, analyze_video as run_video_analysis


class AnalyzeVideoRequest(BaseModel):
    video_path: str = Field(..., description="Absolute path to the local video")
    interval_seconds: float = Field(110.0, ge=0.5, le=600.0)
    max_frames: int = Field(6, ge=1, le=48)


class GenerateCopyRequest(BaseModel):
    form: dict = Field(..., description="Remix form fields")
    manifest: dict = Field(..., description="Serialized manifest data")


class LLMConfigUpdateRequest(BaseModel):
    base_url: str | None = Field(default=None, description="LLM gateway base URL")
    api_key: str | None = Field(default=None, description="LLM gateway API key")
    model: str | None = Field(default=None, description="LLM model id")
    timeout_seconds: float | None = Field(default=None, ge=1.0, le=600.0)
    preserve_api_key: bool = True


app = FastAPI(title="Viral Video Workbench API", version="0.1.0")

configured_origins = [
    origin.strip()
    for origin in os.getenv("WORKBENCH_CORS_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins
    or ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"],
    allow_origin_regex=r"^https?://((localhost|127\.0\.0\.1)(:\d+)?|(10|172\.(1[6-9]|2\d|3[0-1])|192\.168)\.\d+\.\d+(:\d+)?)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/output", StaticFiles(directory=OUTPUT_ROOT), name="output")


def with_frame_urls(manifest: dict, request: Request) -> dict:
    base_url = str(request.base_url).rstrip("/")
    for frame in manifest["frames"]:
        relative_path = frame.pop("relative_path", None)
        if relative_path:
            frame["src"] = f"{base_url}/output/{relative_path}"
    return manifest


def _sample_manifest_frames(manifest: dict, limit: int = 4) -> list[dict]:
    frames = manifest.get("frames")
    if not isinstance(frames, list) or not frames:
        return []

    if len(frames) <= limit:
        return frames

    last_index = len(frames) - 1
    selected_indexes = {
        round(position * last_index / max(limit - 1, 1))
        for position in range(limit)
    }
    return [frame for index, frame in enumerate(frames) if index in selected_indexes]


def _copy_generation_frame_paths(manifest: dict, limit: int = 4) -> list[tuple[dict, Path]]:
    job_id = str(manifest.get("job_id") or "").strip()
    if not job_id:
        return []

    selected_frames = _sample_manifest_frames(manifest, limit=limit)
    result: list[tuple[dict, Path]] = []
    for frame in selected_frames:
        if not isinstance(frame, dict):
            continue

        frame_file = str(frame.get("file") or "").strip()
        if not frame_file:
            continue

        frame_path = OUTPUT_ROOT / job_id / frame_file
        if frame_path.exists():
            result.append((frame, frame_path))

    return result


COPY_META_PATTERNS = (
    "如果你的用户",
    "这条视频就该先",
    "重点放大",
    "这里重点补",
    "再补一个",
    "这版脚本",
    "这一版",
    "应该先把",
    "解决方案进场",
    "把风险拍出来",
)


def _count_ascii_letters(text: str) -> int:
    return sum(1 for char in text if ("a" <= char.lower() <= "z"))


def _count_cjk_chars(text: str) -> int:
    return len(re.findall(r"[\u4e00-\u9fff]", text))


def _find_long_english_chunks(text: str) -> list[str]:
    return re.findall(r"(?:\b[A-Za-z][A-Za-z-]{2,}\b(?:\s+|$)){4,}", text)


def _collect_copy_texts(payload: dict) -> list[str]:
    texts: list[str] = []

    for key in ("summary", "prompt"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            texts.append(value)

    drafts = payload.get("script_drafts")
    if not isinstance(drafts, list):
        return texts

    for item in drafts:
        if not isinstance(item, dict):
            continue

        for key in ("headline", "summary", "full_script", "caption", "tone", "positioning"):
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                texts.append(value)

        stage_lines = item.get("stage_lines")
        if not isinstance(stage_lines, list):
            continue

        for stage_line in stage_lines:
            if not isinstance(stage_line, dict):
                continue
            value = stage_line.get("line")
            if isinstance(value, str) and value.strip():
                texts.append(value)

    return texts


def _dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def _copy_quality_issues(payload: dict) -> list[str]:
    texts = _collect_copy_texts(payload)
    if not texts:
        return ["没有拿到任何可用脚本文本"]

    combined = "\n".join(texts)
    issues: list[str] = []

    banned_phrases = (
        "如果你的用户",
        "这条视频就该先",
        "重点放大",
        "这里重点补",
        "再补一个",
        "这版脚本",
        "这一版",
        "应该先把",
        "解决方案进场",
        "把风险拍出来",
        "营销策略",
        "脚本说明",
    )
    for phrase in banned_phrases:
        if phrase in combined:
            issues.append(f"出现分析腔或顾问腔措辞：{phrase}")

    english_chunks = _find_long_english_chunks(combined)
    if english_chunks:
        issues.append("出现大段英文描述，像香评资料，不像中文广告口播")

    ascii_letters = _count_ascii_letters(combined)
    cjk_chars = _count_cjk_chars(combined)
    if ascii_letters >= 36 and ascii_letters > max(18, cjk_chars // 4):
        issues.append("英文占比过高，读起来不像自然中文广告")

    drafts = payload.get("script_drafts")
    if not isinstance(drafts, list) or not drafts:
        issues.append("没有可用的脚本草稿")
        return _dedupe_strings(issues)

    meta_words = ("用户", "方案", "版本", "结构", "卖点", "角度", "脚本", "复刻", "策略", "分析")
    for index, item in enumerate(drafts, start=1):
        if not isinstance(item, dict):
            issues.append(f"第 {index} 条脚本格式异常")
            continue

        full_script = str(item.get("full_script") or "").strip()
        if len(full_script) < 80:
            issues.append(f"第 {index} 条脚本太短，像提纲，不像成片口播")
            continue

        if any(word in full_script for word in meta_words):
            issues.append(f"第 {index} 条脚本仍然带有说明文或模板腔")

        long_lines = [line for line in full_script.splitlines() if len(line.strip()) >= 70]
        if len(long_lines) >= 2:
            issues.append(f"第 {index} 条脚本有大段硬塞信息的长句，口播不自然")

        if not any(token in full_script for token in ("我", "你", "真的", "其实", "就是", "别", "先")):
            issues.append(f"第 {index} 条脚本缺少真人口语感")

    return _dedupe_strings(issues)


def _copy_payload_needs_polish(payload: dict) -> bool:
    return bool(_copy_quality_issues(payload))


def _polish_copy_payload(form: dict, payload: dict, issues: list[str] | None = None) -> dict:
    product_name = str(form.get("productName") or "").strip()
    category = str(form.get("category") or "").strip()
    audience = str(form.get("audience") or "").strip()
    tone = str(form.get("tone") or "").strip()
    desired_length = str(form.get("desiredLength") or "").strip()
    issue_text = "\n".join(f"- {item}" for item in (issues or []))

    rewrite_prompt = (
        "下面这份 JSON 不是最终可交付广告稿，需要你彻底重写，而不是在原句上修补。\n\n"
        "当前问题：\n"
        f"{issue_text or '- 语言不够自然，不像真实卖货视频'}\n\n"
        "重写目标：\n"
        "1. 写成真正能卖货的短视频广告脚本，要像真人在镜头前自然说出来的话。\n"
        "2. 不要写成策略说明、分析笔记、提纲、培训材料。\n"
        "3. 不要大段英文香调描述。品牌名和产品名可以保留英文，其余全部改成自然中文。\n"
        "4. 口播要有情绪、有代入感、有购买理由，不能像模板拼接。\n"
        "5. full_script 要直接可拍，包含：开头钩子、自然口播、屏幕字幕建议、简洁镜头建议、收口 CTA。\n"
        "6. prompt 要直接可喂给 AI 视频模型，必须是中文，写清人物、景别、动作、产品特写、节奏、光线、情绪、字幕感和结尾转化动作。\n"
        "7. 保持原有 JSON 顶层结构和 id，不要丢字段。\n"
        "8. 每个 stage_lines.line 都要像真人短句，不要像总结标题。\n"
        "3. Remove consultant tone, explanation, and instruction-like wording such as '如果你的用户', '重点放大', '这里重点补', '这一版', '应该先'.\n"
        "4. full_script must be a finished production script, not a memo. It should read like a creator can record it directly.\n"
        "5. prompt must be a ready-to-paste Chinese AI video prompt with shot order, subject, action, lighting, camera movement, pacing, product close-ups, and CTA moments.\n"
        "6. Keep the same top-level JSON shape and keep all ids stable.\n"
        "7. Make the hook punchy, the body conversational, and the CTA short.\n\n"
        f"Product name: {product_name or 'unknown'}\n"
        f"Category: {category or 'unknown'}\n"
        f"Audience: {audience or 'unknown'}\n"
        f"Tone: {tone or 'unknown'}\n"
        f"Target length: {desired_length or 'unknown'}\n\n"
        "Current JSON:\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )

    rewrite_prompt = (
        "下面这份 JSON 不是最终可交付广告稿，需要你彻底重写，而不是在原句上修补。\n\n"
        "当前问题：\n"
        f"{issue_text or '- 语言不够自然，不像真实卖货视频'}\n\n"
        "重写目标：\n"
        "1. 写成真正能卖货的短视频广告脚本，要像真人在镜头前自然说出来的话。\n"
        "2. 不要写成策略说明、分析笔记、提纲、培训材料。\n"
        "3. 不要大段英文香调描述。品牌名和产品名可以保留英文，其余全部改成自然中文。\n"
        "4. 口播要有情绪、有代入感、有购买理由，不能像模板拼接。\n"
        "5. full_script 要直接可拍，包含：开头钩子、自然口播、屏幕字幕建议、简洁镜头建议、收口 CTA。\n"
        "6. prompt 要直接可喂给 AI 视频模型，必须是中文，写清人物、景别、动作、产品特写、节奏、光线、情绪、字幕感和结尾转化动作。\n"
        "7. 保持原有 JSON 顶层结构和 id，不要丢字段。\n"
        "8. 每个 stage_lines.line 都要像真人短句，不要像总结标题。\n\n"
        f"产品名：{product_name or 'unknown'}\n"
        f"品类：{category or 'unknown'}\n"
        f"人群：{audience or 'unknown'}\n"
        f"语气：{tone or 'unknown'}\n"
        f"目标时长：{desired_length or 'unknown'}\n\n"
        "待重写 JSON：\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )

    return chat_json_messages(
        system_prompt=(
            "你是一名顶级中文电商短视频广告编导兼转化文案高手。"
            "你只输出能直接卖货、直接拍、直接喂给 AI 视频模型的成片级创意，不输出分析说明。"
        ),
        user_content=rewrite_prompt,
        temperature=0.45,
        max_tokens=8192,
        response_label="copy_polish",
    )


def _trim_copy_context(text: str, limit: int = 180) -> str:
    compact = " ".join((text or "").split())
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 1]}..."


def _compact_structure_blocks(blocks: list[dict]) -> list[dict]:
    compact_blocks: list[dict] = []
    for block in blocks[:5]:
        if not isinstance(block, dict):
            continue
        compact_blocks.append(
            {
                "stage": block.get("stage"),
                "title": _trim_copy_context(str(block.get("title") or ""), 60),
                "summary": _trim_copy_context(str(block.get("summary") or ""), 120),
                "recommendation": _trim_copy_context(str(block.get("recommendation") or ""), 120),
                "transcript_excerpt": _trim_copy_context(str(block.get("transcript") or ""), 140),
            }
        )
    return compact_blocks


def _compact_visual_analysis(analysis: dict) -> dict:
    frame_observations = analysis.get("frame_observations") or analysis.get("frameObservations") or []
    compact_frames: list[dict] = []
    if isinstance(frame_observations, list):
        for item in frame_observations[:4]:
            if not isinstance(item, dict):
                continue
            compact_frames.append(
                {
                    "frame_index": item.get("frame_index", item.get("frameIndex")),
                    "timestamp_seconds": item.get("timestamp_seconds", item.get("timestampSeconds")),
                    "description": _trim_copy_context(str(item.get("description") or ""), 100),
                    "marketing_role": _trim_copy_context(str(item.get("marketing_role") or item.get("marketingRole") or ""), 60),
                    "selling_signal": _trim_copy_context(str(item.get("selling_signal") or item.get("sellingSignal") or ""), 60),
                }
            )

    return {
        "summary": _trim_copy_context(str(analysis.get("summary") or ""), 140),
        "visual_style": _trim_copy_context(str(analysis.get("visual_style") or analysis.get("visualStyle") or ""), 100),
        "hook_strategy": _trim_copy_context(str(analysis.get("hook_strategy") or analysis.get("hookStrategy") or ""), 100),
        "product_presence": _trim_copy_context(str(analysis.get("product_presence") or analysis.get("productPresence") or ""), 100),
        "proof_signals": _trim_copy_context(str(analysis.get("proof_signals") or analysis.get("proofSignals") or ""), 100),
        "cta_observation": _trim_copy_context(str(analysis.get("cta_observation") or analysis.get("ctaObservation") or ""), 100),
        "frame_observations": compact_frames,
    }


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "llm": llm_public_status()}


@app.get("/api/llm-config")
def get_llm_config() -> dict:
    return {"llm": llm_public_status()}


@app.get("/api/video-models")
def get_video_models() -> dict:
    return {"models": list_video_models()}


@app.post("/api/video-generation/tasks")
async def create_video_generation_task(request: Request) -> dict:
    form = await request.form()
    request_json = form.get("request_json")
    if not isinstance(request_json, str):
        raise HTTPException(status_code=400, detail="缺少视频生成任务参数。")

    try:
        payload = json.loads(request_json)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail=f"视频生成任务参数不是合法 JSON：{error.msg}") from error

    uploads: dict[str, list[UploadFile]] = {}
    for key, value in form.multi_items():
        if key == "request_json":
            continue
        if isinstance(value, UploadFile):
            uploads.setdefault(key, []).append(value)

    try:
        task = create_video_task(payload, uploads)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except OSError as error:
        raise HTTPException(status_code=500, detail=f"保存视频生成素材失败：{error}") from error
    finally:
        for files in uploads.values():
            for file in files:
                file.file.close()

    return {"task": with_video_task_urls(task, str(request.base_url))}


@app.get("/api/video-generation/tasks/{task_id}")
def read_video_generation_task(task_id: str, request: Request) -> dict:
    task = get_video_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="未找到对应的视频生成任务。")

    return {"task": with_video_task_urls(task, str(request.base_url))}


@app.put("/api/llm-config")
def update_llm_config(payload: LLMConfigUpdateRequest) -> dict:
    try:
        llm_status = save_llm_config(
            base_url=payload.base_url,
            api_key=payload.api_key,
            model=payload.model,
            timeout_seconds=payload.timeout_seconds,
            preserve_api_key=payload.preserve_api_key,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except OSError as error:
        raise HTTPException(status_code=500, detail=f"保存模型配置失败：{error}") from error

    return {"llm": llm_status}


@app.post("/api/llm-config/test")
def probe_llm_config() -> dict:
    try:
        return test_llm_connection()
    except RuntimeError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/analyze-video")
def analyze_video(payload: AnalyzeVideoRequest, request: Request) -> dict:
    try:
        manifest = run_video_analysis(
            AnalysisOptions(
                video_path=Path(payload.video_path),
                interval_seconds=payload.interval_seconds,
                max_frames=payload.max_frames,
            )
        )
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:  # pragma: no cover - defensive API guard
        raise HTTPException(status_code=500, detail=f"Video analysis failed: {error}") from error

    return {"manifest": with_frame_urls(manifest, request)}

def _generate_copy_payload(form: dict, manifest: dict) -> dict:
    ensure_llm_configured("生成复刻脚本")

    transcript_text = str(manifest.get("transcript_text") or form.get("transcript") or "").strip()
    structure_blocks = manifest.get("structure_blocks") or []
    visual_analysis = manifest.get("visual_analysis") or {}
    if not transcript_text:
        raise RuntimeError("缺少脚本原文 / 字幕，暂时无法调用模型生成新脚本。")
    if not isinstance(visual_analysis, dict) or not visual_analysis:
        raise RuntimeError("缺少画面分析结果，请先重新分析视频后再生成脚本。")

    product_name = str(form.get("productName") or "").strip()
    category = str(form.get("category") or "").strip()
    market = str(form.get("market") or "").strip()
    audience = str(form.get("audience") or "").strip()
    problem = str(form.get("problem") or "").strip()
    selling_points = str(form.get("sellingPoints") or "").strip()
    proof_assets = str(form.get("proofAssets") or "").strip()
    tone = str(form.get("tone") or "").strip()
    desired_length = str(form.get("desiredLength") or "").strip()
    hero_angle = str(form.get("heroAngle") or "").strip()
    reference_frames = _copy_generation_frame_paths(manifest, limit=4)
    compact_structure_blocks = _compact_structure_blocks(structure_blocks)
    compact_visual_analysis = _compact_visual_analysis(visual_analysis)
    compact_structure_blocks = _compact_structure_blocks(structure_blocks)
    compact_visual_analysis = _compact_visual_analysis(visual_analysis)

    user_content: list[dict] = [
        make_text_content(
            (
                "Create a higher-quality remake plan for a short-form product video. "
                "Use the transcript, structure analysis, visual analysis, and reference frames together. "
                "Return strict JSON only. "
                "Write all human-readable output in natural Simplified Chinese. "
                "Do not produce analysis prose outside JSON.\n\n"
                "Requirements:\n"
                "1. Give at least 3 script angles.\n"
                "2. Every full_script must be a fresh shootable script, not commentary.\n"
                "3. Keep the language natural, persuasive, and spoken.\n"
                "4. The prompt field should be directly usable for AI video generation and should describe people, shots, pacing, product selling points, and proof moments.\n"
                "5. Use the visual evidence from the reference frames instead of relying on transcript alone.\n\n"
                "Return JSON schema:\n"
                "{\n"
                '  "summary": "一句总体结论",\n'
                '  "prompt": "给 AI 出片模型的分镜提示词",\n'
                '  "script_angles": [\n'
                "    {\n"
                '      "id": "risk",\n'
                '      "name": "角度名",\n'
                '      "positioning": "一句定位",\n'
                '      "tone": "语气",\n'
                '      "hook": "钩子",\n'
                '      "bridge": "承接",\n'
                '      "proof": "证据",\n'
                '      "cta": "行动号召",\n'
                '      "tags": ["标签1", "标签2"]\n'
                "    }\n"
                "  ],\n"
                '  "script_drafts": [\n'
                "    {\n"
                '      "id": "risk",\n'
                '      "angle_name": "角度名",\n'
                '      "positioning": "一句定位",\n'
                '      "tone": "语气",\n'
                '      "headline": "完整口播脚本标题",\n'
                '      "summary": "这版脚本的说明",\n'
                '      "full_script": "可直接拍摄的完整口播脚本",\n'
                '      "caption": "团队内部标记",\n'
                '      "stage_lines": [\n'
                '        {"stage": "停", "label": "停下来", "line": "第一句"},\n'
                '        {"stage": "病", "label": "放大痛点", "line": "第二句"},\n'
                '        {"stage": "药", "label": "引入产品", "line": "第三句"},\n'
                '        {"stage": "信", "label": "建立信任", "line": "第四句"},\n'
                '        {"stage": "买", "label": "驱动行动", "line": "第五句"}\n'
                "      ]\n"
                "    }\n"
                "  ]\n"
                "}\n\n"
                f"Product info:\n{json.dumps({'product_name': product_name, 'category': category, 'market': market, 'audience': audience, 'problem': problem, 'hero_angle': hero_angle, 'desired_length': desired_length, 'tone': tone, 'proof_assets': proof_assets, 'selling_points': selling_points}, ensure_ascii=False, indent=2)}\n\n"
                f"Transcript:\n{transcript_text}\n\n"
                f"Structure blocks:\n{json.dumps(compact_structure_blocks, ensure_ascii=False, indent=2)}\n\n"
                f"Visual analysis:\n{json.dumps(compact_visual_analysis, ensure_ascii=False, indent=2)}\n\n"
                "Reference frames are attached below in time order."
            )
        )
    ]

    for frame, frame_path in reference_frames:
        user_content.append(
            make_text_content(
                f"Reference frame {frame.get('index', 0)} at {float(frame.get('timestamp_seconds', 0.0)):.1f}s"
            )
        )
        user_content.append(make_image_content(frame_path))

    payload = chat_json_messages(
        system_prompt=(
            "You are a top short-form direct-response video strategist, copywriter, and creative director."
        ),
        user_content=user_content,
        temperature=0.7,
        max_tokens=8192,
        response_label="脚本生成",
    )

    if not isinstance(payload.get("script_angles"), list) or not isinstance(
        payload.get("script_drafts"), list
    ):
        raise RuntimeError("模型返回的数据格式不完整。")

    return payload


def _generate_copy_payload_v2(form: dict, manifest: dict) -> dict:
    ensure_llm_configured("Generate remake script")

    transcript_text = str(manifest.get("transcript_text") or form.get("transcript") or "").strip()
    structure_blocks = manifest.get("structure_blocks") or []
    visual_analysis = manifest.get("visual_analysis") or {}
    if not transcript_text:
        raise RuntimeError("Missing transcript text, so the model cannot generate a remake script yet.")
    if not isinstance(visual_analysis, dict) or not visual_analysis:
        raise RuntimeError("Missing visual analysis. Please analyze the video again before generating scripts.")

    product_name = str(form.get("productName") or "").strip()
    category = str(form.get("category") or "").strip()
    market = str(form.get("market") or "").strip()
    audience = str(form.get("audience") or "").strip()
    problem = str(form.get("problem") or "").strip()
    selling_points = str(form.get("sellingPoints") or "").strip()
    proof_assets = str(form.get("proofAssets") or "").strip()
    tone = str(form.get("tone") or "").strip()
    desired_length = str(form.get("desiredLength") or "").strip()
    hero_angle = str(form.get("heroAngle") or "").strip()
    reference_frames = _copy_generation_frame_paths(manifest, limit=4)
    compact_structure_blocks = _compact_structure_blocks(structure_blocks)
    compact_visual_analysis = _compact_visual_analysis(visual_analysis)

    user_content: list[dict] = [
        make_text_content(
            (
                "Create finished creative assets for a short-form product video remake. "
                "Use the transcript, structure analysis, visual analysis, and attached reference frames together. "
                "Return strict JSON only. Do not output commentary outside JSON.\n\n"
                "Your job is not to explain strategy. Your job is to deliver ready-to-use creative output.\n\n"
                "Hard rules:\n"
                "1. All human-readable content must be natural spoken Simplified Chinese.\n"
                "2. English is allowed only for unavoidable proper nouns such as brand names or product names. Translate fragrance notes, style adjectives, and marketing descriptors into Chinese.\n"
                "3. Do not write consultant tone, explanation, or phrases like '如果你的用户', '重点放大', '这里补', '这一版', '应该先'.\n"
                "4. Every full_script must be directly usable for filming or for feeding into an AI video tool.\n"
                "5. The prompt field must be a Chinese production-ready AI video prompt, with clear shot order, visual subject, action, product reveal, proof moments, subtitle feel, lighting, camera movement, and CTA beat.\n"
                "6. Use the visual evidence from the frames, not transcript alone.\n"
                "7. Give at least 3 distinct script angles.\n"
                "8. Keep the hook short and sharp, the middle persuasive but conversational, and the CTA short.\n\n"
                "9. The output must read like finished creative, not analysis notes or instructions to the team.\n\n"
                "Formatting rules for each full_script:\n"
                "- Start with a one-line opening hook.\n"
                "- Then write a short natural voiceover that can be read directly by a creator.\n"
                "- Then provide on-screen text suggestions.\n"
                "- Then provide a numbered shot list in Chinese.\n"
                "- End with a short CTA line.\n"
                "- Do not add analysis notes or teaching comments.\n\n"
                "Return JSON schema:\n"
                "{\n"
                '  "summary": "one-sentence Chinese creative direction",\n'
                '  "prompt": "Chinese AI video prompt ready to paste into a text-to-video tool",\n'
                '  "script_angles": [\n'
                "    {\n"
                '      "id": "risk",\n'
                '      "name": "Chinese angle name",\n'
                '      "positioning": "one-line Chinese positioning",\n'
                '      "tone": "Chinese tone label",\n'
                '      "hook": "Chinese hook",\n'
                '      "bridge": "Chinese bridge",\n'
                '      "proof": "Chinese proof",\n'
                '      "cta": "Chinese CTA",\n'
                '      "tags": ["tag1", "tag2"]\n'
                "    }\n"
                "  ],\n"
                '  "script_drafts": [\n'
                "    {\n"
                '      "id": "risk",\n'
                '      "angle_name": "Chinese angle name",\n'
                '      "positioning": "one-line Chinese positioning",\n'
                '      "tone": "Chinese tone label",\n'
                '      "headline": "Chinese shoot title",\n'
                '      "summary": "one-line Chinese why this version works",\n'
                '      "full_script": "Chinese finished production script with hook, voiceover, on-screen text, shot list, CTA",\n'
                '      "caption": "short Chinese internal style tag",\n'
                '      "stage_lines": [\n'
                '        {"stage": "stop", "label": "Opening", "line": "short spoken line"},\n'
                '        {"stage": "pain", "label": "Pain", "line": "short spoken line"},\n'
                '        {"stage": "solution", "label": "Solution", "line": "short spoken line"},\n'
                '        {"stage": "trust", "label": "Proof", "line": "short spoken line"},\n'
                '        {"stage": "buy", "label": "CTA", "line": "short spoken line"}\n'
                "      ]\n"
                "    }\n"
                "  ]\n"
                "}\n\n"
                f"Product info:\n{json.dumps({'product_name': product_name, 'category': category, 'market': market, 'audience': audience, 'problem': problem, 'hero_angle': hero_angle, 'desired_length': desired_length, 'tone': tone, 'proof_assets': proof_assets, 'selling_points': selling_points}, ensure_ascii=False, indent=2)}\n\n"
                f"Transcript:\n{transcript_text}\n\n"
                f"Structure blocks:\n{json.dumps(compact_structure_blocks, ensure_ascii=False, indent=2)}\n\n"
                f"Visual analysis:\n{json.dumps(compact_visual_analysis, ensure_ascii=False, indent=2)}\n\n"
                "Reference frames are attached below in time order."
            )
        )
    ]

    for frame, frame_path in reference_frames:
        user_content.append(
            make_text_content(
                f"Reference frame {frame.get('index', 0)} at {float(frame.get('timestamp_seconds', 0.0)):.1f}s"
            )
        )
        user_content.append(make_image_content(frame_path))

    payload = chat_json_messages(
        system_prompt=(
            "你是一名擅长提高商品转化率的中文短视频广告编导、销售文案和 AI 视频提示词作者。"
            "你只输出自然、能卖货、能直接拍的成片级脚本，不输出分析文、培训话术或模板说明。"
        ),
        user_content=user_content,
        temperature=0.4,
        max_tokens=8192,
        response_label="copy_generation",
    )

    if not isinstance(payload.get("script_angles"), list) or not isinstance(
        payload.get("script_drafts"), list
    ):
        raise RuntimeError("The model returned an incomplete copy package.")

    quality_issues = _copy_quality_issues(payload)
    if quality_issues:
        polished_payload = _polish_copy_payload(form, payload, quality_issues)
        if isinstance(polished_payload.get("script_angles"), list) and isinstance(
            polished_payload.get("script_drafts"), list
        ):
            payload = polished_payload
            quality_issues = _copy_quality_issues(payload)

    if quality_issues:
        issue_text = "；".join(quality_issues[:4])
        raise RuntimeError(f"模型返回的脚本仍然不自然，已拒绝展示。问题：{issue_text}")

    return payload


@app.post("/api/generate-copy")
def generate_copy(payload: GenerateCopyRequest) -> dict:
    try:
        copy_payload = _generate_copy_payload_v2(payload.form, payload.manifest)
    except RuntimeError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:  # pragma: no cover - defensive API guard
        raise HTTPException(status_code=500, detail=f"Copy generation failed: {error}") from error

    return {"copy_plan": copy_payload, "llm": llm_public_status()}


@app.post("/api/upload-video")
def upload_video(
    request: Request,
    file: UploadFile = File(...),
    interval_seconds: float = Form(110.0),
    max_frames: int = Form(6),
) -> dict:
    suffix = Path(file.filename or "upload.mp4").suffix or ".mp4"
    upload_dir = OUTPUT_ROOT / "_uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    upload_path = upload_dir / f"upload-{timestamp}{suffix}"

    try:
        with upload_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        manifest = run_video_analysis(
            AnalysisOptions(
                video_path=upload_path,
                interval_seconds=interval_seconds,
                max_frames=max_frames,
            )
        )
    except RuntimeError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:  # pragma: no cover - defensive API guard
        raise HTTPException(status_code=500, detail=f"Video upload failed: {error}") from error
    finally:
        file.file.close()

    return {"manifest": with_frame_urls(manifest, request)}
