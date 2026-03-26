import React from 'react';
import { AbsoluteFill, Series, staticFile } from 'remotion';
import { Video } from '@remotion/media';

export type HighlightSegment = {
  startSec: number;
  endSec: number;
  label?: string;
  reason?: string;
  speed?: number;
  volume?: number;
  transition?: string;
};

export type HighlightProps = {
  source: string;
  outputDurationSec: number;
  segments: HighlightSegment[];
};

const FPS = 30;

const normalizeSegments = (segments: HighlightSegment[]) => {
  return segments
    .filter((s) => s.endSec > s.startSec)
    .map((s) => ({
      ...s,
      speed: s.speed ?? 1,
      volume: s.volume ?? 1,
    }));
};

export const calculateMetadata = async ({ props }: { props: HighlightProps }) => {
  const segs = normalizeSegments(props.segments);
  const introFrames = 45;
  const segFrames = segs.reduce(
    (sum, s) => sum + Math.max(1, Math.round((s.endSec - s.startSec) * FPS / (s.speed ?? 1))),
    0,
  );
  return { durationInFrames: introFrames + segFrames };
};

const IntroCard: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: 'black',
      color: 'white',
      justifyContent: 'center',
      alignItems: 'center',
      fontSize: 64,
      fontWeight: 700,
    }}
  >
    Highlight Cut
  </AbsoluteFill>
);

export const HighlightVideo: React.FC<HighlightProps> = ({ segments }) => {
  const safeSegments = normalizeSegments(segments);

  if (safeSegments.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#111', color: 'white', justifyContent: 'center', alignItems: 'center', fontSize: 42 }}>
        No segments provided
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Series>
        <Series.Sequence durationInFrames={45}>
          <IntroCard />
        </Series.Sequence>
        {safeSegments.map((segment, index) => {
          const clipSrc = staticFile(`clips/seg${String(index + 1).padStart(2, '0')}.mp4`);
          const durationSec = segment.endSec - segment.startSec;
          const segmentFrames = Math.max(1, Math.round(durationSec * FPS / (segment.speed || 1)));
          return (
            <Series.Sequence key={index} durationInFrames={segmentFrames}>
              <AbsoluteFill>
                <Video
                  src={clipSrc}
                  playbackRate={segment.speed}
                  volume={segment.volume}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: 48,
                    right: 48,
                    bottom: 64,
                    color: 'white',
                    fontSize: 36,
                    fontWeight: 700,
                    textShadow: '0 4px 16px rgba(0,0,0,0.75)',
                  }}
                >
                  {segment.label ?? `Segment ${index + 1}`}
                </div>
              </AbsoluteFill>
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
