/**
 * Schema for Step 1: Event Detection
 */

import { z } from "zod";

/**
 * Meeting event types
 */
export const EventTypeEnum = z.enum([
  "refinement",
  "planning",
  "standup",
  "retrospective",
  "other",
]);

export type EventType = z.infer<typeof EventTypeEnum>;

/**
 * Event Detection output schema
 */
export const EventDetectionSchema = z.object({
  eventType: EventTypeEnum.describe("The type of meeting detected"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score from 0 to 1"),
  indicators: z
    .array(z.string())
    .describe("Key evidence that led to this classification"),
});

export type EventDetectionResult = z.infer<typeof EventDetectionSchema>;
