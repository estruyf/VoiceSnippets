import { OverlayScrollbars } from "overlayscrollbars";
import { useEffect } from "react";

export const useOverlayScrollbars = () => {
  useEffect(() => {
    // Initialize OverlayScrollbars on all scrollable elements
    const initScrollbars = () => {
      // Target only elements with overflow-y-auto or overflow-auto classes
      const scrollableElements = [
        ...document.querySelectorAll(".overflow-y-auto"),
        ...document.querySelectorAll(".overflow-auto"),
      ];

      scrollableElements.forEach((element) => {
        const htmlElement = element as HTMLElement;
        if (
          htmlElement &&
          !htmlElement.hasAttribute("data-overlayscrollbars-initialize")
        ) {
          try {
            OverlayScrollbars(htmlElement, {
              scrollbars: {
                theme: "os-theme-custom",
                autoHide: "never",
              },
            });
            htmlElement.setAttribute(
              "data-overlayscrollbars-initialize",
              "true",
            );
          } catch (error) {
            console.warn("Failed to initialize OverlayScrollbars:", error);
          }
        }
      });
    };

    // Delay initialization to ensure DOM is fully ready
    const timeoutId = setTimeout(initScrollbars, 100);

    // Re-initialize when DOM changes (for dynamic content)
    const observer = new MutationObserver(() => {
      setTimeout(initScrollbars, 100);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
      // Clean up all OverlayScrollbars instances
      document
        .querySelectorAll("[data-overlayscrollbars-initialize]")
        .forEach((element) => {
          const instance = OverlayScrollbars(element as HTMLElement);
          if (instance) {
            instance.destroy();
          }
        });
    };
  }, []);
};
