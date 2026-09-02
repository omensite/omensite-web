import test from "node:test";
import assert from "node:assert/strict";
import { createDiscordOAuthProvider } from "../../src/providers/discord-oauth-provider.js";

test("authorization URL requests only identity and member scopes", () => {
  const provider = createDiscordOAuthProvider({
    clientId: "client",
    clientSecret: "secret",
    redirectUri: "http://localhost/callback",
    guildId: "guild",
    fetchImpl: async () => { throw new Error("unexpected fetch"); },
  });

  const url = new URL(provider.buildAuthorizationUrl({ state: "state-value" }));

  assert.equal(url.origin + url.pathname, "https://discord.com/oauth2/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "identify guilds.members.read");
  assert.equal(url.searchParams.get("state"), "state-value");
});

test("token and profile requests keep credentials in server requests", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/oauth2/token")) {
      return Response.json({
        access_token: "access",
        token_type: "Bearer",
        expires_in: 604800,
        refresh_token: "refresh",
        scope: "identify guilds.members.read",
      });
    }
    if (String(url).endsWith("/users/@me")) {
      return Response.json({
        id: "42",
        username: "omen",
        discriminator: "0",
        global_name: "Omen",
        avatar: "avatar-hash",
        bot: false,
        system: false,
        mfa_enabled: true,
        banner: null,
        accent_color: null,
        locale: "en-US",
        verified: true,
        email: "omen@example.test",
        flags: 0,
        premium_type: 0,
        public_flags: 0,
        avatar_decoration_data: null,
        collectibles: null,
        primary_guild: null,
      });
    }
    return Response.json({
      user: { id: "42", username: "omen", discriminator: "0", avatar: "avatar-hash" },
      nick: null,
      avatar: null,
      banner: null,
      roles: ["role-os", "role-indicators"],
      joined_at: "2025-01-01T00:00:00.000000+00:00",
      premium_since: null,
      deaf: false,
      mute: false,
      flags: 0,
      pending: false,
      permissions: "0",
      communication_disabled_until: null,
      avatar_decoration_data: null,
    });
  };
  const provider = createDiscordOAuthProvider({
    clientId: "client",
    clientSecret: "secret",
    redirectUri: "http://localhost/callback",
    guildId: "guild",
    fetchImpl,
  });

  const token = await provider.exchangeCode({ code: "code" });
  const identity = await provider.getCurrentUser({ accessToken: token.accessToken });
  const member = await provider.getCurrentGuildMember({ accessToken: token.accessToken });

  assert.equal(identity.id, "42");
  assert.deepEqual(member.roles, ["role-os", "role-indicators"]);
  assert.match(calls[0].options.body.toString(), /grant_type=authorization_code/);
  assert.doesNotMatch(calls[0].url, /secret|code/);
});

test("token revocation accepts Discord's empty successful response", async () => {
  const provider = createDiscordOAuthProvider({
    clientId: "client",
    clientSecret: "secret",
    redirectUri: "http://localhost/callback",
    guildId: "guild",
    fetchImpl: async () => new Response(null, { status: 204 }),
  });

  await provider.revokeToken({ token: "access" });
});
