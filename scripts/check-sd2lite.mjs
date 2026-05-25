import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const env = { ...process.env };
if (existsSync(".env")) {
  const content = await readFile(".env", "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trim().startsWith("#")) continue;
    env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const baseUrl = (env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/+$/, "");
const apiKey = env.ARK_API_KEY || "";
const endpointId = env.ARK_ENDPOINT_ID && env.ARK_ENDPOINT_ID !== "replace_me" ? env.ARK_ENDPOINT_ID : "";
const modelName = env.ARK_MODEL && env.ARK_MODEL !== "replace_me" ? env.ARK_MODEL : "";
const model = endpointId || modelName;

const config = {
  baseUrl,
  hasKey: Boolean(apiKey && apiKey !== "replace_me"),
  modelConfigured: Boolean(model),
  model: model || "<missing>",
  usingEndpointId: Boolean(endpointId)
};

if (!config.hasKey || !config.modelConfigured) {
  console.log(JSON.stringify({ ok: false, stage: "config", config }, null, 2));
  process.exit(2);
}

try {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "ping" }],
      temperature: 0,
      max_tokens: 8
    })
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text.slice(0, 500);
  }
  console.log(
    JSON.stringify(
      {
        ok: response.ok,
        stage: "request",
        status: response.status,
        statusText: response.statusText,
        config,
        response: summarizeResponse(parsed)
      },
      null,
      2
    )
  );
  if (!response.ok) process.exit(1);
} catch (error) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        stage: "network",
        config,
        error: error instanceof Error ? error.message : "unknown error"
      },
      null,
      2
    )
  );
  process.exit(1);
}

function summarizeResponse(value) {
  if (!value || typeof value !== "object") return value;
  return {
    id: value.id,
    model: value.model,
    choices: Array.isArray(value.choices)
      ? value.choices.slice(0, 1).map((choice) => ({
          finishReason: choice.finish_reason,
          message: choice.message
        }))
      : undefined,
    error: value.error
  };
}
