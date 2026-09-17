-- name: DeleteUser :exec
delete from "user"
where id = $1;

-- What a consent screen is actually about to approve. Everything shown comes
-- from the code the flow issued rather than from the address the browser
-- carries, because those are two different things and only the first is what
-- the grant will be written from: a caller naming one client in the query while
-- holding a code for another would otherwise be described by the wrong name.
--
-- The row is better-auth's pending authorization. Its identifier is the consent
-- code, stored as issued because `verification.storeIdentifier` is left at its
-- default, and its value is the request as JSON. The account it was issued for
-- comes back so the page can refuse a code that is not this browser's, and the
-- destination so the page can say where the data would go, which is the one
-- part of this a registered client cannot choose the appearance of.
--
-- A disabled client is not offered, so revoking one takes effect before anybody
-- is asked to approve it again.
-- name: OAuthConsentRequest :one
select
    a."name",
    a."icon",
    v."value"::jsonb ->> 'userId' as user_id,
    v."value"::jsonb ->> 'redirectURI' as redirect_uri,
    -- A JSON array, handed back as its text so the page can say whether this
    -- grant is read only rather than listing what every grant can do.
    v."value"::jsonb ->> 'scope' as scope
from "verification" v
join "oauthApplication" a
    on a."clientId" = v."value"::jsonb ->> 'clientId'
where v."identifier" = sqlc.arg(consent_code)
    and v."expiresAt" > now()
    and a."disabled" = false;
