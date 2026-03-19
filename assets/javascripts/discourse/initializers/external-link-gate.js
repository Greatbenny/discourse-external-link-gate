import { withPluginApi } from "discourse/lib/plugin-api";

function addElgModalClass() {
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
        window?.Discourse?.SiteSettings?.external_link_gate_modal_intro ||
        "By continuing, you agree to this community’s Terms of Service and acknowledge the Privacy Policy.";
      body.prepend(intro);
    }

    document.documentElement.classList.add("elg-modal-open");
  });
}

function watchForModalClose() {
  const observer = new MutationObserver(() => {
    const stillOpen =
      document.querySelector(".elg-native-login-modal") ||
      document.querySelector(".login-modal") ||
      document.querySelector(".d-modal");

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

  initialize(container) {
    withPluginApi("1.34.0", (api) => {
      watchForModalClose();

      const modalService = container.lookup("service:modal");

      const openNativeLogin = async () => {
        let LoginModalClass = null;

        try {
          LoginModalClass =
            container.factoryFor("component:modal/login")?.class || null;
        } catch (e) {
          LoginModalClass = null;
        }

        if (LoginModalClass && modalService?.show) {
          await modalService.show(LoginModalClass, {
            model: {},
          });
          addElgModalClass();
          return;
        }

        // fallback if resolver path differs on this build
        window.location.href = "/login";
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

      document.addEventListener("click", clickHandler);
      document.addEventListener("keydown", keyHandler);

      api.cleanupStream(() => {
        document.removeEventListener("click", clickHandler);
        document.removeEventListener("keydown", keyHandler);
      });
    });
  },
};
