import { checkBotId } from 'botid/server';

/**
 * Vercel BotID's verdict on a request to a public form endpoint.
 *
 * Every route that calls this must also be listed in instrumentation-client.ts:
 * that is what attaches the browser's proof to the request, and without it
 * every visitor looks like a bot.
 *
 * Fails open. In production BotID needs the project's Vercel OIDC token and a
 * call to Vercel, and a contact form that stops working during a hiccup is
 * worse than one that falls back to its honeypot and rate limit for a while.
 * The error is logged so a misconfiguration doesn't go unnoticed.
 */
export async function isAutomatedRequest(label: string): Promise<boolean> {
  try {
    const { isBot } = await checkBotId();
    if (isBot) console.warn(`[bot-protection] ${label}: blocked a request BotID classified as automated`);
    return isBot;
  } catch (err) {
    console.error(`[bot-protection] ${label}: BotID check failed, allowing the request`, err);
    return false;
  }
}

/** Shown if a real person is ever misread as a bot, so they can still reach us. */
export const BOT_BLOCKED_MESSAGE =
  "We couldn't accept that from this browser. Please email us at info@reparationroad.org instead.";
