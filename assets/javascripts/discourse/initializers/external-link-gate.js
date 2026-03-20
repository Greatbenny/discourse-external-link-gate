import { withPluginApi } from "discourse/lib/plugin-api";

const COUNT_KEY = "elg_guest_gate_count_v4";
const LAST_PATH_KEY = "elg_guest_gate_last_path_v4";
const OVERLAY_SHOWN_KEY = "elg_guest_gate_overlay_shown_v4";

function splitSetting(value) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function currentPath() {
  return window.location.pathname || "/";
}

function isBotUserAgent(siteSettings) {
  const ua = (window.navigator.userAgent || "").toLowerCase();
  const blockedAgents = splitSetting(siteSettings.guest_gate_exempt_user_agents).map(
    (item) => item.toLowerCase()
  );

  return blockedAgents.some((token) => ua.includes(token));
}

function isExcludedPath(path, siteSettings) {
  const excluded = splitSetting(siteSettings.guest_gate_exempt_paths);
  return excluded.some((prefix) => path.startsWith(prefix));
}

function isQualifyingPath(path, siteSettings) {
  if (isExcludedPath(path, siteSettings)) {
    return false;
  }

  if (siteSettings.guest_gate_topic_pages_only) {
    return /^\/t\//.test(path);
  }

  return true;
}

function addGateBlur() {
  document.documentElement.classList.add("elg-gate-screen");
}

function removeGateBlur() {
  document.documentElement.classList.remove("elg-gate-screen");
}

function removeOverlay() {
  document.querySelector(".elg-guest-gate-overlay")?.remove();
  removeGateBlur();
  sessionStorage.removeItem(OVERLAY_SHOWN_KEY);
}

async function fetchLoginMarkup() {
  const response = await fetch("/login", {
    credentials: "same-origin",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  const html = await response.text();
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper;
}

function extractAuthButtons(markup) {
  const candidates = [
    ...markup.querySelectorAll("a.btn-social"),
    ...markup.querySelectorAll("button.btn-social"),
    ...markup.querySelectorAll(".social-login a"),
    ...markup.querySelectorAll(".social-login button"),
    ...markup.querySelectorAll(".login-buttons a[href*='/auth/']"),
    ...markup.querySelectorAll(".login-buttons button[data-provider]"),
  ];

  const seen = new Set();
  const buttons = [];

  for (const el of candidates) {
    const text = (el.textContent || "").trim();
    const href = el.getAttribute("href") || "";
    const provider = el.dataset.provider || href || text;

    if (!text || seen.has(provider)) {
      continue;
    }

    seen.add(provider);

    buttons.push({
      text,
      href,
      className: el.className || "",
      provider: el.dataset.provider || "",
    });
  }

  return buttons;
}

function buildSocialButtons(buttons) {
  if (!buttons.length) {
    return "";
  }

  const limited = buttons.slice(0, 2);

  return `
    <div class="elg-auth-row">
      ${limited
        .map((btn, index) => {
          const or = index === 1 ? `<span class="elg-auth-or">or</span>` : "";
          const hrefAttr = btn.href ? `href="${btn.href}"` : `href="/login"`;
          return `
            ${or}
            <a class="elg-auth-btn ${btn.className}" ${hrefAttr}>
              ${btn.text}
            </a>
          `;
        })
        .join("")}
    </div>
  `;
}

function buildOverlayHtml(siteSettings, socialButtonsHtml) {
  const intro =
    siteSettings.guest_gate_modal_intro ||
    "By continuing, you agree to this community’s Terms of Service and acknowledge the Privacy Policy.";

  return `
    <div class="elg-guest-gate-overlay" data-elg-overlay>
      <div class="elg-guest-gate-backdrop"></div>
      <div class="elg-guest-gate-card">
        <div class="elg-guest-gate-heading">
          Looks like you’re enjoying the discussion
        </div>

        <div class="elg-guest-gate-intro">
          ${intro}
        </div>

        ${socialButtonsHtml}

        <div class="elg-guest-gate-footer">
          <button class="elg-footer-link" data-elg-open="login" type="button">
            I Have an Account
          </button>
          <span class="elg-footer-sep">·</span>
          <button class="elg-footer-link" data-elg-open="signup" type="button">
            Sign Up With Email
          </button>
        </div>
      </div>
    </div>
  `;
}

function attachOverlayEvents(container) {
  const applicationController = (() => {
    try {
      return container.lookup("controller:application");
    } catch {
      return null;
    }
  })();

  document.querySelector(".elg-guest-gate-overlay")?.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-elg-open]");
    if (!opener) {
      return;
    }

    event.preventDefault();

    const action = opener.dataset.elgOpen;

    if (action === "login") {
      if (applicationController?.send) {
        applicationController.send("showLogin");
      }
      return;
    }

    if (action === "signup") {
      if (applicationController?.send) {
        applicationController.send("showCreateAccount");
      }
    }
  });
}

