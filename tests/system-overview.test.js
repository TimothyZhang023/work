import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

describe("system overview route", () => {
  let app;
  let authToken;

  beforeAll(async () => {
    process.env.STANDALONE_MODE = "false";
    const { createApp } = await import("../server/app.js");
    app = createApp();

    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ username: `so${Date.now().toString().slice(-6)}`, password: "password123" })
      .expect(200);

    authToken = registerRes.body.token;
  });

  it("returns runtime and counts", async () => {
    const res = await request(app)
      .get("/api/system/overview")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.runtime.node).toContain("v");
    expect(typeof res.body.counts.skills).toBe("number");
    expect(Array.isArray(res.body.recommendations)).toBe(true);
  });
});
