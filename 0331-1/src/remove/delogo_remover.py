"""Stage E: DelogoRemover — static position ffmpeg shortcut"""
from __future__ import annotations

from src.detect.easyocr_detector import BBox
from src.video.ffmpeg_utils import apply_delogo


class DelogoRemover:
    def __init__(self, band: int = 4):
        self.band = band

    def apply(
        self,
        input_path: str,
        output_path: str,
        static_box: BBox,
    ) -> None:
        apply_delogo(
            input_path,
            output_path,
            x=static_box.x,
            y=static_box.y,
            w=static_box.w,
            h=static_box.h,
            band=self.band,
        )
