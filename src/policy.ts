import type { AppConfig } from "./types";

export function boundedRandomInt(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function retryDelayFor429(config: AppConfig): number {
  return boundedRandomInt(config.retry429MinSeconds, config.retry429MaxSeconds);
}

