/* eslint-disable */
var frames = new Map();

function startSilentAudio() {
  try {
    var ctx = new AudioContext();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
  } catch (e) {}
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.target !== 'offscreen') return false;

  switch (msg.type) {
    case 'OFFSCREEN_SYNC': {
      var wanted = new Set(msg.tabs.map(function (t) { return t.id; }));

      var toRemove = [];
      frames.forEach(function (_, id) {
        if (!wanted.has(id)) toRemove.push(id);
      });
      toRemove.forEach(function (id) {
        frames.get(id).remove();
        frames.delete(id);
      });

      msg.tabs.forEach(function (tab) {
        var entry = frames.get(tab.id);
        if (!entry) {
          var iframe = document.createElement('iframe');
          iframe.name = 'sm-offscreen-' + tab.id;
          iframe.style.cssText = 'width:1280px;height:720px;border:none;position:absolute;';
          document.getElementById('frames').appendChild(iframe);
          frames.set(tab.id, { iframe: iframe, url: tab.url });
          iframe.src = tab.url;
        } else if (entry.url !== tab.url) {
          entry.url = tab.url;
          entry.iframe.src = tab.url;
        }
      });
      break;
    }

    case 'OFFSCREEN_CLOSE': {
      var entry = frames.get(msg.tabId);
      if (entry) {
        entry.iframe.remove();
        frames.delete(msg.tabId);
      }
      break;
    }
  }

  sendResponse({ ok: true });
  return true;
});

startSilentAudio();
