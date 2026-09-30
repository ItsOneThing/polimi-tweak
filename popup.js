/* global chrome */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let tabId = null;
let current = null;
let busy = false;

function timecode(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function status(message) { $("#status").textContent = message; }
function selectTab(name) {
  $$("nav button").forEach((button) => {
    const selected = button.dataset.tab === name;
    button.classList.toggle("active", selected);
    if (selected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $$("[data-view]").forEach((view) => { view.hidden = view.dataset.view !== name; });
}
function renderNotes(notes) {
  const list = $("#notesList");
  list.replaceChildren();
  for (const note of notes || []) {
    const item = document.createElement("li");
    const jump = document.createElement("button");
    jump.textContent = timecode(note.time);
    jump.title = "跳到这个时间点";
    jump.addEventListener("click", () => command("noteJump", { value: note.time }));
    const body = document.createElement("span");
    body.textContent = note.text;
    const remove = document.createElement("button");
    remove.textContent = "×";
    remove.title = "删除笔记";
    remove.addEventListener("click", () => command("noteDelete", { id: note.id }));
    item.append(jump, body, remove);
    list.append(item);
  }
}
function render(data) {
  const first = current === null;
  current = data;
  $("#connection").textContent = data.hasVideo ? "已连接视频" : "未找到视频";
  $("#connection").classList.toggle("online", data.hasVideo);
  $("#speedReadout").textContent = `${data.rate.toFixed(2)}×`;
  $("#stepReadout").textContent = `${data.rate.toFixed(2)}×`;
  $$(".speed-grid button").forEach((button) => button.classList.toggle("active", Math.abs(Number(button.dataset.speed) - data.rate) < 0.001));
  $("#time").textContent = `${timecode(data.currentTime)} / ${timecode(data.duration)}`;
  $("#noteTime").textContent = timecode(data.currentTime);
  $("#resolution").textContent = data.resolution || "";
  $("#videoTitle").textContent = data.title || "未命名录播";
  $("#playPause").textContent = data.paused ? "▶" : "Ⅱ";
  $("#loopToggle").classList.toggle("active", data.looping);
  $("#loopLabel").textContent = data.loopA === null || data.loopB === null
    ? "设置 A、B 两点后可循环播放。"
    : `循环片段：${timecode(data.loopA)} → ${timecode(data.loopB)}${data.looping ? "（进行中）" : ""}`;
  if (document.activeElement !== $("#gain")) $("#gain").value = data.gain;
  $("#gainReadout").textContent = `${data.gain.toFixed(1)}×`;
  $("#voice").checked = data.voice;
  if (document.activeElement !== $("#denoise")) $("#denoise").value = data.denoise;
  $("#denoiseReadout").textContent = ["关闭", "轻", "中", "强"][data.denoise] || "关闭";
  if (first || data.live) {
    $("#audioSource").value = data.audioSource;
    $("#liveMode").value = data.liveMode;
  }
  $("#live").textContent = data.live ? "关闭实时字幕" : "开启实时字幕";
  $("#liveInfo").textContent = data.liveInfo || $("#liveInfo").textContent;
  const tracks = $("#tracks");
  const previous = tracks.value;
  tracks.replaceChildren(new Option("关闭", ""));
  for (const track of data.tracks) tracks.add(new Option(track.label, track.value));
  tracks.value = data.selectedTrack || previous;
  $("#adsEnabled").checked = data.adsEnabled;
  $("#downloadInfo").textContent = data.downloadInfo;
  renderNotes(data.notes);
  status(data.status || (data.hasVideo ? "所有设置仅作用于当前录播。" : "打开包含录播的视频页面后即可使用。"));
  $$("[data-view=play] button, [data-view=play] input, [data-view=audio] input, [data-view=captions] button, [data-view=captions] input, [data-view=captions] select, [data-view=notes] button, [data-view=notes] textarea").forEach((control) => { control.disabled = !data.hasVideo; });
}
async function send(message) {
  if (tabId === null) throw new Error("找不到当前标签页");
  const response = await chrome.tabs.sendMessage(tabId, message);
  if (!response) throw new Error("此页面没有可操作的录播视频");
  if (response.error) throw new Error(response.error);
  return response.state;
}
async function refresh() {
  if (busy || tabId === null) return;
  try { render(await send({ type: "KEBAN_GET_STATE" })); }
  catch (error) {
    $("#connection").textContent = "未连接";
    $("#connection").classList.remove("online");
    status(error.message);
  }
}
async function command(action, payload = {}) {
  if (busy) return;
  busy = true;
  try {
    const result = await send({ type: "KEBAN_COMMAND", action, ...payload });
    render(result);
    if (action === "noteSave") $("#noteInput").value = "";
  } catch (error) { status(error.message); }
  finally { busy = false; }
}
$$("nav button").forEach((button) => button.addEventListener("click", () => selectTab(button.dataset.tab)));
$$("[data-speed]").forEach((button) => button.addEventListener("click", () => command("speed", { value: Number(button.dataset.speed) })));
$$("[data-step]").forEach((button) => button.addEventListener("click", () => command("step", { value: Number(button.dataset.step) })));
$("#rewind").addEventListener("click", () => command("seek", { value: -10 }));
$("#advance").addEventListener("click", () => command("seek", { value: 10 }));
$("#playPause").addEventListener("click", () => command("play"));
$("#loopA").addEventListener("click", () => command("loopA"));
$("#loopB").addEventListener("click", () => command("loopB"));
$("#loopToggle").addEventListener("click", () => command("loopToggle"));
$("#gain").addEventListener("input", () => { $("#gainReadout").textContent = `${Number($("#gain").value).toFixed(1)}×`; });
$("#gain").addEventListener("change", () => command("audio", { gain: Number($("#gain").value) }));
$("#voice").addEventListener("change", () => command("audio", { voice: $("#voice").checked }));
$("#denoise").addEventListener("input", () => { $("#denoiseReadout").textContent = ["关闭", "轻", "中", "强"][Number($("#denoise").value)]; });
$("#denoise").addEventListener("change", () => command("audio", { denoise: Number($("#denoise").value) }));
$("#live").addEventListener("click", () => command("live", { audioSource: $("#audioSource").value, liveMode: $("#liveMode").value }));
$("#tracks").addEventListener("change", () => command("track", { value: $("#tracks").value }));
$("#subtitleFile").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (file) await command("subtitles", { text: await file.text() });
});
$("#saveNote").addEventListener("click", () => command("noteSave", { text: $("#noteInput").value.trim() }));
$("#exportNotes").addEventListener("click", () => command("noteExport"));
$("#adsEnabled").addEventListener("change", () => command("ads", { enabled: $("#adsEnabled").checked }));
$("#download").addEventListener("click", () => command("download"));

(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("找不到当前标签页");
    tabId = tab.id;
    await refresh();
    setInterval(refresh, 1500);
  } catch (error) { status(error.message); }
})();
