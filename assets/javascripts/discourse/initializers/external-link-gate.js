import { withPluginApi } from "discourse/lib/plugin-api";

const COUNT_KEY = "elg_guest_gate_count_v3";
const LAST_PATH_KEY = "elg_guest_gate_last_path_v3";
const PAGE_GATE_OPEN_KEY = "elg_guest_gate_open_v3";

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

function decorateLoginModal(siteSettings) {
  requestAnimationFrame(() => {
    const modal =
      document.querySelector(".login-modal") ||
      document.querySelector(".d-modal.login-modal") ||
      document.querySelector(".d-modal");

    if (!modal) {
      return;
    }

    modal.classList.add("elg-native-login-modal");

    const body =
      modal.querySelector(".d-modal__body") ||
      modal.querySelector(".modal-body") ||
      modal;

    if (body && !body.querySelector(".elg-login-intro")) {
      const intro = document.createElement("div");
      intro.className = "elg-login-intro";
      intro.textContent =
        siteSettings.guest_gate_modal_intro ||
        "By continuing, you agree to this community’s Terms of Service and acknowledge the Privacy Policy.";
      body.prepend(intro);
    }

    document.documentElement.classList.add("elg-modal-open");
    addGateBlur();
  });
}

function observeModalClose() {
  const observer = new MutationObserver(() => {
    const stillOpen =
      document.querySelector(".elg-native-login-modal") ||
      document.querySelector(".login-modal") ||
      document.querySelector(".d-modal.login-modal");

    if (!stillOpen) {
      document.documentElement.classList.remove("elg-modal-open");
      removeGateBlur();
      sessionStorage.removeItem(PAGE_GATE_OPEN_KEY);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function openViaHeaderButton(selector) {
  const btn = document.querySelector(selector);
  if (btn) {
    btn.click();
    return true;
  }
  return false;
}

export default {
  name: "external-link-gate",

  initialize(container) {
    withPluginApi("1.34.0", (api) => {
      const siteSettings = container.lookup("service:site-settings");

      observeModalClose();

      const applicationController = (() => {
        try {
          return container.lookup("controller:application");
        } catch {
          return null;
        }
      })();

      const openLoginModal = () => {
        addGateBlur();

        if (applicationController?.send) {
          applicationController.send("showLogin");
          decorateLoginModal(siteSettings);
          return;
        }

        if (openViaHeaderButton(".header-buttons .login-button, .login-button")) {
          decorateLoginModal(siteSettings);
          return;
        }
      };

      const openSignupModal = () => {
        addGateBlur();

        if (applicationController?.send) {
          applicationController.send("showCreateAccount");
          decorateLoginModal(siteSettings);
          return;
        }

        if (openViaHeaderButton(".header-buttons .sign-up-button, .sign-up-button")) {
          decorateLoginModal(siteSettings);
          return;
        }
      };

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

        const path = currentPath();
        return isQualifyingPath(path, siteSettings);
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

      const maybeOpenPageGate = () => {
        if (!shouldRunGuestGate()) {
          return;
        }

        incrementGuestPageCount();

        const count = parseInt(sessionStorage.getItem(COUNT_KEY) || "0", 10);
        const threshold = parseInt(siteSettings.guest_gate_after_page_views || 0, 10);

        if (threshold < 1) {
          return;
        }

        if (count >= threshold && !sessionStorage.getItem(PAGE_GATE_OPEN_KEY)) {
          sessionStorage.setItem(PAGE_GATE_OPEN_KEY, "1");
          openLoginModal();
        }
      };

      const clickHandler = (event) => {
        const opener = event.target.closest("[data-elg-open]");
        if (opener) {
          event.preventDefault();

          const action = opener.dataset.elgOpen;
          if (action === "login") {
            openLoginModal();
          } else if (action === "signup") {
            openSignupModal();
          }
          return;
        }
      };

      const keyHandler = (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        const opener = event.target.closest("[data-elg-open]");
        if (!opener) {
          return;
        }

        event.preventDefault();

        const action = opener.dataset.elgOpen;
        if (action === "login") {
          openLoginModal();
        } else if (action === "signup") {
          openSignupModal();
        }
      };

      document.addEventListener("click", clickHandler);
      document.addEventListener("keydown", keyHandler);

      api.onPageChange(() => {
        maybeOpenPageGate();
      });

      maybeOpenPageGate();

      api.cleanupStream(() => {
        document.removeEventListener("click", clickHandler);
        document.removeEventListener("keydown", keyHandler);
      });
    });
  },
};
