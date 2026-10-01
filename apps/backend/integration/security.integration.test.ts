import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const suite = enabled ? describe : describe.skip;

suite("PostgreSQL security integration", () => {
  let app: Awaited<ReturnType<(typeof import("../src/server.js"))["buildApp"]>>;
  let db: (typeof import("../src/db.js"))["db"];
  let ownerAccessToken = "";
  let ownerRefreshToken = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.JWT_SECRET ||= "integration-jwt-secret-at-least-32-characters";
    process.env.GAME_SERVER_KEY ||= "integration-game-key-at-least-32-characters";
    process.env.ARTIFACT_ROOT ||= "/tmp/rare-integration-artifacts";
    const server = await import("../src/server.js");
    ({ db } = await import("../src/db.js"));
    app = await server.buildApp({ migrateDatabase: true, startPublisher: false });

    const registration = await app.inject({
      method: "POST", url: "/v1/auth/register",
      payload: { username: "jetarare", email: "owner@example.test", password: "correct-horse-battery-staple" },
    });
    expect(registration.statusCode).toBe(201);
    const tokens = registration.json();
    ownerAccessToken = tokens.accessToken;
    ownerRefreshToken = tokens.refreshToken;
    await db.query(`insert into user_role_assignments(id,user_id,role_id,reason)
      values('10000000-0000-4000-8000-000000000099',$1,'00000000-0000-4000-8000-000000000001','integration owner')`, [tokens.user.id]);
  });

  afterAll(async () => {
    await app?.close();
    await db?.close();
  });

  it("consumes a refresh token exactly once under concurrency", async () => {
    const request = () => app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: ownerRefreshToken } });
    const responses = await Promise.all([request(), request()]);
    expect(responses.map((item) => item.statusCode).sort()).toEqual([200, 401]);
  });

  it("consumes a game ticket exactly once under concurrency", async () => {
    const ticketResponse = await app.inject({
      method: "POST", url: "/v1/game/ticket",
      headers: { authorization: `Bearer ${ownerAccessToken}` }, payload: { serverId: "melchior-1" },
    });
    expect(ticketResponse.statusCode).toBe(200);
    const ticket = ticketResponse.json().ticket;
    const consume = () => app.inject({
      method: "POST", url: "/v1/game/ticket/consume",
      headers: { "x-server-key": process.env.GAME_SERVER_KEY! }, payload: { ticket, serverId: "melchior-1" },
    });
    const responses = await Promise.all([consume(), consume()]);
    expect(responses.map((item) => item.statusCode).sort()).toEqual([200, 401]);
  });

  it("uses an HttpOnly SameSite admin cookie instead of browser storage", async () => {
    const login = await app.inject({
      method: "POST", url: "/control/api/login",
      payload: { login: "jetarare", password: "correct-horse-battery-staple" },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.headers["set-cookie"];
    expect(cookie).toContain("rare_control=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    const session = await app.inject({ method: "GET", url: "/control/api/session", headers: { cookie: String(cookie).split(";")[0] } });
    expect(session.statusCode).toBe(200);
    expect(session.json().user.username).toBe("jetarare");
  });
});
