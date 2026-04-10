from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path

import cv2
from faster_whisper import WhisperModel

from .llm_service import (
    chat_json,
    chat_json_messages,
    ensure_llm_configured,
    make_image_content,
    make_text_content,
)


OUTPUT_ROOT = Path(__file__).resolve().parents[1] / "output"

STAGE_ORDER = ["stop", "pain", "solution", "trust", "buy"]
STAGE_META = {
    "stop": {
        "label": "停",
        "title": "截停注意",
        "summary": "先用反常识或风险提示把用户停下来。",
        "tags": ["3秒钩子", "打断刷屏", "高停留"],
        "advice": "开场画面要有强反差，别先讲背景。",
    },
    "pain": {
        "label": "病",
        "title": "放大问题",
        "summary": "把用户眼前的痛点讲到具体场景里。",
        "tags": ["真实场景", "需求显性化", "代入感"],
        "advice": "优先拍问题正在发生的瞬间，而不是抽象解释。",
    },
    "solution": {
        "label": "药",
        "title": "给出方案",
        "summary": "让产品像顺理成章的解决方案出现。",
        "tags": ["产品入场", "卖点承接", "解决方案"],
        "advice": "先承接问题，再展示产品动作和关键卖点。",
    },
    "trust": {
        "label": "信",
        "title": "建立信任",
        "summary": "用对比、数据和结果降低犹豫。",
        "tags": ["证据", "对比", "用户结果"],
        "advice": "把结果拍出来，而不是只说有效。",
    },
    "buy": {
        "label": "买",
        "title": "驱动行动",
        "summary": "给出明确动作和立刻行动的理由。",
        "tags": ["CTA", "行动理由", "转化收口"],
        "advice": "结尾要明确下一步，不要只停在介绍产品。",
    },
}

STOP_KEYWORDS = (
    "如果你",
    "千万别",
    "很多人都",
    "别再",
    "注意",
    "小心",
    "还在",
    "其实",
    "你知道吗",
)
PAIN_KEYWORDS = (
    "问题",
    "风险",
    "焦虑",
    "难受",
    "不愿意",
    "不想",
    "细菌",
    "脏",
    "麻烦",
    "担心",
    "喝水少",
)
SOLUTION_KEYWORDS = (
    "换成",
    "这个",
    "产品",
    "用它",
    "用了",
    "开始",
    "解决",
    "自动",
    "过滤",
    "功能",
)
TRUST_KEYWORDS = (
    "证明",
    "结果",
    "反馈",
    "数据",
    "认证",
    "静音",
    "对比",
    "更放心",
    "会主动",
    "看得见",
)
BUY_KEYWORDS = (
    "现在",
    "下单",
    "链接",
    "试试",
    "升级",
    "赶紧",
    "马上",
    "点击",
    "购买",
)


@dataclass
class AnalysisOptions:
    video_path: Path
    interval_seconds: float = 3.0
    max_frames: int = 24


def _safe_slug(source: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", source).strip("-").lower()
    return normalized or "video"


def _default_whisper_model() -> str:
    return os.getenv("WORKBENCH_WHISPER_MODEL", "base")


@lru_cache(maxsize=2)
def _get_whisper_model(model_name: str) -> WhisperModel:
    return WhisperModel(model_name, device="cpu", compute_type="int8")


def _score_keywords(text: str, keywords: tuple[str, ...]) -> int:
    return sum(1 for keyword in keywords if keyword in text)


def _classify_stage(text: str, index: int, total: int) -> tuple[str, float]:
    normalized = text.replace(" ", "").lower()
    scores = {
        "stop": _score_keywords(normalized, STOP_KEYWORDS),
        "pain": _score_keywords(normalized, PAIN_KEYWORDS),
        "solution": _score_keywords(normalized, SOLUTION_KEYWORDS),
        "trust": _score_keywords(normalized, TRUST_KEYWORDS),
        "buy": _score_keywords(normalized, BUY_KEYWORDS),
    }

    progress = index / max(total - 1, 1)

    if index == 0 and max(scores["pain"], scores["solution"], scores["trust"], scores["buy"]) <= 1:
        return "stop", 0.74

    if scores["buy"] >= 2 or (scores["buy"] > 0 and progress >= 0.72):
        return "buy", min(0.98, 0.62 + scores["buy"] * 0.12)
    if scores["trust"] >= 2 or (scores["trust"] > 0 and progress >= 0.56):
        return "trust", min(0.95, 0.6 + scores["trust"] * 0.1)
    if scores["solution"] >= 2 or (scores["solution"] > 0 and progress >= 0.32):
        return "solution", min(0.95, 0.58 + scores["solution"] * 0.1)
    if scores["pain"] > 0:
        if index == 0:
            return "stop", 0.7
        return "pain", min(0.94, 0.56 + scores["pain"] * 0.1)
    if scores["stop"] > 0 or index == 0:
        return "stop", min(0.92, 0.6 + max(scores["stop"], 1) * 0.08)

    if progress >= 0.82:
        return "buy", 0.52
    if progress <= 0.18:
        return "stop", 0.46
    if index <= max(1, int(total * 0.36)):
        return "pain", 0.48
    if index <= max(2, int(total * 0.68)):
        return "solution", 0.46
    return "trust", 0.47


def _trim_text(text: str, limit: int = 96) -> str:
    compact = " ".join(text.split())
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 1]}…"


