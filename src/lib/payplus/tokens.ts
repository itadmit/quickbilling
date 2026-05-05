import { payplusRequest, PAYPLUS_CONFIG } from "./client";

export async function checkToken(tokenUid: string): Promise<{
  valid: boolean;
  lastFour?: string;
  brand?: string;
  expiry?: string;
}> {
  try {
    const response = await payplusRequest<{
      four_digits: string;
      brand_name: string;
      expiry_month: string;
      expiry_year: string;
    }>(`Token/Check/${tokenUid}`, "GET");

    if (response.results.status !== "success") {
      return { valid: false };
    }

    return {
      valid: true,
      lastFour: response.data?.four_digits,
      brand: response.data?.brand_name,
      expiry: response.data
        ? `${response.data.expiry_month}/${response.data.expiry_year}`
        : undefined,
    };
  } catch (err) {
    console.error("[PayPlus] checkToken failed:", err);
    return { valid: false };
  }
}

export async function removeToken(tokenUid: string): Promise<boolean> {
  try {
    const raw = (await payplusRequest(`Token/Remove/${tokenUid}`, "POST", {
      terminal_uid: PAYPLUS_CONFIG.terminalUid,
    })) as unknown as {
      // PayPlus's Token/Remove docs (uniquely) document the wrapper as
      // `result` (singular). Other endpoints use `results`. Accept either.
      result?: { status?: string; code?: number };
      results?: { status?: string; code?: number };
    };
    const wrapper = raw.results ?? raw.result;
    return wrapper?.status === "success";
  } catch (err) {
    console.error("[PayPlus] removeToken failed:", err);
    return false;
  }
}
