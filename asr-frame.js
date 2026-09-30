/* global chrome */
let connected = false;
window.addEventListener("message", (event) => {
  if (connected || event.source !== window.parent || event.data?.type !== "KEBAN_PORT" || !event.ports[0]) return;
  connected = true;
  const port = event.ports[0];
  try {
    const worker = new Worker(chrome.runtime.getURL("asr-worker.js"), { type: "module" });
    worker.onmessage = ({ data }) => port.postMessage(data);
    worker.onerror = (error) => port.postMessage({ type: "error", error: error.message || "字幕工作线程无法启动" });
    port.onmessage = ({ data }) => worker.postMessage(data, data.samples ? [data.samples] : []);
    port.start();
    port.postMessage({ type: "connected" });
    window.addEventListener("pagehide", () => { worker.terminate(); port.close(); });
  } catch (error) { port.postMessage({ type: "error", error: String(error?.message || error) }); }
});
