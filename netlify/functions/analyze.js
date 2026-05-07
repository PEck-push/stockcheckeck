/**
 * Netlify Function: /api/analyze
 * Stub – API-Key noch nicht konfiguriert.
 * Sobald ANTHROPIC_API_KEY gesetzt ist, diese Datei durch die vollständige
 * Implementierung ersetzen (inkl. @anthropic-ai/sdk).
 */

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  return {
    statusCode: 503,
    headers,
    body: JSON.stringify({
      error: "KI-Analyse noch nicht aktiviert",
      hint: "ANTHROPIC_API_KEY in Netlify → Site settings → Environment variables eintragen",
    }),
  };
};
