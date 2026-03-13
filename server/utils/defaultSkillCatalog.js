const DEFAULT_SKILL_TEMPLATES = [
  {
    id: "incident-triage",
    name: "Incident Triage",
    description: "分析故障信息并输出优先级、根因猜测和应急行动列表。",
    prompt:
      "你是 SRE 值班助手。输入告警/日志片段后，输出：1) 影响面 2) 优先级 3) 立即动作 4) 后续排查路径。",
    examples: [
      "当 CPU 持续 95% 且错误率升高时，先给出止血动作，再列出需要收集的指标。",
    ],
    tools: ["memory"],
    category: "ops",
  },
  {
    id: "prd-writer",
    name: "PRD Writer",
    description: "将需求整理为结构化 PRD，包含目标、范围、验收标准、风险。",
    prompt:
      "你是资深产品经理。根据输入需求生成 PRD，必须包含背景、目标、非目标、用户故事、指标、里程碑和验收标准。",
    examples: ["把‘聊天支持上传图片’整理成可交付 PRD。"],
    tools: [],
    category: "product",
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    description: "对改动做风险评审并给出可执行改进建议。",
    prompt:
      "你是 Staff Engineer。评审代码时优先关注可靠性、安全性、可维护性和性能，输出需包含风险等级与建议 patch。",
    examples: ["针对新增 API 给出边界条件与回归测试建议"],
    tools: ["filesystem"],
    category: "engineering",
  },
];

function clone(item) {
  return JSON.parse(JSON.stringify(item));
}

export function listDefaultSkillTemplates() {
  return DEFAULT_SKILL_TEMPLATES.map(clone);
}

export function getDefaultSkillTemplate(id) {
  const found = DEFAULT_SKILL_TEMPLATES.find((item) => item.id === id);
  return found ? clone(found) : null;
}

export function searchDefaultSkillTemplates(query, limit = 8) {
  const normalized = String(query || "").toLowerCase().trim();
  if (!normalized) {
    return listDefaultSkillTemplates().slice(0, limit);
  }

  return DEFAULT_SKILL_TEMPLATES.map((item) => {
    const haystack = [item.name, item.description, item.category, item.prompt]
      .join(" ")
      .toLowerCase();
    const score = normalized
      .split(/\s+/)
      .filter(Boolean)
      .reduce((acc, token) => (haystack.includes(token) ? acc + 1 : acc), 0);
    return { item, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => clone(entry.item));
}
