// Frontend/src/hooks/useDigioMandate.js
import { useCallback } from "react";

export default function useDigioMandate() {
  const startMandateFlow = useCallback((documentId, identifier, { environment = "sandbox", logoUrl } = {}) => {
    if (!window.Digio) {
      alert("Digio SDK not loaded");
      return;
    }

    const options = {
      environment, // "sandbox" | "production"
      logo: logoUrl || "https://your-logo-url.com/logo.png",
      callback: function (response) {
        // success response: { txn_id, digio_doc_id, message }
        // error response:   { digio_doc_id, error_code, message }
        console.log("🔁 Digio callback:", response);

        if (response.error_code) {
          // failure
          alert(`eNACH failed: ${response.message || response.error_code}`);
        } else {
          alert("eNACH mandate completed successfully");
        }
      },
      // optional theming
      theme: {
        primaryColor: "#2563eb",
        secondaryColor: "#000000",
      },
    };

    const digio = new window.Digio(options);
    digio.init(); // must be called on a user interaction (button click)

    // If you’re using token approach, pass third arg tokenId
    digio.submit(documentId, identifier);
  }, []);

  return { startMandateFlow };
}
