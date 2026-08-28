-- name: DeleteUser :exec
delete from "user"
where id = $1;
