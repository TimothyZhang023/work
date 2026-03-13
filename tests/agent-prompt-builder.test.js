import { describe, expect, it } from "vitest";
import {
  buildGlobalPromptExtension,
  buildTaskSystemPrompt,
  parseMarkdownSections,
} from "../server/utils/agentPromptBuilder.js";

describe("agentPromptBuilder", () => {
  it("splits markdown into sections", () => {
    const sections = parseMarkdownSections("# A\n\nrule 1\n\n## B\nrule 2");
    expect(sections).toHaveLength(3);
  });

  it("builds global extension from markdown", () => {
    const extension = buildGlobalPromptExtension("# Global\n\nAlways answer in Chinese");
    expect(extension).toContain("Global Markdown System Extension");
    expect(extension).toContain("Always answer in Chinese");
  });

  it("builds full system prompt with global md and skills", () => {
    const prompt = buildTaskSystemPrompt({
      taskSystemPrompt: "You are an assistant",
      globalMarkdown: "# Guardrails\n\nNever expose secrets",
      taskSkills: [{ name: "Research", prompt: "Search then summarize", examples: ["x"] }],
    });

    expect(prompt).toContain("You are an assistant");
    expect(prompt).toContain("Never expose secrets");
    expect(prompt).toContain("Skills & Guidelines");
    expect(prompt).toContain("Research");
  });
});
