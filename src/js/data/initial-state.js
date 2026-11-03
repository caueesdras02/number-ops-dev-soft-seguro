import { SCHEMA_VERSION } from "../config/constants.js";
export function createInitialState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { seedApplied: false },
    numbers: [],
    clients: [],
    groups: [],
    responsibles: [],
    locations: [],
    incidents: [],
    historyEvents: [],
    campaigns: [],
    numberCampaignLinks: [],
  };
}
