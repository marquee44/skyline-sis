<?php
// SIS login bridge — lets the Skyline SIS hand a student a one-time Moodle login URL.
defined('MOODLE_INTERNAL') || die();

$plugin->component = 'local_sislogin';
$plugin->version   = 2026060900;
$plugin->requires  = 2024100700; // Moodle 4.5+ (running 5.1).
$plugin->maturity  = MATURITY_STABLE;
$plugin->release   = '1.0.0';
