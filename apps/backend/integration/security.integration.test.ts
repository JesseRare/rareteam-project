import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const suite = enabled ? describe : describe.skip;

suite("PostgreSQL security integration", () => {
  let app: Awaited<ReturnType<(typeof import("../src/server.js"))["buildApp"]>>;
  let db: (typeof import("../src/db.js"))["db"];
  let ownerAccessToken = "";
  let ownerRefreshToken = "";
  let ownerUserId = "";

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
    ownerUserId = tokens.user.id;
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

  it("publishes launcher news with a validated image", async () => {
    const created = await app.inject({
      method: "POST", url: "/control/api/announcements",
      headers: { authorization: `Bearer ${ownerAccessToken}` },
      payload: { title: "Integration news", summary: "Visible in the launcher after publication", published: false },
    });
    expect(created.statusCode).toBe(201);
    const announcementId = created.json().id;

    const draftFeed = await app.inject({ method: "GET", url: "/v1/news/" });
    expect(draftFeed.json()).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: announcementId })]));

    const boundary = "rareteam-news-test";
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const multipart = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="news.png"\r\nContent-Type: image/png\r\n\r\n`),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const image = await app.inject({
      method: "POST", url: `/control/api/announcements/${announcementId}/image`,
      headers: { authorization: `Bearer ${ownerAccessToken}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipart,
    });
    expect(image.statusCode).toBe(200);
    expect(image.json().imageUrl).toMatch(/\/artifacts\/news\/[a-f0-9]{64}\.png$/);

    const published = await app.inject({
      method: "PATCH", url: `/control/api/announcements/${announcementId}`,
      headers: { authorization: `Bearer ${ownerAccessToken}` },
      payload: { published: true },
    });
    expect(published.statusCode).toBe(204);

    const feed = await app.inject({ method: "GET", url: "/v1/news/" });
    expect(feed.statusCode).toBe(200);
    expect(feed.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: announcementId, title: "Integration news", imageUrl: image.json().imageUrl }),
    ]));
  });

  it("enforces permission grants and role hierarchy for non-owner managers", async () => {
    const registration = await app.inject({
      method: "POST", url: "/v1/auth/register",
      payload: { username: "rolemanager", email: "manager@example.test", password: "correct-horse-battery-staple" },
    });
    expect(registration.statusCode).toBe(201);
    const manager = registration.json();
    const managerRoleId = "20000000-0000-4000-8000-000000000001";
    await db.query(`insert into role_definitions(id,slug,name,color,position,permissions,scopes,created_by)
      values($1,'integration-manager','Integration manager','#123456',50,$2,'["global"]',$3)`,
    [managerRoleId, JSON.stringify(["roles.view", "roles.manage", "roles.assign"]), ownerUserId]);
    await db.query(`insert into user_role_assignments(id,user_id,role_id,granted_by,reason)
      values('20000000-0000-4000-8000-000000000002',$1,$2,$3,'integration hierarchy test')`,
    [manager.user.id, managerRoleId, ownerUserId]);

    const equalPosition = await app.inject({
      method: "POST", url: "/control/api/roles",
      headers: { authorization: `Bearer ${manager.accessToken}` },
      payload: { name: "Equal role", position: 50, permissions: [] },
    });
    expect(equalPosition.statusCode).toBe(403);
    expect(equalPosition.json().code).toBe("role_hierarchy");

    const excessivePermission = await app.inject({
      method: "POST", url: "/control/api/roles",
      headers: { authorization: `Bearer ${manager.accessToken}` },
      payload: { name: "Excessive role", position: 40, permissions: ["users.edit"] },
    });
    expect(excessivePermission.statusCode).toBe(403);

    const subordinate = await app.inject({
      method: "POST", url: "/control/api/roles",
      headers: { authorization: `Bearer ${manager.accessToken}` },
      payload: { name: "Subordinate role", position: 40, permissions: ["roles.view"] },
    });
    expect(subordinate.statusCode).toBe(201);
  });

  it("requires a server for server bans and enforces server/global scope", async () => {
    const registration = await app.inject({
      method: "POST", url: "/v1/auth/register",
      payload: { username: "bantarget", email: "ban-target@example.test", password: "correct-horse-battery-staple" },
    });
    expect(registration.statusCode).toBe(201);
    const target = registration.json();

    const missingServer = await app.inject({
      method: "POST", url: `/control/api/users/${target.user.id}/bans`,
      headers: { authorization: `Bearer ${ownerAccessToken}` },
      payload: { scope: "server", reason: "Missing server must be rejected" },
    });
    expect(missingServer.statusCode).toBe(400);

    const serverBan = await app.inject({
      method: "POST", url: `/control/api/users/${target.user.id}/bans`,
      headers: { authorization: `Bearer ${ownerAccessToken}` },
      payload: { scope: "server", serverId: "melchior-1", reason: "Integration server ban" },
    });
    expect(serverBan.statusCode).toBe(201);

    const blockedTicket = await app.inject({
      method: "POST", url: "/v1/game/ticket",
      headers: { authorization: `Bearer ${target.accessToken}` },
      payload: { serverId: "melchior-1" },
    });
    expect(blockedTicket.statusCode).toBe(403);
    expect(blockedTicket.json().code).toBe("banned");

    const otherServerTicket = await app.inject({
      method: "POST", url: "/v1/game/ticket",
      headers: { authorization: `Bearer ${target.accessToken}` },
      payload: { serverId: "survival-jim-css" },
    });
    expect(otherServerTicket.statusCode).toBe(200);

    const revoke = await app.inject({
      method: "DELETE", url: `/control/api/bans/${serverBan.json().id}`,
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    expect(revoke.statusCode).toBe(204);
    const globalBan = await app.inject({
      method: "POST", url: `/control/api/users/${target.user.id}/bans`,
      headers: { authorization: `Bearer ${ownerAccessToken}` },
      payload: { scope: "global", reason: "Integration global ban" },
    });
    expect(globalBan.statusCode).toBe(201);

    const globallyBlocked = await app.inject({
      method: "POST", url: "/v1/game/ticket",
      headers: { authorization: `Bearer ${target.accessToken}` },
      payload: { serverId: "survival-jim-css" },
    });
    expect(globallyBlocked.statusCode).toBe(403);
    expect(globallyBlocked.json().code).toBe("banned");
  });
});