async function showGuestGateOverlay(container, siteSettings) {
  if (document.querySelector(".elg-guest-gate-overlay")) {
    return;
  }

  addGateBlur();

  let socialButtons = [];
  try {
    const loginMarkup = await fetchLoginMarkup();
    socialButtons = extractAuthButtons(loginMarkup);
  } catch {
    socialButtons = [];
  }

  const html = buildOverlayHtml(siteSettings, buildSocialButtons(socialButtons));
  document.body.insertAdjacentHTML("beforeend", html);
  attachOverlayEvents(container);
}

export default {
  name: "external-link-gate",

  initialize(container) {
    withPluginApi("1.34.0", (api) => {
      const siteSettings = container.lookup("service:site-settings");

      const shouldRunGuestGate = () => {
        if (!siteSettings.guest_gate_enabled) {
          return false;
        }

        if (api.getCurrentUser()) {
          return false;
        }

        if (isBotUserAgent(siteSettings)) {
          return false;
        }

        return isQualifyingPath(currentPath(), siteSettings);
      };

      const incrementGuestPageCount = () => {
        const path = currentPath();
        const lastPath = sessionStorage.getItem(LAST_PATH_KEY);

        if (lastPath === path) {
          return;
        }

        sessionStorage.setItem(LAST_PATH_KEY, path);

        const count = parseInt(sessionStorage.getItem(COUNT_KEY) || "0", 10);
        sessionStorage.setItem(COUNT_KEY, String(count + 1));
      };

      const maybeOpenPageGate = async () => {
        if (!shouldRunGuestGate()) {
          removeOverlay();
          return;
        }

        incrementGuestPageCount();

        const count = parseInt(sessionStorage.getItem(COUNT_KEY) || "0", 10);
        const threshold = parseInt(siteSettings.guest_gate_after_page_views || 0, 10);

        if (threshold < 1) {
          return;
        }

        if (count >= threshold && !sessionStorage.getItem(OVERLAY_SHOWN_KEY)) {
          sessionStorage.setItem(OVERLAY_SHOWN_KEY, "1");
          await showGuestGateOverlay(container, siteSettings);
        }
      };

      const clickHandler = (event) => {
        const opener = event.target.closest("[data-elg-open]");
        if (!opener || opener.closest(".elg-guest-gate-overlay")) {
          return;
        }

        event.preventDefault();

        const applicationController = (() => {
          try {
            return container.lookup("controller:application");
          } catch {
            return null;
          }
        })();

        const action = opener.dataset.elgOpen;
        if (action === "login" && applicationController?.send) {
          applicationController.send("showLogin");
        } else if (action === "signup" && applicationController?.send) {
          applicationController.send("showCreateAccount");
        }
      };

      document.addEventListener("click", clickHandler);

      api.onPageChange(() => {
        maybeOpenPageGate();
      });

      maybeOpenPageGate();

      api.cleanupStream(() => {
        document.removeEventListener("click", clickHandler);
      });
    });
  },
};
