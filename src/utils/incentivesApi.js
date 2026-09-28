import { INCENTIVES_FUNCTION_URL, getAppId } from "./constants.js";
import logger from "./logger.js";

/**
 * Read the settings currently published to the storefront (null if never saved)
 */
export async function fetchPublishedIncentives() {
  try {
    const response = await fetch(INCENTIVES_FUNCTION_URL);
    return await response.json();
  } catch (error) {
    logger.error("Incentives fetch error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Publish settings to the storefront via serverless function
 *
 * @param {string} token - Embedded token
 * @param {object} settings - Incentive settings
 */
export async function saveIncentives(token, settings) {
  try {
    const response = await fetch(INCENTIVES_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token, appId: getAppId(), settings }),
    });
    return await response.json();
  } catch (error) {
    logger.error("Incentives save error:", error);
    return { success: false, error: error.message };
  }
}
