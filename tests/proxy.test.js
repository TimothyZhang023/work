import request from "supertest";
import { createApp } from "../server/app.js";
import { createApiKey, createUser } from "../server/models/database.js";

describe("Proxy API (/v1)", () => {
  let app;
  let validApiKey;
  let user;

  beforeAll(() => {
    app = createApp();
    user = createUser(`testuser_proxy_${Date.now()}`, "password123");
    const keyObj = createApiKey(user.uid, "Test API Key");
    validApiKey = keyObj.key;
  });

  it("rejects unauthenticated requests to /v1/models", async () => {
    const res = await request(app).get("/v1/models");
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.message).toContain("API Key");
  });

  it("allows authenticated requests to /v1/models", async () => {
    const res = await request(app)
      .get("/v1/models")
      .set("Authorization", `Bearer ${validApiKey}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.object).toBe("list");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("rejects /v1/chat/completions missing messages", async () => {
    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", `Bearer ${validApiKey}`)
      .send({
        model: "gpt-4",
      });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toContain("messages");
  });

  it("rejects /v1/chat/completions when no endpoints configured", async () => {
    // Current user has no endpoint config
    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", `Bearer ${validApiKey}`)
      .send({
        model: "gpt-4",
        messages: [{ role: "user", content: "hello" }],
      });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toContain("配置 API Endpoint");
  });
});
