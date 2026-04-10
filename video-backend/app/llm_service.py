from __future__ import annotations

import base64
import json
import logging
import mimetypes
import os
import re
import time
from pathlib import Path
from typing import Any

import requests as _requests
from urllib.parse import urlparse


logger = logging.getLogger(__name__)


def _load_env_files() -> None:
    candidates = [
        Path(__file__).resolve().parents[1] / ".env",
        Path(__file__).resolve().parents[2] / ".env",
    ]

    for env_path in candidates:
        if not env_path.exists():
            continue

        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("'").strip('"'))


_load_env_files()


DEFAULT_LLM_TIMEOUT_SECONDS = 120.0
REQUIRED_LLM_FIELDS = ("base_url", "api_key", "model")


def _llm_config_file_path() -> Path:
    configured_path = os.getenv("WORKBENCH_LLM_CONFIG_FILE", "").strip()
    if configured_path:
        return Path(configured_path).expanduser()
    return Path(__file__).resolve().parents[1] / ".runtime" / "llm_config.json"


def _normalize_base_url(value: str) -> str:
    return value.strip().rstrip("/")


def _parse_timeout_seconds(value: Any) -> float:
    if value in (None, ""):
        return DEFAULT_LLM_TIMEOUT_SECONDS

    try:
        timeout_seconds = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError("timeout_seconds 必须是数字") from error

    if timeout_seconds <= 0:
        raise ValueError("timeout_seconds 必须大于 0")

    return timeout_seconds


def _validate_base_url(value: str) -> str:
    normalized = _normalize_base_url(value)
    if not normalized:
        return ""

    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("base_url 必须是有效的 http/https 地址")

    return normalized


def _mask_api_key(api_key: str) -> str:
    normalized = api_key.strip()
    if not normalized:
        return ""
    if len(normalized) <= 8:
        return "*" * len(normalized)
    return f"{normalized[:4]}{'*' * (len(normalized) - 8)}{normalized[-4:]}"


def _build_llm_config(
    *,
    base_url: str,
    api_key: str,
    model: str,
    timeout_seconds: float,
    source: str,
    config_error: str | None = None,
) -> dict[str, Any]:
    return {
        "configured": bool(base_url and api_key and model and not config_error),
        "base_url": base_url,
        "api_key": api_key,
        "model": model,
        "timeout_seconds": timeout_seconds,
        "source": source,
        "config_error": config_error,
    }


def _normalize_llm_payload(payload: dict[str, Any], *, source: str) -> dict[str, Any]:
    return _build_llm_config(
        base_url=_validate_base_url(str(payload.get("base_url") or "")),
        api_key=str(payload.get("api_key") or "").strip(),
        model=str(payload.get("model") or "").strip(),
        timeout_seconds=_parse_timeout_seconds(payload.get("timeout_seconds")),
        source=source,
    )


