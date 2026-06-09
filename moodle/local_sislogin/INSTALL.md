# local_sislogin — Moodle SSO bridge for the Skyline SIS

Lets the SIS hand a student a one-time Moodle login URL so the portal can drop
them into Moodle as themselves (no second login). Built for Moodle 5.1 (public/ layout).

## Install (on the Moodle server)
1. Copy this dir to `<moodle>/public/local/sislogin`, owned by the web user (`www`).
2. `sudo -u www php <moodle>/admin/cli/upgrade.php --non-interactive`
3. Add the WS function to the SIS service + grant the capability (run once):
   - add `local_sislogin_request_login_url` to the `skyline_sync` external service
   - grant `local/sislogin:requestlogin` to the `skyline_ws` role (system context)
4. Reload php-fpm so workers pick up the new component (`systemctl reload php-fpm-82`).

## SIS side
- `MoodleService.requestLoginUrl(email)` calls the WS function.
- `GET /me/moodle-login` (student) returns `{ loginUrl }`; the portal redirects to it.

Keys are 256-bit, single-use, 2-min TTL, stored hashed in `local_sislogin_keys`.
