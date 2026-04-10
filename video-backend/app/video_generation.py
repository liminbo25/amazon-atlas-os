from __future__ import annotations

import json
import shutil
import uuid
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import UploadFile

from .video_analysis import OUTPUT_ROOT


VIDEO_GENERATION_ROOT = OUTPUT_ROOT / "video-generation"
VIDEO_TASKS_ROOT = VIDEO_GENERATION_ROOT / "tasks"
IMAGE_ACCEPT = "image/png,image/jpeg,image/webp"
SUPPORTED_INPUT_MODES = {
    "text_to_video",
    "image_to_video",
    "frame_to_video",
    "multi_image_to_video",
}

VIDEO_MODEL_CAPABILITIES: list[dict[str, Any]] = [
    {
        "id": "runway-gen4-turbo",
        "name": "Runway Gen-4 Turbo",
        "provider": "Runway",
        "description": "偏向镜头运动和广告短片验证，适合快速出首版视频任务。",
        "integration_status": "planned",
        "status_label": "结构预留",
        "status_detail": "已打通任务校验、素材入库和状态查询，真实 Runway 提交层待接入。",
        "supported_input_modes": [
            {
                "mode": "text_to_video",
                "label": "文生视频",
                "description": "只用提示词生成整段视频。",
                "asset_slots": [],
            },
            {
                "mode": "image_to_video",
                "label": "单图生视频",
                "description": "上传一张主图驱动主体和镜头运动。",
                "asset_slots": [
                    {
                        "id": "source_image",
                        "label": "主图",
                        "description": "用于生成视频主体的单张图片。",
                        "accept": IMAGE_ACCEPT,
                        "multiple": False,
                        "optional": False,
                        "min_files": 1,
                        "max_files": 1,
                    }
                ],
            },
            {
                "mode": "frame_to_video",
                "label": "首尾帧生视频",
                "description": "上传首帧和尾帧控制起止画面。",
                "asset_slots": [
                    {
                        "id": "first_frame",
                        "label": "首帧",
                        "description": "视频的起始画面。",
                        "accept": IMAGE_ACCEPT,
                        "multiple": False,
                        "optional": False,
                        "min_files": 1,
                        "max_files": 1,
                    },
                    {
                        "id": "last_frame",
                        "label": "尾帧",
                        "description": "视频的结束画面。",
                        "accept": IMAGE_ACCEPT,
                        "multiple": False,
                        "optional": False,
                        "min_files": 1,
                        "max_files": 1,
                    },
                ],
            },
        ],
        "supported_aspect_ratios": ["16:9", "9:16", "1:1"],
        "duration": {
            "min_seconds": 5,
            "max_seconds": 10,
            "step_seconds": 5,
            "default_seconds": 5,
        },
        "qualities": [
            {"id": "720p", "label": "720p", "description": "适合快速验证。"},
            {"id": "1080p", "label": "1080p", "description": "适合正式成片。"},
        ],
        "supported_parameters": [
            {
                "key": "seed",
                "label": "Seed",
                "description": "控制结果复现。",
                "kind": "number",
                "min": 0,
                "max": 2147483647,
                "step": 1,
            },
            {
                "key": "motion_strength",
                "label": "运动强度",
                "description": "控制主体动作幅度。",
                "kind": "range",
                "min": 1,
                "max": 10,
                "step": 1,
                "default_value": 5,
            },
            {
                "key": "camera_strength",
                "label": "镜头强度",
                "description": "控制镜头推拉摇移的存在感。",
                "kind": "range",
                "min": 1,
                "max": 10,
                "step": 1,
                "default_value": 4,
            },
        ],
        "notes": [
            "适合先验证脚本和镜头语言，不适合把所有复杂控制一次性塞满。",
            "当前后端只完成能力映射和任务建档，真实供应商请求尚未接入。",
        ],
    },
    {
        "id": "kling-2-master",
        "name": "Kling 2 Master",
        "provider": "Kling",
        "description": "适合广告感更强的商品视频，支持多图参考和更完整的高级参数。",
        "integration_status": "planned",
        "status_label": "结构预留",
        "status_detail": "已具备 Kling 能力配置、任务参数组织和文件归档；真实接口待接入。",
        "supported_input_modes": [
            {
                "mode": "text_to_video",
                "label": "文生视频",
                "description": "直接从文案生成视频。",
                "asset_slots": [],
            },
            {
                "mode": "image_to_video",
                "label": "单图生视频",
                "description": "用一张主图驱动画面和动作。",
                "asset_slots": [
                    {
                        "id": "source_image",
                        "label": "主图",
                        "description": "作为主体参考的关键图片。",
                        "accept": IMAGE_ACCEPT,
                        "multiple": False,
                        "optional": False,
                        "min_files": 1,
                        "max_files": 1,
                    },
                    {
                        "id": "reference_images",
                        "label": "参考图",
                        "description": "可补充风格、商品角度或场景气质。",
                        "accept": IMAGE_ACCEPT,
                        "multiple": True,
                        "optional": True,
                        "min_files": 0,
                        "max_files": 4,
                    },
                ],
            },
            {
                "mode": "frame_to_video",
                "label": "首尾帧生视频",
                "description": "上传首尾帧控制转场和结果落点。",
                "asset_slots": [
                    {
                        "id": "first_frame",
                        "label": "首帧",
                        "description": "视频开头画面。",
                        "accept": IMAGE_ACCEPT,
                        "multiple": False,
                        "optional": False,
                        "min_files": 1,
                        "max_files": 1,
                    },
                    {
                        "id": "last_frame",
                        "label": "尾帧",
                        "description": "视频结束画面。",
                        "accept": IMAGE_ACCEPT,
                        "multiple": False,
                        "optional": False,
                        "min_files": 1,
                        "max_files": 1,
                    },
                    {
                        "id": "reference_images",
                        "label": "参考图",
                        "description": "补充产品细节或风格锚点。",
                        "accept": IMAGE_ACCEPT,
                        "multiple": True,
                        "optional": True,
                        "min_files": 0,
                        "max_files": 4,
                    },
                ],
            },
            {
                "mode": "multi_image_to_video",
                "label": "多图参考生成",
                "description": "使用多张参考图统一主体和风格。",
                "asset_slots": [
                    {
                        "id": "reference_images",
                        "label": "参考图组",
                        "description": "至少上传两张图，统一商品和风格。",
                        "accept": IMAGE_ACCEPT,
                        "multiple": True,
                        "optional": False,
                        "min_files": 2,
                        "max_files": 6,
                    }
                ],
            },
        ],
        "supported_aspect_ratios": ["16:9", "9:16", "1:1", "4:5"],
        "duration": {
            "min_seconds": 5,
            "max_seconds": 15,
            "step_seconds": 5,
            "default_seconds": 10,
        },
        "qualities": [
            {"id": "720p", "label": "720p", "description": "快速测试和迭代。"},
            {"id": "1080p", "label": "1080p", "description": "偏正式成片质量。"},
        ],
        "supported_parameters": [
            {
                "key": "negative_prompt",
                "label": "负向 Prompt",
                "description": "指定不希望出现的动作、材质或镜头问题。",
                "kind": "textarea",
            },
            {
                "key": "seed",
                "label": "Seed",
                "description": "控制复现。",
                "kind": "number",
                "min": 0,
                "max": 2147483647,
                "step": 1,
            },
            {
                "key": "motion_strength",
                "label": "运动强度",
                "description": "控制动作幅度。",
                "kind": "range",
                "min": 1,
                "max": 10,
                "step": 1,
                "default_value": 6,
            },
            {
                "key": "camera_strength",
                "label": "镜头强度",
                "description": "控制镜头运动感。",
                "kind": "range",
                "min": 1,
                "max": 10,
                "step": 1,
                "default_value": 5,
            },
            {
                "key": "style_strength",
                "label": "风格强度",
                "description": "控制风格化程度。",
                "kind": "range",
                "min": 1,
                "max": 10,
                "step": 1,
                "default_value": 6,
            },
        ],
        "notes": [
            "支持的输入方式最完整，适合做差异化表单演示。",
            "参考图和多图输入仅完成任务层建模，真实生成还需供应商 API 接入。",
        ],
    },
    {
        "id": "pixverse-v4",
        "name": "PixVerse V4",
        "provider": "PixVerse",
        "description": "适合节奏感更强、风格化更明显的短视频生成。",
        "integration_status": "planned",
        "status_label": "结构预留",
        "status_detail": "已完成 PixVerse 能力抽象与任务接口，真实调用层未接入。",
        "supported_input_modes": [
            {
                "mode": "text_to_video",
                "label": "文生视频",
                "description": "用文字直接生成短视频。",
                "asset_slots": [],
            },
            {
                "mode": "image_to_video",
                "label": "单图生视频",
                "description": "上传主图生成视频。",
                "asset_slots": [
                    {
                        "id": "source_image",
                        "label": "主图",
                        "description": "商品或人物主图。",
                        "accept": IMAGE_ACCEPT,
                        "multiple": False,
                        "optional": False,
                        "min_files": 1,
                        "max_files": 1,
                    }
                ],
            },
        ],
        "supported_aspect_ratios": ["16:9", "9:16"],
        "duration": {
            "min_seconds": 5,
            "max_seconds": 8,
            "step_seconds": 1,
            "default_seconds": 5,
        },
        "qualities": [
            {"id": "720p", "label": "720p", "description": "标准输出。"},
            {"id": "1080p", "label": "1080p", "description": "高清输出。"},
        ],
        "supported_parameters": [
            {
                "key": "negative_prompt",
                "label": "负向 Prompt",
                "description": "排除不想出现的元素。",
                "kind": "textarea",
            },
            {
                "key": "style_strength",
                "label": "风格强度",
                "description": "控制风格化表现。",
                "kind": "range",
                "min": 1,
                "max": 10,
                "step": 1,
                "default_value": 7,
            },
        ],
        "notes": [
            "更适合强调节奏、滤镜和包装感的素材。",
            "当前结果区只会返回任务占位，不会返回真实视频文件。",
        ],
    },
    {
        "id": "veo-creative",
        "name": "Veo Creative",
        "provider": "Veo",
        "description": "适合从脚本 Prompt 快速起片，也支持图生视频补充。",
        "integration_status": "planned",
        "status_label": "结构预留",
        "status_detail": "任务入口、参数校验和状态查询已完成，真实 Veo 提交链路待接入。",
        "supported_input_modes": [
            {
                "mode": "text_to_video",
                "label": "文生视频",
                "description": "直接根据 Prompt 出片。",
                "asset_slots": [],
            },
            {
                "mode": "image_to_video",
                "label": "单图生视频",
                "description": "上传一张商品或场景图开始生成。",
                "asset_slots": [
                    {
                        "id": "source_image",
                        "label": "主图",
                        "description": "作为画面锚点的单张图片。",
                        "accept": IMAGE_ACCEPT,
                        "multiple": False,
                        "optional": False,
                        "min_files": 1,
                        "max_files": 1,
                    }
                ],
            },
        ],
        "supported_aspect_ratios": ["16:9", "9:16", "1:1"],
        "duration": {
            "min_seconds": 5,
            "max_seconds": 10,
            "step_seconds": 5,
            "default_seconds": 5,
        },
        "qualities": [
            {"id": "720p", "label": "720p", "description": "结构验证。"},
            {"id": "1080p", "label": "1080p", "description": "高清输出。"},
        ],
        "supported_parameters": [
            {
                "key": "seed",
                "label": "Seed",
                "description": "控制生成随机性。",
                "kind": "number",
                "min": 0,
                "max": 2147483647,
                "step": 1,
            },
            {
                "key": "motion_strength",
                "label": "运动强度",
                "description": "控制主体动作感。",
                "kind": "range",
                "min": 1,
                "max": 10,
                "step": 1,
                "default_value": 5,
            },
        ],
        "notes": [
            "更适合承接现有脚本 Prompt，快速做文生视频首版。",
            "当前仅保留调用层结构，不会伪装成已完成真实供应商接入。",
        ],
    },
]


