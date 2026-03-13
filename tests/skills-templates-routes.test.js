import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

describe("skills templates routes", () => {
  let app;
  let authToken;

  beforeAll(async () => {
    process.env.STANDALONE_MODE = "false";
    const { createApp } = await import("../server/app.js");
    app = createApp();

    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ username: `st${Date.now().toString().slice(-6)}`, password: "password123" })
      .expect(200);

    authToken = registerRes.body.token;
  });

  it("lists and installs skill template", async () => {
    const listRes = await request(app)
      .get("/api/skills/templates?query=PRD")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(listRes.body.length).toBeGreaterThan(0);

    const installRes = await request(app)
      .post(`/api/skills/templates/${listRes.body[0].id}/install`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(installRes.body.skill.id).toBeTruthy();
  });

  it("validates and imports skills in batch", async () => {
    const validateRes = await request(app)
      .post("/api/skills/validate")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: "", prompt: "short" })
      .expect(200);

    expect(validateRes.body.valid).toBe(false);

    const importRes = await request(app)
      .post("/api/skills/import")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        skills: [
          { name: "Daily Report", prompt: "请先汇总再输出结论，最后给行动项。", tools: ["memory", "memory"] },
          { name: "", prompt: "bad" },
        ],
      })
      .expect(200);

    expect(importRes.body.results[0].status).toBe("created");
    expect(importRes.body.results[1].status).toBe("invalid");
  });
});
