# 可直接拿来用的提示词

## 1. 手工选段 → 出片

帮我用 Remotion 把 `input/segments.json` 里的片段拼成一支 60 秒 highlight。
source video 在 `public/source.mp4`。
要求：IntroCard + 多段拼接 + label overlay。

## 2. 候选高光提取

帮我写一个候选高光提取脚本。
输入：长影片的 transcript / subtitle。
输出：candidate segments JSON（符合 `input/segments.schema.json`）。
先给启发式规则版本，解释打分逻辑。

## 3. Remotion 审查

审查这个 Remotion 项目的时间轴设计、trim 方式、sequence 结构和 render 风险。
重点检查：
- trimBefore/trimAfter 计算是否正确
- Series.Sequence durationInFrames 是否对齐
- 多段拼接的总时长控制

## 4. ffmpeg 预处理

帮我写一个 ffmpeg 预处理脚本：
- 探测源视频信息（时长、编码、分辨率）
- 按 segments.json 预切片段（避免 Remotion render 全量解码）
- 输出到 `public/clips/` 目录
