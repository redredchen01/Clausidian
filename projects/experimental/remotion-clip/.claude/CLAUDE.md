# Remotion Clip — Project Rules

## 项目定位
Remotion 视频剪辑专案。把长影片剪成 ~60s highlight 短片。

## 技术栈
- Remotion 4.x + React + TypeScript
- ffmpeg（预处理 / 探测）
- 未来：Whisper（转录）、LLM（高光评分）

## 关键文件
- `src/HighlightVideo.tsx` — 核心剪辑组件
- `input/segments.json` — 片段定义（startSec/endSec/label/speed/volume）
- `input/segments.schema.json` — JSON Schema
- `docs/roadmap.md` — 开发路线图
- `docs/prompts.md` — 常用提示词

## 开发命令
```bash
npm run dev          # Remotion Studio 预览
npm run render       # 渲染完整 highlight
npm run render:preview  # 只渲染前 3 秒预览
npm run probe <file> # ffprobe 探测视频信息
```

## Remotion 核心概念速查
- `<Series>` + `<Series.Sequence>` — 依序排列片段
- `<Video trimBefore={frame} trimAfter={frame}>` — 裁剪源视频
- `staticFile()` — 引用 public/ 下的静态资源
- `calculateMetadata` — 动态计算总帧数
- `playbackRate` — 变速；`volume` — 音量控制
- FPS = 30，帧数 = 秒数 × 30

## 注意事项
- 素材放 `public/`，输出放 `out/`
- segments.json 的 startSec/endSec 单位是秒（浮点数）
- trimBefore/trimAfter 单位是帧（需 × FPS 转换）
- 长影片建议先 ffmpeg 预切再 render，避免全量解码