def _read_saved_llm_config() -> dict[str, Any] | None:
    config_path = _llm_config_file_path()
    if not config_path.exists():
        return None

    try:
        raw_payload = json.loads(config_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        return _build_llm_config(
            base_url="",
            api_key="",
            model="",
            timeout_seconds=DEFAULT_LLM_TIMEOUT_SECONDS,
            source="file",
            config_error=f"模型配置文件不是合法 JSON：{error.msg}",
        )
    except OSError as error:
        return _build_llm_config(
            base_url="",
            api_key="",
            model="",
            timeout_seconds=DEFAULT_LLM_TIMEOUT_SECONDS,
            source="file",
            config_error=f"读取模型配置文件失败：{error}",
        )

    if not isinstance(raw_payload, dict):
        return _build_llm_config(
            base_url="",
            api_key="",
            model="",
            timeout_seconds=DEFAULT_LLM_TIMEOUT_SECONDS,
            source="file",
            config_error="模型配置文件格式错误，顶层必须是对象",
        )

    try:
        return _normalize_llm_payload(raw_payload, source="file")
    except ValueError as error:
        return _build_llm_config(
            base_url="",
            api_key="",
            model="",
            timeout_seconds=DEFAULT_LLM_TIMEOUT_SECONDS,
            source="file",
            config_error=str(error),
        )


def _env_llm_payload() -> dict[str, Any]:
    return {
        "base_url": os.getenv("WORKBENCH_LLM_BASE_URL", ""),
        "api_key": os.getenv("WORKBENCH_LLM_API_KEY", ""),
        "model": os.getenv("WORKBENCH_LLM_MODEL", ""),
        "timeout_seconds": os.getenv("WORKBENCH_LLM_TIMEOUT_SECONDS", str(DEFAULT_LLM_TIMEOUT_SECONDS)),
    }


def _set_runtime_llm_env(config: dict[str, Any]) -> None:
    os.environ["WORKBENCH_LLM_BASE_URL"] = config["base_url"]
    os.environ["WORKBENCH_LLM_API_KEY"] = config["api_key"]
    os.environ["WORKBENCH_LLM_MODEL"] = config["model"]
    os.environ["WORKBENCH_LLM_TIMEOUT_SECONDS"] = str(config["timeout_seconds"])


def llm_config() -> dict[str, Any]:
    saved_config = _read_saved_llm_config()
    if saved_config is not None:
        return saved_config

    env_payload = _env_llm_payload()
    source = (
        "env"
        if any(str(env_payload[key]).strip() for key in ("base_url", "api_key", "model"))
        else "none"
    )

    try:
        return _normalize_llm_payload(env_payload, source=source)
    except ValueError as error:
        return _build_llm_config(
            base_url="",
            api_key="",
            model="",
            timeout_seconds=DEFAULT_LLM_TIMEOUT_SECONDS,
            source=source,
            config_error=f".env 中的模型配置无效：{error}",
        )


def save_llm_config(
    *,
    base_url: str | None = None,
    api_key: str | None = None,
    model: str | None = None,
    timeout_seconds: float | None = None,
    preserve_api_key: bool = True,
) -> dict[str, Any]:
    current_config = llm_config()
    next_api_key = current_config["api_key"]

    if not preserve_api_key or api_key not in (None, ""):
        next_api_key = str(api_key or "").strip()

    next_config = _normalize_llm_payload(
        {
            "base_url": current_config["base_url"] if base_url is None else base_url,
            "api_key": next_api_key,
            "model": current_config["model"] if model is None else model,
            "timeout_seconds": current_config["timeout_seconds"] if timeout_seconds is None else timeout_seconds,
        },
        source="file",
    )

    config_path = _llm_config_file_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        json.dumps(
            {
                "base_url": next_config["base_url"],
                "api_key": next_config["api_key"],
                "model": next_config["model"],
                "timeout_seconds": next_config["timeout_seconds"],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    _set_runtime_llm_env(next_config)
    return llm_public_status()


def ensure_llm_configured(action: str = "当前操作") -> dict[str, Any]:
    config = llm_config()
    if config["configured"]:
        return config

    missing_keys = [key for key in REQUIRED_LLM_ENV_KEYS if not os.getenv(key, "").strip()]
    missing_text = "、".join(missing_keys) if missing_keys else "LLM 配置项"
    raise RuntimeError(f"{action}需要先配置模型，请设置 {missing_text}。")


def llm_public_status() -> dict[str, Any]:
    config = llm_config()
    return {
        "configured": config["configured"],
        "base_url": config["base_url"],
        "model": config["model"],
    }


def ensure_llm_configured(action: str = "当前操作") -> dict[str, Any]:
    config = llm_config()
    if config.get("config_error"):
        raise RuntimeError(f"{action}前需要先修复模型配置：{config['config_error']}")
    if config["configured"]:
        return config

    missing_keys = [key for key in REQUIRED_LLM_FIELDS if not str(config.get(key) or "").strip()]
    missing_text = "、".join(missing_keys) if missing_keys else "LLM 配置项"
    raise RuntimeError(f"{action}前需要先配置模型，请至少填写 {missing_text}。")


def llm_public_status() -> dict[str, Any]:
    config = llm_config()
    return {
        "configured": config["configured"],
        "base_url": config["base_url"],
        "model": config["model"],
        "timeout_seconds": config["timeout_seconds"],
        "has_api_key": bool(config["api_key"]),
        "api_key_masked": _mask_api_key(config["api_key"]),
        "source": config["source"],
        "config_error": config.get("config_error"),
    }


class LLMJSONParseError(RuntimeError):
    def __init__(self, response_label: str, detail: str, raw_text: str):
        preview = _preview_text(raw_text)
        message = f"{response_label}返回的内容无法解析为合法 JSON：{detail}"
        if preview:
            message = f"{message}。响应预览：{preview}"
        super().__init__(message)
        self.response_label = response_label
        self.detail = detail
        self.raw_text = raw_text


def _preview_text(text: str, limit: int = 240) -> str:
    compact = " ".join(text.split())
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 1]}..."


def _dedupe_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def _strip_thinking_tags(text: str) -> str:
    # Handle closed <thinking>...</thinking> blocks (greedy to catch nested content)
    result = re.sub(r"<thinking>[\s\S]*?</thinking>", "", text, flags=re.IGNORECASE)
    # Handle unclosed <thinking> tags — strip everything from <thinking> to end if no closing tag
    result = re.sub(r"<thinking>[\s\S]*$", "", result, flags=re.IGNORECASE)
    # Handle </thinking> leftover without opening tag
    result = re.sub(r"^[\s\S]*?</thinking>", "", result, flags=re.IGNORECASE)
    return result.strip()


def _extract_json_candidates(raw_text: str) -> list[str]:
    text = raw_text.strip().lstrip("\ufeff")
    if not text:
        return []

    # Strip <thinking>...</thinking> blocks that some models emit
    cleaned = _strip_thinking_tags(text)

    candidates: list[str] = []
    # Search in both cleaned and original text
    for source in ([cleaned, text] if cleaned != text else [text]):
        fenced_blocks = re.findall(r"```(?:json)?\s*([\s\S]*?)```", source, flags=re.IGNORECASE)
        candidates.extend(block.strip() for block in fenced_blocks if block.strip())
        candidates.append(source)

    for candidate in list(candidates):
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidates.append(candidate[start : end + 1])

    return _dedupe_preserve_order(candidates)


def _next_non_whitespace_char(text: str, start: int) -> str | None:
    for index in range(start, len(text)):
        if not text[index].isspace():
            return text[index]
    return None


def _looks_like_unicode_escape(text: str, index: int) -> bool:
    if index >= len(text) or text[index] != "u" or index + 4 >= len(text):
        return False

    digits = text[index + 1 : index + 5]
    return len(digits) == 4 and all(char in "0123456789abcdefABCDEF" for char in digits)


def _replace_python_style_literals(text: str) -> str:
    replacements = {
        "True": "true",
        "False": "false",
        "None": "null",
    }

    result: list[str] = []
    in_string = False
    escape = False
    index = 0

    while index < len(text):
        char = text[index]
        if in_string:
            result.append(char)
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            index += 1
            continue

        if char == '"':
            in_string = True
            result.append(char)
            index += 1
            continue

        matched = False
        for source, target in replacements.items():
            if not text.startswith(source, index):
                continue

            prev_char = text[index - 1] if index > 0 else ""
            next_pos = index + len(source)
            next_char = text[next_pos] if next_pos < len(text) else ""
            if (prev_char.isalnum() or prev_char == "_") or (next_char.isalnum() or next_char == "_"):
                continue

            result.append(target)
            index += len(source)
            matched = True
            break

        if matched:
            continue

        result.append(char)
        index += 1

    return "".join(result)


def _repair_json_string_content(text: str) -> str:
    result: list[str] = []
    container_stack: list[str] = []
    last_significant_outside: str | None = None
    in_string = False
    string_kind = "value"
    escape = False
    index = 0

    while index < len(text):
        char = text[index]

        if in_string:
            if escape:
                result.append(char)
                escape = False
                index += 1
                continue

            if char == "\\":
                next_char = text[index + 1] if index + 1 < len(text) else ""
                if next_char in {'"', "\\", "/", "b", "f", "n", "r", "t"}:
                    result.append(char)
                    escape = True
                elif next_char == "u" and _looks_like_unicode_escape(text, index + 1):
                    result.append(char)
                    escape = True
                else:
                    result.append("\\\\")
                index += 1
                continue

            if char == '"':
                next_char = _next_non_whitespace_char(text, index + 1)
                is_key_close = string_kind == "key" and next_char == ":"
                is_value_close = string_kind != "key" and next_char in {None, ",", "}", "]"}
                if is_key_close or is_value_close:
                    in_string = False
                    string_kind = "value"
                    result.append(char)
                else:
                    result.append('\\"')
                index += 1
                continue

            if char == "\n":
                result.append("\\n")
            elif char == "\r":
                result.append("\\r")
            elif char == "\t":
                result.append("\\t")
            elif ord(char) < 0x20:
                result.append(f"\\u{ord(char):04x}")
            else:
                result.append(char)

            index += 1
            continue

        if char == '"':
            current_container = container_stack[-1] if container_stack else None
            if current_container == "{" and last_significant_outside in {None, "{", ","}:
                string_kind = "key"
            else:
                string_kind = "value"
            in_string = True
            result.append(char)
            index += 1
            continue

        result.append(char)
        if char in "{[":
            container_stack.append(char)
        elif char == "}" and container_stack and container_stack[-1] == "{":
            container_stack.pop()
        elif char == "]" and container_stack and container_stack[-1] == "[":
            container_stack.pop()

        if not char.isspace():
            last_significant_outside = char
        index += 1

    return "".join(result)


def _remove_trailing_commas(text: str) -> str:
    previous = None
    current = text
    while previous != current:
        previous = current
        current = re.sub(r",(?=\s*[}\]])", "", current)
    return current


def _replace_cjk_structural_punctuation(text: str) -> str:
    """Replace Chinese colons and commas in JSON structural positions only."""
    result: list[str] = []
    in_string = False
    escape = False

    for char in text:
        if in_string:
            result.append(char)
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            result.append(char)
        elif char == "：":  # Chinese full-width colon
            result.append(":")
        elif char == "，":  # Chinese full-width comma
            result.append(",")
        elif char == "、":  # Chinese enumeration comma
            result.append(",")
        else:
            result.append(char)

    return "".join(result)


def _repair_json_candidate(text: str) -> str:
    repaired = text.strip().lstrip("\ufeff")
    repaired = repaired.translate(
        str.maketrans(
            {
                "“": '"',
                "”": '"',
                "„": '"',
                "‟": '"',
                "’": "'",
                "‘": "'",
                "\u00a0": " ",
            }
        )
    )
    repaired = _replace_cjk_structural_punctuation(repaired)
    repaired = _replace_python_style_literals(repaired)
    repaired = _remove_trailing_commas(repaired)
    repaired = _repair_json_string_content(repaired)
    repaired = _remove_trailing_commas(repaired)
    return repaired


def _json_error_detail(error: json.JSONDecodeError) -> str:
    return f"{error.msg} (line {error.lineno}, column {error.colno})"


def _extract_json_object(raw_text: str, *, response_label: str = "LLM 响应") -> dict[str, Any]:
    # Debug: dump raw LLM response to file for diagnosis
    _debug_dir = Path(__file__).resolve().parents[1] / "output" / "_debug"
    _debug_dir.mkdir(parents=True, exist_ok=True)
    import datetime as _dt
    _debug_ts = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    (_debug_dir / f"{response_label}_{_debug_ts}_raw.txt").write_text(raw_text, encoding="utf-8")

    candidates = _extract_json_candidates(raw_text)
    if not candidates:
        logger.error("%s 没有返回可提取的 JSON 候选。", response_label)
        raise LLMJSONParseError(response_label, "响应为空，或未找到 JSON 对象", raw_text)

    last_decode_error: json.JSONDecodeError | None = None
    saw_non_object_payload = False

    for idx, candidate in enumerate(candidates):
        variants = [
            ("raw", candidate),
            ("repaired", _repair_json_candidate(candidate)),
        ]
        for strategy_name, variant in variants:
            (_debug_dir / f"{response_label}_{_debug_ts}_candidate{idx}_{strategy_name}.txt").write_text(variant, encoding="utf-8")
            try:
                parsed = json.loads(variant)
            except json.JSONDecodeError as error:
                last_decode_error = error
                continue

            if not isinstance(parsed, dict):
                saw_non_object_payload = True
                continue

            if strategy_name != "raw":
                logger.warning("%s 返回了非严格 JSON，已通过 %s 自动修复。", response_label, strategy_name)
            return parsed

    if saw_non_object_payload and last_decode_error is None:
        logger.error("%s 解析成功，但根节点不是 JSON 对象。", response_label)
        raise LLMJSONParseError(response_label, "解析成功，但根节点不是 JSON 对象", raw_text)

    detail = _json_error_detail(last_decode_error) if last_decode_error else "未找到可解析的 JSON 对象"
    logger.error("%s JSON 解析失败，自动修复未成功。预览: %s", response_label, _preview_text(raw_text))
    raise LLMJSONParseError(
        response_label,
        f"已尝试提取 fenced JSON、裁剪对象范围并修复常见引号/转义问题，但仍失败：{detail}",
        raw_text,
    )


def _extract_message_text(body: dict[str, Any]) -> str:
    content = body.get("choices", [{}])[0].get("message", {}).get("content", "")
    if isinstance(content, str):
        return _strip_thinking_tags(content)

    if isinstance(content, list):
        text_parts = []
        for item in content:
            if not isinstance(item, dict):
                continue
            # Skip thinking blocks returned by extended-thinking models
            if item.get("type") in ("thinking", "reasoning"):
                continue
            if item.get("type") == "text":
                text_value = item.get("text")
                if isinstance(text_value, str):
                    text_parts.append(text_value)
        result = "\n".join(part for part in text_parts if part.strip())
        return _strip_thinking_tags(result)

    return ""


def image_path_to_data_url(image_path: str | Path) -> str:
    path = Path(image_path)
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {path}")

    mime_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def make_text_content(text: str) -> dict[str, Any]:
    return {"type": "text", "text": text}


def make_image_content(image_path: str | Path) -> dict[str, Any]:
    return {
        "type": "image_url",
        "image_url": {
            "url": image_path_to_data_url(image_path),
        },
    }


class LLMRequestError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


_RETRYABLE_EXCEPTIONS = (
    _requests.exceptions.ConnectionError,
    _requests.exceptions.Timeout,
    ConnectionResetError,
    OSError,
)

_MAX_RETRIES = 3

# Persistent session that bypasses system proxies.
_llm_session = _requests.Session()
_llm_session.trust_env = False  # ignore system/registry proxy settings


def _request_llm_json(
    config: dict[str, Any],
    *,
    path: str,
    method: str = "POST",
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {config['api_key']}",
        "User-Agent": "virus-video-workbench/1.0",
    }

    url = f"{config['base_url']}{path}"
    timeout = config["timeout_seconds"]

    last_error: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            resp = _llm_session.request(
                method,
                url,
                headers=headers,
                json=payload if method == "POST" and payload is not None else None,
                timeout=timeout,
            )
            resp.raise_for_status()
            try:
                return resp.json()
            except ValueError as error:
                detail = _json_error_detail(error)
                raise LLMRequestError(f"LLM gateway returned invalid JSON: {detail}") from error
        except _requests.exceptions.HTTPError as error:
            detail = error.response.text if error.response is not None else str(error)
            status_code = error.response.status_code if error.response is not None else None
            raise LLMRequestError(f"LLM HTTP {status_code}: {detail}", status_code=status_code) from error
        except _RETRYABLE_EXCEPTIONS as error:
            last_error = error
            delay = (attempt + 1) * 2
            logger.warning("LLM request attempt %d/%d failed (%s), retrying in %ds...", attempt + 1, _MAX_RETRIES, error, delay)
            if attempt < _MAX_RETRIES - 1:
                time.sleep(delay)
                continue

            reason = str(error)
            raise LLMRequestError(f"LLM request failed after {_MAX_RETRIES} attempts: {reason}") from error

    raise LLMRequestError(f"LLM request failed: {last_error}") from last_error


def test_llm_connection() -> dict[str, Any]:
    config = ensure_llm_configured("测试模型配置")
    started_at = time.perf_counter()
    detail = "已通过 /models 完成连通性检查"

    try:
        models_payload = _request_llm_json(config, path="/models", method="GET")
        available_models = [
            str(item.get("id") or "").strip()
            for item in models_payload.get("data", [])
            if isinstance(item, dict) and str(item.get("id") or "").strip()
        ]
        if available_models and config["model"] not in available_models:
            raise RuntimeError(f"当前模型不在远端返回的列表中：{config['model']}")
    except LLMRequestError as error:
        if error.status_code not in {404, 405, 501}:
            raise RuntimeError(str(error)) from error

        _request_llm_json(
            config,
            path="/chat/completions",
            payload={
                "model": config["model"],
                "messages": [{"role": "user", "content": "Reply with OK"}],
                "temperature": 0,
                "max_tokens": 1,
            },
        )
        detail = "已通过 /chat/completions 完成连通性检查（/models 不可用）"

    latency_ms = int((time.perf_counter() - started_at) * 1000)
    return {
        "ok": True,
        "detail": detail,
        "latency_ms": latency_ms,
        "llm": llm_public_status(),
    }


def chat_completion(
    *,
    messages: list[dict[str, Any]],
    temperature: float = 0.4,
    max_tokens: int = 3200,
) -> dict[str, Any]:
    config = ensure_llm_configured("调用模型")
    payload: dict[str, Any] = {
        "model": config["model"],
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    # For thinking models, set a large budget so thinking doesn't eat into output
    model_name = str(config["model"]).lower()
    if "thinking" in model_name or "think" in model_name:
        payload["max_tokens"] = max(max_tokens * 3, 16384)
    return _request_llm_json(config, path="/chat/completions", payload=payload)


def chat_json(
    *,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.4,
    max_tokens: int = 3200,
    response_label: str = "LLM 响应",
) -> dict[str, Any]:
    return chat_json_messages(
        system_prompt=system_prompt,
        user_content=user_prompt,
        temperature=temperature,
        max_tokens=max_tokens,
        response_label=response_label,
    )


def chat_json_messages(
    *,
    system_prompt: str | None,
    user_content: str | list[dict[str, Any]],
    temperature: float = 0.4,
    max_tokens: int = 3200,
    response_label: str = "LLM 响应",
) -> dict[str, Any]:
    messages: list[dict[str, Any]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    messages.append({"role": "user", "content": user_content})

    body = chat_completion(
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    content = _extract_message_text(body)
    if not content.strip():
        raise RuntimeError("LLM returned empty content")

    return _extract_json_object(content, response_label=response_label)