def _extract_frames(options: AnalysisOptions) -> dict:
    video_path = options.video_path.expanduser().resolve()
    if not video_path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"Failed to open video: {video_path}")

    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    duration = frame_count / fps if frame_count else 0.0

    run_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    job_dir = OUTPUT_ROOT / f"{_safe_slug(video_path.stem)}-{run_id}"
    job_dir.mkdir(parents=True, exist_ok=True)

    frames = []
    frame_index = 0
    timestamp = 0.0

    while frame_index < options.max_frames and timestamp <= duration:
        capture.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
        ok, frame = capture.read()
        if not ok:
            break

        filename = f"frame_{frame_index:03d}_{timestamp:07.2f}s.jpg"
        output_path = job_dir / filename
        encoded, buffer = cv2.imencode(".jpg", frame)
        if not encoded:
            raise RuntimeError(f"Failed to encode frame at {timestamp:.2f}s")

        output_path.write_bytes(buffer.tobytes())

        frames.append(
            {
                "index": frame_index,
                "timestamp_seconds": round(timestamp, 2),
                "file": filename,
                "relative_path": f"{job_dir.name}/{filename}",
            }
        )

        frame_index += 1
        timestamp += options.interval_seconds

    capture.release()

    return {
        "video": str(video_path),
        "fps": fps,
        "frame_count": frame_count,
        "duration_seconds": round(duration, 2),
        "width": width,
        "height": height,
        "job_id": job_dir.name,
        "frames": frames,
    }


def _sample_frames_for_llm(manifest: dict, limit: int = 6) -> list[dict]:
    frames = manifest.get("frames", [])
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


def _frame_file_path(job_id: str, frame: dict) -> Path:
    return OUTPUT_ROOT / job_id / str(frame["file"])


def _transcript_excerpt(transcript_segments: list[dict], max_chars: int = 1600) -> str:
    parts: list[str] = []
    total = 0
    for segment in transcript_segments:
        line = (
            f"{segment['start_seconds']:.1f}-{segment['end_seconds']:.1f}s: "
            f"{str(segment['text']).strip()}"
        )
        if total + len(line) > max_chars and parts:
            break
        parts.append(line)
        total += len(line)

    return "\n".join(parts)


def _apply_visual_notes_to_frames(frames: list[dict], visual_analysis: dict | None) -> list[dict]:
    if not visual_analysis:
        return frames

    observation_map = {
        int(observation.get("frame_index")): observation
        for observation in visual_analysis.get("frame_observations", [])
        if isinstance(observation, dict) and observation.get("frame_index") is not None
    }

    updated_frames: list[dict] = []
    for frame in frames:
        observation = observation_map.get(int(frame["index"]))
        if not observation:
            updated_frames.append(frame)
            continue

        note = str(observation.get("note") or observation.get("description") or "").strip()
        updated_frames.append(
            {
                **frame,
                "note": note or frame.get("note"),
            }
        )

    return updated_frames


