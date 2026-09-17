-- migrate:up

-- An agent reaching this app over MCP signs in as its owner through OAuth, so
-- these hold the clients that have been registered, the consent each account
-- gave one, and the tokens it trades for a session. The shape is better-auth's
-- oidc-provider schema, which the mcp plugin reuses; names stay quoted camel
-- case to match the auth tables the same library already reads.
create table "oauthApplication" (
    "id" text not null primary key,
    "name" text not null,
    "icon" text,
    "metadata" text,
    "clientId" text not null unique,
    "clientSecret" text,
    "redirectUrls" text not null,
    "type" text not null,
    "disabled" boolean not null default false,
    "userId" text references "user" ("id") on delete cascade,
    "createdAt" timestamptz not null default current_timestamp,
    "updatedAt" timestamptz not null default current_timestamp
);

create table "oauthAccessToken" (
    "id" text not null primary key,
    "accessToken" text not null unique,
    "refreshToken" text not null unique,
    "accessTokenExpiresAt" timestamptz not null,
    "refreshTokenExpiresAt" timestamptz not null,
    "clientId" text not null
        references "oauthApplication" ("clientId") on delete cascade,
    "userId" text references "user" ("id") on delete cascade,
    "scopes" text not null,
    "createdAt" timestamptz not null default current_timestamp,
    "updatedAt" timestamptz not null default current_timestamp
);

create table "oauthConsent" (
    "id" text not null primary key,
    "clientId" text not null
        references "oauthApplication" ("clientId") on delete cascade,
    "userId" text not null references "user" ("id") on delete cascade,
    "scopes" text not null,
    "consentGiven" boolean not null,
    "createdAt" timestamptz not null default current_timestamp,
    "updatedAt" timestamptz not null default current_timestamp
);

create index "oauthApplication_userId_idx" on "oauthApplication" ("userId");
create index "oauthAccessToken_clientId_idx" on "oauthAccessToken" ("clientId");
create index "oauthAccessToken_userId_idx" on "oauthAccessToken" ("userId");
create index "oauthConsent_clientId_idx" on "oauthConsent" ("clientId");
create index "oauthConsent_userId_idx" on "oauthConsent" ("userId");

-- migrate:down
drop table "oauthConsent";
drop table "oauthAccessToken";
drop table "oauthApplication";
