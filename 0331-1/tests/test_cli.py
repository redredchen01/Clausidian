"""Unit 10: CLI Tests"""
import pytest

from src.app import parse_args


class TestParseArgs:
    def test_basic_required_args(self):
        args = parse_args(["--input", "x.mp4", "--output", "y.mp4", "--config", "demo.yaml"])
        assert args.input == "x.mp4"
        assert args.output == "y.mp4"
        assert args.config == "demo.yaml"

    def test_defaults(self):
        args = parse_args(["--input", "x.mp4", "--output", "y.mp4", "--config", "demo.yaml"])
        assert args.save_debug is False
        assert args.only_detect is False
        assert args.only_mask is False
        assert args.only_remove is False
        assert args.disable_add_watermark is False

    def test_only_detect_flag(self):
        args = parse_args(["--input", "x.mp4", "--output", "y.mp4", "--config", "c.yaml", "--only-detect"])
        assert args.only_detect is True

    def test_only_mask_flag(self):
        args = parse_args(["--input", "x.mp4", "--output", "y.mp4", "--config", "c.yaml", "--only-mask"])
        assert args.only_mask is True

    def test_only_remove_flag(self):
        args = parse_args(["--input", "x.mp4", "--output", "y.mp4", "--config", "c.yaml", "--only-remove"])
        assert args.only_remove is True

    def test_mutually_exclusive_group(self):
        with pytest.raises(SystemExit):
            parse_args([
                "--input", "x.mp4", "--output", "y.mp4", "--config", "c.yaml",
                "--only-detect", "--only-mask",
            ])

    def test_save_debug_flag(self):
        args = parse_args(["--input", "x.mp4", "--output", "y.mp4", "--config", "c.yaml", "--save-debug"])
        assert args.save_debug is True

    def test_disable_add_watermark_flag(self):
        args = parse_args([
            "--input", "x.mp4", "--output", "y.mp4", "--config", "c.yaml",
            "--disable-add-watermark",
        ])
        assert args.disable_add_watermark is True

    def test_missing_required_args_exits(self):
        with pytest.raises(SystemExit):
            parse_args(["--input", "x.mp4"])

    def test_help_exits(self):
        with pytest.raises(SystemExit):
            parse_args(["--help"])