def _analyze_visual_frames_with_llm(manifest: dict, transcript_segments: list[dict]) -> tuple[dict, str]:
    config = ensure_llm_configured("视频画面分析")
    sampled_frames = _sample_frames_for_llm(manifest)
    if not sampled_frames:
        raise RuntimeError("视频画面分析失败：没有可用关键帧。")

    transcript_excerpt = _transcript_excerpt(transcript_segments)
    user_content: list[dict] = [
        make_text_content(
            (
                "Analyze this short-form product video using the provided key frames. "
                "Return strict JSON only. "
                "Write every human-readable field in Simplified Chinese. "
                "Use the transcript excerpt only as supporting context, not as a replacement for visual analysis.\n\n"
                "JSON schema:\n"
                "{\n"
                '  "summary": "overall visual takeaway",\n'
                '  "visual_style": "visual style and production feel",\n'
                '  "hook_strategy": "how the opening frames stop the scroll",\n'
                '  "product_presence": "how and when the product appears",\n'
                '  "proof_signals": "visible proof, comparison, or trust signals",\n'
                '  "cta_observation": "how the ending drives action",\n'
                '  "frame_observations": [\n'
                "    {\n"
                '      "frame_index": 0,\n'
                '      "timestamp_seconds": 0.0,\n'
                '      "description": "what is visible in this frame",\n'
                '      "marketing_role": "hook / pain / solution / trust / buy",\n'
                '      "shot_type": "close-up / product demo / before-after / testimonial / CTA",\n'
                '      "selling_signal": "what value or selling point this frame communicates",\n'
                '      "note": "why this frame matters for remaking the video"\n'
                "    }\n"
                "  ]\n"
                "}\n\n"
                f"Video info:\n{json.dumps({'duration_seconds': manifest.get('duration_seconds'), 'frame_count': manifest.get('frame_count')}, ensure_ascii=False, indent=2)}\n\n"
                f"Transcript excerpt:\n{transcript_excerpt or 'No transcript available.'}\n\n"
                "Each frame below is ordered by time."
            )
        )
    ]

    for frame in sampled_frames:
        user_content.append(
            make_text_content(
                f"Frame {frame['index']} at {frame['timestamp_seconds']:.1f}s"
            )
        )
        user_content.append(make_image_content(_frame_file_path(str(manifest["job_id"]), frame)))

    payload = chat_json_messages(
        system_prompt=(
            "You are a senior short-form video strategist and creative director. "
            "You inspect product-video frames and explain how the visuals create hook, pain, solution, trust, and action."
        ),
        user_content=user_content,
        temperature=0.2,
        max_tokens=2800,
        response_label="视频画面分析",
    )

    frame_observations = payload.get("frame_observations", [])
    if not isinstance(frame_observations, list):
        raise RuntimeError("视频画面分析失败：模型没有返回 frame_observations。")

    normalized_observations: list[dict] = []
    sampled_frame_map = {int(frame["index"]): frame for frame in sampled_frames}
    for observation in frame_observations:
        if not isinstance(observation, dict):
            continue

        frame_index = int(observation.get("frame_index", -1))
        sampled_frame = sampled_frame_map.get(frame_index)
        timestamp_seconds = (
            float(observation.get("timestamp_seconds"))
            if observation.get("timestamp_seconds") is not None
            else float(sampled_frame["timestamp_seconds"]) if sampled_frame else 0.0
        )
        normalized_observations.append(
            {
                "frame_index": frame_index,
                "timestamp_seconds": round(timestamp_seconds, 2),
                "description": str(observation.get("description") or "").strip(),
                "marketing_role": str(observation.get("marketing_role") or "").strip(),
                "shot_type": str(observation.get("shot_type") or "").strip(),
                "selling_signal": str(observation.get("selling_signal") or "").strip(),
                "note": str(observation.get("note") or "").strip(),
            }
        )

    visual_analysis = {
        "summary": str(payload.get("summary") or "").strip(),
        "visual_style": str(payload.get("visual_style") or "").strip(),
        "hook_strategy": str(payload.get("hook_strategy") or "").strip(),
        "product_presence": str(payload.get("product_presence") or "").strip(),
        "proof_signals": str(payload.get("proof_signals") or "").strip(),
        "cta_observation": str(payload.get("cta_observation") or "").strip(),
        "frame_observations": normalized_observations,
    }

    return (
        visual_analysis,
        f"已使用 {config['model']} 完成 {len(sampled_frames)} 张关键帧的画面分析。",
    )


def _transcribe_video(video_path: Path) -> tuple[str, list[dict], str]:
    model_name = _default_whisper_model()
    model = _get_whisper_model(model_name)
    segments, info = model.transcribe(
        str(video_path),
        beam_size=3,
        vad_filter=True,
        word_timestamps=False,
    )

    transcript_segments: list[dict] = []
    transcript_lines: list[str] = []
    for index, segment in enumerate(segments):
        text = segment.text.strip()
        if not text:
            continue

        transcript_segments.append(
            {
                "id": f"seg-{index + 1}",
                "start_seconds": round(segment.start, 2),
                "end_seconds": round(segment.end, 2),
                "text": text,
            }
        )
        transcript_lines.append(text)

    return "\n".join(transcript_lines), transcript_segments, info.language or "unknown"


