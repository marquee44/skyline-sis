<?php
defined('MOODLE_INTERNAL') || die();

$capabilities = [
    // Granted only to the SIS web-service role (skyline_ws). Lets it mint a
    // one-time login URL for a student.
    'local/sislogin:requestlogin' => [
        'captype'      => 'read',
        'contextlevel' => CONTEXT_SYSTEM,
        'archetypes'   => [],
    ],
];
