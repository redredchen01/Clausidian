import React from 'react';
import { Composition } from 'remotion';
import { HighlightVideo, calculateMetadata } from './HighlightVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Highlight"
        component={HighlightVideo}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={1800}
        calculateMetadata={calculateMetadata}
        defaultProps={{
          source: './assets/source.mp4',
          outputDurationSec: 60,
          segments: [],
        }}
      />
    </>
  );
};
