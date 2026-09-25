# Robinhood Support request

**Subject: Custom hosted MCP integration — redirect URI rejected after verification**

We are integrating Synergy, a hosted trading research application, with Robinhood's official Trading MCP at `https://agent.robinhood.com/mcp/trading`.

Our exact callback is:

```text
https://beta.omensite.com/auth/robinhood/callback
```

After sign-in and verification, `https://api.robinhood.com/oauth2/authorize/` returns:

```json
{"detail":"Mismatching Redirect URI: https://beta.omensite.com/auth/robinhood/callback"}
```

The app sends this identical URI in dynamic client registration and the authorization request. Public registration checks on September 24, 2026 returned HTTP 200 and echoed each of two requested callback URIs, while returning the same client ID and the name `Robinhood Trading`. No authorization code reaches our callback. We use the authorization-code flow, scope `internal`, resource `https://agent.robinhood.com/mcp/trading`, PKCE S256, and public-client authentication (`token_endpoint_auth_method=none`).

Please confirm whether a custom hosted MCP application with this HTTPS callback is supported. If so, what is the approved registration process, and can you provide or approve a public OAuth client for Synergy and this exact callback? Our application supports a provider-issued public client ID with PKCE; it does not use a client secret.

If this integration type is not currently supported, please confirm the supported deployment model for an independently developed application.
