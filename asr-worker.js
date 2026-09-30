import { env, pipeline } from "./vendor/transformers.min.js";

let transcriber = null;
let loading = null;

self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      env.backends.onnx.wasm.wasmPaths = data.wasmBase;
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      loading ||= pipeline("automatic-speech-recognition", "onnx-community/whisper-tiny", {
        device: "wasm",
        dtype: "q8",
        progress_callback: (progress) => {
          if (progress.status === "progress") self.postMessage({ type: "progress", progress: progress.progress });
        }
      });
      transcriber = await loading;
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", error: String(error?.message || error) });
    }
    return;
  }
  if (data.type === "audio") {
    try {
      if (!transcriber) throw new Error("模型尚未载入");
      const options = { task: "transcribe" };
      if (["italian", "english", "chinese"].includes(data.language)) options.language = data.language;
      const result = await transcriber(new Float32Array(data.samples), options);
      self.postMessage({ type: "transcript", text: result.text?.trim() || "" });
    } catch (error) {
      self.postMessage({ type: "error", error: String(error?.message || error) });
    }
  }
};
