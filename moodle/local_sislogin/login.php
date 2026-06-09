<?php
// One-time login endpoint. The browser arrives here with a key minted by the
// SIS (via the web service); we validate it, consume it, and log the user in.
require(__DIR__ . '/../../config.php');

$key = required_param('key', PARAM_ALPHANUMEXT);
$keyhash = hash('sha256', $key);

$rec = $DB->get_record('local_sislogin_keys', ['keyhash' => $keyhash]);
if (!$rec || $rec->used || $rec->expires < time()) {
    throw new moodle_exception('invalidkey', 'local_sislogin');
}

// Consume the key immediately (single use), then clean up old keys opportunistically.
$DB->set_field('local_sislogin_keys', 'used', 1, ['id' => $rec->id]);
$DB->delete_records_select('local_sislogin_keys', 'expires < ?', [time() - 3600]);

$user = $DB->get_record('user', ['id' => $rec->userid, 'deleted' => 0, 'suspended' => 0], '*', MUST_EXIST);

// Students arrive here authenticated by the SIS bridge, so they don't need to
// set a Moodle password — clear the first-login "force password change" nag.
unset_user_preference('auth_forcepasswordchange', $user);

// Establish the Moodle session for this user and land on their dashboard.
complete_user_login($user);

redirect(new moodle_url('/my/'));
