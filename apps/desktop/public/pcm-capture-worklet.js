/**
 * AudioWorklet processor that forwards input samples to the main thread.
 * Replaces deprecated ScriptProcessorNode. See https://bit.ly/audio-worklet
 */
class PCMCaptureProcessor extends AudioWorkletProcessor {
  process(inputs, _outputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channel = input[0];
      if (channel && channel.length > 0) {
        this.port.postMessage({ samples: new Float32Array(channel) });
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture-processor', PCMCaptureProcessor);
