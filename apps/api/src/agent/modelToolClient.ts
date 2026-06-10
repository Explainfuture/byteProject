import type { ChatMessage, ToolCall } from "./types";

export async function callToolCallingModel(messages: ChatMessage[], tools: unknown[]) {
  const baseUrl = normalizeBaseUrl(process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3");
  const model = process.env.ARK_ENDPOINT_ID || process.env.ARK_MODEL;
  const apiKey = process.env.ARK_API_KEY;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.1,
      max_tokens: 1200
    })
  });

  if (!response.ok) {
    throw new Error(`tool-calling request failed with ${response.status}`);
  }

  return (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: ToolCall[];
      };
    }>;
  };
}

export function canUseToolCallingModel() {
  if (process.env.ENABLE_AGENT_TOOL_CALLING === "false") return false;
  const apiKey = process.env.ARK_API_KEY;
  const model = process.env.ARK_ENDPOINT_ID || process.env.ARK_MODEL;
  return Boolean(apiKey && apiKey !== "replace_me" && model && model !== "replace_me");
}

export function parseToolArguments(value: string) {
  if (!value.trim()) return {};
  return JSON.parse(value) as unknown;
}

export function toolMessage(toolCall: ToolCall, observation: unknown): ChatMessage {
  return {
    role: "tool",
    tool_call_id: toolCall.id,
    name: toolCall.function.name,
    content: JSON.stringify(observation)
  };
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}
