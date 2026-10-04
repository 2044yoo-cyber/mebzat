/**
 * What a member is told when a provider fails.
 *
 * Two audiences, two messages, and they must not be the same one:
 *
 *   The server log gets the provider, the status and the response body. That
 *   is what the owner needs to fix a broken deployment at eleven at night.
 *
 *   The browser gets a sentence. Not because the member is not clever, but
 *   because a provider's raw error body is written for a developer and
 *   sometimes echoes the request back — headers included. An error message is
 *   not a place to find out whether a provider redacts the Authorization
 *   header, so nothing from the body ever reaches the page.
 *
 * No `server-only` guard: this is a lookup table of English sentences, and the
 * check script reads it under plain Node.
 */

/** Status codes that mean something specific enough to say out loud. */
export function friendlyProviderMessage(
  status: number | null,
  provider: string | null,
): string {
  const who = provider ? providerLabel(provider) : "The AI provider";

  switch (status) {
    case 401:
    case 403:
      // Deliberately does not say which key or show any part of it. Somebody
      // who can see this page is not necessarily somebody who deploys it.
      return `${who} rejected Medosha's credentials. The site owner needs to check the API key.`;

    case 402:
      return `${who} reports no remaining credit on Medosha's account. The site owner needs to top it up.`;

    case 429:
      return `${who} is rate-limiting Medosha right now. Wait a moment and ask again — you have not been charged.`;

    case 404:
      return `The AI model Medosha is configured to use is not available on ${who}. The site owner needs to check the model name.`;

    case 400:
    case 422:
      return `${who} could not read that request. If it had an image or a very long message, try a shorter one.`;

    case 413:
      return "That message or image is too large to send. Try a smaller one.";

    case 408:
    case 504:
      return `${who} took too long to answer. Try again — you have not been charged.`;

    case 500:
    case 502:
    case 503:
      return `${who} is having an outage. Try again shortly — you have not been charged.`;

    case 0:
      // No status at all: DNS, TLS, or the request timed out before a reply.
      return `Medosha could not reach ${who}. Check the connection and try again — you have not been charged.`;

    default:
      return "Medosha AI could not answer that. Try again — you have not been charged.";
  }
}

/**
 * The provider's public name.
 *
 * Named rather than hidden because "the AI provider is down" is unactionable
 * and "Grok is down" can be checked against a status page. It reveals nothing:
 * which model a site uses is not a secret, and the key is what is.
 */
export function providerLabel(provider: string): string {
  switch (provider) {
    case "xai":
      return "xAI (Grok)";
    case "openai":
      return "OpenAI";
    case "gemini":
      return "Google Gemini";
    case "groq":
      return "Groq";
    case "openrouter":
      return "OpenRouter";
    case "ollama":
      return "the local Ollama server";
    default:
      return "The AI provider";
  }
}

/**
 * Whether a failure is worth trying the next provider for.
 *
 * A bad key or a missing model will fail identically on a retry, but they are
 * still worth falling through on — the *next* provider may have a working key.
 * What is not worth falling through on is a malformed request: every provider
 * will reject it the same way, and trying five of them turns one 400 into five
 * seconds of waiting and five rows in the usage log.
 */
export function worthFallingBack(status: number | null): boolean {
  return status !== 400 && status !== 413 && status !== 422;
}