def list_video_models() -> list[dict[str, Any]]:
    return deepcopy(VIDEO_MODEL_CAPABILITIES)


def with_video_task_urls(task: dict[str, Any], base_url: str) -> dict[str, Any]:
    base = base_url.rstrip("/")
    decorated = deepcopy(task)

    for asset in decorated.get("assets", []):
        relative_path = asset.get("relative_path")
        if relative_path and not asset.get("url"):
            asset["url"] = f"{base}/output/{relative_path}"

    result = decorated.get("result") or {}
    for video in result.get("videos", []):
        relative_path = video.get("relative_path")
        if relative_path and not video.get("url"):
            video["url"] = f"{base}/output/{relative_path}"

    return decorated


def get_video_task(task_id: str) -> dict[str, Any] | None:
    task_path = VIDEO_TASKS_ROOT / task_id / "task.json"
    if not task_path.exists():
        return None

    return json.loads(task_path.read_text(encoding="utf-8"))


def create_video_task(
    raw_payload: dict[str, Any],
    uploaded_assets: dict[str, list[UploadFile]],
) -> dict[str, Any]:
    VIDEO_TASKS_ROOT.mkdir(parents=True, exist_ok=True)

    normalized_payload = _normalize_task_payload(raw_payload)
    model = _get_video_model(normalized_payload["model_id"])
    input_mode = _get_input_mode_capability(model, normalized_payload["input_mode"])
    _validate_uploaded_assets(input_mode, uploaded_assets)

    task_id = f"video-task-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}"
    task_dir = VIDEO_TASKS_ROOT / task_id
    inputs_dir = task_dir / "inputs"
    inputs_dir.mkdir(parents=True, exist_ok=True)

    saved_assets: list[dict[str, Any]] = []
    for slot in input_mode.get("asset_slots", []):
        slot_id = slot["id"]
        files = uploaded_assets.get(slot_id, [])
        if not files:
            continue

        slot_dir = inputs_dir / slot_id
        slot_dir.mkdir(parents=True, exist_ok=True)
        for index, file in enumerate(files, start=1):
            original_name = Path(file.filename or f"{slot_id}-{index}.png")
            suffix = original_name.suffix or ".png"
            safe_name = _safe_stem(original_name.stem)
            target_path = slot_dir / f"{index:02d}-{safe_name}{suffix}"
            size_bytes = _save_upload(file, target_path)
            saved_assets.append(
                {
                    "slot_id": slot_id,
                    "label": slot["label"],
                    "kind": "image",
                    "name": file.filename or target_path.name,
                    "size_bytes": size_bytes,
                    "relative_path": target_path.relative_to(OUTPUT_ROOT).as_posix(),
                }
            )

    now_text = _iso_now()
    provider_request = _build_provider_request_preview(model, normalized_payload, saved_assets)
    status = "waiting_provider"
    task = {
        "task_id": task_id,
        "model_id": model["id"],
        "model_name": model["name"],
        "provider": model["provider"],
        "integration_status": model["integration_status"],
        "input_mode": normalized_payload["input_mode"],
        "status": status,
        "status_label": "等待真实模型接入",
        "status_detail": "任务创建、参数校验、素材入库和状态查询都已打通；真实视频生成调用层尚未接入。",
        "created_at": now_text,
        "updated_at": now_text,
        "prompt": normalized_payload["prompt"],
        "negative_prompt": normalized_payload.get("negative_prompt"),
        "parameters": normalized_payload["parameters"],
        "assets": saved_assets,
        "provider_request_preview": provider_request,
        "result": {
            "videos": [],
            "placeholder_message": "当前任务已建档，但还没有真实视频结果。接入供应商后，这里会返回视频 URL 和缩略图信息。",
            "next_step": "下一步只需要在后端 provider 调用层补齐真实 submit / poll 逻辑，即可把结果回写到当前任务结构。",
        },
    }

    _write_task(task_dir / "task.json", task)
    return task


