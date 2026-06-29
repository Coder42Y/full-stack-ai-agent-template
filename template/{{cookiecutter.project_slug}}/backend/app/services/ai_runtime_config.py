{%- if cookiecutter.enable_teams and cookiecutter.enable_rag and cookiecutter.use_jwt and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
"""Runtime AI configuration stored outside secrets.

The JSON file managed here contains only non-secret runtime choices such as
model, temperature, and thinking effort. API keys remain in environment vars.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.config import settings

ThinkingEffort = Literal["off", "low", "medium", "high"]


class AIConfigError(ValueError):
    """Raised when a runtime AI config update is invalid."""


class AIModelOption(BaseModel):
    """Selectable model option exposed to the chat controls."""

    id: str
    label: str
    role: Literal["fast", "balanced", "reasoning", "custom"] = "custom"
    provider: str = "glm"
    supports_thinking: bool = True
    supports_reasoning_effort: bool = False


class AIRuntimeConfig(BaseModel):
    """Runtime config visible to the frontend and used by the gateway client."""

    provider: str = "glm-anthropic-compatible"
    base_url: str
    model: str
    temperature: float | None = Field(default=None, ge=0, le=1)
    thinking_effort: ThinkingEffort = "off"
    max_tokens: int = Field(default=1800, ge=256, le=128000)
    models: list[AIModelOption] = Field(default_factory=list)
    effective_model: str = ""
    config_path: str = ""


class AIRuntimeConfigUpdate(BaseModel):
    """Patch payload for runtime AI config."""

    model: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=1)
    thinking_effort: ThinkingEffort | None = None
    max_tokens: int | None = Field(default=None, ge=256, le=128000)
    base_url: str | None = None

    @field_validator("model", "base_url")
    @classmethod
    def _strip_non_empty(cls, value: str | None) -> str | None:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Value cannot be empty")
        return cleaned


def get_ai_runtime_config() -> AIRuntimeConfig:
    """Read the persisted AI config, merged with env-derived model options."""
    defaults = _default_config()
    path = _config_path()
    data = _dump_for_write(defaults)

    if path.exists():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            raw = {}
        if isinstance(raw, dict):
            for key in ("provider", "base_url", "model", "temperature", "thinking_effort", "max_tokens"):
                if key in raw:
                    data[key] = raw[key]
            if isinstance(raw.get("models"), list):
                data["models"] = raw["models"]

    return _normalize(AIRuntimeConfig.model_validate(data), path)


def update_ai_runtime_config(update: AIRuntimeConfigUpdate) -> AIRuntimeConfig:
    """Patch and persist the runtime AI config as JSON."""
    current = get_ai_runtime_config()
    data = _dump_for_write(current)
    update_data = update.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        data[key] = value

    config = _normalize(AIRuntimeConfig.model_validate(data), _config_path(), strict_model=True)
    _write_config(config)
    return get_ai_runtime_config()


def _config_path() -> Path:
    configured = getattr(settings, "AI_RUNTIME_CONFIG_PATH", Path("./runtime_ai_config.json"))
    return Path(configured)


def _default_config() -> AIRuntimeConfig:
    models = _default_models()
    selected_model = (
        _setting("ANTHROPIC_MODEL")
        or _setting("ANTHROPIC_DEFAULT_SONNET_MODEL")
        or _setting("ANTHROPIC_DEFAULT_HAIKU_MODEL")
        or _setting("ANTHROPIC_REASONING_MODEL")
        or _setting("AI_MODEL")
        or (models[0].id if models else "glm-4.7")
    )
    temperature = _clamp_temperature(getattr(settings, "AI_TEMPERATURE", 0.7))
    base_url = _setting("ANTHROPIC_BASE_URL") or "https://open.bigmodel.cn/api/anthropic"
    return _normalize(
        AIRuntimeConfig(
            base_url=base_url,
            model=selected_model,
            temperature=temperature,
            thinking_effort="off",
            max_tokens=1800,
            models=models,
        ),
        _config_path(),
    )


def _default_models() -> list[AIModelOption]:
    candidates: list[tuple[str, str]] = [
        (_setting("ANTHROPIC_DEFAULT_HAIKU_MODEL"), "fast"),
        (_setting("ANTHROPIC_DEFAULT_SONNET_MODEL"), "balanced"),
        (_setting("ANTHROPIC_DEFAULT_OPUS_MODEL"), "reasoning"),
        (_setting("ANTHROPIC_REASONING_MODEL"), "reasoning"),
        (_setting("ANTHROPIC_MODEL"), "custom"),
    ]

    for fallback, role in (
        ("glm-4.5-air", "fast"),
        ("glm-4.7", "balanced"),
        ("glm-5.2", "reasoning"),
    ):
        candidates.append((fallback, role))

    seen: set[str] = set()
    options: list[AIModelOption] = []
    for model, role in candidates:
        model = model.strip()
        if not model or model in seen:
            continue
        seen.add(model)
        options.append(
            AIModelOption(
                id=model,
                label=_label_for_model(model),
                role=role,  # type: ignore[arg-type]
                provider="glm" if model.lower().startswith("glm-") else "custom",
                supports_thinking=_supports_thinking(model),
                supports_reasoning_effort=_supports_reasoning_effort(model),
            )
        )
    return options


def _normalize(
    config: AIRuntimeConfig,
    path: Path,
    *,
    strict_model: bool = False,
) -> AIRuntimeConfig:
    glm_gateway = _is_glm_gateway(config)
    default_by_id = {model.id: model for model in _default_models()}
    merged: dict[str, AIModelOption] = {}
    raw_models = [*config.models, *default_by_id.values()]
    if glm_gateway:
        raw_models = [model for model in raw_models if model.id.lower().startswith("glm-")]

    for model in raw_models:
        if model.id not in merged:
            merged[model.id] = model

    if strict_model and config.model not in merged:
        raise AIConfigError(f"Unknown AI model: {config.model}")

    if glm_gateway and config.model and not config.model.lower().startswith("glm-"):
        config = config.model_copy(update={"model": "glm-4.7"})

    if config.model and config.model not in merged:
        merged[config.model] = AIModelOption(
            id=config.model,
            label=_label_for_model(config.model),
            role="custom",
            provider="custom",
            supports_thinking=_supports_thinking(config.model),
            supports_reasoning_effort=_supports_reasoning_effort(config.model),
        )

    models = list(merged.values())
    effective_model = config.model
    selected = merged.get(config.model)
    if config.thinking_effort != "off" and selected and not selected.supports_thinking:
        reasoning = next((model for model in models if model.role == "reasoning"), None)
        if reasoning:
            effective_model = reasoning.id

    return config.model_copy(
        update={
            "base_url": config.base_url.rstrip("/"),
            "temperature": _clamp_temperature(config.temperature),
            "models": models,
            "effective_model": effective_model,
            "config_path": str(path),
        }
    )


def _write_config(config: AIRuntimeConfig) -> None:
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(f"{path.suffix}.tmp")
    tmp_path.write_text(
        json.dumps(_dump_for_write(config), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    tmp_path.replace(path)


def _dump_for_write(config: AIRuntimeConfig) -> dict[str, object]:
    return config.model_dump(exclude={"config_path", "effective_model"})


def _setting(name: str) -> str:
    return str(getattr(settings, name, "") or "").strip()


def _clamp_temperature(value: float | None) -> float | None:
    if value is None:
        return None
    return min(1.0, max(0.0, float(value)))


def _label_for_model(model: str) -> str:
    lower = model.lower()
    if lower.startswith("glm-"):
        return "GLM-" + model[4:]
    return model


def _supports_thinking(model: str) -> bool:
    lower = model.lower()
    return lower.startswith("glm-") or "claude" in lower


def _supports_reasoning_effort(model: str) -> bool:
    lower = model.lower()
    return lower.startswith("glm-5")


def _is_glm_gateway(config: AIRuntimeConfig | None = None) -> bool:
    if config and config.provider.lower().startswith("glm"):
        return True
    base_url = (config.base_url if config else _setting("ANTHROPIC_BASE_URL")).lower()
    if "bigmodel.cn" in base_url or "z.ai" in base_url:
        return True
    configured_models: list[str] = []
    if config:
        configured_models.extend([config.model, *[model.id for model in config.models]])
    configured_models.extend(
        _setting(name)
        for name in (
            "ANTHROPIC_MODEL",
            "ANTHROPIC_REASONING_MODEL",
            "ANTHROPIC_DEFAULT_OPUS_MODEL",
            "ANTHROPIC_DEFAULT_HAIKU_MODEL",
            "ANTHROPIC_DEFAULT_SONNET_MODEL",
        )
    )
    return any(
        model.lower().startswith("glm-")
        for model in configured_models
        if model
    )
{%- else %}
"""Runtime AI configuration is not enabled for this template combination."""
{%- endif %}
