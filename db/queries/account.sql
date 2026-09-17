-- name: DeleteUser :exec
delete from "user"
where id = $1;

-- The application behind a client id, for the consent screen to name what is
-- asking. A disabled client is not offered, so revoking one takes effect before
-- anybody is asked to approve it again.
-- name: OAuthClientForConsent :one
select "name", "icon"
from "oauthApplication"
where "clientId" = sqlc.arg(client_id) and "disabled" = false;
