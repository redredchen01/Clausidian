"""Unit 1: Config Schema Tests"""
import tempfile
from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from src.config import PipelineConfig, load_config


class TestPipelineConfigDefaults:
    def test_default_construction(self):
        cfg = PipelineConfig()
        assert cfg.detection.backend == "easyocr"
        assert cfg.detection.detect_interval == 10
        assert cfg.remove.blur_ksize == 51
        assert cfg.watermark.enabled is True
        assert cfg.debug.enabled is False

    def test_all_sections_have_defaults(self):
        cfg = PipelineConfig()
        assert cfg.input is not None
        assert cfg.detection is not None
        assert cfg.tracking is not None
        assert cfg.mask is not None
        assert cfg.remove is not None
        assert cfg.watermark is not None
        assert cfg.debug is not None


class TestLoadConfig:
    def test_load_demo_yaml(self):
        demo = Path(__file__).parent.parent / "configs" / "demo.yaml"
        cfg = load_config(str(demo))
        assert cfg.input.path == "sample.mp4"
        assert cfg.detection.backend == "easyocr"
        assert cfg.detection.detect_interval == 10
        assert cfg.remove.strategy == "gaussian_blur"

    def test_load_minimal_yaml(self):
        data = {"input": {"path": "video.mp4"}}
        with tempfile.NamedTemporaryFile(suffix=".yaml", mode="w", delete=False) as f:
            yaml.dump(data, f)
            tmp = f.name
        cfg = load_config(tmp)
        assert cfg.input.path == "video.mp4"
        assert cfg.detection.detect_interval == 10  # default preserved

    def test_file_not_found(self):
        with pytest.raises(FileNotFoundError):
            load_config("/nonexistent/config.yaml")

    def test_unknown_fields_ignored(self):
        data = {"input": {"path": "x.mp4"}, "unknown_section": {"foo": "bar"}}
        with tempfile.NamedTemporaryFile(suffix=".yaml", mode="w", delete=False) as f:
            yaml.dump(data, f)
            tmp = f.name
        cfg = load_config(tmp)  # should not raise
        assert cfg.input.path == "x.mp4"

    def test_empty_yaml_uses_defaults(self):
        with tempfile.NamedTemporaryFile(suffix=".yaml", mode="w", delete=False) as f:
            f.write("")
            tmp = f.name
        cfg = load_config(tmp)
        assert cfg.detection.backend == "easyocr"


class TestValidation:
    def test_blur_ksize_even_raises(self):
        with pytest.raises(ValidationError, match="blur_ksize must be odd"):
            PipelineConfig.model_validate({"remove": {"blur_ksize": 52}})

    def test_blur_ksize_odd_ok(self):
        cfg = PipelineConfig.model_validate({"remove": {"blur_ksize": 51}})
        assert cfg.remove.blur_ksize == 51

    def test_invalid_backend(self):
        with pytest.raises(ValidationError):
            PipelineConfig.model_validate({"detection": {"backend": "lama"}})

    def test_invalid_strategy(self):
        with pytest.raises(ValidationError):
            PipelineConfig.model_validate({"remove": {"strategy": "inpaint"}})

    def test_invalid_position(self):
        with pytest.raises(ValidationError):
            PipelineConfig.model_validate({"watermark": {"position": "middle"}})

    def test_confidence_threshold_bounds(self):
        with pytest.raises(ValidationError):
            PipelineConfig.model_validate({"detection": {"confidence_threshold": 1.5}})