def _normalize_task_payload(raw_payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw_payload, dict):
        raise ValueError("视频生成请求格式不正确。")

    model_id = str(raw_payload.get("model_id") or "").strip()
    if not model_id:
        raise ValueError("请选择视频生成模型。")

    input_mode = str(raw_payload.get("input_mode") or "").strip()
    if input_mode not in SUPPORTED_INPUT_MODES:
        raise ValueError("当前输入方式不受支持。")

    prompt = str(raw_payload.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("请填写视频 Prompt。")

    model = _get_video_model(model_id)
    input_mode_capability = _get_input_mode_capability(model, input_mode)

    aspect_ratio = str(raw_payload.get("aspect_ratio") or "").strip()
    if aspect_ratio not in model["supported_aspect_ratios"]:
        raise ValueError("当前模型不支持这个视频比例。")

    quality = str(raw_payload.get("quality") or "").strip()
    quality_ids = {item["id"] for item in model["qualities"]}
    if quality not in quality_ids:
        raise ValueError("当前模型不支持这个清晰度。")

    duration_seconds = _parse_int(raw_payload.get("duration_seconds"), field_name="时长")
    duration_capability = model["duration"]
    if duration_seconds < duration_capability["min_seconds"] or duration_seconds > duration_capability["max_seconds"]:
        raise ValueError("当前模型不支持这个时长。")
    if (duration_seconds - duration_capability["min_seconds"]) % duration_capability["step_seconds"] != 0:
        raise ValueError("时长不符合当前模型的步进规则。")

    parameter_capabilities = {
        parameter["key"]: parameter for parameter in model.get("supported_parameters", [])
    }
    parameters: dict[str, Any] = {
        "aspect_ratio": aspect_ratio,
        "duration_seconds": duration_seconds,
        "quality": quality,
    }

    negative_prompt = raw_payload.get("negative_prompt")
    if "negative_prompt" in parameter_capabilities:
        negative_prompt_text = str(negative_prompt or "").strip()
        if negative_prompt_text:
            parameters["negative_prompt"] = negative_prompt_text
    elif str(negative_prompt or "").strip():
        raise ValueError(f"{model['name']} 暂不支持负向 Prompt。")

    seed = raw_payload.get("seed")
    if "seed" in parameter_capabilities:
        if seed not in (None, ""):
            parameters["seed"] = _parse_int(seed, field_name="Seed")
    elif seed not in (None, ""):
        raise ValueError(f"{model['name']} 暂不支持 Seed。")

    for key in ("motion_strength", "camera_strength", "style_strength"):
        value = raw_payload.get(key)
        capability = parameter_capabilities.get(key)
        if capability is None:
            if value not in (None, ""):
                raise ValueError(f"{model['name']} 暂不支持参数：{key}")
            continue

        if value in (None, ""):
            continue

        parameters[key] = _parse_bounded_float(
            value,
            field_name=capability["label"],
            minimum=capability.get("min"),
            maximum=capability.get("max"),
        )

    return {
        "model_id": model_id,
        "input_mode": input_mode_capability["mode"],
        "prompt": prompt,
        "negative_prompt": parameters.get("negative_prompt"),
        "parameters": parameters,
    }


def _build_provider_request_preview(
    model: dict[str, Any],
    normalized_payload: dict[str, Any],
    saved_assets: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "provider": model["provider"],
        "model": model["id"],
        "input_mode": normalized_payload["input_mode"],
        "prompt": normalized_payload["prompt"],
        "parameters": normalized_payload["parameters"],
        "assets": [
            {
                "slot_id": asset["slot_id"],
                "name": asset["name"],
                "relative_path": asset["relative_path"],
            }
            for asset in saved_assets
        ],
        "dispatch_ready": False,
    }


def _validate_uploaded_assets(
    input_mode_capability: dict[str, Any],
    uploaded_assets: dict[str, list[UploadFile]],
) -> None:
    slot_capabilities = {
        slot["id"]: slot for slot in input_mode_capability.get("asset_slots", [])
    }

    for slot_id in uploaded_assets:
        if slot_id not in slot_capabilities:
            raise ValueError(f"当前输入方式不接受素材槽位：{slot_id}")

    for slot_id, capability in slot_capabilities.items():
        files = uploaded_assets.get(slot_id, [])
        file_count = len(files)
        if not capability.get("optional") and file_count < capability.get("min_files", 0):
            raise ValueError(f"请上传素材：{capability['label']}")
        if file_count > capability.get("max_files", file_count):
            raise ValueError(f"{capability['label']} 最多支持 {capability['max_files']} 个文件。")


def _get_video_model(model_id: str) -> dict[str, Any]:
    for model in VIDEO_MODEL_CAPABILITIES:
        if model["id"] == model_id:
            return model
    raise ValueError(f"未找到视频模型：{model_id}")


def _get_input_mode_capability(model: dict[str, Any], input_mode: str) -> dict[str, Any]:
    for capability in model.get("supported_input_modes", []):
        if capability["mode"] == input_mode:
            return capability
    raise ValueError(f"{model['name']} 暂不支持当前输入方式。")


def _parse_int(value: Any, *, field_name: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field_name} 必须是整数。") from error


def _parse_bounded_float(
    value: Any,
    *,
    field_name: str,
    minimum: float | None,
    maximum: float | None,
) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field_name} 必须是数字。") from error

    if minimum is not None and parsed < minimum:
        raise ValueError(f"{field_name} 不能小于 {minimum}。")
    if maximum is not None and parsed > maximum:
        raise ValueError(f"{field_name} 不能大于 {maximum}。")

    return parsed


def _save_upload(file: UploadFile, target_path: Path) -> int:
    with target_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return target_path.stat().st_size


def _safe_stem(source: str) -> str:
    cleaned = "".join(char if char.isalnum() or char in {"-", "_"} else "-" for char in source).strip("-_")
    return cleaned or "asset"


def _iso_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _write_task(task_path: Path, payload: dict[str, Any]) -> None:
    task_path.parent.mkdir(parents=True, exist_ok=True)
    task_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
