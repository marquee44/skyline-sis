<?php
namespace local_sislogin\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;

/**
 * Issue a one-time, short-lived Moodle login URL for a student (matched by email).
 * Called by the Skyline SIS with its web-service token. The returned URL logs the
 * student into Moodle as themselves when their browser opens it.
 */
class request_login_url extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'email' => new external_value(PARAM_EMAIL, 'Student email address'),
        ]);
    }

    public static function execute(string $email): array {
        global $DB, $CFG;

        $params = self::validate_parameters(self::execute_parameters(), ['email' => $email]);
        $context = \context_system::instance();
        self::validate_context($context);
        require_capability('local/sislogin:requestlogin', $context);

        // Match the Moodle user by email (case-insensitive), local accounts only.
        $user = $DB->get_record_select(
            'user',
            'LOWER(email) = LOWER(:email) AND deleted = 0 AND suspended = 0 AND mnethostid = :mnet',
            ['email' => $params['email'], 'mnet' => $CFG->mnet_localhost_id],
            '*',
            IGNORE_MULTIPLE
        );
        if (!$user) {
            throw new \moodle_exception('usernotfound', 'local_sislogin');
        }

        // Mint a single-use key (256-bit), stored as a hash, expiring in 2 minutes.
        $key = bin2hex(random_bytes(32));
        $rec = new \stdClass();
        $rec->userid = $user->id;
        $rec->keyhash = hash('sha256', $key);
        $rec->timecreated = time();
        $rec->expires = time() + 120;
        $rec->used = 0;
        $DB->insert_record('local_sislogin_keys', $rec);

        return ['loginurl' => $CFG->wwwroot . '/local/sislogin/login.php?key=' . $key];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'loginurl' => new external_value(PARAM_URL, 'One-time login URL'),
        ]);
    }
}
