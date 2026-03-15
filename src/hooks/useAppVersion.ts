import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export const useAppVersion = () => {
  const [version, setVersion] = useState<string>("unknown");

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await invoke<string>("get_app_version");
        setVersion(`v${appVersion}`);
      } catch (error) {
        console.error("Failed to fetch app version", error);
      }
    };

    fetchVersion();
  }, []);

  return version;
};
