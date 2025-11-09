import { DEFAULT_DATA } from "./constants.js";

export async function loadConfig() {
  try {
    const response = await fetch("data.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Failed to load data.json");
    const config = await response.json();
    return { ...DEFAULT_DATA, ...config };
  } catch (error) {
    console.warn("[Fundraising:Config] Using defaults:", error.message);
    return { ...DEFAULT_DATA };
  }
}


