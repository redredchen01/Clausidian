"""
Pipeline 配置 — Pydantic v2 model，支援 YAML 加載
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple

import yaml
from pydantic import BaseModel, Field, model_validator


class InputConfig(BaseModel):
    path: str = ""
    start_sec: Optional[float] = Field(None, ge=0)
    end_sec: Optional[float] = Field(None, ge=0)

    model_config = {"extra": "ignore"}


class DetectionConfig(BaseModel):
    backend: str = Field("easyocr", pattern="^(easyocr|paddleocr)$")
    detect_interval: int = Field(10, ge=1, le=300)
    bbox_padding: int = Field(6, ge=0, le=50)
    confidence_threshold: float = Field(0.3, ge=0.0, le=1.0)
    min_area: int = Field(200, ge=0)
    edge_region_only: bool = False

    model_config = {"extra": "ignore"}


class TrackingConfig(BaseModel):
    center_dist_threshold: float = Field(80.0, gt=0.0)
    match_cost_threshold: float = Field(1.5, ge=0.0)
    ema_alpha: float = Field(0.5, ge=0.0, le=1.0)
    step_threshold: float = Field(50.0, ge=0.0)
    gap_tolerance: int = Field(5, ge=0)

    model_config = {"extra": "ignore"}


class MaskConfig(BaseModel):
    expand_px: int = Field(4, ge=0, le=100)
    feather_radius: int = Field(0, ge=0, le=50)

    model_config = {"extra": "ignore"}


class RemoveConfig(BaseModel):
    strategy: str = Field("gaussian_blur", pattern="^(gaussian_blur|solid|delogo)$")
    blur_ksize: int = Field(51, ge=1)
    solid_color: Tuple[int, int, int] = (0, 0, 0)
    delogo_band: int = Field(4, ge=1)

    model_config = {"extra": "ignore"}

    @model_validator(mode="after")
    def blur_ksize_must_be_odd(self) -> "RemoveConfig":
        if self.blur_ksize % 2 == 0:
            raise ValueError(f"blur_ksize must be odd, got {self.blur_ksize}")
        return self


class WatermarkConfig(BaseModel):
    enabled: bool = True
    type: str = Field("text", pattern="^(text|image)$")
    text: str = "© 2026"
    image_path: Optional[str] = None
    position: str = Field("bottom-right", pattern="^(top-left|top-right|bottom-left|bottom-right|center)$")
    opacity: float = Field(0.7, ge=0.0, le=1.0)
    scale: float = Field(1.0, gt=0.0)
    margin: int = Field(20, ge=0)
    start_sec: Optional[float] = None
    end_sec: Optional[float] = None

    model_config = {"extra": "ignore"}


class DebugConfig(BaseModel):
    enabled: bool = False
    output_dir: str = "debug"

    model_config = {"extra": "ignore"}


class PipelineConfig(BaseModel):
    input: InputConfig = Field(default_factory=InputConfig)
    detection: DetectionConfig = Field(default_factory=DetectionConfig)
    tracking: TrackingConfig = Field(default_factory=TrackingConfig)
    mask: MaskConfig = Field(default_factory=MaskConfig)
    remove: RemoveConfig = Field(default_factory=RemoveConfig)
    watermark: WatermarkConfig = Field(default_factory=WatermarkConfig)
    debug: DebugConfig = Field(default_factory=DebugConfig)

    model_config = {"extra": "ignore"}


def load_config(yaml_path: str) -> PipelineConfig:
    """從 YAML 文件加載並驗證 PipelineConfig"""
    path = Path(yaml_path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {yaml_path}")
    with open(path) as f:
        data = yaml.safe_load(f) or {}
    return PipelineConfig.model_validate(data)
