<?php
// Web-service function: the SIS requests a one-time login URL for a student.
defined('MOODLE_INTERNAL') || die();

$functions = [
    'local_sislogin_request_login_url' => [
        'classname'    => 'local_sislogin\\external\\request_login_url',
        'methodname'   => 'execute',
        'description'  => 'Issue a one-time Moodle login URL for a student (matched by email), for the Skyline SIS.',
        'type'         => 'read',
        'capabilities' => 'local/sislogin:requestlogin',
        'ajax'         => false,
    ],
];
