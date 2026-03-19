import { withPluginApi } from "discourse/lib/plugin-api";

const COUNT_KEY = "elg_guest_gate_count_v2";
const LAST_PATH_KEY = "elg_guest_gate_last_path_v2";
const MODAL_OPENED_KEY = "elg_guest_gate_modal_opened_v2";

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

function markLoginModal(siteSettings) {
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

function watchForModalClose() {
  const observer = new MutationObserver(() => {
    const stillOpen =
      document.querySelector(".elg-native-login-modal") ||
      document.querySelector(".login-modal") ||
      document.querySelector(".d-modal.login-modal");

    if (!stillOpen) {
      document.documentElement.classList.remove("elg-modal-open");
      removeGateBlur();
      sessionStorage.removeItem(MODAL_OPENED_KEY);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

export default {
  name: "external-link-gate",

  initialize(container) {
    withPluginApi("1.34.0", (api) => {
      const siteSettings = container.lookup("service:site-settings");
      const modalService = container.lookup("service:modal");

      watchForModalClose();

      const openNativeLogin = async () => {
        let LoginModalClass = null;

        try {
          LoginModalClass =
            container.factoryFor("component:modal/login")?.class || null;
        } catch (e) {
          LoginModalClass = null;
        }

        if (LoginModalClass && modalService?.show) {
          addGateBlur();
          sessionStorage.setItem(MODAL_OPENED_KEY, "1");
          await modalService.show(LoginModalClass, { model: {} });
          markLoginModal(siteSettings);
          return;
        }

        window.location.href = "/login";
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
        if (!isQualifyingPath(path, siteSettings)) {
          return false;
        }

        return true;
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

        if (count >= threshold && !sessionStorage.getItem(MODAL_OPENED_KEY)) {
          openNativeLogin();
        }
      };

      const clickHandler = (event) => {
        const trigger = event.target.closest("[data-elg-trigger]");
        if (!trigger) {
          return;
        }

        const action = trigger.dataset.elgTrigger;

        if (action === "login") {
          event.preventDefault();
          openNativeLogin();
          return;
        }

        if (action === "upgrade") {
          const anchor = trigger.querySelector("a[href]");
          if (anchor) {
            return;
          }

          const upgradeUrl =
            trigger.dataset.elgUpgradeUrl ||
            siteSettings.external_link_gate_upgrade_url ||
            "/signup";

          window.location.href = upgradeUrl;
        }
      };

      const keyHandler = (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        const trigger = event.target.closest("[data-elg-trigger='login']");
        if (!trigger) {
          return;
        }

        event.preventDefault();
        openNativeLogin();
      };

      document.addEventListener("click", clickHandler);
      document.addEventListener("keydown", keyHandler);

      api.onPageChange(() => {
        sessionStorage.removeItem(MODAL_OPENED_KEY);
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
