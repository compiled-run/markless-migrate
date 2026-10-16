<?php

use Illuminate\Support\Facades\Route;

Route::get('/status', fn () => ['ok' => true]);
