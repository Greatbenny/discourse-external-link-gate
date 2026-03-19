import { withPluginApi } from "discourse/lib/plugin-api";
import showModal from "discourse/lib/show-modal";
import { schedule } from "@ember/runloop";

function markLoginModal() {
  schedule("afterRender", () => {
    const modal =
      document.querySelector(".login-modal") ||
      document.querySelector(".d-modal.login-modal") ||
      document.querySelector(".modal.login-modal") ||
      document.querySelector("[data-key='login']");

    if (!modal) {
      return;
    }

    modal.classList.add("elg-native-login-modal");

    let intro = modal.querySelector(".elg-login-intro");
    if (!intro) {
      intro = document.createElement("div");
      intro.className = "elg-login-intro";
      intro.textContent =
        window?.Discourse?.SiteSettings?.external_link_gate_modal_intro ||
        "By continuing, you agree to this community’s Terms of Service and acknowledge the Privacy Policy.";

      const body =
        modal.querySelector(".modal-body") ||
        modal.querySelector(".d-modal__body") ||
        modal.querySelector(".login-modal-body") ||
        modal;

      body.prepend(intro);
    }

    document.documentElement.classList.add("elg-modal-open");
  });
}

function cleanupModalClassWhenClosed() {
  const observer = new MutationObserver(() => {
    const stillOpen =
      document.querySelector(".elg-native-login-modal") ||
      document.querySelector(".login-modal") ||
      document.querySelector(".d-modal.login-modal");

    if (!stillOpen) {
      document.documentElement.classList.remove("elg-modal-open");
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

export default {
  name: "external-link-gate",

  initialize() {
    withPluginApi("0.8.7", (api) => {
      cleanupModalClassWhenClosed();

      const openNativeLogin = () => {
        showModal("login");
        markLoginModal();
      };

      const handler = (event) => {
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
          const link = trigger.querySelector("a[href]");
          if (link) {
            return;
          }

          const upgradeUrl =
            trigger.dataset.elgUpgradeUrl ||
            window?.Discourse?.SiteSettings?.external_link_gate_upgrade_url ||
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

      document.addEventListener("click", handler);
      document.addEventListener("keydown", keyHandler);

      api.cleanupStream(() => {
        document.removeEventListener("click", handler);
        document.removeEventListener("keydown", keyHandler);
      });
    });
  },
};