def _build_structure_blocks(transcript_segments: list[dict]) -> list[dict]:
    if not transcript_segments:
        return []

    classified: list[dict] = []
    total = len(transcript_segments)
    for index, segment in enumerate(transcript_segments):
        stage, confidence = _classify_stage(segment["text"], index, total)
        classified.append({**segment, "stage": stage, "confidence": round(confidence, 2)})

    blocks: list[dict] = []
    current: dict | None = None
    for segment in classified:
        if current is None or current["stage"] != segment["stage"]:
            if current is not None:
                blocks.append(current)
            current = {
                "stage": segment["stage"],
                "stage_label": STAGE_META[segment["stage"]]["label"],
                "title": STAGE_META[segment["stage"]]["title"],
                "summary_hint": STAGE_META[segment["stage"]]["summary"],
                "recommendation": STAGE_META[segment["stage"]]["advice"],
                "tags": STAGE_META[segment["stage"]]["tags"],
                "start_seconds": segment["start_seconds"],
                "end_seconds": segment["end_seconds"],
                "confidence_total": segment["confidence"],
                "items": [segment],
            }
            continue

        current["items"].append(segment)
        current["end_seconds"] = segment["end_seconds"]
        current["confidence_total"] += segment["confidence"]

    if current is not None:
        blocks.append(current)

    structure_blocks: list[dict] = []
    for index, block in enumerate(blocks):
        items = block["items"]
        transcript = "\n".join(item["text"] for item in items)
        structure_blocks.append(
            {
                "id": f"block-{index + 1}",
                "stage": block["stage"],
                "stage_label": block["stage_label"],
                "title": block["title"],
                "summary": _trim_text(transcript),
                "summary_hint": block["summary_hint"],
                "recommendation": block["recommendation"],
                "transcript": transcript,
                "start_seconds": block["start_seconds"],
                "end_seconds": block["end_seconds"],
                "confidence": round(block["confidence_total"] / len(items), 2),
                "tags": block["tags"],
                "segment_ids": [item["id"] for item in items],
            }
        )

    return structure_blocks


