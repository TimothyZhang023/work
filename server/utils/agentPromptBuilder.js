function normalizeText(value) {
  return String(value || "").trim();
}

export function parseMarkdownSections(markdown) {
  const normalized = normalizeText(markdown);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildGlobalPromptExtension(globalMarkdown) {
  const sections = parseMarkdownSections(globalMarkdown);
  if (sections.length === 0) {
    return "";
  }

  return [
    "\n\n### Global Markdown System Extension",
    ...sections.map((section, index) => `\n[Global Rule ${index + 1}]\n${section}`),
  ].join("\n");
}

export function buildTaskSystemPrompt({
  taskSystemPrompt,
  taskSkills = [],
  globalMarkdown = "",
}) {
  let systemPrompt = normalizeText(taskSystemPrompt);

  const globalExtension = buildGlobalPromptExtension(globalMarkdown);
  if (globalExtension) {
    systemPrompt += globalExtension;
  }

  if (taskSkills.length > 0) {
    systemPrompt += "\n\n### Skills & Guidelines:\n";
    taskSkills.forEach((skill) => {
      systemPrompt += `\n- **${skill.name}**: ${skill.prompt}`;
      if (skill.examples && skill.examples.length > 0) {
        systemPrompt += `\nExamples:\n${JSON.stringify(skill.examples, null, 2)}`;
      }
    });
  }

  return systemPrompt.trim();
}
