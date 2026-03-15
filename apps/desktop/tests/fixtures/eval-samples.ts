/**
 * Offline eval fixture samples.
 *
 * Each sample has a reference transcript (ground truth) and a simulated
 * hypothesis (what a Whisper-like model might produce). These are used by
 * the eval harness to compute WER, punctuation F1, and capitalization accuracy
 * without requiring a live model binary.
 *
 * For live model evaluation, replace `hypothesis` with actual Whisper output
 * by running the eval harness against real WAV files.
 */
export interface EvalSample {
  id: string;
  description: string;
  reference: string;
  hypothesis: string;
}

export const EVAL_SAMPLES: EvalSample[] = [
  {
    id: 'meeting-intro',
    description: 'Meeting introduction, clear speech',
    reference: "Good morning everyone. Today we're going to discuss the quarterly results and our plans for the next quarter.",
    hypothesis: "Good morning everyone. Today we're going to discuss the quarterly results and our plans for the next quarter.",
  },
  {
    id: 'meeting-action-items',
    description: 'Action items with names and numbers',
    reference: "We need to finish the report by Friday. John will handle the client presentation and Sarah will review the budget.",
    hypothesis: "We need to finish the report by Friday. John will handle the client presentation and Sarah will review the budget.",
  },
  {
    id: 'video-narration',
    description: 'Video narration with technical terms',
    reference: "The system uses a transformer-based architecture with attention mechanisms to process sequential data.",
    hypothesis: "The system uses a transformer based architecture with attention mechanisms to process sequential data.",
  },
  {
    id: 'noisy-mic',
    description: 'Noisy microphone with minor errors',
    reference: "I think we should move forward with the proposal and schedule a follow-up meeting next week.",
    hypothesis: "I think we should move forward with the proposal and schedule a follow up meeting next week.",
  },
  {
    id: 'overlap-test',
    description: 'Chunk with minor overlap artifacts (near-perfect)',
    reference: "The project deadline has been moved to the end of the month due to additional requirements.",
    hypothesis: "The project deadline has been moved to the end of the month due to additional requirements.",
  },
];
