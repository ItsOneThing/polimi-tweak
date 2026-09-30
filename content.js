/* global chrome */
(() => {
  if (window.__kebanLoaded) return;
  window.__kebanLoaded = true;

  const state = { video: null, root: null, host: null, panel: null, notes: [], loopA: null, loopB: null, looping: false, cues: [], cueText: "", audio: null, live: null, adsEnabled: null, open: false };
  const pageKey = (() => {
    const url = new URL(location.href);
    for (const key of ["id", "recordingId", "recordingID", "meetingId"]) {
      if (url.searchParams.has(key)) return `${url.origin}${url.pathname}?${key}=${url.searchParams.get(key)}`;
    }
    return `${url.origin}${url.pathname}`;
  })();
  const storageKey = `notes:${pageKey}`;
  const webex = /(^|\.)webex\.com$/i.test(location.hostname) || /webex/i.test(location.hostname);
  const youtube = /(^|\.)youtube\.com$/i.test(location.hostname);
  const $ = (selector) => state.root.querySelector(selector);
  const formatTime = (value) => {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    return `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds % 3600 / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  };
  const say = (message) => { if (state.root) $("#status").textContent = message; };

  function findVideo() {
    return [...document.querySelectorAll("video")]
      .filter((video) => video.isConnected && video.getBoundingClientRect().width > 160)
      .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0] || null;
  }

  function mount() {
    if (state.host) return;
    state.host = document.createElement("div");
    state.host.id = "keban-extension-root";
    state.host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;";
    state.root = state.host.attachShadow({ mode: "closed" });
    state.root.innerHTML = `
      <style>
        :host { all: initial; font: 14px/1.45 system-ui, -apple-system, sans-serif; color: #192339; }
        * { box-sizing: border-box; }
        button, input, textarea, select { font: inherit; }
        button { cursor: pointer; }
        #chip { border: 0; border-radius: 999px; padding: 11px 17px; background: #174ea6; color: white; box-shadow: 0 3px 16px #0005; font-weight: 700; }
        #panel { display: none; width: min(365px, calc(100vw - 32px)); max-height: min(80vh, 720px); overflow: auto; background: #fff; color: #192339; border-radius: 16px; box-shadow: 0 12px 40px #0006; border: 1px solid #dbe3ee; }
        #panel.open { display: block; }
        header { display: flex; justify-content: space-between; align-items: center; padding: 13px 16px; background: #eaf2ff; }
        header strong { font-size: 17px; }
        header button { border: 0; background: transparent; font-size: 20px; }
        section { padding: 12px 16px; border-top: 1px solid #e7ecf3; }
        h3 { font-size: 14px; margin: 0 0 9px; }
        .row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin: 7px 0; }
        .row > label { min-width: 68px; }
        .grow { flex: 1; }
        button.small, select { padding: 6px 9px; border: 1px solid #bdcbe0; background: #f8fbff; border-radius: 7px; color: #17325c; }
        button.primary { background: #174ea6; color: white; border-color: #174ea6; }
        button:disabled { opacity: .5; cursor: not-allowed; }
        input[type=range] { flex: 1; min-width: 95px; }
        textarea { width: 100%; height: 69px; resize: vertical; padding: 8px; border: 1px solid #bdcbe0; border-radius: 7px; }
        #notes { max-height: 145px; overflow: auto; margin: 7px 0 0; padding: 0; list-style: none; }
        #notes li { display: flex; gap: 6px; align-items: flex-start; padding: 5px 0; border-top: 1px solid #eef1f5; }
        #notes li span { flex: 1; white-space: pre-wrap; overflow-wrap: anywhere; }
        #status, .hint { color: #52627b; font-size: 12px; }
        #status { min-height: 17px; margin-top: 5px; }
        #caption { position: fixed; left: 50%; bottom: 12vh; transform: translateX(-50%); max-width: min(80vw, 850px); padding: 5px 13px; background: #000d; color: white; font-size: 22px; line-height: 1.5; text-align: center; border-radius: 6px; pointer-events: none; display: none; text-shadow: 0 1px 2px black; }
        #caption:not(:empty) { display: block; }
      </style>
      <button id="chip" type="button" aria-label="打开课伴面板">课伴</button>
      <div id="panel" role="dialog" aria-label="课伴学习面板">
        <header><strong>课伴 · 录播学习助手</strong><button id="close" aria-label="关闭面板">×</button></header>
        <section>
          <h3>播放</h3>
          <div class="row"><label for="speed">倍速</label><input id="speed" type="range" min="0.5" max="3" step="0.05" value="1"><output id="speedValue">1.00×</output></div>
          <div class="row"><button id="back" class="small">−10 秒</button><button id="forward" class="small">+10 秒</button><span id="resolution" class="hint"></span></div>
          <div class="row"><button id="setA" class="small">设 A 点</button><button id="setB" class="small">设 B 点</button><button id="loop" class="small">开始循环</button></div>
          <div class="hint" id="loopRange">尚未设置循环范围</div>
        </section>
        <section>
          <h3>声音</h3>
          <div class="row"><label for="gain">音量增强</label><input id="gain" type="range" min="1" max="3" step="0.1" value="1"><output id="gainValue">1.0×</output></div>
          <div class="row"><label><input id="voice" type="checkbox"> 人声增强</label></div>
          <div class="row"><label for="denoise">降噪滤波</label><input id="denoise" type="range" min="0" max="3" step="1" value="0"><output id="denoiseValue">关闭</output></div>
          <div class="hint">可减轻嗡声和嘶声；强档可能削弱老师较轻的声音。仅支持可处理的视频音轨。</div>
        </section>
        <section>
          <h3>网页广告</h3>
          <label><input id="adsEnabled" type="checkbox" checked> 启用轻量广告拦截</label>
          <div class="hint">拦截常见广告域名；YouTube 视频广告可能仍出现，可用时会自动点击跳过。</div>
        </section>
        <section>
          <h3>字幕</h3>
          <div class="row"><select id="tracks" class="grow" aria-label="网页字幕轨"><option value="">网页字幕：关闭</option></select></div>
          <div class="row"><label for="subtitleFile" class="small">导入 SRT/VTT</label><input id="subtitleFile" type="file" accept=".srt,.vtt,text/vtt" style="max-width:220px"></div>
          <div class="row"><select id="audioSource" aria-label="实时字幕音频来源"><option value="video">视频音轨</option><option value="tab">共享标签页声音</option></select><select id="liveMode" aria-label="实时字幕识别方式"><option value="auto">自动选择</option><option value="local">本地模型</option><option value="browser">浏览器识别</option></select><button id="live" class="small">开启实时字幕</button></div>
          <div class="hint" id="liveInfo">本地模型首次使用需下载约百 MB；浏览器识别可能使用浏览器厂商的在线服务。</div>
        </section>
        <section>
          <h3>时间点笔记</h3>
          <textarea id="noteInput" placeholder="把刚听到的知识点写在这里…"></textarea>
          <div class="row"><button id="saveNote" class="small primary">保存笔记</button><button id="exportNotes" class="small">导出 Markdown</button></div>
          <ul id="notes"></ul>
        </section>
        <section><div class="row"><button id="download" class="small">下载录播</button></div><div id="downloadInfo" class="hint"></div><div id="status" role="status"></div></section>
      </div><div id="caption" aria-live="polite"></div>`;
    document.documentElement.appendChild(state.host);
    state.panel = $("#panel");
    $("#chip").addEventListener("click", toggle);
    $("#close").addEventListener("click", toggle);
    $("#speed").addEventListener("input", () => { if (state.video) state.video.playbackRate = Number($("#speed").value); syncSpeed(); });
    $("#back").addEventListener("click", () => seek(-10));
    $("#forward").addEventListener("click", () => seek(10));
    $("#setA").addEventListener("click", () => { if (!state.video) { say("当前页面没有视频"); return; } state.loopA = state.video.currentTime; updateLoop(); });
    $("#setB").addEventListener("click", () => { if (!state.video) { say("当前页面没有视频"); return; } state.loopB = state.video.currentTime; updateLoop(); });
    $("#loop").addEventListener("click", () => {
      if (state.loopA === null || state.loopB === null || state.loopB <= state.loopA) { say("请先设置 A 点和晚于 A 点的 B 点"); return; }
      state.looping = !state.looping; $("#loop").textContent = state.looping ? "停止循环" : "开始循环";
      if (state.looping) state.video.currentTime = state.loopA;
    });
    $("#gain").addEventListener("input", updateAudio);
    $("#voice").addEventListener("change", updateAudio);
    $("#denoise").addEventListener("input", updateAudio);
    $("#adsEnabled").addEventListener("change", toggleAds);
    $("#tracks").addEventListener("change", selectTrack);
    $("#subtitleFile").addEventListener("change", importSubtitles);
    $("#saveNote").addEventListener("click", saveNote);
    $("#exportNotes").addEventListener("click", exportNotes);
    $("#download").addEventListener("click", download);
    $("#live").addEventListener("click", toggleLiveCaptions);
    state.open = false;
    renderNotes();
    updateDownloadInfo();
    $("#adsEnabled").checked = state.adsEnabled !== false;
  }

  function toggle() {
    if (!state.host) return;
    state.open = !state.open;
    state.panel.classList.toggle("open", state.open);
    $("#chip").style.display = state.open ? "none" : "block";
    if (state.open) { syncSpeed(); updateResolution(); updateTracks(); }
  }
  function seek(delta) { if (state.video) state.video.currentTime = Math.max(0, Math.min(state.video.duration || Infinity, state.video.currentTime + delta)); }
  function syncSpeed() { if (!state.video) return; $("#speed").value = state.video.playbackRate; $("#speedValue").textContent = `${state.video.playbackRate.toFixed(2)}×`; }
  function updateResolution() { if (state.video) $("#resolution").textContent = state.video.videoWidth ? `${state.video.videoWidth} × ${state.video.videoHeight}` : "画质由网站决定"; }
  function updateLoop() { $("#loopRange").textContent = state.loopA === null || state.loopB === null ? "尚未设置循环范围" : `${formatTime(state.loopA)} → ${formatTime(state.loopB)}`; }

  async function loadNotes() {
    try { state.notes = (await chrome.storage.local.get(storageKey))[storageKey] || []; } catch { state.notes = []; }
    renderNotes();
  }
  function renderNotes() {
    if (!state.root) return;
    const list = $("#notes"); list.replaceChildren();
    for (const note of state.notes) {
      const li = document.createElement("li");
      const jump = document.createElement("button"); jump.className = "small"; jump.textContent = formatTime(note.time);
      jump.addEventListener("click", () => { if (state.video) state.video.currentTime = note.time; });
      const body = document.createElement("span"); body.textContent = note.text;
      const remove = document.createElement("button"); remove.className = "small"; remove.textContent = "×"; remove.setAttribute("aria-label", "删除笔记");
      remove.addEventListener("click", async () => { state.notes = state.notes.filter((n) => n.id !== note.id); await chrome.storage.local.set({ [storageKey]: state.notes }); renderNotes(); });
      li.append(jump, body, remove); list.append(li);
    }
  }
  async function saveNote() {
    const text = $("#noteInput").value.trim(); if (!text || !state.video) return;
    state.notes.push({ id: crypto.randomUUID(), time: state.video.currentTime, text });
    try { await chrome.storage.local.set({ [storageKey]: state.notes }); $("#noteInput").value = ""; renderNotes(); say("笔记已保存到本机"); }
    catch { state.notes.pop(); say("笔记保存失败，请检查浏览器存储空间"); }
  }
  function exportNotes() {
    const title = document.title.replace(/[\r\n]/g, " ");
    const markdown = `# ${title}\n\n来源：${location.origin + location.pathname}\n\n${state.notes.map((n) => `## ${formatTime(n.time)}\n\n${n.text}\n`).join("\n")}`;
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    link.download = "课伴笔记.md"; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function canProcessAudio() {
    if (typeof MediaStream !== "undefined" && state.video?.srcObject instanceof MediaStream) return true;
    if (!state.video?.currentSrc) return false;
    try { const url = new URL(state.video.currentSrc); return url.protocol === "blob:" || url.origin === location.origin; } catch { return false; }
  }
  async function updateAudio() {
    if (!state.video || !canProcessAudio()) { $("#gain").value = "1"; $("#voice").checked = false; $("#denoise").value = "0"; $("#denoiseValue").textContent = "关闭"; say("此视频的音频无法安全处理；请使用播放器或系统音量"); return; }
    try {
      if (!state.audio || state.audio.video !== state.video) {
        const context = new AudioContext();
        const source = context.createMediaElementSource(state.video);
        const dry = context.createGain();
        const wet = context.createGain();
        const highpass = context.createBiquadFilter(); highpass.type = "highpass";
        const notch50 = context.createBiquadFilter(); notch50.type = "notch"; notch50.frequency.value = 50;
        const notch60 = context.createBiquadFilter(); notch60.type = "notch"; notch60.frequency.value = 60;
        const lowpass = context.createBiquadFilter(); lowpass.type = "lowpass";
        const low = context.createBiquadFilter(); low.type = "lowshelf"; low.frequency.value = 250;
        const presence = context.createBiquadFilter(); presence.type = "peaking"; presence.frequency.value = 2400; presence.Q.value = 0.8;
        const gain = context.createGain();
        source.connect(dry).connect(low);
        source.connect(highpass).connect(notch50).connect(notch60).connect(lowpass).connect(wet).connect(low);
        low.connect(presence).connect(gain).connect(context.destination);
        state.audio = { video: state.video, context, dry, wet, highpass, notch50, notch60, lowpass, low, presence, gain };
      }
      await state.audio.context.resume();
      const active = $("#voice").checked;
      state.audio.low.gain.value = active ? -3 : 0;
      state.audio.presence.gain.value = active ? 4 : 0;
      const strength = Number($("#denoise").value);
      state.audio.dry.gain.value = strength ? 0 : 1;
      state.audio.wet.gain.value = strength ? 1 : 0;
      state.audio.highpass.frequency.value = [20, 90, 120, 150][strength];
      state.audio.lowpass.frequency.value = [20000, 10000, 7500, 5600][strength];
      state.audio.notch50.Q.value = [20, 20, 12, 8][strength];
      state.audio.notch60.Q.value = [20, 20, 12, 8][strength];
      state.audio.gain.gain.value = Number($("#gain").value);
      $("#gainValue").textContent = `${Number($("#gain").value).toFixed(1)}×`;
      $("#denoiseValue").textContent = ["关闭", "轻", "中", "强"][strength];
      say(strength ? "降噪滤波已开启；请试听并选择合适强度" : "声音设置已更新");
    } catch { say("此视频无法使用音频增强，请使用系统或播放器音量"); }
  }

  function updateTracks() {
    const select = $("#tracks"); const selected = select.value; select.replaceChildren(new Option("网页字幕：关闭", ""));
    if (!state.video) return;
    [...state.video.textTracks].forEach((track, index) => select.add(new Option(track.label || track.language || `字幕 ${index + 1}`, String(index))));
    select.value = selected;
  }
  function selectTrack() { [...state.video.textTracks].forEach((track, index) => { track.mode = $("#tracks").value === String(index) ? "showing" : "disabled"; }); }
  function parseTime(value) {
    const match = value.trim().match(/^(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})$/);
    return match ? Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000 : null;
  }
  function parseSubtitles(raw) {
    const blocks = raw.replace(/^\uFEFF/, "").replace(/\r/g, "").split(/\n\s*\n/);
    return blocks.flatMap((block) => {
      const lines = block.trim().split("\n"); const timing = lines.findIndex((line) => line.includes("-->"));
      if (timing < 0) return [];
      const [startText, endText] = lines[timing].split("-->");
      const start = parseTime(startText); const end = parseTime(endText.split(/\s/)[0]);
      if (start === null || end === null || end <= start) return [];
      const text = lines.slice(timing + 1).join("\n").replace(/<[^>]*>/g, "").trim();
      return text ? [{ start, end, text }] : [];
    }).sort((a, b) => a.start - b.start);
  }
  async function importSubtitles(event) {
    const file = event.target.files?.[0]; if (!file) return;
    state.cues = parseSubtitles(await file.text());
    say(state.cues.length ? `已载入 ${state.cues.length} 条字幕` : "未识别到有效字幕，请检查 SRT/VTT 格式");
    updateCaption();
  }
  function updateCaption() {
    if (!state.video || !state.root) return;
    const time = state.video.currentTime;
    const cue = state.cues.find((item) => item.start <= time && time < item.end);
    $("#caption").textContent = cue?.text || state.cueText || "";
  }
  function updateDownloadInfo() {
    if (!state.root) return;
    $("#downloadInfo").textContent = webex ? "Webex 录播请使用播放器的下载按钮；是否显示由学校或教师权限决定。" : "仅能保存网站直接提供的同源 MP4/WebM/OGG 文件。";
  }
  function applyYouTubeAds() {
    if (!youtube) return;
    if (state.adsEnabled === true) document.documentElement.setAttribute("data-keban-ads", "on");
    else document.documentElement.removeAttribute("data-keban-ads");
    if (state.adsEnabled !== true || !document.querySelector(".ad-showing")) return;
    const skip = document.querySelector(".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern");
    if (skip && skip.getBoundingClientRect().width) skip.click();
  }
  async function toggleAds() {
    const desired = $("#adsEnabled").checked;
    try {
      const result = await chrome.runtime.sendMessage({ type: "KEBAN_ADS_SET", enabled: desired });
      if (result?.error) throw new Error(result.error);
      state.adsEnabled = desired;
      applyYouTubeAds();
      say(desired ? "广告拦截已开启" : "广告拦截已关闭");
    } catch (error) {
      $("#adsEnabled").checked = state.adsEnabled;
      say(`无法更改广告拦截：${error.message}`);
    }
  }
  async function loadAdsSetting() {
    try { state.adsEnabled = (await chrome.storage.local.get("adsEnabled")).adsEnabled !== false; } catch { state.adsEnabled = true; }
    if (state.root) $("#adsEnabled").checked = state.adsEnabled;
    applyYouTubeAds();
  }
  async function download() {
    if (webex) { say("请在 Webex 播放器中选择“下载”；若没有该按钮，请联系录播提供者开放权限"); return; }
    const url = state.video?.currentSrc;
    if (!url || !canProcessAudio() || !/^https?:.*\.(mp4|webm|ogg)(?:[?#]|$)/i.test(url)) { say("当前视频不是可直接保存的同源视频文件"); return; }
    try { const result = await chrome.runtime.sendMessage({ type: "KEBAN_DOWNLOAD", url }); say(result?.error || "已打开浏览器保存窗口"); }
    catch { say("下载失败，请尝试网站自带的下载按钮"); }
  }

  function nativeSpeechAvailable() {
    const match = navigator.userAgent.match(/(?:Chrome|Chromium|Edg)\/(\d+)/);
    return !!((window.SpeechRecognition || window.webkitSpeechRecognition) && match && Number(match[1]) >= 135);
  }
  function setLiveText(text) {
    state.cueText = text;
    updateCaption();
    if (state.live?.clearTimer) clearTimeout(state.live.clearTimer);
    if (state.live && text) state.live.clearTimer = setTimeout(() => { state.cueText = ""; updateCaption(); }, 9000);
  }
  function stopLive() {
    const live = state.live; if (!live) return;
    state.live = null;
    if (live.clearTimer) clearTimeout(live.clearTimer);
    try { live.recognition?.stop(); } catch { /* Already stopped. */ }
    try { live.processor?.disconnect(); live.source?.disconnect(); live.silent?.disconnect(); } catch { /* Already disconnected. */ }
    live.context?.close().catch(() => {});
    live.port?.close();
    live.frame?.remove();
    if (live.frameTimer) clearTimeout(live.frameTimer);
    live.stream?.getTracks().forEach((track) => track.stop());
    setLiveText("");
    $("#live").textContent = "开启实时字幕";
    $("#liveInfo").textContent = "实时字幕已关闭。";
  }
  async function toggleLiveCaptions() {
    if (state.live) { stopLive(); return; }
    if (!state.video || state.video.paused) { say("请先播放视频，再开启实时字幕"); return; }
    let stream;
    if ($("#audioSource").value === "tab") {
      try { stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, preferCurrentTab: true, selfBrowserSurface: "include" }); }
      catch { say("未获得标签页共享权限；请选择当前标签页并勾选共享音频"); return; }
    } else {
      const capture = state.video.captureStream || state.video.mozCaptureStream;
      if (!capture) { say("浏览器不支持读取视频音轨，请尝试“共享标签页声音”"); return; }
      try { stream = capture.call(state.video); } catch { say("网页不允许读取视频音轨，请尝试“共享标签页声音”"); return; }
    }
    const track = stream.getAudioTracks()[0];
    if (!track) { stream.getTracks().forEach((item) => item.stop()); say("没有获取到音频，请确认共享时勾选了“共享标签页音频”"); return; }
    state.live = { stream, track, video: state.video, clearTimer: null };
    $("#live").textContent = "关闭实时字幕";
    const choice = $("#liveMode").value;
    if (choice === "browser" || (choice === "auto" && nativeSpeechAvailable())) {
      if (nativeSpeechAvailable()) {
        try { startNativeSpeech(state.live); return; }
        catch (error) { if (choice === "browser") { say(`浏览器识别不可用：${error.message}`); stopLive(); return; } }
      } else if (choice === "browser") { say("此浏览器不支持直接识别视频音轨，请选择本地模型"); stopLive(); return; }
    }
    startLocalSpeech(state.live);
  }
  function startNativeSpeech(live) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (result?.[0]?.transcript) setLiveText(result[0].transcript.trim());
    };
    recognition.onerror = (event) => {
      if (state.live !== live) return;
      if (["not-allowed", "service-not-allowed", "network"].includes(event.error)) {
        say(`浏览器识别失败（${event.error}），正在切换本地模型`);
        recognition.onend = null;
        startLocalSpeech(live);
      }
    };
    recognition.onend = () => { if (state.live === live && live.track.readyState === "live") setTimeout(() => { try { recognition.start(live.track); } catch { startLocalSpeech(live); } }, 400); };
    recognition.start(live.track);
    live.recognition = recognition;
    $("#liveInfo").textContent = "正在用浏览器识别视频声音。浏览器厂商可能在线处理音频。";
    say("实时字幕已开启");
  }
  function startLocalSpeech(live) {
    if (live.frame) return;
    try {
      const frame = document.createElement("iframe");
      frame.src = chrome.runtime.getURL("asr-frame.html");
      frame.style.cssText = "display:none!important;width:0!important;height:0!important;border:0!important";
      frame.setAttribute("aria-hidden", "true");
      live.frame = frame;
      frame.onload = () => {
        if (state.live !== live) return;
        const channel = new MessageChannel();
        live.port = channel.port1;
        channel.port1.onmessage = ({ data }) => {
        if (state.live !== live) return;
        if (data.type === "connected") { live.connected = true; clearTimeout(live.frameTimer); live.port.postMessage({ type: "init", wasmBase: chrome.runtime.getURL("vendor/") }); }
        if (data.type === "progress") $("#liveInfo").textContent = `正在下载本地语音模型：${Math.round(data.progress || 0)}%`;
        if (data.type === "ready") { $("#liveInfo").textContent = "本地模型已就绪；约每 8 秒生成一段字幕。"; beginSampling(live); }
        if (data.type === "transcript") { live.inFlight = false; if (data.text) setLiveText(data.text); }
        if (data.type === "error") { say(`本地识别失败：${data.error}`); stopLive(); }
        };
        const targetOrigin = new URL(frame.src).origin;
        frame.contentWindow.postMessage({ type: "KEBAN_PORT" }, targetOrigin, [channel.port2]);
      };
      frame.onerror = () => { say("浏览器或网页阻止了本地字幕页面"); stopLive(); };
      state.root.append(frame);
      live.frameTimer = setTimeout(() => { if (state.live === live && !live.connected) { say("网页未能打开本地字幕引擎"); stopLive(); } }, 10000);
      $("#liveInfo").textContent = "正在准备本地语音模型；首次使用需要联网下载。";
    } catch (error) { say(`无法启动本地模型：${error.message}`); stopLive(); }
  }
  async function beginSampling(live) {
    if (state.live !== live) return;
    try {
      const context = new AudioContext();
      const source = context.createMediaStreamSource(new MediaStream([live.track]));
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silent = context.createGain(); silent.gain.value = 0;
      source.connect(processor).connect(silent).connect(context.destination);
      live.context = context; live.source = source; live.processor = processor; live.silent = silent;
      live.samples = []; live.inFlight = false;
      live.quietChunks = 0;
      processor.onaudioprocess = (event) => {
        if (state.live !== live) return;
        const input = event.inputBuffer.getChannelData(0);
        const stride = context.sampleRate / 16000;
        for (let i = 0; i < input.length; i += stride) live.samples.push(input[Math.floor(i)]);
        if (live.samples.length >= 16000 * 8) {
          const chunk = Float32Array.from(live.samples.slice(0, 16000 * 8));
          live.samples = [];
          let energy = 0;
          for (let i = 0; i < chunk.length; i += 16) energy += chunk[i] * chunk[i];
          const rms = Math.sqrt(energy / (chunk.length / 16));
          live.quietChunks = rms < 0.0005 ? live.quietChunks + 1 : 0;
          if (live.quietChunks === 2) $("#liveInfo").textContent = "捕获的声音持续无声；若视频有声音，请选择“共享标签页声音”。";
          if (!live.inFlight) { live.inFlight = true; live.port.postMessage({ type: "audio", samples: chunk.buffer }, [chunk.buffer]); }
        }
      };
      await context.resume();
      say("本地实时字幕已开启");
    } catch (error) { say(`无法读取音频：${error.message}`); stopLive(); }
  }

  function attach(video) {
    if (state.video === video) return;
    if (state.live) stopLive();
    state.video = video;
    mount();
    video.addEventListener("timeupdate", () => {
      if (state.looping && state.loopA !== null && state.loopB !== null && video.currentTime >= state.loopB) video.currentTime = state.loopA;
      updateCaption();
    });
    video.addEventListener("ratechange", syncSpeed);
    video.addEventListener("loadedmetadata", updateResolution);
    syncSpeed(); updateResolution(); updateTracks();
  }
  chrome.runtime.onMessage.addListener((message) => { if (message?.type === "KEBAN_TOGGLE" && (state.video || youtube)) toggle(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.adsEnabled) {
      state.adsEnabled = changes.adsEnabled.newValue !== false;
      if (state.root) $("#adsEnabled").checked = state.adsEnabled;
      applyYouTubeAds();
    }
  });
  let scanTimer = null;
  const observer = new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => { scanTimer = null; const video = findVideo(); if (video) attach(video); applyYouTubeAds(); }, 250);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const initial = findVideo(); if (initial) attach(initial); else if (youtube) mount();
  loadAdsSetting();
  loadNotes();
})();
