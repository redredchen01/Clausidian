# Remotion Clip — Roadmap

## 架构：两段式

### Stage 1: 高光编排（Highlight Assembly）— 当前
用 Remotion 把已选好的片段剪成成片。
- 输入：source video + segments.json
- 输出：60s highlight mp4
- 能力：trim, sequence, speed, volume, intro card, label overlay

### Stage 2: 高光发现（Highlight Discovery）— 下一步
自动或半自动从长片中找出值得保留的片段。

路线 A（最稳）：人工挑片 → segments.json → Remotion 拼接
路线 B（半自动）：transcript + 音量峰值 + 场景切换 → candidate segments → 人工精修
路线 C（全自动）：全文转录 + 语义打分 + 情绪峰值 → 自动出片

建议顺序：A → B → C

## TODO

### MVP（Stage 1）
- [x] Remotion 项目骨架
- [x] HighlightVideo 组件（trim + series + label）
- [x] segments.json schema
- [ ] npm install + 验证 dev server
- [ ] 放入真实素材测试
- [ ] IntroCard 可配置化
- [ ] 转场效果（fade / swipe）

### Stage 2
- [ ] ffmpeg 预处理脚本（探测 + 预切）
- [ ] transcript 提取（whisper / 字幕文件）
- [ ] 候选片段评分器
- [ ] 响度归一
- [ ] 自动字幕叠加
