/* global chrome */
async function syncAdsRules() {
  const enabled = (await chrome.storage.local.get("adsEnabled")).adsEnabled !== false;
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enabled ? ["ads"] : [],
    disableRulesetIds: enabled ? [] : ["ads"]
  });
}
chrome.runtime.onInstalled.addListener(() => { syncAdsRules().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { syncAdsRules().catch(() => {}); });

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "KEBAN_TOGGLE" });
  } catch {
    // Browser-internal pages do not permit content scripts.
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "KEBAN_ADS_SET") {
    const enabled = message.enabled === true;
    chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enabled ? ["ads"] : [],
      disableRulesetIds: enabled ? [] : ["ads"]
    }).then(async () => {
      await chrome.storage.local.set({ adsEnabled: enabled });
      sendResponse({ enabled });
    }).catch((error) => sendResponse({ error: String(error?.message || error) }));
    return true;
  }
  if (message?.type !== "KEBAN_DOWNLOAD") return false;
  const url = message.url;
  let parsed;
  try { parsed = new URL(url); } catch { sendResponse({ error: "下载地址无效" }); return false; }
  if (!/^https?:$/.test(parsed.protocol) || !/\.(mp4|webm|ogg)$/i.test(parsed.pathname)) {
    sendResponse({ error: "只能下载直接提供的 MP4、WebM 或 OGG 文件" });
    return false;
  }
  if (!sender.url || new URL(sender.url).origin !== parsed.origin) {
    sendResponse({ error: "只支持与当前页面同源的直链视频" });
    return false;
  }
  chrome.downloads.download({ url, saveAs: true, conflictAction: "uniquify" }, (id) => {
    const error = chrome.runtime.lastError;
    sendResponse(error ? { error: error.message } : { id });
  });
  return true;
});
