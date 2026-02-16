#!/usr/bin/env node
/**
 * nanocode - minimal claude code alternative (TypeScript)
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import type { Message, ToolResult } from "./types.js";
import { runTool, makeSchema } from "./tools.js";
import { separator, renderMarkdown, BOLD, DIM, CYAN, GREEN, RED, BLUE, RESET } from "./utils.js";

// Load environment variables
dotenv.config();

const MODEL = process.env.MODEL ?? "claude-sonnet-4-5-20250929";

const SYSTEM_PROMPT = `You are a coding assistant with access to tools.
Working directory: ${process.cwd()}`;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  baseURL: process.env.ANTHROPIC_BASE_URL,
  fetch: ((url: any, init?: any) => {
    const headers = new Headers(init?.headers);
    headers.set("User-Agent", "Mozilla/5.0");
    return globalThis.fetch(url, { ...init, headers });
  }) as unknown as import("@anthropic-ai/sdk/core").Fetch,
});

async function callApi(messages: Message[]): Promise<Anthropic.Messages.Message> {
  return client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: messages as Anthropic.Messages.MessageParam[],
    tools: makeSchema() as Anthropic.Messages.Tool[],
  });
}

async function main(): Promise<void> {
  const provider = "anthropic";
  console.log(separator());
  console.log(
    `${BOLD}nanocode${RESET}  model=${CYAN}${MODEL}${RESET}  provider=${provider}  cwd=${process.cwd()}`,
  );
  console.log(separator());

  const rl = createInterface({ input: stdin, output: stdout });
  const messages: Message[] = [];

  while (true) {
    let userInput: string;
    try {
      userInput = await rl.question(`\n${GREEN}>${RESET} `);
    } catch {
      break; // Ctrl+D
    }
    userInput = userInput.trim();
    if (!userInput) continue;
    if (userInput === "/q" || userInput === "exit") break;
    if (userInput === "/c") {
      messages.length = 0;
      console.log(`${DIM}(history cleared)${RESET}`);
      continue;
    }

    messages.push({ role: "user", content: userInput });

    // Agentic loop
    while (true) {
      console.log(`\n${DIM}thinking...${RESET}`);
      let resp: Anthropic.Messages.Message;
      try {
        resp = await callApi(messages);
      } catch (err) {
        console.log(`${RED}API error: ${err}${RESET}`);
        break;
      }

      if (!resp.content) {
        console.log(`${RED}Unexpected response: ${JSON.stringify(resp).slice(0, 300)}${RESET}`);
        break;
      }

      messages.push({ role: "assistant", content: resp.content });

      const toolResults: ToolResult[] = [];
      for (const block of resp.content) {
        if (block.type === "text") {
          console.log(`\n${renderMarkdown(block.text)}`);
        } else if (block.type === "tool_use") {
          const { id, name, input } = block;
          const args = input as Record<string, unknown>;
          console.log(`\n${separator()}`);
          console.log(`${BLUE}tool: ${name}${RESET} ${DIM}${JSON.stringify(args)}${RESET}`);
          const result = await runTool(name, args);
          console.log(`${DIM}${result.slice(0, 500)}${RESET}`);
          console.log(separator());
          toolResults.push({
            type: "tool_result",
            tool_use_id: id,
            content: result,
          });
        }
      }

      if (toolResults.length === 0) break;
      messages.push({ role: "user", content: toolResults });
    }
  }

  rl.close();
  console.log(`\n${DIM}bye${RESET}`);
}

main().catch(console.error);
