/**
 * FMCSA SAFER API integration.
 * Uses the FMCSA mobile API (https://mobile.fmcsa.dot.gov) when FMCSA_API_KEY is set.
 * Falls back gracefully when unavailable.
 */

export interface SaferCarrier {
  dotNumber?: string;
  legalName?: string;
  dbaName?: string;
  allowedToOperate?: string;   // "Y" | "N"
  bipdInsuranceOnFile?: number;  // $ amount
  cargoInsuranceOnFile?: number; // $ amount
  safetyRating?: string;         // "Satisfactory" | "Conditional" | "Unsatisfactory" | "None"
  safetyRatingDate?: string;
  mcNumber?: string;
  dotStatus?: string;            // Human-readable DOT status description
  mcAuthority?: string;          // Human-readable MC authority status
  operatingStatus?: string;
  totalDrivers?: number;
  totalPowerUnits?: number;
  entityType?: string;
  oosPercentageDueDateLabel?: string;
  rawData?: unknown;
}

export interface SaferLookupResult {
  success: boolean;
  carrier?: SaferCarrier;
  error?: string;
  source: "fmcsa_api" | "unavailable";
}

function apiKey(): string | undefined {
  return process.env.FMCSA_API_KEY;
}

export async function lookupByDot(dotNumber: string): Promise<SaferLookupResult> {
  const key = apiKey();

  if (!key) {
    return { success: false, error: "FMCSA_API_KEY not configured. Set it to enable automatic SAFER lookups.", source: "unavailable" };
  }

  // Clean up DOT number
  const cleanDot = dotNumber.replace(/\D/g, "");
  if (!cleanDot) {
    return { success: false, error: "Invalid DOT number format.", source: "unavailable" };
  }

  const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${cleanDot}?webKey=${key}`;

  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 404) {
      return { success: false, error: `No carrier found for DOT ${cleanDot}.`, source: "fmcsa_api" };
    }

    if (!res.ok) {
      return { success: false, error: `FMCSA API returned ${res.status}.`, source: "fmcsa_api" };
    }

    const data = await res.json() as { content?: { carrier?: Record<string, unknown> } };
    const carrier = data?.content?.carrier;

    if (!carrier) {
      return { success: false, error: "No carrier data in FMCSA response.", source: "fmcsa_api" };
    }

    const saferCarrier: SaferCarrier = {
      dotNumber: String(carrier.dotNumber ?? ""),
      legalName: String(carrier.legalName ?? ""),
      dbaName: carrier.dbaName ? String(carrier.dbaName) : undefined,
      allowedToOperate: carrier.allowedToOperate as string | undefined,
      bipdInsuranceOnFile: carrier.bipdInsuranceOnFile ? Number(carrier.bipdInsuranceOnFile) : undefined,
      cargoInsuranceOnFile: carrier.cargoInsuranceOnFile ? Number(carrier.cargoInsuranceOnFile) : undefined,
      safetyRating: carrier.safetyRating ? String(carrier.safetyRating) : undefined,
      safetyRatingDate: carrier.safetyRatingDate ? String(carrier.safetyRatingDate) : undefined,
      mcNumber: carrier.mcNumber ? String(carrier.mcNumber) : carrier.docketNumber ? String(carrier.docketNumber) : undefined,
      dotStatus: carrier.allowedToOperate === "Y" ? "Active / Authorized" : carrier.allowedToOperate === "N" ? "Not Authorized" : undefined,
      mcAuthority: carrier.commonAuthorityStatus ? String(carrier.commonAuthorityStatus) : carrier.contractAuthorityStatus ? String(carrier.contractAuthorityStatus) : undefined,
      operatingStatus: carrier.operatingStatus ? String(carrier.operatingStatus) : undefined,
      totalDrivers: carrier.totalDrivers ? Number(carrier.totalDrivers) : undefined,
      totalPowerUnits: carrier.totalPowerUnits ? Number(carrier.totalPowerUnits) : undefined,
      entityType: carrier.entityType ? String(carrier.entityType) : undefined,
      rawData: carrier,
    };

    return { success: true, carrier: saferCarrier, source: "fmcsa_api" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn("[SAFER] Lookup failed:", message);
    return { success: false, error: `SAFER lookup failed: ${message}`, source: "fmcsa_api" };
  }
}

export async function lookupByMc(mcNumber: string): Promise<SaferLookupResult> {
  const key = apiKey();
  if (!key) {
    return { success: false, error: "FMCSA_API_KEY not configured.", source: "unavailable" };
  }

  const cleanMc = mcNumber.replace(/\D/g, "");
  if (!cleanMc) {
    return { success: false, error: "Invalid MC number format.", source: "unavailable" };
  }

  const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/docket-number/${cleanMc}?webKey=${key}`;

  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 404) {
      return { success: false, error: `No carrier found for MC ${cleanMc}.`, source: "fmcsa_api" };
    }
    if (!res.ok) {
      return { success: false, error: `FMCSA API returned ${res.status}.`, source: "fmcsa_api" };
    }

    const data = await res.json() as { content?: { carrier?: Record<string, unknown> } };
    const carrier = data?.content?.carrier;
    if (!carrier) return { success: false, error: "No carrier data in response.", source: "fmcsa_api" };

    const saferCarrier: SaferCarrier = {
      dotNumber: carrier.dotNumber ? String(carrier.dotNumber) : undefined,
      legalName: carrier.legalName ? String(carrier.legalName) : undefined,
      dbaName: carrier.dbaName ? String(carrier.dbaName) : undefined,
      allowedToOperate: carrier.allowedToOperate as string | undefined,
      bipdInsuranceOnFile: carrier.bipdInsuranceOnFile ? Number(carrier.bipdInsuranceOnFile) : undefined,
      cargoInsuranceOnFile: carrier.cargoInsuranceOnFile ? Number(carrier.cargoInsuranceOnFile) : undefined,
      safetyRating: carrier.safetyRating ? String(carrier.safetyRating) : undefined,
      safetyRatingDate: carrier.safetyRatingDate ? String(carrier.safetyRatingDate) : undefined,
      mcNumber: carrier.docketNumber ? String(carrier.docketNumber) : carrier.mcNumber ? String(carrier.mcNumber) : undefined,
      dotStatus: carrier.allowedToOperate === "Y" ? "Active / Authorized" : carrier.allowedToOperate === "N" ? "Not Authorized" : undefined,
      mcAuthority: carrier.commonAuthorityStatus ? String(carrier.commonAuthorityStatus) : carrier.contractAuthorityStatus ? String(carrier.contractAuthorityStatus) : undefined,
      operatingStatus: carrier.operatingStatus ? String(carrier.operatingStatus) : undefined,
      totalDrivers: carrier.totalDrivers ? Number(carrier.totalDrivers) : undefined,
      totalPowerUnits: carrier.totalPowerUnits ? Number(carrier.totalPowerUnits) : undefined,
      entityType: carrier.entityType ? String(carrier.entityType) : undefined,
      rawData: carrier,
    };
    return { success: true, carrier: saferCarrier, source: "fmcsa_api" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: `SAFER lookup failed: ${message}`, source: "fmcsa_api" };
  }
}
