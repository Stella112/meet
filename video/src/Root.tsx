import React from "react";
import { Composition } from "remotion";
import { FPS, MeetDemo, totalFrames } from "./Video";

export const Root: React.FC = () => (
  <Composition id="MeetDemo" component={MeetDemo} durationInFrames={totalFrames} fps={FPS} width={1920} height={1080} />
);
