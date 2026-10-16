<?php
add_action('init', function () {
    register_post_type('event', ['public' => true, 'has_archive' => true, 'rewrite' => ['slug' => 'events']]);
});
add_action('rest_api_init', function () {
    register_rest_route('harbour/v1', '/rsvp/(?P<id>\\d+)', ['methods' => 'POST', 'callback' => 'harbour_rsvp']);
});
