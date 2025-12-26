import { app } from "../../scripts/app.js";

const EXT_NAME = "WAS.GameBoyPlayer";
const NODE_NAME = "ComfyGameBoyPlayer";

const DEFAULT_NODE_SIZE = [730, 480];

const STATE = {
  container: null,
  nodeIdToIframe: new Map(),
};

function readCssVar(style, name) {
  const v = style.getPropertyValue(name);
  return v ? String(v).trim() : "";
}

function computeThemeTokens() {
  const rootStyle = getComputedStyle(document.documentElement);
  const bodyStyle = getComputedStyle(document.body);

  const bg =
    readCssVar(rootStyle, "--comfy-menu-bg") ||
    readCssVar(rootStyle, "--background-color") ||
    readCssVar(rootStyle, "--bg-color") ||
    bodyStyle.backgroundColor ||
    "";
  const fg =
    readCssVar(rootStyle, "--input-text") ||
    readCssVar(rootStyle, "--text-color") ||
    readCssVar(rootStyle, "--fg-color") ||
    bodyStyle.color ||
    "";
  const border =
    readCssVar(rootStyle, "--border-color") ||
    readCssVar(rootStyle, "--comfy-border-color") ||
    "";
  const accent =
    readCssVar(rootStyle, "--primary-color") ||
    readCssVar(rootStyle, "--accent-color") ||
    readCssVar(rootStyle, "--comfy-accent") ||
    "";

  return {
    bg,
    fg,
    border,
    accent,
  };
}

function postThemeToIframe(iframe) {
  try {
    const payload = {
      type: "was-gba-theme",
      tokens: computeThemeTokens(),
    };
    iframe.contentWindow?.postMessage(payload, "*");
  } catch (e) {
  }
}

function attachThemeSync(iframe) {
  if (iframe.__wasThemeSyncAttached) return;
  iframe.__wasThemeSyncAttached = true;

  iframe.addEventListener("load", () => {
    postThemeToIframe(iframe);
  });

  const onMsg = (ev) => {
    try {
      if (ev?.source !== iframe.contentWindow) return;
      if (!ev?.data || typeof ev.data !== "object") return;
      if (ev.data.type !== "was-gba-request-theme") return;
      postThemeToIframe(iframe);
    } catch (e) {
    }
  };
  window.addEventListener("message", onMsg);

  const mo = new MutationObserver(() => postThemeToIframe(iframe));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
 }

function getContainer() {
  if (STATE.container) return STATE.container;
  const el = document.createElement("div");
  el.id = "was-gba-overlay";
  el.style.position = "absolute";
  el.style.left = "0";
  el.style.top = "0";
  el.style.width = "0";
  el.style.height = "0";
  el.style.pointerEvents = "none";
  el.style.zIndex = "1000";
  document.body.appendChild(el);
  STATE.container = el;
  return el;
}

function ensureIframeForNode(node) {
  const key = String(node.id);
  const existing = STATE.nodeIdToIframe.get(key);
  if (existing) return existing;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-downloads");
  iframe.style.position = "absolute";
  iframe.style.border = "0";
  iframe.style.pointerEvents = "auto";
  iframe.style.background = "#000";
  iframe.style.left = "0px";
  iframe.style.top = "0px";
  iframe.style.width = "0px";
  iframe.style.height = "0px";
  iframe.style.display = "none";
  iframe.style.borderRadius = "8px";

  const src = "extensions/ComfyUI_GB_Player/gba/player/index.html";
  iframe.src = src;

  attachThemeSync(iframe);

  getContainer().appendChild(iframe);
  STATE.nodeIdToIframe.set(key, iframe);

  const oldOnRemoved = node.onRemoved;
  node.onRemoved = function () {
    try {
      const i = STATE.nodeIdToIframe.get(String(this.id));
      if (i) i.remove();
      STATE.nodeIdToIframe.delete(String(this.id));
    } catch (e) {
    }
    return oldOnRemoved ? oldOnRemoved.apply(this, arguments) : undefined;
  };

  return iframe;
}

function updateIframeRect(node, iframe) {
  const canvas = app.canvas;
  const canvasEl = canvas?.canvas;
  if (!canvasEl) return;

  const rect = canvasEl.getBoundingClientRect();
  const ds = canvas.ds;
  const scale = ds?.scale ?? 1;
  const offset = ds?.offset ?? [0, 0];

  const x = rect.left + (node.pos[0] + offset[0]) * scale;
  const y = rect.top + (node.pos[1] + offset[1]) * scale;
  const w = node.size[0] * scale;
  const h = node.size[1] * scale;

  const titleHRaw =
    (typeof node?.title_height === "number" && Number.isFinite(node.title_height) && node.title_height) ||
    (typeof node?.constructor?.title_height === "number" &&
      Number.isFinite(node.constructor.title_height) &&
      node.constructor.title_height) ||
    globalThis?.LiteGraph?.NODE_TITLE_HEIGHT ||
    30;
  const titleH = titleHRaw * scale;
  const insetX = 8 * scale;
  const insetTop = 0;
  const insetBottom = 8 * scale;
  const headerAdjust = 20 * scale;
  const innerX = x + insetX;
  const innerY = y + titleH + insetTop - headerAdjust;
  const innerW = w - insetX * 2;
  const innerH = h - titleH - insetTop - insetBottom + headerAdjust;

  const nx = Number.isFinite(innerX) ? innerX : 0;
  const ny = Number.isFinite(innerY) ? innerY : 0;
  const nw = Number.isFinite(innerW) ? innerW : 0;
  const nh = Number.isFinite(innerH) ? innerH : 0;

  iframe.style.left = `${Math.round(nx)}px`;
  iframe.style.top = `${Math.round(ny)}px`;
  iframe.style.width = `${Math.max(0, Math.round(nw))}px`;
  iframe.style.height = `${Math.max(0, Math.round(nh))}px`;

  const isCollapsed = !!node.flags?.collapsed;
  const hasArea = nw >= 2 && nh >= 2;
  iframe.style.display = !isCollapsed && hasArea ? "block" : "none";
}

app.registerExtension({
  name: EXT_NAME,
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== NODE_NAME) return;

    const oldOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = oldOnNodeCreated ? oldOnNodeCreated.apply(this, arguments) : undefined;
      try {
        if (!Array.isArray(this.size) || this.size.length < 2) {
          this.size = [...DEFAULT_NODE_SIZE];
        } else {
          this.size[0] = Math.max(this.size[0] ?? 0, DEFAULT_NODE_SIZE[0]);
          this.size[1] = Math.max(this.size[1] ?? 0, DEFAULT_NODE_SIZE[1]);
        }
        this.setDirtyCanvas?.(true, true);
      } catch (e) {
      }
      return r;
    };

    const oldOnDrawForeground = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (ctx) {
      const r = oldOnDrawForeground ? oldOnDrawForeground.apply(this, arguments) : undefined;
      try {
        const iframe = ensureIframeForNode(this);
        updateIframeRect(this, iframe);
      } catch (e) {
      }
      return r;
    };

    const oldOnResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      const r = oldOnResize ? oldOnResize.apply(this, arguments) : undefined;
      try {
        const iframe = ensureIframeForNode(this);
        updateIframeRect(this, iframe);
      } catch (e) {
      }
      return r;
    };
  },
});