def _enhance_structure_blocks_with_llm(
    transcript_segments: list[dict],
    structure_blocks: list[dict],
    visual_analysis: dict | None = None,
) -> tuple[list[dict], str | None]:
    if not transcript_segments or not structure_blocks:
        return structure_blocks, None
    config = ensure_llm_configured("视频分析结构增强")

    segments_payload = [
        {
            "id": segment["id"],
            "start_seconds": segment["start_seconds"],
            "end_seconds": segment["end_seconds"],
            "text": segment["text"],
        }
        for segment in transcript_segments[:160]
    ]
    heuristic_payload = [
        {
            "id": block["id"],
            "stage": block["stage"],
            "stage_label": block["stage_label"],
            "title": block["title"],
            "summary": block["summary"],
            "summary_hint": block["summary_hint"],
            "recommendation": block["recommendation"],
            "transcript": block["transcript"],
            "start_seconds": block["start_seconds"],
            "end_seconds": block["end_seconds"],
            "confidence": block["confidence"],
            "tags": block["tags"],
            "segment_ids": block["segment_ids"],
        }
        for block in structure_blocks
    ]

    visual_payload = visual_analysis or {}
    system_prompt = (
        "You are an expert short-form video strategist. "
        "Improve the structure analysis of a product video without changing each block id, time range, or segment coverage. "
        "Return strict JSON only. "
        "Write every human-readable field in Simplified Chinese."
    )
    user_prompt = f"""
Use the transcript segments, the heuristic structure blocks, and the visual analysis to improve the final structure breakdown.

Requirements:
1. Keep each block id, start_seconds, end_seconds, and segment_ids unchanged.
2. stage must stay within stop, pain, solution, trust, buy.
3. stage_label must match 停、病、药、信、买.
4. title should be concrete and sharp.
5. summary should read like an analyst conclusion, not a transcript copy.
6. summary_hint should explain why this block works in the funnel.
7. recommendation should become a specific visual execution note.
8. tags should stay within 2-4 items.
9. confidence must be a decimal between 0 and 1.

Return JSON only:
{{
  "structure_blocks": [
    {{
      "id": "block-1",
      "stage": "stop",
      "stage_label": "停",
      "title": "更具体的标题",
      "summary": "更像分析结论的摘要",
      "summary_hint": "为什么这段属于这个阶段",
      "recommendation": "更可执行的画面建议",
      "transcript": "原句",
      "start_seconds": 0.0,
      "end_seconds": 3.2,
      "confidence": 0.88,
      "tags": ["标签1", "标签2"],
      "segment_ids": ["seg-1"]
    }}
  ]
}}

Transcript segments:
{json.dumps(segments_payload, ensure_ascii=False, indent=2)}

Visual analysis:
{json.dumps(visual_payload, ensure_ascii=False, indent=2)}

Current structure blocks:
{json.dumps(heuristic_payload, ensure_ascii=False, indent=2)}
"""

    payload = chat_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.2,
        max_tokens=3200,
        response_label="视频结构增强",
    )
    enhanced = payload.get("structure_blocks", [])
    if not isinstance(enhanced, list) or not enhanced:
        raise ValueError("structure_blocks missing")

    enhanced_map = {
        block.get("id"): block for block in enhanced if isinstance(block, dict) and block.get("id")
    }
    merged_blocks: list[dict] = []
    for block in structure_blocks:
        candidate = enhanced_map.get(block["id"])
        if not candidate:
            merged_blocks.append(block)
            continue

        stage = candidate.get("stage")
        if stage not in STAGE_META:
            stage = block["stage"]

        merged_blocks.append(
            {
                "id": block["id"],
                "stage": stage,
                "stage_label": candidate.get("stage_label") or STAGE_META[stage]["label"],
                "title": str(candidate.get("title") or block["title"]),
                "summary": str(candidate.get("summary") or block["summary"]),
                "summary_hint": str(candidate.get("summary_hint") or block["summary_hint"]),
                "recommendation": str(candidate.get("recommendation") or block["recommendation"]),
                "transcript": block["transcript"],
                "start_seconds": block["start_seconds"],
                "end_seconds": block["end_seconds"],
                "confidence": float(candidate.get("confidence") or block["confidence"]),
                "tags": [
                    str(tag)
                    for tag in candidate.get("tags", block["tags"])
                    if isinstance(tag, str) and str(tag).strip()
                ][:4]
                or block["tags"],
                "segment_ids": block["segment_ids"],
            }
        )

    return (
        merged_blocks,
        f"已使用 {config['model']} 对结构块标题和建议做二次增强。",
    )


def analyze_video(options: AnalysisOptions) -> dict:
    manifest = _extract_frames(options)
    video_path = Path(manifest["video"])
    ensure_llm_configured("视频分析")

    transcript_text = ""
    transcript_segments: list[dict] = []
    detected_language = "unknown"
    visual_analysis: dict | None = None
    structure_blocks: list[dict] = []
    analysis_notes: list[str] = [
        "已完成抽帧分析。",
        f"字幕模型默认使用 faster-whisper {_default_whisper_model()}，首次运行会下载模型。",
    ]

    transcript_text, transcript_segments, detected_language = _transcribe_video(video_path)
    visual_analysis, visual_note = _analyze_visual_frames_with_llm(manifest, transcript_segments)
    structure_blocks = _build_structure_blocks(transcript_segments)
    structure_blocks, llm_note = _enhance_structure_blocks_with_llm(
        transcript_segments,
        structure_blocks,
        visual_analysis,
    )
    manifest["frames"] = _apply_visual_notes_to_frames(manifest["frames"], visual_analysis)
    analysis_notes.append(visual_note)
    if transcript_segments:
        analysis_notes.append(
            f"已生成 {len(transcript_segments)} 条字幕片段，并拆出 {len(structure_blocks)} 个结构块。"
        )
        if llm_note:
            analysis_notes.append(llm_note)
    else:
        analysis_notes.append("未识别出可用语音内容，结构拆解暂时为空。")

    manifest.update(
        {
            "detected_language": detected_language,
            "transcript_text": transcript_text,
            "transcript_segments": transcript_segments,
            "visual_analysis": visual_analysis,
            "structure_blocks": structure_blocks,
            "analysis_notes": analysis_notes,
        }
    )

    job_dir = OUTPUT_ROOT / manifest["job_id"]
    (job_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return manifest
